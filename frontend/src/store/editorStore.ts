import { create } from 'zustand';
import type {
  MediaAsset,
  TimelineClip,
  TimelineMarker,
  TimelineTrack,
  MediaType,
  TextData,
  ExportSettings,
  CaptionSegment,
  CaptionDesignPreset,
  AnimationAssetMemoryItem,
  AnimationAssetNeed,
  AnimationAssetType,
  AnimationLayer,
  AnimationPlan,
  AnimationScene,
  AnimationSettings,
  GeneratedMediaAsset,
  GenerationJob,
  Keyframe,
  KeyframeProperty,
  ProjectDetail,
  ProjectSummary,
  PlatformTarget,
  StoryboardScene,
  StoryboardSettings,
  TimelineDraft,
  TranscriptSlice,
} from '../types';
import { getMediaDuration, generateThumbnail, generateWaveform, generateFilmstrip, extractAudioSegment } from '../lib/utils/media';
import {
  createGenerationJobs,
  createAnimationAssetJobs,
  autoRetryAnimationAssetJob as autoRetryAnimationAssetJobRequest,
  createAnimationPlanFromAudio,
  createAnimationPlanFromTranscript,
  createProjectRecord,
  createStoryboardFromAudio,
  createStoryboardFromTranscript,
  autoRetryGenerationJob as autoRetryGenerationJobRequest,
  chooseProjectDirectory,
  exportTimeline,
  getProjectRecord,
  listProjectRecords,
  listGeneratedMediaAssets,
  listGenerationJobs,
  loadProjectRecordFromPath,
  pauseGenerationBatch,
  retryAnimationAssetJob as retryAnimationAssetJobRequest,
  retryGenerationJob as retryGenerationJobRequest,
  resolveBackendMediaUrl,
  resumeGenerationBatch,
  saveProjectRecord,
  selectGenerationJobVariant,
  storeRemoteGenerationJob,
  transcribeMedia,
  uploadProjectAsset,
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
  shadowColor: '#000000',
  shadowOpacity: 0.6,
  shadowBlur: 6,
  shadowOffsetX: 0,
  shadowOffsetY: 3,
  strokeColor: '#000000',
  strokeWidth: 0,
  boxPadding: 14,
  boxRadius: 10,
  maxWidthPercent: 82,
  maxCharsPerLine: 28,
  titleAnimation: 'none',
  captionMode: 'standard',
  highlightColor: '#f7d26a',
};

const DEFAULT_CROP: NonNullable<TimelineClip['crop']> = {
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

const DEFAULT_EFFECTS: NonNullable<TimelineClip['effects']> = {
  blur: 0,
  sharpen: 0,
  vignette: 0,
  clarity: 0,
  overlayPreset: 'none',
  overlayIntensity: 0,
};

const DEFAULT_SPEED: NonNullable<TimelineClip['speed']> = {
  rate: 1,
  reverse: false,
  freezeFrame: false,
  curvePreset: 'constant',
};

const DEFAULT_TRANSITION: NonNullable<TimelineClip['transition']> = {
  type: 'cut',
  duration: 0,
};

const DEFAULT_COMPOSITING: NonNullable<TimelineClip['compositing']> = {
  blendMode: 'normal',
  layoutPreset: 'free',
  borderWidth: 0,
  borderColor: '#ffffff',
  maskShape: 'none',
  cornerRadius: 0,
  chromaKeyEnabled: false,
  chromaKeyColor: '#00ff00',
  chromaKeySimilarity: 0.2,
  spillSuppression: 0,
  edgeFeather: 0,
  stabilization: false,
  backgroundRemoval: false,
};

const DEFAULT_AUDIO_DATA: NonNullable<TimelineClip['audio']> = {
  volume: 100,
  mute: false,
  fadeIn: 0,
  fadeOut: 0,
  fadeInCurve: 'linear',
  fadeOutCurve: 'linear',
};

const DEFAULT_STORYBOARD_SETTINGS: StoryboardSettings = {
  sourceMediaId: null,
  provider: 'meta',
  visualType: 'image',
  videoMixPercent: 0,
  aspectRatio: '16:9',
  sceneDensity: 'medium',
  motionIntensity: 'balanced',
  promptDetail: 'balanced',
  style: 'cinematic realistic',
  timeRangeMode: 'source',
  rangeStart: 0,
  rangeEnd: 0,
  autoRetryFailedScenes: false,
  autoRetryMaxAttempts: 5,
  autoRetryRewriteAfter: 2,
};

const DEFAULT_ANIMATION_SETTINGS: AnimationSettings = {
  sourceMediaId: null,
  provider: 'meta',
  aspectRatio: '16:9',
  sceneDensity: 'medium',
  motionIntensity: 'balanced',
  promptDetail: 'balanced',
  style: 'animated explainer',
  layoutTemplate: 'auto',
  captionTemplate: 'keyword_pop',
};

const DEFAULT_PROJECT_NAME = 'Untitled Project';
const PROJECT_POINTER_KEY = 'neuralscribe.currentProject';

type StoryboardSource = {
  id: string;
  file: File;
  name: string;
  kind: 'clip' | 'asset';
  clip?: TimelineClip;
  asset?: MediaAsset;
};

type TimelineSnapshot = {
  clips: TimelineClip[];
  tracks: TimelineTrack[];
  markers: TimelineMarker[];
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
  crop: clip.crop ? { ...clip.crop } : undefined,
  color: clip.color ? { ...clip.color } : undefined,
  effects: clip.effects ? { ...clip.effects } : undefined,
  speed: clip.speed ? { ...clip.speed } : undefined,
  transition: clip.transition ? { ...clip.transition } : undefined,
  compositing: clip.compositing ? { ...clip.compositing } : undefined,
  audio: clip.audio ? { ...clip.audio } : undefined,
  textData: clip.textData ? { ...clip.textData } : undefined,
  keyframes: clip.keyframes ? clip.keyframes.map(keyframe => ({ ...keyframe })) : undefined,
  generation: clip.generation ? {
    ...clip.generation,
    resultVariants: clip.generation.resultVariants?.map(variant => ({ ...variant })),
    metadata: clip.generation.metadata ? { ...clip.generation.metadata } : undefined,
  } : undefined,
  animation: clip.animation ? { ...clip.animation } : undefined,
}));

const cloneTracks = (tracks: TimelineTrack[]) => tracks.map(track => ({ ...track }));
const cloneMarkers = (markers: TimelineMarker[]) => markers.map(marker => ({ ...marker }));

const makeSnapshot = (state: Pick<EditorState, 'clips' | 'tracks' | 'markers'>): TimelineSnapshot => ({
  clips: cloneClips(state.clips),
  tracks: cloneTracks(state.tracks),
  markers: cloneMarkers(state.markers),
});

const isCaptionTimelineClip = (clip: TimelineClip): boolean => (
  clip.type === 'text'
  && (
    clip.assetId.startsWith('caption-')
    || clip.assetId.startsWith('timeline-caption-')
  )
);

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

const projectSummary = (project: ProjectSummary | ProjectDetail): ProjectSummary => ({
  id: project.id,
  name: project.name,
  folderPath: project.folderPath,
  generatedMediaPath: project.generatedMediaPath,
  projectFilePath: project.projectFilePath,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
  contentProfileId: project.contentProfileId ?? null,
  targetPlatform: project.targetPlatform ?? null,
  contentGoal: project.contentGoal ?? '',
  videoType: project.videoType ?? '',
  plannedTitle: project.plannedTitle ?? '',
  plannedDescription: project.plannedDescription ?? '',
  scriptId: project.scriptId ?? null,
});

const loadProjectPointer = (): ProjectSummary | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PROJECT_POINTER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProjectSummary;
    if (!parsed?.id || !parsed?.name) return null;
    return projectSummary(parsed);
  } catch {
    return null;
  }
};

const rememberProjectPointer = (project: ProjectSummary) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PROJECT_POINTER_KEY, JSON.stringify(projectSummary(project)));
};

const clearProjectPointer = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PROJECT_POINTER_KEY);
};

const serializeAsset = (asset: MediaAsset): SerializableAsset => ({
  id: asset.id,
  type: asset.type,
  mediaKind: asset.mediaKind,
  duration: asset.duration,
  sourceUrl: asset.sourceUrl ?? null,
  localPath: asset.localPath ?? null,
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

type SnapResult = {
  time: number;
  snapped: boolean;
};

const getSnapResult = (
  state: Pick<EditorState, 'clips' | 'playheadTime' | 'snapEnabled'>,
  time: number,
  movingClipIds?: string | string[],
): SnapResult => {
  if (!state.snapEnabled) return { time: Math.max(0, time), snapped: false };
  const ignoredClipIds = new Set(Array.isArray(movingClipIds) ? movingClipIds : movingClipIds ? [movingClipIds] : []);
  const candidates = [0, state.playheadTime];
  state.clips.forEach(clip => {
    if (ignoredClipIds.has(clip.id)) return;
    candidates.push(clip.startTime, clip.startTime + clip.duration);
  });
  const nearest = candidates.reduce((best, candidate) => {
    return Math.abs(candidate - time) < Math.abs(best - time) ? candidate : best;
  }, time);
  const snapped = Math.abs(nearest - time) <= SNAP_THRESHOLD;
  return {
    time: Math.max(0, snapped ? nearest : time),
    snapped,
  };
};

const snapTime = (
  state: Pick<EditorState, 'clips' | 'playheadTime' | 'snapEnabled'>,
  time: number,
  movingClipIds?: string | string[],
): number => getSnapResult(state, time, movingClipIds).time;

export type EditorState = {
  // Project
  currentProject: ProjectSummary | null;
  projectName: string;
  projectDirectory: string;
  projectContentProfileId: string | null;
  projectTargetPlatform: PlatformTarget | null;
  projectContentGoal: string;
  projectVideoType: string;
  projectPlannedTitle: string;
  projectPlannedDescription: string;
  projectScriptId: string | null;
  availableProjects: ProjectSummary[];
  projectStatus: string | null;
  isSavingProject: boolean;
  isLoadingProjects: boolean;
  setProjectName: (name: string) => void;
  setProjectDirectory: (directory: string) => void;
  setProjectContentProfileId: (profileId: string | null) => void;
  setProjectTargetPlatform: (platform: PlatformTarget | null) => void;
  setProjectContentGoal: (contentGoal: string) => void;
  setProjectVideoType: (videoType: string) => void;
  setProjectPlannedTitle: (plannedTitle: string) => void;
  setProjectPlannedDescription: (plannedDescription: string) => void;
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
  updateTrack: (id: string, updates: Partial<Pick<TimelineTrack, 'muted' | 'solo' | 'locked' | 'visible'>>) => void;
  moveTrack: (id: string, direction: 'up' | 'down') => void;

  // Timeline Clips
  clips: TimelineClip[];
  markers: TimelineMarker[];
  selectedClipId: string | null;
  selectedClipIds: string[];
  setSelectedClip: (id: string | null) => void;
  toggleClipSelection: (id: string) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  snapEnabled: boolean;
  snapGuideTime: number | null;
  toggleSnap: () => void;
  setSnapGuideForTime: (time: number, movingClipId?: string) => void;
  clearSnapGuide: () => void;
  addAssetToTimeline: (asset: MediaAsset, trackId?: string, startTimeX?: number) => Promise<void>;
  addTextClip: (trackId: string, startTime: number, duration?: number) => void;
  addCaptionClip: (trackId: string, startTime: number, duration?: number) => void;
  removeClip: (id: string) => void;
  duplicateClip: (id: string) => void;
  rippleDeleteClip: (id: string) => void;
  groupSelectedClips: () => void;
  ungroupSelectedClips: () => void;
  rippleTrimClip: (id: string, edge: 'left' | 'right', deltaSeconds: number) => void;
  rollTrimClip: (id: string, deltaSeconds: number) => void;
  slipClip: (id: string, deltaSeconds: number) => void;
  slideClip: (id: string, deltaSeconds: number) => void;
  updateClipStartTime: (id: string, deltaX: number) => void;
  updateClipTrack: (id: string, trackId: string, deltaX: number) => void;
  trimClip: (id: string, newStartTime: number, newDuration: number, newMediaOffset: number) => void;
  setClipTiming: (id: string, startTime: number, duration: number) => void;
  splitClip: (id: string, splitTime: number) => void;
  updateClipTransform: (id: string, transformData: Partial<TimelineClip['transform']>) => void;
  updateClipPosition: (id: string, x: number, y: number) => void;
  updateClipCrop: (id: string, cropData: Partial<NonNullable<TimelineClip['crop']>>) => void;
  updateClipColor: (id: string, colorData: Partial<TimelineClip['color']>) => void;
  updateClipEffects: (id: string, effectsData: Partial<NonNullable<TimelineClip['effects']>>) => void;
  updateClipSpeed: (id: string, speedData: Partial<NonNullable<TimelineClip['speed']>>) => void;
  updateClipTransition: (id: string, transitionData: Partial<NonNullable<TimelineClip['transition']>>) => void;
  updateClipCompositing: (id: string, compositingData: Partial<NonNullable<TimelineClip['compositing']>>) => void;
  updateClipAudio: (id: string, audioData: Partial<TimelineClip['audio']>) => void;
  updateClipText: (id: string, textData: Partial<TextData>) => void;
  applyCaptionDesignToCaptionClips: (design: CaptionDesignPreset) => number;
  addKeyframe: (id: string, property: KeyframeProperty, time?: number, value?: number) => void;
  updateKeyframe: (id: string, keyframeId: string, updates: Partial<Pick<NonNullable<TimelineClip['keyframes']>[number], 'time' | 'value' | 'easing'>>) => void;
  removeKeyframe: (id: string, keyframeId: string) => void;
  applyMotionPreset: (id: string, preset: 'push_in' | 'pop' | 'drift') => void;
  copiedKeyframes: Keyframe[] | null;
  copyKeyframes: (id: string) => void;
  pasteKeyframes: (id: string) => void;
  addMarker: (time: number, label?: string) => void;
  addMarkers: (markers: Array<Pick<TimelineMarker, 'time' | 'label' | 'color'>>) => void;
  createBeatMarkersFromClip: (id: string) => number;
  splitSelectedClipAtCaptionBoundaries: () => number;
  updateMarker: (id: string, updates: Partial<Pick<TimelineMarker, 'time' | 'label' | 'color'>>) => void;
  removeMarker: (id: string) => void;
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
  autoRetryGenerationJob: (jobId: string, maxAttempts?: number) => Promise<void>;
  regenerateFailedScene: (sceneId: string, rewrite?: boolean) => Promise<void>;
  syncGenerationBatch: (silent?: boolean) => Promise<void>;
  importGenerationVariant: (jobId: string, variantUrl?: string) => Promise<void>;
  importCompletedGenerationMedia: () => Promise<void>;
  importCompletedVoiceMedia: (jobs: GenerationJob[], autoPlaceOnTimeline?: boolean) => Promise<void>;
  applyTimelineDraft: (draft: TimelineDraft, voiceJobs?: GenerationJob[]) => Promise<void>;

  // Auto Animate Video
  animationSettings: AnimationSettings;
  animationPlan: AnimationPlan | null;
  animationAssetLibrary: AnimationAssetMemoryItem[];
  animationAssetJobs: GenerationJob[];
  currentAnimationBatchId: string | null;
  isGeneratingAnimationPlan: boolean;
  isSyncingAnimationAssets: boolean;
  animationStatus: string | null;
  setAnimationSettings: (settings: Partial<AnimationSettings>) => void;
  generateAnimationPlan: () => Promise<void>;
  updateAnimationScene: (id: string, updates: Partial<AnimationScene>) => void;
  updateAnimationAssetNeed: (id: string, updates: Partial<AnimationAssetNeed>) => void;
  assignAnimationAssetNeed: (needId: string, memoryAssetId: string | null) => void;
  approveAnimationPlan: () => void;
  createAnimationMissingAssetJobs: () => Promise<void>;
  syncAnimationAssetJobs: (silent?: boolean) => Promise<void>;
  retryAnimationAssetJob: (jobId: string) => Promise<void>;
  autoRetryAnimationAssetJob: (jobId: string, maxAttempts?: number) => Promise<void>;
  selectAnimationAssetVariant: (jobId: string, variantUrl?: string) => Promise<void>;
  buildAnimatedTimeline: () => void;
};

const buildProjectSnapshot = (state: EditorState): Record<string, unknown> => ({
  version: 1,
  savedAt: new Date().toISOString(),
  project: state.currentProject ? projectSummary(state.currentProject) : null,
  assets: state.assets.map(serializeAsset),
  tracks: state.tracks,
  clips: state.clips.map(serializeClip),
  markers: state.markers,
  captions: state.captions,
  exportSettings: state.exportSettings,
  storyboardSettings: state.storyboardSettings,
  storyboardScenes: state.storyboardScenes,
  currentGenerationBatchId: state.currentGenerationBatchId,
  generationJobs: state.generationJobs,
  generatedMediaAssets: collectGeneratedMediaAssetsForSnapshot(state),
  isGenerationBatchPaused: state.isGenerationBatchPaused,
  animationSettings: state.animationSettings,
  animationPlan: state.animationPlan,
  animationAssetLibrary: state.animationAssetLibrary,
  animationAssetJobs: state.animationAssetJobs,
  currentAnimationBatchId: state.currentAnimationBatchId,
});

const projectMetadata = (state: Pick<
  EditorState,
  | 'projectContentProfileId'
  | 'projectTargetPlatform'
  | 'projectContentGoal'
  | 'projectVideoType'
  | 'projectPlannedTitle'
  | 'projectPlannedDescription'
  | 'projectScriptId'
>) => ({
  contentProfileId: state.projectContentProfileId,
  targetPlatform: state.projectTargetPlatform,
  contentGoal: state.projectContentGoal,
  videoType: state.projectVideoType,
  plannedTitle: state.projectPlannedTitle,
  plannedDescription: state.projectPlannedDescription,
  scriptId: state.projectScriptId,
});

const targetPlatformAspectRatio = (platform: PlatformTarget | null): ExportSettings['aspectRatio'] | null => {
  if (!platform) return null;
  if (['youtube_shorts', 'facebook_reels', 'tiktok', 'instagram_reels'].includes(platform)) return '9:16';
  if (platform === 'youtube' || platform === 'facebook_page') return '16:9';
  return null;
};

const persistProjectSnapshot = async (state: EditorState): Promise<ProjectSummary> => {
  const name = state.projectName.trim() || DEFAULT_PROJECT_NAME;
  const project = state.currentProject ? projectSummary(state.currentProject) : null;
  if (!project) {
    throw new Error('Create or load a project before saving.');
  }
  const savedProject = projectSummary(await saveProjectRecord(project.id, name, buildProjectSnapshot({
    ...state,
    currentProject: project,
    projectName: name,
  }), projectMetadata(state)));
  rememberProjectPointer(savedProject);
  return savedProject;
};

let projectAutosaveTimer: ReturnType<typeof setTimeout> | null = null;

const scheduleProjectAutosave = (get: () => EditorState, delayMs = 800) => {
  const state = get();
  if (!state.currentProject) return;
  if (projectAutosaveTimer) clearTimeout(projectAutosaveTimer);
  projectAutosaveTimer = setTimeout(() => {
    projectAutosaveTimer = null;
    const latest = get();
    if (!latest.currentProject || latest.isSavingProject) return;
    void latest.saveProject();
  }, delayMs);
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
      kind: 'clip' as const,
      clip,
    }));
  const clipAssetIds = new Set(state.clips.map(clip => clip.assetId));
  const assetSources = state.assets
    .filter(asset => hasPlayableAssetSource(asset) && !clipAssetIds.has(asset.id))
    .map(asset => ({
      id: `asset:${asset.id}`,
      file: asset.file,
      name: `Media Pool: ${asset.file.name}`,
      kind: 'asset' as const,
      asset,
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
      kind: 'clip',
      clip: selectedClip,
    };
  }

  return sources[0] ?? null;
};

type StoryboardTimedSegment = {
  start: number;
  end: number;
  text: string;
};

type StoryboardRange = {
  timelineStart: number;
  timelineEnd: number;
  mediaStart: number;
  mediaEnd: number;
};

const isFiniteSeconds = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const isAudioFileSource = (file: File): boolean => (
  file.type.startsWith('audio/') || /\.(mp3|wav|m4a|flac|ogg|aac)$/i.test(file.name)
);

const getOverlapDuration = (start: number, end: number, rangeStart: number, rangeEnd: number): number => (
  Math.max(0, Math.min(end, rangeEnd) - Math.max(start, rangeStart))
);

const getStoryboardRange = (
  settings: StoryboardSettings,
  source: StoryboardSource | null,
): StoryboardRange | null => {
  const clip = source?.clip;
  const hasCustomRange = settings.timeRangeMode === 'custom';
  const customStart = Math.max(0, settings.rangeStart || 0);
  const customEnd = Math.max(0, settings.rangeEnd || 0);

  if (clip) {
    const clipTimelineStart = Math.max(0, clip.startTime);
    const clipTimelineEnd = Math.max(clipTimelineStart, clip.startTime + clip.duration);
    const timelineStart = hasCustomRange ? Math.max(clipTimelineStart, customStart) : clipTimelineStart;
    const timelineEnd = hasCustomRange ? Math.min(clipTimelineEnd, customEnd) : clipTimelineEnd;
    if (timelineEnd <= timelineStart) return null;
    const mediaStart = Math.max(0, (clip.mediaOffset || 0) + (timelineStart - clip.startTime));
    const mediaEnd = Math.max(mediaStart, mediaStart + (timelineEnd - timelineStart));
    return { timelineStart, timelineEnd, mediaStart, mediaEnd };
  }

  if (hasCustomRange) {
    if (customEnd <= customStart) return null;
    return {
      timelineStart: customStart,
      timelineEnd: customEnd,
      mediaStart: customStart,
      mediaEnd: customEnd,
    };
  }

  return null;
};

const getStoryboardSegments = (
  captions: CaptionSegment[],
  source: StoryboardSource | null,
  range: StoryboardRange | null,
): StoryboardTimedSegment[] => {
  const cleanCaptions = captions.filter(caption => caption.text.trim());

  if (source?.clip && range) {
    const clip = source.clip;
    const mediaOverlap = cleanCaptions.reduce(
      (total, caption) => total + getOverlapDuration(caption.start, caption.end, range.mediaStart, range.mediaEnd),
      0,
    );
    const timelineOverlap = cleanCaptions.reduce(
      (total, caption) => total + getOverlapDuration(caption.start, caption.end, range.timelineStart, range.timelineEnd),
      0,
    );

    if (mediaOverlap <= 0 && timelineOverlap > 0) {
      return cleanCaptions
        .map(caption => {
          const start = Math.max(caption.start, range.timelineStart);
          const end = Math.min(caption.end, range.timelineEnd);
          if (end <= start) return null;
          return {
            start: Number(start.toFixed(3)),
            end: Number(end.toFixed(3)),
            text: caption.text.trim(),
          };
        })
        .filter((segment): segment is StoryboardTimedSegment => Boolean(segment));
    }

    return cleanCaptions
      .map(caption => {
        const mediaStart = Math.max(caption.start, range.mediaStart);
        const mediaEnd = Math.min(caption.end, range.mediaEnd);
        if (mediaEnd <= mediaStart) return null;
        return {
          start: Number((clip.startTime + (mediaStart - (clip.mediaOffset || 0))).toFixed(3)),
          end: Number((clip.startTime + (mediaEnd - (clip.mediaOffset || 0))).toFixed(3)),
          text: caption.text.trim(),
        };
      })
      .filter((segment): segment is StoryboardTimedSegment => Boolean(segment));
  }

  if (range) {
    return cleanCaptions
      .map(caption => {
        const start = Math.max(caption.start, range.timelineStart);
        const end = Math.min(caption.end, range.timelineEnd);
        if (end <= start) return null;
        return {
          start: Number(start.toFixed(3)),
          end: Number(end.toFixed(3)),
          text: caption.text.trim(),
        };
      })
      .filter((segment): segment is StoryboardTimedSegment => Boolean(segment));
  }

  return cleanCaptions.map(caption => ({
    start: caption.start,
    end: caption.end,
    text: caption.text.trim(),
  }));
};

const normalizeStoryboardScenes = (
  scenes: StoryboardScene[],
  fallback: StoryboardSettings,
  timeShift: number = 0,
): StoryboardScene[] => {
  return scenes.map((scene, index) => ({
    ...scene,
    id: scene.id || `scene-${index + 1}`,
    start: Number((scene.start + timeShift).toFixed(3)),
    end: Number(Math.max(scene.start + timeShift + 0.1, scene.end + timeShift).toFixed(3)),
    visualType: scene.visualType || fallback.visualType,
    negativePrompt: scene.negativePrompt || 'low quality, blurry, distorted, watermark, readable text',
    style: scene.style || fallback.style,
    camera: scene.camera || (scene.visualType === 'video'
      ? fallback.motionIntensity === 'dynamic'
        ? 'dynamic cinematic motion'
        : fallback.motionIntensity === 'subtle'
          ? 'subtle slow push-in'
          : 'slow cinematic push-in'
      : 'static'),
    sceneGoal: scene.sceneGoal || (index === 0 ? 'Hook attention immediately' : 'Advance the story and maintain retention'),
    viewerEmotion: scene.viewerEmotion || (index === 0 ? 'curiosity' : 'engagement'),
    visualHook: scene.visualHook || '',
    motionStyle: scene.motionStyle || (scene.visualType === 'video' ? 'steady cinematic movement' : 'static composition'),
    captionText: scene.captionText || '',
    transition: scene.transition || 'cut',
    soundEffect: scene.soundEffect || '',
    musicSuggestion: scene.musicSuggestion || '',
    status: scene.status || 'draft',
  }));
};

const makeId = () => Math.random().toString(36).substring(7);

const makeMotionPresetKeyframes = (
  clip: TimelineClip,
  preset: 'push_in' | 'pop' | 'drift',
): Keyframe[] => {
  const duration = Math.max(0.25, clip.duration);
  const baseScale = clip.transform?.scale ?? 100;
  const baseX = getClipPropertyValue(clip, 'x');
  const baseY = getClipPropertyValue(clip, 'y');

  if (preset === 'pop') {
    return [
      { id: makeId(), property: 'scale', time: 0, value: Math.max(10, baseScale * 0.84), easing: 'ease_out' },
      { id: makeId(), property: 'scale', time: Math.min(0.28, duration), value: baseScale * 1.08, easing: 'ease_in_out' },
      { id: makeId(), property: 'scale', time: Math.min(0.52, duration), value: baseScale, easing: 'ease_in_out' },
      { id: makeId(), property: 'opacity', time: 0, value: 0, easing: 'ease_out' },
      { id: makeId(), property: 'opacity', time: Math.min(0.24, duration), value: clip.transform?.opacity ?? 100, easing: 'ease_out' },
    ];
  }

  if (preset === 'drift') {
    return [
      { id: makeId(), property: 'x', time: 0, value: baseX - 4, easing: 'ease_in_out' },
      { id: makeId(), property: 'x', time: duration, value: baseX + 4, easing: 'ease_in_out' },
      { id: makeId(), property: 'y', time: 0, value: baseY + 1.5, easing: 'ease_in_out' },
      { id: makeId(), property: 'y', time: duration, value: baseY - 1.5, easing: 'ease_in_out' },
    ];
  }

  return [
    { id: makeId(), property: 'scale', time: 0, value: baseScale, easing: 'ease_in_out' },
    { id: makeId(), property: 'scale', time: duration, value: baseScale * 1.08, easing: 'ease_in_out' },
  ];
};

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
    visible: true,
  };
};

const makeDefaultTracks = (): TimelineTrack[] => [
  { id: 'v1', name: 'V1', type: 'visual', order: 0, muted: false, solo: false, locked: false, visible: true },
  { id: 'a1', name: 'A1', type: 'audio', order: 1, muted: false, solo: false, locked: false, visible: true },
];

const getGeneratedFileName = (asset: GeneratedMediaAsset, resultUrl: string): string => {
  const fallbackExtension = asset.mediaType === 'video'
    ? 'mp4'
    : asset.mediaType === 'audio'
      ? 'mp3'
      : 'png';
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

function inferGeneratedMediaTypeFromClip(
  generation: Partial<NonNullable<TimelineClip['generation']>>,
  clip: Partial<SerializableClip | TimelineClip>,
): GeneratedMediaAsset['mediaType'] {
  if (generation.mediaType === 'video' || generation.mediaType === 'image' || generation.mediaType === 'audio') return generation.mediaType;
  const fileType = 'fileType' in clip ? String(clip.fileType || '') : ('file' in clip ? clip.file?.type || '' : '');
  const fileName = 'fileName' in clip ? String(clip.fileName || '') : ('file' in clip ? clip.file?.name || '' : '');
  if (fileType.startsWith('audio/') || /\.(mp3|wav|m4a|flac|ogg|aac)$/i.test(fileName)) return 'audio';
  if (fileType.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(fileName)) return 'video';
  return 'image';
}

function projectGeneratedMediaUrl(projectId: string | null | undefined, fileName: string | null | undefined): string | null {
  if (!projectId || !fileName) return null;
  return `/api/generation/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(fileName)}`;
}

function generatedAssetFromClip(
  clip: Partial<SerializableClip | TimelineClip>,
  fallbackProjectId?: string | null,
): GeneratedMediaAsset | null {
  const generation = clip.generation;
  if (!generation?.jobId || !generation.batchId || !generation.sceneId) return null;

  const fileName = 'fileName' in clip ? clip.fileName : ('file' in clip ? clip.file?.name : undefined);
  const projectId = generation.projectId ?? fallbackProjectId ?? null;
  const resultUrl = generation.resultUrl ?? projectGeneratedMediaUrl(projectId, fileName);
  if (!resultUrl) return null;

  const start = typeof generation.start === 'number'
    ? generation.start
    : typeof clip.startTime === 'number'
      ? clip.startTime
      : 0;
  const duration = typeof generation.duration === 'number'
    ? generation.duration
    : typeof clip.duration === 'number'
      ? clip.duration
      : Math.max(0.1, (generation.end ?? start + 5) - start);
  const end = typeof generation.end === 'number' ? generation.end : start + duration;

  return {
    jobId: generation.jobId,
    batchId: generation.batchId,
    projectId,
    sceneId: generation.sceneId,
    provider: generation.provider ?? 'meta',
    mediaType: inferGeneratedMediaTypeFromClip(generation, clip),
    status: generation.status ?? 'completed',
    resultUrl,
    resultVariants: generation.resultVariants?.map(variant => ({ ...variant })) ?? [],
    localPath: generation.localPath ?? null,
    prompt: generation.prompt ?? '',
    negativePrompt: generation.negativePrompt ?? '',
    start,
    end,
    duration: Math.max(0.1, duration),
    transcript: generation.transcript ?? '',
    error: generation.error ?? null,
    metadata: generation.metadata ? { ...generation.metadata } : {},
  };
}

function mergeGeneratedAsset(
  existing: GeneratedMediaAsset | undefined,
  candidate: GeneratedMediaAsset,
): GeneratedMediaAsset {
  if (!existing) return candidate;

  const variantsByUrl = new Map<string, GeneratedMediaAsset['resultVariants'][number]>();
  for (const variant of existing.resultVariants ?? []) variantsByUrl.set(variant.url, variant);
  for (const variant of candidate.resultVariants ?? []) variantsByUrl.set(variant.url, variant);

  return {
    ...existing,
    ...candidate,
    resultUrl: candidate.resultUrl || existing.resultUrl,
    resultVariants: [...variantsByUrl.values()],
    localPath: candidate.localPath || existing.localPath,
    error: candidate.error ?? existing.error,
    metadata: { ...(existing.metadata ?? {}), ...(candidate.metadata ?? {}) },
  };
}

function collectGeneratedMediaAssetsForSnapshot(state: EditorState): GeneratedMediaAsset[] {
  const assetsByJob = new Map<string, GeneratedMediaAsset>();
  for (const asset of state.generatedMediaAssets) {
    assetsByJob.set(asset.jobId, asset);
  }

  for (const clip of state.clips) {
    const generatedAsset = generatedAssetFromClip(clip, state.currentProject?.id);
    if (!generatedAsset) continue;
    assetsByJob.set(generatedAsset.jobId, mergeGeneratedAsset(assetsByJob.get(generatedAsset.jobId), generatedAsset));
  }

  return [...assetsByJob.values()];
}

const getGeneratedFallbackMime = (asset: GeneratedMediaAsset): string => {
  if (asset.mediaType === 'video') return 'video/mp4';
  if (asset.mediaType === 'audio') return 'audio/mpeg';
  return 'image/png';
};

const isRemoteMediaUrl = (resultUrl: string): boolean => /^https?:\/\//i.test(resultUrl);

const getAssetVariantUrls = (asset: GeneratedMediaAsset): string[] => {
  const urls = asset.resultVariants?.map(variant => variant.url).filter(Boolean) ?? [];
  if (asset.resultUrl && !urls.includes(asset.resultUrl)) urls.unshift(asset.resultUrl);
  return [...new Set(urls)];
};

const isAutoAnimateJob = (job: GenerationJob): boolean => job.metadata.flow === 'auto_animate';

const getAnimationNeedIdFromJob = (job: GenerationJob): string => job.metadata.animationAssetId || job.sceneId;

const uniqueGenerationJobsById = (jobs: GenerationJob[]): GenerationJob[] => {
  const byId = new Map<string, GenerationJob>();
  for (const job of jobs) byId.set(job.id, job);
  return [...byId.values()];
};

const uniqueGeneratedAssetsByJobId = (assets: GeneratedMediaAsset[]): GeneratedMediaAsset[] => {
  const byJobId = new Map<string, GeneratedMediaAsset>();
  for (const asset of assets) byJobId.set(asset.jobId, asset);
  return [...byJobId.values()];
};

const makeGenerationSceneKey = (
  projectId: string | null | undefined,
  batchId: string,
  sceneId: string,
): string => `${projectId ?? 'legacy'}:${batchId}:${sceneId}`;

const getGenerationSceneKeyFromClip = (clip: TimelineClip): string | null => (
  clip.generation
    ? makeGenerationSceneKey(clip.generation.projectId, clip.generation.batchId, clip.generation.sceneId)
    : null
);

const isCompletedGeneratedVisualClip = (clip: TimelineClip): boolean => (
  clip.type === 'visual' &&
  clip.generation?.status === 'completed'
);

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

const fetchPersistedAssetFile = async (asset: SerializableAsset): Promise<File> => {
  if (!asset.sourceUrl) {
    throw new Error('Project media has no saved source URL.');
  }
  const response = await fetch(resolveBackendMediaUrl(asset.sourceUrl));
  if (!response.ok) {
    throw new Error(`Project media download failed (${response.status}).`);
  }
  const blob = await response.blob();
  return new File([blob], asset.fileName || 'media', { type: blob.type || asset.fileType || 'application/octet-stream' });
};

const hydrateSavedAsset = async (asset: SerializableAsset): Promise<MediaAsset | null> => {
  if (!asset.sourceUrl) return null;
  try {
    const file = await fetchPersistedAssetFile(asset);
    const restoredDuration = isFiniteSeconds(asset.duration)
      ? asset.duration
      : await getMediaDuration(file, asset.type).catch(() => undefined);
    const restoredAsset: MediaAsset = {
      id: asset.id,
      file,
      type: asset.type,
      mediaKind: asset.mediaKind,
      duration: restoredDuration,
      sourceUrl: asset.sourceUrl,
      localPath: asset.localPath,
      thumbnailUrl: await generateThumbnail(file, asset.mediaKind),
    };
    if (asset.mediaKind === 'audio') {
      restoredAsset.waveform = await generateWaveform(file, 1000).catch(() => undefined);
    } else if (asset.mediaKind === 'video') {
      const duration = restoredDuration ?? await getMediaDuration(file, 'visual');
      if (duration > 0 && duration !== Infinity) {
        const framesCount = Math.min(50, Math.max(5, Math.ceil(duration / 2)));
        restoredAsset.filmstrip = await generateFilmstrip(file, duration, framesCount).catch(() => undefined);
      }
    }
    return restoredAsset;
  } catch (error) {
    console.warn('Could not restore project media asset.', error);
    return null;
  }
};

const persistProjectAssets = async (
  projectId: string,
  assets: MediaAsset[],
): Promise<{ assets: MediaAsset[]; changed: boolean }> => {
  let changed = false;
  const persistedAssets: MediaAsset[] = [];
  for (const asset of assets) {
    if (asset.sourceUrl || asset.id.startsWith('generated-')) {
      persistedAssets.push(asset);
      continue;
    }
    const saved = await uploadProjectAsset(projectId, asset.id, asset.file);
    persistedAssets.push({
      ...asset,
      sourceUrl: saved.url,
      localPath: saved.localPath,
    });
    changed = true;
  }
  return { assets: persistedAssets, changed };
};

const generatedMetadata = (asset: GeneratedMediaAsset): NonNullable<TimelineClip['generation']> => ({
  jobId: asset.jobId,
  batchId: asset.batchId,
  projectId: asset.projectId,
  sceneId: asset.sceneId,
  provider: asset.provider,
  mediaType: asset.mediaType,
  status: asset.status,
  resultUrl: asset.resultUrl,
  resultVariants: asset.resultVariants?.map(variant => ({ ...variant })),
  localPath: asset.localPath,
  prompt: asset.prompt,
  negativePrompt: asset.negativePrompt,
  start: asset.start,
  end: asset.end,
  duration: asset.duration,
  transcript: asset.transcript,
  error: asset.error,
  metadata: { ...(asset.metadata ?? {}) },
});

const generatedMediaAssetFromJob = (job: GenerationJob): GeneratedMediaAsset => ({
  jobId: job.id,
  batchId: job.batchId,
  projectId: job.projectId,
  sceneId: job.sceneId,
  provider: job.provider,
  mediaType: job.mediaType,
  status: job.status,
  resultUrl: job.resultUrl,
  resultVariants: job.resultVariants?.map(variant => ({ ...variant })) ?? [],
  localPath: job.localPath,
  prompt: job.prompt,
  negativePrompt: job.negativePrompt,
  start: 0,
  end: 5,
  duration: 5,
  transcript: job.metadata.animationAssetName || job.prompt || job.sceneId,
  error: job.error,
  metadata: { ...(job.metadata ?? {}) },
});

const restoreProjectWorkspace = async (project: ProjectDetail): Promise<Partial<EditorState>> => {
  const saved = project.state as any;
  const tracks = Array.isArray(saved?.tracks) ? saved.tracks as TimelineTrack[] : makeDefaultTracks();
  const markers = Array.isArray(saved?.markers) ? saved.markers as TimelineMarker[] : [];
  const captions = Array.isArray(saved?.captions) ? saved.captions as CaptionSegment[] : [];
  const storyboardScenes = Array.isArray(saved?.storyboardScenes) ? saved.storyboardScenes as StoryboardScene[] : [];
  const generationJobs = Array.isArray(saved?.generationJobs) ? saved.generationJobs as GenerationJob[] : [];
  const generatedMediaAssets = Array.isArray(saved?.generatedMediaAssets) ? saved.generatedMediaAssets as GeneratedMediaAsset[] : [];
  const animationAssetLibrary = Array.isArray(saved?.animationAssetLibrary) ? saved.animationAssetLibrary as AnimationAssetMemoryItem[] : [];
  const animationAssetJobs = Array.isArray(saved?.animationAssetJobs) ? saved.animationAssetJobs as GenerationJob[] : [];
  const animationPlan = saved?.animationPlan && typeof saved.animationPlan === 'object' ? saved.animationPlan as AnimationPlan : null;
  const generatedAssetsByJob = new Map(generatedMediaAssets.map(asset => [asset.jobId, asset]));
  const savedAssets = Array.isArray(saved?.assets) ? saved.assets as SerializableAsset[] : [];
  const savedClips = Array.isArray(saved?.clips) ? saved.clips as SerializableClip[] : [];
  for (const savedClip of savedClips) {
    const generatedAsset = generatedAssetFromClip(savedClip, project.id);
    if (!generatedAsset) continue;
    generatedAssetsByJob.set(generatedAsset.jobId, mergeGeneratedAsset(generatedAssetsByJob.get(generatedAsset.jobId), generatedAsset));
  }
  const restoredAssets: MediaAsset[] = [];
  const restoredAssetsById = new Map<string, MediaAsset>();
  for (const savedAsset of savedAssets) {
    const restoredAsset = await hydrateSavedAsset(savedAsset);
    if (!restoredAsset) continue;
    restoredAssets.push(restoredAsset);
    restoredAssetsById.set(restoredAsset.id, restoredAsset);
  }
  const restoredClips: TimelineClip[] = [];

  for (const savedClip of savedClips) {
    if (!savedClip || typeof savedClip !== 'object') continue;
    if (savedClip.type === 'text') {
      restoredClips.push({
        ...savedClip,
        file: new File([], savedClip.fileName || 'text-overlay.txt', { type: savedClip.fileType || 'text/plain' }),
      } as TimelineClip);
      continue;
    }

    if (!savedClip.generation?.jobId) {
      const restoredAsset = restoredAssetsById.get(savedClip.assetId);
      if (!restoredAsset) continue;
      restoredClips.push({ ...savedClip, file: restoredAsset.file } as TimelineClip);
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
        duration: generated.duration,
        sourceUrl: generated.resultUrl,
        localPath: generated.localPath,
        thumbnailUrl,
      };
      if (mediaKind === 'video') {
        const duration = await getMediaDuration(file, 'visual');
        restoredAsset.duration = duration;
        const framesCount = Math.min(50, Math.max(5, Math.ceil(duration / 2)));
        restoredAsset.filmstrip = await generateFilmstrip(file, duration, framesCount);
      }
      if (!restoredAssetsById.has(restoredAsset.id)) {
        restoredAssets.push(restoredAsset);
        restoredAssetsById.set(restoredAsset.id, restoredAsset);
      }
      restoredClips.push({ ...savedClip, file } as TimelineClip);
    } catch (error) {
      console.warn('Could not restore generated clip from project file.', error);
    }
  }

  const summary = projectSummary(project);
  return {
    currentProject: summary,
    projectName: summary.name,
    projectDirectory: summary.folderPath,
    projectContentProfileId: summary.contentProfileId,
    projectTargetPlatform: summary.targetPlatform,
    projectContentGoal: summary.contentGoal,
    projectVideoType: summary.videoType,
    projectPlannedTitle: summary.plannedTitle,
    projectPlannedDescription: summary.plannedDescription,
    projectScriptId: summary.scriptId,
    projectStatus: `Loaded project: ${summary.name}`,
    assets: restoredAssets,
    tracks,
    clips: restoredClips,
    markers,
    selectedClipId: null,
    selectedClipIds: [],
    snapGuideTime: null,
    historyPast: [],
    historyFuture: [],
    captions,
    exportSettings: saved?.exportSettings ?? { resolution: '1080p', aspectRatio: '16:9', quality: 'standard', format: 'video' },
    storyboardSettings: { ...DEFAULT_STORYBOARD_SETTINGS, ...(saved?.storyboardSettings ?? {}) },
    storyboardScenes,
    currentGenerationBatchId: saved?.currentGenerationBatchId ?? null,
    generationJobs,
    generatedMediaAssets,
    isGenerationBatchPaused: Boolean(saved?.isGenerationBatchPaused),
    animationSettings: { ...DEFAULT_ANIMATION_SETTINGS, ...(saved?.animationSettings ?? {}) },
    animationPlan,
    animationAssetLibrary,
    animationAssetJobs,
    currentAnimationBatchId: saved?.currentAnimationBatchId ?? null,
    isGeneratingAnimationPlan: false,
    isSyncingAnimationAssets: false,
    animationStatus: null,
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
      .filter(isCompletedGeneratedVisualClip)
      .map(clip => clip.generation?.jobId)
      .filter((jobId): jobId is string => Boolean(jobId))
  );
  const importedSceneIds = new Set(
    existingClips
      .filter(isCompletedGeneratedVisualClip)
      .map(getGenerationSceneKeyFromClip)
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

const compactGeneratedVisualClips = (
  clips: TimelineClip[],
  trackId: string,
  batchId: string,
  projectId: string | null | undefined,
): TimelineClip[] => {
  const generatedClips = clips
    .filter(clip =>
      clip.trackId === trackId &&
      isCompletedGeneratedVisualClip(clip) &&
      clip.generation?.batchId === batchId &&
      clip.generation?.projectId === projectId
    )
    .sort((a, b) => {
      const aStart = a.generation?.start ?? a.startTime;
      const bStart = b.generation?.start ?? b.startTime;
      return aStart - bStart || (a.generation?.sceneId ?? '').localeCompare(b.generation?.sceneId ?? '');
    });

  if (generatedClips.length <= 1) return clips;

  let cursor = Math.min(...generatedClips.map(clip => clip.startTime));
  const nextStarts = new Map<string, number>();
  for (const clip of generatedClips) {
    nextStarts.set(clip.id, Number(cursor.toFixed(3)));
    cursor += Math.max(0.1, clip.duration);
  }

  return clips.map(clip => {
    const startTime = nextStarts.get(clip.id);
    return startTime === undefined ? clip : { ...clip, startTime };
  });
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
      .filter(clip => clip.generation?.batchId === batchId && isCompletedGeneratedVisualClip(clip))
      .map(getGenerationSceneKeyFromClip)
      .filter((sceneKey): sceneKey is string => Boolean(sceneKey))
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

const animationAssetTypeFromName = (name: string): AnimationAssetType => {
  const lower = name.toLowerCase();
  if (/(background|backdrop|scene|room|city|landscape)/.test(lower)) return 'background';
  if (/(character|person|avatar|host|teacher|narrator)/.test(lower)) return 'character';
  if (/(icon|symbol|badge)/.test(lower)) return 'icon';
  if (/(overlay|frame|texture)/.test(lower)) return 'overlay';
  if (/(title|text|caption|label)/.test(lower)) return 'text';
  return 'prop';
};

const animationTagsFromName = (name: string): string[] => (
  name
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 2)
    .slice(0, 8)
);

const animationMemoryFromMediaAsset = (asset: MediaAsset): AnimationAssetMemoryItem | null => {
  if (asset.type !== 'visual') return null;
  const cleanName = asset.file.name.replace(/\.[^.]+$/, '') || asset.file.name;
  const assetType = animationAssetTypeFromName(cleanName);
  return {
    id: `media:${asset.id}`,
    name: cleanName,
    assetType,
    mediaAssetId: asset.id,
    sourceUrl: asset.sourceUrl ?? null,
    localPath: asset.localPath ?? null,
    prompt: '',
    style: '',
    tags: [...new Set([assetType, asset.mediaKind, ...animationTagsFromName(cleanName)])],
    status: 'available',
    metadata: { source: 'media_pool' },
  };
};

const buildAnimationAvailableAssets = (
  state: Pick<EditorState, 'assets' | 'animationAssetLibrary'>
): AnimationAssetMemoryItem[] => {
  const byId = new Map<string, AnimationAssetMemoryItem>();
  for (const item of state.animationAssetLibrary) byId.set(item.id, item);
  for (const asset of state.assets) {
    const memory = animationMemoryFromMediaAsset(asset);
    if (memory && !byId.has(memory.id)) byId.set(memory.id, memory);
  }
  return [...byId.values()];
};

const getConfiguredAnimationSource = (
  state: Pick<EditorState, 'assets' | 'clips' | 'selectedClipId' | 'animationSettings'>
): StoryboardSource | null => {
  const sources = getStoryboardSources(state);
  const configuredSource = state.animationSettings.sourceMediaId
    ? sources.find(source => source.id === state.animationSettings.sourceMediaId)
    : null;
  if (configuredSource) return configuredSource;
  const selectedClip = getTranscriptSourceClip(state);
  if (selectedClip) {
    return {
      id: `clip:${selectedClip.id}`,
      file: selectedClip.file,
      name: `Timeline: ${selectedClip.file.name}`,
      kind: 'clip',
      clip: selectedClip,
    };
  }
  return sources[0] ?? null;
};

const getAnimationTimedSegments = (captions: CaptionSegment[]): TranscriptSlice[] => (
  captions
    .filter(caption => caption.text.trim())
    .map(caption => ({
      start: caption.start,
      end: caption.end,
      text: caption.text.trim(),
    }))
);

const animationNeedStatusFromJob = (job: GenerationJob): AnimationAssetNeed['status'] => {
  if (job.status === 'completed') return 'generated';
  if (job.status === 'failed' || job.status === 'manual_action_required' || job.status === 'canceled') return 'failed';
  return 'queued';
};

const mergeAnimationJobsIntoPlan = (
  plan: AnimationPlan | null,
  jobs: GenerationJob[],
  library: AnimationAssetMemoryItem[],
): AnimationPlan | null => {
  if (!plan) return null;
  const jobsByNeed = new Map(jobs.map(job => [job.metadata.animationAssetId || job.sceneId, job]));
  const libraryByNeed = new Map(
    library
      .map(item => [item.metadata.animationAssetId, item] as const)
      .filter((entry): entry is [string, AnimationAssetMemoryItem] => Boolean(entry[0]))
  );
  return {
    ...plan,
    assetNeeds: plan.assetNeeds.map(need => {
      const job = jobsByNeed.get(need.id);
      if (job && job.status !== 'completed') {
        return {
          ...need,
          reuseDecision: 'generate',
          status: animationNeedStatusFromJob(job),
          matchedAssetId: null,
        };
      }
      const generatedAsset = libraryByNeed.get(need.id);
      if (generatedAsset) {
        return {
          ...need,
          reuseDecision: 'reuse',
          status: 'generated',
          matchedAssetId: generatedAsset.id,
        };
      }
      if (!job) {
        if (need.reuseDecision === 'generate' && need.status === 'queued') {
          return {
            ...need,
            status: 'missing',
            matchedAssetId: null,
          };
        }
        return need;
      }
      return {
        ...need,
        status: animationNeedStatusFromJob(job),
      };
    }),
  };
};

const keyframesForAnimationMotion = (
  layer: AnimationLayer,
  duration: number,
): TimelineClip['keyframes'] => {
  const safeDuration = Math.max(0.1, duration);
  const keyframes: NonNullable<TimelineClip['keyframes']> = [];
  const mid = Number((safeDuration / 2).toFixed(3));
  const quarter = Number((safeDuration / 4).toFixed(3));
  const threeQuarter = Number((safeDuration * 0.75).toFixed(3));
  const positionDrift = layer.motion.intensity === 'dynamic' ? 8 : layer.motion.intensity === 'subtle' ? 2.5 : 5;
  if (layer.motion.preset === 'fade') {
    keyframes.push(
      { id: makeId(), property: 'opacity' as const, time: 0, value: 0, easing: 'linear' as const },
      { id: makeId(), property: 'opacity' as const, time: Math.min(0.6, safeDuration), value: layer.opacity, easing: 'linear' as const },
    );
  }
  if (layer.motion.preset === 'slide') {
    const direction = layer.motion.direction || 'left';
    const startX = direction === 'right' ? layer.x + positionDrift : direction === 'left' ? layer.x - positionDrift : layer.x;
    const startY = direction === 'up' ? layer.y - positionDrift : direction === 'down' ? layer.y + positionDrift : layer.y;
    keyframes.push(
      { id: makeId(), property: 'x' as const, time: 0, value: startX, easing: 'linear' as const },
      { id: makeId(), property: 'x' as const, time: Math.min(0.55, safeDuration), value: layer.x, easing: 'linear' as const },
      { id: makeId(), property: 'y' as const, time: 0, value: startY, easing: 'linear' as const },
      { id: makeId(), property: 'y' as const, time: Math.min(0.55, safeDuration), value: layer.y, easing: 'linear' as const },
      { id: makeId(), property: 'opacity' as const, time: 0, value: Math.min(layer.opacity, 15), easing: 'linear' as const },
      { id: makeId(), property: 'opacity' as const, time: Math.min(0.4, safeDuration), value: layer.opacity, easing: 'linear' as const },
    );
  }
  if (['pop', 'bounce', 'caption_highlight'].includes(layer.motion.preset)) {
    keyframes.push(
      { id: makeId(), property: 'scale' as const, time: 0, value: Math.max(10, layer.scale * 0.82), easing: 'linear' as const },
      { id: makeId(), property: 'scale' as const, time: Math.min(0.35, safeDuration), value: layer.motion.preset === 'bounce' ? layer.scale * 1.12 : layer.scale, easing: 'linear' as const },
      { id: makeId(), property: 'scale' as const, time: Math.min(0.7, safeDuration), value: layer.scale, easing: 'linear' as const },
    );
  }
  if (['zoom', 'pan', 'float', 'push_in', 'parallax'].includes(layer.motion.preset)) {
    keyframes.push(
      { id: makeId(), property: 'scale' as const, time: 0, value: layer.scale, easing: 'linear' as const },
      { id: makeId(), property: 'scale' as const, time: safeDuration, value: layer.scale * (layer.motion.preset === 'parallax' ? 1.07 : 1.05), easing: 'linear' as const },
    );
  }
  if (['pan', 'float', 'parallax'].includes(layer.motion.preset)) {
    const drift = layer.motion.preset === 'parallax' ? positionDrift * 0.7 : positionDrift * 0.45;
    keyframes.push(
      { id: makeId(), property: 'x' as const, time: 0, value: layer.x - drift, easing: 'linear' as const },
      { id: makeId(), property: 'x' as const, time: safeDuration, value: layer.x + drift, easing: 'linear' as const },
    );
    if (layer.motion.preset === 'float') {
      keyframes.push(
        { id: makeId(), property: 'y' as const, time: 0, value: layer.y, easing: 'linear' as const },
        { id: makeId(), property: 'y' as const, time: mid, value: layer.y - Math.max(1.5, drift), easing: 'linear' as const },
        { id: makeId(), property: 'y' as const, time: safeDuration, value: layer.y, easing: 'linear' as const },
      );
    }
  }
  if (layer.motion.preset === 'pull_out') {
    keyframes.push(
      { id: makeId(), property: 'scale' as const, time: 0, value: layer.scale * 1.07, easing: 'linear' as const },
      { id: makeId(), property: 'scale' as const, time: safeDuration, value: layer.scale, easing: 'linear' as const },
    );
  }
  if (layer.motion.preset === 'talking_bob') {
    const bob = layer.motion.intensity === 'dynamic' ? 2.6 : layer.motion.intensity === 'subtle' ? 0.9 : 1.6;
    keyframes.push(
      { id: makeId(), property: 'y' as const, time: 0, value: layer.y, easing: 'linear' as const },
      { id: makeId(), property: 'y' as const, time: quarter, value: layer.y - bob, easing: 'linear' as const },
      { id: makeId(), property: 'y' as const, time: mid, value: layer.y, easing: 'linear' as const },
      { id: makeId(), property: 'y' as const, time: threeQuarter, value: layer.y - bob * 0.7, easing: 'linear' as const },
      { id: makeId(), property: 'y' as const, time: safeDuration, value: layer.y, easing: 'linear' as const },
      { id: makeId(), property: 'scale' as const, time: 0, value: layer.scale, easing: 'linear' as const },
      { id: makeId(), property: 'scale' as const, time: mid, value: layer.scale * 1.015, easing: 'linear' as const },
      { id: makeId(), property: 'scale' as const, time: safeDuration, value: layer.scale, easing: 'linear' as const },
    );
  }
  if (layer.motion.preset === 'hand_wave') {
    const rotation = layer.motion.intensity === 'dynamic' ? 24 : layer.motion.intensity === 'subtle' ? 10 : 17;
    keyframes.push(
      { id: makeId(), property: 'rotation' as const, time: 0, value: -rotation * 0.45, easing: 'linear' as const },
      { id: makeId(), property: 'rotation' as const, time: quarter, value: rotation, easing: 'linear' as const },
      { id: makeId(), property: 'rotation' as const, time: mid, value: -rotation * 0.65, easing: 'linear' as const },
      { id: makeId(), property: 'rotation' as const, time: threeQuarter, value: rotation * 0.75, easing: 'linear' as const },
      { id: makeId(), property: 'rotation' as const, time: safeDuration, value: 0, easing: 'linear' as const },
      { id: makeId(), property: 'x' as const, time: 0, value: layer.x - 1.4, easing: 'linear' as const },
      { id: makeId(), property: 'x' as const, time: mid, value: layer.x + 1.8, easing: 'linear' as const },
      { id: makeId(), property: 'x' as const, time: safeDuration, value: layer.x, easing: 'linear' as const },
      { id: makeId(), property: 'y' as const, time: 0, value: layer.y, easing: 'linear' as const },
      { id: makeId(), property: 'y' as const, time: mid, value: layer.y - 2.2, easing: 'linear' as const },
      { id: makeId(), property: 'y' as const, time: safeDuration, value: layer.y, easing: 'linear' as const },
    );
  }
  if (layer.motion.preset === 'point') {
    const reach = layer.motion.intensity === 'dynamic' ? 8 : layer.motion.intensity === 'subtle' ? 3 : 5.5;
    keyframes.push(
      { id: makeId(), property: 'x' as const, time: 0, value: layer.x - reach * 0.4, easing: 'linear' as const },
      { id: makeId(), property: 'x' as const, time: Math.min(0.45, safeDuration), value: layer.x + reach, easing: 'linear' as const },
      { id: makeId(), property: 'x' as const, time: safeDuration, value: layer.x + reach * 0.65, easing: 'linear' as const },
      { id: makeId(), property: 'rotation' as const, time: 0, value: -8, easing: 'linear' as const },
      { id: makeId(), property: 'rotation' as const, time: Math.min(0.45, safeDuration), value: 8, easing: 'linear' as const },
      { id: makeId(), property: 'rotation' as const, time: safeDuration, value: 3, easing: 'linear' as const },
    );
  }
  if (layer.motion.preset === 'walk_cycle') {
    const stride = layer.motion.intensity === 'dynamic' ? 12 : layer.motion.intensity === 'subtle' ? 4 : 8;
    keyframes.push(
      { id: makeId(), property: 'x' as const, time: 0, value: layer.x - stride, easing: 'linear' as const },
      { id: makeId(), property: 'x' as const, time: safeDuration, value: layer.x + stride, easing: 'linear' as const },
      { id: makeId(), property: 'y' as const, time: 0, value: layer.y, easing: 'linear' as const },
      { id: makeId(), property: 'y' as const, time: quarter, value: layer.y - 1.4, easing: 'linear' as const },
      { id: makeId(), property: 'y' as const, time: mid, value: layer.y, easing: 'linear' as const },
      { id: makeId(), property: 'y' as const, time: threeQuarter, value: layer.y - 1.4, easing: 'linear' as const },
      { id: makeId(), property: 'y' as const, time: safeDuration, value: layer.y, easing: 'linear' as const },
    );
  }
  return keyframes.length > 0 ? keyframes : undefined;
};

const kineticCaptionContent = (scene: AnimationScene, fallback: string): string => {
  const template = scene.cue?.caption.template ?? 'clean_subtitle';
  const text = fallback || scene.summary || scene.transcript;
  if (template === 'headline_burst') {
    return (scene.summary || text).toUpperCase();
  }
  if (template !== 'keyword_pop') {
    return text;
  }
  const keyword = scene.cue?.caption.keywords?.[0];
  if (!keyword) return text;
  const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return text.replace(pattern, match => match.toUpperCase());
};

const textDataForAnimationLayer = (
  scene: AnimationScene,
  layer: AnimationLayer,
  content: string,
  visualLayer: boolean,
): TextData => {
  const template = scene.cue?.caption.template ?? 'clean_subtitle';
  const isCaption = layer.layerType === 'caption';
  const baseFontSize = visualLayer ? 34 : isCaption ? 38 : 34;
  const templateStyle: Partial<TextData> = isCaption && template === 'headline_burst'
    ? { fontSize: 46, bold: true, y: Math.min(layer.y, 24), bgOpacity: 0.18 }
    : isCaption && template === 'karaoke_highlight'
      ? { fontSize: 38, bold: true, bgOpacity: 0.52 }
      : isCaption && template === 'keyword_pop'
        ? { fontSize: 42, bold: true, bgOpacity: 0.42 }
        : {};
  return {
    ...DEFAULT_TEXT_DATA,
    content,
    fontSize: templateStyle.fontSize ?? baseFontSize,
    bold: templateStyle.bold ?? false,
    x: layer.x,
    y: templateStyle.y ?? layer.y,
    bgOpacity: templateStyle.bgOpacity ?? (isCaption ? 0.45 : 0.35),
  };
};

const rememberedProject = loadProjectPointer();

export const useEditorStore = create<EditorState>((set, get) => ({
  // --- Project ---
  currentProject: null,
  projectName: DEFAULT_PROJECT_NAME,
  projectDirectory: '',
  projectContentProfileId: null,
  projectTargetPlatform: null,
  projectContentGoal: '',
  projectVideoType: '',
  projectPlannedTitle: '',
  projectPlannedDescription: '',
  projectScriptId: null,
  availableProjects: rememberedProject ? [rememberedProject] : [],
  projectStatus: 'Create or load a project to start.',
  isSavingProject: false,
  isLoadingProjects: false,
  setProjectName: (name) => set({ projectName: name }),
  setProjectDirectory: (directory) => set({ projectDirectory: directory }),
  setProjectContentProfileId: (projectContentProfileId) => {
    set({ projectContentProfileId });
    if (get().currentProject) scheduleProjectAutosave(get);
  },
  setProjectTargetPlatform: (projectTargetPlatform) => {
    set(state => {
      const aspectRatio = targetPlatformAspectRatio(projectTargetPlatform);
      return {
        projectTargetPlatform,
        ...(aspectRatio ? {
          exportSettings: { ...state.exportSettings, aspectRatio },
          storyboardSettings: { ...state.storyboardSettings, aspectRatio },
        } : {}),
      };
    });
    if (get().currentProject) scheduleProjectAutosave(get);
  },
  setProjectContentGoal: (projectContentGoal) => {
    set({ projectContentGoal });
    if (get().currentProject) scheduleProjectAutosave(get);
  },
  setProjectVideoType: (projectVideoType) => {
    set({ projectVideoType });
    if (get().currentProject) scheduleProjectAutosave(get);
  },
  setProjectPlannedTitle: (projectPlannedTitle) => {
    set({ projectPlannedTitle });
    if (get().currentProject) scheduleProjectAutosave(get);
  },
  setProjectPlannedDescription: (projectPlannedDescription) => {
    set({ projectPlannedDescription });
    if (get().currentProject) scheduleProjectAutosave(get);
  },
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
      const project = projectSummary(await createProjectRecord(
        name,
        parentDirectory,
        projectMetadata(state),
      ));
      rememberProjectPointer(project);
      set({
        currentProject: project,
        projectName: project.name,
        projectDirectory: project.folderPath,
        projectContentProfileId: project.contentProfileId,
        projectTargetPlatform: project.targetPlatform,
        projectContentGoal: project.contentGoal,
        projectVideoType: project.videoType,
        projectPlannedTitle: project.plannedTitle,
        projectPlannedDescription: project.plannedDescription,
        projectScriptId: project.scriptId,
        availableProjects: [project, ...state.availableProjects.filter(existing => existing.id !== project.id)],
        projectStatus: `Project created: ${project.folderPath}`,
        assets: [],
        tracks: makeDefaultTracks(),
        clips: [],
        markers: [],
        selectedClipId: null,
        selectedClipIds: [],
        snapGuideTime: null,
        historyPast: [],
        historyFuture: [],
        captions: [],
        storyboardScenes: [],
        currentGenerationBatchId: null,
        generationJobs: [],
        generatedMediaAssets: [],
        isGenerationBatchPaused: false,
        animationSettings: DEFAULT_ANIMATION_SETTINGS,
        animationPlan: null,
        animationAssetLibrary: [],
        animationAssetJobs: [],
        currentAnimationBatchId: null,
        animationStatus: null,
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
      rememberProjectPointer(projectSummary(project));
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
      rememberProjectPointer(projectSummary(project));
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
      projectContentProfileId: null,
      projectTargetPlatform: null,
      projectContentGoal: '',
      projectVideoType: '',
      projectPlannedTitle: '',
      projectPlannedDescription: '',
      projectScriptId: null,
      projectStatus: 'Choose a directory and create a project to start.',
      assets: [],
      tracks: makeDefaultTracks(),
      clips: [],
      markers: [],
      selectedClipId: null,
      selectedClipIds: [],
      zoom: 20,
      snapEnabled: true,
      snapGuideTime: null,
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
      animationSettings: DEFAULT_ANIMATION_SETTINGS,
      animationPlan: null,
      animationAssetLibrary: [],
      animationAssetJobs: [],
      currentAnimationBatchId: null,
      isGeneratingAnimationPlan: false,
      isSyncingAnimationAssets: false,
      animationStatus: null,
    } as Partial<EditorState>);
  },
  saveProject: async () => {
    if (!get().currentProject) {
      alert('Create or load a project before saving.');
      return null;
    }
    set({ isSavingProject: true, projectStatus: 'Saving project...' } as Partial<EditorState>);
    try {
      const current = get();
      const persisted = await persistProjectAssets(current.currentProject!.id, current.assets);
      if (persisted.changed) set({ assets: persisted.assets });
      const savedProject = await persistProjectSnapshot({ ...get(), assets: persisted.assets });
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
    const project = get().currentProject;
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
        const duration = await getMediaDuration(f, type).catch(() => mediaKind === 'image' ? 10 : undefined);
        const thumbnailUrl = await generateThumbnail(f, mediaKind);
        const newAsset: MediaAsset = {
          id: Math.random().toString(36).substring(7),
          file: f,
          type,
          mediaKind,
          duration,
          thumbnailUrl
        };
        if (project) {
          try {
            const saved = await uploadProjectAsset(project.id, newAsset.id, f);
            newAsset.sourceUrl = saved.url;
            newAsset.localPath = saved.localPath;
          } catch (error) {
            console.warn('Could not immediately save imported media to project folder.', error);
          }
        }
        newAssets.push(newAsset);

        // Async background generation of rich visuals
        if (mediaKind === 'audio') {
          generateWaveform(f, 1000).then(waveform => {
            set(state => ({
              assets: state.assets.map(a => a.id === newAsset.id ? { ...a, waveform } : a)
            }));
          });
        } else if (mediaKind === 'video') {
          const sourceDuration = duration;
          if (sourceDuration && sourceDuration > 0 && sourceDuration !== Infinity) {
            const framesCount = Math.min(50, Math.max(5, Math.ceil(sourceDuration / 2)));
            generateFilmstrip(f, sourceDuration, framesCount).then(filmstrip => {
                set(state => ({
                  assets: state.assets.map(a => a.id === newAsset.id ? { ...a, filmstrip } : a)
                }));
            });
          }
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
        locked: false,
        visible: true,
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
  moveTrack: (id, direction) => {
    set(state => {
      const track = state.tracks.find(candidate => candidate.id === id);
      if (!track) return state;
      const siblings = state.tracks
        .filter(candidate => candidate.type === track.type)
        .sort((a, b) => track.type === 'audio' ? a.order - b.order : b.order - a.order);
      const currentIndex = siblings.findIndex(candidate => candidate.id === id);
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      const target = siblings[targetIndex];
      if (!target) return state;
      return {
        ...withHistory(state),
        tracks: state.tracks.map(candidate => {
          if (candidate.id === track.id) return { ...candidate, order: target.order };
          if (candidate.id === target.id) return { ...candidate, order: track.order };
          return candidate;
        }),
      };
    });
  },

  // --- Timeline Clips ---
  clips: [],
  markers: [],
  selectedClipId: null,
  selectedClipIds: [],
  setSelectedClip: (id: string | null) => set({
    selectedClipId: id,
    selectedClipIds: id ? [id] : [],
  }),
  toggleClipSelection: (id) => set(state => {
    const alreadySelected = state.selectedClipIds.includes(id);
    const selectedClipIds = alreadySelected
      ? state.selectedClipIds.filter(selectedId => selectedId !== id)
      : [...state.selectedClipIds, id];
    return {
      selectedClipIds,
      selectedClipId: alreadySelected
        ? (state.selectedClipId === id ? selectedClipIds[selectedClipIds.length - 1] ?? null : state.selectedClipId)
        : id,
    };
  }),
  zoom: 20,
  setZoom: (zoom) => set({ zoom }),
  snapEnabled: true,
  snapGuideTime: null,
  toggleSnap: () => set(state => ({
    snapEnabled: !state.snapEnabled,
    snapGuideTime: state.snapEnabled ? null : state.snapGuideTime,
  })),
  setSnapGuideForTime: (time, movingClipId) => set(state => {
    const result = getSnapResult(state, time, movingClipId);
    return { snapGuideTime: result.snapped ? result.time : null };
  }),
  clearSnapGuide: () => set({ snapGuideTime: null }),
  historyPast: [],
  historyFuture: [],

  addAssetToTimeline: async (asset: MediaAsset, trackId?: string, startTimeX?: number) => {
    const state = get();
    const sourceDuration = isFiniteSeconds(asset.duration)
      ? asset.duration
      : await getMediaDuration(asset.file, asset.type);

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
      duration: asset.type === 'visual' && asset.file.type.startsWith('image') ? 10 : sourceDuration,
      startTime: Math.max(0, targetStartTime),
      mediaOffset: 0,
      transform: { scale: 100, rotation: 0, opacity: 100, flipX: false, flipY: false },
      crop: { ...DEFAULT_CROP },
      color: { brightness: 100, contrast: 100, saturation: 100, exposure: 0, temperature: 0, highlights: 0, shadows: 0, red: 0, green: 0, blue: 0 },
      effects: { ...DEFAULT_EFFECTS },
      speed: { ...DEFAULT_SPEED },
      transition: { ...DEFAULT_TRANSITION },
      compositing: { ...DEFAULT_COMPOSITING },
      audio: { ...DEFAULT_AUDIO_DATA }
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
      audio: { ...DEFAULT_AUDIO_DATA, volume: 0, mute: true },
      transform: { scale: 100, rotation: 0, opacity: 100, flipX: false, flipY: false },
      crop: { ...DEFAULT_CROP },
      speed: { ...DEFAULT_SPEED },
      transition: { ...DEFAULT_TRANSITION },
      compositing: { ...DEFAULT_COMPOSITING },
      textData: { ...DEFAULT_TEXT_DATA }
    };
    set({
      ...withHistory(state),
      clips: [...state.clips, newClip],
      selectedClipId: newClip.id,
      selectedClipIds: [newClip.id],
    });
  },

  addCaptionClip: (trackId: string, startTime: number, duration: number = 3) => {
    const state = get();
    const placeholderFile = new File([], 'caption-overlay.txt', { type: 'text/plain' });
    const newClip: TimelineClip = {
      id: Math.random().toString(36).substring(7),
      assetId: 'caption-' + Math.random().toString(36).substring(7),
      trackId,
      file: placeholderFile,
      type: 'text',
      duration,
      startTime,
      mediaOffset: 0,
      audio: { ...DEFAULT_AUDIO_DATA, volume: 0, mute: true },
      transform: { scale: 100, rotation: 0, opacity: 100, flipX: false, flipY: false },
      crop: { ...DEFAULT_CROP },
      speed: { ...DEFAULT_SPEED },
      transition: { ...DEFAULT_TRANSITION },
      compositing: { ...DEFAULT_COMPOSITING },
      textData: {
        ...DEFAULT_TEXT_DATA,
        content: 'New caption',
        fontSize: 42,
        bold: true,
        y: 82,
        bgOpacity: 0.45,
        boxPadding: 12,
        boxRadius: 10,
        maxWidthPercent: 82,
        maxCharsPerLine: 26,
      },
    };
    set({
      ...withHistory(state),
      clips: [...state.clips, newClip],
      selectedClipId: newClip.id,
      selectedClipIds: [newClip.id],
    });
  },

  removeClip: (id: string) => set(state => {
    const clip = state.clips.find(c => c.id === id);
    if (!clip || isTrackLocked(state.tracks, clip.trackId)) return state;
    return {
      ...withHistory(state),
      clips: state.clips.filter(c => c.id !== id),
      selectedClipIds: state.selectedClipIds.filter(selectedId => selectedId !== id),
      selectedClipId: state.selectedClipId === id ? null : state.selectedClipId,
    };
  }),

  duplicateClip: (id: string) => set(state => {
    const clip = state.clips.find(item => item.id === id);
    if (!clip || isTrackLocked(state.tracks, clip.trackId)) return state;
    const duplicate = cloneClips([clip])[0];
    duplicate.id = makeId();
    duplicate.startTime = snapTime(state, clip.startTime + clip.duration, clip.id);
    duplicate.keyframes = duplicate.keyframes?.map(keyframe => ({ ...keyframe, id: makeId() }));
    return {
      ...withHistory(state),
      clips: [...state.clips, duplicate],
      selectedClipId: duplicate.id,
      selectedClipIds: [duplicate.id],
    };
  }),

  rippleDeleteClip: (id: string) => set(state => {
    const clip = state.clips.find(item => item.id === id);
    if (!clip || isTrackLocked(state.tracks, clip.trackId)) return state;
    const clipEnd = clip.startTime + clip.duration;
    return {
      ...withHistory(state),
      clips: state.clips
        .filter(item => item.id !== id)
        .map(item => item.trackId === clip.trackId && item.startTime >= clipEnd
          ? { ...item, startTime: Math.max(0, item.startTime - clip.duration) }
          : item),
      selectedClipId: state.selectedClipId === id ? null : state.selectedClipId,
      selectedClipIds: state.selectedClipIds.filter(selectedId => selectedId !== id),
    };
  }),

  groupSelectedClips: () => set(state => {
    const selectedIds = state.selectedClipIds.filter(id => state.clips.some(clip => clip.id === id));
    if (selectedIds.length < 2) return state;
    const groupId = makeId();
    return {
      ...withHistory(state),
      clips: state.clips.map(clip => selectedIds.includes(clip.id) ? { ...clip, groupId } : clip),
    };
  }),

  ungroupSelectedClips: () => set(state => {
    const groupIds = new Set(
      state.clips
        .filter(clip => state.selectedClipIds.includes(clip.id) && clip.groupId)
        .map(clip => clip.groupId as string)
    );
    if (groupIds.size === 0) return state;
    return {
      ...withHistory(state),
      clips: state.clips.map(clip => clip.groupId && groupIds.has(clip.groupId) ? { ...clip, groupId: null } : clip),
    };
  }),

  rippleTrimClip: (id, edge, deltaSeconds) => set(state => {
    const clip = state.clips.find(item => item.id === id);
    if (!clip || isTrackLocked(state.tracks, clip.trackId) || deltaSeconds === 0) return state;
    const minDuration = 0.1;
    if (edge === 'left') {
      const appliedDelta = Math.max(-clip.mediaOffset, Math.min(clip.duration - minDuration, deltaSeconds));
      if (appliedDelta === 0) return state;
      return {
        ...withHistory(state),
        clips: state.clips.map(item => {
          if (item.id === clip.id) {
            return {
              ...item,
              startTime: item.startTime + appliedDelta,
              duration: item.duration - appliedDelta,
              mediaOffset: Math.max(0, item.mediaOffset + appliedDelta),
            };
          }
          if (item.trackId === clip.trackId && item.startTime >= clip.startTime) {
            return { ...item, startTime: Math.max(0, item.startTime - appliedDelta) };
          }
          return item;
        }),
      };
    }
    const appliedDelta = Math.max(-clip.duration + minDuration, deltaSeconds);
    if (appliedDelta === 0) return state;
    const clipEnd = clip.startTime + clip.duration;
    return {
      ...withHistory(state),
      clips: state.clips.map(item => {
        if (item.id === clip.id) return { ...item, duration: item.duration + appliedDelta };
        if (item.trackId === clip.trackId && item.startTime >= clipEnd) {
          return { ...item, startTime: Math.max(0, item.startTime + appliedDelta) };
        }
        return item;
      }),
    };
  }),

  rollTrimClip: (id, deltaSeconds) => set(state => {
    const clip = state.clips.find(item => item.id === id);
    if (!clip || isTrackLocked(state.tracks, clip.trackId) || deltaSeconds === 0) return state;
    const next = state.clips
      .filter(item => item.trackId === clip.trackId && item.startTime >= clip.startTime + clip.duration - 0.001 && item.id !== clip.id)
      .sort((a, b) => a.startTime - b.startTime)[0];
    if (!next) return state;
    const maxForward = next.duration - 0.1;
    const maxBackward = clip.duration - 0.1;
    const appliedDelta = Math.max(-maxBackward, Math.min(maxForward, deltaSeconds));
    if (appliedDelta === 0) return state;
    return {
      ...withHistory(state),
      clips: state.clips.map(item => {
        if (item.id === clip.id) return { ...item, duration: item.duration + appliedDelta };
        if (item.id === next.id) {
          return {
            ...item,
            startTime: item.startTime + appliedDelta,
            duration: item.duration - appliedDelta,
            mediaOffset: Math.max(0, item.mediaOffset + appliedDelta),
          };
        }
        return item;
      }),
    };
  }),

  slipClip: (id, deltaSeconds) => set(state => {
    const clip = state.clips.find(item => item.id === id);
    if (!clip || isTrackLocked(state.tracks, clip.trackId) || deltaSeconds === 0) return state;
    return {
      ...withHistory(state),
      clips: state.clips.map(item => item.id === clip.id
        ? { ...item, mediaOffset: Math.max(0, item.mediaOffset + deltaSeconds) }
        : item),
    };
  }),

  slideClip: (id, deltaSeconds) => set(state => {
    const clip = state.clips.find(item => item.id === id);
    if (!clip || isTrackLocked(state.tracks, clip.trackId) || deltaSeconds === 0) return state;
    const sameTrack = state.clips
      .filter(item => item.trackId === clip.trackId && item.id !== clip.id)
      .sort((a, b) => a.startTime - b.startTime);
    const previous = [...sameTrack].reverse().find(item => item.startTime + item.duration <= clip.startTime + 0.001);
    const next = sameTrack.find(item => item.startTime >= clip.startTime + clip.duration - 0.001);
    if (!previous || !next) return state;
    const maxLeft = previous.duration - 0.1;
    const maxRight = next.duration - 0.1;
    const appliedDelta = Math.max(-maxLeft, Math.min(maxRight, deltaSeconds));
    if (appliedDelta === 0) return state;
    return {
      ...withHistory(state),
      clips: state.clips.map(item => {
        if (item.id === previous.id) return { ...item, duration: item.duration + appliedDelta };
        if (item.id === clip.id) return { ...item, startTime: Math.max(0, item.startTime + appliedDelta) };
        if (item.id === next.id) {
          return {
            ...item,
            startTime: item.startTime + appliedDelta,
            duration: item.duration - appliedDelta,
            mediaOffset: Math.max(0, item.mediaOffset + appliedDelta),
          };
        }
        return item;
      }),
    };
  }),

  updateClipStartTime: (id: string, deltaX: number) => {
    set(state => {
      const movingClip = state.clips.find(clip => clip.id === id);
      if (!movingClip) return state;
      const groupedClips = movingClip.groupId
        ? state.clips.filter(clip => clip.groupId === movingClip.groupId)
        : [movingClip];
      if (groupedClips.some(clip => isTrackLocked(state.tracks, clip.trackId))) return state;
      const timeDelta = deltaX / state.zoom;
      const snappedStart = snapTime(
        state,
        movingClip.startTime + timeDelta,
        groupedClips.map(clip => clip.id),
      );
      const requestedOffset = snappedStart - movingClip.startTime;
      const earliestStart = Math.min(...groupedClips.map(clip => clip.startTime));
      const appliedOffset = Math.max(-earliestStart, requestedOffset);
      const groupedIds = new Set(groupedClips.map(clip => clip.id));
      return {
        ...withHistory(state),
        clips: state.clips.map(clip => groupedIds.has(clip.id)
          ? { ...clip, startTime: clip.startTime + appliedOffset }
          : clip),
      };
    });
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

  updateClipPosition: (id, x, y) => {
    set(state => ({
      ...withHistory(state),
      clips: state.clips.map(clip => {
        if (clip.id !== id || isTrackLocked(state.tracks, clip.trackId)) return clip;
        if (clip.type === 'text') {
          return {
            ...clip,
            textData: {
              ...(clip.textData || DEFAULT_TEXT_DATA),
              x,
              y,
            },
          };
        }
        return {
          ...clip,
          transform: {
            ...(clip.transform || { scale: 100, rotation: 0, opacity: 100, flipX: false, flipY: false }),
            x,
            y,
          },
        };
      }),
    }));
  },

  updateClipCrop: (id, cropData) => {
    set(state => ({
      ...withHistory(state),
      clips: state.clips.map(clip => {
        if (clip.id !== id || isTrackLocked(state.tracks, clip.trackId)) return clip;
        const nextCrop = { ...(clip.crop || DEFAULT_CROP), ...cropData };
        return {
          ...clip,
          crop: {
            left: Math.max(0, Math.min(45, nextCrop.left)),
            right: Math.max(0, Math.min(45, nextCrop.right)),
            top: Math.max(0, Math.min(45, nextCrop.top)),
            bottom: Math.max(0, Math.min(45, nextCrop.bottom)),
          },
        };
      }),
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

  updateClipEffects: (id: string, effectsData: Partial<NonNullable<TimelineClip['effects']>>) => {
    set(state => ({
      ...withHistory(state),
      clips: state.clips.map(clip => {
        if (clip.id === id) {
          if (isTrackLocked(state.tracks, clip.trackId)) return clip;
          return {
            ...clip,
            effects: { ...(clip.effects || DEFAULT_EFFECTS), ...effectsData },
          };
        }
        return clip;
      }),
    }));
  },

  updateClipSpeed: (id, speedData) => {
    set(state => ({
      ...withHistory(state),
      clips: state.clips.map(clip => clip.id === id && !isTrackLocked(state.tracks, clip.trackId)
        ? {
            ...clip,
            speed: {
              ...(clip.speed || DEFAULT_SPEED),
              ...speedData,
              rate: Math.max(0.25, Math.min(4, speedData.rate ?? clip.speed?.rate ?? DEFAULT_SPEED.rate)),
            },
          }
        : clip),
    }));
  },

  updateClipTransition: (id, transitionData) => {
    set(state => ({
      ...withHistory(state),
      clips: state.clips.map(clip => clip.id === id && !isTrackLocked(state.tracks, clip.trackId)
        ? {
            ...clip,
            transition: {
              ...(clip.transition || DEFAULT_TRANSITION),
              ...transitionData,
              duration: Math.max(0, Math.min(2, transitionData.duration ?? clip.transition?.duration ?? DEFAULT_TRANSITION.duration)),
            },
          }
        : clip),
    }));
  },

  updateClipCompositing: (id, compositingData) => {
    set(state => ({
      ...withHistory(state),
      clips: state.clips.map(clip => clip.id === id && !isTrackLocked(state.tracks, clip.trackId)
        ? {
            ...clip,
            compositing: {
              ...(clip.compositing || DEFAULT_COMPOSITING),
              ...compositingData,
            },
          }
        : clip),
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
            audio: { ...(clip.audio || DEFAULT_AUDIO_DATA), ...audioData }
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
  applyCaptionDesignToCaptionClips: (design) => {
    let updatedCount = 0;
    set(state => {
      const clips = state.clips.map(clip => {
        if (!isCaptionTimelineClip(clip)) return clip;
        updatedCount += 1;
        return {
          ...clip,
          textData: {
            ...DEFAULT_TEXT_DATA,
            ...clip.textData,
            fontFamily: design.fontFamily,
            fontSize: design.fontSize,
            color: design.color,
            bold: design.bold,
            align: design.align,
            x: design.x,
            y: design.y,
            bgColor: design.bgColor,
            bgOpacity: design.bgOpacity,
          },
        };
      });
      if (updatedCount === 0) return state;
      return {
        ...withHistory(state),
        clips,
      };
    });
    return updatedCount;
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

  applyMotionPreset: (id, preset) => {
    set(state => {
      const clip = state.clips.find(candidate => candidate.id === id);
      if (!clip || isTrackLocked(state.tracks, clip.trackId)) return state;
      return {
        ...withHistory(state),
        clips: state.clips.map(candidate => candidate.id === id
          ? { ...candidate, keyframes: makeMotionPresetKeyframes(candidate, preset) }
          : candidate),
      };
    });
  },

  copiedKeyframes: null,
  copyKeyframes: (id) => {
    const clip = get().clips.find(candidate => candidate.id === id);
    set({
      copiedKeyframes: clip?.keyframes?.map(keyframe => ({ ...keyframe })) ?? null,
    });
  },

  pasteKeyframes: (id) => {
    set(state => {
      const clip = state.clips.find(candidate => candidate.id === id);
      if (!clip || isTrackLocked(state.tracks, clip.trackId) || !state.copiedKeyframes?.length) return state;
      return {
        ...withHistory(state),
        clips: state.clips.map(candidate => candidate.id === id
          ? {
              ...candidate,
              keyframes: state.copiedKeyframes!.map(keyframe => ({
                ...keyframe,
                id: makeId(),
                time: Number(clampKeyframeTime(candidate, keyframe.time).toFixed(3)),
              })),
            }
          : candidate),
      };
    });
  },

  addMarker: (time, label) => {
    set(state => {
      const normalizedTime = Math.max(0, time);
      const existing = state.markers.find(marker => Math.abs(marker.time - normalizedTime) < 0.05);
      if (existing) return state;
      const marker: TimelineMarker = {
        id: makeId(),
        time: normalizedTime,
        label: label?.trim() || `Marker ${state.markers.length + 1}`,
        color: '#f2c46d',
      };
      return {
        ...withHistory(state),
        markers: [...state.markers, marker].sort((a, b) => a.time - b.time),
      };
    });
  },

  addMarkers: (markers) => {
    set(state => {
      const nextMarkers = markers
        .map(marker => ({
          id: makeId(),
          time: Math.max(0, marker.time),
          label: marker.label.trim(),
          color: marker.color,
        }))
        .filter(marker => marker.label)
        .filter(marker => !state.markers.some(existing => Math.abs(existing.time - marker.time) < 0.05));
      if (nextMarkers.length === 0) return state;
      return {
        ...withHistory(state),
        markers: [...state.markers, ...nextMarkers].sort((a, b) => a.time - b.time),
      };
    });
  },

  createBeatMarkersFromClip: (id) => {
    const state = get();
    const clip = state.clips.find(item => item.id === id);
    if (!clip || clip.type !== 'audio') return 0;
    const asset = state.assets.find(item => item.id === clip.assetId);
    const waveform = asset?.waveform;
    if (!waveform || waveform.length < 3) return 0;

    const average = waveform.reduce((sum, value) => sum + value, 0) / waveform.length;
    const threshold = Math.max(0.56, average + 0.18);
    const sourceDuration = asset?.duration && asset.duration > 0
      ? asset.duration
      : Math.max(clip.duration, (clip.mediaOffset || 0) + clip.duration);
    const clipStartRatio = Math.max(0, Math.min(1, (clip.mediaOffset || 0) / sourceDuration));
    const clipEndRatio = Math.max(clipStartRatio, Math.min(1, ((clip.mediaOffset || 0) + clip.duration) / sourceDuration));
    const startIndex = Math.floor(clipStartRatio * waveform.length);
    const endIndex = Math.max(startIndex + 1, Math.ceil(clipEndRatio * waveform.length));
    const markerCandidates: Array<Pick<TimelineMarker, 'time' | 'label' | 'color'>> = [];
    let lastMarkerTime = Number.NEGATIVE_INFINITY;

    for (let index = Math.max(1, startIndex); index < Math.min(waveform.length - 1, endIndex); index += 1) {
      const value = waveform[index];
      if (value < threshold || value < waveform[index - 1] || value < waveform[index + 1]) continue;
      const sourceTime = (index / waveform.length) * sourceDuration;
      const timelineTime = clip.startTime + Math.max(0, sourceTime - (clip.mediaOffset || 0));
      if (timelineTime - lastMarkerTime < 0.35) continue;
      markerCandidates.push({
        time: timelineTime,
        label: `Beat ${markerCandidates.length + 1}`,
        color: '#78c58d',
      });
      lastMarkerTime = timelineTime;
    }

    const limitedMarkers = markerCandidates.slice(0, 48);
    if (limitedMarkers.length === 0) return 0;
    get().addMarkers(limitedMarkers);
    return limitedMarkers.length;
  },

  splitSelectedClipAtCaptionBoundaries: () => {
    const state = get();
    const clip = state.selectedClipId
      ? state.clips.find(item => item.id === state.selectedClipId)
      : null;
    if (!clip || state.captions.length === 0 || isTrackLocked(state.tracks, clip.trackId)) return 0;
    const clipEnd = clip.startTime + clip.duration;
    const boundaries = state.captions
      .map(caption => caption.start)
      .filter(time => time > clip.startTime + 0.05 && time < clipEnd - 0.05)
      .sort((a, b) => a - b);
    if (boundaries.length === 0) return 0;

    const segmentStarts = [clip.startTime, ...boundaries];
    const segmentEnds = [...boundaries, clipEnd];
    const segments = segmentStarts.map((startTime, index) => {
      const segmentDuration = segmentEnds[index] - startTime;
      const offset = startTime - clip.startTime;
      return {
        ...clip,
        id: index === 0 ? clip.id : makeId(),
        startTime,
        duration: segmentDuration,
        mediaOffset: (clip.mediaOffset || 0) + offset,
        keyframes: clip.keyframes
          ?.filter(keyframe => keyframe.time >= offset && keyframe.time <= offset + segmentDuration)
          .map(keyframe => ({ ...keyframe, time: keyframe.time - offset })),
      };
    });

    set({
      ...withHistory(state),
      clips: state.clips.flatMap(item => item.id === clip.id ? segments : [item]),
      selectedClipId: segments[0]?.id ?? state.selectedClipId,
      selectedClipIds: segments[0]?.id ? [segments[0].id] : state.selectedClipIds,
    });
    return Math.max(0, segments.length - 1);
  },

  updateMarker: (id, updates) => {
    set(state => ({
      ...withHistory(state),
      markers: state.markers
        .map(marker => marker.id === id
          ? {
              ...marker,
              ...updates,
              time: updates.time === undefined ? marker.time : Math.max(0, updates.time),
            }
          : marker)
        .sort((a, b) => a.time - b.time),
    }));
  },

  removeMarker: (id) => {
    set(state => ({
      ...withHistory(state),
      markers: state.markers.filter(marker => marker.id !== id),
    }));
  },

  undo: () => {
    set(state => {
      const previous = state.historyPast[state.historyPast.length - 1];
      if (!previous) return state;
      return {
        clips: cloneClips(previous.clips),
        tracks: cloneTracks(previous.tracks),
        markers: cloneMarkers(previous.markers),
        historyPast: state.historyPast.slice(0, -1),
        historyFuture: [makeSnapshot(state), ...state.historyFuture].slice(0, HISTORY_LIMIT),
        selectedClipId: previous.clips.some(clip => clip.id === state.selectedClipId) ? state.selectedClipId : null,
        selectedClipIds: state.selectedClipIds.filter(selectedId => previous.clips.some(clip => clip.id === selectedId)),
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
        markers: cloneMarkers(next.markers),
        historyPast: [...state.historyPast, makeSnapshot(state)].slice(-HISTORY_LIMIT),
        historyFuture: state.historyFuture.slice(1),
        selectedClipId: next.clips.some(clip => clip.id === state.selectedClipId) ? state.selectedClipId : null,
        selectedClipIds: state.selectedClipIds.filter(selectedId => next.clips.some(clip => clip.id === selectedId)),
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
  animationSettings: DEFAULT_ANIMATION_SETTINGS,
  animationPlan: null,
  animationAssetLibrary: [],
  animationAssetJobs: [],
  currentAnimationBatchId: null,
  isGeneratingAnimationPlan: false,
  isSyncingAnimationAssets: false,
  animationStatus: null,
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
          visible: true,
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
        selectedClipIds: captionClips[0]?.id ? [captionClips[0].id] : state.selectedClipIds,
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
    const range = getStoryboardRange(settings, source);
    if (settings.timeRangeMode === 'custom' && !range) {
      alert('Set a valid custom time range before generating scenes.');
      return;
    }

    const timedSegments = getStoryboardSegments(state.captions, source, range);
    const transcript = timedSegments.map(segment => segment.text).join(' ').trim();

    if (!transcript && !source) {
      alert('Generate a transcript or select an audio/video clip first.');
      return;
    }

    if (!transcript && range && source && !isAudioFileSource(source.file)) {
      alert('Custom or trimmed range generation needs captions for video sources. Generate a transcript first, or use an audio file.');
      return;
    }

    set({
      isGeneratingStoryboard: true,
      storyboardStatus: transcript ? 'Generating storyboard from captions...' : `Transcribing and planning ${source?.file.name}...`,
    } as Partial<EditorState>);

    try {
      const storyboardOptions = {
        provider: settings.provider,
        preferredVisualType: settings.visualType,
        videoMixPercent: settings.videoMixPercent,
        sceneDensity: settings.sceneDensity,
        motionIntensity: settings.motionIntensity,
        promptDetail: settings.promptDetail,
        style: settings.style,
      };
      let response;
      let responseTimeShift = 0;

      if (transcript) {
        response = await createStoryboardFromTranscript(transcript, timedSegments, storyboardOptions);
      } else {
        let audioFile = source!.file;
        if (range && isAudioFileSource(source!.file)) {
          audioFile = await extractAudioSegment(source!.file, range.mediaStart, range.mediaEnd - range.mediaStart);
          responseTimeShift = range.timelineStart;
        }
        response = await createStoryboardFromAudio(audioFile, storyboardOptions);
      }

      const scenes = normalizeStoryboardScenes(response.scenes, settings, responseTimeShift);
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
        sceneGoal: previous ? 'Advance the story and maintain retention' : 'Hook attention immediately',
        viewerEmotion: previous ? 'engagement' : 'curiosity',
        visualHook: '',
        motionStyle: state.storyboardSettings.visualType === 'video' ? 'steady cinematic movement' : 'static composition',
        captionText: '',
        transition: 'cut',
        soundEffect: '',
        musicSuggestion: '',
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
      const persisted = await persistProjectAssets(state.currentProject.id, state.assets);
      if (persisted.changed) set({ assets: persisted.assets });
      const project = await persistProjectSnapshot({ ...get(), assets: persisted.assets });
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
        project.name,
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
          selectedClipIds: state.selectedClipIds.filter(selectedId => !removedClipIds.has(selectedId)),
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
  autoRetryGenerationJob: async (jobId, maxAttempts) => {
    const batchId = getCurrentGenerationBatchId(get());
    set({ storyboardStatus: 'Rewriting prompt and retrying scene...' });
    try {
      const retriedJob = await autoRetryGenerationJobRequest(jobId, maxAttempts);
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
          selectedClipIds: state.selectedClipIds.filter(selectedId => !removedClipIds.has(selectedId)),
          generationJobs: nextJobs,
          generatedMediaAssets: state.generatedMediaAssets.filter(asset => asset.jobId !== jobId),
          storyboardScenes: mergeSceneStatuses(state.storyboardScenes, nextJobs, nextClips, activeBatchId),
          storyboardStatus: retriedJob.status === 'queued'
            ? 'Scene queued with rewritten prompt.'
            : 'Auto retry limit reached for this scene.',
        };
      });
      if (get().currentProject) void get().saveProject();
      void get().syncGenerationBatch(true);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Could not auto retry generation job');
      set({ storyboardStatus: 'Auto retry failed.' });
    }
  },
  regenerateFailedScene: async (sceneId, rewrite = false) => {
    const state = get();
    const project = state.currentProject;
    if (!project) {
      alert('Create or load a project before regenerating a scene.');
      return;
    }
    const batchId = getCurrentGenerationBatchId(state);
    const existingJob = state.generationJobs.find(job =>
      job.sceneId === sceneId &&
      (!batchId || job.batchId === batchId) &&
      job.projectId === project.id
    );
    if (existingJob) {
      if (rewrite) {
        await get().autoRetryGenerationJob(existingJob.id);
      } else {
        await get().retryGenerationJob(existingJob.id);
      }
      return;
    }

    const scene = state.storyboardScenes.find(item => item.id === sceneId);
    if (!scene) {
      alert('Scene not found.');
      return;
    }
    set({ storyboardStatus: 'Creating one generation job for this scene...' });
    try {
      const response = await createGenerationJobs(
        [{ ...scene, status: 'approved' }],
        state.storyboardSettings.provider,
        state.storyboardSettings.aspectRatio,
        project.id,
        project.name,
        batchId,
      );
      const activeBatchId = response.batchId ?? batchId ?? response.jobs[0]?.batchId ?? null;
      set(current => {
        const existingIds = new Set(current.generationJobs.map(job => job.id));
        const nextJobs = [
          ...current.generationJobs,
          ...response.jobs.filter(job => !existingIds.has(job.id)),
        ];
        return {
          currentGenerationBatchId: activeBatchId,
          generationJobs: nextJobs,
          storyboardScenes: mergeSceneStatuses(current.storyboardScenes, nextJobs, current.clips, activeBatchId),
          storyboardStatus: 'Scene queued for regeneration.',
        };
      });
      if (get().currentProject) void get().saveProject();
      void get().syncGenerationBatch(true);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Could not regenerate scene');
      set({ storyboardStatus: 'Scene regeneration failed.' });
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
        .filter(asset => asset.status === 'completed' && Boolean(asset.resultUrl))
        .filter(asset => getAssetVariantUrls(asset).length <= 1);

      if (silent) return;

      if (generatedAssets.length === 0) {
        set({ storyboardStatus: 'No new generated media to import.' });
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
            let sourceDuration = assetForImport.duration;
            const newAsset: MediaAsset = {
              id: assetId,
              file,
              type: 'visual',
              mediaKind,
              duration: sourceDuration,
              sourceUrl: assetForImport.resultUrl,
              localPath: assetForImport.localPath,
              thumbnailUrl,
            };

            if (mediaKind === 'video') {
              sourceDuration = await getMediaDuration(file, 'visual');
              newAsset.duration = sourceDuration;
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
            .filter(isCompletedGeneratedVisualClip)
            .map(clip => clip.generation?.jobId)
            .filter((jobId): jobId is string => Boolean(jobId))
        );
        const importedSceneIds = new Set(
          state.clips
            .filter(isCompletedGeneratedVisualClip)
            .map(getGenerationSceneKeyFromClip)
            .filter((sceneKey): sceneKey is string => Boolean(sceneKey))
        );
        const placeholderJobIds = new Set(
          state.clips
            .filter(clip => clip.generation && !isCompletedGeneratedVisualClip(clip))
            .map(clip => clip.generation!.jobId)
        );
        const placeholderSceneIds = new Set(
          state.clips
            .filter(clip => clip.generation && !isCompletedGeneratedVisualClip(clip))
            .map(getGenerationSceneKeyFromClip)
            .filter((sceneKey): sceneKey is string => Boolean(sceneKey))
        );
        const clipsToAdd = newClips.filter(clip => {
          if (!clip.generation) return true;
          const sceneKey = makeGenerationSceneKey(clip.generation.projectId, clip.generation.batchId, clip.generation.sceneId);
          if (isCompletedGeneratedVisualClip(clip)) {
            return !importedJobIds.has(clip.generation.jobId) && !importedSceneIds.has(sceneKey);
          }
          return !placeholderJobIds.has(clip.generation.jobId) && !placeholderSceneIds.has(sceneKey);
        });
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

        const completedSceneKeysToAdd = new Set(
          clipsToAdd
            .filter(isCompletedGeneratedVisualClip)
            .map(getGenerationSceneKeyFromClip)
            .filter((sceneKey): sceneKey is string => Boolean(sceneKey))
        );
        const clipsWithoutReplacedPlaceholders = completedSceneKeysToAdd.size > 0
          ? state.clips.filter(clip => {
              const sceneKey = getGenerationSceneKeyFromClip(clip);
              return !sceneKey || !completedSceneKeysToAdd.has(sceneKey) || isCompletedGeneratedVisualClip(clip);
            })
          : state.clips;
        const nextClips = compactGeneratedVisualClips(
          [...clipsWithoutReplacedPlaceholders, ...clipsToAdd],
          visualTrack.id,
          batchId,
          projectId,
        );
        const nextJobs = refreshedJobs?.jobs ?? state.generationJobs;
        return {
          ...withHistory(state),
          assets: [...state.assets, ...assetsToAdd],
          tracks,
          clips: nextClips,
          selectedClipId: clipsToAdd[0]?.id ?? state.selectedClipId,
          selectedClipIds: clipsToAdd[0]?.id ? [clipsToAdd[0].id] : state.selectedClipIds,
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
    const sourceSceneKey = makeGenerationSceneKey(sourceAsset.projectId, sourceAsset.batchId, sourceAsset.sceneId);

    set({ isSyncingGeneration: true, storyboardStatus: 'Importing selected result...' } as Partial<EditorState>);
    try {
      let assetForImport: GeneratedMediaAsset = {
        ...sourceAsset,
        resultUrl: selectedUrl,
        resultVariants: sourceAsset.resultVariants.filter(variant => variant.url === selectedUrl),
      };

      const selectedJob = await selectGenerationJobVariant(sourceAsset.jobId, selectedUrl);
      assetForImport = {
        ...assetForImport,
        status: selectedJob.status,
        mediaType: selectedJob.mediaType,
        resultUrl: selectedJob.resultUrl ?? selectedUrl,
        resultVariants: selectedJob.resultVariants,
        localPath: selectedJob.localPath,
        error: selectedJob.error,
        metadata: selectedJob.metadata,
      };

      if (assetForImport.resultUrl && isRemoteMediaUrl(assetForImport.resultUrl)) {
        const storedJob = await storeRemoteGenerationJob(sourceAsset.jobId, assetForImport.resultUrl);
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
      assetForImport = {
        ...assetForImport,
        resultUrl: assetForImport.resultUrl ?? selectedUrl,
        metadata: {
          ...(assetForImport.metadata ?? {}),
          selectedVariantUrl: selectedUrl,
        },
      };

      const file = await fetchGeneratedMediaFile(assetForImport);
      const mediaKind = assetForImport.mediaType === 'video' ? 'video' : 'image';
      const thumbnailUrl = await generateThumbnail(file, mediaKind);
      const assetId = `generated-${assetForImport.jobId}-${makeId()}`;
      let sourceDuration = assetForImport.duration;
      const newAsset: MediaAsset = {
        id: assetId,
        file,
        type: 'visual',
        mediaKind,
        duration: sourceDuration,
        sourceUrl: assetForImport.resultUrl,
        localPath: assetForImport.localPath,
        thumbnailUrl,
      };

      if (mediaKind === 'video') {
        sourceDuration = await getMediaDuration(file, 'visual');
        newAsset.duration = sourceDuration;
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
        const replacedClips = current.clips.filter(clip =>
          getGenerationSceneKeyFromClip(clip) === sourceSceneKey
        );
        const replacedAssetIds = new Set(replacedClips.map(clip => clip.assetId));
        const nextClips = compactGeneratedVisualClips([
          ...current.clips.filter(clip => getGenerationSceneKeyFromClip(clip) !== sourceSceneKey),
          newClip,
        ], visualTrack.id, assetForImport.batchId, assetForImport.projectId);
        return {
          ...withHistory(current),
          assets: [
            ...current.assets.filter(asset => !replacedAssetIds.has(asset.id)),
            newAsset,
          ],
          tracks,
          clips: nextClips,
          selectedClipId: newClip.id,
          selectedClipIds: [newClip.id],
          storyboardScenes: mergeSceneStatuses(
            current.storyboardScenes,
            current.generationJobs,
            nextClips,
            assetForImport.batchId,
          ),
          storyboardStatus: replacedClips.length
            ? 'Selected result replaced on the timeline.'
            : 'Selected result imported to the timeline.',
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
  },
  importCompletedVoiceMedia: async (jobs, autoPlaceOnTimeline = true) => {
    const completedJobs = uniqueGenerationJobsById(jobs)
      .filter(job => job.mediaType === 'audio' && job.status === 'completed' && Boolean(job.resultUrl))
      .sort((left, right) => {
        const leftIndex = Number(left.metadata.lineIndex ?? Number.MAX_SAFE_INTEGER);
        const rightIndex = Number(right.metadata.lineIndex ?? Number.MAX_SAFE_INTEGER);
        return leftIndex - rightIndex || left.id.localeCompare(right.id);
      });
    if (completedJobs.length === 0) return;

    const preparedAssets: MediaAsset[] = [];
    const preparedClips: TimelineClip[] = [];
    let tracks = [...get().tracks];
    let audioTrack = tracks.find(track => track.type === 'audio');
    if (!audioTrack && autoPlaceOnTimeline) {
      audioTrack = makeTrack(tracks, 'audio');
      tracks = [...tracks, audioTrack];
    }
    const existingAssetIds = new Set(get().assets.map(asset => asset.id));
    const existingVoiceJobIds = new Set(
      get().clips
        .map(clip => clip.generation?.jobId)
        .filter((jobId): jobId is string => Boolean(jobId))
    );
    let nextStart = audioTrack
      ? get().clips
          .filter(clip => clip.trackId === audioTrack!.id)
          .reduce((latest, clip) => Math.max(latest, clip.startTime + clip.duration), 0)
      : 0;

    for (const job of completedJobs) {
      const assetId = `generated-${job.id}`;
      if (existingAssetIds.has(assetId)) continue;
      let assetForImport = generatedMediaAssetFromJob(job);
      if (assetForImport.resultUrl && isRemoteMediaUrl(assetForImport.resultUrl) && !assetForImport.localPath) {
        try {
          const storedJob = await storeRemoteGenerationJob(job.id);
          assetForImport = generatedMediaAssetFromJob(storedJob);
        } catch (error) {
          console.warn('Backend could not store remote generated audio, trying browser fetch.', error);
        }
      }
      if (!assetForImport.resultUrl) continue;
      const file = await fetchGeneratedMediaFile(assetForImport);
      const duration = await getMediaDuration(file, 'audio').catch(() => assetForImport.duration);
      const asset: MediaAsset = {
        id: assetId,
        file,
        type: 'audio',
        mediaKind: 'audio',
        duration,
        sourceUrl: assetForImport.resultUrl,
        localPath: assetForImport.localPath,
      };
      preparedAssets.push(asset);

      generateWaveform(file, 1000).then(waveform => {
        set(state => ({
          assets: state.assets.map(existing => existing.id === asset.id ? { ...existing, waveform } : existing),
        }));
      });

      if (autoPlaceOnTimeline && audioTrack && !existingVoiceJobIds.has(job.id)) {
        preparedClips.push({
          id: makeId(),
          assetId,
          trackId: audioTrack.id,
          file,
          type: 'audio',
          duration: Math.max(0.1, duration || assetForImport.duration),
          startTime: nextStart,
          mediaOffset: 0,
          transform: { scale: 100, rotation: 0, opacity: 100, flipX: false, flipY: false },
          color: { brightness: 100, contrast: 100, saturation: 100, exposure: 0, temperature: 0 },
          audio: { volume: 100, mute: false, fadeIn: 0, fadeOut: 0 },
          generation: generatedMetadata(assetForImport),
        });
        nextStart += Math.max(0.1, duration || assetForImport.duration);
      }
    }

    if (preparedAssets.length === 0 && preparedClips.length === 0) return;
    set(state => ({
      ...withHistory(state),
      assets: [...state.assets, ...preparedAssets],
      tracks,
      clips: [...state.clips, ...preparedClips],
      selectedClipId: preparedClips[0]?.id ?? state.selectedClipId,
      selectedClipIds: preparedClips[0]?.id ? [preparedClips[0].id] : state.selectedClipIds,
    }));
    if (get().currentProject) void get().saveProject();
  },

  applyTimelineDraft: async (draft, voiceJobs = []) => {
    const draftVoiceJobIds = new Set(
      draft.audioClips
        .map(clip => clip.sourceJobId)
        .filter((jobId): jobId is string => Boolean(jobId))
    );
    const completedVoiceJobs = voiceJobs.filter(job =>
      draftVoiceJobIds.has(job.id)
      && job.mediaType === 'audio'
      && job.status === 'completed'
    );
    await get().importCompletedVoiceMedia(completedVoiceJobs, false);
    await get().importCompletedGenerationMedia();

    const state = get();
    let tracks = [...state.tracks];
    let audioTrack = tracks.find(track => track.type === 'audio');
    if (!audioTrack && draft.audioClips.some(clip => Boolean(clip.audioAssetId))) {
      audioTrack = makeTrack(tracks, 'audio');
      tracks = [...tracks, audioTrack];
    }
    let textTrack = tracks.find(track => track.type === 'text');
    if (!textTrack && draft.captionClips.length > 0) {
      textTrack = makeTrack(tracks, 'text');
      tracks = [...tracks, textTrack];
    }

    const audioDraftByJobId = new Map(
      draft.audioClips
        .filter(clip => clip.sourceJobId)
        .map(clip => [clip.sourceJobId as string, clip])
    );
    const visualDraftBySceneId = new Map(draft.visualClips.map(clip => [clip.sceneId, clip]));
    const jobById = new Map(voiceJobs.map(job => [job.id, job]));
    const existingAudioJobIds = new Set<string>();
    const captionAssetPrefix = `timeline-caption-${draft.scriptId}-`;

    const repositionedClips = state.clips
      .filter(clip => !clip.assetId.startsWith(captionAssetPrefix))
      .map(clip => {
        if (clip.type === 'audio' && clip.generation?.jobId) {
          const planned = audioDraftByJobId.get(clip.generation.jobId);
          if (planned && audioTrack) {
            existingAudioJobIds.add(clip.generation.jobId);
            return {
              ...clip,
              trackId: audioTrack.id,
              startTime: planned.start,
              duration: planned.duration,
            };
          }
        }
        if (clip.type === 'visual' && clip.generation?.sceneId) {
          const planned = visualDraftBySceneId.get(clip.generation.sceneId);
          if (planned) {
            return {
              ...clip,
              startTime: planned.start,
              duration: planned.duration,
            };
          }
        }
        return clip;
      });

    const newAudioClips = audioTrack
      ? draft.audioClips.flatMap(clip => {
          const job = clip.sourceJobId ? jobById.get(clip.sourceJobId) : null;
          const asset = clip.audioAssetId
            ? state.assets.find(candidate => candidate.id === clip.audioAssetId)
            : null;
          if (!job || !asset || existingAudioJobIds.has(job.id)) return [];
          return [{
            id: makeId(),
            assetId: asset.id,
            trackId: audioTrack!.id,
            file: asset.file,
            type: 'audio' as const,
            duration: Math.max(0.1, clip.duration),
            startTime: clip.start,
            mediaOffset: 0,
            transform: { scale: 100, rotation: 0, opacity: 100, flipX: false, flipY: false },
            color: { brightness: 100, contrast: 100, saturation: 100, exposure: 0, temperature: 0 },
            audio: { volume: 100, mute: false, fadeIn: 0, fadeOut: 0 },
            generation: generatedMetadata(generatedMediaAssetFromJob(job)),
          }];
        })
      : [];

    const captions = draft.captionClips.map((clip, index) => ({
      id: clip.id,
      index: index + 1,
      start: clip.start,
      end: clip.end,
      text: clip.text,
    }));
    const captionClips = textTrack
      ? draft.captionClips.map(clip => ({
          id: makeId(),
          assetId: `${captionAssetPrefix}${clip.sourceLineId}`,
          trackId: textTrack!.id,
          file: new File([], 'timeline-caption.txt', { type: 'text/plain' }),
          type: 'text' as const,
          duration: Math.max(0.1, clip.duration),
          startTime: clip.start,
          mediaOffset: 0,
          audio: { volume: 0, mute: true, fadeIn: 0, fadeOut: 0 },
          transform: { scale: 100, rotation: 0, opacity: 100, flipX: false, flipY: false },
          textData: {
            ...DEFAULT_TEXT_DATA,
            content: clip.text,
            fontSize: 42,
            bgOpacity: 0.45,
          },
        }))
      : [];
    const srtContent = captionsToSrt(captions);
    const vttContent = captionsToVtt(captions);

    set({
      ...withHistory(state),
      tracks,
      clips: [...repositionedClips, ...newAudioClips, ...captionClips],
      selectedClipId: newAudioClips[0]?.id ?? captionClips[0]?.id ?? state.selectedClipId,
      selectedClipIds: newAudioClips[0]?.id
        ? [newAudioClips[0].id]
        : captionClips[0]?.id
          ? [captionClips[0].id]
          : state.selectedClipIds,
      captions,
      srtContent,
      srtDownloadUrl: makeTextDownloadUrl(srtContent, 'text/plain'),
      vttDownloadUrl: makeTextDownloadUrl(vttContent, 'text/vtt'),
      storyboardStatus: `Applied timeline draft with ${newAudioClips.length} new audio clip${newAudioClips.length === 1 ? '' : 's'} and ${captionClips.length} caption clip${captionClips.length === 1 ? '' : 's'}.`,
    });
    scheduleProjectAutosave(get, 100);
  },

  setAnimationSettings: (settings) => {
    set(state => ({
      animationSettings: { ...state.animationSettings, ...settings },
    }));
    scheduleProjectAutosave(get);
  },

  generateAnimationPlan: async () => {
    const state = get();
    const settings = state.animationSettings;
    const source = getConfiguredAnimationSource(state);
    const timedSegments = getAnimationTimedSegments(state.captions);
    const transcript = timedSegments.map(segment => segment.text).join(' ').trim();

    if (!transcript && !source) {
      alert('Generate a transcript or select an audio/video clip before planning animation.');
      return;
    }

    set({
      isGeneratingAnimationPlan: true,
      animationStatus: transcript ? 'Planning animation from captions...' : `Transcribing and planning ${source?.file.name}...`,
    } as Partial<EditorState>);

    try {
      const availableAssets = buildAnimationAvailableAssets(state);
      const options = {
        provider: settings.provider,
        aspectRatio: settings.aspectRatio,
        sceneDensity: settings.sceneDensity,
        motionIntensity: settings.motionIntensity,
        promptDetail: settings.promptDetail,
        style: settings.style,
        layoutTemplate: settings.layoutTemplate,
        captionTemplate: settings.captionTemplate,
        availableAssets,
      };
      const plan = transcript
        ? await createAnimationPlanFromTranscript(transcript, timedSegments, options)
        : await createAnimationPlanFromAudio(source!.file, options);

      set({
        animationPlan: plan,
        animationAssetLibrary: availableAssets.filter(asset => state.animationAssetLibrary.some(item => item.id === asset.id)),
        animationAssetJobs: [],
        currentAnimationBatchId: null,
        animationSettings: {
          ...settings,
          sourceMediaId: source?.id ?? settings.sourceMediaId,
        },
        animationStatus: `Animation plan ready: ${plan.scenes.length} scenes, ${plan.assetNeeds.length} reusable assets (${plan.usedLlmMode}).`,
      });
      scheduleProjectAutosave(get, 200);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Animation planning failed');
      set({ animationStatus: 'Animation planning failed.' });
    } finally {
      set({ isGeneratingAnimationPlan: false } as Partial<EditorState>);
    }
  },

  updateAnimationScene: (id, updates) => {
    set(state => {
      if (!state.animationPlan) return state;
      return {
        animationPlan: {
          ...state.animationPlan,
          scenes: state.animationPlan.scenes.map(scene => {
            if (scene.id !== id) return scene;
            const next = { ...scene, ...updates };
            next.start = Math.max(0, Number(next.start) || 0);
            next.end = Math.max(next.start + 0.1, Number(next.end) || next.start + 0.1);
            return next;
          }),
        },
        animationStatus: 'Animation scene edited.',
      };
    });
    scheduleProjectAutosave(get);
  },

  updateAnimationAssetNeed: (id, updates) => {
    set(state => {
      if (!state.animationPlan) return state;
      return {
        animationPlan: {
          ...state.animationPlan,
          assetNeeds: state.animationPlan.assetNeeds.map(need =>
            need.id === id ? { ...need, ...updates } : need
          ),
        },
        animationStatus: 'Animation asset edited.',
      };
    });
    scheduleProjectAutosave(get);
  },

  assignAnimationAssetNeed: (needId, memoryAssetId) => {
    set(state => {
      if (!state.animationPlan) return state;
      const availableAssets = buildAnimationAvailableAssets(state);
      const assigned = memoryAssetId ? availableAssets.find(asset => asset.id === memoryAssetId) : null;
      const nextLibrary = assigned && !state.animationAssetLibrary.some(asset => asset.id === assigned.id)
        ? [...state.animationAssetLibrary, assigned]
        : state.animationAssetLibrary;
      return {
        animationAssetLibrary: nextLibrary,
        animationPlan: {
          ...state.animationPlan,
          assetNeeds: state.animationPlan.assetNeeds.map(need => {
            if (need.id !== needId) return need;
            if (!assigned) {
              return {
                ...need,
                reuseDecision: need.optional ? 'optional' : 'generate',
                status: 'missing',
                matchedAssetId: null,
              };
            }
            return {
              ...need,
              reuseDecision: 'reuse',
              status: assigned.status === 'generated' ? 'generated' : 'available',
              matchedAssetId: assigned.id,
            };
          }),
        },
        animationStatus: assigned ? `Assigned ${assigned.name}.` : 'Asset assignment cleared.',
      };
    });
    scheduleProjectAutosave(get, 200);
  },

  approveAnimationPlan: () => {
    set(state => {
      if (!state.animationPlan) return state;
      return {
        animationPlan: {
          ...state.animationPlan,
          scenes: state.animationPlan.scenes.map(scene => ({ ...scene, status: 'approved' })),
        },
        animationStatus: 'Animation plan approved.',
      };
    });
    scheduleProjectAutosave(get, 200);
  },

  createAnimationMissingAssetJobs: async () => {
    if (!get().currentProject) {
      alert('Create or load a project before generating animation assets.');
      return;
    }
    if (!get().animationPlan) {
      alert('Create an animation plan first.');
      return;
    }

    if (!get().isSyncingAnimationAssets) {
      await get().syncAnimationAssetJobs(true);
    }

    const state = get();
    const currentProject = state.currentProject;
    if (!currentProject) {
      alert('Create or load a project before generating animation assets.');
      return;
    }
    const existingJobsByNeedId = new Map(
      state.animationAssetJobs
        .filter(isAutoAnimateJob)
        .map(job => [getAnimationNeedIdFromJob(job), job] as const)
    );
    const candidateNeeds = state.animationPlan!.assetNeeds.filter(need =>
      need.reuseDecision === 'generate' &&
      (
        ['missing', 'failed'].includes(need.status) ||
        (need.status === 'queued' && !existingJobsByNeedId.has(need.id))
      )
    );
    const retryableJobs = candidateNeeds
      .map(need => existingJobsByNeedId.get(need.id))
      .filter((job): job is GenerationJob => Boolean(job && ['failed', 'canceled', 'manual_action_required'].includes(job.status)));
    const missingNeeds = candidateNeeds.filter(need => !existingJobsByNeedId.has(need.id));

    if (missingNeeds.length === 0 && retryableJobs.length === 0) {
      const activeCount = candidateNeeds.filter(need => {
        const job = existingJobsByNeedId.get(need.id);
        return job && ['queued', 'running'].includes(job.status);
      }).length;
      set({
        animationStatus: activeCount > 0
          ? `${activeCount} animation asset job${activeCount === 1 ? ' is' : 's are'} already queued or running.`
          : 'No missing animation assets need generation.',
      });
      return;
    }

    set({ animationStatus: 'Saving project and queuing missing animation assets...' });
    try {
      const persisted = await persistProjectAssets(currentProject.id, state.assets);
      if (persisted.changed) set({ assets: persisted.assets });
      const project = await persistProjectSnapshot({ ...get(), assets: persisted.assets });
      set({
        currentProject: project,
        projectName: project.name,
        projectStatus: `Project folder ready: ${project.generatedMediaPath}`,
      });
      const retriedJobs: GenerationJob[] = [];
      for (const job of retryableJobs) {
        retriedJobs.push(await retryAnimationAssetJobRequest(job.id));
      }
      const response = missingNeeds.length > 0
        ? await createAnimationAssetJobs(
            missingNeeds,
            state.animationSettings.provider,
            state.animationSettings.aspectRatio,
            project.id,
            project.name,
            state.currentAnimationBatchId,
          )
        : { jobs: [] as GenerationJob[], batchId: null };
      const queuedJobs = uniqueGenerationJobsById([...retriedJobs, ...response.jobs]);
      const batchId = response.batchId ?? queuedJobs[0]?.batchId ?? state.currentAnimationBatchId ?? null;
      set(current => ({
        currentAnimationBatchId: batchId,
        animationAssetJobs: uniqueGenerationJobsById([...current.animationAssetJobs, ...queuedJobs]),
        animationPlan: mergeAnimationJobsIntoPlan(
          current.animationPlan,
          uniqueGenerationJobsById([...current.animationAssetJobs, ...queuedJobs]),
          current.animationAssetLibrary
        ),
        animationStatus: `Queued ${queuedJobs.length} reusable animation asset${queuedJobs.length === 1 ? '' : 's'}.`,
      }));
      void get().saveProject();
      void get().syncAnimationAssetJobs(true);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Animation asset job creation failed');
      set({ animationStatus: 'Animation asset job creation failed.' });
    }
  },

  syncAnimationAssetJobs: async (silent = false) => {
    const batchId = get().currentAnimationBatchId;
    const projectId = get().currentProject?.id ?? null;
    if (!batchId && !projectId) {
      if (!silent) set({ animationStatus: 'Open a project or queue animation assets first.' });
      return;
    }
    if (get().isSyncingAnimationAssets) return;

    set({
      isSyncingAnimationAssets: true,
      ...(silent ? {} : { animationStatus: 'Checking animation assets...' }),
    } as Partial<EditorState>);

    try {
      const [batchJobsResponse, projectJobsResponse] = await Promise.all([
        batchId ? listGenerationJobs({ batchId, projectId }) : Promise.resolve({ jobs: [] as GenerationJob[], batchId: null }),
        projectId ? listGenerationJobs({ projectId }) : Promise.resolve({ jobs: [] as GenerationJob[], batchId: null }),
      ]);
      let animationJobs = uniqueGenerationJobsById([
        ...batchJobsResponse.jobs,
        ...projectJobsResponse.jobs,
      ]).filter(isAutoAnimateJob);
      const [batchMediaResponse, projectMediaResponse] = await Promise.all([
        batchId ? listGeneratedMediaAssets(true, { batchId, projectId }) : Promise.resolve({ assets: [] as GeneratedMediaAsset[] }),
        projectId ? listGeneratedMediaAssets(true, { projectId }) : Promise.resolve({ assets: [] as GeneratedMediaAsset[] }),
      ]);
      const mediaAssets = uniqueGeneratedAssetsByJobId([
        ...batchMediaResponse.assets,
        ...projectMediaResponse.assets,
      ]);
      const completedAssets: GeneratedMediaAsset[] = [];
      for (const asset of mediaAssets) {
        if (
          asset.status !== 'completed' ||
          !asset.resultUrl ||
          !animationJobs.some(job => job.id === asset.jobId)
        ) {
          continue;
        }

        const variantUrls = getAssetVariantUrls(asset);
        if (variantUrls.length > 1 && !asset.metadata.selectedVariantUrl) {
          const selectedUrl = asset.resultUrl ?? variantUrls[0];
          const selectedJob = await selectGenerationJobVariant(asset.jobId, selectedUrl).catch(error => {
            console.warn('Could not select default animation variant.', asset.jobId, error);
            return null;
          });

          if (selectedJob?.resultUrl) {
            animationJobs = uniqueGenerationJobsById(
              animationJobs.map(job => job.id === selectedJob.id ? selectedJob : job)
            );
            completedAssets.push(generatedMediaAssetFromJob(selectedJob));
            continue;
          }

          completedAssets.push({
            ...asset,
            metadata: {
              ...(asset.metadata ?? {}),
              selectedVariantUrl: selectedUrl,
            },
          });
          continue;
        }

        completedAssets.push(asset);
      }

      const newMediaAssets: MediaAsset[] = [];
      const newMemoryItems: AnimationAssetMemoryItem[] = [];

      for (const generated of completedAssets) {
        const job = animationJobs.find(item => item.id === generated.jobId);
        const memoryId = `animation:${generated.jobId}`;
        let assetForImport = generated;
        try {
          if (generated.resultUrl && isRemoteMediaUrl(generated.resultUrl) && !generated.localPath) {
            const storedJob = await storeRemoteGenerationJob(generated.jobId).catch(() => null);
            if (storedJob?.resultUrl) {
              assetForImport = {
                ...generated,
                status: storedJob.status,
                mediaType: storedJob.mediaType,
                resultUrl: storedJob.resultUrl,
                resultVariants: storedJob.resultVariants,
                localPath: storedJob.localPath,
                error: storedJob.error,
                metadata: storedJob.metadata,
              };
            }
          }
          const file = await fetchGeneratedMediaFile(assetForImport);
          const mediaKind = assetForImport.mediaType === 'video' ? 'video' : 'image';
          const thumbnailUrl = await generateThumbnail(file, mediaKind);
          const mediaAssetId = `animation-generated-${generated.jobId}`;
          newMediaAssets.push({
            id: mediaAssetId,
            file,
            type: 'visual',
            mediaKind,
            duration: assetForImport.duration || 10,
            sourceUrl: assetForImport.resultUrl,
            localPath: assetForImport.localPath,
            thumbnailUrl,
          });
          newMemoryItems.push({
            id: memoryId,
            name: job?.metadata.animationAssetName || generated.sceneId,
            assetType: (job?.metadata.animationAssetType as AnimationAssetType) || 'prop',
            mediaAssetId,
            sourceUrl: assetForImport.resultUrl,
            localPath: assetForImport.localPath,
            prompt: generated.prompt,
            style: generated.metadata.sceneStyle || get().animationSettings.style,
            tags: (job?.metadata.animationAssetTags || '').split(',').map(tag => tag.trim()).filter(Boolean),
            status: 'generated',
            metadata: {
              source: 'auto_animate',
              animationAssetId: job?.metadata.animationAssetId || generated.sceneId,
              jobId: generated.jobId,
              batchId: generated.batchId,
            },
          });
        } catch (error) {
          console.warn('Could not import generated animation asset.', generated.jobId, error);
        }
      }

      set(state => {
        const replacingMemoryIds = new Set(newMemoryItems.map(item => item.id));
        const replacingMediaIds = new Set(newMediaAssets.map(asset => asset.id));
        const mediaById = new Map(newMediaAssets.map(asset => [asset.id, asset] as const));
        const nextLibrary = [
          ...state.animationAssetLibrary.filter(item => !replacingMemoryIds.has(item.id)),
          ...newMemoryItems,
        ];
        const nextAssets = [
          ...state.assets.filter(asset => !replacingMediaIds.has(asset.id)),
          ...newMediaAssets,
        ];
        const nextClips = state.clips.map(clip => {
          const replacementAsset = mediaById.get(clip.assetId);
          if (!replacementAsset) return clip;
          return {
            ...clip,
            file: replacementAsset.file,
            type: 'visual' as const,
            transform: clip.transform ?? { scale: 100, rotation: 0, opacity: 100, flipX: false, flipY: false },
          };
        });
        const nextJobs = animationJobs.length ? animationJobs : state.animationAssetJobs;
        const latestBatchJob = nextJobs[nextJobs.length - 1];
        return {
          assets: nextAssets,
          clips: nextClips,
          animationAssetLibrary: nextLibrary,
          animationAssetJobs: nextJobs,
          currentAnimationBatchId: state.currentAnimationBatchId ?? latestBatchJob?.batchId ?? batchId ?? null,
          animationPlan: mergeAnimationJobsIntoPlan(state.animationPlan, nextJobs, nextLibrary),
          animationStatus: silent
            ? state.animationStatus
            : newMemoryItems.length
              ? `Imported ${newMemoryItems.length} generated animation asset${newMemoryItems.length === 1 ? '' : 's'}.`
              : 'No new generated animation assets yet.',
        };
      });
      if (get().currentProject) scheduleProjectAutosave(get, newMemoryItems.length > 0 ? 100 : 600);
    } catch (err) {
      console.error(err);
      if (!silent) alert(err instanceof Error ? err.message : 'Animation asset sync failed');
      set({ animationStatus: silent ? 'Animation asset auto-sync paused after an error.' : 'Animation asset sync failed.' });
    } finally {
      set({ isSyncingAnimationAssets: false });
    }
  },

  retryAnimationAssetJob: async (jobId) => {
    set({ animationStatus: 'Retrying animation asset...' });
    try {
      const retriedJob = await retryAnimationAssetJobRequest(jobId);
      set(state => {
        const hasJob = state.animationAssetJobs.some(job => job.id === jobId);
        const nextJobs = hasJob
          ? state.animationAssetJobs.map(job => job.id === jobId ? retriedJob : job)
          : [...state.animationAssetJobs, retriedJob];
        return {
          animationAssetJobs: nextJobs,
          animationPlan: mergeAnimationJobsIntoPlan(state.animationPlan, nextJobs, state.animationAssetLibrary),
          animationStatus: 'Animation asset queued for retry.',
        };
      });
      if (get().currentProject) void get().saveProject();
      void get().syncAnimationAssetJobs(true);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Could not retry animation asset job');
      set({ animationStatus: 'Animation asset retry failed.' });
    }
  },

  autoRetryAnimationAssetJob: async (jobId, maxAttempts = 50) => {
    set({ animationStatus: 'Rewriting prompt and regenerating animation asset...' });
    try {
      const retriedJob = await autoRetryAnimationAssetJobRequest(jobId, maxAttempts);
      set(state => {
        const hasJob = state.animationAssetJobs.some(job => job.id === jobId);
        const nextJobs = hasJob
          ? state.animationAssetJobs.map(job => job.id === jobId ? retriedJob : job)
          : [...state.animationAssetJobs, retriedJob];
        return {
          animationAssetJobs: nextJobs,
          animationPlan: mergeAnimationJobsIntoPlan(state.animationPlan, nextJobs, state.animationAssetLibrary),
          animationStatus: 'Animation asset queued with rewritten prompt.',
        };
      });
      if (get().currentProject) void get().saveProject();
      void get().syncAnimationAssetJobs(true);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Could not rewrite and regenerate animation asset');
      set({ animationStatus: 'Animation asset rewrite/regenerate failed.' });
    }
  },

  selectAnimationAssetVariant: async (jobId, variantUrl) => {
    const sourceJob = get().animationAssetJobs.find(job => job.id === jobId);
    if (!sourceJob) {
      alert('Sync animation assets before choosing a result.');
      return;
    }
    const selectedUrl = variantUrl || sourceJob.resultUrl || sourceJob.resultVariants[0]?.url;
    if (!selectedUrl) {
      alert('This animation asset does not have a media result yet.');
      return;
    }

    set({ isSyncingAnimationAssets: true, animationStatus: 'Importing selected animation asset result...' } as Partial<EditorState>);
    try {
      let selectedJob = await selectGenerationJobVariant(jobId, selectedUrl);
      if (selectedJob.resultUrl && isRemoteMediaUrl(selectedJob.resultUrl)) {
        selectedJob = await storeRemoteGenerationJob(jobId, selectedJob.resultUrl);
      }
      const selectedStoredUrl = selectedJob.resultUrl ?? selectedUrl;
      selectedJob = {
        ...selectedJob,
        metadata: {
          ...(selectedJob.metadata ?? {}),
          selectedVariantUrl: selectedStoredUrl,
        },
      };

      const assetForImport = generatedMediaAssetFromJob({
        ...selectedJob,
        resultUrl: selectedStoredUrl,
      });
      const file = await fetchGeneratedMediaFile(assetForImport);
      const mediaKind = assetForImport.mediaType === 'video' ? 'video' : 'image';
      const thumbnailUrl = await generateThumbnail(file, mediaKind);
      const mediaAssetId = `animation-generated-${jobId}`;
      const needId = selectedJob.metadata.animationAssetId || selectedJob.sceneId;
      const memoryId = `animation:${jobId}`;
      let sourceDuration = assetForImport.duration || 5;
      const nextMediaAsset: MediaAsset = {
        id: mediaAssetId,
        file,
        type: 'visual',
        mediaKind,
        duration: sourceDuration,
        sourceUrl: assetForImport.resultUrl,
        localPath: assetForImport.localPath,
        thumbnailUrl,
      };
      if (mediaKind === 'video') {
        sourceDuration = await getMediaDuration(file, 'visual');
        nextMediaAsset.duration = sourceDuration;
        const framesCount = Math.min(50, Math.max(5, Math.ceil(sourceDuration / 2)));
        nextMediaAsset.filmstrip = await generateFilmstrip(file, sourceDuration, framesCount);
      }

      const nextMemory: AnimationAssetMemoryItem = {
        id: memoryId,
        name: selectedJob.metadata.animationAssetName || selectedJob.sceneId,
        assetType: (selectedJob.metadata.animationAssetType as AnimationAssetType) || 'prop',
        mediaAssetId,
        sourceUrl: assetForImport.resultUrl,
        localPath: assetForImport.localPath,
        prompt: assetForImport.prompt,
        style: assetForImport.metadata.sceneStyle || get().animationSettings.style,
        tags: (selectedJob.metadata.animationAssetTags || '').split(',').map(tag => tag.trim()).filter(Boolean),
        status: 'generated',
        metadata: {
          source: 'auto_animate',
          animationAssetId: needId,
          jobId,
          batchId: selectedJob.batchId,
          selectedVariantUrl: selectedStoredUrl,
        },
      };

      set(state => {
        const hasJob = state.animationAssetJobs.some(job => job.id === jobId);
        const nextJobs = hasJob
          ? state.animationAssetJobs.map(job => job.id === jobId ? selectedJob : job)
          : [...state.animationAssetJobs, selectedJob];
        const nextLibrary = [
          ...state.animationAssetLibrary.filter(item => item.id !== memoryId),
          nextMemory,
        ];
        const nextAssets = [
          ...state.assets.filter(asset => asset.id !== mediaAssetId),
          nextMediaAsset,
        ];
        const nextClips = state.clips.map(clip => (
          clip.assetId === mediaAssetId
            ? {
                ...clip,
                file,
                type: 'visual' as const,
                transform: clip.transform ?? { scale: 100, rotation: 0, opacity: 100, flipX: false, flipY: false },
              }
            : clip
        ));
        return {
          ...withHistory(state),
          assets: nextAssets,
          clips: nextClips,
          animationAssetLibrary: nextLibrary,
          animationAssetJobs: nextJobs,
          animationPlan: mergeAnimationJobsIntoPlan(state.animationPlan, nextJobs, nextLibrary),
          animationStatus: 'Selected animation result imported.',
        };
      });
      if (get().currentProject) void get().saveProject();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Could not import selected animation result');
      set({ animationStatus: 'Selected animation result import failed.' });
    } finally {
      set({ isSyncingAnimationAssets: false });
    }
  },

  buildAnimatedTimeline: () => {
    const state = get();
    const plan = state.animationPlan;
    if (!plan) {
      alert('Create an animation plan first.');
      return;
    }
    const approvedScenes = plan.scenes.filter(scene => scene.status === 'approved');
    if (approvedScenes.length === 0) {
      alert('Approve the animation plan before building the timeline.');
      return;
    }

    const availableAssets = buildAnimationAvailableAssets(state);
    const memoryById = new Map(availableAssets.map(asset => [asset.id, asset]));
    const needsById = new Map(plan.assetNeeds.map(need => [need.id, need]));
    let tracks = [...state.tracks];
    const visualTracksByOrder = new Map<number, TimelineTrack>();

    const ensureVisualTrack = (order: number): TimelineTrack => {
      const bucket = Math.max(0, Math.floor(order / 10));
      const existing = visualTracksByOrder.get(bucket);
      if (existing) return existing;
      const track = makeTrack(tracks, 'visual');
      track.name = `AV${bucket + 1}`;
      tracks = [...tracks, track];
      visualTracksByOrder.set(bucket, track);
      return track;
    };

    let textTrack = tracks.find(track => track.type === 'text');
    const ensureTextTrack = (): TimelineTrack => {
      if (!textTrack) {
        textTrack = makeTrack(tracks, 'text');
        tracks = [...tracks, textTrack];
      }
      return textTrack;
    };

    const newClips: TimelineClip[] = [];
    const advancedMotion = new Set<string>();

    for (const scene of approvedScenes) {
      const layers = [...scene.layers].sort((a, b) => a.order - b.order);
      for (const layer of layers) {
        const duration = Math.max(0.1, layer.end - layer.start);
        const need = layer.assetNeedId ? needsById.get(layer.assetNeedId) : null;
        const assignedMemory = need?.matchedAssetId ? memoryById.get(need.matchedAssetId) : null;
        const mediaAsset = assignedMemory?.mediaAssetId
          ? state.assets.find(asset => asset.id === assignedMemory.mediaAssetId)
          : null;
        const visualLayer = ['background', 'character', 'prop', 'icon', 'overlay'].includes(layer.layerType);

        if (visualLayer && mediaAsset) {
          newClips.push({
            id: makeId(),
            assetId: mediaAsset.id,
            trackId: ensureVisualTrack(layer.order).id,
            file: mediaAsset.file,
            type: 'visual',
            duration,
            startTime: layer.start,
            mediaOffset: 0,
            transform: { scale: layer.scale, rotation: 0, opacity: layer.opacity, flipX: false, flipY: false },
            color: { brightness: 100, contrast: 100, saturation: 100, exposure: 0, temperature: 0 },
            audio: { volume: 0, mute: true, fadeIn: 0, fadeOut: 0 },
            keyframes: keyframesForAnimationMotion(layer, duration),
            animation: {
              planId: plan.id,
              sceneId: scene.id,
              layerId: layer.id,
              assetNeedId: need?.id ?? null,
              assetType: need?.assetType ?? null,
              source: 'auto_animate',
              motionPreset: layer.motion.preset,
              layoutTemplate: scene.cue?.layout.template,
              captionTemplate: scene.cue?.caption.template,
              characterPose: scene.cue?.character.pose,
              expression: scene.cue?.character.expression,
              x: layer.x,
              y: layer.y,
              order: layer.order,
              note: layer.motion.note,
            },
          });
          if (['slide', 'pan', 'float', 'parallax', 'talking_bob', 'hand_wave', 'point', 'walk_cycle'].includes(layer.motion.preset)) {
            advancedMotion.add(layer.motion.preset);
          }
          continue;
        }

        if (visualLayer && need?.optional) {
          continue;
        }

        const placeholderText = visualLayer
          ? `${need?.name || layer.layerType}\n${need?.status === 'missing' ? 'Missing reusable asset' : 'Assign or generate this asset'}`
          : kineticCaptionContent(scene, layer.text || scene.summary || scene.transcript);
        const textData = textDataForAnimationLayer(scene, layer, placeholderText, visualLayer);
        const placeholderFile = new File([], `${layer.id}.txt`, { type: 'text/plain' });
        newClips.push({
          id: makeId(),
          assetId: `animation-text-${makeId()}`,
          trackId: ensureTextTrack().id,
          file: placeholderFile,
          type: 'text',
          duration,
          startTime: layer.start,
          mediaOffset: 0,
          audio: { volume: 0, mute: true, fadeIn: 0, fadeOut: 0 },
          transform: { scale: layer.scale, rotation: 0, opacity: layer.opacity, flipX: false, flipY: false },
          textData,
          keyframes: keyframesForAnimationMotion(layer, duration),
          animation: {
            planId: plan.id,
            sceneId: scene.id,
            layerId: layer.id,
            assetNeedId: need?.id ?? null,
            assetType: need?.assetType ?? null,
            source: 'auto_animate',
            motionPreset: layer.motion.preset,
            layoutTemplate: scene.cue?.layout.template,
            captionTemplate: scene.cue?.caption.template,
            characterPose: scene.cue?.character.pose,
            expression: scene.cue?.character.expression,
            x: layer.x,
            y: layer.y,
            order: layer.order,
            note: visualLayer ? 'Placeholder for missing visual animation asset.' : layer.motion.note,
          },
        });
      }
    }

    const warning = advancedMotion.size
      ? ` Motion brain added ${[...advancedMotion].join(', ')} keyframes; preview shows x/y/rotation movement while export keeps the existing renderer path.`
      : '';
    set({
      ...withHistory(state),
      tracks,
      clips: [...state.clips, ...newClips],
      selectedClipId: newClips[0]?.id ?? state.selectedClipId,
      selectedClipIds: newClips[0]?.id ? [newClips[0].id] : state.selectedClipIds,
      animationStatus: `Built ${newClips.length} editable animation clips.${warning}`,
    });
    scheduleProjectAutosave(get, 100);
  },
}));
