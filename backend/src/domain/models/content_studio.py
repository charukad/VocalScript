from typing import Any, Dict, List, Literal, Optional

from pydantic import Field, field_validator

from backend.src.domain.models.content_profile import PlatformTarget
from backend.src.domain.models.generation import ApiModel


IdeaStatus = Literal["draft", "selected", "converted_to_script", "archived"]
NarrationLineStatus = Literal["pending", "generating", "done", "failed"]
ScriptStatus = Literal["draft", "final", "archived"]


class ContentIdeaFields(ApiModel):
    title: str
    topic: str = ""
    platform: Optional[PlatformTarget] = None
    hook: str = ""
    estimated_viral_score: Optional[int] = Field(default=None, alias="estimatedViralScore", ge=0, le=100)
    reason_it_may_work: str = Field(default="", alias="reasonItMayWork")
    difficulty: str = ""
    target_duration_seconds: Optional[int] = Field(default=None, alias="targetDurationSeconds", ge=1, le=36000)
    suggested_visual_style: str = Field(default="", alias="suggestedVisualStyle")
    status: IdeaStatus = "draft"

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Idea title is required")
        return cleaned


class ContentIdeaCreateRequest(ContentIdeaFields):
    pass


class ContentIdeaUpdateRequest(ApiModel):
    title: Optional[str] = None
    topic: Optional[str] = None
    platform: Optional[PlatformTarget] = None
    hook: Optional[str] = None
    estimated_viral_score: Optional[int] = Field(default=None, alias="estimatedViralScore", ge=0, le=100)
    reason_it_may_work: Optional[str] = Field(default=None, alias="reasonItMayWork")
    difficulty: Optional[str] = None
    target_duration_seconds: Optional[int] = Field(default=None, alias="targetDurationSeconds", ge=1, le=36000)
    suggested_visual_style: Optional[str] = Field(default=None, alias="suggestedVisualStyle")
    status: Optional[IdeaStatus] = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Idea title is required")
        return cleaned


class ContentIdea(ContentIdeaFields):
    id: str
    profile_id: str = Field(alias="profileId")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class ContentIdeaListResponse(ApiModel):
    ideas: List[ContentIdea]


class ScriptFields(ApiModel):
    title: str
    content: str = ""
    idea_id: Optional[str] = Field(default=None, alias="ideaId")
    final_version_id: Optional[str] = Field(default=None, alias="finalVersionId")
    status: ScriptStatus = "draft"

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Script title is required")
        return cleaned


class ScriptCreateRequest(ScriptFields):
    pass


class ScriptUpdateRequest(ApiModel):
    title: Optional[str] = None
    content: Optional[str] = None
    idea_id: Optional[str] = Field(default=None, alias="ideaId")
    final_version_id: Optional[str] = Field(default=None, alias="finalVersionId")
    status: Optional[ScriptStatus] = None
    latest_analysis: Optional[Dict[str, Any]] = Field(default=None, alias="latestAnalysis")

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Script title is required")
        return cleaned


class Script(ApiModel):
    id: str
    profile_id: str = Field(alias="profileId")
    title: str
    content: str = ""
    idea_id: Optional[str] = Field(default=None, alias="ideaId")
    final_version_id: Optional[str] = Field(default=None, alias="finalVersionId")
    status: ScriptStatus = "draft"
    latest_analysis: Optional[Dict[str, Any]] = Field(default=None, alias="latestAnalysis")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class ScriptListResponse(ApiModel):
    scripts: List[Script]


class ScriptVersionCreateRequest(ApiModel):
    label: str = "Version"
    content: str
    select_as_final: bool = Field(default=False, alias="selectAsFinal")

    @field_validator("label")
    @classmethod
    def validate_label(cls, value: str) -> str:
        return value.strip() or "Version"

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Version content is required")
        return cleaned


class ScriptVersion(ApiModel):
    id: str
    script_id: str = Field(alias="scriptId")
    label: str
    content: str
    is_selected: bool = Field(default=False, alias="isSelected")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class NarrationLine(ApiModel):
    id: str
    script_id: str = Field(alias="scriptId")
    scene_id: Optional[str] = Field(default=None, alias="sceneId")
    index: int
    text: str
    voice_style: Optional[str] = Field(default=None, alias="voiceStyle")
    emotion: Optional[str] = None
    speed: Optional[str] = None
    pause_after_seconds: Optional[float] = Field(default=None, alias="pauseAfterSeconds")
    audio_asset_id: Optional[str] = Field(default=None, alias="audioAssetId")
    duration_seconds: Optional[float] = Field(default=None, alias="durationSeconds")
    status: NarrationLineStatus = "pending"
    error: Optional[str] = None
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class NarrationLineCreateRequest(ApiModel):
    text: str
    scene_id: Optional[str] = Field(default=None, alias="sceneId")
    index: Optional[int] = None
    voice_style: Optional[str] = Field(default=None, alias="voiceStyle")
    emotion: Optional[str] = None
    speed: Optional[str] = None
    pause_after_seconds: Optional[float] = Field(default=None, alias="pauseAfterSeconds")

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Narration line text is required")
        return cleaned


class NarrationLineUpdateRequest(ApiModel):
    text: Optional[str] = None
    scene_id: Optional[str] = Field(default=None, alias="sceneId")
    index: Optional[int] = None
    voice_style: Optional[str] = Field(default=None, alias="voiceStyle")
    emotion: Optional[str] = None
    speed: Optional[str] = None
    pause_after_seconds: Optional[float] = Field(default=None, alias="pauseAfterSeconds")
    audio_asset_id: Optional[str] = Field(default=None, alias="audioAssetId")
    duration_seconds: Optional[float] = Field(default=None, alias="durationSeconds")
    status: Optional[NarrationLineStatus] = None
    error: Optional[str] = None

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Narration line text is required")
        return cleaned


class ScriptSplitLinesRequest(ApiModel):
    text: Optional[str] = None


class NarrationLineListResponse(ApiModel):
    lines: List[NarrationLine]


class ScriptDetail(Script):
    versions: List[ScriptVersion] = Field(default_factory=list)
    narration_lines: List[NarrationLine] = Field(default_factory=list, alias="narrationLines")
