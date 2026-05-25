import { useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { useContentStudioStore } from './contentStudioStore';
import type { NarrationLineInput, NarrationLineUpdateInput, VoiceGenerationMode } from './types';

type VoiceTabProps = {
  profileId: string;
};

export const VoiceTab = ({ profileId }: VoiceTabProps) => {
  const {
    scripts,
    selectedScriptId,
    selectedScript,
    voiceJobs,
    isSaving,
    selectScript,
    splitLines,
    addNarrationLine,
    updateNarrationLine,
    regenerateNarrationLine,
    queueVoiceJobs,
    refreshVoiceJobs,
  } = useContentStudioStore();
  const { currentProject, importCompletedVoiceMedia } = useEditorStore();
  const [newLineText, setNewLineText] = useState('');
  const [voiceMode, setVoiceMode] = useState<VoiceGenerationMode>('line_by_line');
  const [voiceStyle, setVoiceStyle] = useState('');
  const [drafts, setDrafts] = useState<Record<string, NarrationLineUpdateInput>>({});

  useEffect(() => {
    if (!selectedScriptId) return;
    void refreshVoiceJobs(selectedScriptId);
  }, [refreshVoiceJobs, selectedScriptId]);

  const shouldPollVoiceJobs = Boolean(voiceJobs?.jobs.some(job => job.status === 'queued' || job.status === 'running'));

  useEffect(() => {
    if (!selectedScriptId || !shouldPollVoiceJobs) return;
    const interval = window.setInterval(() => {
      void refreshVoiceJobs(selectedScriptId);
    }, 3500);
    return () => window.clearInterval(interval);
  }, [refreshVoiceJobs, selectedScriptId, shouldPollVoiceJobs]);

  const lines = useMemo(() => selectedScript?.narrationLines ?? [], [selectedScript]);
  const pendingClipIds = useMemo(
    () => lines.filter(line => line.status !== 'done').map(line => line.id),
    [lines],
  );

  const handleAddLine = async () => {
    if (!selectedScript || !newLineText.trim()) return;
    const input: NarrationLineInput = { text: newLineText };
    await addNarrationLine(selectedScript.id, input);
    setNewLineText('');
  };

  const handleSaveLine = async (lineId: string) => {
    await updateNarrationLine(lineId, drafts[lineId] ?? {});
  };

  const handleQueueVoiceJobs = async (lineIds?: string[]) => {
    if (!selectedScript) return;
    const linkedProject = currentProject?.scriptId === selectedScript.id ? currentProject : null;
    await queueVoiceJobs(selectedScript.id, {
      mode: lineIds?.length ? 'line_by_line' : voiceMode,
      provider: 'google_ai_studio',
      projectId: linkedProject?.id ?? null,
      projectName: linkedProject?.name ?? null,
      voiceStyle: voiceStyle || null,
      lineIds,
    });
  };

  const handleQueueClip = async (lineId: string) => {
    if (drafts[lineId]) {
      await handleSaveLine(lineId);
    }
    await handleQueueVoiceJobs([lineId]);
  };

  const completedVoiceJobs = useMemo(
    () => voiceJobs?.jobs.filter(job => job.status === 'completed' && job.mediaType === 'audio') ?? [],
    [voiceJobs],
  );

  useEffect(() => {
    if (!selectedScriptId || currentProject?.scriptId !== selectedScriptId || completedVoiceJobs.length === 0) return;
    void importCompletedVoiceMedia(completedVoiceJobs, true);
  }, [completedVoiceJobs, currentProject?.scriptId, importCompletedVoiceMedia, selectedScriptId]);

  return (
    <div className="studio-voice-grid" data-profile-id={profileId}>
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

      <section className="studio-panel studio-voice-main">
        {!selectedScript && <div className="studio-empty">Select a script to manage narration.</div>}
        {selectedScript && (
          <>
            <header>
              <h2>Voice / Narration</h2>
              <span>{lines.length} lines</span>
            </header>
            <div className="studio-inline-actions">
              <button className="btn-secondary" onClick={() => void splitLines(selectedScript.id)} disabled={isSaving}>
                Split Current Script
              </button>
            </div>
            <div className="studio-voice-job-controls">
              <label>
                Mode
                <select value={voiceMode} onChange={event => setVoiceMode(event.target.value as VoiceGenerationMode)}>
                  <option value="line_by_line">Clip by clip</option>
                  <option value="full_script">Full script</option>
                </select>
              </label>
              <label>
                Default Voice Style
                <input
                  value={voiceStyle}
                  onChange={event => setVoiceStyle(event.target.value)}
                  placeholder="Energetic narrator"
                />
              </label>
              <button
                className="btn-primary"
                onClick={() => void handleQueueVoiceJobs()}
                disabled={isSaving || (voiceMode === 'line_by_line' && lines.length === 0)}
              >
                {voiceMode === 'line_by_line' ? 'Queue All Clips' : 'Queue Full Script'}
              </button>
              <button
                className="btn-secondary"
                onClick={() => void handleQueueVoiceJobs(pendingClipIds)}
                disabled={isSaving || pendingClipIds.length === 0}
              >
                Queue Pending Clips
              </button>
            </div>
            {voiceJobs && (
              <div className="studio-voice-job-summary">
                <strong>{voiceJobs.jobs.length} queued</strong>
                <span>{voiceJobs.batchId ?? 'new batch'}</span>
                <div className="studio-voice-job-list">
                  {voiceJobs.jobs.map(job => (
                    <span key={job.id}>{job.sceneId}: {job.status}</span>
                  ))}
                </div>
                <div className="studio-inline-actions">
                  <button
                    className="btn-secondary"
                    onClick={() => selectedScriptId && void refreshVoiceJobs(selectedScriptId)}
                    disabled={isSaving}
                  >
                    Refresh Jobs
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => void importCompletedVoiceMedia(completedVoiceJobs, true)}
                    disabled={completedVoiceJobs.length === 0}
                  >
                    Import Completed Audio
                  </button>
                </div>
              </div>
            )}
            <div className="studio-add-line-row">
              <input
                value={newLineText}
                onChange={event => setNewLineText(event.target.value)}
                placeholder="Add a narration line"
              />
              <button className="btn-primary" onClick={() => void handleAddLine()} disabled={isSaving || !newLineText.trim()}>
                Add
              </button>
            </div>
            {lines.length === 0 && <div className="studio-empty">No narration lines yet.</div>}
            {lines.map(line => (
              <article className="studio-voice-line" key={line.id}>
                <header>
                  <strong>Line {line.index + 1}</strong>
                  <span>{line.status}</span>
                </header>
                <label>
                  Text
                  <textarea
                    rows={3}
                    value={String(drafts[line.id]?.text ?? line.text)}
                    onChange={event => setDrafts(current => ({
                      ...current,
                      [line.id]: { ...current[line.id], text: event.target.value },
                    }))}
                  />
                </label>
                <div className="studio-voice-fields">
                  <label>
                    Voice Style
                    <input
                      value={String(drafts[line.id]?.voiceStyle ?? line.voiceStyle ?? '')}
                      onChange={event => setDrafts(current => ({
                        ...current,
                        [line.id]: { ...current[line.id], voiceStyle: event.target.value || null },
                      }))}
                    />
                  </label>
                  <label>
                    Emotion
                    <input
                      value={String(drafts[line.id]?.emotion ?? line.emotion ?? '')}
                      onChange={event => setDrafts(current => ({
                        ...current,
                        [line.id]: { ...current[line.id], emotion: event.target.value || null },
                      }))}
                    />
                  </label>
                  <label>
                    Speed
                    <input
                      value={String(drafts[line.id]?.speed ?? line.speed ?? '')}
                      onChange={event => setDrafts(current => ({
                        ...current,
                        [line.id]: { ...current[line.id], speed: event.target.value || null },
                      }))}
                    />
                  </label>
                  <label>
                    Pause After
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={drafts[line.id]?.pauseAfterSeconds ?? line.pauseAfterSeconds ?? ''}
                      onChange={event => setDrafts(current => ({
                        ...current,
                        [line.id]: {
                          ...current[line.id],
                          pauseAfterSeconds: event.target.value ? Number(event.target.value) : null,
                        },
                      }))}
                    />
                  </label>
                </div>
                <div className="studio-inline-actions">
                  <button className="btn-secondary" onClick={() => void handleSaveLine(line.id)} disabled={isSaving}>
                    Save Line
                  </button>
                  <button className="btn-primary" onClick={() => void handleQueueClip(line.id)} disabled={isSaving || !line.text.trim()}>
                    Queue Clip
                  </button>
                  <button className="btn-secondary" onClick={() => void regenerateNarrationLine(line.id)} disabled={isSaving}>
                    Reset Clip
                  </button>
                </div>
              </article>
            ))}
          </>
        )}
      </section>
    </div>
  );
};
