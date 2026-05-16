from fastapi import APIRouter, HTTPException, Query

from backend.src.domain.models.competitor import (
    CompetitorAnalysisSummary,
    CompetitorContent,
    CompetitorContentCreateRequest,
    CompetitorContentListResponse,
    CompetitorContentUpdateRequest,
)
from backend.src.domain.services.competitor_service import CompetitorService
from backend.src.domain.services.content_profile_service import ContentProfileService


def build_competitors_router(
    content_profile_service: ContentProfileService,
    competitor_service: CompetitorService,
) -> APIRouter:
    router = APIRouter(tags=["competitors"])

    def require_profile(profile_id: str):
        profile = content_profile_service.get_profile(profile_id)
        if not profile or profile.is_archived:
            raise HTTPException(status_code=404, detail="Content profile not found")
        return profile

    @router.get(
        "/api/content-profiles/{profile_id}/competitor-content",
        response_model=CompetitorContentListResponse,
    )
    async def list_competitor_content(
        profile_id: str,
        include_archived: bool = Query(False, alias="includeArchived"),
    ):
        require_profile(profile_id)
        return CompetitorContentListResponse(
            items=competitor_service.list_content(profile_id, include_archived=include_archived)
        )

    @router.post(
        "/api/content-profiles/{profile_id}/competitor-content",
        response_model=CompetitorContent,
    )
    async def create_competitor_content(
        profile_id: str,
        request: CompetitorContentCreateRequest,
    ):
        require_profile(profile_id)
        return competitor_service.create_content(profile_id, request)

    @router.put("/api/competitor-content/{item_id}", response_model=CompetitorContent)
    async def update_competitor_content(
        item_id: str,
        request: CompetitorContentUpdateRequest,
    ):
        item = competitor_service.update_content(item_id, request)
        if not item:
            raise HTTPException(status_code=404, detail="Competitor content not found")
        return item

    @router.delete("/api/competitor-content/{item_id}", response_model=CompetitorContent)
    async def archive_competitor_content(item_id: str):
        item = competitor_service.archive_content(item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Competitor content not found")
        return item

    @router.get(
        "/api/content-profiles/{profile_id}/competitor-content/summary",
        response_model=CompetitorAnalysisSummary,
    )
    async def summarize_competitor_content(profile_id: str):
        require_profile(profile_id)
        return competitor_service.analyze(profile_id)

    return router
