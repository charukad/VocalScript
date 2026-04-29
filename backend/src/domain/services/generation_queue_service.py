import os
import re
import shutil
import urllib.error
import urllib.request
import uuid
from mimetypes import guess_extension
from pathlib import Path
from urllib.parse import urlparse
from typing import BinaryIO, Dict, List, Optional

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


class GenerationQueueService:
    def __init__(self, generated_media_dir: str):
        self.generated_media_dir = Path(generated_media_dir)
        self.generated_media_dir.mkdir(parents=True, exist_ok=True)
        self._jobs: Dict[str, GenerationJob] = {}
        self._job_order: List[str] = []

    def create_jobs(
        self,
        scenes: List[StoryboardScene],
        provider: ProviderName,
        aspect_ratio: GenerationAspectRatio = "16:9",
        batch_id: Optional[str] = None,
    ) -> List[GenerationJob]:
        resolved_batch_id = batch_id or f"batch-{uuid.uuid4().hex[:12]}"
        jobs: List[GenerationJob] = []
        for scene in scenes:
            job_id = f"job-{uuid.uuid4().hex[:12]}"
            job = GenerationJob(
                id=job_id,
                batchId=resolved_batch_id,
                sceneId=scene.id,
                provider=provider,
                mediaType=scene.visual_type,
                prompt=scene.prompt,
                negativePrompt=scene.negative_prompt,
                status="queued",
                metadata={
                    "batchId": resolved_batch_id,
                    "aspectRatio": aspect_ratio,
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
        return jobs

    def list_jobs(
        self,
        status: Optional[GenerationJobStatus] = None,
        provider: Optional[ProviderName] = None,
        batch_id: Optional[str] = None,
    ) -> List[GenerationJob]:
        jobs = [self._jobs[job_id] for job_id in self._job_order if job_id in self._jobs]
        if status:
            jobs = [job for job in jobs if job.status == status]
        if provider:
            jobs = [job for job in jobs if job.provider == provider]
        if batch_id:
            jobs = [job for job in jobs if job.batch_id == batch_id]
        return jobs

    def list_generated_media_assets(
        self,
        include_placeholders: bool = True,
        batch_id: Optional[str] = None,
    ) -> List[GeneratedMediaAsset]:
        assets: List[GeneratedMediaAsset] = []
        for job in self.list_jobs(batch_id=batch_id):
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
        return self._jobs.get(job_id)

    def claim_next_job(self, provider: Optional[ProviderName] = None, worker_id: Optional[str] = None) -> Optional[GenerationJob]:
        for job_id in self._job_order:
            job = self._jobs[job_id]
            if job.status != "queued":
                continue
            if provider and job.provider != provider:
                continue
            metadata = dict(job.metadata)
            if worker_id:
                metadata["workerId"] = worker_id
            return self._replace_job(job_id, status="running", metadata=metadata)
        return None

    def cancel_job(self, job_id: str) -> Optional[GenerationJob]:
        job = self._jobs.get(job_id)
        if not job:
            return None
        if job.status == "completed":
            return job
        return self._replace_job(job_id, status="canceled")

    def retry_job(self, job_id: str) -> Optional[GenerationJob]:
        job = self._jobs.get(job_id)
        if not job:
            return None
        if job.status not in ("failed", "canceled", "manual_action_required"):
            return job
        return self._replace_job(
            job_id,
            status="queued",
            error=None,
            result_url=None,
            local_path=None,
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
        variants = self._normalize_variants(media_url, media_type or job.media_type, media_variants)
        resolved_media_url = media_url or (variants[0].url if variants else None)
        if not resolved_media_url:
            return None
        merged_metadata = dict(job.metadata)
        if metadata:
            merged_metadata.update(metadata)
        return self._replace_job(
            job_id,
            status="completed",
            media_type=media_type or job.media_type,
            result_url=resolved_media_url,
            result_variants=variants,
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
        output_path = self.generated_media_dir / output_name
        with output_path.open("wb") as output:
            shutil.copyfileobj(source_stream, output)

        merged_metadata = dict(job.metadata)
        if metadata:
            merged_metadata.update(metadata)
        return self._replace_job(
            job_id,
            status="completed",
            media_type=media_type or job.media_type,
            result_url=f"/api/generation/media/{output_name}",
            result_variants=[
                GenerationMediaVariant(
                    id="stored-1",
                    url=f"/api/generation/media/{output_name}",
                    mediaType=media_type or job.media_type,
                    localPath=str(output_path),
                    source="backend",
                )
            ],
            local_path=str(output_path),
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

    def resolve_media_path(self, filename: str) -> Optional[Path]:
        safe_name = self._safe_filename(filename)
        media_path = (self.generated_media_dir / safe_name).resolve()
        root = self.generated_media_dir.resolve()
        try:
            media_path.relative_to(root)
        except ValueError:
            return None
        if not media_path.exists() or not media_path.is_file():
            return None
        return media_path

    def _replace_job(self, job_id: str, **updates) -> GenerationJob:
        job = self._jobs[job_id].model_copy(update=updates)
        self._jobs[job_id] = job
        return job

    def _safe_filename(self, filename: str) -> str:
        base_name = os.path.basename(filename)
        return re.sub(r"[^A-Za-z0-9._-]", "_", base_name) or f"media-{uuid.uuid4().hex[:8]}"

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
