export type MediaType = 'audio' | 'visual';

export type MediaAsset = {
  id: string;
  file: File;
  type: MediaType;
};

export type TimelineClip = {
  id: string;
  assetId: string;
  file: File;
  type: MediaType;
  duration: number; // in seconds
  startTime: number; // in seconds
};
