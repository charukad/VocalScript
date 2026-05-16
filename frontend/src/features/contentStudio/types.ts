import type { GenerationJob, PlatformTarget } from '../../types';

export type ContentIdeaStatus = 'draft' | 'selected' | 'converted_to_script' | 'archived';
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
  workflowType: 'content_draft';
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
  workflowType?: 'content_draft';
  seedPrompt?: string;
  createDrafts?: boolean;
};
