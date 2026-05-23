import { useState } from 'react';
import { useContentProfileStore } from '../contentProfiles/contentProfileStore';
import { generatePackaging } from './api';
import { useContentStudioStore } from './contentStudioStore';
import type { PackagingGenerationResult } from './types';
import type { PlatformTarget } from '../../types';

type PackagingTabProps = {
  profileId: string;
};

export const PackagingTab = ({ profileId }: PackagingTabProps) => {
  const { profiles } = useContentProfileStore();
  const profile = profiles.find(item => item.id === profileId) ?? null;
  const { selectedScript, updateScript, isSaving } = useContentStudioStore();
  const [topic, setTopic] = useState(profile?.contentType ?? '');
  const [platform, setPlatform] = useState<PlatformTarget | ''>(profile?.platforms[0] ?? '');
  const [result, setResult] = useState<PackagingGenerationResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPlatform = platform || profile?.platforms[0] || '';

  const handleGenerate = async () => {
    if (!selectedScript?.content.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      setResult(await generatePackaging(profileId, {
        script: selectedScript.content,
        currentTitle: selectedScript.title,
        topic,
        platform: selectedPlatform || null,
      }));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not generate packaging');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUseTitle = async (title: string) => {
    if (!selectedScript) return;
    await updateScript(selectedScript.id, { title });
  };

  if (!profile) {
    return <div className="studio-empty studio-empty-large">Profile details are still loading.</div>;
  }

  return (
    <div className="studio-split">
      <section className="studio-panel">
        <header>
          <h2>Packaging Brief</h2>
        </header>
        {!selectedScript && <div className="studio-empty">Create or select a script first.</div>}
        {selectedScript && (
          <>
            <label>
              Script
              <input value={selectedScript.title} readOnly />
            </label>
            <label>
              Topic
              <input value={topic} onChange={event => setTopic(event.target.value)} />
            </label>
            <label>
              Platform
              <select
                value={selectedPlatform}
                onChange={event => setPlatform(event.target.value as PlatformTarget)}
              >
                {profile.platforms.map(option => (
                  <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>
                ))}
              </select>
            </label>
            <label>
              Script opening
              <textarea rows={6} value={selectedScript.content} readOnly />
            </label>
            <button
              className="btn-primary"
              onClick={() => void handleGenerate()}
              disabled={isGenerating || !selectedScript.content.trim()}
            >
              {isGenerating ? 'Working...' : 'Generate Packaging'}
            </button>
          </>
        )}
      </section>

      <section className="studio-panel studio-collection">
        <header>
          <h2>Title / Thumbnail Options</h2>
          <span>{result?.usedLlmMode ?? '-'}</span>
        </header>
        {error && <div className="content-profile-error">{error}</div>}
        {!result && <div className="studio-empty">Generate packaging options from the selected script.</div>}
        {result && (
          <>
            <div className="studio-subsection">
              <h3>Titles</h3>
              {result.titles.map(candidate => (
                <article className="studio-version-item" key={candidate.title}>
                  <div>
                    <strong>{candidate.title}</strong>
                    <span>{candidate.estimatedViralPotential.total}</span>
                  </div>
                  <p>{candidate.rationale}</p>
                  <p>
                    Hook {candidate.estimatedViralPotential.hook}
                    {' · '}
                    Clarity {candidate.estimatedViralPotential.clarity}
                    {' · '}
                    Shareability {candidate.estimatedViralPotential.shareability}
                  </p>
                  <button
                    className="btn-secondary"
                    onClick={() => void handleUseTitle(candidate.title)}
                    disabled={isSaving || selectedScript?.title === candidate.title}
                  >
                    Use Title
                  </button>
                </article>
              ))}
            </div>

            <div className="studio-subsection">
              <h3>Thumbnail Concepts</h3>
              {result.thumbnailConcepts.map(concept => (
                <article className="studio-version-item" key={`${concept.headline}-${concept.emotion}`}>
                  <div>
                    <strong>{concept.headline}</strong>
                    <span>{concept.emotion}</span>
                  </div>
                  <p>{concept.visualPrompt}</p>
                  <p>{concept.composition}</p>
                  <p>{concept.rationale}</p>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
};
