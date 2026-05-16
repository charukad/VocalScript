from fastapi import APIRouter, HTTPException, Query

from backend.src.domain.models.content_calendar import (
    CalendarItem,
    CalendarItemCreateRequest,
    CalendarItemListResponse,
    CalendarItemUpdateRequest,
)
from backend.src.domain.services.content_calendar_service import ContentCalendarService
from backend.src.domain.services.content_profile_service import ContentProfileService


def build_content_calendar_router(
    content_profile_service: ContentProfileService,
    content_calendar_service: ContentCalendarService,
) -> APIRouter:
    router = APIRouter(tags=["content-calendar"])

    def require_profile(profile_id: str):
        profile = content_profile_service.get_profile(profile_id)
        if not profile or profile.is_archived:
            raise HTTPException(status_code=404, detail="Content profile not found")
        return profile

    @router.get(
        "/api/content-profiles/{profile_id}/calendar-items",
        response_model=CalendarItemListResponse,
    )
    async def list_calendar_items(
        profile_id: str,
        include_archived: bool = Query(False, alias="includeArchived"),
    ):
        require_profile(profile_id)
        return CalendarItemListResponse(
            items=content_calendar_service.list_items(profile_id, include_archived=include_archived)
        )

    @router.post(
        "/api/content-profiles/{profile_id}/calendar-items",
        response_model=CalendarItem,
    )
    async def create_calendar_item(
        profile_id: str,
        request: CalendarItemCreateRequest,
    ):
        require_profile(profile_id)
        return content_calendar_service.create_item(profile_id, request)

    @router.put("/api/calendar-items/{item_id}", response_model=CalendarItem)
    async def update_calendar_item(
        item_id: str,
        request: CalendarItemUpdateRequest,
    ):
        item = content_calendar_service.update_item(item_id, request)
        if not item:
            raise HTTPException(status_code=404, detail="Calendar item not found")
        return item

    @router.delete("/api/calendar-items/{item_id}", response_model=CalendarItem)
    async def archive_calendar_item(item_id: str):
        item = content_calendar_service.archive_item(item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Calendar item not found")
        return item

    return router
