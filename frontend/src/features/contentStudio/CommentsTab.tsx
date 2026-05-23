import { useEffect, useState } from 'react';
import { useContentProfileStore } from '../contentProfiles/contentProfileStore';
import { analyzeComments, listCommentAnalyses } from './api';
import type { CommentAnalysisRun } from './types';
import type { PlatformTarget } from '../../types';

type CommentsTabProps = {
  profileId: string;
};

export const CommentsTab = ({ profileId }: CommentsTabProps) => {
  const { profiles } = useContentProfileStore();
  const profile = profiles.find(item => item.id === profileId) ?? null;
  const [commentsText, setCommentsText] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [platform, setPlatform] = useState<PlatformTarget | ''>(profile?.platforms[0] ?? '');
  const [runs, setRuns] = useState<CommentAnalysisRun[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const loadCommentAnalyses = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await listCommentAnalyses(profileId);
        if (!ignore) setRuns(response.runs);
      } catch (error) {
        if (!ignore) setError(error instanceof Error ? error.message : 'Could not load comment analyses');
      } finally {
        if (!ignore) setIsLoading(false);
      }
    };
    void loadCommentAnalyses();
    return () => { ignore = true; };
  }, [profileId]);

  const selectedPlatform = platform || profile?.platforms[0] || '';

  const handleAnalyze = async () => {
    const comments = commentsText.split('\n').map(item => item.trim()).filter(Boolean);
    if (comments.length === 0) return;
    setIsSaving(true);
    setError(null);
    try {
      const run = await analyzeComments(profileId, {
        comments,
        platform: selectedPlatform || null,
        sourceLabel,
      });
      setRuns(current => [run, ...current]);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not analyze comments');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="studio-split">
      <section className="studio-panel">
        <header>
          <h2>Analyze Comments</h2>
        </header>
        {error && <div className="content-profile-error">{error}</div>}
        <label>
          Source label
          <input value={sourceLabel} onChange={event => setSourceLabel(event.target.value)} placeholder="latest upload" />
        </label>
        <label>
          Platform
          <select value={selectedPlatform} onChange={event => setPlatform(event.target.value as PlatformTarget)}>
            {(profile?.platforms ?? []).map(option => (
              <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </label>
        <label>
          Comments
          <textarea
            rows={12}
            value={commentsText}
            onChange={event => setCommentsText(event.target.value)}
            placeholder={'Paste one comment per line\nGreat video, explain agents next?\nCan you compare this with automation?'}
          />
        </label>
        <button className="btn-primary" onClick={() => void handleAnalyze()} disabled={isSaving || !commentsText.trim()}>
          Analyze Comments
        </button>
      </section>

      <section className="studio-panel studio-collection">
        <header>
          <h2>Analysis History</h2>
          <span>{runs.length}</span>
        </header>
        {isLoading && <div className="studio-empty">Loading analyses...</div>}
        {!isLoading && runs.length === 0 && <div className="studio-empty">No comment analyses yet.</div>}
        {runs.map(run => (
          <article className="studio-version-item" key={run.id}>
            <div>
              <strong>{run.sourceLabel || 'Comment batch'}</strong>
              <span>{run.summary.totalComments} comments</span>
            </div>
            <p>
              Positive {run.summary.sentimentCounts.positive}
              {' · '}
              Neutral {run.summary.sentimentCounts.neutral}
              {' · '}
              Negative {run.summary.sentimentCounts.negative}
            </p>
            {run.summary.recurringThemes.length > 0 && (
              <p>{run.summary.recurringThemes.map(theme => `${theme.label} (${theme.count})`).join(' · ')}</p>
            )}
            {run.summary.topQuestions.length > 0 && <p>Questions: {run.summary.topQuestions.join(' · ')}</p>}
            {run.summary.contentRequests.length > 0 && <p>Requests: {run.summary.contentRequests.join(' · ')}</p>}
            {run.summary.suggestedActions.map(action => <p key={action}>{action}</p>)}
          </article>
        ))}
      </section>
    </div>
  );
};
