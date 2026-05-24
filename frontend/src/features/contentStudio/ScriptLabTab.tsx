import { useState } from 'react';
import { analyzeScript, rewriteScriptForVirality } from './api';
import { useContentStudioStore } from './contentStudioStore';
import type { ScriptAnalysis, ScriptDetail, ScriptInput, ScriptRewrite, ScriptVersionInput } from './types';

type ScriptLabTabProps = {
  profileId: string;
};

type ScriptEditorPanelProps = {
  selectedScript: ScriptDetail;
  isSaving: boolean;
  updateScript: (scriptId: string, input: Partial<ScriptInput>) => Promise<ScriptDetail>;
  addVersion: (scriptId: string, input: ScriptVersionInput) => Promise<ScriptDetail>;
  splitLines: (scriptId: string) => Promise<ScriptDetail>;
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

  const handleCreateScript = async () => {
    if (!newScript.title.trim()) return;
    await createScript(profileId, newScript);
    setNewScript({ title: '', content: '' });
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
          <ScriptEditorPanel
            key={selectedScript.id}
            selectedScript={selectedScript}
            isSaving={isSaving}
            updateScript={updateScript}
            addVersion={addVersion}
            splitLines={splitLines}
          />
        )}
      </section>
    </div>
  );
};

const ScriptEditorPanel = ({
  selectedScript,
  isSaving,
  updateScript,
  addVersion,
  splitLines,
}: ScriptEditorPanelProps) => {
  const [draftTitle, setDraftTitle] = useState(selectedScript.title);
  const [draftContent, setDraftContent] = useState(selectedScript.content);
  const [analysis, setAnalysis] = useState<ScriptAnalysis | null>(selectedScript.latestAnalysis ?? null);
  const [rewrite, setRewrite] = useState<ScriptRewrite | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [versionDraft, setVersionDraft] = useState<ScriptVersionInput>({
    label: '',
    content: '',
    selectAsFinal: false,
  });

  const handleSaveScript = async () => {
    await updateScript(selectedScript.id, { title: draftTitle, content: draftContent });
  };

  const handleCreateVersion = async () => {
    if (!versionDraft.content.trim()) return;
    await addVersion(selectedScript.id, {
      label: versionDraft.label || `Version ${selectedScript.versions.length + 1}`,
      content: versionDraft.content,
      selectAsFinal: versionDraft.selectAsFinal,
    });
    setVersionDraft({ label: '', content: '', selectAsFinal: false });
  };

  const handleAnalyze = async () => {
    if (!draftContent.trim()) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const nextAnalysis = await analyzeScript(draftContent);
      setAnalysis(nextAnalysis);
      await updateScript(selectedScript.id, { latestAnalysis: nextAnalysis });
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Could not analyze script');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRewrite = async () => {
    if (!draftContent.trim()) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const nextRewrite = await rewriteScriptForVirality(draftContent);
      setRewrite(nextRewrite);
      setAnalysis(nextRewrite.analysis);
      await updateScript(selectedScript.id, { latestAnalysis: nextRewrite.analysis });
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Could not rewrite script');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveRewrite = async () => {
    if (!rewrite) return;
    await addVersion(selectedScript.id, {
      label: 'Viral rewrite',
      content: rewrite.rewrittenScript,
      selectAsFinal: false,
    });
  };

  return (
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
        <button className="btn-secondary" onClick={() => void handleAnalyze()} disabled={isAnalyzing || !draftContent.trim()}>
          {isAnalyzing ? 'Working...' : 'Analyze'}
        </button>
        <button className="btn-secondary" onClick={() => void handleRewrite()} disabled={isAnalyzing || !draftContent.trim()}>
          Rewrite
        </button>
      </div>

      {analysisError && <div className="content-profile-error">{analysisError}</div>}

      {analysis && (
        <div className="studio-subsection">
          <h3>Estimated Viral Potential</h3>
          <div className="studio-score-grid">
            <strong>{analysis.estimatedViralPotential.total}</strong>
            <span>Hook {analysis.estimatedViralPotential.hook}</span>
            <span>Retention {analysis.estimatedViralPotential.retention}</span>
            <span>Clarity {analysis.estimatedViralPotential.clarity}</span>
            <span>Emotion {analysis.estimatedViralPotential.emotion}</span>
            <span>Shareability {analysis.estimatedViralPotential.shareability}</span>
          </div>
          <div className="studio-analysis-meta">
            <span>{analysis.estimatedDurationSeconds}s est.</span>
            <span>{analysis.hookStrength} hook</span>
            <span>{analysis.retentionRisk} retention risk</span>
            <span>{analysis.usedLlmMode}</span>
          </div>
          <ul className="studio-note-list">
            {analysis.improvements.map(item => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}

      {rewrite && (
        <div className="studio-subsection">
          <h3>Rewrite Candidate</h3>
          <textarea rows={6} value={rewrite.rewrittenScript} readOnly />
          <button className="btn-primary" onClick={() => void handleSaveRewrite()} disabled={isSaving}>
            Save As Version
          </button>
        </div>
      )}

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
  );
};
