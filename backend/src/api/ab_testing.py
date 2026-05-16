from fastapi import APIRouter, HTTPException, Query

from backend.src.domain.models.ab_testing import (
    Experiment,
    ExperimentCreateRequest,
    ExperimentListResponse,
    ExperimentUpdateRequest,
)
from backend.src.domain.services.ab_testing_service import ABTestingService
from backend.src.domain.services.content_profile_service import ContentProfileService


def build_ab_testing_router(
    content_profile_service: ContentProfileService,
    ab_testing_service: ABTestingService,
) -> APIRouter:
    router = APIRouter(tags=["ab-testing"])

    def require_profile(profile_id: str):
        profile = content_profile_service.get_profile(profile_id)
        if not profile or profile.is_archived:
            raise HTTPException(status_code=404, detail="Content profile not found")
        return profile

    @router.get(
        "/api/content-profiles/{profile_id}/experiments",
        response_model=ExperimentListResponse,
    )
    async def list_experiments(
        profile_id: str,
        include_archived: bool = Query(False, alias="includeArchived"),
    ):
        require_profile(profile_id)
        return ExperimentListResponse(
            experiments=ab_testing_service.list_experiments(profile_id, include_archived=include_archived)
        )

    @router.post(
        "/api/content-profiles/{profile_id}/experiments",
        response_model=Experiment,
    )
    async def create_experiment(
        profile_id: str,
        request: ExperimentCreateRequest,
    ):
        require_profile(profile_id)
        return ab_testing_service.create_experiment(profile_id, request)

    @router.put("/api/experiments/{experiment_id}", response_model=Experiment)
    async def update_experiment(
        experiment_id: str,
        request: ExperimentUpdateRequest,
    ):
        experiment = ab_testing_service.update_experiment(experiment_id, request)
        if not experiment:
            raise HTTPException(status_code=404, detail="Experiment not found")
        return experiment

    @router.delete("/api/experiments/{experiment_id}", response_model=Experiment)
    async def archive_experiment(experiment_id: str):
        experiment = ab_testing_service.archive_experiment(experiment_id)
        if not experiment:
            raise HTTPException(status_code=404, detail="Experiment not found")
        return experiment

    return router
