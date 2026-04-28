import type { TimelineClip } from '../../types';

export type ExportResponse = {
  srtContent: string;
  mediaUrl: string;
};

export const exportTimeline = async (clips: TimelineClip[]): Promise<ExportResponse> => {
  const audioClips = clips.filter(c => c.type === 'audio');
  const visualClips = clips.filter(c => c.type === 'visual');
  
  if (audioClips.length === 0) {
    throw new Error("No audio clips in timeline to export");
  }
  
  // Backend needs them sorted by start time
  const sortedAudio = [...audioClips].sort((a, b) => a.startTime - b.startTime);
  
  const formData = new FormData();
  sortedAudio.forEach(clip => formData.append('files', clip.file));
  
  // Currently backend only supports 1 visual file. Take the first one.
  if (visualClips.length > 0) {
    formData.append('visual_file', visualClips[0].file);
  }

  const response = await fetch('/api/transcribe', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Processing failed');
  }

  return response.json();
};
