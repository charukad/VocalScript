from fastapi import APIRouter, HTTPException

from backend.src.domain.models.comments import (
    CommentAnalysisRequest,
    CommentAnalysisRun,
    CommentAnalysisRunListResponse,
)
from backend.src.domain.services.comment_analysis_service import CommentAnalysisService
from backend.src.domain.services.content_profile_service import ContentProfileService


def build_comments_router(
    content_profile_service: ContentProfileService,
    comment_analysis_service: CommentAnalysisService,
) -> APIRouter:
    router = APIRouter(tags=["comments"])

    def require_profile(profile_id: str):
        profile = content_profile_service.get_profile(profile_id)
        if not profile or profile.is_archived:
            raise HTTPException(status_code=404, detail="Content profile not found")
        return profile

    @router.post(
        "/api/content-profiles/{profile_id}/comments/analyze",
        response_model=CommentAnalysisRun,
    )
    async def analyze_comments(profile_id: str, request: CommentAnalysisRequest):
        require_profile(profile_id)
        return comment_analysis_service.analyze(profile_id, request)

    @router.get(
        "/api/content-profiles/{profile_id}/comments/analyses",
        response_model=CommentAnalysisRunListResponse,
    )
    async def list_comment_analyses(profile_id: str):
        require_profile(profile_id)
        return CommentAnalysisRunListResponse(runs=comment_analysis_service.list_runs(profile_id))

    return router
