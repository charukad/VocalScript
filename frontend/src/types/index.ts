export type MediaType = 'audio' | 'visual';

export type MediaAsset = {
  id: string;
  file: File;
  type: MediaType; // The broad category for track placement
  mediaKind: 'audio' | 'video' | 'image'; // Specific file kind
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

export type TimelineClip = {
  id: string;
  assetId: string;
  trackId: string;
  file: File;
  type: MediaType;
  duration: number; // in seconds
  startTime: number; // in seconds
  mediaOffset: number; // offset within the source media file (in_point)
  transform?: {
    scale: number; // 0 to 200+
    rotation: number; // degrees
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
    volume: number;    // 0–200 (100 = normal)
    mute: boolean;
    fadeIn: number;   // seconds
    fadeOut: number;  // seconds
  };
};
