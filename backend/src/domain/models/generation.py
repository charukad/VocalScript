from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


ProviderName = Literal["meta", "grok"]
GeneratedMediaType = Literal["image", "video"]
StoryboardSceneStatus = Literal[
    "draft",
    "approved",
    "queued",
    "generating",
    "completed",
    "failed",
    "placeholder",
]
GenerationJobStatus = Literal[
    "queued",
    "running",
    "completed",
    "failed",
    "canceled",
    "manual_action_required",
]
ProviderRuntimeStatus = Literal[
    "needs_login",
    "ready",
    "submitting",
    "generating",
    "media_found",
    "failed",
    "manual_action_required",
]


class ApiModel(BaseModel):
    class Config:
        validate_by_name = True
        populate_by_name = True


class TranscriptSlice(ApiModel):
    start: float
    end: float
    text: str


class StoryboardScene(ApiModel):
    id: str
    start: float
    end: float
    transcript: str
    visual_type: GeneratedMediaType = Field(default="image", alias="visualType")
    prompt: str
    negative_prompt: str = Field(
        default="low quality, blurry, distorted, text artifacts, watermark",
        alias="negativePrompt",
    )
    style: str = "cinematic realistic"
    camera: str = "static"
    status: StoryboardSceneStatus = "draft"


class StoryboardRequest(ApiModel):
    transcript: str
    segments: List[TranscriptSlice] = Field(default_factory=list)
    preferred_visual_type: GeneratedMediaType = Field(default="image", alias="preferredVisualType")
    style: str = "cinematic realistic"
    provider: ProviderName = "meta"


class StoryboardResponse(ApiModel):
    scenes: List[StoryboardScene]
    provider: ProviderName = "meta"
    used_llm_mode: str = Field(default="rule_based", alias="usedLlmMode")


class GenerationJob(ApiModel):
    id: str
    scene_id: str = Field(alias="sceneId")
    provider: ProviderName = "meta"
    media_type: GeneratedMediaType = Field(default="image", alias="mediaType")
    prompt: str
    negative_prompt: str = Field(default="", alias="negativePrompt")
    status: GenerationJobStatus = "queued"
    result_url: Optional[str] = Field(default=None, alias="resultUrl")
    local_path: Optional[str] = Field(default=None, alias="localPath")
    error: Optional[str] = None
    metadata: Dict[str, str] = Field(default_factory=dict)


class BridgeWorkerRegistration(ApiModel):
    type: Literal["worker.ready"] = "worker.ready"
    worker_id: str = Field(alias="workerId")
    version: str
    providers: List[ProviderName]


class BridgeJobStart(ApiModel):
    type: Literal["job.start"] = "job.start"
    job: GenerationJob


class BridgeJobStatus(ApiModel):
    type: Literal["job.status"] = "job.status"
    job_id: str = Field(alias="jobId")
    status: ProviderRuntimeStatus
    message: Optional[str] = None


class BridgeJobResult(ApiModel):
    type: Literal["job.result"] = "job.result"
    job_id: str = Field(alias="jobId")
    media_url: str = Field(alias="mediaUrl")
    media_type: GeneratedMediaType = Field(alias="mediaType")
    metadata: Dict[str, str] = Field(default_factory=dict)
