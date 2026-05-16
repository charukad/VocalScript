from typing import List, Optional

from pydantic import Field, field_validator

from backend.src.domain.models.content_profile import PlatformTarget
from backend.src.domain.models.generation import ApiModel
from backend.src.domain.models.viral import ViralPotentialScore


class PackagingGenerationRequest(ApiModel):
    script: str
    current_title: str = Field(default="", alias="currentTitle")
    topic: str = ""
    platform: Optional[PlatformTarget] = None

    @field_validator("script")
    @classmethod
    def validate_script(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Script is required")
        return cleaned


class TitleCandidate(ApiModel):
    title: str
    rationale: str
    estimated_viral_potential: ViralPotentialScore = Field(alias="estimatedViralPotential")


class ThumbnailConcept(ApiModel):
    headline: str
    visual_prompt: str = Field(alias="visualPrompt")
    composition: str
    emotion: str
    rationale: str


class PackagingGenerationResponse(ApiModel):
    titles: List[TitleCandidate]
    thumbnail_concepts: List[ThumbnailConcept] = Field(alias="thumbnailConcepts")
    used_llm_mode: str = Field(alias="usedLlmMode", default="rule_based")
