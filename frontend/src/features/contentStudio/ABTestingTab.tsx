import { useEffect, useMemo, useState } from 'react';
import { useContentProfileStore } from '../contentProfiles/contentProfileStore';
import { useContentStudioStore } from './contentStudioStore';
import {
  archiveExperiment,
  createExperiment,
  listExperiments,
  updateExperiment,
} from './api';
import type {
  Experiment,
  ExperimentInput,
  ExperimentStatus,
  ExperimentVariant,
} from './types';

type ABTestingTabProps = {
  profileId: string;
};

const emptyMetrics = {
  views: 0,
  impressions: 0,
  ctr: 0,
  averageViewDurationSeconds: 0,
  audienceRetentionPercent: 0,
  watchTimeMinutes: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  followersGained: 0,
};

const emptyVariant = (label: string): ExperimentVariant => ({
  label,
  title: '',
  thumbnailConcept: '',
  captionPreset: '',
  notes: '',
  metrics: { ...emptyMetrics },
});

const statusOptions: ExperimentStatus[] = ['planned', 'running', 'completed'];

export const ABTestingTab = ({ profileId }: ABTestingTabProps) => {
  const { profiles } = useContentProfileStore();
  const profile = profiles.find(item => item.id === profileId) ?? null;
  const { selectedScript } = useContentStudioStore();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [draft, setDraft] = useState<ExperimentInput>({
    name: '',
    hypothesis: '',
    platform: profile?.platforms[0] ?? null,
    scriptId: selectedScript?.id ?? null,
    projectId: null,
    variantA: emptyVariant('A'),
    variantB: emptyVariant('B'),
    winnerLabel: null,
    status: 'planned',
    notes: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visibleExperiments = useMemo(
    () => experiments.filter(experiment => experiment.status !== 'archived'),
    [experiments],
  );

  useEffect(() => {
    let ignore = false;
    const loadExperiments = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await listExperiments(profileId);
        if (!ignore) setExperiments(response.experiments);
      } catch (error) {
        if (!ignore) setError(error instanceof Error ? error.message : 'Could not load experiments');
      } finally {
        if (!ignore) setIsLoading(false);
      }
    };
    void loadExperiments();
    return () => { ignore = true; };
  }, [profileId]);

  const selectedPlatform = draft.platform && profile?.platforms.includes(draft.platform)
    ? draft.platform
    : profile?.platforms[0] ?? null;
  const linkedScriptId = draft.scriptId ?? selectedScript?.id ?? null;

  const handleCreate = async () => {
    if (!draft.name.trim() || !draft.variantA.title.trim() || !draft.variantB.title.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const created = await createExperiment(profileId, {
        ...draft,
        platform: selectedPlatform,
        scriptId: linkedScriptId,
      });
      setExperiments(current => [created, ...current]);
      setDraft(current => ({
        ...current,
        name: '',
        hypothesis: '',
        variantA: emptyVariant('A'),
        variantB: emptyVariant('B'),
        notes: '',
      }));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save experiment');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (experimentId: string, input: Partial<ExperimentInput>) => {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateExperiment(experimentId, input);
      setExperiments(current => current.map(experiment => experiment.id === updated.id ? updated : experiment));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not update experiment');
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async (experimentId: string) => {
    setIsSaving(true);
    setError(null);
    try {
      await archiveExperiment(experimentId);
      setExperiments(current => current.filter(experiment => experiment.id !== experimentId));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not archive experiment');
    } finally {
      setIsSaving(false);
    }
  };

  if (!profile) {
    return <div className="studio-empty studio-empty-large">Profile details are still loading.</div>;
  }

  return (
    <div className="studio-split">
      <section className="studio-panel">
        <header>
          <h2>Create Experiment</h2>
        </header>
        {error && <div className="content-profile-error">{error}</div>}
        <label>
          Name
          <input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} />
        </label>
        <label>
          Hypothesis
          <textarea rows={3} value={draft.hypothesis ?? ''} onChange={event => setDraft(current => ({ ...current, hypothesis: event.target.value }))} />
        </label>
        <label>
          Platform
          <select
            value={selectedPlatform ?? ''}
            onChange={event => setDraft(current => ({
              ...current,
              platform: (event.target.value || null) as ExperimentInput['platform'],
            }))}
          >
            {profile.platforms.map(platform => (
              <option key={platform} value={platform}>{platform.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </label>
        {(['variantA', 'variantB'] as const).map(key => (
          <fieldset key={key} className="studio-ab-variant">
            <legend>Variant {draft[key].label}</legend>
            <label>
              Title
              <input
                value={draft[key].title}
                onChange={event => setDraft(current => ({
                  ...current,
                  [key]: { ...current[key], title: event.target.value },
                }))}
              />
            </label>
            <label>
              Thumbnail concept
              <input
                value={draft[key].thumbnailConcept}
                onChange={event => setDraft(current => ({
                  ...current,
                  [key]: { ...current[key], thumbnailConcept: event.target.value },
                }))}
              />
            </label>
          </fieldset>
        ))}
        <button
          className="btn-primary"
          onClick={() => void handleCreate()}
          disabled={isSaving || !draft.name.trim() || !draft.variantA.title.trim() || !draft.variantB.title.trim()}
        >
          Save Experiment
        </button>
      </section>

      <section className="studio-panel studio-collection">
        <header>
          <h2>Experiments</h2>
          <span>{visibleExperiments.length}</span>
        </header>
        {isLoading && <div className="studio-empty">Loading experiments...</div>}
        {!isLoading && visibleExperiments.length === 0 && <div className="studio-empty">No experiments yet.</div>}
        {visibleExperiments.map(experiment => (
          <article className="studio-version-item" key={experiment.id}>
            <div>
              <strong>{experiment.name}</strong>
              <span>{experiment.status}</span>
            </div>
            <p>{experiment.hypothesis || 'No hypothesis recorded.'}</p>
            {(['variantA', 'variantB'] as const).map(key => {
              const variant = experiment[key];
              return (
                <div className="studio-ab-result" key={key}>
                  <strong>{variant.label}: {variant.title}</strong>
                  <p>{variant.metrics.views} views · {variant.metrics.ctr}% CTR</p>
                </div>
              );
            })}
            <div className="studio-inline-actions">
              <select
                value={experiment.status}
                onChange={event => void handleUpdate(experiment.id, { status: event.target.value as ExperimentStatus })}
              >
                {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
              </select>
              <select
                value={experiment.winnerLabel ?? ''}
                onChange={event => void handleUpdate(experiment.id, { winnerLabel: event.target.value || null })}
              >
                <option value="">No winner</option>
                <option value="A">Winner A</option>
                <option value="B">Winner B</option>
              </select>
              <button className="btn-secondary danger" onClick={() => void handleArchive(experiment.id)}>
                Archive
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
};
