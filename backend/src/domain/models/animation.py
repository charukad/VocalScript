from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from backend.src.domain.models.generation import (
    GenerationAspectRatio,
    ProviderName,
    StoryboardMotionIntensity,
    StoryboardPromptDetail,
    StoryboardSceneDensity,
    TranscriptSlice,
)


AnimationAssetType = Literal["character", "background", "prop", "icon", "overlay", "text"]
AnimationAssetStatus = Literal["available", "missing", "queued", "generated", "failed"]
AnimationReuseDecision = Literal["reuse", "generate", "optional"]
AnimationSceneStatus = Literal["draft", "approved", "queued", "completed", "failed"]
AnimationLayerType = Literal["background", "character", "prop", "icon", "overlay", "text", "caption", "placeholder"]
AnimationCharacterPose = Literal["neutral", "talking", "pointing", "thinking", "happy", "concerned"]
AnimationExpression = Literal["neutral", "smile", "focus", "surprise", "concern", "excited"]
AnimationMouthCue = Literal["closed", "open", "wide", "smile"]
AnimationLayoutTemplate = Literal["auto", "explainer_split", "center_focus", "lower_third", "portrait_stack", "square_card"]
AnimationCaptionTemplate = Literal["clean_subtitle", "keyword_pop", "karaoke_highlight", "headline_burst"]
AnimationMotionPreset = Literal[
    "none",
    "fade",
    "slide",
    "pop",
    "zoom",
    "pan",
    "float",
    "bounce",
    "caption_highlight",
    "push_in",
    "pull_out",
    "parallax",
    "talking_bob",
    "hand_wave",
    "point",
    "walk_cycle",
]


class ApiModel(BaseModel):
    class Config:
        validate_by_name = True
        populate_by_name = True


class AnimationAssetMemoryItem(ApiModel):
    id: str
    name: str
    asset_type: AnimationAssetType = Field(alias="assetType")
    media_asset_id: Optional[str] = Field(default=None, alias="mediaAssetId")
    source_url: Optional[str] = Field(default=None, alias="sourceUrl")
    local_path: Optional[str] = Field(default=None, alias="localPath")
    prompt: str = ""
    style: str = ""
    tags: List[str] = Field(default_factory=list)
    status: AnimationAssetStatus = "available"
    metadata: Dict[str, str] = Field(default_factory=dict)


class AnimationAssetNeed(ApiModel):
    id: str
    name: str
    asset_type: AnimationAssetType = Field(alias="assetType")
    description: str
    prompt: str
    negative_prompt: str = Field(
        default="low quality, blurry, distorted, watermark, readable text",
        alias="negativePrompt",
    )
    style: str
    tags: List[str] = Field(default_factory=list)
    reuse_decision: AnimationReuseDecision = Field(default="generate", alias="reuseDecision")
    status: AnimationAssetStatus = "missing"
    matched_asset_id: Optional[str] = Field(default=None, alias="matchedAssetId")
    optional: bool = False


class AnimationMotion(ApiModel):
    preset: AnimationMotionPreset = "none"
    direction: str = ""
    intensity: StoryboardMotionIntensity = "balanced"
    note: str = ""


class AnimationLayer(ApiModel):
    id: str
    scene_id: str = Field(alias="sceneId")
    layer_type: AnimationLayerType = Field(alias="layerType")
    asset_need_id: Optional[str] = Field(default=None, alias="assetNeedId")
    text: str = ""
    start: float
    end: float
    order: int = 0
    x: float = 50.0
    y: float = 50.0
    scale: float = 100.0
    opacity: float = 100.0
    motion: AnimationMotion = Field(default_factory=AnimationMotion)


class AnimationCharacterCue(ApiModel):
    asset_need_id: Optional[str] = Field(default=None, alias="assetNeedId")
    pose_asset_need_id: Optional[str] = Field(default=None, alias="poseAssetNeedId")
    pose: AnimationCharacterPose = "talking"
    expression: AnimationExpression = "neutral"
    mouth_cue: AnimationMouthCue = Field(default="open", alias="mouthCue")
    note: str = ""


class AnimationLayoutCue(ApiModel):
    template: AnimationLayoutTemplate = "explainer_split"
    safe_area: Dict[str, float] = Field(default_factory=dict, alias="safeArea")
    note: str = ""


class AnimationCaptionCue(ApiModel):
    template: AnimationCaptionTemplate = "keyword_pop"
    keywords: List[str] = Field(default_factory=list)
    note: str = ""


class AnimationCameraCue(ApiModel):
    preset: AnimationMotionPreset = "push_in"
    direction: str = "center"
    note: str = ""


class AnimationSceneCue(ApiModel):
    character: AnimationCharacterCue = Field(default_factory=AnimationCharacterCue)
    layout: AnimationLayoutCue = Field(default_factory=AnimationLayoutCue)
    caption: AnimationCaptionCue = Field(default_factory=AnimationCaptionCue)
    camera: AnimationCameraCue = Field(default_factory=AnimationCameraCue)
    transcript_triggers: List[str] = Field(default_factory=list, alias="transcriptTriggers")


class AnimationScene(ApiModel):
    id: str
    start: float
    end: float
    transcript: str
    summary: str
    direction: str = ""
    status: AnimationSceneStatus = "draft"
    layers: List[AnimationLayer] = Field(default_factory=list)
    cue: AnimationSceneCue = Field(default_factory=AnimationSceneCue)


class AnimationPlanRequest(ApiModel):
    transcript: str
    segments: List[TranscriptSlice] = Field(default_factory=list)
    available_assets: List[AnimationAssetMemoryItem] = Field(default_factory=list, alias="availableAssets")
    style: str = "animated explainer"
    aspect_ratio: GenerationAspectRatio = Field(default="16:9", alias="aspectRatio")
    scene_density: StoryboardSceneDensity = Field(default="medium", alias="sceneDensity")
    motion_intensity: StoryboardMotionIntensity = Field(default="balanced", alias="motionIntensity")
    prompt_detail: StoryboardPromptDetail = Field(default="balanced", alias="promptDetail")
    layout_template: AnimationLayoutTemplate = Field(default="auto", alias="layoutTemplate")
    caption_template: AnimationCaptionTemplate = Field(default="keyword_pop", alias="captionTemplate")
    provider: ProviderName = "meta"


class AnimationPlan(ApiModel):
    id: str
    style: str
    aspect_ratio: GenerationAspectRatio = Field(alias="aspectRatio")
    scenes: List[AnimationScene]
    asset_needs: List[AnimationAssetNeed] = Field(alias="assetNeeds")
    warnings: List[str] = Field(default_factory=list)
    used_llm_mode: str = Field(default="rule_based", alias="usedLlmMode")
    transcript: str = ""
    segments: List[TranscriptSlice] = Field(default_factory=list)
    duration: float = 0.0
    renderer_recommendation: str = Field(
        default="existing_timeline_v1_remotion_candidate",
        alias="rendererRecommendation",
    )
    renderer_notes: List[str] = Field(default_factory=list, alias="rendererNotes")


class AnimationAssetJobCreateRequest(ApiModel):
    asset_needs: List[AnimationAssetNeed] = Field(alias="assetNeeds")
    provider: ProviderName = "meta"
    aspect_ratio: GenerationAspectRatio = Field(default="16:9", alias="aspectRatio")
    batch_id: Optional[str] = Field(default=None, alias="batchId")
    project_id: Optional[str] = Field(default=None, alias="projectId")
    project_name: Optional[str] = Field(default=None, alias="projectName")
