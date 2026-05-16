from fastapi import APIRouter, HTTPException

from backend.src.domain.models.brand_kit import BrandKit, BrandKitUpdateRequest
from backend.src.domain.services.brand_kit_service import BrandKitService
from backend.src.domain.services.content_profile_service import ContentProfileService


def build_brand_kits_router(
    content_profile_service: ContentProfileService,
    brand_kit_service: BrandKitService,
) -> APIRouter:
    router = APIRouter(tags=["brand-kits"])

    def require_profile(profile_id: str):
        profile = content_profile_service.get_profile(profile_id)
        if not profile or profile.is_archived:
            raise HTTPException(status_code=404, detail="Content profile not found")
        return profile

    @router.get("/api/content-profiles/{profile_id}/brand-kit", response_model=BrandKit)
    async def get_brand_kit(profile_id: str):
        profile = require_profile(profile_id)
        return brand_kit_service.get_or_create(profile)

    @router.put("/api/content-profiles/{profile_id}/brand-kit", response_model=BrandKit)
    async def update_brand_kit(profile_id: str, request: BrandKitUpdateRequest):
        profile = require_profile(profile_id)
        return brand_kit_service.update(profile, request)

    return router
