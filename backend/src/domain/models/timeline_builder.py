from typing import List, Optional

from pydantic import Field

from backend.src.domain.models.generation import ApiModel, GeneratedMediaAsset, StoryboardScene


class TimelineDraftBuildRequest(ApiModel):
    scenes: List[StoryboardScene] = Field(default_factory=list)
    generated_media_assets: List[GeneratedMediaAsset] = Field(default_factory=list, alias="generatedMediaAssets")


class TimelineDraftAudioClip(ApiModel):
    narration_line_id: str = Field(alias="narrationLineId")
    source_job_id: Optional[str] = Field(default=None, alias="sourceJobId")
    audio_asset_id: Optional[str] = Field(default=None, alias="audioAssetId")
    text: str
    start: float
    end: float
    duration: float
    asset_available: bool = Field(default=False, alias="assetAvailable")


class TimelineDraftVisualClip(ApiModel):
    scene_id: str = Field(alias="sceneId")
    source_job_id: Optional[str] = Field(default=None, alias="sourceJobId")
    text: str
    start: float
    end: float
    duration: float
    asset_available: bool = Field(default=False, alias="assetAvailable")


class TimelineDraftCaptionClip(ApiModel):
    id: str
    source_line_id: str = Field(alias="sourceLineId")
    text: str
    start: float
    end: float
    duration: float


class TimelineDraft(ApiModel):
    script_id: str = Field(alias="scriptId")
    estimated_duration_seconds: float = Field(alias="estimatedDurationSeconds")
    audio_clips: List[TimelineDraftAudioClip] = Field(default_factory=list, alias="audioClips")
    visual_clips: List[TimelineDraftVisualClip] = Field(default_factory=list, alias="visualClips")
    caption_clips: List[TimelineDraftCaptionClip] = Field(default_factory=list, alias="captionClips")
    warnings: List[str] = Field(default_factory=list)
