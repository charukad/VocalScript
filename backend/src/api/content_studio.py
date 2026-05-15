from fastapi import APIRouter, HTTPException, Query

from backend.src.domain.models.content_studio import (
    ContentIdea,
    ContentIdeaCreateRequest,
    ContentIdeaListResponse,
    ContentIdeaUpdateRequest,
    NarrationLineListResponse,
    ScriptCreateRequest,
    ScriptDetail,
    ScriptListResponse,
    ScriptSplitLinesRequest,
    ScriptUpdateRequest,
    ScriptVersionCreateRequest,
)
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.content_studio_service import ContentStudioService


def build_content_studio_router(
    content_profile_service: ContentProfileService,
    content_studio_service: ContentStudioService,
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

    return router
