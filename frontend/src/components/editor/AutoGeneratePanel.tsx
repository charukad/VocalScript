import { useEffect } from 'react';
import { getStoryboardSources, useEditorStore } from '../../store/editorStore';
import { resolveBackendMediaUrl } from '../../lib/api/client';
import type { GeneratedMediaType, GenerationAspectRatio, GenerationJobStatus, ProviderName, StoryboardScene } from '../../types';

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

const terminalJobStatuses: GenerationJobStatus[] = ['completed', 'failed', 'canceled', 'manual_action_required'];

type SceneField = keyof Pick<StoryboardScene, 'start' | 'end' | 'transcript' | 'prompt' | 'visualType' | 'camera'>;

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
    syncGenerationBatch,
    importCompletedGenerationMedia,
    importGenerationVariant,
    currentGenerationBatchId,
    generationJobs,
    generatedMediaAssets,
    isSyncingGeneration,
    clips,
  } = state;

  const sources = getStoryboardSources(state);
  const configuredSourceExists = sources.some(source => source.id === storyboardSettings.sourceMediaId);
  const selectedSourceId = configuredSourceExists ? storyboardSettings.sourceMediaId ?? '' : sources[0]?.id ?? '';
  const hasTranscript = captions.some(caption => caption.text.trim());
  const canGenerate = hasTranscript || sources.length > 0;
  const approvedCount = storyboardScenes.filter(scene => scene.status === 'approved').length;
  const jobCounts = generationJobs.reduce<Record<string, number>>((counts, job) => {
    counts[job.status] = (counts[job.status] ?? 0) + 1;
    return counts;
  }, {});
  const generatedClipSceneIds = new Set(
    clips
      .filter(clip => clip.generation?.batchId === currentGenerationBatchId)
      .map(clip => clip.generation!.sceneId)
  );
  const jobBySceneId = new Map(generationJobs.map(job => [job.sceneId, job]));
  const assetBySceneId = new Map(generatedMediaAssets.map(asset => [asset.sceneId, asset]));
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
    row.job && terminalJobStatuses.includes(row.job.status) && !row.imported
  ).length;
  const shouldAutoSync = Boolean(
    currentGenerationBatchId &&
    generationJobs.length > 0 &&
    (
      generationJobs.some(job => job.status === 'queued' || job.status === 'running') ||
      importReadyCount > 0
    )
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
              onChange={event => setStoryboardSettings({ visualType: event.target.value as GeneratedMediaType })}
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
            {storyboardScenes.length} scenes - {approvedCount} approved - {generationJobs.length} jobs
          </div>

          {generationJobs.length > 0 && (
            <div className="generation-controls">
              <div className="generation-toolbar">
                <button className="btn-secondary" onClick={refreshGenerationJobs} disabled={isSyncingGeneration}>
                  Refresh Jobs
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
                queued {jobCounts.queued ?? 0} - running {jobCounts.running ?? 0} - completed {jobCounts.completed ?? 0} - needs action {jobCounts.manual_action_required ?? 0} - failed {jobCounts.failed ?? 0}
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
