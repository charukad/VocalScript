import { useEffect, useMemo, useState } from 'react';
import { useContentStudioStore } from './contentStudioStore';
import type { NarrationLineInput, NarrationLineUpdateInput, VoiceGenerationMode } from './types';

type VoiceTabProps = {
  profileId: string;
};

export const VoiceTab = ({ profileId: _profileId }: VoiceTabProps) => {
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
  } = useContentStudioStore();
  const [newLineText, setNewLineText] = useState('');
  const [voiceMode, setVoiceMode] = useState<VoiceGenerationMode>('line_by_line');
  const [voiceStyle, setVoiceStyle] = useState('');
  const [drafts, setDrafts] = useState<Record<string, NarrationLineUpdateInput>>({});

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        (selectedScript?.narrationLines ?? []).map(line => [line.id, {
          text: line.text,
          voiceStyle: line.voiceStyle,
          emotion: line.emotion,
          speed: line.speed,
          pauseAfterSeconds: line.pauseAfterSeconds,
        }]),
      ),
    );
  }, [selectedScript]);

  const lines = useMemo(() => selectedScript?.narrationLines ?? [], [selectedScript]);

  const handleAddLine = async () => {
    if (!selectedScript || !newLineText.trim()) return;
    const input: NarrationLineInput = { text: newLineText };
    await addNarrationLine(selectedScript.id, input);
    setNewLineText('');
  };

  const handleSaveLine = async (lineId: string) => {
    await updateNarrationLine(lineId, drafts[lineId] ?? {});
  };

  const handleQueueVoiceJobs = async () => {
    if (!selectedScript) return;
    await queueVoiceJobs(selectedScript.id, {
      mode: voiceMode,
      provider: 'google_ai_studio',
      voiceStyle: voiceStyle || null,
    });
  };

  return (
    <div className="studio-voice-grid">
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
                  <option value="line_by_line">Line by line</option>
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
                Queue Voice Jobs
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
                    value={String(drafts[line.id]?.text ?? '')}
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
                      value={String(drafts[line.id]?.voiceStyle ?? '')}
                      onChange={event => setDrafts(current => ({
                        ...current,
                        [line.id]: { ...current[line.id], voiceStyle: event.target.value || null },
                      }))}
                    />
                  </label>
                  <label>
                    Emotion
                    <input
                      value={String(drafts[line.id]?.emotion ?? '')}
                      onChange={event => setDrafts(current => ({
                        ...current,
                        [line.id]: { ...current[line.id], emotion: event.target.value || null },
                      }))}
                    />
                  </label>
                  <label>
                    Speed
                    <input
                      value={String(drafts[line.id]?.speed ?? '')}
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
                      value={drafts[line.id]?.pauseAfterSeconds ?? ''}
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
                  <button className="btn-secondary" onClick={() => void regenerateNarrationLine(line.id)} disabled={isSaving}>
                    Regenerate Later
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
