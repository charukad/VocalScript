from typing import List, Literal, Optional

from pydantic import Field, field_validator

from backend.src.domain.models.content_profile import PlatformTarget
from backend.src.domain.models.generation import ApiModel


CalendarItemStatus = Literal["planned", "drafting", "ready", "published", "archived"]


class CalendarItemFields(ApiModel):
    title: str
    scheduled_at: str = Field(alias="scheduledAt")
    platform: Optional[PlatformTarget] = None
    status: CalendarItemStatus = "planned"
    idea_id: Optional[str] = Field(default=None, alias="ideaId")
    script_id: Optional[str] = Field(default=None, alias="scriptId")
    project_id: Optional[str] = Field(default=None, alias="projectId")
    notes: str = ""

    @field_validator("title", "scheduled_at")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Calendar title and scheduled time are required")
        return cleaned


class CalendarItemCreateRequest(CalendarItemFields):
    pass


class CalendarItemUpdateRequest(ApiModel):
    title: Optional[str] = None
    scheduled_at: Optional[str] = Field(default=None, alias="scheduledAt")
    platform: Optional[PlatformTarget] = None
    status: Optional[CalendarItemStatus] = None
    idea_id: Optional[str] = Field(default=None, alias="ideaId")
    script_id: Optional[str] = Field(default=None, alias="scriptId")
    project_id: Optional[str] = Field(default=None, alias="projectId")
    notes: Optional[str] = None

    @field_validator("title", "scheduled_at")
    @classmethod
    def validate_optional_required_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Calendar title and scheduled time are required")
        return cleaned


class CalendarItem(CalendarItemFields):
    id: str
    profile_id: str = Field(alias="profileId")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class CalendarItemListResponse(ApiModel):
    items: List[CalendarItem]
