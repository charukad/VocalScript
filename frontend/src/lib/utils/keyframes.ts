import type { KeyframeProperty, TimelineClip } from '../../types';

export const getClipPropertyValue = (clip: TimelineClip, property: KeyframeProperty): number => {
  if (property === 'scale') return clip.transform?.scale ?? 100;
  if (property === 'rotation') return clip.transform?.rotation ?? 0;
  if (property === 'opacity') return clip.transform?.opacity ?? 100;
  if (property === 'x') return clip.type === 'text' ? clip.textData?.x ?? clip.animation?.x ?? 50 : clip.animation?.x ?? 50;
  if (property === 'y') return clip.type === 'text' ? clip.textData?.y ?? clip.animation?.y ?? 50 : clip.animation?.y ?? 50;
  return clip.audio?.volume ?? 100;
};

export const clampKeyframeTime = (clip: TimelineClip, time: number): number => {
  return Math.max(0, Math.min(clip.duration, time));
};

export const getKeyframedValue = (
  clip: TimelineClip,
  property: KeyframeProperty,
  timelineTime: number,
  fallback = getClipPropertyValue(clip, property)
): number => {
  const propertyKeyframes = (clip.keyframes ?? [])
    .filter(keyframe => keyframe.property === property)
    .sort((a, b) => a.time - b.time);

  if (propertyKeyframes.length === 0) return fallback;

  const relativeTime = clampKeyframeTime(clip, timelineTime - clip.startTime);
  const first = propertyKeyframes[0];
  const last = propertyKeyframes[propertyKeyframes.length - 1];

  if (relativeTime <= first.time) return first.value;
  if (relativeTime >= last.time) return last.value;

  const nextIndex = propertyKeyframes.findIndex(keyframe => keyframe.time >= relativeTime);
  const previous = propertyKeyframes[nextIndex - 1];
  const next = propertyKeyframes[nextIndex];
  const span = Math.max(0.001, next.time - previous.time);
  const progress = (relativeTime - previous.time) / span;

  return previous.value + (next.value - previous.value) * progress;
};
