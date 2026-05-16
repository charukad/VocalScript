import type {
  BrandKit,
  BrandKitInput,
  ContentIdea,
  ContentIdeaInput,
  ContentTrend,
  ContentTrendInput,
  CompetitorAnalysisSummary,
  CompetitorContent,
  CompetitorContentInput,
  PackagingGenerationInput,
  PackagingGenerationResult,
  PromptTemplate,
  PromptTemplateInput,
  AgentRun,
  AgentWorkflowStartInput,
  AnalyticsConnection,
  AnalyticsConnectionInput,
  ContentPerformance,
  ManualPerformanceInput,
  NarrationLine,
  NarrationLineInput,
  NarrationLineUpdateInput,
  Script,
  ScriptDetail,
  ScriptInput,
  ScriptAnalysis,
  ScriptRewrite,
  ScriptVersionInput,
  ProfileLearning,
  TimelineDraftBuildInput,
  VoiceJobBatch,
  VoiceJobCreateInput,
  WorkflowRunDetail,
} from './types';
import type { TimelineDraft } from '../../types';

const API_BASE_URL = 'http://localhost:8000';

type IdeaListResponse = {
  ideas: ContentIdea[];
};

type ScriptListResponse = {
  scripts: Script[];
};

type TrendListResponse = {
  trends: ContentTrend[];
};

type NarrationLineListResponse = {
  lines: NarrationLine[];
};

type AgentRunListResponse = {
  runs: AgentRun[];
};

type AnalyticsConnectionListResponse = {
  connections: AnalyticsConnection[];
};

type ContentPerformanceListResponse = {
  performance: ContentPerformance[];
};

type ProfileLearningListResponse = {
  learnings: ProfileLearning[];
};

type CompetitorContentListResponse = {
  items: CompetitorContent[];
};

type PromptTemplateListResponse = {
  templates: PromptTemplate[];
};

const formatApiError = async (response: Response, fallback: string): Promise<Error> => {
  const payload = await response.json().catch(() => ({}));
  const detail = typeof payload?.detail === 'string' ? payload.detail : fallback;
  return new Error(detail);
};

export const listIdeas = async (
  profileId: string,
  signal?: AbortSignal,
): Promise<IdeaListResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/ideas`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not load ideas');
  return response.json();
};

export const createIdea = async (
  profileId: string,
  input: ContentIdeaInput,
  signal?: AbortSignal,
): Promise<ContentIdea> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/ideas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not create idea');
  return response.json();
};

export const updateIdea = async (
  ideaId: string,
  input: Partial<ContentIdeaInput>,
  signal?: AbortSignal,
): Promise<ContentIdea> => {
  const response = await fetch(`${API_BASE_URL}/api/content-ideas/${ideaId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not update idea');
  return response.json();
};

export const archiveIdea = async (
  ideaId: string,
  signal?: AbortSignal,
): Promise<ContentIdea> => {
  const response = await fetch(`${API_BASE_URL}/api/content-ideas/${ideaId}`, {
    method: 'DELETE',
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not archive idea');
  return response.json();
};

export const listTrends = async (
  profileId: string,
  signal?: AbortSignal,
): Promise<TrendListResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/trends`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not load trends');
  return response.json();
};

export const createTrend = async (
  profileId: string,
  input: ContentTrendInput,
  signal?: AbortSignal,
): Promise<ContentTrend> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/trends`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not create trend');
  return response.json();
};

export const suggestTrends = async (
  profileId: string,
  signal?: AbortSignal,
): Promise<TrendListResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/trends/suggest`, {
    method: 'POST',
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not suggest trends');
  return response.json();
};

export const updateTrend = async (
  trendId: string,
  input: Partial<ContentTrendInput>,
  signal?: AbortSignal,
): Promise<ContentTrend> => {
  const response = await fetch(`${API_BASE_URL}/api/content-trends/${trendId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not update trend');
  return response.json();
};

export const archiveTrend = async (
  trendId: string,
  signal?: AbortSignal,
): Promise<ContentTrend> => {
  const response = await fetch(`${API_BASE_URL}/api/content-trends/${trendId}`, {
    method: 'DELETE',
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not archive trend');
  return response.json();
};

export const listCompetitorContent = async (
  profileId: string,
  signal?: AbortSignal,
): Promise<CompetitorContentListResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/competitor-content`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not load competitor content');
  return response.json();
};

export const createCompetitorContent = async (
  profileId: string,
  input: CompetitorContentInput,
  signal?: AbortSignal,
): Promise<CompetitorContent> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/competitor-content`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not create competitor content');
  return response.json();
};

export const updateCompetitorContent = async (
  itemId: string,
  input: Partial<CompetitorContentInput>,
  signal?: AbortSignal,
): Promise<CompetitorContent> => {
  const response = await fetch(`${API_BASE_URL}/api/competitor-content/${itemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not update competitor content');
  return response.json();
};

export const archiveCompetitorContent = async (
  itemId: string,
  signal?: AbortSignal,
): Promise<CompetitorContent> => {
  const response = await fetch(`${API_BASE_URL}/api/competitor-content/${itemId}`, {
    method: 'DELETE',
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not archive competitor content');
  return response.json();
};

export const getCompetitorSummary = async (
  profileId: string,
  signal?: AbortSignal,
): Promise<CompetitorAnalysisSummary> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/competitor-content/summary`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not summarize competitor content');
  return response.json();
};

export const getBrandKit = async (
  profileId: string,
  signal?: AbortSignal
): Promise<BrandKit> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/brand-kit`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not load brand kit');
  return response.json();
};

export const updateBrandKit = async (
  profileId: string,
  input: BrandKitInput,
  signal?: AbortSignal
): Promise<BrandKit> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/brand-kit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not update brand kit');
  return response.json();
};

export const listPromptTemplates = async (
  profileId: string,
  signal?: AbortSignal
): Promise<PromptTemplateListResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/prompt-templates`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not load prompt templates');
  return response.json();
};

export const createPromptTemplate = async (
  profileId: string,
  input: PromptTemplateInput,
  signal?: AbortSignal
): Promise<PromptTemplate> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/prompt-templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not create prompt template');
  return response.json();
};

export const updatePromptTemplate = async (
  templateId: string,
  input: Partial<PromptTemplateInput>,
  signal?: AbortSignal
): Promise<PromptTemplate> => {
  const response = await fetch(`${API_BASE_URL}/api/prompt-templates/${templateId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not update prompt template');
  return response.json();
};

export const archivePromptTemplate = async (
  templateId: string,
  signal?: AbortSignal
): Promise<PromptTemplate> => {
  const response = await fetch(`${API_BASE_URL}/api/prompt-templates/${templateId}`, {
    method: 'DELETE',
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not archive prompt template');
  return response.json();
};

export const generatePackaging = async (
  profileId: string,
  input: PackagingGenerationInput,
  signal?: AbortSignal,
): Promise<PackagingGenerationResult> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/packaging/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not generate packaging');
  return response.json();
};

export const listScripts = async (
  profileId: string,
  signal?: AbortSignal,
): Promise<ScriptListResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/scripts`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not load scripts');
  return response.json();
};

export const createScript = async (
  profileId: string,
  input: ScriptInput,
  signal?: AbortSignal,
): Promise<ScriptDetail> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/scripts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not create script');
  return response.json();
};

export const getScript = async (
  scriptId: string,
  signal?: AbortSignal,
): Promise<ScriptDetail> => {
  const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not load script');
  return response.json();
};

export const updateScript = async (
  scriptId: string,
  input: Partial<ScriptInput>,
  signal?: AbortSignal,
): Promise<ScriptDetail> => {
  const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not update script');
  return response.json();
};

export const createScriptVersion = async (
  scriptId: string,
  input: ScriptVersionInput,
  signal?: AbortSignal,
): Promise<ScriptDetail> => {
  const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not create script version');
  return response.json();
};

export const splitScriptIntoLines = async (
  scriptId: string,
  signal?: AbortSignal,
): Promise<NarrationLineListResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}/split-lines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not split script into narration lines');
  return response.json();
};

export const listNarrationLines = async (
  scriptId: string,
  signal?: AbortSignal,
): Promise<NarrationLineListResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}/narration-lines`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not load narration lines');
  return response.json();
};

export const createNarrationLine = async (
  scriptId: string,
  input: NarrationLineInput,
  signal?: AbortSignal,
): Promise<NarrationLine> => {
  const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}/narration-lines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not create narration line');
  return response.json();
};

export const updateNarrationLine = async (
  lineId: string,
  input: NarrationLineUpdateInput,
  signal?: AbortSignal,
): Promise<NarrationLine> => {
  const response = await fetch(`${API_BASE_URL}/api/narration-lines/${lineId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not update narration line');
  return response.json();
};

export const regenerateNarrationLine = async (
  lineId: string,
  signal?: AbortSignal,
): Promise<NarrationLine> => {
  const response = await fetch(`${API_BASE_URL}/api/narration-lines/${lineId}/regenerate`, {
    method: 'POST',
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not reset narration line');
  return response.json();
};

export const createVoiceJobs = async (
  scriptId: string,
  input: VoiceJobCreateInput,
  signal?: AbortSignal,
): Promise<VoiceJobBatch> => {
  const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}/voice-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not create voice jobs');
  return response.json();
};

export const listVoiceJobs = async (
  scriptId: string,
  signal?: AbortSignal,
): Promise<VoiceJobBatch> => {
  const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}/voice-jobs`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not load voice jobs');
  return response.json();
};

export const buildTimelineDraft = async (
  scriptId: string,
  input: TimelineDraftBuildInput,
  signal?: AbortSignal,
): Promise<TimelineDraft> => {
  const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}/timeline-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not build timeline draft');
  return response.json();
};

export const listAnalyticsConnections = async (
  profileId: string,
  signal?: AbortSignal,
): Promise<AnalyticsConnectionListResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/analytics/connections`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not load analytics connections');
  return response.json();
};

export const updateAnalyticsConnection = async (
  profileId: string,
  platform: string,
  input: AnalyticsConnectionInput,
  signal?: AbortSignal,
): Promise<AnalyticsConnection> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/analytics/connections/${platform}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not save analytics connection');
  return response.json();
};

export const importManualPerformance = async (
  profileId: string,
  input: ManualPerformanceInput,
  signal?: AbortSignal,
): Promise<ContentPerformance> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/analytics/performance/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not import analytics performance');
  return response.json();
};

export const listContentPerformance = async (
  profileId: string,
  signal?: AbortSignal,
): Promise<ContentPerformanceListResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/analytics/performance`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not load analytics performance');
  return response.json();
};

export const listProfileLearnings = async (
  profileId: string,
  signal?: AbortSignal,
): Promise<ProfileLearningListResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/analytics/learnings`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not load profile learnings');
  return response.json();
};

export const analyzeScript = async (
  script: string,
  signal?: AbortSignal,
): Promise<ScriptAnalysis> => {
  const response = await fetch(`${API_BASE_URL}/api/viral/analyze-script`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script }),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not analyze script');
  return response.json();
};

export const rewriteScriptForVirality = async (
  script: string,
  signal?: AbortSignal,
): Promise<ScriptRewrite> => {
  const response = await fetch(`${API_BASE_URL}/api/viral/rewrite-script`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script }),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not rewrite script');
  return response.json();
};

export const startAgentWorkflow = async (
  input: AgentWorkflowStartInput,
  signal?: AbortSignal,
): Promise<WorkflowRunDetail> => {
  const response = await fetch(`${API_BASE_URL}/api/agents/workflows/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not start agent workflow');
  return response.json();
};

export const getAgentWorkflow = async (
  workflowId: string,
  signal?: AbortSignal,
): Promise<WorkflowRunDetail> => {
  const response = await fetch(`${API_BASE_URL}/api/agents/workflows/${workflowId}`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not load agent workflow');
  return response.json();
};

export const listAgentRuns = async (
  profileId: string,
  signal?: AbortSignal,
): Promise<AgentRunListResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/agents/runs?profileId=${profileId}`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not load agent runs');
  return response.json();
};
