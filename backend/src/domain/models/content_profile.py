from typing import Dict, List, Literal, Optional

from pydantic import Field, field_validator

from backend.src.domain.models.generation import ApiModel


PlatformTarget = Literal[
    "youtube",
    "youtube_shorts",
    "facebook_page",
    "facebook_reels",
    "tiktok",
    "instagram_reels",
    "multi_platform",
]


class ContentProfileFields(ApiModel):
    name: str
    description: str = ""
    avatar_path: Optional[str] = Field(default=None, alias="avatarPath")
    platforms: List[PlatformTarget] = Field(default_factory=lambda: ["youtube_shorts"])
    content_type: str = Field(default="general", alias="contentType")
    target_audience: str = Field(default="general audience", alias="targetAudience")
    language: str = "en"
    tone: str = "clear, engaging"
    default_video_length_seconds: int = Field(default=45, alias="defaultVideoLengthSeconds", ge=1, le=36000)
    voice_style: str = Field(default="natural narrator", alias="voiceStyle")
    visual_style: str = Field(default="clean social video", alias="visualStyle")
    hook_style: str = Field(default="curiosity", alias="hookStyle")
    caption_style: str = Field(default="high-contrast mobile captions", alias="captionStyle")
    brand_colors: List[str] = Field(default_factory=list, alias="brandColors")
    competitors: List[str] = Field(default_factory=list)
    posting_goals: str = Field(default="", alias="postingGoals")
    analytics_connection_status: Dict[str, str] = Field(default_factory=dict, alias="analyticsConnectionStatus")

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Profile name is required")
        return cleaned

    @field_validator("platforms")
    @classmethod
    def validate_platforms(cls, value: List[PlatformTarget]) -> List[PlatformTarget]:
        if not value:
            raise ValueError("At least one platform is required")
        return list(dict.fromkeys(value))


class ContentProfileCreateRequest(ContentProfileFields):
    pass


class ContentProfileUpdateRequest(ApiModel):
    name: Optional[str] = None
    description: Optional[str] = None
    avatar_path: Optional[str] = Field(default=None, alias="avatarPath")
    platforms: Optional[List[PlatformTarget]] = None
    content_type: Optional[str] = Field(default=None, alias="contentType")
    target_audience: Optional[str] = Field(default=None, alias="targetAudience")
    language: Optional[str] = None
    tone: Optional[str] = None
    default_video_length_seconds: Optional[int] = Field(default=None, alias="defaultVideoLengthSeconds", ge=1, le=36000)
    voice_style: Optional[str] = Field(default=None, alias="voiceStyle")
    visual_style: Optional[str] = Field(default=None, alias="visualStyle")
    hook_style: Optional[str] = Field(default=None, alias="hookStyle")
    caption_style: Optional[str] = Field(default=None, alias="captionStyle")
    brand_colors: Optional[List[str]] = Field(default=None, alias="brandColors")
    competitors: Optional[List[str]] = None
    posting_goals: Optional[str] = Field(default=None, alias="postingGoals")
    analytics_connection_status: Optional[Dict[str, str]] = Field(default=None, alias="analyticsConnectionStatus")

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Profile name is required")
        return cleaned

    @field_validator("platforms")
    @classmethod
    def validate_platforms(cls, value: Optional[List[PlatformTarget]]) -> Optional[List[PlatformTarget]]:
        if value is None:
            return value
        if not value:
            raise ValueError("At least one platform is required")
        return list(dict.fromkeys(value))


class ContentProfile(ContentProfileFields):
    id: str
    is_archived: bool = Field(default=False, alias="isArchived")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")
    archived_at: Optional[str] = Field(default=None, alias="archivedAt")


class ContentProfileListResponse(ApiModel):
    profiles: List[ContentProfile]
