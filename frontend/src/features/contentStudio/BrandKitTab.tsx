import { useEffect, useState } from 'react';
import { getBrandKit, updateBrandKit } from './api';
import type { BrandKit, BrandKitInput } from './types';

type BrandKitTabProps = {
  profileId: string;
};

const toText = (values: string[]): string => values.join(', ');
const fromText = (value: string): string[] => value
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

export const BrandKitTab = ({ profileId }: BrandKitTabProps) => {
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [draft, setDraft] = useState<BrandKitInput>({});
  const [paletteText, setPaletteText] = useState('');
  const [fontsText, setFontsText] = useState('');
  const [toneText, setToneText] = useState('');
  const [avoidText, setAvoidText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const loadBrandKit = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getBrandKit(profileId);
        if (ignore) return;
        setBrandKit(result);
        setDraft({
          logoPath: result.logoPath,
          captionPreset: result.captionPreset,
          thumbnailStyle: result.thumbnailStyle,
          defaultCta: result.defaultCta,
          musicStyle: result.musicStyle,
        });
        setPaletteText(toText(result.colorPalette));
        setFontsText(toText(result.fontFamilies));
        setToneText(toText(result.toneKeywords));
        setAvoidText(toText(result.avoidKeywords));
      } catch (error) {
        if (!ignore) setError(error instanceof Error ? error.message : 'Could not load brand kit');
      } finally {
        if (!ignore) setIsLoading(false);
      }
    };
    void loadBrandKit();
    return () => { ignore = true; };
  }, [profileId]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateBrandKit(profileId, {
        ...draft,
        logoPath: draft.logoPath?.trim() || null,
        colorPalette: fromText(paletteText),
        fontFamilies: fromText(fontsText),
        toneKeywords: fromText(toneText),
        avoidKeywords: fromText(avoidText),
      });
      setBrandKit(updated);
      setPaletteText(toText(updated.colorPalette));
      setFontsText(toText(updated.fontFamilies));
      setToneText(toText(updated.toneKeywords));
      setAvoidText(toText(updated.avoidKeywords));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save brand kit');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading && !brandKit) {
    return <div className="studio-empty studio-empty-large">Loading brand kit...</div>;
  }

  return (
    <div className="studio-split">
      <section className="studio-panel">
        <header>
          <h2>Brand Kit</h2>
        </header>
        {error && <div className="content-profile-error">{error}</div>}
        <label>
          Logo path
          <input
            value={draft.logoPath ?? ''}
            onChange={event => setDraft(current => ({ ...current, logoPath: event.target.value }))}
          />
        </label>
        <label>
          Color palette
          <input
            value={paletteText}
            onChange={event => setPaletteText(event.target.value)}
            placeholder="#111111, #22cc88"
          />
        </label>
        <label>
          Font families
          <input
            value={fontsText}
            onChange={event => setFontsText(event.target.value)}
            placeholder="Inter, Space Grotesk"
          />
        </label>
        <label>
          Tone keywords
          <input
            value={toneText}
            onChange={event => setToneText(event.target.value)}
            placeholder="fast, curious, simple"
          />
        </label>
        <label>
          Avoid keywords
          <input
            value={avoidText}
            onChange={event => setAvoidText(event.target.value)}
            placeholder="slow, corporate"
          />
        </label>
        <button className="btn-primary" onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Brand Kit'}
        </button>
      </section>

      <section className="studio-panel">
        <header>
          <h2>Creative Defaults</h2>
        </header>
        <label>
          Caption preset
          <input
            value={draft.captionPreset ?? ''}
            onChange={event => setDraft(current => ({ ...current, captionPreset: event.target.value }))}
          />
        </label>
        <label>
          Thumbnail style
          <textarea
            rows={3}
            value={draft.thumbnailStyle ?? ''}
            onChange={event => setDraft(current => ({ ...current, thumbnailStyle: event.target.value }))}
          />
        </label>
        <label>
          Default CTA
          <input
            value={draft.defaultCta ?? ''}
            onChange={event => setDraft(current => ({ ...current, defaultCta: event.target.value }))}
          />
        </label>
        <label>
          Music style
          <input
            value={draft.musicStyle ?? ''}
            onChange={event => setDraft(current => ({ ...current, musicStyle: event.target.value }))}
          />
        </label>
      </section>
    </div>
  );
};
