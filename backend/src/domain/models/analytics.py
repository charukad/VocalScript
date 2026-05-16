from typing import Any, Dict, List, Literal, Optional

from pydantic import Field, field_validator

from backend.src.domain.models.content_profile import PlatformTarget
from backend.src.domain.models.generation import ApiModel


AnalyticsConnectionStatus = Literal["not_connected", "manual_only", "connected", "error"]


class AnalyticsAccount(ApiModel):
    id: str
    platform: PlatformTarget
    external_account_id: Optional[str] = Field(default=None, alias="externalAccountId")
    display_name: str = Field(default="", alias="displayName")
    token_reference: Optional[str] = Field(default=None, alias="tokenReference")
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class AnalyticsConnection(ApiModel):
    id: str
    profile_id: str = Field(alias="profileId")
    platform: PlatformTarget
    account_id: Optional[str] = Field(default=None, alias="accountId")
    status: AnalyticsConnectionStatus = "not_connected"
    external_account_id: Optional[str] = Field(default=None, alias="externalAccountId")
    display_name: str = Field(default="", alias="displayName")
    scopes: List[str] = Field(default_factory=list)
    token_reference: Optional[str] = Field(default=None, alias="tokenReference")
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class AnalyticsConnectionUpdateRequest(ApiModel):
    status: AnalyticsConnectionStatus = "manual_only"
    external_account_id: Optional[str] = Field(default=None, alias="externalAccountId")
    display_name: str = Field(default="", alias="displayName")
    scopes: List[str] = Field(default_factory=list)
    token_reference: Optional[str] = Field(default=None, alias="tokenReference")
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AnalyticsConnectionListResponse(ApiModel):
    connections: List[AnalyticsConnection]


class AnalyticsMetrics(ApiModel):
    views: int = Field(default=0, ge=0)
    impressions: int = Field(default=0, ge=0)
    ctr: float = Field(default=0.0, ge=0)
    average_view_duration_seconds: float = Field(default=0.0, alias="averageViewDurationSeconds", ge=0)
    audience_retention_percent: float = Field(default=0.0, alias="audienceRetentionPercent", ge=0)
    watch_time_minutes: float = Field(default=0.0, alias="watchTimeMinutes", ge=0)
    likes: int = Field(default=0, ge=0)
    comments: int = Field(default=0, ge=0)
    shares: int = Field(default=0, ge=0)
    followers_gained: int = Field(default=0, alias="followersGained")


class ContentPerformanceFields(ApiModel):
    platform: PlatformTarget
    project_id: Optional[str] = Field(default=None, alias="projectId")
    external_content_id: Optional[str] = Field(default=None, alias="externalContentId")
    title: str
    published_at: Optional[str] = Field(default=None, alias="publishedAt")
    posting_time: Optional[str] = Field(default=None, alias="postingTime")
    video_length_seconds: Optional[float] = Field(default=None, alias="videoLengthSeconds", ge=0)
    hook_type: str = Field(default="", alias="hookType")
    caption_style: str = Field(default="", alias="captionStyle")
    voice_style: str = Field(default="", alias="voiceStyle")
    visual_style: str = Field(default="", alias="visualStyle")
    traffic_source: str = Field(default="", alias="trafficSource")
    metrics: AnalyticsMetrics = Field(default_factory=AnalyticsMetrics)
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Performance title is required")
        return cleaned


class ManualPerformanceImportRequest(ContentPerformanceFields):
    pass


class ContentPerformance(ContentPerformanceFields):
    id: str
    profile_id: str = Field(alias="profileId")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class ContentPerformanceListResponse(ApiModel):
    performance: List[ContentPerformance]


class AnalyticsSnapshot(ApiModel):
    id: str
    profile_id: str = Field(alias="profileId")
    project_id: Optional[str] = Field(default=None, alias="projectId")
    platform: PlatformTarget
    external_content_id: Optional[str] = Field(default=None, alias="externalContentId")
    captured_at: str = Field(alias="capturedAt")
    metrics: AnalyticsMetrics = Field(default_factory=AnalyticsMetrics)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class ProfileLearning(ApiModel):
    id: str
    profile_id: str = Field(alias="profileId")
    learning_type: str = Field(alias="learningType")
    summary: str
    data: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class ProfileLearningListResponse(ApiModel):
    learnings: List[ProfileLearning]


class ContentPerformanceRule(ApiModel):
    id: str
    profile_id: str = Field(alias="profileId")
    rule_key: str = Field(alias="ruleKey")
    rule_json: Dict[str, Any] = Field(default_factory=dict, alias="ruleJson")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")
