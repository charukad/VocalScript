from fastapi import APIRouter, HTTPException

from backend.src.domain.models.caption_design import CaptionDesignRequest, CaptionDesignResponse
from backend.src.domain.services.brand_kit_service import BrandKitService
from backend.src.domain.services.caption_design_service import CaptionDesignService
from backend.src.domain.services.content_profile_service import ContentProfileService


def build_caption_design_router(
    content_profile_service: ContentProfileService,
    brand_kit_service: BrandKitService,
    caption_design_service: CaptionDesignService,
) -> APIRouter:
    router = APIRouter(tags=["caption-design"])

    @router.post(
        "/api/content-profiles/{profile_id}/caption-designs/generate",
        response_model=CaptionDesignResponse,
    )
    async def generate_caption_designs(
        profile_id: str,
        request: CaptionDesignRequest,
    ):
        profile = content_profile_service.get_profile(profile_id)
        if not profile or profile.is_archived:
            raise HTTPException(status_code=404, detail="Content profile not found")
        brand_kit = brand_kit_service.get_or_create(profile)
        return caption_design_service.generate(profile, brand_kit, request)

    return router
