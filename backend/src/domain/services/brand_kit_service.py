from typing import Optional

from backend.src.domain.models.brand_kit import BrandKit, BrandKitUpdateRequest
from backend.src.domain.models.content_profile import ContentProfile
from backend.src.domain.models.project import utc_now_iso
from backend.src.domain.services.sqlite_store import SQLiteStore


class BrandKitService:
    def __init__(self, store: SQLiteStore):
        self.store = store

    def get_or_create(self, profile: ContentProfile) -> BrandKit:
        existing = self.store.get_brand_kit(profile.id)
        if existing:
            return existing
        now = utc_now_iso()
        brand_kit = BrandKit(
            id=f"brand-kit-{profile.id}",
            profileId=profile.id,
            logoPath=profile.avatar_path,
            colorPalette=profile.brand_colors,
            captionPreset=profile.caption_style,
            thumbnailStyle=profile.visual_style,
            createdAt=now,
            updatedAt=now,
        )
        self.store.upsert_brand_kit(brand_kit)
        return brand_kit

    def get(self, profile_id: str) -> Optional[BrandKit]:
        return self.store.get_brand_kit(profile_id)

    def update(self, profile: ContentProfile, request: BrandKitUpdateRequest) -> BrandKit:
        existing = self.get_or_create(profile)
        updates = request.model_dump(by_alias=False, exclude_unset=True)
        brand_kit = existing.model_copy(update={**updates, "updated_at": utc_now_iso()})
        self.store.upsert_brand_kit(brand_kit)
        return brand_kit
