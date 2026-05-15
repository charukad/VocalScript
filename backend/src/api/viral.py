from fastapi import APIRouter

from backend.src.domain.models.viral import (
    HookScoreRequest,
    IdeaScoreRequest,
    ScriptAnalysisRequest,
    ScriptAnalysisResponse,
    ScriptRewriteRequest,
    ScriptRewriteResponse,
    ViralPotentialScore,
)
from backend.src.domain.services.viral_scoring_service import ViralScoringService


def build_viral_router(viral_scoring_service: ViralScoringService) -> APIRouter:
    router = APIRouter(prefix="/api/viral", tags=["viral"])

    @router.post("/analyze-script", response_model=ScriptAnalysisResponse)
    async def analyze_script(request: ScriptAnalysisRequest):
        return viral_scoring_service.analyze_script(request)

    @router.post("/rewrite-script", response_model=ScriptRewriteResponse)
    async def rewrite_script(request: ScriptRewriteRequest):
        return viral_scoring_service.rewrite_script(request)

    @router.post("/score-idea", response_model=ViralPotentialScore)
    async def score_idea(request: IdeaScoreRequest):
        return viral_scoring_service.score_idea(request)

    @router.post("/score-hook", response_model=ViralPotentialScore)
    async def score_hook(request: HookScoreRequest):
        return viral_scoring_service.score_hook(request)

    return router
