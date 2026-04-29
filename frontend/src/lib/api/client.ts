import type { TimelineClip, TimelineTrack, ExportSettings } from '../../types';

export type ExportResponse = {
  srtContent: string;
  mediaUrl: string;
};

const formatExportError = (detail: unknown): string => {
  const raw = typeof detail === 'string' ? detail : 'Processing failed';
  const message = raw
    .replace(/^Media compilation failed:\s*/i, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const importantLine = message.find(line =>
    line.includes('Error') ||
    line.includes('No such filter') ||
    line.includes('Invalid') ||
    line.includes('not found') ||
    line.includes('Unable')
  );

  if (importantLine) return `Export failed: ${importantLine}`;
  if (message.length > 0) return `Export failed: ${message[message.length - 1]}`;
  return 'Export failed. Check the backend log for details.';
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
  audio: {
    volume: number;
    mute: boolean;
    fadeIn: number;
    fadeOut: number;
  };
  text?: {
    content: string;
    fontFamily: string;
    fontSize: number;
    color: string;
    bold: boolean;
    italic: boolean;
    align: 'left' | 'center' | 'right';
    x: number;
    y: number;
    bgColor: string;
    bgOpacity: number;
  } | null;
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
  crf: number;
  audio_only: boolean;
  tracks: TrackBlueprint[];
};

const isTrackActive = (track: TimelineTrack, tracks: TimelineTrack[]) => {
  if (track.muted) return false;
  const hasSoloForType = tracks.some(t => t.type === track.type && t.solo);
  return !hasSoloForType || Boolean(track.solo);
};

export const exportTimeline = async (
  clips: TimelineClip[],
  tracks: TimelineTrack[],
  settings: ExportSettings,
  signal?: AbortSignal
): Promise<ExportResponse> => {
  if (clips.length === 0) {
    throw new Error("Timeline is empty");
  }

  // 1. Build Blueprint
  const activeTracks = tracks.filter(t => isTrackActive(t, tracks));
  const blueprintTracks: TrackBlueprint[] = activeTracks.map(t => ({
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
        color: c.color || { brightness: 100, contrast: 100, saturation: 100, exposure: 0, temperature: 0 },
        audio: c.audio || { volume: 100, mute: false, fadeIn: 0, fadeOut: 0 },
        text: c.textData || null
      }))
  }));

  // Resolve width/height from resolution + aspect ratio
  const resMap: Record<string, { w: number; h: number }> = {
    '720p':  { w: 1280, h: 720  },
    '1080p': { w: 1920, h: 1080 },
    '4k':    { w: 3840, h: 2160 },
  };
  const base = resMap[settings.resolution] ?? resMap['1080p'];
  let width = base.w;
  let height = base.h;
  if (settings.aspectRatio === '9:16') { width = base.h; height = base.w; }
  if (settings.aspectRatio === '1:1')  { width = base.h; height = base.h; }
  const crfMap: Record<string, number> = { high: 18, standard: 23, compressed: 28 };
  const crf = crfMap[settings.quality] ?? 23;

  const blueprint: TimelineBlueprint = {
    fps: 30,
    width,
    height,
    crf,
    audio_only: settings.format === 'audio',
    tracks: blueprintTracks
  };

  // 2. Build FormData
  const formData = new FormData();
  formData.append('blueprint', JSON.stringify(blueprint));
  
  clips.forEach(clip => {
    // Text clips use a placeholder file — skip them, they need no FFmpeg input
    if (clip.type === 'text') return;
    // We pass the unique file_id as the filename so the backend can map it
    const fileId = clip.id + '_' + clip.file.name;
    const newFile = new File([clip.file], fileId, { type: clip.file.type });
    formData.append('files', newFile);
  });

  const response = await fetch('http://localhost:8000/api/export', {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatExportError(errorData.detail));
  }

  const data = await response.json();
  // Ensure we format the local URL correctly
  data.mediaUrl = 'http://localhost:8000' + data.mediaUrl;
  return data;
};
