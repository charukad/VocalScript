import type {
  ContentIdea,
  ContentIdeaInput,
  NarrationLine,
  Script,
  ScriptDetail,
  ScriptInput,
  ScriptAnalysis,
  ScriptRewrite,
  ScriptVersionInput,
} from './types';

const API_BASE_URL = 'http://localhost:8000';

type IdeaListResponse = {
  ideas: ContentIdea[];
};

type ScriptListResponse = {
  scripts: Script[];
};

type NarrationLineListResponse = {
  lines: NarrationLine[];
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
