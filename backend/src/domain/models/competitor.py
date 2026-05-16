from typing import List, Literal, Optional

from pydantic import Field, field_validator

from backend.src.domain.models.content_profile import PlatformTarget
from backend.src.domain.models.generation import ApiModel


CompetitorContentStatus = Literal["active", "archived"]


class CompetitorContentFields(ApiModel):
    competitor_name: str = Field(alias="competitorName")
    platform: PlatformTarget
    title: str
    content_url: Optional[str] = Field(default=None, alias="contentUrl")
    published_at: Optional[str] = Field(default=None, alias="publishedAt")
    topic: str = ""
    hook: str = ""
    format: str = ""
    video_length_seconds: Optional[float] = Field(default=None, alias="videoLengthSeconds", ge=0)
    views: int = Field(default=0, ge=0)
    likes: int = Field(default=0, ge=0)
    comments: int = Field(default=0, ge=0)
    shares: int = Field(default=0, ge=0)
    notes: str = ""
    status: CompetitorContentStatus = "active"

    @field_validator("competitor_name", "title")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Competitor name and title are required")
        return cleaned


class CompetitorContentCreateRequest(CompetitorContentFields):
    pass


class CompetitorContentUpdateRequest(ApiModel):
    competitor_name: Optional[str] = Field(default=None, alias="competitorName")
    platform: Optional[PlatformTarget] = None
    title: Optional[str] = None
    content_url: Optional[str] = Field(default=None, alias="contentUrl")
    published_at: Optional[str] = Field(default=None, alias="publishedAt")
    topic: Optional[str] = None
    hook: Optional[str] = None
    format: Optional[str] = None
    video_length_seconds: Optional[float] = Field(default=None, alias="videoLengthSeconds", ge=0)
    views: Optional[int] = Field(default=None, ge=0)
    likes: Optional[int] = Field(default=None, ge=0)
    comments: Optional[int] = Field(default=None, ge=0)
    shares: Optional[int] = Field(default=None, ge=0)
    notes: Optional[str] = None
    status: Optional[CompetitorContentStatus] = None

    @field_validator("competitor_name", "title")
    @classmethod
    def validate_optional_required_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Competitor name and title are required")
        return cleaned


class CompetitorContent(CompetitorContentFields):
    id: str
    profile_id: str = Field(alias="profileId")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class CompetitorContentListResponse(ApiModel):
    items: List[CompetitorContent]


class CompetitorAnalysisSummary(ApiModel):
    competitor_count: int = Field(alias="competitorCount")
    content_count: int = Field(alias="contentCount")
    average_views: float = Field(alias="averageViews")
    average_engagement_rate: float = Field(alias="averageEngagementRate")
    top_competitor: Optional[str] = Field(default=None, alias="topCompetitor")
    top_topic: Optional[str] = Field(default=None, alias="topTopic")
    strongest_hook: Optional[str] = Field(default=None, alias="strongestHook")
    average_video_length_seconds: Optional[float] = Field(default=None, alias="averageVideoLengthSeconds")
    recommendations: List[str] = Field(default_factory=list)
