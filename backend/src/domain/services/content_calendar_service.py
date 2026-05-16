import uuid
from typing import List, Optional

from backend.src.domain.models.content_calendar import (
    CalendarItem,
    CalendarItemCreateRequest,
    CalendarItemUpdateRequest,
)
from backend.src.domain.models.project import utc_now_iso
from backend.src.domain.services.sqlite_store import SQLiteStore


class ContentCalendarService:
    def __init__(self, store: SQLiteStore):
        self.store = store

    def create_item(self, profile_id: str, request: CalendarItemCreateRequest) -> CalendarItem:
        now = utc_now_iso()
        item = CalendarItem(
            id=f"calendar-item-{uuid.uuid4().hex[:12]}",
            profileId=profile_id,
            createdAt=now,
            updatedAt=now,
            **request.model_dump(by_alias=True),
        )
        self.store.upsert_calendar_item(item)
        return item

    def list_items(self, profile_id: str, include_archived: bool = False) -> List[CalendarItem]:
        return self.store.list_calendar_items(profile_id, include_archived=include_archived)

    def update_item(
        self,
        item_id: str,
        request: CalendarItemUpdateRequest,
    ) -> Optional[CalendarItem]:
        existing = self.store.get_calendar_item(item_id)
        if not existing:
            return None
        item = existing.model_copy(
            update={
                **request.model_dump(by_alias=False, exclude_unset=True),
                "updated_at": utc_now_iso(),
            }
        )
        self.store.upsert_calendar_item(item)
        return item

    def archive_item(self, item_id: str) -> Optional[CalendarItem]:
        existing = self.store.get_calendar_item(item_id)
        if not existing:
            return None
        item = existing.model_copy(update={"status": "archived", "updated_at": utc_now_iso()})
        self.store.upsert_calendar_item(item)
        return item
