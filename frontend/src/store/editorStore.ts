import { create } from 'zustand';
import type { MediaAsset, TimelineClip, TimelineTrack, MediaType } from '../types';
import { getMediaDuration } from '../lib/utils/media';
import { exportTimeline } from '../lib/api/client';

type EditorState = {
  // Media Pool
  assets: MediaAsset[];
  addAssets: (files: File[]) => void;
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
  removeClip: (id: string) => void;
  updateClipStartTime: (id: string, deltaX: number) => void;
  updateClipTrack: (id: string, trackId: string, deltaX: number) => void;

  // Playback
  isPlaying: boolean;
  playheadTime: number;
  togglePlayback: () => void;
  setPlayheadTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;

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
  addAssets: (files: File[]) => {
    const newAssets: MediaAsset[] = [];
    for (const f of files) {
      if (f.type.startsWith('audio/') || f.name.match(/\.(mp3|wav|m4a|flac|ogg|aac)$/i)) {
        newAssets.push({ id: Math.random().toString(36).substring(7), file: f, type: 'audio' });
      } else if (f.type.startsWith('video/') || f.type.startsWith('image/') || f.name.match(/\.(mp4|mov|mkv|avi|webm|jpg|jpeg|png|webp|gif)$/i)) {
        newAssets.push({ id: Math.random().toString(36).substring(7), file: f, type: 'visual' });
      } else {
        const ext = f.name.split('.').pop()?.toLowerCase();
        if (['mp4','mov','mkv','avi','jpg','png'].includes(ext || '')) {
            newAssets.push({ id: Math.random().toString(36).substring(7), file: f, type: 'visual' });
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
      const newName = `${type === 'visual' ? 'V' : 'A'}${typeTracks.length + 1}`;
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
    
    // Find appropriate track
    let targetTrackId = trackId;
    if (!targetTrackId) {
      const matchingTrack = state.tracks.find(t => t.type === asset.type);
      if (matchingTrack) targetTrackId = matchingTrack.id;
    }
    
    if (!targetTrackId) return; // No track available

    let targetStartTime = 0;
    if (startTimeX !== undefined) {
      targetStartTime = startTimeX / state.zoom;
    } else {
      // Append to the end of the target track
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
      startTime: Math.max(0, targetStartTime)
    };
    
    set({ clips: [...state.clips, newClip] });
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

  // --- Playback ---
  isPlaying: false,
  playheadTime: 0,
  togglePlayback: () => set(state => ({ isPlaying: !state.isPlaying })),
  setPlayheadTime: (time: number) => set({ playheadTime: time }),
  setIsPlaying: (playing: boolean) => set({ isPlaying: playing }),

  // --- Export ---
  isProcessing: false,
  srtContent: null,
  srtDownloadUrl: null,
  mediaUrl: null,
  exportSequence: async () => {
    set({ isProcessing: true });
    try {
      const data = await exportTimeline(get().clips);
      
      const srtBlob = new Blob([data.srtContent], { type: 'text/plain' });
      const srtUrl = window.URL.createObjectURL(srtBlob);
      
      set({ 
        srtContent: data.srtContent,
        mediaUrl: data.mediaUrl,
        srtDownloadUrl: srtUrl
      });
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'An error occurred during export');
    } finally {
      set({ isProcessing: false });
    }
  }
}));
