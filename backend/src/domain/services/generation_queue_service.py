import os
import re
import shutil
import uuid
from pathlib import Path
from typing import BinaryIO, Dict, List, Optional

from backend.src.domain.models.generation import (
    GeneratedMediaType,
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

    def create_jobs(self, scenes: List[StoryboardScene], provider: ProviderName) -> List[GenerationJob]:
        jobs: List[GenerationJob] = []
        for scene in scenes:
            job_id = f"job-{uuid.uuid4().hex[:12]}"
            job = GenerationJob(
                id=job_id,
                sceneId=scene.id,
                provider=provider,
                mediaType=scene.visual_type,
                prompt=scene.prompt,
                negativePrompt=scene.negative_prompt,
                status="queued",
                metadata={
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
    ) -> List[GenerationJob]:
        jobs = [self._jobs[job_id] for job_id in self._job_order if job_id in self._jobs]
        if status:
            jobs = [job for job in jobs if job.status == status]
        if provider:
            jobs = [job for job in jobs if job.provider == provider]
        return jobs

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
        media_url: str,
        media_type: Optional[GeneratedMediaType] = None,
        metadata: Optional[Dict[str, str]] = None,
    ) -> Optional[GenerationJob]:
        job = self._jobs.get(job_id)
        if not job:
            return None
        merged_metadata = dict(job.metadata)
        if metadata:
            merged_metadata.update(metadata)
        return self._replace_job(
            job_id,
            status="completed",
            media_type=media_type or job.media_type,
            result_url=media_url,
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
            local_path=str(output_path),
            error=None,
            metadata=merged_metadata,
        )

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
