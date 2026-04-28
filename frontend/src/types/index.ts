export type MediaType = 'audio' | 'visual';

export type MediaAsset = {
  id: string;
  file: File;
  type: MediaType;
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
};
