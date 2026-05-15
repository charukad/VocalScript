import { useEffect, useMemo, useState } from 'react';
import { useContentStudioStore } from './contentStudioStore';
import type { NarrationLineInput, NarrationLineUpdateInput } from './types';

type VoiceTabProps = {
  profileId: string;
};

export const VoiceTab = ({ profileId: _profileId }: VoiceTabProps) => {
  const {
    scripts,
    selectedScriptId,
    selectedScript,
    isSaving,
    selectScript,
    splitLines,
    addNarrationLine,
    updateNarrationLine,
    regenerateNarrationLine,
  } = useContentStudioStore();
  const [newLineText, setNewLineText] = useState('');
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
