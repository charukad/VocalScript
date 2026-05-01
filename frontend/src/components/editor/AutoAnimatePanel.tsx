import { useEffect, useState } from 'react';
import { getStoryboardSources, useEditorStore } from '../../store/editorStore';
import { resolveBackendMediaUrl } from '../../lib/api/client';
import type {
  AnimationAssetNeed,
  AnimationAssetType,
  AnimationCaptionTemplate,
  AnimationLayoutTemplate,
  AnimationScene,
  GenerationJob,
  GenerationMediaVariant,
  GenerationAspectRatio,
  ProviderName,
  StoryboardMotionIntensity,
  StoryboardPromptDetail,
  StoryboardSceneDensity,
} from '../../types';

type AutoPanelMode = 'dock' | 'wide' | 'full';

const aspectRatioOptions: { value: GenerationAspectRatio; label: string }[] = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
  { value: '4:5', label: '4:5' },
];

const providerOptions: { value: ProviderName; label: string }[] = [
  { value: 'meta', label: 'Meta' },
  { value: 'grok', label: 'Grok' },
];

const densityOptions: { value: StoryboardSceneDensity; label: string }[] = [
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

const layoutTemplateOptions: { value: AnimationLayoutTemplate; label: string }[] = [
  { value: 'auto', label: 'Auto Layout' },
  { value: 'explainer_split', label: 'Explainer Split' },
  { value: 'center_focus', label: 'Center Focus' },
  { value: 'lower_third', label: 'Lower Third' },
  { value: 'portrait_stack', label: 'Portrait Stack' },
  { value: 'square_card', label: 'Square Card' },
];

const captionTemplateOptions: { value: AnimationCaptionTemplate; label: string }[] = [
  { value: 'clean_subtitle', label: 'Clean Subtitle' },
  { value: 'keyword_pop', label: 'Keyword Pop' },
  { value: 'karaoke_highlight', label: 'Karaoke Highlight' },
  { value: 'headline_burst', label: 'Headline Burst' },
];

const assetTypeOrder: AnimationAssetType[] = ['background', 'character', 'prop', 'icon', 'overlay', 'text'];

const formatSeconds = (seconds: number): string => `${Number(seconds.toFixed(2))}s`;

const getJobVariants = (job: GenerationJob | undefined): GenerationMediaVariant[] => {
  if (!job) return [];
  const variants = job.resultVariants?.length
    ? job.resultVariants
    : job.resultUrl
      ? [{ id: 'result-1', url: job.resultUrl, mediaType: job.mediaType, localPath: job.localPath, width: null, height: null, source: 'provider' }]
      : [];
  const seen = new Set<string>();
  return variants.filter(variant => {
    if (!variant.url || seen.has(variant.url)) return false;
    seen.add(variant.url);
    return true;
  });
};

const assetTypeFromName = (name: string): AnimationAssetType => {
  const lower = name.toLowerCase();
  if (/(background|backdrop|scene|room|city|landscape)/.test(lower)) return 'background';
  if (/(character|person|avatar|host|teacher|narrator)/.test(lower)) return 'character';
  if (/(icon|symbol|badge)/.test(lower)) return 'icon';
  if (/(overlay|frame|texture)/.test(lower)) return 'overlay';
  if (/(title|text|caption|label)/.test(lower)) return 'text';
  return 'prop';
};

export const AutoAnimatePanel = () => {
  const [panelMode, setPanelMode] = useState<AutoPanelMode>('dock');
  const state = useEditorStore();
  const {
    assets,
    captions,
    animationSettings,
    animationPlan,
    animationAssetLibrary,
    animationAssetJobs,
    currentAnimationBatchId,
    isGeneratingAnimationPlan,
    isSyncingAnimationAssets,
    animationStatus,
    setAnimationSettings,
    generateAnimationPlan,
    updateAnimationScene,
    updateAnimationAssetNeed,
    assignAnimationAssetNeed,
    approveAnimationPlan,
    createAnimationMissingAssetJobs,
    syncAnimationAssetJobs,
    retryAnimationAssetJob,
    autoRetryAnimationAssetJob,
    selectAnimationAssetVariant,
    buildAnimatedTimeline,
  } = state;

  const sources = getStoryboardSources(state);
  const configuredSourceExists = sources.some(source => source.id === animationSettings.sourceMediaId);
  const selectedSourceId = configuredSourceExists ? animationSettings.sourceMediaId ?? '' : sources[0]?.id ?? '';
  const hasTranscript = captions.some(caption => caption.text.trim());
  const canPlan = hasTranscript || sources.length > 0;
  const approvedCount = animationPlan?.scenes.filter(scene => scene.status === 'approved').length ?? 0;
  const jobCounts = animationAssetJobs.reduce<Record<string, number>>((counts, job) => {
    counts[job.status] = (counts[job.status] ?? 0) + 1;
    return counts;
  }, {});
  const failedAssetJobs = animationAssetJobs.filter(job =>
    ['failed', 'canceled', 'manual_action_required'].includes(job.status)
  );
  const animationJobByNeedId = new Map(
    animationAssetJobs.map(job => [job.metadata.animationAssetId || job.sceneId, job])
  );
  const missingCount = animationPlan?.assetNeeds.filter(need =>
    need.reuseDecision === 'generate' &&
    (
      ['missing', 'failed'].includes(need.status) ||
      (need.status === 'queued' && !animationJobByNeedId.has(need.id))
    )
  ).length ?? 0;
  const generatedLibraryItems = animationAssetLibrary
    .filter(item => item.status === 'generated')
    .map(item => ({
      item,
      media: item.mediaAssetId ? assets.find(asset => asset.id === item.mediaAssetId) : undefined,
    }));
  const shouldAutoSync = animationAssetJobs.some(job => job.status === 'queued' || job.status === 'running');

  useEffect(() => {
    if (!shouldAutoSync || isSyncingAnimationAssets) return;
    void syncAnimationAssetJobs(true);
    const interval = window.setInterval(() => {
      void syncAnimationAssetJobs(true);
    }, 4500);
    return () => window.clearInterval(interval);
  }, [shouldAutoSync, isSyncingAnimationAssets, syncAnimationAssetJobs]);

  const assignmentOptions = [
    ...animationAssetLibrary.map(asset => ({
      id: asset.id,
      label: `${asset.name} (${asset.assetType})`,
      assetType: asset.assetType,
    })),
    ...assets
      .filter(asset => asset.type === 'visual')
      .map(asset => ({
        id: `media:${asset.id}`,
        label: `${asset.file.name} (${assetTypeFromName(asset.file.name)})`,
        assetType: assetTypeFromName(asset.file.name),
      })),
  ];
  const uniqueAssignmentOptions = assignmentOptions.filter((option, index, all) =>
    all.findIndex(candidate => candidate.id === option.id) === index
  );

  const updateScene = (id: string, field: keyof Pick<AnimationScene, 'start' | 'end' | 'summary' | 'direction'>, value: string) => {
    if (field === 'start' || field === 'end') {
      updateAnimationScene(id, { [field]: Number(value) || 0 });
      return;
    }
    updateAnimationScene(id, { [field]: value } as Partial<AnimationScene>);
  };

  const updateNeed = (id: string, field: keyof Pick<AnimationAssetNeed, 'name' | 'prompt' | 'reuseDecision'>, value: string) => {
    if (field === 'reuseDecision') {
      updateAnimationAssetNeed(id, {
        reuseDecision: value as AnimationAssetNeed['reuseDecision'],
        status: value === 'reuse' ? 'available' : value === 'optional' ? 'missing' : 'missing',
        matchedAssetId: value === 'reuse' ? undefined : null,
      });
      return;
    }
    updateAnimationAssetNeed(id, { [field]: value } as Partial<AnimationAssetNeed>);
  };

  const generateNeed = async (need: AnimationAssetNeed) => {
    updateAnimationAssetNeed(need.id, {
      reuseDecision: 'generate',
      status: 'missing',
      matchedAssetId: null,
    });
    await createAnimationMissingAssetJobs();
  };

  const groupedNeeds = assetTypeOrder.map(assetType => ({
    assetType,
    needs: animationPlan?.assetNeeds.filter(need => need.assetType === assetType) ?? [],
  })).filter(group => group.needs.length > 0);

  return (
    <div className={`inspector-section auto-generate-panel auto-animate-panel auto-panel-${panelMode}`}>
      <div className="inspector-section-title auto-panel-title">
        <span>Auto Animate Video</span>
        <div className="auto-panel-mode-controls">
          <button className={panelMode === 'dock' ? 'active' : ''} onClick={() => setPanelMode('dock')} title="Dock in inspector">Dock</button>
          <button className={panelMode === 'wide' ? 'active' : ''} onClick={() => setPanelMode('wide')} title="Open half screen">Half</button>
          <button className={panelMode === 'full' ? 'active' : ''} onClick={() => setPanelMode('full')} title="Open full screen">Full</button>
        </div>
      </div>

      <div className="auto-panel-body">
        <div className="auto-panel-setup">
          <div className="auto-grid">
            <label className="auto-field">
              <span>Source</span>
              <select
                value={selectedSourceId}
                onChange={event => setAnimationSettings({ sourceMediaId: event.target.value || null })}
                disabled={sources.length === 0}
              >
                {sources.length === 0 ? (
                  <option value="">No audio/video source</option>
                ) : sources.map(source => (
                  <option key={source.id} value={source.id}>{source.name}</option>
                ))}
              </select>
            </label>

            <label className="auto-field">
              <span>Animation Style</span>
              <input
                type="text"
                value={animationSettings.style}
                onChange={event => setAnimationSettings({ style: event.target.value })}
                placeholder="2D explainer, faceless reels, cartoon, whiteboard..."
              />
            </label>

            <div className="auto-row-2">
              <label className="auto-field">
                <span>Provider</span>
                <select
                  value={animationSettings.provider}
                  onChange={event => setAnimationSettings({ provider: event.target.value as ProviderName })}
                >
                  {providerOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="auto-field">
                <span>Aspect</span>
                <select
                  value={animationSettings.aspectRatio}
                  onChange={event => setAnimationSettings({ aspectRatio: event.target.value as GenerationAspectRatio })}
                >
                  {aspectRatioOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="auto-row-3">
              <label className="auto-field">
                <span>Scene Count</span>
                <select
                  value={animationSettings.sceneDensity}
                  onChange={event => setAnimationSettings({ sceneDensity: event.target.value as StoryboardSceneDensity })}
                >
                  {densityOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="auto-field">
                <span>Motion</span>
                <select
                  value={animationSettings.motionIntensity}
                  onChange={event => setAnimationSettings({ motionIntensity: event.target.value as StoryboardMotionIntensity })}
                >
                  {motionOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="auto-field">
                <span>Prompts</span>
                <select
                  value={animationSettings.promptDetail}
                  onChange={event => setAnimationSettings({ promptDetail: event.target.value as StoryboardPromptDetail })}
                >
                  {promptDetailOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="auto-row-2">
              <label className="auto-field">
                <span>Layout</span>
                <select
                  value={animationSettings.layoutTemplate}
                  onChange={event => setAnimationSettings({ layoutTemplate: event.target.value as AnimationLayoutTemplate })}
                >
                  {layoutTemplateOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="auto-field">
                <span>Captions</span>
                <select
                  value={animationSettings.captionTemplate}
                  onChange={event => setAnimationSettings({ captionTemplate: event.target.value as AnimationCaptionTemplate })}
                >
                  {captionTemplateOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <button
            className="btn-primary"
            style={{ width: '100%', padding: '0.55rem', marginTop: '0.65rem' }}
            onClick={generateAnimationPlan}
            disabled={isGeneratingAnimationPlan || !canPlan}
          >
            {isGeneratingAnimationPlan ? 'Planning...' : 'Create Animation Plan'}
          </button>

          {animationStatus && <div className="auto-status">{animationStatus}</div>}
        </div>

        <div className="auto-panel-workspace">
          {!animationPlan && (
            <div className="auto-workspace-empty">
              Create a reusable-asset animation plan, generate only missing assets, then build editable timeline layers.
            </div>
          )}

          {animationPlan && (
            <>
              <div className="animation-toolbar">
                <button className="btn-secondary" onClick={approveAnimationPlan}>Approve Plan</button>
                <button className="btn-secondary" onClick={() => syncAnimationAssetJobs(false)} disabled={(!currentAnimationBatchId && !state.currentProject) || isSyncingAnimationAssets}>
                  {isSyncingAnimationAssets ? 'Syncing...' : 'Sync Assets'}
                </button>
              </div>
              <button
                className="btn-primary"
                style={{ width: '100%', padding: '0.55rem' }}
                onClick={createAnimationMissingAssetJobs}
                disabled={missingCount === 0}
              >
                Generate Missing Assets ({missingCount})
              </button>
              <button
                className="btn-primary"
                style={{ width: '100%', padding: '0.55rem' }}
                onClick={buildAnimatedTimeline}
                disabled={approvedCount === 0}
              >
                Build Animated Timeline
              </button>

              <div className="storyboard-count">
                {animationPlan.scenes.length} scenes - {approvedCount} approved - {animationPlan.assetNeeds.length} reusable assets
              </div>
              {animationAssetJobs.length > 0 && (
                <div className="generation-summary">
                  assets queued {jobCounts.queued ?? 0} - running {jobCounts.running ?? 0} - completed {jobCounts.completed ?? 0} - failed {(jobCounts.failed ?? 0) + (jobCounts.manual_action_required ?? 0)}
                </div>
              )}
              {generatedLibraryItems.length > 0 && (
                <>
                  <div className="animation-section-title">Generated Media</div>
                  <div className="animation-generated-library">
                    {generatedLibraryItems.map(({ item, media }) => {
                      const previewUrl = media?.thumbnailUrl || item.sourceUrl || '';
                      return (
                        <div key={item.id} className="animation-generated-item">
                          {previewUrl ? (
                            <img src={resolveBackendMediaUrl(previewUrl)} alt={item.name} />
                          ) : (
                            <div className="animation-generated-placeholder">No preview</div>
                          )}
                          <span>{item.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {failedAssetJobs.length > 0 && (
                <div className="generation-status-list">
                  {failedAssetJobs.map(job => (
                    <div key={job.id} className="generation-scene-block">
                      <div className="generation-scene-row">
                        <span>{job.metadata.animationAssetName || job.sceneId}</span>
                        <span className={`generation-scene-status status-${job.status}`}>{job.status}</span>
                      </div>
                      {job.error && <div className="auto-status">{job.error}</div>}
                      <div className="generation-retry-actions">
                        <button
                          className="btn-secondary"
                          onClick={() => retryAnimationAssetJob(job.id)}
                          disabled={isSyncingAnimationAssets}
                        >
                          Regenerate
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => autoRetryAnimationAssetJob(job.id)}
                          disabled={isSyncingAnimationAssets}
                        >
                          Rewrite + Regenerate
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {animationPlan.warnings.map(warning => (
                <div key={warning} className="auto-status">{warning}</div>
              ))}
              {animationPlan.rendererNotes?.map(note => (
                <div key={note} className="auto-status">{note}</div>
              ))}

              <div className="animation-section-title">Reusable Assets</div>
              <div className="animation-asset-groups">
                {groupedNeeds.map(group => (
                  <div key={group.assetType} className="animation-asset-group">
                    <div className="storyboard-card-header">
                      <span>{group.assetType}</span>
                      <span className="storyboard-count">{group.needs.length}</span>
                    </div>
                    {group.needs.map(need => {
                      const job = animationJobByNeedId.get(need.id);
                      const variants = getJobVariants(job);
                      const assignedMemory = need.matchedAssetId
                        ? animationAssetLibrary.find(asset => asset.id === need.matchedAssetId)
                        : undefined;
                      const assignedMedia = assignedMemory?.mediaAssetId
                        ? assets.find(asset => asset.id === assignedMemory.mediaAssetId)
                        : undefined;
                      const savedSelectedVariantUrl = job?.metadata.selectedVariantUrl;
                      const selectedVariantUrl = savedSelectedVariantUrl && variants.some(variant => variant.url === savedSelectedVariantUrl)
                        ? savedSelectedVariantUrl
                        : variants.length <= 1 ? job?.resultUrl ?? variants[0]?.url ?? null : null;
                      const selectedVariant = variants.find(variant => variant.url === selectedVariantUrl);
                      const needsVariantChoice = Boolean(job && job.status === 'completed' && variants.length > 1 && !job.metadata.selectedVariantUrl);
                      const jobBusy = Boolean(job && ['queued', 'running'].includes(job.status));
                      const canRegenerate = Boolean(job && !jobBusy);
                      const assignedPreviewUrl = assignedMedia?.thumbnailUrl || assignedMedia?.sourceUrl || assignedMemory?.sourceUrl || '';
                      return (
                      <div key={need.id} className="animation-asset-card">
                        <div className="generation-scene-row">
                          <span>{need.name}</span>
                          <span className={`generation-scene-status status-${need.status}`}>{need.reuseDecision}/{need.status}</span>
                        </div>
                        <label className="auto-field">
                          <span>Assign Existing</span>
                          <select
                            value={need.matchedAssetId ?? ''}
                            onChange={event => assignAnimationAssetNeed(need.id, event.target.value || null)}
                          >
                            <option value="">No assignment</option>
                            {uniqueAssignmentOptions
                              .filter(option => option.assetType === need.assetType)
                              .map(option => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                              ))}
                          </select>
                        </label>
                        <div className="auto-row-2">
                          <label className="auto-field">
                            <span>Action</span>
                            <select
                              value={need.reuseDecision}
                              onChange={event => updateNeed(need.id, 'reuseDecision', event.target.value)}
                            >
                              <option value="reuse">Reuse</option>
                              <option value="generate">Generate</option>
                              <option value="optional">Optional</option>
                            </select>
                          </label>
                          <label className="auto-field">
                            <span>Name</span>
                            <input
                              value={need.name}
                              onChange={event => updateNeed(need.id, 'name', event.target.value)}
                            />
                          </label>
                        </div>
                        <label className="auto-field">
                          <span>Generation Prompt</span>
                          <textarea
                            rows={2}
                            value={need.prompt}
                            onChange={event => updateNeed(need.id, 'prompt', event.target.value)}
                          />
                        </label>
                        {!selectedVariant && assignedPreviewUrl && (
                          <div className="animation-selected-preview">
                            {assignedMedia?.mediaKind === 'video' ? (
                              <video
                                src={resolveBackendMediaUrl(assignedPreviewUrl)}
                                muted
                                loop
                                playsInline
                                controls
                                preload="metadata"
                              />
                            ) : (
                              <img src={resolveBackendMediaUrl(assignedPreviewUrl)} alt={`Assigned ${need.name}`} />
                            )}
                            <span>Assigned media</span>
                          </div>
                        )}
                        {job && (
                          <>
                            <div className="generation-summary">
                              job {job.status}{needsVariantChoice ? ` - choose 1 of ${variants.length} results to import` : variants.length > 1 ? ` - ${variants.length} results` : ''}
                            </div>
                            {selectedVariant && (
                              <div className="animation-selected-preview">
                                {selectedVariant.mediaType === 'image' ? (
                                  <img src={resolveBackendMediaUrl(selectedVariant.url)} alt={`Selected ${need.name}`} />
                                ) : (
                                  <video
                                    src={resolveBackendMediaUrl(selectedVariant.url)}
                                    muted
                                    loop
                                    playsInline
                                    controls
                                    preload="metadata"
                                  />
                                )}
                                <span>Selected result</span>
                              </div>
                            )}
                            {variants.length > 0 && (
                              <div className="generation-variants animation-variants">
                                {variants.map((variant, variantIndex) => {
                                  const isSelectedVariant = selectedVariantUrl === variant.url;
                                  return (
                                    <button
                                      key={`${job.id}-${variant.url}`}
                                      className={`generation-variant ${isSelectedVariant ? 'selected' : ''}`}
                                      onClick={() => selectAnimationAssetVariant(job.id, variant.url)}
                                      disabled={isSyncingAnimationAssets}
                                      title={isSelectedVariant ? `Selected result ${variantIndex + 1}` : `Use result ${variantIndex + 1}`}
                                    >
                                      {variant.mediaType === 'image' ? (
                                        <img src={resolveBackendMediaUrl(variant.url)} alt={`${need.name} result ${variantIndex + 1}`} />
                                      ) : (
                                        <video
                                          src={resolveBackendMediaUrl(variant.url)}
                                          muted
                                          loop
                                          playsInline
                                          preload="metadata"
                                          onMouseEnter={event => void event.currentTarget.play().catch(() => {})}
                                          onMouseLeave={event => event.currentTarget.pause()}
                                        />
                                      )}
                                      <span>{isSelectedVariant ? 'Selected' : `Use ${variantIndex + 1}`}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            <div className="generation-retry-actions">
                              <button
                                className="btn-secondary"
                                onClick={() => retryAnimationAssetJob(job.id)}
                                disabled={!canRegenerate || isSyncingAnimationAssets}
                                title={jobBusy ? 'This asset is already queued or running. Sync assets or clear active jobs in the bridge first.' : 'Regenerate this reusable asset'}
                              >
                                Regenerate
                              </button>
                              <button
                                className="btn-secondary"
                                onClick={() => autoRetryAnimationAssetJob(job.id)}
                                disabled={!canRegenerate || isSyncingAnimationAssets}
                                title={jobBusy ? 'This asset is already queued or running. Sync assets or clear active jobs in the bridge first.' : 'Rewrite the prompt and regenerate this reusable asset'}
                              >
                                Rewrite + Regenerate
                              </button>
                            </div>
                          </>
                        )}
                        {!job && (
                          <div className="generation-retry-actions">
                            <button
                              className="btn-secondary"
                              onClick={() => generateNeed(need)}
                              disabled={isSyncingAnimationAssets}
                            >
                              Generate Asset
                            </button>
                            <button
                              className="btn-secondary"
                              onClick={() => syncAnimationAssetJobs(false)}
                              disabled={isSyncingAnimationAssets || (!currentAnimationBatchId && !state.currentProject)}
                            >
                              Find Media
                            </button>
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="animation-section-title">Scenes</div>
              <div className="storyboard-list">
                {animationPlan.scenes.map((scene, index) => (
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
                      <span>Summary - {formatSeconds(scene.start)} - {formatSeconds(scene.end)}</span>
                      <textarea
                        rows={2}
                        value={scene.summary}
                        onChange={event => updateScene(scene.id, 'summary', event.target.value)}
                      />
                    </label>
                    <label className="auto-field">
                      <span>Motion Notes</span>
                      <textarea
                        rows={2}
                        value={scene.direction}
                        onChange={event => updateScene(scene.id, 'direction', event.target.value)}
                      />
                    </label>
                    {scene.cue && (
                      <>
                        <div className="animation-cue-grid">
                          <div>
                            <span>Pose</span>
                            <strong>{scene.cue.character?.pose ?? 'talking'} / {scene.cue.character?.expression ?? 'neutral'}</strong>
                          </div>
                          <div>
                            <span>Mouth</span>
                            <strong>{scene.cue.character?.mouthCue ?? 'open'}</strong>
                          </div>
                          <div>
                            <span>Layout</span>
                            <strong>{(scene.cue.layout?.template ?? 'center_focus').replace(/_/g, ' ')}</strong>
                          </div>
                          <div>
                            <span>Camera</span>
                            <strong>{(scene.cue.camera?.preset ?? 'push_in').replace(/_/g, ' ')}</strong>
                          </div>
                          <div>
                            <span>Captions</span>
                            <strong>{(scene.cue.caption?.template ?? 'clean_subtitle').replace(/_/g, ' ')}</strong>
                          </div>
                        </div>
                        {((scene.cue.caption?.keywords?.length ?? 0) > 0 || (scene.cue.transcriptTriggers?.length ?? 0) > 0) && (
                          <div className="animation-cue-tags">
                            {[...new Set([...(scene.cue.caption?.keywords ?? []), ...(scene.cue.transcriptTriggers ?? [])])].map(tag => (
                              <span key={tag}>{tag}</span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    <div className="generation-summary">
                      {scene.layers.length} layers: {scene.layers.map(layer => layer.layerType).join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
