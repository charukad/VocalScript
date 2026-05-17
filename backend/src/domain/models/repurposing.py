from typing import List, Optional

from pydantic import Field, field_validator

from backend.src.domain.models.content_profile import PlatformTarget
from backend.src.domain.models.generation import ApiModel


class RepurposeRequest(ApiModel):
    source_title: str = Field(default="", alias="sourceTitle")
    transcript: str
    platform: Optional[PlatformTarget] = None
    target_duration_seconds: int = Field(default=45, alias="targetDurationSeconds", ge=10, le=180)
    max_candidates: int = Field(default=5, alias="maxCandidates", ge=1, le=12)

    @field_validator("transcript")
    @classmethod
    def validate_transcript(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Transcript is required")
        return cleaned


class RepurposeCandidate(ApiModel):
    title: str
    hook: str
    excerpt: str
    start_sentence: int = Field(alias="startSentence")
    end_sentence: int = Field(alias="endSentence")
    estimated_duration_seconds: int = Field(alias="estimatedDurationSeconds")
    reason: str


class RepurposeResponse(ApiModel):
    candidates: List[RepurposeCandidate]
