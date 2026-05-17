from typing import List, Literal, Optional

from pydantic import Field, field_validator

from backend.src.domain.models.content_profile import PlatformTarget
from backend.src.domain.models.generation import ApiModel


SentimentLabel = Literal["positive", "neutral", "negative"]


class CommentAnalysisRequest(ApiModel):
    comments: List[str]
    platform: Optional[PlatformTarget] = None
    source_label: str = Field(default="", alias="sourceLabel")

    @field_validator("comments")
    @classmethod
    def validate_comments(cls, values: List[str]) -> List[str]:
        cleaned = [value.strip() for value in values if value and value.strip()]
        if not cleaned:
            raise ValueError("At least one comment is required")
        return cleaned


class CommentTheme(ApiModel):
    label: str
    count: int
    examples: List[str] = Field(default_factory=list)


class CommentAnalysisSummary(ApiModel):
    total_comments: int = Field(alias="totalComments")
    sentiment_counts: dict[str, int] = Field(alias="sentimentCounts")
    recurring_themes: List[CommentTheme] = Field(alias="recurringThemes")
    top_questions: List[str] = Field(alias="topQuestions")
    content_requests: List[str] = Field(alias="contentRequests")
    suggested_actions: List[str] = Field(alias="suggestedActions")


class CommentAnalysisRun(ApiModel):
    id: str
    profile_id: str = Field(alias="profileId")
    platform: Optional[PlatformTarget] = None
    source_label: str = Field(default="", alias="sourceLabel")
    comments: List[str]
    summary: CommentAnalysisSummary
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class CommentAnalysisRunListResponse(ApiModel):
    runs: List[CommentAnalysisRun]
