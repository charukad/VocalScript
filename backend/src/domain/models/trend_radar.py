from typing import List, Optional

from pydantic import Field, HttpUrl

from backend.src.domain.models.content_studio import ContentTrend
from backend.src.domain.models.generation import ApiModel


class TrendSourceDescriptor(ApiModel):
    key: str
    display_name: str = Field(alias="displayName")
    source_type: str = Field(alias="sourceType")
    requires_credentials: bool = Field(alias="requiresCredentials")
    status: str


class TrendSourceListResponse(ApiModel):
    sources: List[TrendSourceDescriptor]


class TrendRssImportRequest(ApiModel):
    feed_url: HttpUrl = Field(alias="feedUrl")
    source_name: str = Field(default="rss_feed", alias="sourceName")
    max_items: int = Field(default=8, alias="maxItems", ge=1, le=25)
    platform: Optional[str] = None


class TrendImportResult(ApiModel):
    provider: str
    imported_count: int = Field(alias="importedCount")
    skipped_count: int = Field(alias="skippedCount")
    trends: List[ContentTrend]
