from typing import List, Literal, Optional

from pydantic import Field, field_validator

from backend.src.domain.models.content_profile import PlatformTarget
from backend.src.domain.models.generation import ApiModel


CaptionDesignEmphasis = Literal["balanced", "bold", "minimal"]


class CaptionDesignRequest(ApiModel):
    sample_text: str = Field(alias="sampleText")
    platform: Optional[PlatformTarget] = None
    emphasis: CaptionDesignEmphasis = "balanced"

    @field_validator("sample_text")
    @classmethod
    def validate_sample_text(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Sample text is required")
        return cleaned


class CaptionDesignPreset(ApiModel):
    name: str
    rationale: str
    font_family: str = Field(alias="fontFamily")
    font_size: int = Field(alias="fontSize")
    color: str
    accent_color: str = Field(alias="accentColor")
    bg_color: str = Field(alias="bgColor")
    bg_opacity: float = Field(alias="bgOpacity", ge=0, le=1)
    bold: bool
    align: Literal["left", "center", "right"]
    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)
    max_chars_per_line: int = Field(alias="maxCharsPerLine", ge=8, le=80)
    preview_lines: List[str] = Field(default_factory=list, alias="previewLines")
    estimated_readability_score: int = Field(alias="estimatedReadabilityScore", ge=0, le=100)
    notes: List[str] = Field(default_factory=list)


class CaptionDesignResponse(ApiModel):
    designs: List[CaptionDesignPreset]
