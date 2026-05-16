from fastapi import APIRouter, HTTPException

from backend.src.domain.models.packaging import (
    PackagingGenerationRequest,
    PackagingGenerationResponse,
)
from backend.src.domain.services.content_profile_service import ContentProfileService
from backend.src.domain.services.brand_kit_service import BrandKitService
from backend.src.domain.services.packaging_service import PackagingService


def build_packaging_router(
    content_profile_service: ContentProfileService,
    brand_kit_service: BrandKitService,
    packaging_service: PackagingService,
) -> APIRouter:
    router = APIRouter(tags=["packaging"])

    @router.post(
        "/api/content-profiles/{profile_id}/packaging/generate",
        response_model=PackagingGenerationResponse,
    )
    async def generate_packaging(
        profile_id: str,
        request: PackagingGenerationRequest,
    ):
        profile = content_profile_service.get_profile(profile_id)
        if not profile or profile.is_archived:
            raise HTTPException(status_code=404, detail="Content profile not found")
        return packaging_service.generate(profile, request, brand_kit_service.get_or_create(profile))

    return router
