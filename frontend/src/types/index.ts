export type MediaType = 'audio' | 'visual' | 'text';

export type MediaAsset = {
  id: string;
  file: File;
  type: MediaType;
  mediaKind: 'audio' | 'video' | 'image';
  duration?: number;
  thumbnailUrl?: string;
  waveform?: number[];
  filmstrip?: string[];
  sourceUrl?: string | null;
  localPath?: string | null;
};

export type TimelineTrack = {
  id: string;
  name: string;
  type: MediaType;
  order: number;
  muted?: boolean;
  solo?: boolean;
  locked?: boolean;
};

export type TextData = {
  content: string;
  fontFamily: string;
  fontSize: number;     // px
  color: string;        // hex
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  x: number;            // % from left (0–100)
  y: number;            // % from top (0–100)
  bgColor: string;      // hex with opacity
  bgOpacity: number;    // 0–1
};

export type KeyframeProperty = 'scale' | 'rotation' | 'opacity' | 'volume';

export type Keyframe = {
  id: string;
  property: KeyframeProperty;
  time: number;         // seconds from clip start
  value: number;
  easing: 'linear';
};

export type TimelineClip = {
  id: string;
  assetId: string;
  trackId: string;
  file: File;
  type: MediaType;
  duration: number;
  startTime: number;
  mediaOffset: number;
  transform?: {
    scale: number;
    rotation: number;
    opacity?: number;
    flipX: boolean;
    flipY: boolean;
  };
  color?: {
    brightness: number;
    contrast: number;
    saturation: number;
    exposure: number;
    temperature: number;
  };
  audio?: {
    volume: number;
    mute: boolean;
    fadeIn: number;
    fadeOut: number;
  };
  textData?: TextData;
  keyframes?: Keyframe[];
  generation?: {
    jobId: string;
    batchId: string;
    projectId?: string | null;
    sceneId: string;
    provider: ProviderName;
    mediaType?: GeneratedMediaType;
    status: GenerationJobStatus;
    resultUrl?: string | null;
    resultVariants?: GenerationMediaVariant[];
    localPath?: string | null;
    prompt: string;
    negativePrompt?: string;
    start?: number;
    end?: number;
    duration?: number;
    transcript: string;
    error?: string | null;
    metadata?: Record<string, string>;
  };
  animation?: {
    planId: string;
    sceneId: string;
    layerId: string;
    assetNeedId?: string | null;
    assetType?: AnimationAssetType | null;
    source: 'auto_animate';
    motionPreset?: AnimationMotionPreset;
    layoutTemplate?: AnimationLayoutTemplate;
    captionTemplate?: AnimationCaptionTemplate;
    characterPose?: AnimationCharacterPose;
    expression?: AnimationExpression;
    x?: number;
    y?: number;
    order?: number;
    note?: string;
  };
};

export type ExportSettings = {
  resolution: '720p' | '1080p' | '4k';
  aspectRatio: '16:9' | '9:16' | '1:1';
  quality: 'high' | 'standard' | 'compressed';
  format: 'video' | 'audio';
};

export type CaptionSegment = {
  id: string;
  index: number;
  start: number;
  end: number;
  text: string;
};

export type ProviderName = 'meta' | 'grok';

export type GeneratedMediaType = 'image' | 'video';
export type GenerationAspectRatio = '16:9' | '9:16' | '1:1' | '4:5';
export type StoryboardSceneDensity = 'low' | 'medium' | 'high' | 'extra_high';
export type StoryboardMotionIntensity = 'subtle' | 'balanced' | 'dynamic';
export type StoryboardPromptDetail = 'simple' | 'balanced' | 'detailed';
export type StoryboardTimeRangeMode = 'source' | 'custom';

export type StoryboardSceneStatus =
  | 'draft'
  | 'approved'
  | 'queued'
  | 'generating'
  | 'completed'
  | 'failed'
  | 'placeholder';

export type TranscriptSlice = {
  start: number;
  end: number;
  text: string;
};

export type StoryboardScene = {
  id: string;
  start: number;
  end: number;
  transcript: string;
  visualType: GeneratedMediaType;
  prompt: string;
  negativePrompt: string;
  style: string;
  camera: string;
  status: StoryboardSceneStatus;
};

export type StoryboardSettings = {
  sourceMediaId: string | null;
  provider: ProviderName;
  visualType: GeneratedMediaType;
  videoMixPercent: number;
  aspectRatio: GenerationAspectRatio;
  sceneDensity: StoryboardSceneDensity;
  motionIntensity: StoryboardMotionIntensity;
  promptDetail: StoryboardPromptDetail;
  style: string;
  timeRangeMode: StoryboardTimeRangeMode;
  rangeStart: number;
  rangeEnd: number;
  autoRetryFailedScenes: boolean;
  autoRetryMaxAttempts: number;
  autoRetryRewriteAfter: number;
};

export type AnimationAssetType = 'character' | 'background' | 'prop' | 'icon' | 'overlay' | 'text';
export type AnimationAssetStatus = 'available' | 'missing' | 'queued' | 'generated' | 'failed';
export type AnimationReuseDecision = 'reuse' | 'generate' | 'optional';
export type AnimationSceneStatus = 'draft' | 'approved' | 'queued' | 'completed' | 'failed';
export type AnimationLayerType = 'background' | 'character' | 'prop' | 'icon' | 'overlay' | 'text' | 'caption' | 'placeholder';
export type AnimationCharacterPose = 'neutral' | 'talking' | 'pointing' | 'thinking' | 'happy' | 'concerned';
export type AnimationExpression = 'neutral' | 'smile' | 'focus' | 'surprise' | 'concern' | 'excited';
export type AnimationMouthCue = 'closed' | 'open' | 'wide' | 'smile';
export type AnimationLayoutTemplate = 'auto' | 'explainer_split' | 'center_focus' | 'lower_third' | 'portrait_stack' | 'square_card';
export type AnimationCaptionTemplate = 'clean_subtitle' | 'keyword_pop' | 'karaoke_highlight' | 'headline_burst';
export type AnimationMotionPreset = 'none' | 'fade' | 'slide' | 'pop' | 'zoom' | 'pan' | 'float' | 'bounce' | 'caption_highlight' | 'push_in' | 'pull_out' | 'parallax';

export type AnimationAssetMemoryItem = {
  id: string;
  name: string;
  assetType: AnimationAssetType;
  mediaAssetId?: string | null;
  sourceUrl?: string | null;
  localPath?: string | null;
  prompt: string;
  style: string;
  tags: string[];
  status: AnimationAssetStatus;
  metadata: Record<string, string>;
};

export type AnimationAssetNeed = {
  id: string;
  name: string;
  assetType: AnimationAssetType;
  description: string;
  prompt: string;
  negativePrompt: string;
  style: string;
  tags: string[];
  reuseDecision: AnimationReuseDecision;
  status: AnimationAssetStatus;
  matchedAssetId?: string | null;
  optional: boolean;
};

export type AnimationMotion = {
  preset: AnimationMotionPreset;
  direction: string;
  intensity: StoryboardMotionIntensity;
  note: string;
};

export type AnimationLayer = {
  id: string;
  sceneId: string;
  layerType: AnimationLayerType;
  assetNeedId?: string | null;
  text: string;
  start: number;
  end: number;
  order: number;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  motion: AnimationMotion;
};

export type AnimationCharacterCue = {
  assetNeedId?: string | null;
  poseAssetNeedId?: string | null;
  pose: AnimationCharacterPose;
  expression: AnimationExpression;
  mouthCue: AnimationMouthCue;
  note: string;
};

export type AnimationLayoutCue = {
  template: AnimationLayoutTemplate;
  safeArea: Record<string, number>;
  note: string;
};

export type AnimationCaptionCue = {
  template: AnimationCaptionTemplate;
  keywords: string[];
  note: string;
};

export type AnimationCameraCue = {
  preset: AnimationMotionPreset;
  direction: string;
  note: string;
};

export type AnimationSceneCue = {
  character: AnimationCharacterCue;
  layout: AnimationLayoutCue;
  caption: AnimationCaptionCue;
  camera: AnimationCameraCue;
  transcriptTriggers: string[];
};

export type AnimationScene = {
  id: string;
  start: number;
  end: number;
  transcript: string;
  summary: string;
  direction: string;
  status: AnimationSceneStatus;
  layers: AnimationLayer[];
  cue?: AnimationSceneCue;
};

export type AnimationPlan = {
  id: string;
  style: string;
  aspectRatio: GenerationAspectRatio;
  scenes: AnimationScene[];
  assetNeeds: AnimationAssetNeed[];
  warnings: string[];
  usedLlmMode: string;
  transcript: string;
  segments: TranscriptSlice[];
  duration: number;
  rendererRecommendation?: string;
  rendererNotes?: string[];
};

export type AnimationSettings = {
  sourceMediaId: string | null;
  provider: ProviderName;
  aspectRatio: GenerationAspectRatio;
  sceneDensity: StoryboardSceneDensity;
  motionIntensity: StoryboardMotionIntensity;
  promptDetail: StoryboardPromptDetail;
  style: string;
  layoutTemplate: AnimationLayoutTemplate;
  captionTemplate: AnimationCaptionTemplate;
};

export type GenerationMediaVariant = {
  id: string;
  url: string;
  mediaType: GeneratedMediaType;
  localPath: string | null;
  width: number | null;
  height: number | null;
  source: string;
};

export type GenerationJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'manual_action_required';

export type GenerationJob = {
  id: string;
  batchId: string;
  projectId: string | null;
  sceneId: string;
  provider: ProviderName;
  mediaType: GeneratedMediaType;
  prompt: string;
  negativePrompt: string;
  status: GenerationJobStatus;
  resultUrl: string | null;
  resultVariants: GenerationMediaVariant[];
  localPath: string | null;
  error: string | null;
  metadata: Record<string, string>;
};

export type GeneratedMediaAsset = {
  jobId: string;
  batchId: string;
  projectId: string | null;
  sceneId: string;
  provider: ProviderName;
  mediaType: GeneratedMediaType;
  status: GenerationJobStatus;
  resultUrl: string | null;
  resultVariants: GenerationMediaVariant[];
  localPath: string | null;
  prompt: string;
  negativePrompt: string;
  start: number;
  end: number;
  duration: number;
  transcript: string;
  error: string | null;
  metadata: Record<string, string>;
};

export type ProjectSummary = {
  id: string;
  name: string;
  folderPath: string;
  generatedMediaPath: string;
  projectFilePath: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectDetail = ProjectSummary & {
  state: Record<string, unknown>;
};
