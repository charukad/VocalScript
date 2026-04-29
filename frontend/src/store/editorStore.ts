import { create } from 'zustand';
import type { MediaAsset, TimelineClip, TimelineTrack, MediaType, TextData, ExportSettings } from '../types';
import { getMediaDuration, generateThumbnail, generateWaveform, generateFilmstrip } from '../lib/utils/media';
import { exportTimeline } from '../lib/api/client';

const DEFAULT_TEXT_DATA: TextData = {
  content: 'Text Here',
  fontFamily: 'Inter, sans-serif',
  fontSize: 48,
  color: '#ffffff',
  bold: false,
  italic: false,
  align: 'center',
  x: 50,
  y: 85,
  bgColor: '#000000',
  bgOpacity: 0,
};

type EditorState = {
  // Media Pool
  assets: MediaAsset[];
  addAssets: (files: File[]) => Promise<void>;
  removeAsset: (id: string) => void;

  // Timeline Tracks
  tracks: TimelineTrack[];
  addTrack: (type: MediaType) => void;

  // Timeline Clips
  clips: TimelineClip[];
  selectedClipId: string | null;
  setSelectedClip: (id: string | null) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  addAssetToTimeline: (asset: MediaAsset, trackId?: string, startTimeX?: number) => Promise<void>;
  addTextClip: (trackId: string, startTime: number, duration?: number) => void;
  removeClip: (id: string) => void;
  updateClipStartTime: (id: string, deltaX: number) => void;
  updateClipTrack: (id: string, trackId: string, deltaX: number) => void;
  trimClip: (id: string, newStartTime: number, newDuration: number, newMediaOffset: number) => void;
  splitClip: (id: string, splitTime: number) => void;
  updateClipTransform: (id: string, transformData: Partial<TimelineClip['transform']>) => void;
  updateClipColor: (id: string, colorData: Partial<TimelineClip['color']>) => void;
  updateClipAudio: (id: string, audioData: Partial<TimelineClip['audio']>) => void;
  updateClipText: (id: string, textData: Partial<TextData>) => void;

  // Playback
  isPlaying: boolean;
  playheadTime: number;
  togglePlayback: () => void;
  setPlayheadTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;

  // Export Modal
  showExportModal: boolean;
  exportSettings: ExportSettings;
  openExportModal: () => void;
  closeExportModal: () => void;
  setExportSettings: (settings: Partial<ExportSettings>) => void;

  // Export State
  isProcessing: boolean;
  srtContent: string | null;
  srtDownloadUrl: string | null;
  mediaUrl: string | null;
  exportSequence: () => Promise<void>;
};

export const useEditorStore = create<EditorState>((set, get) => ({
  // --- Media Pool ---
  assets: [],
  addAssets: async (files: File[]) => {
    const newAssets: MediaAsset[] = [];
    for (const f of files) {
      let mediaKind: 'audio' | 'video' | 'image' | null = null;
      let type: MediaType = 'visual';

      if (f.type.startsWith('audio/') || f.name.match(/\.(mp3|wav|m4a|flac|ogg|aac)$/i)) {
        mediaKind = 'audio';
        type = 'audio';
      } else if (f.type.startsWith('video/') || f.name.match(/\.(mp4|mov|mkv|avi|webm)$/i)) {
        mediaKind = 'video';
        type = 'visual';
      } else if (f.type.startsWith('image/') || f.name.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
        mediaKind = 'image';
        type = 'visual';
      }

      if (mediaKind) {
        const thumbnailUrl = await generateThumbnail(f, mediaKind);
        const newAsset: MediaAsset = {
          id: Math.random().toString(36).substring(7),
          file: f,
          type,
          mediaKind,
          thumbnailUrl
        };
        newAssets.push(newAsset);

        // Async background generation of rich visuals
        if (mediaKind === 'audio') {
          generateWaveform(f, 200).then(waveform => {
            set(state => ({
              assets: state.assets.map(a => a.id === newAsset.id ? { ...a, waveform } : a)
            }));
          });
        } else if (mediaKind === 'video') {
          getMediaDuration(f, 'visual').then(duration => {
            if (duration > 0 && duration !== Infinity) {
              const framesCount = Math.min(50, Math.max(5, Math.ceil(duration / 2)));
              generateFilmstrip(f, duration, framesCount).then(filmstrip => {
                set(state => ({
                  assets: state.assets.map(a => a.id === newAsset.id ? { ...a, filmstrip } : a)
                }));
              });
            }
          });
        }
      }
    }
    set(state => ({ assets: [...state.assets, ...newAssets] }));
  },
  removeAsset: (id: string) => {
    set(state => ({
      assets: state.assets.filter(a => a.id !== id),
      clips: state.clips.filter(c => c.assetId !== id)
    }));
  },

  // --- Timeline Tracks ---
  tracks: [
    { id: 'v1', name: 'V1', type: 'visual', order: 0 },
    { id: 'a1', name: 'A1', type: 'audio', order: 1 }
  ],
  addTrack: (type: MediaType) => {
    set(state => {
      const typeTracks = state.tracks.filter(t => t.type === type);
      let newName: string;
      if (type === 'visual') newName = `V${typeTracks.length + 1}`;
      else if (type === 'audio') newName = `A${typeTracks.length + 1}`;
      else newName = `T${typeTracks.length + 1}`;

      const newTrack: TimelineTrack = {
        id: Math.random().toString(36).substring(7),
        name: newName,
        type,
        order: state.tracks.length
      };
      return { tracks: [...state.tracks, newTrack] };
    });
  },

  // --- Timeline Clips ---
  clips: [],
  selectedClipId: null,
  setSelectedClip: (id: string | null) => set({ selectedClipId: id }),
  zoom: 20,
  setZoom: (zoom) => set({ zoom }),

  addAssetToTimeline: async (asset: MediaAsset, trackId?: string, startTimeX?: number) => {
    const state = get();
    const duration = await getMediaDuration(asset.file, asset.type);

    let targetTrackId = trackId;
    if (!targetTrackId) {
      const matchingTrack = state.tracks.find(t => t.type === asset.type);
      if (matchingTrack) targetTrackId = matchingTrack.id;
    }
    if (!targetTrackId) return;

    let targetStartTime = 0;
    if (startTimeX !== undefined) {
      targetStartTime = startTimeX / state.zoom;
    } else {
      const trackClips = state.clips.filter(c => c.trackId === targetTrackId);
      targetStartTime = trackClips.reduce((max, clip) => Math.max(max, clip.startTime + clip.duration), 0);
    }

    const newClip: TimelineClip = {
      id: Math.random().toString(36).substring(7),
      assetId: asset.id,
      trackId: targetTrackId,
      file: asset.file,
      type: asset.type,
      duration: asset.type === 'visual' && asset.file.type.startsWith('image') ? 10 : duration,
      startTime: Math.max(0, targetStartTime),
      mediaOffset: 0,
      transform: { scale: 100, rotation: 0, flipX: false, flipY: false },
      color: { brightness: 100, contrast: 100, saturation: 100, exposure: 0, temperature: 0 },
      audio: { volume: 100, mute: false, fadeIn: 0, fadeOut: 0 }
    };
    set({ clips: [...state.clips, newClip] });
  },

  addTextClip: (trackId: string, startTime: number, duration: number = 5) => {
    const state = get();
    // Use a minimal blank File object as placeholder
    const placeholderFile = new File([], 'text-overlay.txt', { type: 'text/plain' });
    const newClip: TimelineClip = {
      id: Math.random().toString(36).substring(7),
      assetId: 'text-' + Math.random().toString(36).substring(7),
      trackId,
      file: placeholderFile,
      type: 'text',
      duration,
      startTime,
      mediaOffset: 0,
      audio: { volume: 0, mute: true, fadeIn: 0, fadeOut: 0 },
      textData: { ...DEFAULT_TEXT_DATA }
    };
    set({ clips: [...state.clips, newClip], selectedClipId: newClip.id });
  },

  removeClip: (id: string) => set(state => ({ clips: state.clips.filter(c => c.id !== id) })),

  updateClipStartTime: (id: string, deltaX: number) => {
    set(state => ({
      clips: state.clips.map(clip => {
        if (clip.id === id) {
          const timeDelta = deltaX / state.zoom;
          return { ...clip, startTime: Math.max(0, clip.startTime + timeDelta) };
        }
        return clip;
      })
    }));
  },

  updateClipTrack: (id: string, trackId: string, deltaX: number) => {
    set(state => ({
      clips: state.clips.map(clip => {
        if (clip.id === id) {
          const timeDelta = deltaX / state.zoom;
          return { ...clip, trackId, startTime: Math.max(0, clip.startTime + timeDelta) };
        }
        return clip;
      })
    }));
  },

  trimClip: (id: string, newStartTime: number, newDuration: number, newMediaOffset: number) => {
    set(state => ({
      clips: state.clips.map(clip => {
        if (clip.id === id) {
          return {
            ...clip,
            startTime: Math.max(0, newStartTime),
            duration: Math.max(0.1, newDuration),
            mediaOffset: Math.max(0, newMediaOffset)
          };
        }
        return clip;
      })
    }));
  },

  splitClip: (id: string, splitTime: number) => {
    set(state => {
      const clipIndex = state.clips.findIndex(c => c.id === id);
      if (clipIndex === -1) return state;
      const clip = state.clips[clipIndex];
      if (splitTime <= clip.startTime || splitTime >= clip.startTime + clip.duration) {
        alert('Playhead must be placed somewhere over the selected clip to split it.');
        return state;
      }
      const splitOffset = splitTime - clip.startTime;
      const clip1: TimelineClip = { ...clip, duration: splitOffset };
      const clip2: TimelineClip = {
        ...clip,
        id: Math.random().toString(36).substring(7),
        startTime: splitTime,
        duration: clip.duration - splitOffset,
        mediaOffset: clip.mediaOffset + splitOffset
      };
      const newClips = [...state.clips];
      newClips.splice(clipIndex, 1, clip1, clip2);
      return { clips: newClips };
    });
  },

  updateClipTransform: (id: string, transformData: Partial<TimelineClip['transform']>) => {
    set(state => ({
      clips: state.clips.map(clip => {
        if (clip.id === id) {
          return {
            ...clip,
            transform: { ...(clip.transform || { scale: 100, rotation: 0, flipX: false, flipY: false }), ...transformData }
          };
        }
        return clip;
      })
    }));
  },

  updateClipColor: (id: string, colorData: Partial<TimelineClip['color']>) => {
    set(state => ({
      clips: state.clips.map(clip => {
        if (clip.id === id) {
          return {
            ...clip,
            color: { ...(clip.color || { brightness: 100, contrast: 100, saturation: 100, exposure: 0, temperature: 0 }), ...colorData }
          };
        }
        return clip;
      })
    }));
  },

  updateClipAudio: (id: string, audioData: Partial<TimelineClip['audio']>) => {
    set(state => ({
      clips: state.clips.map(clip => {
        if (clip.id === id) {
          return {
            ...clip,
            audio: { ...(clip.audio || { volume: 100, mute: false, fadeIn: 0, fadeOut: 0 }), ...audioData }
          };
        }
        return clip;
      })
    }));
  },

  updateClipText: (id: string, textData: Partial<TextData>) => {
    set(state => ({
      clips: state.clips.map(clip => {
        if (clip.id === id) {
          return {
            ...clip,
            textData: { ...(clip.textData || DEFAULT_TEXT_DATA), ...textData }
          };
        }
        return clip;
      })
    }));
  },

  // --- Playback ---
  isPlaying: false,
  playheadTime: 0,
  togglePlayback: () => set(state => ({ isPlaying: !state.isPlaying })),
  setPlayheadTime: (time: number) => set({ playheadTime: time }),
  setIsPlaying: (playing: boolean) => set({ isPlaying: playing }),

  // --- Export Modal ---
  showExportModal: false,
  exportSettings: { resolution: '1080p', aspectRatio: '16:9', quality: 'standard' },
  openExportModal: () => set({ showExportModal: true }),
  closeExportModal: () => set({ showExportModal: false }),
  setExportSettings: (settings) => set(state => ({ exportSettings: { ...state.exportSettings, ...settings } })),

  // --- Export ---
  isProcessing: false,
  srtContent: null,
  srtDownloadUrl: null,
  mediaUrl: null,
  exportSequence: async () => {
    set({ isProcessing: true, showExportModal: false });
    try {
      const state = get();
      const data = await exportTimeline(state.clips, state.tracks, state.exportSettings);
      const srtBlob = new Blob([data.srtContent], { type: 'text/plain' });
      const srtUrl = window.URL.createObjectURL(srtBlob);
      set({ srtContent: data.srtContent, mediaUrl: data.mediaUrl, srtDownloadUrl: srtUrl });
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'An error occurred during export');
    } finally {
      set({ isProcessing: false });
    }
  }
}));
