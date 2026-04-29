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
BridgeConnectionStatus = Literal["connected", "disconnected"]


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
    transcript: str = ""
    segments: List[TranscriptSlice] = Field(default_factory=list)
    duration: float = 0.0


class GenerationJob(ApiModel):
    id: str
    batch_id: str = Field(alias="batchId")
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


class GenerationJobCreateRequest(ApiModel):
    scenes: List[StoryboardScene]
    provider: ProviderName = "meta"
    batch_id: Optional[str] = Field(default=None, alias="batchId")


class GenerationJobListResponse(ApiModel):
    jobs: List[GenerationJob]
    batch_id: Optional[str] = Field(default=None, alias="batchId")


class GeneratedMediaAsset(ApiModel):
    job_id: str = Field(alias="jobId")
    batch_id: str = Field(alias="batchId")
    scene_id: str = Field(alias="sceneId")
    provider: ProviderName = "meta"
    media_type: GeneratedMediaType = Field(alias="mediaType")
    status: GenerationJobStatus
    result_url: Optional[str] = Field(default=None, alias="resultUrl")
    local_path: Optional[str] = Field(default=None, alias="localPath")
    prompt: str
    negative_prompt: str = Field(default="", alias="negativePrompt")
    start: float = 0.0
    end: float = 5.0
    duration: float = 5.0
    transcript: str = ""
    error: Optional[str] = None
    metadata: Dict[str, str] = Field(default_factory=dict)


class GeneratedMediaListResponse(ApiModel):
    assets: List[GeneratedMediaAsset]
    batch_id: Optional[str] = Field(default=None, alias="batchId")


class GenerationJobStatusUpdate(ApiModel):
    status: GenerationJobStatus
    error: Optional[str] = None
    metadata: Dict[str, str] = Field(default_factory=dict)


class GenerationJobClaimRequest(ApiModel):
    provider: Optional[ProviderName] = None
    worker_id: Optional[str] = Field(default=None, alias="workerId")


class GenerationJobResultRequest(ApiModel):
    media_url: str = Field(alias="mediaUrl")
    media_type: Optional[GeneratedMediaType] = Field(default=None, alias="mediaType")
    metadata: Dict[str, str] = Field(default_factory=dict)


class GenerationJobRemoteStoreRequest(ApiModel):
    media_url: Optional[str] = Field(default=None, alias="mediaUrl")
    media_type: Optional[GeneratedMediaType] = Field(default=None, alias="mediaType")
    metadata: Dict[str, str] = Field(default_factory=dict)


class BridgeWorkerRegistration(ApiModel):
    type: Literal["worker.ready"] = "worker.ready"
    worker_id: str = Field(alias="workerId")
    version: str
    providers: List[ProviderName]


class BridgeWorkerSnapshot(ApiModel):
    worker_id: str = Field(alias="workerId")
    version: str
    providers: List[ProviderName]
    status: BridgeConnectionStatus
    connected_at: str = Field(alias="connectedAt")
    last_seen_at: str = Field(alias="lastSeenAt")


class BridgeStatusResponse(ApiModel):
    workers: List[BridgeWorkerSnapshot]


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
