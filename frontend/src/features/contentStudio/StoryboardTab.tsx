import { useMemo } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { useContentStudioStore } from './contentStudioStore';

type StoryboardTabProps = {
  profileId: string;
};

export const StoryboardTab = ({ profileId }: StoryboardTabProps) => {
  const {
    scripts,
    selectedScriptId,
    selectedScript,
    voiceJobs,
    timelineDraft,
    isSaving,
    selectScript,
    buildTimelineDraft,
  } = useContentStudioStore();
  const {
    currentProject,
    storyboardScenes,
    generatedMediaAssets,
    applyTimelineDraft,
  } = useEditorStore();

  const completedVisualCount = useMemo(
    () => generatedMediaAssets.filter(asset => asset.status === 'completed' && asset.mediaType !== 'audio').length,
    [generatedMediaAssets],
  );
  const completedVoiceCount = useMemo(
    () => voiceJobs?.jobs.filter(job => job.status === 'completed' && job.mediaType === 'audio').length ?? 0,
    [voiceJobs],
  );
  const projectIsLinked = Boolean(selectedScript && currentProject?.scriptId === selectedScript.id);

  const handleBuildDraft = async () => {
    if (!selectedScript) return;
    await buildTimelineDraft(selectedScript.id, {
      scenes: storyboardScenes,
      generatedMediaAssets,
    });
  };

  const handleApplyDraft = async () => {
    if (!timelineDraft) return;
    await applyTimelineDraft(timelineDraft, voiceJobs?.jobs ?? []);
  };

  return (
    <div className="studio-storyboard-grid" data-profile-id={profileId}>
      <section className="studio-panel">
        <header>
          <h2>Scripts</h2>
          <span>{scripts.length}</span>
        </header>
        <div className="studio-script-picker">
          {scripts.map(script => (
            <button
              key={script.id}
              className={script.id === selectedScriptId ? 'active' : ''}
              onClick={() => void selectScript(script.id)}
            >
              <strong>{script.title}</strong>
              <span>{script.status}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="studio-panel studio-storyboard-main">
        {!selectedScript && <div className="studio-empty">Select a script to build a timeline draft.</div>}
        {selectedScript && (
          <>
            <header>
              <h2>Storyboard / Timeline Draft</h2>
              <span>{projectIsLinked ? 'linked project ready' : 'project link needed to apply'}</span>
            </header>

            <div className="studio-draft-summary">
              <span>{selectedScript.narrationLines.length} narration lines</span>
              <span>{storyboardScenes.length} storyboard scenes</span>
              <span>{completedVoiceCount} completed voice clips</span>
              <span>{completedVisualCount} completed visuals</span>
            </div>

            <div className="studio-inline-actions">
              <button className="btn-primary" onClick={() => void handleBuildDraft()} disabled={isSaving}>
                Build Timeline Draft
              </button>
              <button
                className="btn-secondary"
                onClick={() => void handleApplyDraft()}
                disabled={!timelineDraft || !projectIsLinked}
              >
                Apply Draft To Editor
              </button>
            </div>

            {!projectIsLinked && (
              <div className="studio-empty">
                Link the open editor project to this script before applying a draft.
              </div>
            )}

            {timelineDraft && (
              <>
                <div className="studio-subsection">
                  <h3>Preview</h3>
                  <div className="studio-draft-summary">
                    <span>{timelineDraft.estimatedDurationSeconds}s estimated</span>
                    <span>{timelineDraft.audioClips.length} audio clips</span>
                    <span>{timelineDraft.visualClips.length} visual clips</span>
                    <span>{timelineDraft.captionClips.length} captions</span>
                  </div>
                  {timelineDraft.warnings.length > 0 && (
                    <ul className="studio-note-list">
                      {timelineDraft.warnings.map(warning => <li key={warning}>{warning}</li>)}
                    </ul>
                  )}
                </div>

                <div className="studio-draft-lanes">
                  <div>
                    <h3>Audio</h3>
                    {timelineDraft.audioClips.map(clip => (
                      <article className="studio-draft-item" key={clip.narrationLineId}>
                        <strong>{clip.start.toFixed(2)}s - {clip.end.toFixed(2)}s</strong>
                        <span>{clip.assetAvailable ? 'ready' : 'missing audio'}</span>
                        <p>{clip.text}</p>
                      </article>
                    ))}
                  </div>
                  <div>
                    <h3>Visuals</h3>
                    {timelineDraft.visualClips.map(clip => (
                      <article className="studio-draft-item" key={clip.sceneId}>
                        <strong>{clip.start.toFixed(2)}s - {clip.end.toFixed(2)}s</strong>
                        <span>{clip.assetAvailable ? 'ready' : 'missing media'}</span>
                        <p>{clip.text}</p>
                      </article>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
};
