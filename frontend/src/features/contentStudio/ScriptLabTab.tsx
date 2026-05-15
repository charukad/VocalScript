import { useEffect, useState } from 'react';
import { useContentStudioStore } from './contentStudioStore';
import type { ScriptInput, ScriptVersionInput } from './types';

type ScriptLabTabProps = {
  profileId: string;
};

export const ScriptLabTab = ({ profileId }: ScriptLabTabProps) => {
  const {
    scripts,
    selectedScriptId,
    selectedScript,
    isSaving,
    createScript,
    selectScript,
    updateScript,
    addVersion,
    splitLines,
  } = useContentStudioStore();
  const [newScript, setNewScript] = useState<ScriptInput>({ title: '', content: '' });
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [versionDraft, setVersionDraft] = useState<ScriptVersionInput>({
    label: '',
    content: '',
    selectAsFinal: false,
  });

  useEffect(() => {
    setDraftTitle(selectedScript?.title ?? '');
    setDraftContent(selectedScript?.content ?? '');
  }, [selectedScript]);

  const handleCreateScript = async () => {
    if (!newScript.title.trim()) return;
    await createScript(profileId, newScript);
    setNewScript({ title: '', content: '' });
  };

  const handleSaveScript = async () => {
    if (!selectedScript) return;
    await updateScript(selectedScript.id, { title: draftTitle, content: draftContent });
  };

  const handleCreateVersion = async () => {
    if (!selectedScript || !versionDraft.content.trim()) return;
    await addVersion(selectedScript.id, {
      label: versionDraft.label || `Version ${selectedScript.versions.length + 1}`,
      content: versionDraft.content,
      selectAsFinal: versionDraft.selectAsFinal,
    });
    setVersionDraft({ label: '', content: '', selectAsFinal: false });
  };

  return (
    <div className="studio-script-grid">
      <section className="studio-panel studio-script-list">
        <header>
          <h2>Scripts</h2>
          <span>{scripts.length}</span>
        </header>
        <label>
          Title
          <input
            value={newScript.title}
            onChange={event => setNewScript(current => ({ ...current, title: event.target.value }))}
            placeholder="AI facts short"
          />
        </label>
        <label>
          Draft
          <textarea
            rows={5}
            value={newScript.content ?? ''}
            onChange={event => setNewScript(current => ({ ...current, content: event.target.value }))}
          />
        </label>
        <button className="btn-primary" onClick={() => void handleCreateScript()} disabled={isSaving || !newScript.title.trim()}>
          Save Script
        </button>
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

      <section className="studio-panel studio-script-editor">
        {!selectedScript && <div className="studio-empty">Create or select a script to begin.</div>}
        {selectedScript && (
          <>
            <header>
              <h2>Script Lab</h2>
              <span>{selectedScript.versions.length} versions</span>
            </header>
            <label>
              Title
              <input value={draftTitle} onChange={event => setDraftTitle(event.target.value)} />
            </label>
            <label>
              Main Draft
              <textarea rows={10} value={draftContent} onChange={event => setDraftContent(event.target.value)} />
            </label>
            <div className="studio-inline-actions">
              <button className="btn-secondary" onClick={() => void handleSaveScript()} disabled={isSaving}>
                Save Draft
              </button>
              <button className="btn-secondary" onClick={() => void splitLines(selectedScript.id)} disabled={isSaving}>
                Split Into Lines
              </button>
            </div>

            <div className="studio-subsection">
              <h3>New Version</h3>
              <label>
                Label
                <input
                  value={versionDraft.label}
                  onChange={event => setVersionDraft(current => ({ ...current, label: event.target.value }))}
                  placeholder="Punchier rewrite"
                />
              </label>
              <label>
                Content
                <textarea
                  rows={5}
                  value={versionDraft.content}
                  onChange={event => setVersionDraft(current => ({ ...current, content: event.target.value }))}
                />
              </label>
              <label className="studio-checkbox-row">
                <input
                  type="checkbox"
                  checked={versionDraft.selectAsFinal ?? false}
                  onChange={event => setVersionDraft(current => ({ ...current, selectAsFinal: event.target.checked }))}
                />
                Select as final
              </label>
              <button className="btn-primary" onClick={() => void handleCreateVersion()} disabled={isSaving || !versionDraft.content.trim()}>
                Save Version
              </button>
            </div>

            <div className="studio-subsection">
              <h3>Versions</h3>
              {selectedScript.versions.length === 0 && <div className="studio-empty">No versions yet.</div>}
              {selectedScript.versions.map(version => (
                <article className="studio-version-item" key={version.id}>
                  <div>
                    <strong>{version.label}</strong>
                    {version.id === selectedScript.finalVersionId && <span>Final</span>}
                  </div>
                  <p>{version.content}</p>
                  {version.id !== selectedScript.finalVersionId && (
                    <button
                      className="btn-secondary"
                      onClick={() => void updateScript(selectedScript.id, { finalVersionId: version.id, status: 'final' })}
                    >
                      Use As Final
                    </button>
                  )}
                </article>
              ))}
            </div>

            <div className="studio-subsection">
              <h3>Narration Lines</h3>
              {selectedScript.narrationLines.length === 0 && <div className="studio-empty">No narration lines yet.</div>}
              {selectedScript.narrationLines.map(line => (
                <article className="studio-line-item" key={line.id}>
                  <span>{line.index + 1}</span>
                  <p>{line.text}</p>
                  <em>{line.status}</em>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
};
