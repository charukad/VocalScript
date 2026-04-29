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
};

export type ExportSettings = {
  resolution: '720p' | '1080p' | '4k';
  aspectRatio: '16:9' | '9:16' | '1:1';
  quality: 'high' | 'standard' | 'compressed';
};
