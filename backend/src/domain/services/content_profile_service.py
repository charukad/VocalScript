import uuid
from typing import List, Optional

from backend.src.domain.models.content_profile import (
    ContentProfile,
    ContentProfileCreateRequest,
    ContentProfileUpdateRequest,
)
from backend.src.domain.models.project import utc_now_iso
from backend.src.domain.services.sqlite_store import SQLiteStore


class ContentProfileService:
    def __init__(self, store: SQLiteStore):
        self.store = store

    def create_profile(self, request: ContentProfileCreateRequest) -> ContentProfile:
        now = utc_now_iso()
        profile = ContentProfile(
            id=f"profile-{uuid.uuid4().hex[:12]}",
            createdAt=now,
            updatedAt=now,
            **request.model_dump(by_alias=True),
        )
        self.store.upsert_content_profile(profile)
        return profile

    def list_profiles(self, include_archived: bool = False) -> List[ContentProfile]:
        return self.store.list_content_profiles(include_archived=include_archived)

    def get_profile(self, profile_id: str) -> Optional[ContentProfile]:
        return self.store.get_content_profile(profile_id)

    def update_profile(
        self,
        profile_id: str,
        request: ContentProfileUpdateRequest,
    ) -> Optional[ContentProfile]:
        existing = self.store.get_content_profile(profile_id)
        if not existing:
            return None
        updates = request.model_dump(by_alias=False, exclude_unset=True)
        profile = existing.model_copy(
            update={
                **updates,
                "updated_at": utc_now_iso(),
            }
        )
        self.store.upsert_content_profile(profile)
        return profile

    def archive_profile(self, profile_id: str) -> Optional[ContentProfile]:
        existing = self.store.get_content_profile(profile_id)
        if not existing:
            return None
        now = utc_now_iso()
        profile = existing.model_copy(
            update={
                "is_archived": True,
                "updated_at": now,
                "archived_at": existing.archived_at or now,
            }
        )
        self.store.upsert_content_profile(profile)
        return profile
