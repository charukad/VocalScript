from fastapi import APIRouter, HTTPException

from backend.src.domain.models.trend_radar import (
    TrendImportResult,
    TrendRssImportRequest,
    TrendSourceListResponse,
)
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.trend_radar_service import TrendRadarService


def build_trend_radar_router(
    content_profile_service: ContentProfileService,
    trend_radar_service: TrendRadarService,
) -> APIRouter:
    router = APIRouter(tags=["trend-radar"])

    @router.get("/api/trend-sources", response_model=TrendSourceListResponse)
    async def list_trend_sources():
        return TrendSourceListResponse(sources=trend_radar_service.list_sources())

    @router.post(
        "/api/content-profiles/{profile_id}/trends/import/rss",
        response_model=TrendImportResult,
    )
    async def import_trends_from_rss(profile_id: str, request: TrendRssImportRequest):
        profile = content_profile_service.get_profile(profile_id)
        if not profile or profile.is_archived:
            raise HTTPException(status_code=404, detail="Content profile not found")
        try:
            return trend_radar_service.import_rss(profile, request)
        except Exception as error:
            raise HTTPException(status_code=400, detail=f"Could not import RSS feed: {error}") from error

    return router
