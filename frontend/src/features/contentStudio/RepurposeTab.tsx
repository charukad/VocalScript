import { useEffect, useState } from 'react';
import { useContentProfileStore } from '../contentProfiles/contentProfileStore';
import { generateRepurposeCandidates } from './api';
import type { RepurposeResult } from './types';
import type { PlatformTarget } from '../../types';

type RepurposeTabProps = {
  profileId: string;
};

export const RepurposeTab = ({ profileId }: RepurposeTabProps) => {
  const { profiles } = useContentProfileStore();
  const profile = profiles.find(item => item.id === profileId) ?? null;
  const [sourceTitle, setSourceTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [platform, setPlatform] = useState<PlatformTarget | ''>('');
  const [duration, setDuration] = useState(45);
  const [result, setResult] = useState<RepurposeResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPlatform(profile?.platforms[0] ?? '');
  }, [profile]);

  const handleGenerate = async () => {
    if (!transcript.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      setResult(await generateRepurposeCandidates(profileId, {
        sourceTitle,
        transcript,
        platform: platform || null,
        targetDurationSeconds: duration,
        maxCandidates: 5,
      }));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not generate shorts');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="studio-split">
      <section className="studio-panel">
        <header>
          <h2>Repurpose Long Video</h2>
        </header>
        {error && <div className="content-profile-error">{error}</div>}
        <label>
          Source title
          <input value={sourceTitle} onChange={event => setSourceTitle(event.target.value)} />
        </label>
        <label>
          Platform
          <select value={platform} onChange={event => setPlatform(event.target.value as PlatformTarget)}>
            {(profile?.platforms ?? []).map(option => (
              <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </label>
        <label>
          Target duration
          <input type="number" min={10} max={180} value={duration} onChange={event => setDuration(Number(event.target.value) || 45)} />
        </label>
        <label>
          Transcript or source script
          <textarea rows={14} value={transcript} onChange={event => setTranscript(event.target.value)} />
        </label>
        <button className="btn-primary" onClick={() => void handleGenerate()} disabled={isGenerating || !transcript.trim()}>
          {isGenerating ? 'Working...' : 'Find Short Candidates'}
        </button>
      </section>

      <section className="studio-panel studio-collection">
        <header>
          <h2>Short Candidates</h2>
          <span>{result?.candidates.length ?? 0}</span>
        </header>
        {!result && <div className="studio-empty">Paste a transcript to find strong extractable moments.</div>}
        {result?.candidates.map(candidate => (
          <article className="studio-version-item" key={`${candidate.startSentence}-${candidate.endSentence}`}>
            <div>
              <strong>{candidate.title}</strong>
              <span>{candidate.estimatedDurationSeconds}s</span>
            </div>
            <p>{candidate.hook}</p>
            <p>{candidate.excerpt}</p>
            <p>Sentences {candidate.startSentence}-{candidate.endSentence}</p>
            <p>{candidate.reason}</p>
          </article>
        ))}
      </section>
    </div>
  );
};
