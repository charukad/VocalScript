from fastapi import APIRouter, HTTPException

from backend.src.domain.models.repurposing import RepurposeRequest, RepurposeResponse
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.repurposing_service import RepurposingService


def build_repurposing_router(
    content_profile_service: ContentProfileService,
    repurposing_service: RepurposingService,
) -> APIRouter:
    router = APIRouter(tags=["repurposing"])

    @router.post(
        "/api/content-profiles/{profile_id}/repurpose/shorts",
        response_model=RepurposeResponse,
    )
    async def generate_shorts(profile_id: str, request: RepurposeRequest):
        profile = content_profile_service.get_profile(profile_id)
        if not profile or profile.is_archived:
            raise HTTPException(status_code=404, detail="Content profile not found")
        return repurposing_service.generate(profile, request)

    return router
