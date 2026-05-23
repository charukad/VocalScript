import { useEffect, useMemo, useState } from 'react';
import { useContentProfileStore } from '../contentProfiles/contentProfileStore';
import { useContentStudioStore } from './contentStudioStore';
import {
  archivePublishJob,
  createPublishJob,
  dispatchPublishJob,
  generatePublishingPackage,
  listPublishingDestinations,
  listPublishingProviders,
  listPublishJobs,
  updatePublishingDestination,
  updatePublishJob,
} from './api';
import type {
  PublishJob,
  PublishJobStatus,
  PublishingDestination,
  PublishingDestinationStatus,
  PublishingPackage,
  PublishingProvider,
} from './types';
import type { PlatformTarget } from '../../types';

type PublishingTabProps = {
  profileId: string;
};

const destinationStatuses: PublishingDestinationStatus[] = ['not_connected', 'manual_only', 'connected', 'error'];
const jobStatuses: PublishJobStatus[] = ['draft', 'scheduled', 'ready', 'published', 'failed'];

const nowPlusOneDay = (): string => {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
};

const toIso = (value: string): string => new Date(value).toISOString();

export const PublishingTab = ({ profileId }: PublishingTabProps) => {
  const { profiles } = useContentProfileStore();
  const profile = profiles.find(item => item.id === profileId) ?? null;
  const { selectedScript } = useContentStudioStore();
  const [providers, setProviders] = useState<PublishingProvider[]>([]);
  const [destinations, setDestinations] = useState<PublishingDestination[]>([]);
  const [jobs, setJobs] = useState<PublishJob[]>([]);
  const [platform, setPlatform] = useState<PlatformTarget | ''>(profile?.platforms[0] ?? '');
  const [topic, setTopic] = useState(profile?.contentType ?? '');
  const [scheduledInput, setScheduledInput] = useState(nowPlusOneDay());
  const [packageResult, setPackageResult] = useState<PublishingPackage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visibleJobs = useMemo(() => jobs.filter(job => job.status !== 'archived'), [jobs]);

  useEffect(() => {
    let ignore = false;
    const loadPublishing = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [providerResponse, destinationResponse, jobResponse] = await Promise.all([
          listPublishingProviders(),
          listPublishingDestinations(profileId),
          listPublishJobs(profileId),
        ]);
        if (ignore) return;
        setProviders(providerResponse.providers);
        setDestinations(destinationResponse.destinations);
        setJobs(jobResponse.jobs);
      } catch (error) {
        if (!ignore) setError(error instanceof Error ? error.message : 'Could not load publishing data');
      } finally {
        if (!ignore) setIsLoading(false);
      }
    };
    void loadPublishing();
    return () => { ignore = true; };
  }, [profileId]);

  const selectedPlatform = platform || profile?.platforms[0] || '';

  const handleGeneratePackage = async () => {
    if (!selectedScript?.content.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      setPackageResult(await generatePublishingPackage(profileId, {
        script: selectedScript.content,
        title: selectedScript.title,
        topic,
        platform: selectedPlatform || null,
      }));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not generate publishing package');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDestinationUpdate = async (
    option: PlatformTarget,
    status: PublishingDestinationStatus,
  ) => {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updatePublishingDestination(profileId, option, { status });
      setDestinations(current => [
        ...current.filter(destination => destination.platform !== updated.platform),
        updated,
      ]);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not update destination');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateJob = async () => {
    if (!packageResult || !selectedPlatform) return;
    setIsSaving(true);
    setError(null);
    try {
      const created = await createPublishJob(profileId, {
        platform: selectedPlatform,
        title: packageResult.title,
        package: packageResult,
        scheduledAt: toIso(scheduledInput),
        status: 'scheduled',
      });
      setJobs(current => [created, ...current]);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not create publish job');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateJob = async (jobId: string, input: Partial<PublishJob>) => {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updatePublishJob(jobId, input);
      setJobs(current => current.map(job => job.id === updated.id ? updated : job));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not update publish job');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDispatch = async (jobId: string) => {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await dispatchPublishJob(jobId);
      setJobs(current => current.map(job => job.id === updated.id ? updated : job));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Live dispatch is not available yet');
      const refreshed = await listPublishJobs(profileId);
      setJobs(refreshed.jobs);
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async (jobId: string) => {
    setIsSaving(true);
    setError(null);
    try {
      await archivePublishJob(jobId);
      setJobs(current => current.filter(job => job.id !== jobId));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not archive publish job');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="studio-split">
      <section className="studio-panel">
        <header>
          <h2>Publishing Package</h2>
        </header>
        {error && <div className="content-profile-error">{error}</div>}
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
              <select value={selectedPlatform} onChange={event => setPlatform(event.target.value as PlatformTarget)}>
                {(profile?.platforms ?? []).map(option => (
                  <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>
                ))}
              </select>
            </label>
            <button className="btn-primary" onClick={() => void handleGeneratePackage()} disabled={isSaving || !selectedScript.content.trim()}>
              Generate Package
            </button>
          </>
        )}
        {packageResult && (
          <div className="studio-subsection">
            <h3>{packageResult.title}</h3>
            <p>{packageResult.postCopy}</p>
            <p>{packageResult.hashtags.join(' ')}</p>
            <textarea rows={6} value={packageResult.description} readOnly />
            {packageResult.platformNotes.map(note => <p key={note}>{note}</p>)}
            <label>
              Schedule time
              <input type="datetime-local" value={scheduledInput} onChange={event => setScheduledInput(event.target.value)} />
            </label>
            <button className="btn-secondary" onClick={() => void handleCreateJob()} disabled={isSaving || !selectedPlatform}>
              Queue Publish Job
            </button>
          </div>
        )}
      </section>

      <section className="studio-panel studio-collection">
        <header>
          <h2>Destinations And Jobs</h2>
          <span>{visibleJobs.length}</span>
        </header>
        {isLoading && <div className="studio-empty">Loading publishing setup...</div>}
        {!isLoading && (
          <>
            <div className="studio-subsection">
              <h3>Provider Readiness</h3>
              {providers.map(provider => (
                <article className="studio-list-item" key={provider.key}>
                  <div>
                    <strong>{provider.displayName}</strong>
                    <p>{provider.status.replaceAll('_', ' ')}</p>
                  </div>
                  <p>
                    OAuth {provider.readyForOauth ? 'configured' : 'missing config'}
                    {' · '}
                    Live publish {provider.supportsLivePublish ? 'ready' : 'pending'}
                    {' · '}
                    Scheduling {provider.supportsScheduling ? 'ready' : 'pending'}
                  </p>
                  {provider.configurationIssues.length > 0 && (
                    <p>Missing: {provider.configurationIssues.join(', ')}</p>
                  )}
                </article>
              ))}
            </div>
            <div className="studio-subsection">
              <h3>Destinations</h3>
              {(profile?.platforms ?? []).map(option => {
                const destination = destinations.find(item => item.platform === option);
                return (
                  <article className="studio-list-item" key={option}>
                    <div>
                      <strong>{option.replaceAll('_', ' ')}</strong>
                      <p>{destination?.displayName || 'No account selected'}</p>
                    </div>
                    <select
                      value={destination?.status ?? 'not_connected'}
                      onChange={event => void handleDestinationUpdate(option, event.target.value as PublishingDestinationStatus)}
                    >
                      {destinationStatuses.map(status => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </article>
                );
              })}
            </div>
            <div className="studio-subsection">
              <h3>Publish Jobs</h3>
              {visibleJobs.length === 0 && <div className="studio-empty">No publish jobs yet.</div>}
              {visibleJobs.map(job => (
                <article className="studio-version-item" key={job.id}>
                  <div>
                    <strong>{job.title}</strong>
                    <span>{job.status}</span>
                  </div>
                  <p>{job.platform.replaceAll('_', ' ')} · {job.providerStatus.replaceAll('_', ' ')}</p>
                  {job.error && <p>{job.error}</p>}
                  <div className="studio-inline-actions">
                    <select
                      value={job.status}
                      onChange={event => void handleUpdateJob(job.id, { status: event.target.value as PublishJobStatus })}
                    >
                      {jobStatuses.map(status => <option key={status} value={status}>{status}</option>)}
                    </select>
                    <button className="btn-secondary" onClick={() => void handleDispatch(job.id)} disabled={isSaving}>
                      Dispatch
                    </button>
                    <button className="btn-secondary danger" onClick={() => void handleArchive(job.id)}>
                      Archive
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
};
