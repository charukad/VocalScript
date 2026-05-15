from typing import List, Optional

from pydantic import Field, field_validator

from backend.src.domain.models.content_profile import PlatformTarget
from backend.src.domain.models.generation import ApiModel


class ViralPotentialScore(ApiModel):
    total: int = Field(ge=0, le=100)
    hook: int = Field(ge=0, le=20)
    retention: int = Field(ge=0, le=20)
    clarity: int = Field(ge=0, le=20)
    emotion: int = Field(ge=0, le=15)
    shareability: int = Field(ge=0, le=15)
    platform_fit: int = Field(alias="platformFit", ge=0, le=10)
    notes: List[str] = Field(default_factory=list)


class ScriptAnalysisRequest(ApiModel):
    script: str
    platform: Optional[PlatformTarget] = None
    target_duration_seconds: Optional[int] = Field(default=None, alias="targetDurationSeconds", ge=1, le=36000)

    @field_validator("script")
    @classmethod
    def validate_script(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Script is required")
        return cleaned


class ScriptAnalysisResponse(ApiModel):
    estimated_viral_potential: ViralPotentialScore = Field(alias="estimatedViralPotential")
    hook_strength: str = Field(alias="hookStrength")
    retention_risk: str = Field(alias="retentionRisk")
    clarity: str
    pacing: str
    curiosity_gap: str = Field(alias="curiosityGap")
    emotional_pull: str = Field(alias="emotionalPull")
    shareability: str
    call_to_action: str = Field(alias="callToAction")
    platform_fit: str = Field(alias="platformFit")
    estimated_duration_seconds: int = Field(alias="estimatedDurationSeconds")
    improvements: List[str]
    used_llm_mode: str = Field(alias="usedLlmMode", default="rule_based")


class ScriptRewriteRequest(ScriptAnalysisRequest):
    goal: str = "Improve retention, clarity, and shareability without changing the core message."


class ScriptRewriteResponse(ApiModel):
    rewritten_script: str = Field(alias="rewrittenScript")
    rationale: List[str]
    analysis: ScriptAnalysisResponse
    used_llm_mode: str = Field(alias="usedLlmMode", default="rule_based")


class IdeaScoreRequest(ApiModel):
    title: str
    hook: str = ""
    topic: str = ""
    platform: Optional[PlatformTarget] = None


class HookScoreRequest(ApiModel):
    hook: str
    platform: Optional[PlatformTarget] = None

    @field_validator("hook")
    @classmethod
    def validate_hook(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Hook is required")
        return cleaned
