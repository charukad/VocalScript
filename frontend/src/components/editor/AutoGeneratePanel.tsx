import { useEffect } from 'react';
import { getStoryboardSources, useEditorStore } from '../../store/editorStore';
import { resolveBackendMediaUrl } from '../../lib/api/client';
import type {
  GeneratedMediaAsset,
  GeneratedMediaType,
  GenerationAspectRatio,
  ProviderName,
  StoryboardMotionIntensity,
  StoryboardPromptDetail,
  StoryboardScene,
  StoryboardSceneDensity,
} from '../../types';

const STYLE_OPTIONS = [
  'cinematic realistic',
  'documentary natural',
  'animated explainer',
  'vertical social video',
  'product commercial',
  'moody sci-fi',
];

const formatSeconds = (seconds: number): string => `${Number(seconds.toFixed(2))}s`;

const providerOptions: { value: ProviderName; label: string }[] = [
  { value: 'meta', label: 'Meta' },
  { value: 'grok', label: 'Grok' },
];

const mediaTypeOptions: { value: GeneratedMediaType; label: string }[] = [
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
];

const aspectRatioOptions: { value: GenerationAspectRatio; label: string }[] = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
  { value: '4:5', label: '4:5' },
];

const sceneDensityOptions: { value: StoryboardSceneDensity; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'extra_high', label: 'Extra High' },
];

const motionOptions: { value: StoryboardMotionIntensity; label: string }[] = [
  { value: 'subtle', label: 'Subtle' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'dynamic', label: 'Dynamic' },
];

const promptDetailOptions: { value: StoryboardPromptDetail; label: string }[] = [
  { value: 'simple', label: 'Simple' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'detailed', label: 'Detailed' },
];

type SceneField = keyof Pick<StoryboardScene, 'start' | 'end' | 'transcript' | 'prompt' | 'visualType' | 'camera'>;

const getAssetVariantCount = (asset: GeneratedMediaAsset | undefined): number => {
  if (!asset) return 0;
  if (asset.resultVariants.length > 0) return asset.resultVariants.length;
  return asset.resultUrl ? 1 : 0;
};

export const AutoGeneratePanel = () => {
  const state = useEditorStore();
  const {
    captions,
    storyboardSettings,
    setStoryboardSettings,
    storyboardScenes,
    isGeneratingStoryboard,
    storyboardStatus,
    generateStoryboard,
    updateStoryboardScene,
    addStoryboardScene,
    duplicateStoryboardScene,
    deleteStoryboardScene,
    approveStoryboard,
    createJobsFromApprovedScenes,
    refreshGenerationJobs,
    pauseGenerationBatch,
    resumeGenerationBatch,
    retryGenerationJob,
    autoRetryGenerationJob,
    regenerateFailedScene,
    syncGenerationBatch,
    importCompletedGenerationMedia,
    importGenerationVariant,
    currentGenerationBatchId,
    generationJobs,
    generatedMediaAssets,
    isSyncingGeneration,
    isGenerationBatchPaused,
    clips,
    currentProject,
  } = state;

  const sources = getStoryboardSources(state);
  const configuredSourceExists = sources.some(source => source.id === storyboardSettings.sourceMediaId);
  const selectedSourceId = configuredSourceExists ? storyboardSettings.sourceMediaId ?? '' : sources[0]?.id ?? '';
  const hasTranscript = captions.some(caption => caption.text.trim());
  const canGenerate = hasTranscript || sources.length > 0;
  const approvedCount = storyboardScenes.filter(scene => scene.status === 'approved').length;
  const currentProjectId = currentProject?.id ?? null;
  const currentBatchJobs = generationJobs.filter(job =>
    job.batchId === currentGenerationBatchId &&
    job.projectId === currentProjectId
  );
  const currentBatchAssets = generatedMediaAssets.filter(asset =>
    asset.batchId === currentGenerationBatchId &&
    asset.projectId === currentProjectId
  );
  const jobCounts = currentBatchJobs.reduce<Record<string, number>>((counts, job) => {
    counts[job.status] = (counts[job.status] ?? 0) + 1;
    return counts;
  }, {});
  const generatedClipSceneIds = new Set(
    clips
      .filter(clip =>
        clip.generation?.batchId === currentGenerationBatchId &&
        clip.generation?.projectId === currentProjectId &&
        clip.type === 'visual' &&
        clip.generation.status === 'completed'
      )
      .map(clip => clip.generation!.sceneId)
  );
  const jobBySceneId = new Map(currentBatchJobs.map(job => [job.sceneId, job]));
  const assetBySceneId = new Map(currentBatchAssets.map(asset => [asset.sceneId, asset]));
  const sceneJobRows = storyboardScenes.map((scene, index) => {
    const job = jobBySceneId.get(scene.id);
    const asset = assetBySceneId.get(scene.id);
    const imported = generatedClipSceneIds.has(scene.id);
    return {
      scene,
      index,
      job,
      asset,
      imported,
      status: imported ? 'imported' : job?.status ?? scene.status,
    };
  });
  const importReadyCount = sceneJobRows.filter(row =>
    row.job?.status === 'completed' &&
    !row.imported &&
    row.asset?.resultUrl &&
    getAssetVariantCount(row.asset) <= 1
  ).length;
  const needsChoiceCount = sceneJobRows.filter(row =>
    row.job?.status === 'completed' &&
    !row.imported &&
    row.asset &&
    getAssetVariantCount(row.asset) > 1
  ).length;
  const shouldAutoSync = Boolean(
    currentGenerationBatchId &&
    currentBatchJobs.length > 0 &&
    !isGenerationBatchPaused &&
    currentBatchJobs.some(job => job.status === 'queued' || job.status === 'running')
  );

  useEffect(() => {
    if (!shouldAutoSync || isSyncingGeneration) return;
    void syncGenerationBatch(true);
    const interval = window.setInterval(() => {
      void syncGenerationBatch(true);
    }, 3500);
    return () => window.clearInterval(interval);
  }, [shouldAutoSync, isSyncingGeneration, syncGenerationBatch]);

  const updateScene = (id: string, field: SceneField, value: string) => {
    if (field === 'start' || field === 'end') {
      updateStoryboardScene(id, { [field]: Number(value) || 0 });
      return;
    }
    updateStoryboardScene(id, { [field]: value } as Partial<StoryboardScene>);
  };

  return (
    <div className="inspector-section auto-generate-panel">
      <div className="inspector-section-title">Auto Generate Video</div>

      <div className="auto-grid">
        <label className="auto-field">
          <span>Source</span>
          <select
            value={selectedSourceId}
            onChange={event => setStoryboardSettings({ sourceMediaId: event.target.value || null })}
            disabled={sources.length === 0}
          >
            {sources.length === 0 ? (
              <option value="">No audio/video source</option>
            ) : sources.map(source => (
              <option key={source.id} value={source.id}>{source.name}</option>
            ))}
          </select>
        </label>

        <div className="auto-row-2">
          <label className="auto-field">
            <span>Provider</span>
            <select
              value={storyboardSettings.provider}
              onChange={event => setStoryboardSettings({ provider: event.target.value as ProviderName })}
            >
              {providerOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="auto-field">
            <span>Type</span>
            <select
              value={storyboardSettings.visualType}
              onChange={event => {
                const visualType = event.target.value as GeneratedMediaType;
                setStoryboardSettings({
                  visualType,
                  videoMixPercent: visualType === 'video' ? 100 : 0,
                });
              }}
            >
              {mediaTypeOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="auto-field">
          <span>Aspect</span>
          <select
            value={storyboardSettings.aspectRatio}
            onChange={event => setStoryboardSettings({ aspectRatio: event.target.value as GenerationAspectRatio })}
          >
            {aspectRatioOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="auto-field">
          <span>Style</span>
          <select
            value={storyboardSettings.style}
            onChange={event => setStoryboardSettings({ style: event.target.value })}
          >
            {STYLE_OPTIONS.map(style => (
              <option key={style} value={style}>{style}</option>
            ))}
          </select>
        </label>

        <div className="auto-row-2">
          <label className="auto-field">
            <span>Scene Count</span>
            <select
              value={storyboardSettings.sceneDensity}
              onChange={event => setStoryboardSettings({ sceneDensity: event.target.value as StoryboardSceneDensity })}
            >
              {sceneDensityOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="auto-field">
            <span>Video Mix</span>
            <input
              type="range"
              min="0"
              max="100"
              step="10"
              value={storyboardSettings.videoMixPercent}
              onChange={event => {
                const value = Number(event.target.value);
                setStoryboardSettings({
                  videoMixPercent: value,
                  visualType: value >= 50 ? 'video' : 'image',
                });
              }}
            />
            <span className="auto-inline-value">{storyboardSettings.videoMixPercent}% video</span>
          </label>
        </div>

        <div className="auto-row-2">
          <label className="auto-field">
            <span>Motion</span>
            <select
              value={storyboardSettings.motionIntensity}
              onChange={event => setStoryboardSettings({ motionIntensity: event.target.value as StoryboardMotionIntensity })}
            >
              {motionOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="auto-field">
            <span>Prompt Detail</span>
            <select
              value={storyboardSettings.promptDetail}
              onChange={event => setStoryboardSettings({ promptDetail: event.target.value as StoryboardPromptDetail })}
            >
              {promptDetailOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <button
        className="btn-primary"
        style={{ width: '100%', padding: '0.55rem', marginTop: '0.65rem' }}
        onClick={generateStoryboard}
        disabled={isGeneratingStoryboard || !canGenerate}
      >
        {isGeneratingStoryboard ? 'Generating...' : 'Generate Storyboard'}
      </button>

      {storyboardStatus && (
        <div className="auto-status">{storyboardStatus}</div>
      )}

      {storyboardScenes.length > 0 && (
        <>
          <div className="storyboard-toolbar">
            <button className="btn-secondary" onClick={addStoryboardScene}>Add Scene</button>
            <button className="btn-secondary" onClick={approveStoryboard}>Approve</button>
          </div>
          <button
            className="btn-primary"
            style={{ width: '100%', padding: '0.55rem' }}
            onClick={createJobsFromApprovedScenes}
            disabled={approvedCount === 0}
          >
            Create Generation Jobs
          </button>
          <div className="storyboard-count">
            {storyboardScenes.length} scenes - {approvedCount} approved - {currentBatchJobs.length} jobs
          </div>

          {currentBatchJobs.length > 0 && (
            <div className="generation-controls">
              <div className="generation-toolbar">
                <button className="btn-secondary" onClick={refreshGenerationJobs} disabled={isSyncingGeneration}>
                  Refresh Jobs
                </button>
                <button
                  className="btn-secondary"
                  onClick={pauseGenerationBatch}
                  disabled={isSyncingGeneration || isGenerationBatchPaused}
                >
                  Pause
                </button>
                <button
                  className="btn-secondary"
                  onClick={resumeGenerationBatch}
                  disabled={isSyncingGeneration || !isGenerationBatchPaused}
                >
                  Resume
                </button>
                <button
                  className="btn-secondary"
                  onClick={importCompletedGenerationMedia}
                  disabled={isSyncingGeneration || importReadyCount === 0}
                >
                  {isSyncingGeneration ? 'Syncing...' : 'Import Ready'}
                </button>
              </div>
              <div className="generation-summary">
                {isGenerationBatchPaused ? 'paused - ' : ''}queued {jobCounts.queued ?? 0} - running {jobCounts.running ?? 0} - completed {jobCounts.completed ?? 0} - choose {needsChoiceCount} - needs action {jobCounts.manual_action_required ?? 0} - failed {jobCounts.failed ?? 0}
              </div>
              {currentGenerationBatchId && (
                <div className="generation-batch">Batch {currentGenerationBatchId.replace(/^batch-/, '')}</div>
              )}
              <div className="generation-status-list">
                {sceneJobRows.map(row => {
                  const variants = row.asset?.resultVariants?.length
                    ? row.asset.resultVariants
                    : row.asset?.resultUrl
                      ? [{ id: 'result-1', url: row.asset.resultUrl, mediaType: row.asset.mediaType, localPath: row.asset.localPath, width: null, height: null, source: 'provider' }]
                      : [];
                  return (
                  <div key={row.scene.id} className="generation-scene-block">
                    <div className="generation-scene-row">
                      <span>Scene {row.index + 1}</span>
                      <span className={`generation-scene-status status-${row.status}`}>{row.status}</span>
                    </div>
                    {variants.length > 0 && !row.imported && (
                      <div className="generation-variants">
                        {variants.map((variant, variantIndex) => (
                          <button
                            key={`${row.scene.id}-${variant.url}`}
                            className="generation-variant"
                            onClick={() => importGenerationVariant(row.asset!.jobId, variant.url)}
                            disabled={isSyncingGeneration}
                            title={`Use result ${variantIndex + 1}`}
                          >
                            {variant.mediaType === 'image' ? (
                              <img src={resolveBackendMediaUrl(variant.url)} alt={`Scene ${row.index + 1} result ${variantIndex + 1}`} />
                            ) : (
                              <span>Video {variantIndex + 1}</span>
                            )}
                            <span>Use {variantIndex + 1}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {((row.job && ['failed', 'canceled', 'manual_action_required'].includes(row.job.status)) || row.status === 'failed') && (
                      <div className="generation-retry-actions">
                        <button
                          className="btn-secondary"
                          onClick={() => row.job ? retryGenerationJob(row.job.id) : regenerateFailedScene(row.scene.id, false)}
                        >
                          Regenerate
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => row.job ? autoRetryGenerationJob(row.job.id) : regenerateFailedScene(row.scene.id, true)}
                        >
                          Rewrite + Regenerate
                        </button>
                      </div>
                    )}
                    {row.job?.error && (
                      <div className="auto-status">{row.job.error}</div>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="storyboard-list">
            {storyboardScenes.map((scene, index) => (
              <div key={scene.id} className="storyboard-card">
                <div className="storyboard-card-header">
                  <span>Scene {index + 1}</span>
                  <span className={`storyboard-status status-${scene.status}`}>{scene.status}</span>
                </div>

                <div className="auto-row-2">
                  <label className="auto-field">
                    <span>Start</span>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={Number(scene.start.toFixed(2))}
                      onChange={event => updateScene(scene.id, 'start', event.target.value)}
                    />
                  </label>
                  <label className="auto-field">
                    <span>End</span>
                    <input
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={Number(scene.end.toFixed(2))}
                      onChange={event => updateScene(scene.id, 'end', event.target.value)}
                    />
                  </label>
                </div>

                <label className="auto-field">
                  <span>Media</span>
                  <select
                    value={scene.visualType}
                    onChange={event => updateScene(scene.id, 'visualType', event.target.value)}
                  >
                    {mediaTypeOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="auto-field">
                  <span>Prompt</span>
                  <textarea
                    rows={3}
                    value={scene.prompt}
                    onChange={event => updateScene(scene.id, 'prompt', event.target.value)}
                  />
                </label>

                <label className="auto-field">
                  <span>Transcript - {formatSeconds(scene.start)} - {formatSeconds(scene.end)}</span>
                  <textarea
                    rows={2}
                    value={scene.transcript}
                    onChange={event => updateScene(scene.id, 'transcript', event.target.value)}
                  />
                </label>

                <div className="storyboard-actions">
                  <button className="btn-secondary" onClick={() => duplicateStoryboardScene(scene.id)}>Duplicate</button>
                  <button className="btn-secondary danger" onClick={() => deleteStoryboardScene(scene.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
