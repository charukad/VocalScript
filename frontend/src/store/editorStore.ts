import { create } from 'zustand';
import type { MediaAsset, TimelineClip, TimelineTrack, MediaType, TextData, ExportSettings, CaptionSegment, KeyframeProperty } from '../types';
import { getMediaDuration, generateThumbnail, generateWaveform, generateFilmstrip } from '../lib/utils/media';
import { exportTimeline } from '../lib/api/client';
import { clampKeyframeTime, getClipPropertyValue, getKeyframedValue } from '../lib/utils/keyframes';

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

type TimelineSnapshot = {
  clips: TimelineClip[];
  tracks: TimelineTrack[];
};

const HISTORY_LIMIT = 50;
const SNAP_THRESHOLD = 0.25;

const cloneClips = (clips: TimelineClip[]) => clips.map(clip => ({
  ...clip,
  transform: clip.transform ? { ...clip.transform } : undefined,
  color: clip.color ? { ...clip.color } : undefined,
  audio: clip.audio ? { ...clip.audio } : undefined,
  textData: clip.textData ? { ...clip.textData } : undefined,
  keyframes: clip.keyframes ? clip.keyframes.map(keyframe => ({ ...keyframe })) : undefined,
}));

const cloneTracks = (tracks: TimelineTrack[]) => tracks.map(track => ({ ...track }));

const makeSnapshot = (state: Pick<EditorState, 'clips' | 'tracks'>): TimelineSnapshot => ({
  clips: cloneClips(state.clips),
  tracks: cloneTracks(state.tracks),
});

const withHistory = (state: EditorState) => ({
  historyPast: [...state.historyPast.slice(-HISTORY_LIMIT + 1), makeSnapshot(state)],
  historyFuture: [],
});

const formatSrtTimestamp = (seconds: number): string => {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const millis = Math.floor((safe - Math.floor(safe)) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
};

const parseSrtTimestamp = (value: string): number => {
  const match = value.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!match) return 0;
  const [, h, m, s, ms] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, '0').slice(0, 3)) / 1000;
};

const parseSrt = (srt: string): CaptionSegment[] => {
  return srt
    .trim()
    .split(/\n\s*\n/)
    .map((block, blockIndex) => {
      const lines = block.split(/\r?\n/).filter(Boolean);
      const timeLineIndex = lines.findIndex(line => line.includes('-->'));
      if (timeLineIndex === -1) return null;
      const [startRaw, endRaw] = lines[timeLineIndex].split('-->').map(part => part.trim());
      return {
        id: `caption-${blockIndex + 1}`,
        index: blockIndex + 1,
        start: parseSrtTimestamp(startRaw),
        end: parseSrtTimestamp(endRaw),
        text: lines.slice(timeLineIndex + 1).join('\n'),
      };
    })
    .filter((segment): segment is CaptionSegment => Boolean(segment));
};

const captionsToSrt = (captions: CaptionSegment[]) => captions.map((caption, index) => [
  String(index + 1),
  `${formatSrtTimestamp(caption.start)} --> ${formatSrtTimestamp(caption.end)}`,
  caption.text.trim(),
  '',
].join('\n')).join('\n');

const captionsToVtt = (captions: CaptionSegment[]) => `WEBVTT\n\n${captions.map(caption => [
  `${formatSrtTimestamp(caption.start).replace(',', '.')} --> ${formatSrtTimestamp(caption.end).replace(',', '.')}`,
  caption.text.trim(),
  '',
].join('\n')).join('\n')}`;

const makeTextDownloadUrl = (text: string, type: string) => window.URL.createObjectURL(new Blob([text], { type }));

const isTrackLocked = (tracks: TimelineTrack[], trackId: string) => Boolean(tracks.find(track => track.id === trackId)?.locked);

const snapTime = (state: Pick<EditorState, 'clips' | 'playheadTime' | 'snapEnabled'>, time: number, movingClipId?: string): number => {
  if (!state.snapEnabled) return Math.max(0, time);
  const candidates = [0, state.playheadTime];
  state.clips.forEach(clip => {
    if (clip.id === movingClipId) return;
    candidates.push(clip.startTime, clip.startTime + clip.duration);
  });
  const nearest = candidates.reduce((best, candidate) => {
    return Math.abs(candidate - time) < Math.abs(best - time) ? candidate : best;
  }, time);
  return Math.max(0, Math.abs(nearest - time) <= SNAP_THRESHOLD ? nearest : time);
};

type EditorState = {
  // Media Pool
  assets: MediaAsset[];
  addAssets: (files: File[]) => Promise<void>;
  removeAsset: (id: string) => void;

  // Timeline Tracks
  tracks: TimelineTrack[];
  addTrack: (type: MediaType) => void;
  updateTrack: (id: string, updates: Partial<Pick<TimelineTrack, 'muted' | 'solo' | 'locked'>>) => void;

  // Timeline Clips
  clips: TimelineClip[];
  selectedClipId: string | null;
  setSelectedClip: (id: string | null) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  snapEnabled: boolean;
  toggleSnap: () => void;
  addAssetToTimeline: (asset: MediaAsset, trackId?: string, startTimeX?: number) => Promise<void>;
  addTextClip: (trackId: string, startTime: number, duration?: number) => void;
  removeClip: (id: string) => void;
  updateClipStartTime: (id: string, deltaX: number) => void;
  updateClipTrack: (id: string, trackId: string, deltaX: number) => void;
  trimClip: (id: string, newStartTime: number, newDuration: number, newMediaOffset: number) => void;
  setClipTiming: (id: string, startTime: number, duration: number) => void;
  splitClip: (id: string, splitTime: number) => void;
  updateClipTransform: (id: string, transformData: Partial<TimelineClip['transform']>) => void;
  updateClipColor: (id: string, colorData: Partial<TimelineClip['color']>) => void;
  updateClipAudio: (id: string, audioData: Partial<TimelineClip['audio']>) => void;
  updateClipText: (id: string, textData: Partial<TextData>) => void;
  addKeyframe: (id: string, property: KeyframeProperty, time?: number, value?: number) => void;
  updateKeyframe: (id: string, keyframeId: string, updates: Partial<Pick<NonNullable<TimelineClip['keyframes']>[number], 'time' | 'value'>>) => void;
  removeKeyframe: (id: string, keyframeId: string) => void;
  undo: () => void;
  redo: () => void;
  historyPast: TimelineSnapshot[];
  historyFuture: TimelineSnapshot[];

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
  exportStatus: string | null;
  exportAbortController: AbortController | null;
  srtContent: string | null;
  srtDownloadUrl: string | null;
  vttDownloadUrl: string | null;
  captions: CaptionSegment[];
  mediaUrl: string | null;
  exportSequence: () => Promise<void>;
  cancelExport: () => void;
  updateCaptionText: (id: string, text: string) => void;
  createTextClipsFromCaptions: () => void;
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
    { id: 'v1', name: 'V1', type: 'visual', order: 0, muted: false, solo: false, locked: false },
    { id: 'a1', name: 'A1', type: 'audio', order: 1, muted: false, solo: false, locked: false }
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
        order: state.tracks.length,
        muted: false,
        solo: false,
        locked: false
      };
      return { ...withHistory(state), tracks: [...state.tracks, newTrack] };
    });
  },
  updateTrack: (id, updates) => {
    set(state => ({
      ...withHistory(state),
      tracks: state.tracks.map(track => track.id === id ? { ...track, ...updates } : track)
    }));
  },

  // --- Timeline Clips ---
  clips: [],
  selectedClipId: null,
  setSelectedClip: (id: string | null) => set({ selectedClipId: id }),
  zoom: 20,
  setZoom: (zoom) => set({ zoom }),
  snapEnabled: true,
  toggleSnap: () => set(state => ({ snapEnabled: !state.snapEnabled })),
  historyPast: [],
  historyFuture: [],

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
    targetStartTime = snapTime(state, targetStartTime);

    const newClip: TimelineClip = {
      id: Math.random().toString(36).substring(7),
      assetId: asset.id,
      trackId: targetTrackId,
      file: asset.file,
      type: asset.type,
      duration: asset.type === 'visual' && asset.file.type.startsWith('image') ? 10 : duration,
      startTime: Math.max(0, targetStartTime),
      mediaOffset: 0,
      transform: { scale: 100, rotation: 0, opacity: 100, flipX: false, flipY: false },
      color: { brightness: 100, contrast: 100, saturation: 100, exposure: 0, temperature: 0 },
      audio: { volume: 100, mute: false, fadeIn: 0, fadeOut: 0 }
    };
    set({ ...withHistory(state), clips: [...state.clips, newClip] });
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
      transform: { scale: 100, rotation: 0, opacity: 100, flipX: false, flipY: false },
      textData: { ...DEFAULT_TEXT_DATA }
    };
    set({ ...withHistory(state), clips: [...state.clips, newClip], selectedClipId: newClip.id });
  },

  removeClip: (id: string) => set(state => {
    const clip = state.clips.find(c => c.id === id);
    if (!clip || isTrackLocked(state.tracks, clip.trackId)) return state;
    return { ...withHistory(state), clips: state.clips.filter(c => c.id !== id) };
  }),

  updateClipStartTime: (id: string, deltaX: number) => {
    set(state => ({
      ...withHistory(state),
      clips: state.clips.map(clip => {
        if (clip.id === id) {
          if (isTrackLocked(state.tracks, clip.trackId)) return clip;
          const timeDelta = deltaX / state.zoom;
          return { ...clip, startTime: snapTime(state, clip.startTime + timeDelta, id) };
        }
        return clip;
      })
    }));
  },

  updateClipTrack: (id: string, trackId: string, deltaX: number) => {
    set(state => ({
      ...withHistory(state),
      clips: state.clips.map(clip => {
        if (clip.id === id) {
          if (isTrackLocked(state.tracks, clip.trackId) || isTrackLocked(state.tracks, trackId)) return clip;
          const timeDelta = deltaX / state.zoom;
          return { ...clip, trackId, startTime: snapTime(state, clip.startTime + timeDelta, id) };
        }
        return clip;
      })
    }));
  },

  trimClip: (id: string, newStartTime: number, newDuration: number, newMediaOffset: number) => {
    set(state => ({
      ...withHistory(state),
      clips: state.clips.map(clip => {
        if (clip.id === id) {
          if (isTrackLocked(state.tracks, clip.trackId)) return clip;
          const snappedStart = snapTime(state, newStartTime, id);
          const startDelta = snappedStart - newStartTime;
          return {
            ...clip,
            startTime: snappedStart,
            duration: Math.max(0.1, newDuration - startDelta),
            mediaOffset: Math.max(0, newMediaOffset + startDelta)
          };
        }
        return clip;
      })
    }));
  },

  setClipTiming: (id: string, startTime: number, duration: number) => {
    set(state => ({
      ...withHistory(state),
      clips: state.clips.map(clip => {
        if (clip.id === id) {
          if (isTrackLocked(state.tracks, clip.trackId)) return clip;
          return {
            ...clip,
            startTime: snapTime(state, startTime, id),
            duration: Math.max(0.1, duration)
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
      if (isTrackLocked(state.tracks, clip.trackId)) return state;
      if (splitTime <= clip.startTime || splitTime >= clip.startTime + clip.duration) {
        alert('Playhead must be placed somewhere over the selected clip to split it.');
        return state;
      }
      const splitOffset = splitTime - clip.startTime;
      const clip1: TimelineClip = {
        ...clip,
        duration: splitOffset,
        keyframes: clip.keyframes
          ?.filter(keyframe => keyframe.time <= splitOffset)
          .map(keyframe => ({ ...keyframe }))
      };
      const clip2: TimelineClip = {
        ...clip,
        id: Math.random().toString(36).substring(7),
        startTime: splitTime,
        duration: clip.duration - splitOffset,
        mediaOffset: clip.mediaOffset + splitOffset,
        keyframes: clip.keyframes
          ?.filter(keyframe => keyframe.time >= splitOffset)
          .map(keyframe => ({ ...keyframe, id: Math.random().toString(36).substring(7), time: keyframe.time - splitOffset }))
      };
      const newClips = [...state.clips];
      newClips.splice(clipIndex, 1, clip1, clip2);
      return { ...withHistory(state), clips: newClips };
    });
  },

  updateClipTransform: (id: string, transformData: Partial<TimelineClip['transform']>) => {
    set(state => ({
      ...withHistory(state),
      clips: state.clips.map(clip => {
        if (clip.id === id) {
          if (isTrackLocked(state.tracks, clip.trackId)) return clip;
          return {
            ...clip,
            transform: { ...(clip.transform || { scale: 100, rotation: 0, opacity: 100, flipX: false, flipY: false }), ...transformData }
          };
        }
        return clip;
      })
    }));
  },

  updateClipColor: (id: string, colorData: Partial<TimelineClip['color']>) => {
    set(state => ({
      ...withHistory(state),
      clips: state.clips.map(clip => {
        if (clip.id === id) {
          if (isTrackLocked(state.tracks, clip.trackId)) return clip;
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
      ...withHistory(state),
      clips: state.clips.map(clip => {
        if (clip.id === id) {
          if (isTrackLocked(state.tracks, clip.trackId)) return clip;
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
      ...withHistory(state),
      clips: state.clips.map(clip => {
        if (clip.id === id) {
          if (isTrackLocked(state.tracks, clip.trackId)) return clip;
          return {
            ...clip,
            textData: { ...(clip.textData || DEFAULT_TEXT_DATA), ...textData }
          };
        }
        return clip;
      })
    }));
  },

  addKeyframe: (id, property, time, value) => {
    set(state => {
      const clip = state.clips.find(candidate => candidate.id === id);
      if (!clip || isTrackLocked(state.tracks, clip.trackId)) return state;

      const relativeTime = clampKeyframeTime(clip, time ?? state.playheadTime - clip.startTime);
      const nextKeyframe = {
        id: Math.random().toString(36).substring(7),
        property,
        time: Number(relativeTime.toFixed(3)),
        value: value ?? getKeyframedValue(clip, property, state.playheadTime, getClipPropertyValue(clip, property)),
        easing: 'linear' as const,
      };

      return {
        ...withHistory(state),
        clips: state.clips.map(candidate => {
          if (candidate.id !== id) return candidate;
          const existing = candidate.keyframes ?? [];
          const duplicateIndex = existing.findIndex(keyframe =>
            keyframe.property === property && Math.abs(keyframe.time - nextKeyframe.time) < 0.033
          );
          const keyframes = duplicateIndex >= 0
            ? existing.map((keyframe, index) => index === duplicateIndex ? { ...keyframe, value: nextKeyframe.value } : keyframe)
            : [...existing, nextKeyframe];

          return {
            ...candidate,
            keyframes: keyframes.sort((a, b) => a.time - b.time || a.property.localeCompare(b.property)),
          };
        }),
      };
    });
  },

  updateKeyframe: (id, keyframeId, updates) => {
    set(state => ({
      ...withHistory(state),
      clips: state.clips.map(clip => {
        if (clip.id !== id) return clip;
        if (isTrackLocked(state.tracks, clip.trackId)) return clip;
        return {
          ...clip,
          keyframes: (clip.keyframes ?? [])
            .map(keyframe => keyframe.id === keyframeId
              ? {
                  ...keyframe,
                  value: updates.value ?? keyframe.value,
                  time: updates.time === undefined ? keyframe.time : Number(clampKeyframeTime(clip, updates.time).toFixed(3)),
                }
              : keyframe
            )
            .sort((a, b) => a.time - b.time || a.property.localeCompare(b.property)),
        };
      }),
    }));
  },

  removeKeyframe: (id, keyframeId) => {
    set(state => ({
      ...withHistory(state),
      clips: state.clips.map(clip => {
        if (clip.id !== id) return clip;
        if (isTrackLocked(state.tracks, clip.trackId)) return clip;
        return {
          ...clip,
          keyframes: (clip.keyframes ?? []).filter(keyframe => keyframe.id !== keyframeId),
        };
      }),
    }));
  },

  undo: () => {
    set(state => {
      const previous = state.historyPast[state.historyPast.length - 1];
      if (!previous) return state;
      return {
        clips: cloneClips(previous.clips),
        tracks: cloneTracks(previous.tracks),
        historyPast: state.historyPast.slice(0, -1),
        historyFuture: [makeSnapshot(state), ...state.historyFuture].slice(0, HISTORY_LIMIT),
        selectedClipId: previous.clips.some(clip => clip.id === state.selectedClipId) ? state.selectedClipId : null,
      };
    });
  },

  redo: () => {
    set(state => {
      const next = state.historyFuture[0];
      if (!next) return state;
      return {
        clips: cloneClips(next.clips),
        tracks: cloneTracks(next.tracks),
        historyPast: [...state.historyPast, makeSnapshot(state)].slice(-HISTORY_LIMIT),
        historyFuture: state.historyFuture.slice(1),
        selectedClipId: next.clips.some(clip => clip.id === state.selectedClipId) ? state.selectedClipId : null,
      };
    });
  },

  // --- Playback ---
  isPlaying: false,
  playheadTime: 0,
  togglePlayback: () => set(state => ({ isPlaying: !state.isPlaying })),
  setPlayheadTime: (time: number) => set({ playheadTime: time }),
  setIsPlaying: (playing: boolean) => set({ isPlaying: playing }),

  // --- Export Modal ---
  showExportModal: false,
  exportSettings: { resolution: '1080p', aspectRatio: '16:9', quality: 'standard', format: 'video' },
  openExportModal: () => set({ showExportModal: true }),
  closeExportModal: () => set({ showExportModal: false }),
  setExportSettings: (settings) => set(state => ({ exportSettings: { ...state.exportSettings, ...settings } })),

  // --- Export ---
  isProcessing: false,
  exportStatus: null,
  exportAbortController: null,
  srtContent: null,
  srtDownloadUrl: null,
  vttDownloadUrl: null,
  captions: [],
  mediaUrl: null,
  exportSequence: async () => {
    const abortController = new AbortController();
    set({ isProcessing: true, exportStatus: 'Preparing export...', showExportModal: false, exportAbortController: abortController } as Partial<EditorState>);
    try {
      const state = get();
      set({ exportStatus: 'Rendering media and transcribing audio...' });
      const data = await exportTimeline(state.clips, state.tracks, state.exportSettings, abortController.signal);
      const captions = parseSrt(data.srtContent);
      const srtContent = captions.length > 0 ? captionsToSrt(captions) : data.srtContent;
      const vttContent = captionsToVtt(captions);
      const srtUrl = makeTextDownloadUrl(srtContent, 'text/plain');
      const vttUrl = makeTextDownloadUrl(vttContent, 'text/vtt');
      set({ captions, srtContent, mediaUrl: data.mediaUrl, srtDownloadUrl: srtUrl, vttDownloadUrl: vttUrl, exportStatus: 'Export complete.' });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        set({ exportStatus: 'Export canceled.' });
      } else {
        console.error(err);
        alert(err.message || 'An error occurred during export');
        set({ exportStatus: 'Export failed.' });
      }
    } finally {
      set({ isProcessing: false, exportAbortController: null } as Partial<EditorState>);
    }
  },
  cancelExport: () => {
    const controller = (get() as EditorState & { exportAbortController?: AbortController | null }).exportAbortController;
    controller?.abort();
    set({ isProcessing: false, exportStatus: 'Cancel requested.' });
  },
  updateCaptionText: (id: string, text: string) => {
    set(state => {
      const captions = state.captions.map(caption => caption.id === id ? { ...caption, text } : caption);
      const srtContent = captionsToSrt(captions);
      const vttContent = captionsToVtt(captions);
      return {
        captions,
        srtContent,
        srtDownloadUrl: makeTextDownloadUrl(srtContent, 'text/plain'),
        vttDownloadUrl: makeTextDownloadUrl(vttContent, 'text/vtt'),
      };
    });
  },
  createTextClipsFromCaptions: () => {
    set(state => {
      if (state.captions.length === 0) return state;
      let tracks = state.tracks;
      let textTrack = tracks.find(track => track.type === 'text');
      if (!textTrack) {
        textTrack = {
          id: Math.random().toString(36).substring(7),
          name: 'T1',
          type: 'text',
          order: tracks.length,
          muted: false,
          solo: false,
          locked: false,
        };
        tracks = [...tracks, textTrack];
      }
      const captionClips = state.captions.map(caption => {
        const placeholderFile = new File([], 'caption-overlay.txt', { type: 'text/plain' });
        return {
          id: Math.random().toString(36).substring(7),
          assetId: 'caption-' + Math.random().toString(36).substring(7),
          trackId: textTrack.id,
          file: placeholderFile,
          type: 'text' as const,
          duration: Math.max(0.1, caption.end - caption.start),
          startTime: caption.start,
          mediaOffset: 0,
          audio: { volume: 0, mute: true, fadeIn: 0, fadeOut: 0 },
          transform: { scale: 100, rotation: 0, opacity: 100, flipX: false, flipY: false },
          textData: {
            ...DEFAULT_TEXT_DATA,
            content: caption.text,
            fontSize: 42,
            bgOpacity: 0.45,
          }
        };
      });
      return {
        ...withHistory(state),
        tracks,
        clips: [...state.clips, ...captionClips],
        selectedClipId: captionClips[0]?.id ?? state.selectedClipId,
      };
    });
  }
}));
