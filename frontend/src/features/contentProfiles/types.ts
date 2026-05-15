import type { PlatformTarget } from '../../types';

export type { PlatformTarget } from '../../types';

export type ContentProfile = {
  id: string;
  name: string;
  description: string;
  avatarPath: string | null;
  platforms: PlatformTarget[];
  contentType: string;
  targetAudience: string;
  language: string;
  tone: string;
  defaultVideoLengthSeconds: number;
  voiceStyle: string;
  visualStyle: string;
  hookStyle: string;
  captionStyle: string;
  brandColors: string[];
  competitors: string[];
  postingGoals: string;
  analyticsConnectionStatus: Record<string, string>;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type ContentProfileInput = {
  name: string;
  description: string;
  avatarPath: string | null;
  platforms: PlatformTarget[];
  contentType: string;
  targetAudience: string;
  language: string;
  tone: string;
  defaultVideoLengthSeconds: number;
  voiceStyle: string;
  visualStyle: string;
  hookStyle: string;
  captionStyle: string;
  brandColors: string[];
  competitors: string[];
  postingGoals: string;
  analyticsConnectionStatus: Record<string, string>;
};

export const PLATFORM_OPTIONS: { value: PlatformTarget; label: string }[] = [
  { value: 'youtube', label: 'YouTube' },
  { value: 'youtube_shorts', label: 'YouTube Shorts' },
  { value: 'facebook_page', label: 'Facebook Page' },
  { value: 'facebook_reels', label: 'Facebook Reels' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram_reels', label: 'Instagram Reels' },
  { value: 'multi_platform', label: 'Multi-platform' },
];

export const DEFAULT_CONTENT_PROFILE_INPUT: ContentProfileInput = {
  name: '',
  description: '',
  avatarPath: null,
  platforms: ['youtube_shorts'],
  contentType: 'general',
  targetAudience: 'general audience',
  language: 'en',
  tone: 'clear, engaging',
  defaultVideoLengthSeconds: 45,
  voiceStyle: 'natural narrator',
  visualStyle: 'clean social video',
  hookStyle: 'curiosity',
  captionStyle: 'high-contrast mobile captions',
  brandColors: [],
  competitors: [],
  postingGoals: '',
  analyticsConnectionStatus: {},
};
