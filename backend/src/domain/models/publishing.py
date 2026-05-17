from typing import Any, Dict, List, Literal, Optional

from pydantic import Field, field_validator

from backend.src.domain.models.content_profile import PlatformTarget
from backend.src.domain.models.generation import ApiModel


PublishingDestinationStatus = Literal["not_connected", "manual_only", "connected", "error"]
PublishJobStatus = Literal["draft", "scheduled", "ready", "dispatched", "published", "failed", "archived"]


class PublishingProviderDescriptor(ApiModel):
    key: str
    display_name: str = Field(alias="displayName")
    supports_oauth: bool = Field(alias="supportsOauth")
    supports_live_publish: bool = Field(alias="supportsLivePublish")
    supports_scheduling: bool = Field(alias="supportsScheduling")
    status: str
    ready_for_oauth: bool = Field(default=False, alias="readyForOauth")
    configuration_issues: List[str] = Field(default_factory=list, alias="configurationIssues")


class PublishingProviderListResponse(ApiModel):
    providers: List[PublishingProviderDescriptor]


class PublishingDestination(ApiModel):
    id: str
    profile_id: str = Field(alias="profileId")
    platform: PlatformTarget
    status: PublishingDestinationStatus = "not_connected"
    external_account_id: Optional[str] = Field(default=None, alias="externalAccountId")
    display_name: str = Field(default="", alias="displayName")
    token_reference: Optional[str] = Field(default=None, alias="tokenReference")
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class PublishingDestinationUpdateRequest(ApiModel):
    status: PublishingDestinationStatus = "manual_only"
    external_account_id: Optional[str] = Field(default=None, alias="externalAccountId")
    display_name: str = Field(default="", alias="displayName")
    token_reference: Optional[str] = Field(default=None, alias="tokenReference")
    metadata: Dict[str, Any] = Field(default_factory=dict)


class PublishingDestinationListResponse(ApiModel):
    destinations: List[PublishingDestination]


class PublishingPackageRequest(ApiModel):
    script: str
    title: str = ""
    topic: str = ""
    platform: Optional[PlatformTarget] = None

    @field_validator("script")
    @classmethod
    def validate_script(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Script is required")
        return cleaned


class PublishingPackage(ApiModel):
    title: str
    description: str
    post_copy: str = Field(alias="postCopy")
    hashtags: List[str]
    call_to_action: str = Field(alias="callToAction")
    platform_notes: List[str] = Field(alias="platformNotes")


class PublishJobFields(ApiModel):
    platform: PlatformTarget
    title: str
    package: PublishingPackage
    scheduled_at: Optional[str] = Field(default=None, alias="scheduledAt")
    calendar_item_id: Optional[str] = Field(default=None, alias="calendarItemId")
    project_id: Optional[str] = Field(default=None, alias="projectId")
    status: PublishJobStatus = "draft"
    external_post_id: Optional[str] = Field(default=None, alias="externalPostId")
    provider_status: str = Field(default="placeholder", alias="providerStatus")
    error: Optional[str] = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Publish job title is required")
        return cleaned


class PublishJobCreateRequest(PublishJobFields):
    pass


class PublishJobUpdateRequest(ApiModel):
    platform: Optional[PlatformTarget] = None
    title: Optional[str] = None
    package: Optional[PublishingPackage] = None
    scheduled_at: Optional[str] = Field(default=None, alias="scheduledAt")
    calendar_item_id: Optional[str] = Field(default=None, alias="calendarItemId")
    project_id: Optional[str] = Field(default=None, alias="projectId")
    status: Optional[PublishJobStatus] = None
    external_post_id: Optional[str] = Field(default=None, alias="externalPostId")
    provider_status: Optional[str] = Field(default=None, alias="providerStatus")
    error: Optional[str] = None


class PublishJob(PublishJobFields):
    id: str
    profile_id: str = Field(alias="profileId")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class PublishJobListResponse(ApiModel):
    jobs: List[PublishJob]
