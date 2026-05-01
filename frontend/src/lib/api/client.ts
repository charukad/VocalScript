import type {
  TimelineClip,
  TimelineTrack,
  ExportSettings,
  CaptionSegment,
  AnimationAssetMemoryItem,
  AnimationAssetNeed,
  AnimationCaptionTemplate,
  AnimationLayoutTemplate,
  AnimationPlan,
  GenerationAspectRatio,
  GeneratedMediaType,
  GeneratedMediaAsset,
  StoryboardMotionIntensity,
  StoryboardPromptDetail,
  StoryboardSceneDensity,
  ProviderName,
  GenerationJob,
  GenerationJobStatus,
  BridgeDebugEvent,
  BridgeWorkerSnapshot,
  ProjectDetail,
  ProjectSummary,
  StoryboardScene,
  TranscriptSlice,
} from '../../types';

const API_BASE_URL = 'http://localhost:8000';

export type ExportResponse = {
  srtContent: string;
  mediaUrl: string;
};

export type TranscriptionResponse = {
  segments: CaptionSegment[];
  srtContent: string;
  vttContent: string;
  language: string;
  duration: number;
  sourceName: string;
};

export type StoryboardResponse = {
  scenes: StoryboardScene[];
  provider: ProviderName;
  usedLlmMode: string;
  transcript: string;
  segments: TranscriptSlice[];
  duration: number;
};

export type StoryboardGenerationOptions = {
  provider: ProviderName;
  preferredVisualType: GeneratedMediaType;
  videoMixPercent: number;
  sceneDensity: StoryboardSceneDensity;
  motionIntensity: StoryboardMotionIntensity;
  promptDetail: StoryboardPromptDetail;
  style: string;
};

export type AnimationPlanOptions = {
  provider: ProviderName;
  aspectRatio: GenerationAspectRatio;
  sceneDensity: StoryboardSceneDensity;
  motionIntensity: StoryboardMotionIntensity;
  promptDetail: StoryboardPromptDetail;
  style: string;
  layoutTemplate: AnimationLayoutTemplate;
  captionTemplate: AnimationCaptionTemplate;
  availableAssets: AnimationAssetMemoryItem[];
};

export type GenerationJobListResponse = {
  jobs: GenerationJob[];
  batchId?: string | null;
  batchPaused?: boolean;
};

export type GeneratedMediaListResponse = {
  assets: GeneratedMediaAsset[];
  batchId?: string | null;
};

export type BridgeStatusResponse = {
  workers: BridgeWorkerSnapshot[];
};

export type BridgeWorkerCleanupResponse = {
  cleared: number;
  workers: BridgeWorkerSnapshot[];
};

export type BridgeDebugEventListResponse = {
  events: BridgeDebugEvent[];
};

export type BridgeScreenshotCleanupResponse = {
  cleared: number;
};

type GenerationListOptions = {
  batchId?: string | null;
  projectId?: string | null;
  status?: GenerationJobStatus | null;
  provider?: ProviderName | null;
  workerId?: string | null;
  flow?: 'auto_generate' | 'auto_animate' | null;
  mediaType?: GeneratedMediaType | null;
  signal?: AbortSignal;
};

type ClearGenerationHistoryOptions = {
  projectId?: string | null;
  provider?: ProviderName | null;
  workerId?: string | null;
  flow?: 'auto_generate' | 'auto_animate' | null;
  mediaType?: GeneratedMediaType | null;
  statuses?: GenerationJobStatus[];
  includeActive?: boolean;
  signal?: AbortSignal;
};

export type ProjectSaveState = Record<string, unknown>;

export type ProjectListResponse = {
  projects: ProjectSummary[];
};

export type ProjectAssetResponse = {
  assetId: string;
  filename: string;
  url: string;
  localPath: string;
};

export const resolveBackendMediaUrl = (url: string): string => {
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`;
  return url;
};

export const getBrowserBridgeStatus = async (signal?: AbortSignal): Promise<BridgeStatusResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/browser-bridge/workers`, { signal });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not load browser bridge workers'));
  }

  return response.json();
};

export const pauseBrowserBridgeWorker = async (
  workerId: string,
  signal?: AbortSignal
): Promise<BridgeStatusResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/browser-bridge/workers/${encodeURIComponent(workerId)}/pause`, {
    method: 'POST',
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not pause bridge worker'));
  }

  return response.json();
};

export const resumeBrowserBridgeWorker = async (
  workerId: string,
  signal?: AbortSignal
): Promise<BridgeStatusResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/browser-bridge/workers/${encodeURIComponent(workerId)}/resume`, {
    method: 'POST',
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not resume bridge worker'));
  }

  return response.json();
};

export const clearBrowserBridgeWorkerError = async (
  workerId: string,
  signal?: AbortSignal
): Promise<BridgeStatusResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/browser-bridge/workers/${encodeURIComponent(workerId)}/clear-error`, {
    method: 'POST',
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not clear bridge worker error'));
  }

  return response.json();
};

export const clearDisconnectedBridgeWorkers = async (
  signal?: AbortSignal
): Promise<BridgeWorkerCleanupResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/browser-bridge/workers/disconnected`, {
    method: 'DELETE',
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not clear disconnected bridge workers'));
  }

  return response.json();
};

export const runBrowserBridgeHealthCheck = async (
  workerId: string,
  signal?: AbortSignal
): Promise<BridgeStatusResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/browser-bridge/workers/${encodeURIComponent(workerId)}/health-check`, {
    method: 'POST',
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not run bridge health check'));
  }

  return response.json();
};

export const runBrowserBridgeAdapterTest = async (
  workerId: string,
  signal?: AbortSignal
): Promise<BridgeStatusResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/browser-bridge/workers/${encodeURIComponent(workerId)}/adapter-test`, {
    method: 'POST',
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not run bridge adapter test'));
  }

  return response.json();
};

export const listBrowserBridgeDebugEvents = async (
  options: { workerId?: string; jobId?: string; limit?: number; signal?: AbortSignal } = {}
): Promise<BridgeDebugEventListResponse> => {
  const params = new URLSearchParams();
  if (options.workerId) params.set('workerId', options.workerId);
  if (options.jobId) params.set('jobId', options.jobId);
  if (options.limit) params.set('limit', String(options.limit));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/api/browser-bridge/debug/events${suffix}`, { signal: options.signal });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not load bridge debug events'));
  }

  return response.json();
};

export const clearBrowserBridgeDebugScreenshots = async (
  signal?: AbortSignal
): Promise<BridgeScreenshotCleanupResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/browser-bridge/debug/screenshots`, {
    method: 'DELETE',
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not clear bridge debug screenshots'));
  }

  return response.json();
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

  const response = await fetch(`${API_BASE_URL}/api/export`, {
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
  data.mediaUrl = API_BASE_URL + data.mediaUrl;
  return data;
};

export const transcribeMedia = async (
  file: File,
  signal?: AbortSignal
): Promise<TranscriptionResponse> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const detail = typeof errorData.detail === 'string' ? errorData.detail : 'Transcription failed';
    throw new Error(detail);
  }

  return response.json();
};

const formatApiError = (detail: unknown, fallback: string): string => {
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) return detail.map(item => item?.msg ?? String(item)).join(', ');
  return fallback;
};

export const createStoryboardFromTranscript = async (
  transcript: string,
  segments: TranscriptSlice[],
  options: StoryboardGenerationOptions,
  signal?: AbortSignal
): Promise<StoryboardResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/generation/storyboard/from-transcript`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript,
      segments,
      preferredVisualType: options.preferredVisualType,
      videoMixPercent: options.videoMixPercent,
      sceneDensity: options.sceneDensity,
      motionIntensity: options.motionIntensity,
      promptDetail: options.promptDetail,
      style: options.style,
      provider: options.provider,
    }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Storyboard generation failed'));
  }

  return response.json();
};

export const createStoryboardFromAudio = async (
  file: File,
  options: StoryboardGenerationOptions,
  signal?: AbortSignal
): Promise<StoryboardResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('preferredVisualType', options.preferredVisualType);
  formData.append('videoMixPercent', String(options.videoMixPercent));
  formData.append('sceneDensity', options.sceneDensity);
  formData.append('motionIntensity', options.motionIntensity);
  formData.append('promptDetail', options.promptDetail);
  formData.append('style', options.style);
  formData.append('provider', options.provider);

  const response = await fetch(`${API_BASE_URL}/api/generation/storyboard/from-audio`, {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Storyboard generation failed'));
  }

  return response.json();
};

export const createAnimationPlanFromTranscript = async (
  transcript: string,
  segments: TranscriptSlice[],
  options: AnimationPlanOptions,
  signal?: AbortSignal
): Promise<AnimationPlan> => {
  const response = await fetch(`${API_BASE_URL}/api/animation/plan/from-transcript`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript,
      segments,
      availableAssets: options.availableAssets,
      style: options.style,
      aspectRatio: options.aspectRatio,
      sceneDensity: options.sceneDensity,
      motionIntensity: options.motionIntensity,
      promptDetail: options.promptDetail,
      layoutTemplate: options.layoutTemplate,
      captionTemplate: options.captionTemplate,
      provider: options.provider,
    }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Animation planning failed'));
  }

  return response.json();
};

export const createAnimationPlanFromAudio = async (
  file: File,
  options: AnimationPlanOptions,
  signal?: AbortSignal
): Promise<AnimationPlan> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('availableAssets', JSON.stringify(options.availableAssets));
  formData.append('style', options.style);
  formData.append('aspectRatio', options.aspectRatio);
  formData.append('sceneDensity', options.sceneDensity);
  formData.append('motionIntensity', options.motionIntensity);
  formData.append('promptDetail', options.promptDetail);
  formData.append('layoutTemplate', options.layoutTemplate);
  formData.append('captionTemplate', options.captionTemplate);
  formData.append('provider', options.provider);

  const response = await fetch(`${API_BASE_URL}/api/animation/plan/from-audio`, {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Animation planning failed'));
  }

  return response.json();
};

export const createAnimationAssetJobs = async (
  assetNeeds: AnimationAssetNeed[],
  provider: ProviderName,
  aspectRatio: GenerationAspectRatio,
  projectId?: string | null,
  projectName?: string | null,
  batchId?: string | null,
  signal?: AbortSignal
): Promise<GenerationJobListResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/animation/assets/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetNeeds, provider, aspectRatio, projectId, projectName, batchId }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Animation asset job creation failed'));
  }

  return response.json();
};

export const retryAnimationAssetJob = async (
  jobId: string,
  signal?: AbortSignal
): Promise<GenerationJob> => {
  const response = await fetch(`${API_BASE_URL}/api/animation/assets/jobs/${jobId}/retry`, {
    method: 'POST',
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not retry animation asset job'));
  }

  return response.json();
};

export const autoRetryAnimationAssetJob = async (
  jobId: string,
  maxAttempts = 50,
  signal?: AbortSignal
): Promise<GenerationJob> => {
  const query = new URLSearchParams({ maxAttempts: String(maxAttempts) });
  const response = await fetch(`${API_BASE_URL}/api/animation/assets/jobs/${jobId}/retry-auto?${query}`, {
    method: 'POST',
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not rewrite and regenerate animation asset'));
  }

  return response.json();
};

export const createGenerationJobs = async (
  scenes: StoryboardScene[],
  provider: ProviderName,
  aspectRatio: GenerationAspectRatio,
  projectId?: string | null,
  projectName?: string | null,
  batchId?: string | null,
  signal?: AbortSignal
): Promise<GenerationJobListResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/generation/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenes, provider, aspectRatio, projectId, projectName, batchId }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Generation job creation failed'));
  }

  return response.json();
};

export const listGenerationJobs = async (
  options: GenerationListOptions = {}
): Promise<GenerationJobListResponse> => {
  const params = new URLSearchParams();
  if (options.batchId) params.set('batchId', options.batchId);
  if (options.projectId) params.set('projectId', options.projectId);
  if (options.status) params.set('status', options.status);
  if (options.provider) params.set('provider', options.provider);
  if (options.workerId) params.set('workerId', options.workerId);
  if (options.flow) params.set('flow', options.flow);
  if (options.mediaType) params.set('mediaType', options.mediaType);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/api/generation/jobs${suffix}`, { signal: options.signal });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not refresh generation jobs'));
  }

  return response.json();
};

export const clearGenerationJobHistory = async (
  options: ClearGenerationHistoryOptions = {}
): Promise<{ cleared: number }> => {
  const params = new URLSearchParams();
  if (options.projectId) params.set('projectId', options.projectId);
  if (options.provider) params.set('provider', options.provider);
  if (options.workerId) params.set('workerId', options.workerId);
  if (options.flow) params.set('flow', options.flow);
  if (options.mediaType) params.set('mediaType', options.mediaType);
  if (options.includeActive) params.set('includeActive', 'true');
  options.statuses?.forEach(status => params.append('statuses', status));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/api/generation/jobs/history${suffix}`, {
    method: 'DELETE',
    signal: options.signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not clear generation job history'));
  }

  return response.json();
};

export const pauseGenerationBatch = async (
  batchId: string,
  projectId?: string | null,
  signal?: AbortSignal
): Promise<GenerationJobListResponse> => {
  const params = new URLSearchParams();
  if (projectId) params.set('projectId', projectId);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/api/generation/batches/${batchId}/pause${suffix}`, {
    method: 'POST',
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not pause generation batch'));
  }

  return response.json();
};

export const resumeGenerationBatch = async (
  batchId: string,
  projectId?: string | null,
  signal?: AbortSignal
): Promise<GenerationJobListResponse> => {
  const params = new URLSearchParams();
  if (projectId) params.set('projectId', projectId);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/api/generation/batches/${batchId}/resume${suffix}`, {
    method: 'POST',
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not resume generation batch'));
  }

  return response.json();
};

export const retryGenerationJob = async (
  jobId: string,
  signal?: AbortSignal
): Promise<GenerationJob> => {
  const response = await fetch(`${API_BASE_URL}/api/generation/jobs/${jobId}/retry`, {
    method: 'POST',
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not retry generation job'));
  }

  return response.json();
};

export const autoRetryGenerationJob = async (
  jobId: string,
  maxAttempts?: number,
  signal?: AbortSignal
): Promise<GenerationJob> => {
  const query = maxAttempts ? `?maxAttempts=${encodeURIComponent(String(maxAttempts))}` : '';
  const response = await fetch(`${API_BASE_URL}/api/generation/jobs/${jobId}/retry-auto${query}`, {
    method: 'POST',
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not auto retry generation job'));
  }

  return response.json();
};

export const listGeneratedMediaAssets = async (
  includePlaceholders = true,
  options: GenerationListOptions = {}
): Promise<GeneratedMediaListResponse> => {
  const params = new URLSearchParams({ include_placeholders: String(includePlaceholders) });
  if (options.batchId) params.set('batchId', options.batchId);
  if (options.projectId) params.set('projectId', options.projectId);
  const response = await fetch(`${API_BASE_URL}/api/generation/media-assets?${params.toString()}`, { signal: options.signal });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not load generated media'));
  }

  return response.json();
};

export const createProjectRecord = async (
  name: string,
  parentDirectory?: string | null,
  signal?: AbortSignal
): Promise<ProjectDetail> => {
  const response = await fetch(`${API_BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parentDirectory }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not create project'));
  }

  return response.json();
};

export const chooseProjectDirectory = async (
  signal?: AbortSignal
): Promise<string> => {
  const response = await fetch(`${API_BASE_URL}/api/projects/select-directory`, {
    method: 'POST',
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not select a directory'));
  }

  const data = await response.json();
  return String(data.path || '');
};

export const listProjectRecords = async (
  signal?: AbortSignal
): Promise<ProjectListResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/projects`, { signal });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not list projects'));
  }

  return response.json();
};

export const getProjectRecord = async (
  projectId: string,
  signal?: AbortSignal
): Promise<ProjectDetail> => {
  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}`, { signal });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not load project'));
  }

  return response.json();
};

export const loadProjectRecordFromPath = async (
  path: string,
  signal?: AbortSignal
): Promise<ProjectDetail> => {
  const response = await fetch(`${API_BASE_URL}/api/projects/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not load project'));
  }

  return response.json();
};

export const saveProjectRecord = async (
  projectId: string,
  name: string,
  state: ProjectSaveState,
  signal?: AbortSignal
): Promise<ProjectDetail> => {
  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, state }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not save project'));
  }

  return response.json();
};

export const uploadProjectAsset = async (
  projectId: string,
  assetId: string,
  file: File,
  signal?: AbortSignal
): Promise<ProjectAssetResponse> => {
  const formData = new FormData();
  formData.append('assetId', assetId);
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/assets`, {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not save project media'));
  }

  return response.json();
};

export const storeRemoteGenerationJob = async (
  jobId: string,
  mediaUrl?: string,
  signal?: AbortSignal
): Promise<GenerationJob> => {
  const response = await fetch(`${API_BASE_URL}/api/generation/jobs/${jobId}/store-remote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mediaUrl ? { mediaUrl } : {}),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not store remote generated media'));
  }

  return response.json();
};

export const selectGenerationJobVariant = async (
  jobId: string,
  mediaUrl: string,
  signal?: AbortSignal
): Promise<GenerationJob> => {
  const response = await fetch(`${API_BASE_URL}/api/generation/jobs/${jobId}/select-variant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mediaUrl }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(formatApiError(errorData.detail, 'Could not select generated variant'));
  }

  return response.json();
};
