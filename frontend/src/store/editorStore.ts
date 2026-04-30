import { create } from 'zustand';
import type {
  MediaAsset,
  TimelineClip,
  TimelineTrack,
  MediaType,
  TextData,
  ExportSettings,
  CaptionSegment,
  GeneratedMediaAsset,
  GenerationJob,
  KeyframeProperty,
  ProjectDetail,
  ProjectSummary,
  StoryboardScene,
  StoryboardSettings,
} from '../types';
import { getMediaDuration, generateThumbnail, generateWaveform, generateFilmstrip } from '../lib/utils/media';
import {
  createGenerationJobs,
  createProjectRecord,
  createStoryboardFromAudio,
  createStoryboardFromTranscript,
  chooseProjectDirectory,
  exportTimeline,
  getProjectRecord,
  listProjectRecords,
  listGeneratedMediaAssets,
  listGenerationJobs,
  loadProjectRecordFromPath,
  pauseGenerationBatch,
  retryGenerationJob as retryGenerationJobRequest,
  resolveBackendMediaUrl,
  resumeGenerationBatch,
  saveProjectRecord,
  storeRemoteGenerationJob,
  transcribeMedia,
} from '../lib/api/client';
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

const DEFAULT_STORYBOARD_SETTINGS: StoryboardSettings = {
  sourceMediaId: null,
  provider: 'meta',
  visualType: 'image',
  aspectRatio: '16:9',
  style: 'cinematic realistic',
};

const DEFAULT_PROJECT_NAME = 'Untitled Project';
const PROJECT_POINTER_KEY = 'neuralscribe.currentProject';

type StoryboardSource = {
  id: string;
  file: File;
  name: string;
};

type TimelineSnapshot = {
  clips: TimelineClip[];
  tracks: TimelineTrack[];
};

type SerializableClip = Omit<TimelineClip, 'file'> & {
  fileName: string;
  fileType: string;
  fileSize: number;
};

type SerializableAsset = Omit<MediaAsset, 'file' | 'thumbnailUrl' | 'waveform' | 'filmstrip'> & {
  fileName: string;
  fileType: string;
  fileSize: number;
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
  generation: clip.generation ? { ...clip.generation } : undefined,
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

const loadProjectPointer = (): ProjectSummary | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PROJECT_POINTER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProjectSummary;
    if (!parsed?.id || !parsed?.name) return null;
    return parsed;
  } catch {
    return null;
  }
};

const rememberProjectPointer = (project: ProjectSummary) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PROJECT_POINTER_KEY, JSON.stringify(project));
};

const clearProjectPointer = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PROJECT_POINTER_KEY);
};

const serializeAsset = (asset: MediaAsset): SerializableAsset => ({
  id: asset.id,
  type: asset.type,
  mediaKind: asset.mediaKind,
  fileName: asset.file.name,
  fileType: asset.file.type,
  fileSize: asset.file.size,
});

const serializeClip = (clip: TimelineClip): SerializableClip => {
  const { file, ...clipData } = clip;
  return {
    ...clipData,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
  };
};

const isTrackLocked = (tracks: TimelineTrack[], trackId: string) => Boolean(tracks.find(track => track.id === trackId)?.locked);

const hasPlayableAudioSource = (clip: TimelineClip): boolean => {
  if (clip.type === 'audio') return true;
  if (clip.type !== 'visual') return false;
  const fileType = clip.file.type.toLowerCase();
  const fileName = clip.file.name.toLowerCase();
  return !(fileType.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i.test(fileName));
};

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

export type EditorState = {
  // Project
  currentProject: ProjectSummary | null;
  projectName: string;
  projectDirectory: string;
  availableProjects: ProjectSummary[];
  projectStatus: string | null;
  isSavingProject: boolean;
  isLoadingProjects: boolean;
  setProjectName: (name: string) => void;
  setProjectDirectory: (directory: string) => void;
  chooseProjectFolder: () => Promise<void>;
  createProject: () => Promise<ProjectSummary | null>;
  refreshProjects: () => Promise<void>;
  loadProject: (projectId: string) => Promise<void>;
  loadProjectFromPath: (path: string) => Promise<void>;
  newProject: () => void;
  saveProject: () => Promise<ProjectSummary | null>;

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
  transcribeSelectedMedia: () => Promise<void>;
  cancelExport: () => void;
  updateCaptionText: (id: string, text: string) => void;
  createTextClipsFromCaptions: () => void;

  // Auto Video Storyboard
  storyboardSettings: StoryboardSettings;
  storyboardScenes: StoryboardScene[];
  currentGenerationBatchId: string | null;
  generationJobs: GenerationJob[];
  generatedMediaAssets: GeneratedMediaAsset[];
  isGeneratingStoryboard: boolean;
  isSyncingGeneration: boolean;
  isGenerationBatchPaused: boolean;
  storyboardStatus: string | null;
  setStoryboardSettings: (settings: Partial<StoryboardSettings>) => void;
  generateStoryboard: () => Promise<void>;
  updateStoryboardScene: (id: string, updates: Partial<StoryboardScene>) => void;
  addStoryboardScene: () => void;
  duplicateStoryboardScene: (id: string) => void;
  deleteStoryboardScene: (id: string) => void;
  approveStoryboard: () => void;
  createJobsFromApprovedScenes: () => Promise<void>;
  refreshGenerationJobs: () => Promise<void>;
  pauseGenerationBatch: () => Promise<void>;
  resumeGenerationBatch: () => Promise<void>;
  retryGenerationJob: (jobId: string) => Promise<void>;
  syncGenerationBatch: (silent?: boolean) => Promise<void>;
  importGenerationVariant: (jobId: string, variantUrl?: string) => Promise<void>;
  importCompletedGenerationMedia: () => Promise<void>;
};

const buildProjectSnapshot = (state: EditorState): Record<string, unknown> => ({
  version: 1,
  savedAt: new Date().toISOString(),
  project: state.currentProject,
  assets: state.assets.map(serializeAsset),
  tracks: state.tracks,
  clips: state.clips.map(serializeClip),
  captions: state.captions,
  exportSettings: state.exportSettings,
  storyboardSettings: state.storyboardSettings,
  storyboardScenes: state.storyboardScenes,
  currentGenerationBatchId: state.currentGenerationBatchId,
  generationJobs: state.generationJobs,
  generatedMediaAssets: state.generatedMediaAssets,
  isGenerationBatchPaused: state.isGenerationBatchPaused,
});

const persistProjectSnapshot = async (state: EditorState): Promise<ProjectSummary> => {
  const name = state.projectName.trim() || DEFAULT_PROJECT_NAME;
  const project = state.currentProject;
  if (!project) {
    throw new Error('Create or load a project before saving.');
  }
  let savedProject: ProjectSummary;
  try {
    savedProject = await saveProjectRecord(project.id, name, buildProjectSnapshot({
      ...state,
      currentProject: project,
      projectName: name,
    }));
  } catch (error) {
    if (!state.currentProject) throw error;
    const replacementProject = await createProjectRecord(name);
    savedProject = await saveProjectRecord(replacementProject.id, name, buildProjectSnapshot({
      ...state,
      currentProject: replacementProject,
      projectName: name,
    }));
  }
  rememberProjectPointer(savedProject);
  return savedProject;
};

const getTranscriptSourceClip = (state: Pick<EditorState, 'clips' | 'selectedClipId'>): TimelineClip | null => {
  const selectedClip = state.clips.find(clip => clip.id === state.selectedClipId);
  if (selectedClip && hasPlayableAudioSource(selectedClip)) return selectedClip;
  return state.clips.find(hasPlayableAudioSource) ?? null;
};

const hasPlayableAssetSource = (asset: MediaAsset): boolean => asset.mediaKind === 'audio' || asset.mediaKind === 'video';

export const getStoryboardSources = (state: Pick<EditorState, 'assets' | 'clips'>): StoryboardSource[] => {
  const clipSources = state.clips
    .filter(hasPlayableAudioSource)
    .map(clip => ({
      id: `clip:${clip.id}`,
      file: clip.file,
      name: `Timeline: ${clip.file.name}`,
    }));
  const clipAssetIds = new Set(state.clips.map(clip => clip.assetId));
  const assetSources = state.assets
    .filter(asset => hasPlayableAssetSource(asset) && !clipAssetIds.has(asset.id))
    .map(asset => ({
      id: `asset:${asset.id}`,
      file: asset.file,
      name: `Media Pool: ${asset.file.name}`,
    }));
  return [...clipSources, ...assetSources];
};

const getConfiguredStoryboardSource = (
  state: Pick<EditorState, 'assets' | 'clips' | 'selectedClipId' | 'storyboardSettings'>
): StoryboardSource | null => {
  const sources = getStoryboardSources(state);
  const configuredSource = state.storyboardSettings.sourceMediaId
    ? sources.find(source => source.id === state.storyboardSettings.sourceMediaId)
    : null;
  if (configuredSource) return configuredSource;

  const selectedClip = getTranscriptSourceClip(state);
  if (selectedClip) {
    return {
      id: `clip:${selectedClip.id}`,
      file: selectedClip.file,
      name: `Timeline: ${selectedClip.file.name}`,
    };
  }

  return sources[0] ?? null;
};

const normalizeStoryboardScenes = (scenes: StoryboardScene[], fallback: StoryboardSettings): StoryboardScene[] => {
  return scenes.map((scene, index) => ({
    ...scene,
    id: scene.id || `scene-${index + 1}`,
    start: Number(scene.start.toFixed(3)),
    end: Number(Math.max(scene.start + 0.1, scene.end).toFixed(3)),
    visualType: scene.visualType || fallback.visualType,
    negativePrompt: scene.negativePrompt || 'low quality, blurry, distorted, watermark, readable text',
    style: scene.style || fallback.style,
    camera: scene.camera || (scene.visualType === 'video' ? 'slow cinematic push-in' : 'static'),
    status: scene.status || 'draft',
  }));
};

const makeId = () => Math.random().toString(36).substring(7);

const makeTrack = (tracks: TimelineTrack[], type: MediaType): TimelineTrack => {
  const typeTracks = tracks.filter(track => track.type === type);
  const prefix = type === 'visual' ? 'V' : type === 'audio' ? 'A' : 'T';
  return {
    id: makeId(),
    name: `${prefix}${typeTracks.length + 1}`,
    type,
    order: tracks.length,
    muted: false,
    solo: false,
    locked: false,
  };
};

const makeDefaultTracks = (): TimelineTrack[] => [
  { id: 'v1', name: 'V1', type: 'visual', order: 0, muted: false, solo: false, locked: false },
  { id: 'a1', name: 'A1', type: 'audio', order: 1, muted: false, solo: false, locked: false },
];

const getGeneratedFileName = (asset: GeneratedMediaAsset, resultUrl: string): string => {
  const fallbackExtension = asset.mediaType === 'video' ? 'mp4' : 'png';
  try {
    const parsed = new URL(resultUrl, window.location.href);
    const name = parsed.pathname.split('/').filter(Boolean).pop();
    if (name) return name;
  } catch {
    const name = resultUrl.split('?')[0].split('/').filter(Boolean).pop();
    if (name) return name;
  }
  return `${asset.jobId}.${fallbackExtension}`;
};

const getGeneratedFallbackMime = (asset: GeneratedMediaAsset): string => {
  return asset.mediaType === 'video' ? 'video/mp4' : 'image/png';
};

const isRemoteMediaUrl = (resultUrl: string): boolean => /^https?:\/\//i.test(resultUrl);

const getAssetVariantUrls = (asset: GeneratedMediaAsset): string[] => {
  const urls = asset.resultVariants?.map(variant => variant.url).filter(Boolean) ?? [];
  if (asset.resultUrl && !urls.includes(asset.resultUrl)) urls.unshift(asset.resultUrl);
  return [...new Set(urls)];
};

const makeGenerationSceneKey = (
  projectId: string | null | undefined,
  batchId: string,
  sceneId: string,
): string => `${projectId ?? 'legacy'}:${batchId}:${sceneId}`;

const fetchGeneratedMediaFile = async (asset: GeneratedMediaAsset): Promise<File> => {
  if (!asset.resultUrl) {
    throw new Error('Generated media has no result URL.');
  }
  const response = await fetch(resolveBackendMediaUrl(asset.resultUrl));
  if (!response.ok) {
    throw new Error(`Generated media download failed (${response.status}).`);
  }
  const blob = await response.blob();
  const fileType = blob.type || getGeneratedFallbackMime(asset);
  return new File([blob], getGeneratedFileName(asset, asset.resultUrl), { type: fileType });
};

const generatedMetadata = (asset: GeneratedMediaAsset): NonNullable<TimelineClip['generation']> => ({
  jobId: asset.jobId,
  batchId: asset.batchId,
  projectId: asset.projectId,
  sceneId: asset.sceneId,
  provider: asset.provider,
  status: asset.status,
  prompt: asset.prompt,
  transcript: asset.transcript,
});

const restoreProjectWorkspace = async (project: ProjectDetail): Promise<Partial<EditorState>> => {
  const saved = project.state as any;
  const tracks = Array.isArray(saved?.tracks) ? saved.tracks as TimelineTrack[] : makeDefaultTracks();
  const captions = Array.isArray(saved?.captions) ? saved.captions as CaptionSegment[] : [];
  const storyboardScenes = Array.isArray(saved?.storyboardScenes) ? saved.storyboardScenes as StoryboardScene[] : [];
  const generationJobs = Array.isArray(saved?.generationJobs) ? saved.generationJobs as GenerationJob[] : [];
  const generatedMediaAssets = Array.isArray(saved?.generatedMediaAssets) ? saved.generatedMediaAssets as GeneratedMediaAsset[] : [];
  const generatedAssetsByJob = new Map(generatedMediaAssets.map(asset => [asset.jobId, asset]));
  const restoredAssets: MediaAsset[] = [];
  const restoredClips: TimelineClip[] = [];

  for (const savedClip of Array.isArray(saved?.clips) ? saved.clips : []) {
    if (!savedClip || typeof savedClip !== 'object') continue;
    if (savedClip.type === 'text') {
      restoredClips.push({
        ...savedClip,
        file: new File([], savedClip.fileName || 'text-overlay.txt', { type: savedClip.fileType || 'text/plain' }),
      } as TimelineClip);
      continue;
    }

    const generated = savedClip.generation?.jobId
      ? generatedAssetsByJob.get(savedClip.generation.jobId)
      : null;
    if (!generated?.resultUrl) continue;

    try {
      const file = await fetchGeneratedMediaFile(generated);
      const mediaKind = generated.mediaType === 'video' ? 'video' : 'image';
      const thumbnailUrl = await generateThumbnail(file, mediaKind);
      const restoredAsset: MediaAsset = {
        id: savedClip.assetId || `generated-${generated.jobId}`,
        file,
        type: 'visual',
        mediaKind,
        thumbnailUrl,
      };
      if (mediaKind === 'video') {
        const duration = await getMediaDuration(file, 'visual');
        const framesCount = Math.min(50, Math.max(5, Math.ceil(duration / 2)));
        restoredAsset.filmstrip = await generateFilmstrip(file, duration, framesCount);
      }
      restoredAssets.push(restoredAsset);
      restoredClips.push({ ...savedClip, file } as TimelineClip);
    } catch (error) {
      console.warn('Could not restore generated clip from project file.', error);
    }
  }

  return {
    currentProject: project,
    projectName: project.name,
    projectDirectory: project.folderPath,
    projectStatus: `Loaded project: ${project.name}`,
    assets: restoredAssets,
    tracks,
    clips: restoredClips,
    selectedClipId: null,
    historyPast: [],
    historyFuture: [],
    captions,
    exportSettings: saved?.exportSettings ?? { resolution: '1080p', aspectRatio: '16:9', quality: 'standard', format: 'video' },
    storyboardSettings: saved?.storyboardSettings ?? DEFAULT_STORYBOARD_SETTINGS,
    storyboardScenes,
    currentGenerationBatchId: saved?.currentGenerationBatchId ?? null,
    generationJobs,
    generatedMediaAssets,
    isGenerationBatchPaused: Boolean(saved?.isGenerationBatchPaused),
    mediaUrl: null,
    srtContent: null,
    srtDownloadUrl: null,
    vttDownloadUrl: null,
  };
};

const makeGeneratedPlaceholderClip = (asset: GeneratedMediaAsset, trackId: string): TimelineClip => {
  const label = asset.status === 'failed' ? 'Generation failed' : 'Manual action needed';
  const detail = asset.error || asset.prompt || asset.transcript || asset.sceneId;
  const placeholderFile = new File([], `${asset.jobId}-placeholder.txt`, { type: 'text/plain' });
  return {
    id: makeId(),
    assetId: `generated-placeholder-${asset.jobId}`,
    trackId,
    file: placeholderFile,
    type: 'text',
    duration: Math.max(0.1, asset.duration),
    startTime: Math.max(0, asset.start),
    mediaOffset: 0,
    audio: { volume: 0, mute: true, fadeIn: 0, fadeOut: 0 },
    transform: { scale: 100, rotation: 0, opacity: 100, flipX: false, flipY: false },
    textData: {
      ...DEFAULT_TEXT_DATA,
      content: `${label}\n${detail}`.slice(0, 180),
      fontSize: 34,
      y: 50,
      bgOpacity: 0.55,
    },
    generation: generatedMetadata(asset),
  };
};

const getGeneratedAssetRank = (asset: GeneratedMediaAsset): number => {
  const statusScore = asset.status === 'completed'
    ? 3
    : asset.status === 'manual_action_required'
      ? 2
      : asset.status === 'failed'
        ? 1
        : 0;
  return statusScore * 10 + (asset.localPath ? 1 : 0);
};

const selectGeneratedAssetsForImport = (
  assets: GeneratedMediaAsset[],
  existingClips: TimelineClip[],
): GeneratedMediaAsset[] => {
  const importedJobIds = new Set(
    existingClips
      .map(clip => clip.generation?.jobId)
      .filter((jobId): jobId is string => Boolean(jobId))
  );
  const importedSceneIds = new Set(
    existingClips
      .map(clip => clip.generation
        ? makeGenerationSceneKey(clip.generation.projectId, clip.generation.batchId, clip.generation.sceneId)
        : null
      )
      .filter((sceneKey): sceneKey is string => Boolean(sceneKey))
  );
  const bestByScene = new Map<string, GeneratedMediaAsset>();

  for (const asset of assets) {
    const sceneKey = makeGenerationSceneKey(asset.projectId, asset.batchId, asset.sceneId);
    if (importedJobIds.has(asset.jobId) || importedSceneIds.has(sceneKey)) continue;
    const existing = bestByScene.get(asset.sceneId);
    if (!existing || getGeneratedAssetRank(asset) >= getGeneratedAssetRank(existing)) {
      bestByScene.set(asset.sceneId, asset);
    }
  }

  return [...bestByScene.values()].sort((a, b) => a.start - b.start || a.sceneId.localeCompare(b.sceneId));
};

const getCurrentGenerationBatchId = (
  state: Pick<EditorState, 'currentGenerationBatchId' | 'generationJobs'>
): string | null => state.currentGenerationBatchId ?? state.generationJobs[0]?.batchId ?? null;

const getSceneStatusFromJob = (job: GenerationJob): StoryboardScene['status'] => {
  if (job.status === 'completed') return 'completed';
  if (job.status === 'running') return 'generating';
  if (job.status === 'queued') return 'queued';
  if (job.status === 'failed' || job.status === 'manual_action_required') return 'failed';
  return 'placeholder';
};

const mergeSceneStatuses = (
  scenes: StoryboardScene[],
  jobs: GenerationJob[],
  clips: TimelineClip[],
  batchId: string | null,
): StoryboardScene[] => {
  if (!batchId) return scenes;
  const jobsByScene = new Map(jobs.map(job => [job.sceneId, job]));
  const importedScenes = new Set(
    clips
      .filter(clip => clip.generation?.batchId === batchId)
      .map(clip => makeGenerationSceneKey(clip.generation?.projectId, clip.generation!.batchId, clip.generation!.sceneId))
  );

  return scenes.map(scene => {
    const job = jobsByScene.get(scene.id);
    if (!job) return scene;
    return {
      ...scene,
      status: importedScenes.has(makeGenerationSceneKey(job.projectId, job.batchId, scene.id)) ? 'completed' : getSceneStatusFromJob(job),
    };
  });
};

const rememberedProject = loadProjectPointer();

export const useEditorStore = create<EditorState>((set, get) => ({
  // --- Project ---
  currentProject: null,
  projectName: DEFAULT_PROJECT_NAME,
  projectDirectory: '',
  availableProjects: rememberedProject ? [rememberedProject] : [],
  projectStatus: 'Create or load a project to start.',
  isSavingProject: false,
  isLoadingProjects: false,
  setProjectName: (name) => set({ projectName: name }),
  setProjectDirectory: (directory) => set({ projectDirectory: directory }),
  chooseProjectFolder: async () => {
    set({ isLoadingProjects: true, projectStatus: 'Waiting for directory selection...' } as Partial<EditorState>);
    try {
      const directory = await chooseProjectDirectory();
      set({
        projectDirectory: directory,
        projectStatus: `Selected folder: ${directory}`,
      });
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Directory selection failed');
      set({ projectStatus: 'Directory selection canceled.' });
    } finally {
      set({ isLoadingProjects: false });
    }
  },
  createProject: async () => {
    const state = get();
    const name = state.projectName.trim() || DEFAULT_PROJECT_NAME;
    const parentDirectory = state.projectDirectory.trim();
    if (!parentDirectory) {
      alert('Choose a project directory first.');
      return null;
    }
    set({ isSavingProject: true, projectStatus: 'Creating project...' } as Partial<EditorState>);
    try {
      const project = await createProjectRecord(name, parentDirectory);
      rememberProjectPointer(project);
      set({
        currentProject: project,
        projectName: project.name,
        projectDirectory: project.folderPath,
        availableProjects: [project, ...state.availableProjects.filter(existing => existing.id !== project.id)],
        projectStatus: `Project created: ${project.folderPath}`,
        assets: [],
        tracks: makeDefaultTracks(),
        clips: [],
        selectedClipId: null,
        historyPast: [],
        historyFuture: [],
        captions: [],
        storyboardScenes: [],
        currentGenerationBatchId: null,
        generationJobs: [],
        generatedMediaAssets: [],
        isGenerationBatchPaused: false,
      } as Partial<EditorState>);
      return project;
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Project creation failed');
      set({ projectStatus: 'Project creation failed.' });
      return null;
    } finally {
      set({ isSavingProject: false });
    }
  },
  refreshProjects: async () => {
    set({ isLoadingProjects: true });
    try {
      const response = await listProjectRecords();
      set({ availableProjects: response.projects });
    } catch (err: any) {
      console.error(err);
      set({ projectStatus: err.message || 'Could not load previous projects.' });
    } finally {
      set({ isLoadingProjects: false });
    }
  },
  loadProject: async (projectId) => {
    set({ isLoadingProjects: true, projectStatus: 'Loading project...' } as Partial<EditorState>);
    try {
      const project = await getProjectRecord(projectId);
      const restored = await restoreProjectWorkspace(project);
      rememberProjectPointer(project);
      set(restored);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Project load failed');
      set({ projectStatus: 'Project load failed.' });
    } finally {
      set({ isLoadingProjects: false });
    }
  },
  loadProjectFromPath: async (path) => {
    if (!path.trim()) {
      alert('Enter a project folder or project.json path.');
      return;
    }
    set({ isLoadingProjects: true, projectStatus: 'Loading project...' } as Partial<EditorState>);
    try {
      const project = await loadProjectRecordFromPath(path.trim());
      const restored = await restoreProjectWorkspace(project);
      rememberProjectPointer(project);
      set(restored);
      await get().refreshProjects();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Project load failed');
      set({ projectStatus: 'Project load failed.' });
    } finally {
      set({ isLoadingProjects: false });
    }
  },
  newProject: () => {
    const confirmed = window.confirm('Start a new empty project? Save the current project first if you need to keep it.');
    if (!confirmed) return;
    clearProjectPointer();
    set({
      currentProject: null,
      projectName: DEFAULT_PROJECT_NAME,
      projectDirectory: '',
      projectStatus: 'Choose a directory and create a project to start.',
      assets: [],
      tracks: makeDefaultTracks(),
      clips: [],
      selectedClipId: null,
      zoom: 20,
      snapEnabled: true,
      historyPast: [],
      historyFuture: [],
      isPlaying: false,
      playheadTime: 0,
      mediaUrl: null,
      captions: [],
      srtContent: null,
      srtDownloadUrl: null,
      vttDownloadUrl: null,
      storyboardSettings: DEFAULT_STORYBOARD_SETTINGS,
      storyboardScenes: [],
      currentGenerationBatchId: null,
      generationJobs: [],
      generatedMediaAssets: [],
      isGenerationBatchPaused: false,
      storyboardStatus: null,
    } as Partial<EditorState>);
  },
  saveProject: async () => {
    if (!get().currentProject) {
      alert('Create or load a project before saving.');
      return null;
    }
    set({ isSavingProject: true, projectStatus: 'Saving project...' } as Partial<EditorState>);
    try {
      const savedProject = await persistProjectSnapshot(get());
      set({
        currentProject: savedProject,
        projectName: savedProject.name,
        projectStatus: `Project saved to ${savedProject.folderPath}`,
      });
      return savedProject;
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Project save failed');
      set({ projectStatus: 'Project save failed.' });
      return null;
    } finally {
      set({ isSavingProject: false });
    }
  },

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
  tracks: makeDefaultTracks(),
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
  storyboardSettings: DEFAULT_STORYBOARD_SETTINGS,
  storyboardScenes: [],
  currentGenerationBatchId: null,
  generationJobs: [],
  generatedMediaAssets: [],
  isGeneratingStoryboard: false,
  isSyncingGeneration: false,
  isGenerationBatchPaused: false,
  storyboardStatus: null,
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
  transcribeSelectedMedia: async () => {
    const state = get();
    const sourceClip = getTranscriptSourceClip(state);
    if (!sourceClip) {
      alert('Add or select an audio/video clip to generate a transcript.');
      return;
    }

    const abortController = new AbortController();
    set({
      isProcessing: true,
      exportStatus: `Transcribing ${sourceClip.file.name}...`,
      exportAbortController: abortController,
      mediaUrl: null,
    } as Partial<EditorState>);

    try {
      const data = await transcribeMedia(sourceClip.file, abortController.signal);
      const captions = data.segments.map((segment, index) => ({
        ...segment,
        id: segment.id || `caption-${index + 1}`,
        index: index + 1,
      }));
      const srtContent = captions.length > 0 ? captionsToSrt(captions) : data.srtContent;
      const vttContent = captions.length > 0 ? captionsToVtt(captions) : data.vttContent;
      set({
        captions,
        srtContent,
        srtDownloadUrl: makeTextDownloadUrl(srtContent, 'text/plain'),
        vttDownloadUrl: makeTextDownloadUrl(vttContent, 'text/vtt'),
        exportStatus: captions.length > 0 ? 'Transcript ready.' : 'No speech found in this media.',
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        set({ exportStatus: 'Transcript canceled.' });
      } else {
        console.error(err);
        alert(err.message || 'An error occurred during transcription');
        set({ exportStatus: 'Transcript failed.' });
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
  },

  setStoryboardSettings: (settings) => {
    set(state => ({
      storyboardSettings: { ...state.storyboardSettings, ...settings },
    }));
  },
  generateStoryboard: async () => {
    const state = get();
    const settings = state.storyboardSettings;
    const source = getConfiguredStoryboardSource(state);
    const timedSegments = state.captions
      .filter(caption => caption.text.trim())
      .map(caption => ({
        start: caption.start,
        end: caption.end,
        text: caption.text.trim(),
      }));
    const transcript = timedSegments.map(segment => segment.text).join(' ').trim();

    if (!transcript && !source) {
      alert('Generate a transcript or select an audio/video clip first.');
      return;
    }

    set({
      isGeneratingStoryboard: true,
      storyboardStatus: transcript ? 'Generating storyboard from captions...' : `Transcribing and planning ${source?.file.name}...`,
    } as Partial<EditorState>);

    try {
      const response = transcript
        ? await createStoryboardFromTranscript(
            transcript,
            timedSegments,
            {
              provider: settings.provider,
              preferredVisualType: settings.visualType,
              style: settings.style,
            }
          )
        : await createStoryboardFromAudio(
            source!.file,
            {
              provider: settings.provider,
              preferredVisualType: settings.visualType,
              style: settings.style,
            }
          );

      const scenes = normalizeStoryboardScenes(response.scenes, settings);
      set({
        storyboardScenes: scenes,
        currentGenerationBatchId: null,
        generationJobs: [],
        generatedMediaAssets: [],
        isGenerationBatchPaused: false,
        storyboardSettings: {
          ...settings,
          sourceMediaId: source?.id ?? settings.sourceMediaId,
        },
        storyboardStatus: `Storyboard ready: ${scenes.length} scenes (${response.usedLlmMode}).`,
      });
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Storyboard generation failed');
      set({ storyboardStatus: 'Storyboard generation failed.' });
    } finally {
      set({ isGeneratingStoryboard: false } as Partial<EditorState>);
    }
  },
  updateStoryboardScene: (id, updates) => {
    set(state => ({
      storyboardScenes: state.storyboardScenes.map(scene => {
        if (scene.id !== id) return scene;
        const next = { ...scene, ...updates };
        if (updates.start !== undefined || updates.end !== undefined) {
          next.start = Math.max(0, Number(next.start) || 0);
          next.end = Math.max(next.start + 0.1, Number(next.end) || next.start + 0.1);
        }
        return next;
      }),
      storyboardStatus: 'Storyboard edited.',
    }));
  },
  addStoryboardScene: () => {
    set(state => {
      const previous = state.storyboardScenes[state.storyboardScenes.length - 1];
      const start = previous ? previous.end : 0;
      const duration = previous ? Math.max(0.1, previous.end - previous.start) : 5;
      const newScene: StoryboardScene = {
        id: `scene-${Math.random().toString(36).substring(7)}`,
        start: Number(start.toFixed(3)),
        end: Number((start + duration).toFixed(3)),
        transcript: '',
        visualType: state.storyboardSettings.visualType,
        prompt: `${state.storyboardSettings.style}, clear visual scene for this part of the narration.`,
        negativePrompt: 'low quality, blurry, distorted, watermark, readable text',
        style: state.storyboardSettings.style,
        camera: state.storyboardSettings.visualType === 'video' ? 'slow cinematic push-in' : 'static',
        status: 'draft',
      };
      return {
        storyboardScenes: [...state.storyboardScenes, newScene],
        storyboardStatus: 'Scene added.',
      };
    });
  },
  duplicateStoryboardScene: (id) => {
    set(state => {
      const sceneIndex = state.storyboardScenes.findIndex(scene => scene.id === id);
      if (sceneIndex === -1) return state;
      const scene = state.storyboardScenes[sceneIndex];
      const duration = Math.max(0.1, scene.end - scene.start);
      const duplicate: StoryboardScene = {
        ...scene,
        id: `scene-${Math.random().toString(36).substring(7)}`,
        start: Number(scene.end.toFixed(3)),
        end: Number((scene.end + duration).toFixed(3)),
        status: 'draft',
      };
      const storyboardScenes = [...state.storyboardScenes];
      storyboardScenes.splice(sceneIndex + 1, 0, duplicate);
      return { storyboardScenes, storyboardStatus: 'Scene duplicated.' };
    });
  },
  deleteStoryboardScene: (id) => {
    set(state => ({
      storyboardScenes: state.storyboardScenes.filter(scene => scene.id !== id),
      storyboardStatus: 'Scene deleted.',
    }));
  },
  approveStoryboard: () => {
    set(state => ({
      storyboardScenes: state.storyboardScenes.map(scene => ({ ...scene, status: 'approved' })),
      storyboardStatus: 'Storyboard approved. Ready for generation queue.',
    }));
  },
  createJobsFromApprovedScenes: async () => {
    const state = get();
    if (!state.currentProject) {
      alert('Create or load a project before creating generation jobs.');
      return;
    }
    const approvedScenes = state.storyboardScenes.filter(scene => scene.status === 'approved');
    if (approvedScenes.length === 0) {
      alert('Approve storyboard scenes before creating generation jobs.');
      return;
    }

    set({ storyboardStatus: 'Saving project and creating generation jobs...' });
    try {
      const project = await persistProjectSnapshot(get());
      set({
        currentProject: project,
        projectName: project.name,
        projectStatus: `Project folder ready: ${project.generatedMediaPath}`,
      });
      const response = await createGenerationJobs(
        approvedScenes,
        state.storyboardSettings.provider,
        state.storyboardSettings.aspectRatio,
        project.id,
      );
      const batchId = response.batchId ?? response.jobs[0]?.batchId ?? null;
      set({
        currentGenerationBatchId: batchId,
        generationJobs: response.jobs,
        generatedMediaAssets: [],
        isGenerationBatchPaused: Boolean(response.batchPaused),
        storyboardScenes: mergeSceneStatuses(state.storyboardScenes, response.jobs, state.clips, batchId),
        storyboardStatus: `Created ${response.jobs.length} generation jobs.`,
      });
      void get().saveProject();
      void get().syncGenerationBatch(true);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Generation job creation failed');
      set({ storyboardStatus: 'Generation job creation failed.' });
    }
  },
  refreshGenerationJobs: async () => {
    const batchId = getCurrentGenerationBatchId(get());
    if (!batchId) {
      set({ storyboardStatus: 'Create generation jobs before refreshing.' });
      return;
    }

    set({ storyboardStatus: 'Refreshing generation jobs...' });
    try {
      const projectId = get().currentProject?.id ?? null;
      const response = await listGenerationJobs({ batchId, projectId });
      set(state => ({
        currentGenerationBatchId: batchId,
        generationJobs: response.jobs,
        isGenerationBatchPaused: Boolean(response.batchPaused),
        storyboardScenes: mergeSceneStatuses(state.storyboardScenes, response.jobs, state.clips, batchId),
        storyboardStatus: `Generation jobs refreshed: ${response.jobs.length} total.`,
      }));
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Could not refresh generation jobs');
      set({ storyboardStatus: 'Generation job refresh failed.' });
    }
  },
  pauseGenerationBatch: async () => {
    const batchId = getCurrentGenerationBatchId(get());
    if (!batchId) {
      set({ storyboardStatus: 'Create generation jobs before pausing.' });
      return;
    }

    set({ storyboardStatus: 'Pausing generation batch...' });
    try {
      const projectId = get().currentProject?.id ?? null;
      const response = await pauseGenerationBatch(batchId, projectId);
      set(state => ({
        generationJobs: response.jobs,
        isGenerationBatchPaused: true,
        storyboardScenes: mergeSceneStatuses(state.storyboardScenes, response.jobs, state.clips, batchId),
        storyboardStatus: 'Generation batch paused. Running provider work may finish, but no new jobs will be claimed.',
      }));
      if (get().currentProject) void get().saveProject();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Could not pause generation batch');
      set({ storyboardStatus: 'Generation batch pause failed.' });
    }
  },
  resumeGenerationBatch: async () => {
    const batchId = getCurrentGenerationBatchId(get());
    if (!batchId) {
      set({ storyboardStatus: 'Create generation jobs before resuming.' });
      return;
    }

    set({ storyboardStatus: 'Resuming generation batch...' });
    try {
      const projectId = get().currentProject?.id ?? null;
      const response = await resumeGenerationBatch(batchId, projectId);
      set(state => ({
        generationJobs: response.jobs,
        isGenerationBatchPaused: false,
        storyboardScenes: mergeSceneStatuses(state.storyboardScenes, response.jobs, state.clips, batchId),
        storyboardStatus: 'Generation batch resumed.',
      }));
      if (get().currentProject) void get().saveProject();
      void get().syncGenerationBatch(true);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Could not resume generation batch');
      set({ storyboardStatus: 'Generation batch resume failed.' });
    }
  },
  retryGenerationJob: async (jobId) => {
    const batchId = getCurrentGenerationBatchId(get());
    set({ storyboardStatus: 'Retrying scene generation...' });
    try {
      const retriedJob = await retryGenerationJobRequest(jobId);
      set(state => {
        const removedClipIds = new Set(
          state.clips
            .filter(clip => clip.generation?.jobId === jobId)
            .map(clip => clip.id)
        );
        const removedAssetIds = new Set(
          state.clips
            .filter(clip => clip.generation?.jobId === jobId)
            .map(clip => clip.assetId)
        );
        const nextClips = state.clips.filter(clip => !removedClipIds.has(clip.id));
        const nextJobs = state.generationJobs.map(job => job.id === jobId ? retriedJob : job);
        const activeBatchId = batchId ?? retriedJob.batchId;
        return {
          ...withHistory(state),
          assets: state.assets.filter(asset => !removedAssetIds.has(asset.id)),
          clips: nextClips,
          selectedClipId: removedClipIds.has(state.selectedClipId || '') ? null : state.selectedClipId,
          generationJobs: nextJobs,
          generatedMediaAssets: state.generatedMediaAssets.filter(asset => asset.jobId !== jobId),
          storyboardScenes: mergeSceneStatuses(state.storyboardScenes, nextJobs, nextClips, activeBatchId),
          storyboardStatus: 'Scene queued for retry.',
        };
      });
      if (get().currentProject) void get().saveProject();
      void get().syncGenerationBatch(true);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Could not retry generation job');
      set({ storyboardStatus: 'Scene retry failed.' });
    }
  },
  syncGenerationBatch: async (silent = false) => {
    const batchId = getCurrentGenerationBatchId(get());
    if (!batchId) {
      if (!silent) set({ storyboardStatus: 'Create generation jobs before importing results.' });
      return;
    }
    if (get().isSyncingGeneration) return;

    set({
      isSyncingGeneration: true,
      ...(silent ? {} : { storyboardStatus: 'Checking generated scenes...' }),
    } as Partial<EditorState>);
    try {
      const projectId = get().currentProject?.id ?? null;
      const jobsResponse = await listGenerationJobs({ batchId, projectId });
      set(state => ({
        currentGenerationBatchId: batchId,
        generationJobs: jobsResponse.jobs,
        isGenerationBatchPaused: Boolean(jobsResponse.batchPaused),
        storyboardScenes: mergeSceneStatuses(state.storyboardScenes, jobsResponse.jobs, state.clips, batchId),
      }));

      const mediaResponse = await listGeneratedMediaAssets(true, { batchId, projectId });
      set({ generatedMediaAssets: mediaResponse.assets });
      const generatedAssets = selectGeneratedAssetsForImport(mediaResponse.assets, get().clips)
        .filter(asset => getAssetVariantUrls(asset).length <= 1);

      if (generatedAssets.length === 0) {
        if (!silent) set({ storyboardStatus: 'No new generated media to import.' });
        return;
      }

      let preparedTracks = [...get().tracks];
      let visualTrack = preparedTracks.find(track => track.type === 'visual');
      if (!visualTrack) {
        visualTrack = makeTrack(preparedTracks, 'visual');
        preparedTracks = [...preparedTracks, visualTrack];
      }

      let textTrack = preparedTracks.find(track => track.type === 'text');
      const ensureTextTrack = (): TimelineTrack => {
        if (!textTrack) {
          textTrack = makeTrack(preparedTracks, 'text');
          preparedTracks = [...preparedTracks, textTrack];
        }
        return textTrack;
      };

      const newAssets: MediaAsset[] = [];
      const newClips: TimelineClip[] = [];
      let importedCount = 0;
      let placeholderCount = 0;

      for (const generated of generatedAssets) {
        if (generated.status === 'completed' && generated.resultUrl) {
          let assetForImport = generated;
          if (isRemoteMediaUrl(generated.resultUrl) && !generated.localPath) {
            try {
              const storedJob = await storeRemoteGenerationJob(generated.jobId);
              assetForImport = {
                ...generated,
                status: storedJob.status,
                mediaType: storedJob.mediaType,
                resultUrl: storedJob.resultUrl,
                localPath: storedJob.localPath,
                error: storedJob.error,
                metadata: storedJob.metadata,
              };
            } catch (error) {
              console.warn('Backend could not store remote generated media, trying browser fetch.', error);
            }
          }

          try {
            const file = await fetchGeneratedMediaFile(assetForImport);
            const mediaKind = assetForImport.mediaType === 'video' ? 'video' : 'image';
            const thumbnailUrl = await generateThumbnail(file, mediaKind);
            const assetId = `generated-${assetForImport.jobId}`;
            const newAsset: MediaAsset = {
              id: assetId,
              file,
              type: 'visual',
              mediaKind,
              thumbnailUrl,
            };

            if (mediaKind === 'video') {
              const sourceDuration = await getMediaDuration(file, 'visual');
              const framesCount = Math.min(50, Math.max(5, Math.ceil(sourceDuration / 2)));
              newAsset.filmstrip = await generateFilmstrip(file, sourceDuration, framesCount);
            }

            newAssets.push(newAsset);
            newClips.push({
              id: makeId(),
              assetId,
              trackId: visualTrack.id,
              file,
              type: 'visual',
              duration: Math.max(0.1, assetForImport.duration),
              startTime: Math.max(0, assetForImport.start),
              mediaOffset: 0,
              transform: { scale: 100, rotation: 0, opacity: 100, flipX: false, flipY: false },
              color: { brightness: 100, contrast: 100, saturation: 100, exposure: 0, temperature: 0 },
              audio: { volume: 100, mute: false, fadeIn: 0, fadeOut: 0 },
              generation: generatedMetadata(assetForImport),
            });
            importedCount += 1;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Generated media could not be imported.';
            newClips.push(makeGeneratedPlaceholderClip(
              { ...generated, status: 'manual_action_required', error: message },
              ensureTextTrack().id
            ));
            placeholderCount += 1;
          }
        } else {
          newClips.push(makeGeneratedPlaceholderClip(generated, ensureTextTrack().id));
          placeholderCount += 1;
        }
      }

      if (newClips.length === 0) {
        if (!silent) set({ storyboardStatus: 'No new generated media to import.' });
        return;
      }

      const refreshedJobs = await listGenerationJobs({ batchId, projectId }).catch(() => null);
      set(state => {
        const importedJobIds = new Set(
          state.clips
            .map(clip => clip.generation?.jobId)
            .filter((jobId): jobId is string => Boolean(jobId))
        );
        const importedSceneIds = new Set(
          state.clips
            .map(clip => clip.generation
              ? makeGenerationSceneKey(clip.generation.projectId, clip.generation.batchId, clip.generation.sceneId)
              : null
            )
            .filter((sceneKey): sceneKey is string => Boolean(sceneKey))
        );
        const clipsToAdd = newClips.filter(clip =>
          !clip.generation ||
          (
            !importedJobIds.has(clip.generation.jobId) &&
            !importedSceneIds.has(makeGenerationSceneKey(clip.generation.projectId, clip.generation.batchId, clip.generation.sceneId))
          )
        );
        const assetIdsToAdd = new Set(clipsToAdd.map(clip => clip.assetId));
        const assetsToAdd = newAssets.filter(asset => assetIdsToAdd.has(asset.id));

        if (clipsToAdd.length === 0) {
          return {
            generationJobs: refreshedJobs?.jobs ?? state.generationJobs,
            storyboardScenes: mergeSceneStatuses(state.storyboardScenes, refreshedJobs?.jobs ?? state.generationJobs, state.clips, batchId),
            ...(silent ? {} : { storyboardStatus: 'Generated media is already on the timeline.' }),
          };
        }

        let tracks = state.tracks;
        for (const track of preparedTracks) {
          if (!tracks.some(existing => existing.id === track.id)) {
            tracks = [...tracks, { ...track, order: tracks.length }];
          }
        }

        const statusParts = [
          importedCount > 0 ? `${importedCount} media clip${importedCount === 1 ? '' : 's'}` : null,
          placeholderCount > 0 ? `${placeholderCount} placeholder${placeholderCount === 1 ? '' : 's'}` : null,
        ].filter(Boolean);

        const nextClips = [...state.clips, ...clipsToAdd];
        const nextJobs = refreshedJobs?.jobs ?? state.generationJobs;
        return {
          ...withHistory(state),
          assets: [...state.assets, ...assetsToAdd],
          tracks,
          clips: nextClips,
          selectedClipId: clipsToAdd[0]?.id ?? state.selectedClipId,
          generationJobs: nextJobs,
          storyboardScenes: mergeSceneStatuses(state.storyboardScenes, nextJobs, nextClips, batchId),
          storyboardStatus: `Imported ${statusParts.join(' and ')} to the timeline.`,
        };
      });
      if (get().currentProject) void get().saveProject();
    } catch (err: any) {
      console.error(err);
      if (!silent) alert(err.message || 'Generated media import failed');
      set({ storyboardStatus: silent ? 'Auto import paused after an error.' : 'Generated media import failed.' });
    } finally {
      set({ isSyncingGeneration: false });
    }
  },
  importGenerationVariant: async (jobId, variantUrl) => {
    const state = get();
    const sourceAsset = state.generatedMediaAssets.find(asset => asset.jobId === jobId);
    if (!sourceAsset) {
      alert('Refresh generation jobs before choosing a result.');
      return;
    }
    const selectedUrl = variantUrl || sourceAsset.resultUrl || getAssetVariantUrls(sourceAsset)[0];
    if (!selectedUrl) {
      alert('This scene does not have a media result yet.');
      return;
    }
    const sceneAlreadyImported = state.clips.some(clip =>
      clip.generation &&
      makeGenerationSceneKey(clip.generation.projectId, clip.generation.batchId, clip.generation.sceneId) ===
        makeGenerationSceneKey(sourceAsset.projectId, sourceAsset.batchId, sourceAsset.sceneId)
    );
    if (sceneAlreadyImported) {
      alert('This scene is already on the timeline. Remove the existing generated clip before choosing another result.');
      return;
    }

    set({ isSyncingGeneration: true, storyboardStatus: 'Importing selected result...' } as Partial<EditorState>);
    try {
      let assetForImport: GeneratedMediaAsset = {
        ...sourceAsset,
        resultUrl: selectedUrl,
        resultVariants: sourceAsset.resultVariants.filter(variant => variant.url === selectedUrl),
      };

      if (isRemoteMediaUrl(selectedUrl)) {
        const storedJob = await storeRemoteGenerationJob(sourceAsset.jobId, selectedUrl);
        assetForImport = {
          ...assetForImport,
          status: storedJob.status,
          mediaType: storedJob.mediaType,
          resultUrl: storedJob.resultUrl,
          resultVariants: storedJob.resultVariants,
          localPath: storedJob.localPath,
          error: storedJob.error,
          metadata: storedJob.metadata,
        };
      }

      const file = await fetchGeneratedMediaFile(assetForImport);
      const mediaKind = assetForImport.mediaType === 'video' ? 'video' : 'image';
      const thumbnailUrl = await generateThumbnail(file, mediaKind);
      const assetId = `generated-${assetForImport.jobId}-${makeId()}`;
      const newAsset: MediaAsset = {
        id: assetId,
        file,
        type: 'visual',
        mediaKind,
        thumbnailUrl,
      };

      if (mediaKind === 'video') {
        const sourceDuration = await getMediaDuration(file, 'visual');
        const framesCount = Math.min(50, Math.max(5, Math.ceil(sourceDuration / 2)));
        newAsset.filmstrip = await generateFilmstrip(file, sourceDuration, framesCount);
      }

      set(current => {
        let tracks = current.tracks;
        let visualTrack = tracks.find(track => track.type === 'visual');
        if (!visualTrack) {
          visualTrack = makeTrack(tracks, 'visual');
          tracks = [...tracks, visualTrack];
        }

        const newClip: TimelineClip = {
          id: makeId(),
          assetId,
          trackId: visualTrack.id,
          file,
          type: 'visual',
          duration: Math.max(0.1, assetForImport.duration),
          startTime: Math.max(0, assetForImport.start),
          mediaOffset: 0,
          transform: { scale: 100, rotation: 0, opacity: 100, flipX: false, flipY: false },
          color: { brightness: 100, contrast: 100, saturation: 100, exposure: 0, temperature: 0 },
          audio: { volume: 100, mute: false, fadeIn: 0, fadeOut: 0 },
          generation: generatedMetadata(assetForImport),
        };
        const nextClips = [...current.clips, newClip];
        return {
          ...withHistory(current),
          assets: [...current.assets, newAsset],
          tracks,
          clips: nextClips,
          selectedClipId: newClip.id,
          storyboardScenes: mergeSceneStatuses(
            current.storyboardScenes,
            current.generationJobs,
            nextClips,
            assetForImport.batchId,
          ),
          storyboardStatus: 'Selected result imported to the timeline.',
        };
      });

      const batchId = getCurrentGenerationBatchId(get());
      if (batchId) {
        const [jobsResponse, mediaResponse] = await Promise.all([
          listGenerationJobs({ batchId, projectId: get().currentProject?.id ?? null }).catch(() => null),
          listGeneratedMediaAssets(true, { batchId, projectId: get().currentProject?.id ?? null }).catch(() => null),
        ]);
        set(current => ({
          generationJobs: jobsResponse?.jobs ?? current.generationJobs,
          generatedMediaAssets: mediaResponse?.assets ?? current.generatedMediaAssets,
          storyboardScenes: mergeSceneStatuses(
            current.storyboardScenes,
            jobsResponse?.jobs ?? current.generationJobs,
            current.clips,
            batchId,
          ),
        }));
      }
      if (get().currentProject) void get().saveProject();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Could not import selected result');
      set({ storyboardStatus: 'Selected result import failed.' });
    } finally {
      set({ isSyncingGeneration: false });
    }
  },
  importCompletedGenerationMedia: async () => {
    await get().syncGenerationBatch(false);
  }
}));
