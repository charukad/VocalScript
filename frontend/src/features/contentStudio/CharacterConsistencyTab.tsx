import { useEffect, useMemo, useState } from 'react';
import {
  archiveCharacter,
  createCharacter,
  getCharacterPromptPack,
  listCharacters,
  updateCharacter,
} from './api';
import type {
  CharacterProfile,
  CharacterProfileInput,
  CharacterProfileStatus,
  CharacterPromptPack,
} from './types';

type CharacterConsistencyTabProps = {
  profileId: string;
};

const parseList = (value: string): string[] => value
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

export const CharacterConsistencyTab = ({ profileId }: CharacterConsistencyTabProps) => {
  const [characters, setCharacters] = useState<CharacterProfile[]>([]);
  const [promptPacks, setPromptPacks] = useState<Record<string, CharacterPromptPack>>({});
  const [draft, setDraft] = useState<CharacterProfileInput>({
    name: '',
    role: '',
    description: '',
    visualTraits: [],
    wardrobe: [],
    voiceNotes: '',
    promptAnchor: '',
    negativePrompt: '',
  });
  const [visualTraitsInput, setVisualTraitsInput] = useState('');
  const [wardrobeInput, setWardrobeInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visibleCharacters = useMemo(
    () => characters.filter(character => character.status !== 'archived'),
    [characters],
  );

  useEffect(() => {
    let ignore = false;
    const loadCharacters = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await listCharacters(profileId);
        if (!ignore) setCharacters(response.characters);
      } catch (error) {
        if (!ignore) setError(error instanceof Error ? error.message : 'Could not load characters');
      } finally {
        if (!ignore) setIsLoading(false);
      }
    };
    void loadCharacters();
    return () => { ignore = true; };
  }, [profileId]);

  const handleCreate = async () => {
    if (!draft.name.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const created = await createCharacter(profileId, {
        ...draft,
        visualTraits: parseList(visualTraitsInput),
        wardrobe: parseList(wardrobeInput),
      });
      setCharacters(current => [created, ...current]);
      setDraft({
        name: '',
        role: '',
        description: '',
        visualTraits: [],
        wardrobe: [],
        voiceNotes: '',
        promptAnchor: '',
        negativePrompt: '',
      });
      setVisualTraitsInput('');
      setWardrobeInput('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not create character');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (characterId: string, input: Partial<CharacterProfileInput>) => {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateCharacter(characterId, input);
      setCharacters(current => current.map(character => character.id === updated.id ? updated : character));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not update character');
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async (characterId: string) => {
    setIsSaving(true);
    setError(null);
    try {
      await archiveCharacter(characterId);
      setCharacters(current => current.filter(character => character.id !== characterId));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not archive character');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePromptPack = async (characterId: string) => {
    setError(null);
    try {
      const pack = await getCharacterPromptPack(characterId);
      setPromptPacks(current => ({ ...current, [characterId]: pack }));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not load prompt pack');
    }
  };

  return (
    <div className="studio-split">
      <section className="studio-panel">
        <header>
          <h2>Create Character</h2>
        </header>
        {error && <div className="content-profile-error">{error}</div>}
        <label>
          Name
          <input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} />
        </label>
        <label>
          Role
          <input value={draft.role ?? ''} onChange={event => setDraft(current => ({ ...current, role: event.target.value }))} />
        </label>
        <label>
          Description
          <textarea rows={3} value={draft.description ?? ''} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} />
        </label>
        <label>
          Visual traits
          <input value={visualTraitsInput} onChange={event => setVisualTraitsInput(event.target.value)} placeholder="silver bob haircut, round glasses" />
        </label>
        <label>
          Wardrobe
          <input value={wardrobeInput} onChange={event => setWardrobeInput(event.target.value)} placeholder="yellow jacket, white sneakers" />
        </label>
        <label>
          Prompt anchor
          <textarea rows={2} value={draft.promptAnchor ?? ''} onChange={event => setDraft(current => ({ ...current, promptAnchor: event.target.value }))} />
        </label>
        <label>
          Negative prompt
          <textarea rows={2} value={draft.negativePrompt ?? ''} onChange={event => setDraft(current => ({ ...current, negativePrompt: event.target.value }))} />
        </label>
        <button className="btn-primary" onClick={() => void handleCreate()} disabled={isSaving || !draft.name.trim()}>
          Save Character
        </button>
      </section>

      <section className="studio-panel studio-collection">
        <header>
          <h2>Character Library</h2>
          <span>{visibleCharacters.length}</span>
        </header>
        {isLoading && <div className="studio-empty">Loading characters...</div>}
        {!isLoading && visibleCharacters.length === 0 && <div className="studio-empty">No reusable characters yet.</div>}
        {visibleCharacters.map(character => (
          <article className="studio-version-item" key={character.id}>
            <div>
              <strong>{character.name}</strong>
              <span>{character.role || 'character'}</span>
            </div>
            <p>{character.description || 'No description yet.'}</p>
            <p>{[...character.visualTraits, ...character.wardrobe].join(' · ') || 'No visual anchors yet.'}</p>
            <div className="studio-inline-actions">
              <select
                value={character.status}
                onChange={event => void handleUpdate(character.id, { status: event.target.value as CharacterProfileStatus })}
              >
                <option value="active">active</option>
                <option value="archived">archived</option>
              </select>
              <button className="btn-secondary" onClick={() => void handlePromptPack(character.id)}>
                Prompt Pack
              </button>
              <button className="btn-secondary danger" onClick={() => void handleArchive(character.id)}>
                Archive
              </button>
            </div>
            {promptPacks[character.id] && (
              <div className="studio-subsection">
                <h3>Prompt Pack</h3>
                <p>{promptPacks[character.id].prompt}</p>
                {promptPacks[character.id].negativePrompt && <p>Negative: {promptPacks[character.id].negativePrompt}</p>}
                {promptPacks[character.id].notes.map(note => <p key={note}>{note}</p>)}
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
};
