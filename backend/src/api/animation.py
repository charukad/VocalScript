import json
import os
import shutil
import tempfile
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from pydantic import Field

from backend.src.domain.interfaces.transcriber import ITranscriber
from backend.src.domain.models.animation import (
    ApiModel,
    AnimationAssetJobCreateRequest,
    AnimationAssetMemoryItem,
    AnimationCaptionTemplate,
    AnimationLayoutTemplate,
    AnimationPlan,
    AnimationPlanRequest,
)
from backend.src.domain.models.generation import (
    GenerationAspectRatio,
    GeneratedMediaType,
    ProviderName,
    GenerationJob,
    StoryboardMotionIntensity,
    StoryboardPromptDetail,
    StoryboardScene,
    StoryboardSceneDensity,
    TranscriptSlice,
)
from backend.src.domain.services.animation_planner_service import AnimationPlannerService
from backend.src.domain.services.generation_queue_service import GenerationQueueService


class AnimationAssetJobListResponse(ApiModel):
    jobs: List[GenerationJob]
    batch_id: Optional[str] = Field(default=None, alias="batchId")


def build_animation_router(
    animation_planner_service: AnimationPlannerService,
    transcriber: ITranscriber,
    queue_service: GenerationQueueService,
) -> APIRouter:
    router = APIRouter(prefix="/api/animation", tags=["animation"])

    @router.post("/plan/from-transcript", response_model=AnimationPlan)
    async def create_animation_plan_from_transcript(request: AnimationPlanRequest):
        if not request.transcript.strip() and not request.segments:
            raise HTTPException(status_code=400, detail="Transcript or timed segments are required")
        return animation_planner_service.create_plan(request)

    @router.post("/plan/from-audio", response_model=AnimationPlan)
    async def create_animation_plan_from_audio(
        file: UploadFile = File(...),
        style: str = Form("animated explainer"),
        aspect_ratio: GenerationAspectRatio = Form("16:9", alias="aspectRatio"),
        scene_density: StoryboardSceneDensity = Form("medium", alias="sceneDensity"),
        motion_intensity: StoryboardMotionIntensity = Form("balanced", alias="motionIntensity"),
        prompt_detail: StoryboardPromptDetail = Form("balanced", alias="promptDetail"),
        layout_template: AnimationLayoutTemplate = Form("auto", alias="layoutTemplate"),
        caption_template: AnimationCaptionTemplate = Form("keyword_pop", alias="captionTemplate"),
        provider: ProviderName = Form("meta"),
        available_assets: Optional[str] = Form(None, alias="availableAssets"),
    ):
        suffix = os.path.splitext(file.filename or "")[1] or ".audio"
        temp_path = _save_upload_to_temp(file, suffix)
        try:
            transcription = transcriber.transcribe(temp_path)
            transcript = " ".join(segment.text.strip() for segment in transcription.segments).strip()
            request = AnimationPlanRequest(
                transcript=transcript,
                segments=[
                    TranscriptSlice(start=segment.start, end=segment.end, text=segment.text)
                    for segment in transcription.segments
                ],
                availableAssets=_parse_available_assets(available_assets),
                style=style,
                aspectRatio=aspect_ratio,
                sceneDensity=scene_density,
                motionIntensity=motion_intensity,
                promptDetail=prompt_detail,
                layoutTemplate=layout_template,
                captionTemplate=caption_template,
                provider=provider,
            )
            plan = animation_planner_service.create_plan(request)
            return plan.model_copy(
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

    @router.post("/assets/jobs", response_model=AnimationAssetJobListResponse)
    async def create_animation_asset_jobs(request: AnimationAssetJobCreateRequest):
        missing_needs = [
            need for need in request.asset_needs
            if need.reuse_decision == "generate" and need.status in ("missing", "failed")
        ]
        if not missing_needs:
            raise HTTPException(status_code=400, detail="No missing animation assets need generation")

        scenes = [
            StoryboardScene(
                id=need.id,
                start=0.0,
                end=5.0,
                transcript=need.description,
                visualType="image",
                prompt=need.prompt,
                negativePrompt=need.negative_prompt,
                style=need.style,
                camera="static reusable animation asset",
                status="approved",
            )
            for need in missing_needs
        ]
        jobs = queue_service.create_jobs(
            scenes,
            request.provider,
            aspect_ratio=request.aspect_ratio,
            batch_id=request.batch_id,
            project_id=request.project_id,
            project_name=request.project_name,
        )
        needs_by_id = {need.id: need for need in missing_needs}
        enriched_jobs = []
        for job in jobs:
            need = needs_by_id.get(job.scene_id)
            metadata = {
                "flow": "auto_animate",
                "animationAssetId": job.scene_id,
                "animationAssetType": need.asset_type if need else "prop",
                "animationAssetName": need.name if need else job.scene_id,
                "animationAssetTags": ",".join(need.tags) if need else "",
                "animationReuseDecision": "generate",
            }
            enriched_jobs.append(queue_service.update_status(job.id, job.status, metadata=metadata) or job)
        return AnimationAssetJobListResponse(
            jobs=enriched_jobs,
            batchId=enriched_jobs[0].batch_id if enriched_jobs else request.batch_id,
        )

    @router.post("/assets/jobs/{job_id}/retry", response_model=GenerationJob)
    async def retry_animation_asset_job(job_id: str):
        existing_job = queue_service.get_job(job_id)
        if not existing_job:
            raise HTTPException(status_code=404, detail="Animation asset job not found")
        if existing_job.metadata.get("flow") != "auto_animate":
            raise HTTPException(status_code=400, detail="Job is not an Auto Animate asset job")
        job = _retry_animation_job(queue_service, existing_job)
        if not job:
            raise HTTPException(status_code=404, detail="Animation asset job not found")
        return job

    @router.post("/assets/jobs/{job_id}/retry-auto", response_model=GenerationJob)
    async def auto_retry_animation_asset_job(
        job_id: str,
        max_attempts: int = Query(50, alias="maxAttempts", ge=1, le=50),
    ):
        existing_job = queue_service.get_job(job_id)
        if not existing_job:
            raise HTTPException(status_code=404, detail="Animation asset job not found")
        if existing_job.metadata.get("flow") != "auto_animate":
            raise HTTPException(status_code=400, detail="Job is not an Auto Animate asset job")
        run_attempt = _safe_int(existing_job.metadata.get("runAttempt"), 0)
        if run_attempt >= max_attempts:
            return queue_service.update_status(
                job_id,
                existing_job.status,
                error=existing_job.error or f"Auto retry limit reached after {max_attempts} attempts.",
                metadata={**existing_job.metadata, "autoRetryBlocked": "true", "autoRetryMaxAttempts": str(max_attempts)},
            ) or existing_job
        rewritten_prompt = animation_planner_service.local_llm.rewrite_generation_prompt(existing_job)
        job = _retry_animation_job(
            queue_service,
            existing_job,
            prompt_override=rewritten_prompt,
            retry_mode="auto_rewrite",
        )
        if not job:
            raise HTTPException(status_code=404, detail="Animation asset job not found")
        return job

    return router


def _save_upload_to_temp(file: UploadFile, suffix: str) -> str:
    fd, temp_path = tempfile.mkstemp(prefix="neuralscribe_animation_", suffix=suffix)
    with os.fdopen(fd, "wb") as output:
        shutil.copyfileobj(file.file, output)
    return temp_path


def _parse_available_assets(raw: Optional[str]) -> List[AnimationAssetMemoryItem]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="availableAssets must be valid JSON")
    if not isinstance(parsed, list):
        raise HTTPException(status_code=400, detail="availableAssets must be a JSON array")
    assets: List[AnimationAssetMemoryItem] = []
    for item in parsed:
        try:
            assets.append(AnimationAssetMemoryItem(**item))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"Invalid animation asset metadata: {exc}")
    return assets


def _retry_animation_job(
    queue_service: GenerationQueueService,
    existing_job: GenerationJob,
    prompt_override: Optional[str] = None,
    retry_mode: str = "manual",
) -> Optional[GenerationJob]:
    if existing_job.status in ("queued", "running"):
        return existing_job
    retry_source = existing_job
    if existing_job.status == "completed":
        retry_source = queue_service.update_status(
            existing_job.id,
            "failed",
            error=None,
            metadata={**existing_job.metadata, "retrySourceStatus": "completed"},
        ) or existing_job
    return queue_service.retry_job(
        retry_source.id,
        prompt_override=prompt_override,
        retry_mode=retry_mode,
    )


def _safe_int(value: object, fallback: int) -> int:
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return fallback
