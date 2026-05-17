import type { CaptionSegment, TimelineMarker } from '../../types';

export type TranscriptInsightKind = 'hook' | 'filler' | 'silence' | 'retention' | 'broll';

export type TranscriptInsight = {
  id: string;
  kind: TranscriptInsightKind;
  time: number;
  endTime?: number;
  title: string;
  detail: string;
  color: string;
};

export type TranscriptShortCandidate = {
  id: string;
  start: number;
  end: number;
  duration: number;
  title: string;
  hook: string;
  excerpt: string;
  score: number;
};

const FILLER_WORD_PATTERN = /\b(um+|uh+|erm+|like|you know|basically|actually|literally)\b/i;

export const buildTranscriptInsights = (
  captions: CaptionSegment[],
  sequenceDuration: number,
): TranscriptInsight[] => {
  const cleanCaptions = captions
    .filter(caption => caption.text.trim())
    .sort((a, b) => a.start - b.start);
  if (cleanCaptions.length === 0) return [];

  const insights: TranscriptInsight[] = [];
  const firstCaption = cleanCaptions[0];

  if (firstCaption.start > 1) {
    insights.push({
      id: 'hook-late-start',
      kind: 'hook',
      time: 0,
      endTime: firstCaption.start,
      title: 'Late hook',
      detail: `First spoken line starts at ${firstCaption.start.toFixed(1)}s. Consider bringing the payoff or question forward.`,
      color: '#f2c46d',
    });
  } else if ((firstCaption.text.match(/\b(why|how|what if|secret|mistake|stop|before)\b/gi) ?? []).length === 0) {
    insights.push({
      id: 'hook-soft-open',
      kind: 'hook',
      time: firstCaption.start,
      title: 'Soft opening',
      detail: 'Opening line may need a stronger curiosity gap, contrast, or direct promise.',
      color: '#f2c46d',
    });
  }

  cleanCaptions.forEach((caption, index) => {
    if (FILLER_WORD_PATTERN.test(caption.text)) {
      insights.push({
        id: `filler-${caption.id}`,
        kind: 'filler',
        time: caption.start,
        endTime: caption.end,
        title: 'Filler-word review',
        detail: caption.text,
        color: '#f48771',
      });
    }

    const wordCount = caption.text.trim().split(/\s+/).length;
    const duration = caption.end - caption.start;
    if (wordCount >= 18 || duration >= 4.5) {
      insights.push({
        id: `retention-${caption.id}`,
        kind: 'retention',
        time: caption.start,
        endTime: caption.end,
        title: 'Dense caption',
        detail: `${wordCount} words across ${duration.toFixed(1)}s. A shorter line or extra visual beat may read faster on mobile.`,
        color: '#5b8def',
      });
    }

    const next = cleanCaptions[index + 1];
    if (next) {
      const gap = next.start - caption.end;
      if (gap >= 1) {
        insights.push({
          id: `silence-${caption.id}-${next.id}`,
          kind: 'silence',
          time: caption.end,
          endTime: next.start,
          title: 'Silence gap',
          detail: `${gap.toFixed(1)}s without speech. Review whether this pause earns its place.`,
          color: '#78c58d',
        });
      }
    }
  });

  const lastCaption = cleanCaptions[cleanCaptions.length - 1];
  if (sequenceDuration - lastCaption.end >= 2) {
    insights.push({
      id: 'tail-silence',
      kind: 'silence',
      time: lastCaption.end,
      endTime: sequenceDuration,
      title: 'Trailing silence',
      detail: `${(sequenceDuration - lastCaption.end).toFixed(1)}s remain after the final line.`,
      color: '#78c58d',
    });
  }

  return insights.sort((a, b) => a.time - b.time);
};

export const transcriptInsightsToMarkers = (
  insights: TranscriptInsight[],
): Array<Pick<TimelineMarker, 'time' | 'label' | 'color'>> => (
  insights.map(insight => ({
    time: insight.time,
    label: insight.title,
    color: insight.color,
  }))
);

export const buildBrollSuggestions = (
  captions: CaptionSegment[],
): TranscriptInsight[] => (
  captions
    .filter(caption => caption.text.trim())
    .filter(caption => {
      const wordCount = caption.text.trim().split(/\s+/).length;
      const duration = caption.end - caption.start;
      return wordCount >= 8 || duration >= 2.4;
    })
    .map(caption => ({
      id: `broll-${caption.id}`,
      kind: 'broll',
      time: caption.start,
      endTime: caption.end,
      title: 'B-roll opportunity',
      detail: `Add a supporting visual beat for: "${caption.text.trim()}"`,
      color: '#bf8cff',
    }))
);

export const getShortDraftCandidates = (
  captions: CaptionSegment[],
  targetDurationSeconds = 45,
): TranscriptShortCandidate[] => {
  const cleanCaptions = captions
    .filter(caption => caption.text.trim())
    .sort((a, b) => a.start - b.start);
  const candidates: TranscriptShortCandidate[] = [];

  cleanCaptions.forEach((caption, startIndex) => {
    let endIndex = startIndex;
    while (
      endIndex + 1 < cleanCaptions.length
      && cleanCaptions[endIndex + 1].end - caption.start <= targetDurationSeconds
    ) {
      endIndex += 1;
    }
    const endCaption = cleanCaptions[endIndex];
    if (!endCaption) return;
    const duration = endCaption.end - caption.start;
    if (duration < Math.min(10, targetDurationSeconds / 2)) return;
    const excerpt = cleanCaptions.slice(startIndex, endIndex + 1).map(item => item.text.trim()).join(' ');
    const lower = excerpt.toLowerCase();
    const score = [
      /\b(why|how|what if|secret|mistake|stop|before|never)\b/.test(lower) ? 3 : 0,
      excerpt.includes('?') ? 2 : 0,
      Math.max(0, 2 - Math.abs(targetDurationSeconds - duration) / 12),
    ].reduce((sum, value) => sum + value, 0);
    candidates.push({
      id: `short-${caption.id}-${endCaption.id}`,
      start: caption.start,
      end: endCaption.end,
      duration,
      title: caption.text.trim().replace(/[.!?]+$/, '').slice(0, 72),
      hook: caption.text.trim(),
      excerpt,
      score,
    });
  });

  return candidates
    .sort((a, b) => b.score - a.score || Math.abs(targetDurationSeconds - a.duration) - Math.abs(targetDurationSeconds - b.duration))
    .slice(0, 5);
};
