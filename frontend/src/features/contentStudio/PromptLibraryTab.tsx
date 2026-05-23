import { useEffect, useMemo, useState } from 'react';
import {
  archivePromptTemplate,
  createPromptTemplate,
  listPromptTemplates,
  updatePromptTemplate,
} from './api';
import type { PromptTemplate, PromptTemplateInput } from './types';

type PromptLibraryTabProps = {
  profileId: string;
};

const toText = (values: string[]): string => values.join(', ');
const fromText = (value: string): string[] => value
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

const emptyDraft: PromptTemplateInput = {
  name: '',
  useCase: 'custom',
  promptText: '',
  variables: [],
  notes: '',
  status: 'active',
};

export const PromptLibraryTab = ({ profileId }: PromptLibraryTabProps) => {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [draft, setDraft] = useState<PromptTemplateInput>(emptyDraft);
  const [variablesText, setVariablesText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visibleTemplates = useMemo(
    () => templates.filter(template => template.status !== 'archived'),
    [templates],
  );

  useEffect(() => {
    let ignore = false;
    const loadPromptTemplates = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await listPromptTemplates(profileId);
        if (!ignore) setTemplates(response.templates);
      } catch (error) {
        if (!ignore) setError(error instanceof Error ? error.message : 'Could not load prompt templates');
      } finally {
        if (!ignore) setIsLoading(false);
      }
    };
    void loadPromptTemplates();
    return () => { ignore = true; };
  }, [profileId]);

  const handleCreate = async () => {
    if (!draft.name.trim() || !draft.promptText.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const created = await createPromptTemplate(profileId, {
        ...draft,
        variables: fromText(variablesText),
      });
      setTemplates(current => [created, ...current]);
      setDraft(emptyDraft);
      setVariablesText('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save prompt template');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (templateId: string, input: Partial<PromptTemplateInput>) => {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updatePromptTemplate(templateId, input);
      setTemplates(current => current.map(template => template.id === updated.id ? updated : template));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not update prompt template');
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async (templateId: string) => {
    setIsSaving(true);
    setError(null);
    try {
      await archivePromptTemplate(templateId);
      setTemplates(current => current.filter(template => template.id !== templateId));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not archive prompt template');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="studio-split">
      <section className="studio-panel">
        <header>
          <h2>Prompt Library</h2>
        </header>
        {error && <div className="content-profile-error">{error}</div>}
        <label>
          Name
          <input
            value={draft.name}
            onChange={event => setDraft(current => ({ ...current, name: event.target.value }))}
          />
        </label>
        <label>
          Use case
          <input
            value={draft.useCase ?? ''}
            onChange={event => setDraft(current => ({ ...current, useCase: event.target.value }))}
            placeholder="script_rewrite"
          />
        </label>
        <label>
          Variables
          <input
            value={variablesText}
            onChange={event => setVariablesText(event.target.value)}
            placeholder="script, platform, audience"
          />
        </label>
        <label>
          Prompt
          <textarea
            rows={7}
            value={draft.promptText}
            onChange={event => setDraft(current => ({ ...current, promptText: event.target.value }))}
            placeholder="Rewrite {{script}} for {{platform}}..."
          />
        </label>
        <label>
          Notes
          <textarea
            rows={3}
            value={draft.notes ?? ''}
            onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))}
          />
        </label>
        <button
          className="btn-primary"
          onClick={() => void handleCreate()}
          disabled={isSaving || !draft.name.trim() || !draft.promptText.trim()}
        >
          Save Prompt
        </button>
      </section>

      <section className="studio-panel studio-collection">
        <header>
          <h2>Saved Templates</h2>
          <span>{visibleTemplates.length}</span>
        </header>
        {isLoading && <div className="studio-empty">Loading prompt templates...</div>}
        {!isLoading && visibleTemplates.length === 0 && <div className="studio-empty">No saved prompts yet.</div>}
        {visibleTemplates.map(template => (
          <article className="studio-list-item" key={template.id}>
            <div>
              <strong>{template.name}</strong>
              <p>{template.useCase}</p>
            </div>
            <textarea
              rows={5}
              value={template.promptText}
              onChange={event => void handleUpdate(template.id, { promptText: event.target.value })}
            />
            <input
              value={toText(template.variables)}
              onChange={event => void handleUpdate(template.id, { variables: fromText(event.target.value) })}
              aria-label={`${template.name} variables`}
            />
            <textarea
              rows={2}
              value={template.notes}
              onChange={event => void handleUpdate(template.id, { notes: event.target.value })}
            />
            <div className="studio-inline-actions">
              <button className="btn-secondary danger" onClick={() => void handleArchive(template.id)}>
                Archive
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
};
