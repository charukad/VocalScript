from fastapi import APIRouter, HTTPException

from backend.src.domain.models.analytics import (
    AnalyticsConnection,
    AnalyticsConnectionListResponse,
    AnalyticsConnectionUpdateRequest,
    ContentPerformance,
    ContentPerformanceListResponse,
    ManualPerformanceImportRequest,
    ProfileLearningListResponse,
)
from backend.src.domain.models.content_profile import PlatformTarget
from backend.src.domain.services.analytics_service import AnalyticsService
from backend.src.domain.services.content_profile_service import ContentProfileService


def build_analytics_router(
    content_profile_service: ContentProfileService,
    analytics_service: AnalyticsService,
) -> APIRouter:
    router = APIRouter(tags=["analytics"])

    def require_profile(profile_id: str):
        profile = content_profile_service.get_profile(profile_id)
        if not profile or profile.is_archived:
            raise HTTPException(status_code=404, detail="Content profile not found")
        return profile

    @router.get(
        "/api/content-profiles/{profile_id}/analytics/connections",
        response_model=AnalyticsConnectionListResponse,
    )
    async def list_connections(profile_id: str):
        require_profile(profile_id)
        return AnalyticsConnectionListResponse(
            connections=analytics_service.list_connections(profile_id)
        )

    @router.put(
        "/api/content-profiles/{profile_id}/analytics/connections/{platform}",
        response_model=AnalyticsConnection,
    )
    async def update_connection(
        profile_id: str,
        platform: PlatformTarget,
        request: AnalyticsConnectionUpdateRequest,
    ):
        require_profile(profile_id)
        connection = analytics_service.upsert_connection(profile_id, platform, request)
        if not connection:
            raise HTTPException(status_code=404, detail="Content profile not found")
        return connection

    @router.post(
        "/api/content-profiles/{profile_id}/analytics/performance/manual",
        response_model=ContentPerformance,
    )
    async def import_manual_performance(profile_id: str, request: ManualPerformanceImportRequest):
        require_profile(profile_id)
        performance = analytics_service.import_manual_performance(profile_id, request)
        if not performance:
            raise HTTPException(status_code=404, detail="Content profile not found")
        return performance

    @router.get(
        "/api/content-profiles/{profile_id}/analytics/performance",
        response_model=ContentPerformanceListResponse,
    )
    async def list_performance(profile_id: str):
        require_profile(profile_id)
        return ContentPerformanceListResponse(
            performance=analytics_service.list_performance(profile_id)
        )

    @router.get(
        "/api/content-profiles/{profile_id}/analytics/learnings",
        response_model=ProfileLearningListResponse,
    )
    async def list_profile_learnings(profile_id: str):
        require_profile(profile_id)
        return ProfileLearningListResponse(
            learnings=analytics_service.list_profile_learnings(profile_id)
        )

    return router
