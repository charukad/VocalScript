from fastapi import APIRouter, HTTPException, Query

from backend.src.domain.models.content_studio import (
    ContentIdea,
    ContentIdeaCreateRequest,
    ContentIdeaListResponse,
    ContentIdeaUpdateRequest,
    ContentTrend,
    ContentTrendCreateRequest,
    ContentTrendListResponse,
    ContentTrendUpdateRequest,
    NarrationLine,
    NarrationLineCreateRequest,
    NarrationLineListResponse,
    NarrationLineUpdateRequest,
    ScriptCreateRequest,
    ScriptDetail,
    ScriptListResponse,
    ScriptSplitLinesRequest,
    ScriptUpdateRequest,
    ScriptVersionCreateRequest,
)
from backend.src.domain.models.generation import (
    GenerationJobListResponse,
    VoiceGenerationJobCreateRequest,
)
from backend.src.domain.models.timeline_builder import TimelineDraft, TimelineDraftBuildRequest
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.content_studio_service import ContentStudioService
from backend.src.domain.services.generation_queue_service import GenerationQueueService
from backend.src.domain.services.timeline_builder_service import TimelineBuilderService


def build_content_studio_router(
    content_profile_service: ContentProfileService,
    content_studio_service: ContentStudioService,
    generation_queue_service: GenerationQueueService,
    timeline_builder_service: TimelineBuilderService,
) -> APIRouter:
    router = APIRouter(tags=["content-studio"])

    def require_profile(profile_id: str):
        profile = content_profile_service.get_profile(profile_id)
        if not profile or profile.is_archived:
            raise HTTPException(status_code=404, detail="Content profile not found")
        return profile

    @router.get("/api/content-profiles/{profile_id}/ideas", response_model=ContentIdeaListResponse)
    async def list_content_ideas(
        profile_id: str,
        include_archived: bool = Query(False, alias="includeArchived"),
    ):
        require_profile(profile_id)
        return ContentIdeaListResponse(
            ideas=content_studio_service.list_ideas(profile_id, include_archived=include_archived)
        )

    @router.post("/api/content-profiles/{profile_id}/ideas", response_model=ContentIdea)
    async def create_content_idea(profile_id: str, request: ContentIdeaCreateRequest):
        require_profile(profile_id)
        return content_studio_service.create_idea(profile_id, request)

    @router.put("/api/content-ideas/{idea_id}", response_model=ContentIdea)
    async def update_content_idea(idea_id: str, request: ContentIdeaUpdateRequest):
        idea = content_studio_service.update_idea(idea_id, request)
        if not idea:
            raise HTTPException(status_code=404, detail="Content idea not found")
        return idea

    @router.delete("/api/content-ideas/{idea_id}", response_model=ContentIdea)
    async def archive_content_idea(idea_id: str):
        idea = content_studio_service.archive_idea(idea_id)
        if not idea:
            raise HTTPException(status_code=404, detail="Content idea not found")
        return idea

    @router.get("/api/content-profiles/{profile_id}/trends", response_model=ContentTrendListResponse)
    async def list_content_trends(
        profile_id: str,
        include_archived: bool = Query(False, alias="includeArchived"),
    ):
        require_profile(profile_id)
        return ContentTrendListResponse(
            trends=content_studio_service.list_trends(profile_id, include_archived=include_archived)
        )

    @router.post("/api/content-profiles/{profile_id}/trends", response_model=ContentTrend)
    async def create_content_trend(profile_id: str, request: ContentTrendCreateRequest):
        require_profile(profile_id)
        return content_studio_service.create_trend(profile_id, request)

    @router.post("/api/content-profiles/{profile_id}/trends/suggest", response_model=ContentTrendListResponse)
    async def suggest_content_trends(profile_id: str):
        profile = require_profile(profile_id)
        return ContentTrendListResponse(
            trends=content_studio_service.suggest_trends(
                profile_id=profile.id,
                content_type=profile.content_type,
                target_audience=profile.target_audience,
                platforms=profile.platforms,
                hook_style=profile.hook_style,
            )
        )

    @router.put("/api/content-trends/{trend_id}", response_model=ContentTrend)
    async def update_content_trend(trend_id: str, request: ContentTrendUpdateRequest):
        trend = content_studio_service.update_trend(trend_id, request)
        if not trend:
            raise HTTPException(status_code=404, detail="Content trend not found")
        return trend

    @router.delete("/api/content-trends/{trend_id}", response_model=ContentTrend)
    async def archive_content_trend(trend_id: str):
        trend = content_studio_service.archive_trend(trend_id)
        if not trend:
            raise HTTPException(status_code=404, detail="Content trend not found")
        return trend

    @router.get("/api/content-profiles/{profile_id}/scripts", response_model=ScriptListResponse)
    async def list_scripts(profile_id: str):
        require_profile(profile_id)
        return ScriptListResponse(scripts=content_studio_service.list_scripts(profile_id))

    @router.post("/api/content-profiles/{profile_id}/scripts", response_model=ScriptDetail)
    async def create_script(profile_id: str, request: ScriptCreateRequest):
        require_profile(profile_id)
        return content_studio_service.create_script(profile_id, request)

    @router.get("/api/scripts/{script_id}", response_model=ScriptDetail)
    async def get_script(script_id: str):
        script = content_studio_service.get_script_detail(script_id)
        if not script:
            raise HTTPException(status_code=404, detail="Script not found")
        return script

    @router.put("/api/scripts/{script_id}", response_model=ScriptDetail)
    async def update_script(script_id: str, request: ScriptUpdateRequest):
        script = content_studio_service.update_script(script_id, request)
        if not script:
            raise HTTPException(status_code=404, detail="Script not found")
        return script

    @router.post("/api/scripts/{script_id}/versions", response_model=ScriptDetail)
    async def create_script_version(script_id: str, request: ScriptVersionCreateRequest):
        script = content_studio_service.create_script_version(script_id, request)
        if not script:
            raise HTTPException(status_code=404, detail="Script not found")
        return script

    @router.post("/api/scripts/{script_id}/split-lines", response_model=NarrationLineListResponse)
    async def split_script_into_lines(script_id: str, request: ScriptSplitLinesRequest):
        lines = content_studio_service.split_script_into_lines(script_id, request)
        if lines is None:
            raise HTTPException(status_code=404, detail="Script not found")
        return NarrationLineListResponse(lines=lines)

    @router.get("/api/scripts/{script_id}/narration-lines", response_model=NarrationLineListResponse)
    async def list_narration_lines(script_id: str):
        lines = content_studio_service.list_narration_lines(script_id)
        if lines is None:
            raise HTTPException(status_code=404, detail="Script not found")
        return NarrationLineListResponse(lines=lines)

    @router.post("/api/scripts/{script_id}/narration-lines", response_model=NarrationLine)
    async def create_narration_line(script_id: str, request: NarrationLineCreateRequest):
        line = content_studio_service.create_narration_line(script_id, request)
        if not line:
            raise HTTPException(status_code=404, detail="Script not found")
        return line

    @router.put("/api/narration-lines/{line_id}", response_model=NarrationLine)
    async def update_narration_line(line_id: str, request: NarrationLineUpdateRequest):
        line = content_studio_service.update_narration_line(line_id, request)
        if not line:
            raise HTTPException(status_code=404, detail="Narration line not found")
        return line

    @router.post("/api/narration-lines/{line_id}/regenerate", response_model=NarrationLine)
    async def regenerate_narration_line(line_id: str):
        line = content_studio_service.regenerate_narration_line(line_id)
        if not line:
            raise HTTPException(status_code=404, detail="Narration line not found")
        return line

    @router.post("/api/scripts/{script_id}/voice-jobs", response_model=GenerationJobListResponse)
    async def create_voice_jobs(script_id: str, request: VoiceGenerationJobCreateRequest):
        script = content_studio_service.get_script_detail(script_id)
        if not script:
            raise HTTPException(status_code=404, detail="Script not found")
        if request.mode == "line_by_line" and not script.narration_lines:
            raise HTTPException(status_code=400, detail="Narration lines are required for line-by-line voice jobs")
        jobs = generation_queue_service.create_voice_jobs(
            script_id=script.id,
            script_text=script.content,
            narration_lines=script.narration_lines,
            provider=request.provider,
            mode=request.mode,
            batch_id=request.batch_id,
            project_id=request.project_id,
            project_name=request.project_name,
            voice_style=request.voice_style,
        )
        if not jobs:
            raise HTTPException(status_code=400, detail="No voice jobs were created")
        return GenerationJobListResponse(jobs=jobs, batchId=jobs[0].batch_id)

    @router.get("/api/scripts/{script_id}/voice-jobs", response_model=GenerationJobListResponse)
    async def list_voice_jobs(script_id: str):
        script = content_studio_service.get_script_detail(script_id)
        if not script:
            raise HTTPException(status_code=404, detail="Script not found")
        jobs = [
            job
            for job in generation_queue_service.list_jobs(flow="voice_generation")
            if job.metadata.get("scriptId") == script_id
        ]
        for job in jobs:
            content_studio_service.sync_narration_line_from_voice_job(job)
        return GenerationJobListResponse(jobs=jobs, batchId=jobs[-1].batch_id if jobs else None)

    @router.post("/api/scripts/{script_id}/timeline-draft", response_model=TimelineDraft)
    async def build_timeline_draft(script_id: str, request: TimelineDraftBuildRequest):
        script = content_studio_service.get_script_detail(script_id)
        if not script:
            raise HTTPException(status_code=404, detail="Script not found")
        return timeline_builder_service.build_draft(
            script=script,
            scenes=request.scenes,
            generated_media_assets=request.generated_media_assets,
        )

    return router
