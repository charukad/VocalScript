import os
import json
import shutil
import tempfile
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from backend.src.domain.interfaces.transcriber import ITranscriber
from backend.src.domain.models.generation import (
    GeneratedMediaType,
    GeneratedMediaListResponse,
    GenerationJob,
    GenerationJobClaimRequest,
    GenerationJobCreateRequest,
    GenerationJobListResponse,
    GenerationJobRemoteStoreRequest,
    GenerationJobResultRequest,
    GenerationJobStatus,
    GenerationJobStatusUpdate,
    ProviderName,
    StoryboardRequest,
    StoryboardResponse,
    TranscriptSlice,
)
from backend.src.domain.services.generation_queue_service import GenerationQueueService
from backend.src.domain.services.storyboard_service import StoryboardService


def build_generation_router(
    storyboard_service: StoryboardService,
    transcriber: ITranscriber,
    queue_service: GenerationQueueService,
) -> APIRouter:
    router = APIRouter(prefix="/api/generation", tags=["generation"])

    @router.post("/storyboard/from-transcript", response_model=StoryboardResponse)
    async def create_storyboard_from_transcript(request: StoryboardRequest):
        if not request.transcript.strip() and not request.segments:
            raise HTTPException(status_code=400, detail="Transcript or timed segments are required")
        return storyboard_service.create_storyboard(request)

    @router.post("/storyboard/from-audio", response_model=StoryboardResponse)
    async def create_storyboard_from_audio(
        file: UploadFile = File(...),
        preferred_visual_type: GeneratedMediaType = Form("image", alias="preferredVisualType"),
        style: str = Form("cinematic realistic"),
        provider: ProviderName = Form("meta"),
    ):
        suffix = os.path.splitext(file.filename or "")[1] or ".audio"
        temp_path = _save_upload_to_temp(file, suffix)
        try:
            transcription = transcriber.transcribe(temp_path)
            transcript = " ".join(segment.text.strip() for segment in transcription.segments).strip()
            request = StoryboardRequest(
                transcript=transcript,
                segments=[
                    TranscriptSlice(start=segment.start, end=segment.end, text=segment.text)
                    for segment in transcription.segments
                ],
                preferredVisualType=preferred_visual_type,
                style=style,
                provider=provider,
            )
            response = storyboard_service.create_storyboard(request)
            return response.model_copy(
                update={
                    "transcript": transcript,
                    "segments": request.segments,
                    "duration": transcription.duration,
                }
            )
        finally:
            try:
                os.remove(temp_path)
            except OSError:
                pass

    @router.post("/jobs", response_model=GenerationJobListResponse)
    async def create_generation_jobs(request: GenerationJobCreateRequest):
        if not request.scenes:
            raise HTTPException(status_code=400, detail="At least one storyboard scene is required")
        jobs = queue_service.create_jobs(
            request.scenes,
            request.provider,
            aspect_ratio=request.aspect_ratio,
            batch_id=request.batch_id,
        )
        return GenerationJobListResponse(jobs=jobs, batchId=jobs[0].batch_id if jobs else request.batch_id)

    @router.get("/jobs", response_model=GenerationJobListResponse)
    async def list_generation_jobs(
        status: Optional[GenerationJobStatus] = None,
        provider: Optional[ProviderName] = None,
        batch_id: Optional[str] = Query(None, alias="batchId"),
    ):
        return GenerationJobListResponse(
            jobs=queue_service.list_jobs(status=status, provider=provider, batch_id=batch_id),
            batchId=batch_id,
        )

    @router.get("/media-assets", response_model=GeneratedMediaListResponse)
    async def list_generated_media_assets(
        include_placeholders: bool = True,
        batch_id: Optional[str] = Query(None, alias="batchId"),
    ):
        return GeneratedMediaListResponse(
            assets=queue_service.list_generated_media_assets(
                include_placeholders=include_placeholders,
                batch_id=batch_id,
            ),
            batchId=batch_id,
        )

    @router.get("/jobs/{job_id}", response_model=GenerationJob)
    async def get_generation_job(job_id: str):
        job = queue_service.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        return job

    @router.post("/jobs/claim", response_model=GenerationJob)
    async def claim_generation_job(request: GenerationJobClaimRequest):
        job = queue_service.claim_next_job(provider=request.provider, worker_id=request.worker_id)
        if not job:
            raise HTTPException(status_code=404, detail="No queued jobs available")
        return job

    @router.post("/jobs/{job_id}/cancel", response_model=GenerationJob)
    async def cancel_generation_job(job_id: str):
        job = queue_service.cancel_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        return job

    @router.post("/jobs/{job_id}/retry", response_model=GenerationJob)
    async def retry_generation_job(job_id: str):
        job = queue_service.retry_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        return job

    @router.post("/jobs/{job_id}/status", response_model=GenerationJob)
    async def update_generation_job_status(job_id: str, request: GenerationJobStatusUpdate):
        job = queue_service.update_status(
            job_id,
            status=request.status,
            error=request.error,
            metadata=request.metadata,
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        return job

    @router.post("/jobs/{job_id}/result", response_model=GenerationJob)
    async def submit_generation_job_result(job_id: str, request: GenerationJobResultRequest):
        job = queue_service.complete_job_with_url(
            job_id,
            media_url=request.media_url,
            media_type=request.media_type,
            media_variants=request.media_variants,
            metadata=request.metadata,
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        return job

    @router.post("/jobs/{job_id}/result/upload", response_model=GenerationJob)
    async def upload_generation_job_result(
        job_id: str,
        file: UploadFile = File(...),
        media_type: Optional[GeneratedMediaType] = Form(None, alias="mediaType"),
        metadata: Optional[str] = Form(None),
    ):
        job = queue_service.complete_job_with_file(
            job_id,
            source_filename=file.filename or "",
            source_stream=file.file,
            media_type=media_type,
            metadata=_parse_metadata_form(metadata),
        )
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        return job

    @router.post("/jobs/{job_id}/store-remote", response_model=GenerationJob)
    async def store_remote_generation_job_result(
        job_id: str,
        request: Optional[GenerationJobRemoteStoreRequest] = None,
    ):
        existing_job = queue_service.get_job(job_id)
        if not existing_job:
            raise HTTPException(status_code=404, detail="Job not found")

        media_url = request.media_url if request and request.media_url else existing_job.result_url
        if not media_url:
            raise HTTPException(status_code=400, detail="Job has no media URL to store")

        try:
            job = queue_service.store_remote_result(
                job_id,
                media_url=media_url,
                media_type=request.media_type if request else None,
                metadata=request.metadata if request else None,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc))

        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        return job

    @router.get("/media/{filename}")
    async def get_generated_media(filename: str):
        media_path = queue_service.resolve_media_path(filename)
        if not media_path:
            raise HTTPException(status_code=404, detail="Generated media not found")
        return FileResponse(media_path)

    return router


def _save_upload_to_temp(file: UploadFile, suffix: str) -> str:
    fd, temp_path = tempfile.mkstemp(prefix="neuralscribe_storyboard_", suffix=suffix)
    with os.fdopen(fd, "wb") as output:
        shutil.copyfileobj(file.file, output)
    return temp_path


def _parse_metadata_form(metadata: Optional[str]) -> dict[str, str]:
    if not metadata:
        return {}
    try:
        parsed = json.loads(metadata)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Metadata must be valid JSON")
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="Metadata must be a JSON object")
    return {str(key): str(value) for key, value in parsed.items()}
