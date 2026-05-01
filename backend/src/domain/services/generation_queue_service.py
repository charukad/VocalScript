import json
import os
import re
import shutil
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from mimetypes import guess_extension
from pathlib import Path
from urllib.parse import urlparse
from typing import BinaryIO, Dict, Iterable, List, Optional

from backend.src.domain.models.generation import (
    GenerationAspectRatio,
    GeneratedMediaType,
    GeneratedMediaAsset,
    GenerationMediaVariant,
    GenerationJob,
    GenerationJobStatus,
    ProviderName,
    StoryboardScene,
)
from backend.src.domain.services.sqlite_store import SQLiteStore


RUNNING_JOB_TIMEOUT_SECONDS = 900
HISTORY_CLEAR_STATUSES: tuple[GenerationJobStatus, ...] = (
    "completed",
    "failed",
    "canceled",
    "manual_action_required",
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_iso() -> str:
    return _utc_now().isoformat()


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


class GenerationQueueService:
    def __init__(
        self,
        generated_media_dir: str,
        projects_dir: Optional[str] = None,
        store: Optional[SQLiteStore] = None,
    ):
        self.generated_media_dir = Path(generated_media_dir)
        self.generated_media_dir.mkdir(parents=True, exist_ok=True)
        self.projects_dir = Path(projects_dir) if projects_dir else None
        if self.projects_dir:
            self.projects_dir.mkdir(parents=True, exist_ok=True)
        self.state_file = (self.projects_dir or self.generated_media_dir) / "generation_state.json"
        self.store = store
        self._jobs: Dict[str, GenerationJob] = {}
        self._job_order: List[str] = []
        self._paused_batches: set[str] = set()
        self._load_state()

    def create_jobs(
        self,
        scenes: List[StoryboardScene],
        provider: ProviderName,
        aspect_ratio: GenerationAspectRatio = "16:9",
        batch_id: Optional[str] = None,
        project_id: Optional[str] = None,
        project_name: Optional[str] = None,
    ) -> List[GenerationJob]:
        resolved_batch_id = batch_id or f"batch-{uuid.uuid4().hex[:12]}"
        jobs: List[GenerationJob] = []
        for scene in scenes:
            job_id = f"job-{uuid.uuid4().hex[:12]}"
            job = GenerationJob(
                id=job_id,
                batchId=resolved_batch_id,
                projectId=project_id,
                sceneId=scene.id,
                provider=provider,
                mediaType=scene.visual_type,
                prompt=scene.prompt,
                negativePrompt=scene.negative_prompt,
                status="queued",
                metadata={
                    "batchId": resolved_batch_id,
                    **({"projectId": project_id} if project_id else {}),
                    "aspectRatio": aspect_ratio,
                    **({"projectName": project_name} if project_name else {}),
                    "sceneStart": str(scene.start),
                    "sceneEnd": str(scene.end),
                    "sceneStyle": scene.style,
                    "sceneCamera": scene.camera,
                    "sceneTranscript": scene.transcript,
                },
            )
            self._jobs[job_id] = job
            self._job_order.append(job_id)
            jobs.append(job)
        self._save_state()
        return jobs

    def list_jobs(
        self,
        status: Optional[GenerationJobStatus] = None,
        provider: Optional[ProviderName] = None,
        batch_id: Optional[str] = None,
        project_id: Optional[str] = None,
        worker_id: Optional[str] = None,
        flow: Optional[str] = None,
        media_type: Optional[GeneratedMediaType] = None,
    ) -> List[GenerationJob]:
        self._refresh_from_store()
        jobs = [self._jobs[job_id] for job_id in self._job_order if job_id in self._jobs]
        if status:
            jobs = [job for job in jobs if job.status == status]
        if provider:
            jobs = [job for job in jobs if job.provider == provider]
        if batch_id:
            jobs = [job for job in jobs if job.batch_id == batch_id]
        if project_id:
            jobs = [job for job in jobs if job.project_id == project_id]
        if worker_id:
            jobs = [job for job in jobs if job.metadata.get("workerId") == worker_id]
        if flow:
            jobs = [job for job in jobs if job.metadata.get("flow", "auto_generate") == flow]
        if media_type:
            jobs = [job for job in jobs if job.media_type == media_type]
        return jobs

    def clear_job_history(
        self,
        provider: Optional[ProviderName] = None,
        project_id: Optional[str] = None,
        worker_id: Optional[str] = None,
        flow: Optional[str] = None,
        media_type: Optional[GeneratedMediaType] = None,
        statuses: Optional[Iterable[GenerationJobStatus]] = None,
        include_active: bool = False,
    ) -> int:
        self._refresh_from_store()
        clearable_statuses = set(statuses or HISTORY_CLEAR_STATUSES)
        if include_active:
            clearable_statuses.update(("queued", "running"))
        if not clearable_statuses:
            return 0

        remove_ids = {
            job_id
            for job_id in self._job_order
            if (job := self._jobs.get(job_id))
            and job.status in clearable_statuses
            and (not provider or job.provider == provider)
            and (not project_id or job.project_id == project_id)
            and (not worker_id or job.metadata.get("workerId") == worker_id)
            and (not flow or job.metadata.get("flow", "auto_generate") == flow)
            and (not media_type or job.media_type == media_type)
        }
        if not remove_ids:
            return 0

        if self.store:
            self.store.clear_generation_jobs(
                project_id=project_id,
                provider=provider,
                worker_id=worker_id,
                flow=flow,
                media_type=media_type,
                statuses=clearable_statuses,
            )

        for job_id in remove_ids:
            self._jobs.pop(job_id, None)
        self._job_order = [job_id for job_id in self._job_order if job_id not in remove_ids]
        self._save_state()
        return len(remove_ids)

    def list_generated_media_assets(
        self,
        include_placeholders: bool = True,
        batch_id: Optional[str] = None,
        project_id: Optional[str] = None,
    ) -> List[GeneratedMediaAsset]:
        assets: List[GeneratedMediaAsset] = []
        for job in self.list_jobs(batch_id=batch_id, project_id=project_id):
            if job.status == "completed" and not job.result_url:
                continue
            if job.status != "completed" and not (
                include_placeholders and job.status in ("failed", "manual_action_required")
            ):
                continue

            scene_start = self._metadata_float(job.metadata.get("sceneStart"), 0.0)
            scene_end = self._metadata_float(job.metadata.get("sceneEnd"), scene_start + 5.0)
            if scene_end <= scene_start:
                scene_end = scene_start + 5.0

            assets.append(
                GeneratedMediaAsset(
                    jobId=job.id,
                    batchId=job.batch_id,
                    projectId=job.project_id,
                    sceneId=job.scene_id,
                    provider=job.provider,
                    mediaType=job.media_type,
                    status=job.status,
                    resultUrl=job.result_url,
                    resultVariants=job.result_variants,
                    localPath=job.local_path,
                    prompt=job.prompt,
                    negativePrompt=job.negative_prompt,
                    start=scene_start,
                    end=scene_end,
                    duration=scene_end - scene_start,
                    transcript=job.metadata.get("sceneTranscript", ""),
                    error=job.error,
                    metadata=job.metadata,
                )
            )
        return assets

    def get_job(self, job_id: str) -> Optional[GenerationJob]:
        self._refresh_from_store()
        return self._jobs.get(job_id)

    def claim_next_job(
        self,
        provider: Optional[ProviderName] = None,
        worker_id: Optional[str] = None,
        project_id: Optional[str] = None,
    ) -> Optional[GenerationJob]:
        if self.store:
            claimed = self.store.claim_next_generation_job(
                provider=provider,
                worker_id=worker_id,
                project_id=project_id,
            )
            if claimed:
                self._jobs[claimed.id] = claimed
                if claimed.id not in self._job_order:
                    self._job_order.append(claimed.id)
            return claimed

        self._recover_stale_running_jobs(provider=provider, project_id=project_id)
        for job_id in self._job_order:
            job = self._jobs[job_id]
            if job.status != "queued":
                continue
            if provider and job.provider != provider:
                continue
            if project_id and job.project_id != project_id:
                continue
            if self.is_batch_paused(job.batch_id, job.project_id):
                continue
            metadata = dict(job.metadata)
            run_attempt = self._metadata_int(metadata.get("runAttempt"), 0) + 1
            claimed_at = _utc_now()
            if worker_id:
                metadata["workerId"] = worker_id
            metadata["runAttempt"] = str(run_attempt)
            metadata["claimedAt"] = claimed_at.isoformat()
            metadata["claimExpiresAt"] = (claimed_at + timedelta(seconds=RUNNING_JOB_TIMEOUT_SECONDS)).isoformat()
            return self._replace_job(job_id, status="running", metadata=metadata)
        return None

    def pause_batch(self, batch_id: str, project_id: Optional[str] = None) -> List[GenerationJob]:
        self._paused_batches.add(self._batch_key(batch_id, project_id))
        if self.store:
            self.store.set_batch_paused(batch_id, True, project_id)
        jobs = self.list_jobs(batch_id=batch_id, project_id=project_id)
        for job in jobs:
            if job.status in ("queued", "running"):
                metadata = dict(job.metadata)
                metadata["batchPaused"] = "true"
                self._jobs[job.id] = job.model_copy(update={"metadata": metadata})
        self._save_state()
        return self.list_jobs(batch_id=batch_id, project_id=project_id)

    def resume_batch(self, batch_id: str, project_id: Optional[str] = None) -> List[GenerationJob]:
        self._paused_batches.discard(self._batch_key(batch_id, project_id))
        if self.store:
            self.store.set_batch_paused(batch_id, False, project_id)
        jobs = self.list_jobs(batch_id=batch_id, project_id=project_id)
        for job in jobs:
            metadata = dict(job.metadata)
            metadata.pop("batchPaused", None)
            self._jobs[job.id] = job.model_copy(update={"metadata": metadata})
        self._save_state()
        return self.list_jobs(batch_id=batch_id, project_id=project_id)

    def is_batch_paused(self, batch_id: Optional[str], project_id: Optional[str] = None) -> bool:
        if not batch_id:
            return False
        return self._batch_key(batch_id, project_id) in self._paused_batches

    def cancel_job(self, job_id: str) -> Optional[GenerationJob]:
        job = self._jobs.get(job_id)
        if not job:
            return None
        if job.status == "completed":
            return job
        return self._replace_job(job_id, status="canceled")

    def retry_job(
        self,
        job_id: str,
        prompt_override: Optional[str] = None,
        retry_mode: str = "manual",
    ) -> Optional[GenerationJob]:
        job = self._jobs.get(job_id)
        if not job:
            return None
        if job.status not in ("failed", "canceled", "manual_action_required"):
            return job
        metadata = self._retry_metadata(job.metadata)
        metadata["retryMode"] = retry_mode
        if prompt_override and prompt_override.strip():
            metadata["originalPrompt"] = job.prompt
            metadata["promptRewrittenAt"] = _utc_now_iso()
        return self._replace_job(
            job_id,
            prompt=prompt_override.strip() if prompt_override and prompt_override.strip() else job.prompt,
            status="queued",
            error=None,
            result_url=None,
            result_variants=[],
            local_path=None,
            metadata=metadata,
        )

    def update_status(
        self,
        job_id: str,
        status: GenerationJobStatus,
        error: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
    ) -> Optional[GenerationJob]:
        job = self._jobs.get(job_id)
        if not job:
            return None
        merged_metadata = dict(job.metadata)
        if metadata:
            merged_metadata.update(metadata)
        return self._replace_job(job_id, status=status, error=error, metadata=merged_metadata)

    def complete_job_with_url(
        self,
        job_id: str,
        media_url: Optional[str],
        media_type: Optional[GeneratedMediaType] = None,
        media_variants: Optional[List[GenerationMediaVariant]] = None,
        metadata: Optional[Dict[str, str]] = None,
    ) -> Optional[GenerationJob]:
        job = self._jobs.get(job_id)
        if not job:
            return None
        if job.status == "completed" and job.result_url:
            return job
        variants = self._normalize_variants(media_url, media_type or job.media_type, media_variants)
        resolved_media_url = media_url or (variants[0].url if variants else None)
        if not resolved_media_url:
            return None
        merged_metadata = dict(job.metadata)
        if metadata:
            merged_metadata.update(metadata)
        stored_variants, storage_errors = self._store_remote_variants_for_job(
            job,
            variants,
            media_type or job.media_type,
        )
        if stored_variants:
            variants = stored_variants
            resolved_media_url = variants[0].url
            merged_metadata["storedVariantCount"] = str(
                len([variant for variant in variants if variant.local_path])
            )
        if storage_errors:
            merged_metadata["storageErrors"] = " | ".join(storage_errors)[:1000]
        return self._replace_job(
            job_id,
            status="completed",
            media_type=media_type or job.media_type,
            result_url=resolved_media_url,
            result_variants=variants,
            local_path=variants[0].local_path if variants else None,
            error=None,
            metadata=merged_metadata,
        )

    def complete_job_with_file(
        self,
        job_id: str,
        source_filename: str,
        source_stream: BinaryIO,
        media_type: Optional[GeneratedMediaType] = None,
        metadata: Optional[Dict[str, str]] = None,
    ) -> Optional[GenerationJob]:
        job = self._jobs.get(job_id)
        if not job:
            return None

        safe_name = self._safe_filename(source_filename or f"{job_id}.{self._default_extension(media_type or job.media_type)}")
        extension = Path(safe_name).suffix or f".{self._default_extension(media_type or job.media_type)}"
        output_name = f"{job_id}_{uuid.uuid4().hex[:8]}{extension}"
        output_dir = self._job_generated_media_dir(job)
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / output_name
        with output_path.open("wb") as output:
            shutil.copyfileobj(source_stream, output)

        merged_metadata = dict(job.metadata)
        if metadata:
            merged_metadata.update(metadata)
        media_url = self._job_media_url(job, output_name)
        return self._replace_job(
            job_id,
            status="completed",
            media_type=media_type or job.media_type,
            result_url=media_url,
            result_variants=[
                GenerationMediaVariant(
                    id="stored-1",
                    url=media_url,
                    mediaType=media_type or job.media_type,
                    localPath=str(output_path),
                    source="backend",
                )
            ],
            local_path=str(output_path),
            error=None,
            metadata=merged_metadata,
        )

    def complete_job_with_files(
        self,
        job_id: str,
        files: List[tuple[str, BinaryIO]],
        media_type: Optional[GeneratedMediaType] = None,
        metadata: Optional[Dict[str, str]] = None,
    ) -> Optional[GenerationJob]:
        job = self._jobs.get(job_id)
        if not job:
            return None

        resolved_media_type = media_type or job.media_type
        output_dir = self._job_generated_media_dir(job)
        output_dir.mkdir(parents=True, exist_ok=True)
        variants: List[GenerationMediaVariant] = []

        for index, (source_filename, source_stream) in enumerate(files, 1):
            safe_name = self._safe_filename(
                source_filename or f"{job_id}_v{index}.{self._default_extension(resolved_media_type)}"
            )
            extension = Path(safe_name).suffix or f".{self._default_extension(resolved_media_type)}"
            output_name = f"{job_id}_v{index}_{uuid.uuid4().hex[:8]}{extension}"
            output_path = output_dir / output_name
            with output_path.open("wb") as output:
                shutil.copyfileobj(source_stream, output)
            media_url = self._job_media_url(job, output_name)
            variants.append(
                GenerationMediaVariant(
                    id=f"stored-{index}",
                    url=media_url,
                    mediaType=resolved_media_type,
                    localPath=str(output_path),
                    source="backend",
                )
            )

        if not variants:
            return None

        merged_metadata = dict(job.metadata)
        if metadata:
            merged_metadata.update(metadata)
        merged_metadata["storedVariantCount"] = str(len(variants))
        return self._replace_job(
            job_id,
            status="completed",
            media_type=resolved_media_type,
            result_url=variants[0].url,
            result_variants=variants,
            local_path=variants[0].local_path,
            error=None,
            metadata=merged_metadata,
        )

    def store_remote_result(
        self,
        job_id: str,
        media_url: str,
        media_type: Optional[GeneratedMediaType] = None,
        metadata: Optional[Dict[str, str]] = None,
    ) -> Optional[GenerationJob]:
        job = self._jobs.get(job_id)
        if not job:
            return None
        if not media_url.startswith(("http://", "https://")):
            raise ValueError("Only http and https media URLs can be downloaded by the backend")

        request = urllib.request.Request(
            media_url,
            headers={"User-Agent": "NeuralScribe/1.0"},
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                content_type = response.headers.get("Content-Type", "").split(";")[0].strip().lower()
                inferred_type = media_type or self._media_type_from_content_type(content_type) or job.media_type
                filename = self._remote_filename(media_url, content_type, inferred_type)
                merged_metadata = {
                    "remoteSourceUrl": media_url,
                    "remoteContentType": content_type,
                    **(metadata or {}),
                }
                return self.complete_job_with_file(
                    job_id,
                    source_filename=filename,
                    source_stream=response,
                    media_type=inferred_type,
                    metadata=merged_metadata,
                )
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Could not download remote media: {exc}") from exc

    def select_job_variant(self, job_id: str, variant_url: str) -> Optional[GenerationJob]:
        self._refresh_from_store()
        job = self._jobs.get(job_id)
        if not job:
            return None
        selected = next((variant for variant in job.result_variants if variant.url == variant_url), None)
        if not selected and job.result_url == variant_url:
            selected = GenerationMediaVariant(
                id="selected",
                url=variant_url,
                mediaType=job.media_type,
                localPath=job.local_path,
                source="backend" if job.local_path else "provider",
            )
        if not selected:
            return None
        metadata = dict(job.metadata)
        metadata["selectedVariantUrl"] = variant_url
        metadata["selectedVariantAt"] = _utc_now_iso()
        return self._replace_job(
            job_id,
            status="completed",
            media_type=selected.media_type or job.media_type,
            result_url=selected.url,
            local_path=selected.local_path or job.local_path,
            error=None,
            metadata=metadata,
        )

    def _store_remote_variants_for_job(
        self,
        job: GenerationJob,
        variants: List[GenerationMediaVariant],
        fallback_media_type: GeneratedMediaType,
    ) -> tuple[List[GenerationMediaVariant], List[str]]:
        if not variants:
            return [], []

        stored_variants: List[GenerationMediaVariant] = []
        errors: List[str] = []
        for index, variant in enumerate(variants, 1):
            if not variant.url.startswith(("http://", "https://")):
                stored_variants.append(variant)
                errors.append(f"{variant.id or index}: unsupported URL scheme")
                continue
            try:
                stored_variants.append(
                    self._download_remote_variant(job, variant, index, fallback_media_type)
                )
            except (OSError, urllib.error.URLError, ValueError) as exc:
                stored_variants.append(variant)
                errors.append(f"{variant.id or index}: {exc}")
        return stored_variants, errors

    def _download_remote_variant(
        self,
        job: GenerationJob,
        variant: GenerationMediaVariant,
        index: int,
        fallback_media_type: GeneratedMediaType,
    ) -> GenerationMediaVariant:
        request = urllib.request.Request(
            variant.url,
            headers={"User-Agent": "NeuralScribe/1.0"},
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            content_type = response.headers.get("Content-Type", "").split(";")[0].strip().lower()
            inferred_type = self._media_type_from_content_type(content_type) or variant.media_type or fallback_media_type
            filename = self._remote_filename(variant.url, content_type, inferred_type)
            safe_name = self._safe_filename(filename)
            extension = Path(safe_name).suffix or f".{self._default_extension(inferred_type)}"
            output_name = f"{job.id}_v{index}_{uuid.uuid4().hex[:8]}{extension}"
            output_dir = self._job_generated_media_dir(job)
            output_dir.mkdir(parents=True, exist_ok=True)
            output_path = output_dir / output_name
            with output_path.open("wb") as output:
                shutil.copyfileobj(response, output)

        return variant.model_copy(
            update={
                "id": variant.id or f"variant-{index}",
                "url": self._job_media_url(job, output_name),
                "media_type": inferred_type,
                "local_path": str(output_path),
                "source": "backend",
            }
        )

    def resolve_media_path(self, filename: str, project_id: Optional[str] = None) -> Optional[Path]:
        safe_name = self._safe_filename(filename)
        root = self._project_generated_media_dir(project_id) if project_id else self.generated_media_dir
        media_path = (root / safe_name).resolve()
        root = root.resolve()
        try:
            media_path.relative_to(root)
        except ValueError:
            return None
        if not media_path.exists() or not media_path.is_file():
            return None
        return media_path

    def project_generated_media_dir(self, project_id: str) -> Path:
        return self._project_generated_media_dir(project_id)

    def _replace_job(self, job_id: str, **updates) -> GenerationJob:
        job = self._jobs[job_id].model_copy(update=updates)
        self._jobs[job_id] = job
        self._save_state()
        return job

    def _refresh_from_store(self) -> None:
        if not self.store:
            return
        stored_jobs, stored_order, paused_batches = self.store.load_generation_state()
        if not stored_jobs:
            return
        self._jobs = {job.id: job for job in stored_jobs}
        self._job_order = [job_id for job_id in stored_order if job_id in self._jobs]
        missing_ids = [job.id for job in stored_jobs if job.id not in self._job_order]
        self._job_order.extend(missing_ids)
        self._paused_batches = set(paused_batches)

    def _load_state(self) -> None:
        changed = False
        loaded_from_store = False
        if self.store:
            stored_jobs, stored_order, paused_batches = self.store.load_generation_state()
            if stored_jobs:
                self._jobs = {job.id: job for job in stored_jobs}
                self._job_order = [job_id for job_id in stored_order if job_id in self._jobs]
                missing_ids = [job.id for job in stored_jobs if job.id not in self._job_order]
                self._job_order.extend(missing_ids)
                self._paused_batches = set(paused_batches)
                loaded_from_store = True

        if loaded_from_store:
            raw = {}
        elif not self.state_file.exists():
            raw = {}
        else:
            try:
                raw = json.loads(self.state_file.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                raw = {}

        if raw:
            jobs: Dict[str, GenerationJob] = dict(self._jobs)
            for item in raw.get("jobs", []):
                try:
                    job = GenerationJob(**item)
                except ValueError:
                    continue
                if job.id in jobs:
                    continue
                job, _ = self._recover_job_after_restart(job)
                changed = True
                jobs[job.id] = job

            ordered_ids = [job_id for job_id in raw.get("jobOrder", []) if job_id in jobs]
            ordered_ids = [job_id for job_id in self._job_order if job_id in jobs] + [
                job_id for job_id in ordered_ids if job_id not in self._job_order
            ]
            missing_ids = [job_id for job_id in jobs if job_id not in ordered_ids]
            self._jobs = jobs
            self._job_order = ordered_ids + missing_ids
            raw_paused_batches = {str(key) for key in raw.get("pausedBatches", [])}
            if raw_paused_batches - self._paused_batches:
                changed = True
            self._paused_batches.update(raw_paused_batches)

        if not loaded_from_store:
            changed = self._merge_project_saved_jobs() or changed
        if changed:
            self._save_state()

    def _save_state(self) -> None:
        state_file = self.state_file.with_name("generation_state.backup.json") if self.store else self.state_file
        state_file.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "version": 1,
            "updatedAt": _utc_now_iso(),
            "jobOrder": self._job_order,
            "pausedBatches": sorted(self._paused_batches),
            "jobs": [
                self._jobs[job_id].model_dump(by_alias=True)
                for job_id in self._job_order
                if job_id in self._jobs
            ],
        }
        tmp_file = state_file.with_suffix(".tmp")
        tmp_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        tmp_file.replace(state_file)
        if self.store:
            self.store.save_generation_state(
                [
                    self._jobs[job_id]
                    for job_id in self._job_order
                    if job_id in self._jobs
                ],
                self._paused_batches,
            )

    def _batch_key(self, batch_id: str, project_id: Optional[str] = None) -> str:
        return f"{project_id or 'legacy'}:{batch_id}"

    def _retry_metadata(self, metadata: Dict[str, str]) -> Dict[str, str]:
        next_metadata = dict(metadata)
        for key in (
            "remoteSourceUrl",
            "remoteContentType",
            "storageErrors",
            "storedVariantCount",
            "variantCount",
            "claimedAt",
            "claimExpiresAt",
            "workerId",
            "batchPaused",
            "providerPageUrl",
            "selectedVariantUrl",
            "selectedVariantAt",
            "autoRetryBlocked",
            "autoRetryMaxAttempts",
        ):
            next_metadata.pop(key, None)
        next_metadata["retriedAt"] = _utc_now_iso()
        return next_metadata

    def _recover_stale_running_jobs(
        self,
        provider: Optional[ProviderName] = None,
        project_id: Optional[str] = None,
    ) -> None:
        now = _utc_now()
        changed = False
        for job_id in list(self._job_order):
            job = self._jobs.get(job_id)
            if not job or job.status != "running":
                continue
            if provider and job.provider != provider:
                continue
            if project_id and job.project_id != project_id:
                continue

            expires_at = _parse_iso(job.metadata.get("claimExpiresAt"))
            claimed_at = _parse_iso(job.metadata.get("claimedAt"))
            is_expired = expires_at and expires_at <= now
            is_legacy_stale = not expires_at and claimed_at and claimed_at + timedelta(seconds=RUNNING_JOB_TIMEOUT_SECONDS) <= now
            if not is_expired and not is_legacy_stale:
                continue

            metadata = dict(job.metadata)
            metadata["requeuedAfterTimeout"] = now.isoformat()
            metadata.pop("workerId", None)
            metadata.pop("claimedAt", None)
            metadata.pop("claimExpiresAt", None)
            self._jobs[job_id] = job.model_copy(
                update={
                    "status": "queued",
                    "error": "Previous browser worker stopped before finishing; job was re-queued.",
                    "metadata": metadata,
                }
            )
            changed = True

        if changed:
            self._save_state()

    def _merge_project_saved_jobs(self) -> bool:
        changed = False
        for project_file in self._known_project_files():
            try:
                raw = json.loads(project_file.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            saved_state = raw.get("state") if isinstance(raw, dict) else None
            saved_jobs = saved_state.get("generationJobs", []) if isinstance(saved_state, dict) else []
            for item in saved_jobs:
                try:
                    job = GenerationJob(**item)
                except ValueError:
                    continue
                if job.id in self._jobs:
                    continue
                job, _ = self._recover_job_after_restart(job)
                self._jobs[job.id] = job
                self._job_order.append(job.id)
                changed = True
        return changed

    def _recover_job_after_restart(self, job: GenerationJob) -> tuple[GenerationJob, bool]:
        if job.status != "running":
            return job, False
        metadata = dict(job.metadata)
        metadata["recoveredAfterBackendRestart"] = _utc_now_iso()
        return job.model_copy(
            update={
                "status": "queued",
                "error": "Recovered after backend restart before the provider completed.",
                "metadata": metadata,
            }
        ), True

    def _safe_filename(self, filename: str) -> str:
        base_name = os.path.basename(filename)
        return re.sub(r"[^A-Za-z0-9._-]", "_", base_name) or f"media-{uuid.uuid4().hex[:8]}"

    def _safe_project_id(self, project_id: str) -> str:
        return re.sub(r"[^A-Za-z0-9._-]", "_", project_id) or f"project-{uuid.uuid4().hex[:12]}"

    def _project_generated_media_dir(self, project_id: Optional[str]) -> Path:
        if project_id and self.projects_dir:
            project_generated_dir = self._registered_project_generated_dir(project_id)
            if project_generated_dir:
                return project_generated_dir
            return self.projects_dir / self._safe_project_id(project_id) / "generated"
        return self.generated_media_dir

    def _job_generated_media_dir(self, job: GenerationJob) -> Path:
        return self._project_generated_media_dir(job.project_id)

    def _job_media_url(self, job: GenerationJob, filename: str) -> str:
        if job.project_id:
            return f"/api/generation/projects/{self._safe_project_id(job.project_id)}/media/{filename}"
        return f"/api/generation/media/{filename}"

    def _registered_project_generated_dir(self, project_id: str) -> Optional[Path]:
        for project_file in self._known_project_files():
            try:
                raw = json.loads(project_file.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if raw.get("id") != project_id:
                continue
            generated_path = raw.get("generatedMediaPath")
            if generated_path:
                return Path(generated_path)
            return project_file.parent / "generated"
        return None

    def _known_project_files(self) -> List[Path]:
        if not self.projects_dir:
            return []
        files = list(self.projects_dir.glob("*/project.json"))
        registry_file = self.projects_dir / "registry.json"
        try:
            raw = json.loads(registry_file.read_text(encoding="utf-8"))
            project_files = raw.get("projectFiles") if isinstance(raw, dict) else []
        except (OSError, json.JSONDecodeError):
            project_files = []
        if isinstance(project_files, list):
            files.extend(Path(str(path)).expanduser() for path in project_files)
        return files

    def _default_extension(self, media_type: GeneratedMediaType) -> str:
        return "mp4" if media_type == "video" else "png"

    def _normalize_variants(
        self,
        media_url: Optional[str],
        media_type: GeneratedMediaType,
        media_variants: Optional[List[GenerationMediaVariant]],
    ) -> List[GenerationMediaVariant]:
        variants = list(media_variants or [])
        if media_url and not any(variant.url == media_url for variant in variants):
            variants.insert(
                0,
                GenerationMediaVariant(
                    id="variant-1",
                    url=media_url,
                    mediaType=media_type,
                    source="provider",
                ),
            )
        normalized: List[GenerationMediaVariant] = []
        seen_urls: set[str] = set()
        for index, variant in enumerate(variants, 1):
            if not variant.url or variant.url in seen_urls:
                continue
            seen_urls.add(variant.url)
            normalized.append(
                variant.model_copy(
                    update={
                        "id": variant.id or f"variant-{index}",
                        "media_type": variant.media_type or media_type,
                    }
                )
            )
        return normalized

    def _metadata_float(self, value: Optional[str], fallback: float) -> float:
        if value is None:
            return fallback
        try:
            return float(value)
        except (TypeError, ValueError):
            return fallback

    def _metadata_int(self, value: Optional[str], fallback: int) -> int:
        if value is None:
            return fallback
        try:
            return int(value)
        except (TypeError, ValueError):
            return fallback

    def _media_type_from_content_type(self, content_type: str) -> Optional[GeneratedMediaType]:
        if content_type.startswith("video/"):
            return "video"
        if content_type.startswith("image/"):
            return "image"
        return None

    def _remote_filename(
        self,
        media_url: str,
        content_type: str,
        media_type: GeneratedMediaType,
    ) -> str:
        path_name = os.path.basename(urlparse(media_url).path)
        extension = Path(path_name).suffix
        if not extension and content_type:
            extension = guess_extension(content_type) or ""
        if not extension:
            extension = f".{self._default_extension(media_type)}"
        base_name = Path(path_name).stem or "generated-media"
        return f"{base_name}{extension}"
