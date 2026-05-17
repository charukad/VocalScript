import { useEffect, useMemo, useState } from 'react';
import { BookmarkPlus, Captions, LayoutTemplate } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';
import type { CaptionDesignPreset, ExportSettings, PlatformTarget } from '../../types';

type SavedTemplate = {
  id: string;
  name: string;
  targetPlatform: PlatformTarget | null;
  exportSettings: ExportSettings;
};

const TEMPLATE_STORAGE_KEY = 'neuralscribe.editor.templates';

const builtInTemplates: Array<{
  id: string;
  name: string;
  description: string;
  targetPlatform: PlatformTarget | null;
  settings: Partial<ExportSettings>;
}> = [
  {
    id: 'vertical-short',
    name: 'Vertical Short',
    description: '9:16 short-form export tuned for Shorts, Reels, and TikTok.',
    targetPlatform: 'youtube_shorts',
    settings: { resolution: '1080p', aspectRatio: '9:16', fps: 30, bitrateMbps: 16, container: 'mp4' },
  },
  {
    id: 'cinematic-youtube',
    name: 'YouTube Longform',
    description: '16:9 landscape export with a little more bitrate headroom.',
    targetPlatform: 'youtube',
    settings: { resolution: '2k', aspectRatio: '16:9', fps: 30, bitrateMbps: 24, container: 'mp4' },
  },
  {
    id: 'square-social',
    name: 'Square Social',
    description: '1:1 feed-friendly framing for repurposed clips.',
    targetPlatform: null,
    settings: { resolution: '1080p', aspectRatio: '1:1', fps: 30, bitrateMbps: 14, container: 'mp4' },
  },
];

const captionStylePacks: CaptionDesignPreset[] = [
  {
    name: 'Clean Subtitle',
    rationale: 'Readable neutral captions for explainers and tutorials.',
    fontFamily: 'Inter, sans-serif',
    fontSize: 42,
    color: '#ffffff',
    accentColor: '#f7d26a',
    bgColor: '#000000',
    bgOpacity: 0.42,
    bold: true,
    align: 'center',
    x: 50,
    y: 84,
    maxCharsPerLine: 28,
    previewLines: ['Clean subtitle pack'],
    estimatedReadabilityScore: 92,
    notes: [],
  },
  {
    name: 'Bold Hook',
    rationale: 'Large center-weighted captions for fast short-form openings.',
    fontFamily: 'Inter, sans-serif',
    fontSize: 50,
    color: '#ffffff',
    accentColor: '#7fe4c3',
    bgColor: '#111111',
    bgOpacity: 0.28,
    bold: true,
    align: 'center',
    x: 50,
    y: 78,
    maxCharsPerLine: 20,
    previewLines: ['Bold hook pack'],
    estimatedReadabilityScore: 88,
    notes: [],
  },
  {
    name: 'Minimal Lower Third',
    rationale: 'Quiet captions for product and documentary edits.',
    fontFamily: 'Inter, sans-serif',
    fontSize: 36,
    color: '#ffffff',
    accentColor: '#8ab4ff',
    bgColor: '#000000',
    bgOpacity: 0.18,
    bold: false,
    align: 'left',
    x: 14,
    y: 88,
    maxCharsPerLine: 34,
    previewLines: ['Minimal lower third'],
    estimatedReadabilityScore: 86,
    notes: [],
  },
];

const loadSavedTemplates = (): SavedTemplate[] => {
  try {
    const raw = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as SavedTemplate[] : [];
  } catch {
    return [];
  }
};

export const TemplatesPanel = () => {
  const {
    clips,
    exportSettings,
    projectTargetPlatform,
    setExportSettings,
    setProjectTargetPlatform,
    applyCaptionDesignToCaptionClips,
  } = useEditorStore();
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>(() => loadSavedTemplates());
  const [templateName, setTemplateName] = useState('');

  useEffect(() => {
    window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(savedTemplates));
  }, [savedTemplates]);

  const activeCaptionCount = useMemo(
    () => clips.filter(clip => clip.type === 'text' && clip.assetId.includes('caption')).length,
    [clips],
  );

  const saveCurrentTemplate = () => {
    const name = templateName.trim();
    if (!name) return;
    setSavedTemplates(current => [{
      id: crypto.randomUUID(),
      name,
      targetPlatform: projectTargetPlatform,
      exportSettings,
    }, ...current]);
    setTemplateName('');
  };

  return (
    <section className="panel workspace-tool-panel template-panel">
      <div className="panel-header">Templates</div>
      <div className="panel-content workflow-panel-content">
        <section className="workflow-section">
          <div className="workflow-section-title">
            <LayoutTemplate size={15} />
            Built-in
          </div>
          {builtInTemplates.map(template => (
            <button
              key={template.id}
              className="workflow-card"
              onClick={() => {
                setExportSettings(template.settings);
                setProjectTargetPlatform(template.targetPlatform);
              }}
            >
              <strong>{template.name}</strong>
              <span>{template.description}</span>
            </button>
          ))}
        </section>

        <section className="workflow-section">
          <div className="workflow-section-title">
            <Captions size={15} />
            Style Packs
          </div>
          {captionStylePacks.map(style => (
            <button
              key={style.name}
              className="workflow-card"
              onClick={() => applyCaptionDesignToCaptionClips(style)}
            >
              <strong>{style.name}</strong>
              <span>{style.rationale}</span>
            </button>
          ))}
          <p className="workflow-hint">{activeCaptionCount} caption clip{activeCaptionCount === 1 ? '' : 's'} currently ready for style packs.</p>
        </section>

        <section className="workflow-section">
          <div className="workflow-section-title">
            <BookmarkPlus size={15} />
            My Templates
          </div>
          <div className="workflow-inline">
            <input
              value={templateName}
              onChange={event => setTemplateName(event.target.value)}
              placeholder="Template name"
            />
            <button className="btn-secondary" onClick={saveCurrentTemplate}>Save</button>
          </div>
          {savedTemplates.length === 0 && <p className="workflow-hint">Save the current export setup for reuse.</p>}
          {savedTemplates.map(template => (
            <div className="workflow-row" key={template.id}>
              <button
                className="workflow-card compact"
                onClick={() => {
                  setExportSettings(template.exportSettings);
                  setProjectTargetPlatform(template.targetPlatform);
                }}
              >
                <strong>{template.name}</strong>
                <span>{template.exportSettings.aspectRatio} · {template.exportSettings.resolution}</span>
              </button>
              <button
                className="btn-icon"
                title="Delete template"
                onClick={() => setSavedTemplates(current => current.filter(candidate => candidate.id !== template.id))}
              >
                x
              </button>
            </div>
          ))}
        </section>
      </div>
    </section>
  );
};
