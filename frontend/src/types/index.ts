export type MediaType = 'audio' | 'visual' | 'text';

export type MediaAsset = {
  id: string;
  file: File;
  type: MediaType;
  mediaKind: 'audio' | 'video' | 'image';
  thumbnailUrl?: string;
  waveform?: number[];
  filmstrip?: string[];
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
  style: string;
};
