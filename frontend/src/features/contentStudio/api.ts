import type {
  BrandKit,
  BrandKitInput,
  CalendarItem,
  CalendarItemInput,
  CharacterProfile,
  CharacterProfileInput,
  CharacterPromptPack,
  CommentAnalysisInput,
  CommentAnalysisRun,
  Experiment,
  ExperimentInput,
  CaptionDesignInput,
  CaptionDesignResult,
  ContentIdea,
  ContentIdeaInput,
  ContentTrend,
  ContentTrendInput,
  TrendImportResult,
  TrendRssImportInput,
  TrendSource,
  CompetitorAnalysisSummary,
  CompetitorContent,
  CompetitorContentInput,
  PackagingGenerationInput,
  PackagingGenerationResult,
  PublishJob,
  PublishJobInput,
  PublishingDestination,
  PublishingDestinationInput,
  PublishingPackage,
  PublishingPackageInput,
  PublishingProvider,
  PromptTemplate,
  PromptTemplateInput,
  RepurposeInput,
  RepurposeResult,
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

type TrendSourceListResponse = {
  sources: TrendSource[];
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

type CharacterProfileListResponse = {
  characters: CharacterProfile[];
};

type CommentAnalysisRunListResponse = {
  runs: CommentAnalysisRun[];
};

type CalendarItemListResponse = {
  items: CalendarItem[];
};

type ExperimentListResponse = {
  experiments: Experiment[];
};

type PublishingProviderListResponse = {
  providers: PublishingProvider[];
};

type PublishingDestinationListResponse = {
  destinations: PublishingDestination[];
};

type PublishJobListResponse = {
  jobs: PublishJob[];
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

export const listTrendSources = async (
  signal?: AbortSignal,
): Promise<TrendSourceListResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/trend-sources`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not load trend sources');
  return response.json();
};

export const importTrendRss = async (
  profileId: string,
  input: TrendRssImportInput,
  signal?: AbortSignal,
): Promise<TrendImportResult> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/trends/import/rss`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not import RSS trends');
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

export const listCharacters = async (
  profileId: string,
  signal?: AbortSignal,
): Promise<CharacterProfileListResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/characters`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not load characters');
  return response.json();
};

export const createCharacter = async (
  profileId: string,
  input: CharacterProfileInput,
  signal?: AbortSignal,
): Promise<CharacterProfile> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/characters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not create character');
  return response.json();
};

export const updateCharacter = async (
  characterId: string,
  input: Partial<CharacterProfileInput>,
  signal?: AbortSignal,
): Promise<CharacterProfile> => {
  const response = await fetch(`${API_BASE_URL}/api/characters/${characterId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not update character');
  return response.json();
};

export const archiveCharacter = async (
  characterId: string,
  signal?: AbortSignal,
): Promise<CharacterProfile> => {
  const response = await fetch(`${API_BASE_URL}/api/characters/${characterId}`, {
    method: 'DELETE',
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not archive character');
  return response.json();
};

export const getCharacterPromptPack = async (
  characterId: string,
  signal?: AbortSignal,
): Promise<CharacterPromptPack> => {
  const response = await fetch(`${API_BASE_URL}/api/characters/${characterId}/prompt-pack`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not load character prompt pack');
  return response.json();
};

export const analyzeComments = async (
  profileId: string,
  input: CommentAnalysisInput,
  signal?: AbortSignal,
): Promise<CommentAnalysisRun> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/comments/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not analyze comments');
  return response.json();
};

export const listCommentAnalyses = async (
  profileId: string,
  signal?: AbortSignal,
): Promise<CommentAnalysisRunListResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/comments/analyses`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not load comment analyses');
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

export const generateCaptionDesigns = async (
  profileId: string,
  input: CaptionDesignInput,
  signal?: AbortSignal
): Promise<CaptionDesignResult> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/caption-designs/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not generate caption designs');
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

export const listCalendarItems = async (
  profileId: string,
  signal?: AbortSignal
): Promise<CalendarItemListResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/calendar-items`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not load calendar items');
  return response.json();
};

export const createCalendarItem = async (
  profileId: string,
  input: CalendarItemInput,
  signal?: AbortSignal
): Promise<CalendarItem> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/calendar-items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not create calendar item');
  return response.json();
};

export const updateCalendarItem = async (
  itemId: string,
  input: Partial<CalendarItemInput>,
  signal?: AbortSignal
): Promise<CalendarItem> => {
  const response = await fetch(`${API_BASE_URL}/api/calendar-items/${itemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not update calendar item');
  return response.json();
};

export const archiveCalendarItem = async (
  itemId: string,
  signal?: AbortSignal
): Promise<CalendarItem> => {
  const response = await fetch(`${API_BASE_URL}/api/calendar-items/${itemId}`, {
    method: 'DELETE',
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not archive calendar item');
  return response.json();
};

export const listExperiments = async (
  profileId: string,
  signal?: AbortSignal
): Promise<ExperimentListResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/experiments`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not load experiments');
  return response.json();
};

export const createExperiment = async (
  profileId: string,
  input: ExperimentInput,
  signal?: AbortSignal
): Promise<Experiment> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/experiments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not create experiment');
  return response.json();
};

export const updateExperiment = async (
  experimentId: string,
  input: Partial<ExperimentInput>,
  signal?: AbortSignal
): Promise<Experiment> => {
  const response = await fetch(`${API_BASE_URL}/api/experiments/${experimentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not update experiment');
  return response.json();
};

export const archiveExperiment = async (
  experimentId: string,
  signal?: AbortSignal
): Promise<Experiment> => {
  const response = await fetch(`${API_BASE_URL}/api/experiments/${experimentId}`, {
    method: 'DELETE',
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not archive experiment');
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

export const generateRepurposeCandidates = async (
  profileId: string,
  input: RepurposeInput,
  signal?: AbortSignal,
): Promise<RepurposeResult> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/repurpose/shorts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not generate repurpose candidates');
  return response.json();
};

export const listPublishingProviders = async (
  signal?: AbortSignal,
): Promise<PublishingProviderListResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/publishing/providers`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not load publishing providers');
  return response.json();
};

export const listPublishingDestinations = async (
  profileId: string,
  signal?: AbortSignal,
): Promise<PublishingDestinationListResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/publishing/destinations`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not load publishing destinations');
  return response.json();
};

export const updatePublishingDestination = async (
  profileId: string,
  platform: string,
  input: PublishingDestinationInput,
  signal?: AbortSignal,
): Promise<PublishingDestination> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/publishing/destinations/${platform}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not update publishing destination');
  return response.json();
};

export const generatePublishingPackage = async (
  profileId: string,
  input: PublishingPackageInput,
  signal?: AbortSignal,
): Promise<PublishingPackage> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/publishing/package`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not generate publishing package');
  return response.json();
};

export const listPublishJobs = async (
  profileId: string,
  signal?: AbortSignal,
): Promise<PublishJobListResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/publish-jobs`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not load publish jobs');
  return response.json();
};

export const createPublishJob = async (
  profileId: string,
  input: PublishJobInput,
  signal?: AbortSignal,
): Promise<PublishJob> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}/publish-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not create publish job');
  return response.json();
};

export const updatePublishJob = async (
  jobId: string,
  input: Partial<PublishJobInput>,
  signal?: AbortSignal,
): Promise<PublishJob> => {
  const response = await fetch(`${API_BASE_URL}/api/publish-jobs/${jobId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not update publish job');
  return response.json();
};

export const archivePublishJob = async (
  jobId: string,
  signal?: AbortSignal,
): Promise<PublishJob> => {
  const response = await fetch(`${API_BASE_URL}/api/publish-jobs/${jobId}`, {
    method: 'DELETE',
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not archive publish job');
  return response.json();
};

export const dispatchPublishJob = async (
  jobId: string,
  signal?: AbortSignal,
): Promise<PublishJob> => {
  const response = await fetch(`${API_BASE_URL}/api/publish-jobs/${jobId}/dispatch`, {
    method: 'POST',
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not dispatch publish job');
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
