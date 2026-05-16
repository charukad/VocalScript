import type {
  CaptionDesignPreset,
  GeneratedMediaAsset,
  GenerationJob,
  PlatformTarget,
  StoryboardScene,
} from '../../types';

export type ContentIdeaStatus = 'draft' | 'selected' | 'converted_to_script' | 'archived';
export type ContentTrendStatus = 'active' | 'selected' | 'converted_to_idea' | 'archived';
export type ScriptStatus = 'draft' | 'final' | 'archived';
export type NarrationLineStatus = 'pending' | 'generating' | 'done' | 'failed';

export type ContentIdea = {
  id: string;
  profileId: string;
  title: string;
  topic: string;
  platform: PlatformTarget | null;
  hook: string;
  estimatedViralScore: number | null;
  reasonItMayWork: string;
  difficulty: string;
  targetDurationSeconds: number | null;
  suggestedVisualStyle: string;
  status: ContentIdeaStatus;
  createdAt: string;
  updatedAt: string;
};

export type ContentIdeaInput = {
  title: string;
  topic?: string;
  platform?: PlatformTarget | null;
  hook?: string;
  estimatedViralScore?: number | null;
  reasonItMayWork?: string;
  difficulty?: string;
  targetDurationSeconds?: number | null;
  suggestedVisualStyle?: string;
  status?: ContentIdeaStatus;
};

export type ContentTrend = {
  id: string;
  profileId: string;
  topic: string;
  platform: PlatformTarget | null;
  trendScore: number | null;
  platformRelevance: number | null;
  nicheRelevance: number | null;
  suggestedAngle: string;
  suggestedHook: string;
  contentIdeaSuggestions: string[];
  source: string;
  status: ContentTrendStatus;
  createdAt: string;
  updatedAt: string;
};

export type ContentTrendInput = {
  topic: string;
  platform?: PlatformTarget | null;
  trendScore?: number | null;
  platformRelevance?: number | null;
  nicheRelevance?: number | null;
  suggestedAngle?: string;
  suggestedHook?: string;
  contentIdeaSuggestions?: string[];
  source?: string;
  status?: ContentTrendStatus;
};

export type CompetitorContentStatus = 'active' | 'archived';

export type CompetitorContent = {
  id: string;
  profileId: string;
  competitorName: string;
  platform: PlatformTarget;
  title: string;
  contentUrl: string | null;
  publishedAt: string | null;
  topic: string;
  hook: string;
  format: string;
  videoLengthSeconds: number | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  notes: string;
  status: CompetitorContentStatus;
  createdAt: string;
  updatedAt: string;
};

export type CompetitorContentInput = {
  competitorName: string;
  platform: PlatformTarget;
  title: string;
  contentUrl?: string | null;
  publishedAt?: string | null;
  topic?: string;
  hook?: string;
  format?: string;
  videoLengthSeconds?: number | null;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  notes?: string;
  status?: CompetitorContentStatus;
};

export type CompetitorAnalysisSummary = {
  competitorCount: number;
  contentCount: number;
  averageViews: number;
  averageEngagementRate: number;
  topCompetitor: string | null;
  topTopic: string | null;
  strongestHook: string | null;
  averageVideoLengthSeconds: number | null;
  recommendations: string[];
};

export type BrandKit = {
  id: string;
  profileId: string;
  logoPath: string | null;
  colorPalette: string[];
  fontFamilies: string[];
  toneKeywords: string[];
  avoidKeywords: string[];
  captionPreset: string;
  thumbnailStyle: string;
  defaultCta: string;
  musicStyle: string;
  createdAt: string;
  updatedAt: string;
};

export type BrandKitInput = {
  logoPath?: string | null;
  colorPalette?: string[];
  fontFamilies?: string[];
  toneKeywords?: string[];
  avoidKeywords?: string[];
  captionPreset?: string;
  thumbnailStyle?: string;
  defaultCta?: string;
  musicStyle?: string;
};

export type CaptionDesignInput = {
  sampleText: string;
  platform?: PlatformTarget | null;
  emphasis?: 'balanced' | 'bold' | 'minimal';
};

export type CaptionDesignResult = {
  designs: CaptionDesignPreset[];
};

export type PromptTemplateStatus = 'active' | 'archived';

export type PromptTemplate = {
  id: string;
  profileId: string;
  name: string;
  useCase: string;
  promptText: string;
  variables: string[];
  notes: string;
  status: PromptTemplateStatus;
  createdAt: string;
  updatedAt: string;
};

export type PromptTemplateInput = {
  name: string;
  useCase?: string;
  promptText: string;
  variables?: string[];
  notes?: string;
  status?: PromptTemplateStatus;
};

export type CalendarItemStatus = 'planned' | 'drafting' | 'ready' | 'published' | 'archived';

export type CalendarItem = {
  id: string;
  profileId: string;
  title: string;
  scheduledAt: string;
  platform: PlatformTarget | null;
  status: CalendarItemStatus;
  ideaId: string | null;
  scriptId: string | null;
  projectId: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type CalendarItemInput = {
  title: string;
  scheduledAt: string;
  platform?: PlatformTarget | null;
  status?: CalendarItemStatus;
  ideaId?: string | null;
  scriptId?: string | null;
  projectId?: string | null;
  notes?: string;
};

export type ExperimentStatus = 'planned' | 'running' | 'completed' | 'archived';

export type ExperimentVariant = {
  label: string;
  title: string;
  thumbnailConcept: string;
  captionPreset: string;
  notes: string;
  metrics: AnalyticsMetrics;
};

export type Experiment = {
  id: string;
  profileId: string;
  name: string;
  hypothesis: string;
  platform: PlatformTarget | null;
  scriptId: string | null;
  projectId: string | null;
  variantA: ExperimentVariant;
  variantB: ExperimentVariant;
  winnerLabel: string | null;
  status: ExperimentStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ExperimentInput = {
  name: string;
  hypothesis?: string;
  platform?: PlatformTarget | null;
  scriptId?: string | null;
  projectId?: string | null;
  variantA: ExperimentVariant;
  variantB: ExperimentVariant;
  winnerLabel?: string | null;
  status?: ExperimentStatus;
  notes?: string;
};

export type PackagingGenerationInput = {
  script: string;
  currentTitle?: string;
  topic?: string;
  platform?: PlatformTarget | null;
};

export type TitleCandidate = {
  title: string;
  rationale: string;
  estimatedViralPotential: ViralPotentialScore;
};

export type ThumbnailConcept = {
  headline: string;
  visualPrompt: string;
  composition: string;
  emotion: string;
  rationale: string;
};

export type PackagingGenerationResult = {
  titles: TitleCandidate[];
  thumbnailConcepts: ThumbnailConcept[];
  usedLlmMode: string;
};

export type Script = {
  id: string;
  profileId: string;
  title: string;
  content: string;
  ideaId: string | null;
  finalVersionId: string | null;
  status: ScriptStatus;
  latestAnalysis?: ScriptAnalysis | null;
  createdAt: string;
  updatedAt: string;
};

export type ScriptInput = {
  title: string;
  content?: string;
  ideaId?: string | null;
  finalVersionId?: string | null;
  status?: ScriptStatus;
  latestAnalysis?: ScriptAnalysis | null;
};

export type ScriptVersion = {
  id: string;
  scriptId: string;
  label: string;
  content: string;
  isSelected: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ScriptVersionInput = {
  label: string;
  content: string;
  selectAsFinal?: boolean;
};

export type NarrationLine = {
  id: string;
  scriptId: string;
  sceneId: string | null;
  index: number;
  text: string;
  voiceStyle: string | null;
  emotion: string | null;
  speed: string | null;
  pauseAfterSeconds: number | null;
  audioAssetId: string | null;
  durationSeconds: number | null;
  status: NarrationLineStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NarrationLineInput = {
  text: string;
  sceneId?: string | null;
  index?: number;
  voiceStyle?: string | null;
  emotion?: string | null;
  speed?: string | null;
  pauseAfterSeconds?: number | null;
};

export type NarrationLineUpdateInput = Partial<NarrationLineInput> & {
  audioAssetId?: string | null;
  durationSeconds?: number | null;
  status?: NarrationLineStatus;
  error?: string | null;
};

export type VoiceGenerationMode = 'full_script' | 'line_by_line';

export type VoiceJobCreateInput = {
  mode: VoiceGenerationMode;
  provider?: 'google_ai_studio';
  projectId?: string | null;
  projectName?: string | null;
  batchId?: string | null;
  voiceStyle?: string | null;
};

export type VoiceJobBatch = {
  jobs: GenerationJob[];
  batchId?: string | null;
};

export type TimelineDraftBuildInput = {
  scenes: StoryboardScene[];
  generatedMediaAssets: GeneratedMediaAsset[];
};

export type AnalyticsConnectionStatus = 'not_connected' | 'manual_only' | 'connected' | 'error';

export type AnalyticsConnection = {
  id: string;
  profileId: string;
  platform: PlatformTarget;
  accountId: string | null;
  status: AnalyticsConnectionStatus;
  externalAccountId: string | null;
  displayName: string;
  scopes: string[];
  tokenReference: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AnalyticsConnectionInput = {
  status: AnalyticsConnectionStatus;
  externalAccountId?: string | null;
  displayName?: string;
  scopes?: string[];
  tokenReference?: string | null;
  metadata?: Record<string, unknown>;
};

export type AnalyticsMetrics = {
  views: number;
  impressions: number;
  ctr: number;
  averageViewDurationSeconds: number;
  audienceRetentionPercent: number;
  watchTimeMinutes: number;
  likes: number;
  comments: number;
  shares: number;
  followersGained: number;
};

export type ContentPerformance = {
  id: string;
  profileId: string;
  platform: PlatformTarget;
  projectId: string | null;
  externalContentId: string | null;
  title: string;
  publishedAt: string | null;
  postingTime: string | null;
  videoLengthSeconds: number | null;
  hookType: string;
  captionStyle: string;
  voiceStyle: string;
  visualStyle: string;
  trafficSource: string;
  metrics: AnalyticsMetrics;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ProfileLearning = {
  id: string;
  profileId: string;
  learningType: string;
  summary: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ManualPerformanceInput = {
  platform: PlatformTarget;
  projectId?: string | null;
  externalContentId?: string | null;
  title: string;
  publishedAt?: string | null;
  postingTime?: string | null;
  videoLengthSeconds?: number | null;
  hookType?: string;
  captionStyle?: string;
  voiceStyle?: string;
  visualStyle?: string;
  trafficSource?: string;
  metrics: AnalyticsMetrics;
  metadata?: Record<string, unknown>;
};

export type ScriptDetail = Script & {
  versions: ScriptVersion[];
  narrationLines: NarrationLine[];
};

export type ViralPotentialScore = {
  total: number;
  hook: number;
  retention: number;
  clarity: number;
  emotion: number;
  shareability: number;
  platformFit: number;
  notes: string[];
};

export type ScriptAnalysis = {
  estimatedViralPotential: ViralPotentialScore;
  hookStrength: string;
  retentionRisk: string;
  clarity: string;
  pacing: string;
  curiosityGap: string;
  emotionalPull: string;
  shareability: string;
  callToAction: string;
  platformFit: string;
  estimatedDurationSeconds: number;
  improvements: string[];
  usedLlmMode: string;
};

export type ScriptRewrite = {
  rewrittenScript: string;
  rationale: string[];
  analysis: ScriptAnalysis;
  usedLlmMode: string;
};

export type AgentRunStatus = 'pending' | 'running' | 'completed' | 'failed';
export type WorkflowRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export type AgentRun = {
  id: string;
  workflowRunId: string;
  profileId: string;
  projectId: string | null;
  agentName: string;
  inputJson: Record<string, unknown>;
  outputJson: Record<string, unknown>;
  status: AgentRunStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowRun = {
  id: string;
  profileId: string;
  projectId: string | null;
  workflowType: 'content_draft' | 'analytics_learning';
  inputJson: Record<string, unknown>;
  outputJson: Record<string, unknown> & {
    createdIdeaIds?: string[];
    createdScriptId?: string | null;
  };
  status: WorkflowRunStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowRunDetail = WorkflowRun & {
  runs: AgentRun[];
};

export type AgentWorkflowStartInput = {
  profileId: string;
  projectId?: string | null;
  workflowType?: 'content_draft' | 'analytics_learning';
  seedPrompt?: string;
  createDrafts?: boolean;
};
