import { create } from 'zustand';
import {
  archiveIdea,
  createIdea,
  createScript,
  createScriptVersion,
  getScript,
  listIdeas,
  listScripts,
  splitScriptIntoLines,
  updateIdea,
  updateScript,
} from './api';
import type {
  ContentIdea,
  ContentIdeaInput,
  Script,
  ScriptDetail,
  ScriptInput,
  ScriptVersionInput,
} from './types';

type ContentStudioState = {
  activeProfileId: string | null;
  ideas: ContentIdea[];
  scripts: Script[];
  selectedScriptId: string | null;
  selectedScript: ScriptDetail | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  loadProfileWorkspace: (profileId: string | null) => Promise<void>;
  createIdea: (profileId: string, input: ContentIdeaInput) => Promise<ContentIdea>;
  updateIdea: (ideaId: string, input: Partial<ContentIdeaInput>) => Promise<ContentIdea>;
  archiveIdea: (ideaId: string) => Promise<void>;
  createScript: (profileId: string, input: ScriptInput) => Promise<ScriptDetail>;
  selectScript: (scriptId: string) => Promise<void>;
  updateScript: (scriptId: string, input: Partial<ScriptInput>) => Promise<ScriptDetail>;
  addVersion: (scriptId: string, input: ScriptVersionInput) => Promise<ScriptDetail>;
  splitLines: (scriptId: string) => Promise<ScriptDetail>;
};

const mergeScriptSummary = (scripts: Script[], detail: ScriptDetail): Script[] => {
  const summary: Script = {
    id: detail.id,
    profileId: detail.profileId,
    title: detail.title,
    content: detail.content,
    ideaId: detail.ideaId,
    finalVersionId: detail.finalVersionId,
    status: detail.status,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  };
  const exists = scripts.some(script => script.id === detail.id);
  return exists
    ? scripts.map(script => script.id === detail.id ? summary : script)
    : [summary, ...scripts];
};

export const useContentStudioStore = create<ContentStudioState>((set, get) => ({
  activeProfileId: null,
  ideas: [],
  scripts: [],
  selectedScriptId: null,
  selectedScript: null,
  isLoading: false,
  isSaving: false,
  error: null,
  loadProfileWorkspace: async (profileId) => {
    if (!profileId) {
      set({
        activeProfileId: null,
        ideas: [],
        scripts: [],
        selectedScriptId: null,
        selectedScript: null,
        error: null,
      });
      return;
    }
    set({ activeProfileId: profileId, isLoading: true, error: null });
    try {
      const [ideaResponse, scriptResponse] = await Promise.all([
        listIdeas(profileId),
        listScripts(profileId),
      ]);
      const firstScript = scriptResponse.scripts[0] ?? null;
      const selectedScript = firstScript ? await getScript(firstScript.id) : null;
      set({
        ideas: ideaResponse.ideas,
        scripts: scriptResponse.scripts,
        selectedScriptId: selectedScript?.id ?? null,
        selectedScript,
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Could not load Content Studio data' });
    } finally {
      set({ isLoading: false });
    }
  },
  createIdea: async (profileId, input) => {
    set({ isSaving: true, error: null });
    try {
      const idea = await createIdea(profileId, input);
      set(state => ({ ideas: [idea, ...state.ideas] }));
      return idea;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create idea';
      set({ error: message });
      throw error;
    } finally {
      set({ isSaving: false });
    }
  },
  updateIdea: async (ideaId, input) => {
    set({ isSaving: true, error: null });
    try {
      const idea = await updateIdea(ideaId, input);
      set(state => ({ ideas: state.ideas.map(existing => existing.id === idea.id ? idea : existing) }));
      return idea;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update idea';
      set({ error: message });
      throw error;
    } finally {
      set({ isSaving: false });
    }
  },
  archiveIdea: async (ideaId) => {
    set({ isSaving: true, error: null });
    try {
      await archiveIdea(ideaId);
      set(state => ({ ideas: state.ideas.filter(idea => idea.id !== ideaId) }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not archive idea';
      set({ error: message });
      throw error;
    } finally {
      set({ isSaving: false });
    }
  },
  createScript: async (profileId, input) => {
    set({ isSaving: true, error: null });
    try {
      const detail = await createScript(profileId, input);
      set(state => ({
        scripts: mergeScriptSummary(state.scripts, detail),
        selectedScriptId: detail.id,
        selectedScript: detail,
      }));
      return detail;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create script';
      set({ error: message });
      throw error;
    } finally {
      set({ isSaving: false });
    }
  },
  selectScript: async (scriptId) => {
    set({ isLoading: true, error: null });
    try {
      const detail = await getScript(scriptId);
      set({ selectedScriptId: detail.id, selectedScript: detail });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Could not load script' });
    } finally {
      set({ isLoading: false });
    }
  },
  updateScript: async (scriptId, input) => {
    set({ isSaving: true, error: null });
    try {
      const detail = await updateScript(scriptId, input);
      set(state => ({
        scripts: mergeScriptSummary(state.scripts, detail),
        selectedScript: detail,
      }));
      return detail;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update script';
      set({ error: message });
      throw error;
    } finally {
      set({ isSaving: false });
    }
  },
  addVersion: async (scriptId, input) => {
    set({ isSaving: true, error: null });
    try {
      const detail = await createScriptVersion(scriptId, input);
      set(state => ({
        scripts: mergeScriptSummary(state.scripts, detail),
        selectedScript: detail,
      }));
      return detail;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create version';
      set({ error: message });
      throw error;
    } finally {
      set({ isSaving: false });
    }
  },
  splitLines: async (scriptId) => {
    set({ isSaving: true, error: null });
    try {
      const response = await splitScriptIntoLines(scriptId);
      const detail = get().selectedScript;
      if (!detail || detail.id !== scriptId) {
        const refreshed = await getScript(scriptId);
        set({ selectedScript: refreshed });
        return refreshed;
      }
      const updated = { ...detail, narrationLines: response.lines };
      set({ selectedScript: updated });
      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not split script';
      set({ error: message });
      throw error;
    } finally {
      set({ isSaving: false });
    }
  },
}));
