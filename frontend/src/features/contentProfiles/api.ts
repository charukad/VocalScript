import type { ContentProfile, ContentProfileInput } from './types';

const API_BASE_URL = 'http://localhost:8000';

type ContentProfileListResponse = {
  profiles: ContentProfile[];
};

const formatApiError = async (response: Response, fallback: string): Promise<Error> => {
  const payload = await response.json().catch(() => ({}));
  const detail = typeof payload?.detail === 'string' ? payload.detail : fallback;
  return new Error(detail);
};

export const listContentProfiles = async (
  includeArchived = false,
  signal?: AbortSignal
): Promise<ContentProfileListResponse> => {
  const suffix = includeArchived ? '?includeArchived=true' : '';
  const response = await fetch(`${API_BASE_URL}/api/content-profiles${suffix}`, { signal });
  if (!response.ok) throw await formatApiError(response, 'Could not load content profiles');
  return response.json();
};

export const createContentProfile = async (
  input: ContentProfileInput,
  signal?: AbortSignal
): Promise<ContentProfile> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not create content profile');
  return response.json();
};

export const updateContentProfile = async (
  profileId: string,
  input: Partial<ContentProfileInput>,
  signal?: AbortSignal
): Promise<ContentProfile> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not update content profile');
  return response.json();
};

export const archiveContentProfile = async (
  profileId: string,
  signal?: AbortSignal
): Promise<ContentProfile> => {
  const response = await fetch(`${API_BASE_URL}/api/content-profiles/${profileId}`, {
    method: 'DELETE',
    signal,
  });
  if (!response.ok) throw await formatApiError(response, 'Could not archive content profile');
  return response.json();
};
