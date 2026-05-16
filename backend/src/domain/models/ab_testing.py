from typing import List, Literal, Optional

from pydantic import Field, field_validator

from backend.src.domain.models.analytics import AnalyticsMetrics
from backend.src.domain.models.content_profile import PlatformTarget
from backend.src.domain.models.generation import ApiModel


ExperimentStatus = Literal["planned", "running", "completed", "archived"]


class ExperimentVariant(ApiModel):
    label: str
    title: str
    thumbnail_concept: str = Field(default="", alias="thumbnailConcept")
    caption_preset: str = Field(default="", alias="captionPreset")
    notes: str = ""
    metrics: AnalyticsMetrics = Field(default_factory=AnalyticsMetrics)

    @field_validator("label", "title")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Variant label and title are required")
        return cleaned


class ExperimentFields(ApiModel):
    name: str
    hypothesis: str = ""
    platform: Optional[PlatformTarget] = None
    script_id: Optional[str] = Field(default=None, alias="scriptId")
    project_id: Optional[str] = Field(default=None, alias="projectId")
    variant_a: ExperimentVariant = Field(alias="variantA")
    variant_b: ExperimentVariant = Field(alias="variantB")
    winner_label: Optional[str] = Field(default=None, alias="winnerLabel")
    status: ExperimentStatus = "planned"
    notes: str = ""

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Experiment name is required")
        return cleaned


class ExperimentCreateRequest(ExperimentFields):
    pass


class ExperimentUpdateRequest(ApiModel):
    name: Optional[str] = None
    hypothesis: Optional[str] = None
    platform: Optional[PlatformTarget] = None
    script_id: Optional[str] = Field(default=None, alias="scriptId")
    project_id: Optional[str] = Field(default=None, alias="projectId")
    variant_a: Optional[ExperimentVariant] = Field(default=None, alias="variantA")
    variant_b: Optional[ExperimentVariant] = Field(default=None, alias="variantB")
    winner_label: Optional[str] = Field(default=None, alias="winnerLabel")
    status: Optional[ExperimentStatus] = None
    notes: Optional[str] = None

    @field_validator("name")
    @classmethod
    def validate_optional_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Experiment name is required")
        return cleaned


class Experiment(ExperimentFields):
    id: str
    profile_id: str = Field(alias="profileId")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class ExperimentListResponse(ApiModel):
    experiments: List[Experiment]
