from fastapi import APIRouter, HTTPException, Query

from backend.src.domain.models.content_profile import (
    ContentProfile,
    ContentProfileCreateRequest,
    ContentProfileListResponse,
    ContentProfileUpdateRequest,
)
from backend.src.domain.services.content_profile_service import ContentProfileService


def build_content_profiles_router(content_profile_service: ContentProfileService) -> APIRouter:
    router = APIRouter(prefix="/api/content-profiles", tags=["content-profiles"])

    @router.post("", response_model=ContentProfile)
    async def create_content_profile(request: ContentProfileCreateRequest):
        return content_profile_service.create_profile(request)

    @router.get("", response_model=ContentProfileListResponse)
    async def list_content_profiles(
        include_archived: bool = Query(False, alias="includeArchived"),
    ):
        return ContentProfileListResponse(
            profiles=content_profile_service.list_profiles(include_archived=include_archived)
        )

    @router.get("/{profile_id}", response_model=ContentProfile)
    async def get_content_profile(profile_id: str):
        profile = content_profile_service.get_profile(profile_id)
        if not profile:
            raise HTTPException(status_code=404, detail="Content profile not found")
        return profile

    @router.put("/{profile_id}", response_model=ContentProfile)
    async def update_content_profile(profile_id: str, request: ContentProfileUpdateRequest):
        profile = content_profile_service.update_profile(profile_id, request)
        if not profile:
            raise HTTPException(status_code=404, detail="Content profile not found")
        return profile

    @router.delete("/{profile_id}", response_model=ContentProfile)
    async def archive_content_profile(profile_id: str):
        profile = content_profile_service.archive_profile(profile_id)
        if not profile:
            raise HTTPException(status_code=404, detail="Content profile not found")
        return profile

    return router
