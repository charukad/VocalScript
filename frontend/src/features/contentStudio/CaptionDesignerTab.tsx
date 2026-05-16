import { useEffect, useMemo, useState } from 'react';
import { useContentProfileStore } from '../contentProfiles/contentProfileStore';
import { useEditorStore } from '../../store/editorStore';
import { generateCaptionDesigns, updateBrandKit } from './api';
import { useContentStudioStore } from './contentStudioStore';
import type { CaptionDesignPreset, PlatformTarget } from '../../types';
import type { CaptionDesignInput } from './types';

type CaptionDesignerTabProps = {
  profileId: string;
};

const firstSentence = (value: string): string => {
  const match = value.trim().match(/^.*?[.!?](?:\s|$)/);
  return (match?.[0] ?? value.trim()).trim();
};

export const CaptionDesignerTab = ({ profileId }: CaptionDesignerTabProps) => {
  const { profiles } = useContentProfileStore();
  const profile = profiles.find(item => item.id === profileId) ?? null;
  const { selectedScript } = useContentStudioStore();
  const { applyCaptionDesignToCaptionClips } = useEditorStore();
  const [sampleText, setSampleText] = useState('');
  const [platform, setPlatform] = useState<PlatformTarget | ''>('');
  const [emphasis, setEmphasis] = useState<NonNullable<CaptionDesignInput['emphasis']>>('balanced');
  const [designs, setDesigns] = useState<CaptionDesignPreset[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSampleText(firstSentence(selectedScript?.content ?? '') || 'Most creators miss the third signal in this chart.');
    setPlatform(profile?.platforms[0] ?? '');
    setDesigns([]);
    setSelectedName(null);
    setNotice(null);
    setError(null);
  }, [profile, selectedScript?.id]);

  const selectedDesign = useMemo(
    () => designs.find(design => design.name === selectedName) ?? designs[0] ?? null,
    [designs, selectedName],
  );

  const handleGenerate = async () => {
    if (!sampleText.trim()) return;
    setIsGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const response = await generateCaptionDesigns(profileId, {
        sampleText,
        platform: platform || null,
        emphasis,
      });
      setDesigns(response.designs);
      setSelectedName(response.designs[0]?.name ?? null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not generate caption designs');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApply = () => {
    if (!selectedDesign) return;
    const count = applyCaptionDesignToCaptionClips(selectedDesign);
    setNotice(
      count > 0
        ? `Applied ${selectedDesign.name} to ${count} caption clip${count === 1 ? '' : 's'}.`
        : 'No caption clips exist in the editor yet.',
    );
  };

  const handleSavePreset = async () => {
    if (!selectedDesign) return;
    setIsSaving(true);
    setError(null);
    try {
      await updateBrandKit(profileId, { captionPreset: selectedDesign.name });
      setNotice(`Saved ${selectedDesign.name} as the brand caption preset.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save caption preset');
    } finally {
      setIsSaving(false);
    }
  };

  if (!profile) {
    return <div className="studio-empty studio-empty-large">Profile details are still loading.</div>;
  }

  return (
    <div className="studio-split">
      <section className="studio-panel">
        <header>
          <h2>Caption Brief</h2>
        </header>
        {error && <div className="content-profile-error">{error}</div>}
        <label>
          Sample text
          <textarea rows={4} value={sampleText} onChange={event => setSampleText(event.target.value)} />
        </label>
        <label>
          Platform
          <select value={platform} onChange={event => setPlatform(event.target.value as PlatformTarget)}>
            {profile.platforms.map(option => (
              <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </label>
        <label>
          Emphasis
          <select value={emphasis} onChange={event => setEmphasis(event.target.value as typeof emphasis)}>
            <option value="balanced">Balanced</option>
            <option value="bold">Bold</option>
            <option value="minimal">Minimal</option>
          </select>
        </label>
        <button className="btn-primary" onClick={() => void handleGenerate()} disabled={isGenerating || !sampleText.trim()}>
          {isGenerating ? 'Working...' : 'Generate Designs'}
        </button>
        {notice && <div className="studio-empty">{notice}</div>}
      </section>

      <section className="studio-panel studio-collection">
        <header>
          <h2>Design Options</h2>
          <span>{designs.length}</span>
        </header>
        {designs.length === 0 && <div className="studio-empty">Generate branded caption presets from the brief.</div>}
        {designs.map(design => (
          <article className="studio-version-item" key={design.name}>
            <div>
              <strong>{design.name}</strong>
              <span>{design.estimatedReadabilityScore}</span>
            </div>
            <button
              className={design.name === selectedDesign?.name ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setSelectedName(design.name)}
            >
              {design.name === selectedDesign?.name ? 'Selected' : 'Select'}
            </button>
            <div
              className="studio-caption-preview"
              style={{
                fontFamily: design.fontFamily,
                color: design.color,
                fontSize: `${design.fontSize}px`,
                fontWeight: design.bold ? 700 : 400,
                textAlign: design.align,
                backgroundColor: design.bgColor,
                opacity: 1,
              }}
            >
              {design.previewLines.map(line => (
                <span
                  key={line}
                  style={{ backgroundColor: `${design.bgColor}`, opacity: design.bgOpacity }}
                >
                  {line}
                </span>
              ))}
            </div>
            <p>{design.rationale}</p>
            <p>{design.notes.join(' ')}</p>
          </article>
        ))}
        {selectedDesign && (
          <div className="studio-inline-actions">
            <button className="btn-secondary" onClick={handleApply}>Apply to Caption Clips</button>
            <button className="btn-secondary" onClick={() => void handleSavePreset()} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save to Brand Kit'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
