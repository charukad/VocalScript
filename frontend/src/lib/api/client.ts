import type { TimelineClip, TimelineTrack } from '../../types';

export type ExportResponse = {
  srtContent: string;
  mediaUrl: string;
};

// Based on the backend Pydantic models
type ClipBlueprint = {
  file_id: string;
  start_time: number;
  duration: number;
  in_point: number;
  volume: number;
  transform: {
    scale: number;
    rotation: number;
    flipX: boolean;
    flipY: boolean;
  };
  color: {
    brightness: number;
    contrast: number;
    saturation: number;
    exposure: number;
    temperature: number;
  };
};

type TrackBlueprint = {
  id: string;
  name: string;
  type: string;
  clips: ClipBlueprint[];
};

type TimelineBlueprint = {
  fps: number;
  width: number;
  height: number;
  tracks: TrackBlueprint[];
};

export const exportTimeline = async (clips: TimelineClip[], tracks: TimelineTrack[]): Promise<ExportResponse> => {
  if (clips.length === 0) {
    throw new Error("Timeline is empty");
  }

  // 1. Build Blueprint
  const blueprintTracks: TrackBlueprint[] = tracks.map(t => ({
    id: t.id,
    name: t.name,
    type: t.type,
    clips: clips
      .filter(c => c.trackId === t.id)
      .map(c => ({
        file_id: c.id + '_' + c.file.name, // Ensure unique IDs 
        start_time: c.startTime,
        duration: c.duration,
        in_point: c.mediaOffset || 0.0,
        volume: 1.0,    // Hardcoded until Phase 4 Volume UI is built
        transform: c.transform || { scale: 100, rotation: 0, flipX: false, flipY: false },
        color: c.color || { brightness: 100, contrast: 100, saturation: 100, exposure: 0, temperature: 0 }
      }))
  }));

  const blueprint: TimelineBlueprint = {
    fps: 30,
    width: 1920,
    height: 1080,
    tracks: blueprintTracks
  };

  // 2. Build FormData
  const formData = new FormData();
  formData.append('blueprint', JSON.stringify(blueprint));
  
  clips.forEach(clip => {
    // We pass the unique file_id as the filename so the backend can map it
    const fileId = clip.id + '_' + clip.file.name;
    const newFile = new File([clip.file], fileId, { type: clip.file.type });
    formData.append('files', newFile);
  });

  const response = await fetch('http://localhost:8000/api/export', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Processing failed');
  }

  const data = await response.json();
  // Ensure we format the local URL correctly
  data.mediaUrl = 'http://localhost:8000' + data.mediaUrl;
  return data;
};
