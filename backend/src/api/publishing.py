from fastapi import APIRouter, HTTPException, Query

from backend.src.domain.models.content_profile import PlatformTarget
from backend.src.domain.models.publishing import (
    PublishJob,
    PublishJobCreateRequest,
    PublishJobListResponse,
    PublishJobUpdateRequest,
    PublishingDestination,
    PublishingDestinationListResponse,
    PublishingDestinationUpdateRequest,
    PublishingPackage,
    PublishingPackageRequest,
    PublishingProviderListResponse,
)
from backend.src.domain.services.brand_kit_service import BrandKitService
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.publishing_service import PublishingService


def build_publishing_router(
    content_profile_service: ContentProfileService,
    brand_kit_service: BrandKitService,
    publishing_service: PublishingService,
) -> APIRouter:
    router = APIRouter(tags=["publishing"])

    def require_profile(profile_id: str):
        profile = content_profile_service.get_profile(profile_id)
        if not profile or profile.is_archived:
            raise HTTPException(status_code=404, detail="Content profile not found")
        return profile

    @router.get("/api/publishing/providers", response_model=PublishingProviderListResponse)
    async def list_providers():
        return PublishingProviderListResponse(providers=publishing_service.list_providers())

    @router.get(
        "/api/content-profiles/{profile_id}/publishing/destinations",
        response_model=PublishingDestinationListResponse,
    )
    async def list_destinations(profile_id: str):
        require_profile(profile_id)
        return PublishingDestinationListResponse(
            destinations=publishing_service.list_destinations(profile_id)
        )

    @router.put(
        "/api/content-profiles/{profile_id}/publishing/destinations/{platform}",
        response_model=PublishingDestination,
    )
    async def update_destination(
        profile_id: str,
        platform: PlatformTarget,
        request: PublishingDestinationUpdateRequest,
    ):
        require_profile(profile_id)
        return publishing_service.upsert_destination(profile_id, platform, request)

    @router.post(
        "/api/content-profiles/{profile_id}/publishing/package",
        response_model=PublishingPackage,
    )
    async def generate_package(profile_id: str, request: PublishingPackageRequest):
        profile = require_profile(profile_id)
        return publishing_service.generate_package(
            profile,
            request,
            brand_kit_service.get_or_create(profile),
        )

    @router.get(
        "/api/content-profiles/{profile_id}/publish-jobs",
        response_model=PublishJobListResponse,
    )
    async def list_jobs(profile_id: str, include_archived: bool = Query(False, alias="includeArchived")):
        require_profile(profile_id)
        return PublishJobListResponse(
            jobs=publishing_service.list_jobs(profile_id, include_archived=include_archived)
        )

    @router.post("/api/content-profiles/{profile_id}/publish-jobs", response_model=PublishJob)
    async def create_job(profile_id: str, request: PublishJobCreateRequest):
        require_profile(profile_id)
        return publishing_service.create_job(profile_id, request)

    @router.put("/api/publish-jobs/{job_id}", response_model=PublishJob)
    async def update_job(job_id: str, request: PublishJobUpdateRequest):
        job = publishing_service.update_job(job_id, request)
        if not job:
            raise HTTPException(status_code=404, detail="Publish job not found")
        return job

    @router.delete("/api/publish-jobs/{job_id}", response_model=PublishJob)
    async def archive_job(job_id: str):
        job = publishing_service.archive_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Publish job not found")
        return job

    @router.post("/api/publish-jobs/{job_id}/dispatch", response_model=PublishJob)
    async def dispatch_job(job_id: str):
        job, blocker = publishing_service.dispatch_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Publish job not found")
        if blocker:
            raise HTTPException(status_code=409, detail=blocker)
        return job

    return router
