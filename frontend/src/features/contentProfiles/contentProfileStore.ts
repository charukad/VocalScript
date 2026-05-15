import { create } from 'zustand';
import {
  archiveContentProfile,
  createContentProfile,
  listContentProfiles,
  updateContentProfile,
} from './api';
import type { ContentProfile, ContentProfileInput } from './types';

type ContentProfileState = {
  profiles: ContentProfile[];
  selectedProfileId: string | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  loadProfiles: () => Promise<void>;
  selectProfile: (profileId: string | null) => void;
  createProfile: (input: ContentProfileInput) => Promise<ContentProfile>;
  updateProfile: (profileId: string, input: Partial<ContentProfileInput>) => Promise<ContentProfile>;
  archiveProfile: (profileId: string) => Promise<void>;
};

export const useContentProfileStore = create<ContentProfileState>((set, get) => ({
  profiles: [],
  selectedProfileId: null,
  isLoading: false,
  isSaving: false,
  error: null,
  loadProfiles: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await listContentProfiles();
      const selectedProfileId = get().selectedProfileId;
      const nextSelected = response.profiles.some(profile => profile.id === selectedProfileId)
        ? selectedProfileId
        : response.profiles[0]?.id ?? null;
      set({ profiles: response.profiles, selectedProfileId: nextSelected });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Could not load content profiles' });
    } finally {
      set({ isLoading: false });
    }
  },
  selectProfile: (selectedProfileId) => set({ selectedProfileId }),
  createProfile: async (input) => {
    set({ isSaving: true, error: null });
    try {
      const profile = await createContentProfile(input);
      set(state => ({
        profiles: [profile, ...state.profiles],
        selectedProfileId: profile.id,
      }));
      return profile;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create content profile';
      set({ error: message });
      throw error;
    } finally {
      set({ isSaving: false });
    }
  },
  updateProfile: async (profileId, input) => {
    set({ isSaving: true, error: null });
    try {
      const profile = await updateContentProfile(profileId, input);
      set(state => ({
        profiles: state.profiles.map(existing => existing.id === profile.id ? profile : existing),
      }));
      return profile;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update content profile';
      set({ error: message });
      throw error;
    } finally {
      set({ isSaving: false });
    }
  },
  archiveProfile: async (profileId) => {
    set({ isSaving: true, error: null });
    try {
      await archiveContentProfile(profileId);
      set(state => {
        const profiles = state.profiles.filter(profile => profile.id !== profileId);
        const selectedProfileId = state.selectedProfileId === profileId
          ? profiles[0]?.id ?? null
          : state.selectedProfileId;
        return { profiles, selectedProfileId };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not archive content profile';
      set({ error: message });
      throw error;
    } finally {
      set({ isSaving: false });
    }
  },
}));
