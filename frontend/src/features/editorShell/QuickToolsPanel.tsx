import { Captions, Sparkles, Type } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';
import type { EditorToolId } from './types';
import { StatusState } from '../../components/ui/StatusState';

type QuickToolsPanelProps = {
  activeTool: Exclude<EditorToolId, 'media' | 'ai' | 'templates' | 'workflow'>;
};

const transitionTypes = [
  { id: 'fade' as const, label: 'Fade' },
  { id: 'crossfade' as const, label: 'Crossfade' },
  { id: 'slide_left' as const, label: 'Slide Left' },
  { id: 'slide_right' as const, label: 'Slide Right' },
  { id: 'wipe' as const, label: 'Wipe' },
];

export const QuickToolsPanel = ({ activeTool }: QuickToolsPanelProps) => {
  const {
    clips,
    tracks,
    playheadTime,
    selectedClipId,
    addTrack,
    addTextClip,
    addCaptionClip,
    updateClipEffects,
    updateClipTransition,
  } = useEditorStore();
  const selectedClip = clips.find(clip => clip.id === selectedClipId);

  const ensureTextTrack = () => {
    let textTrack = useEditorStore.getState().tracks.find(track => track.type === 'text');
    if (!textTrack) {
      addTrack('text');
      textTrack = useEditorStore.getState().tracks.find(track => track.type === 'text');
    }
    return textTrack;
  };

  if (activeTool === 'text' || activeTool === 'captions') {
    return (
      <section className="panel workspace-tool-panel quick-tools-panel">
        <div className="panel-header">{activeTool === 'text' ? 'Text' : 'Captions'}</div>
        <div className="panel-content quick-tool-actions">
          <button
            className="btn-secondary"
            onClick={() => {
              const track = ensureTextTrack();
              if (track) addTextClip(track.id, playheadTime);
            }}
          >
            <Type size={14} />
            Add Text
          </button>
          <button
            className="btn-secondary"
            onClick={() => {
              const track = ensureTextTrack();
              if (track) addCaptionClip(track.id, playheadTime);
            }}
          >
            <Captions size={14} />
            Add Caption
          </button>
          <StatusState
            title={activeTool === 'text' ? 'Text tools ready' : 'Caption tools ready'}
            body="Use the inspector to style, animate, and place the selected text clip."
          />
        </div>
      </section>
    );
  }

  if (activeTool === 'effects') {
    return (
      <section className="panel workspace-tool-panel quick-tools-panel">
        <div className="panel-header">Effects</div>
        <div className="panel-content quick-tool-actions">
          {selectedClip?.type === 'visual' ? (
            <>
              {[
                { id: 'glitch' as const, label: 'Glitch' },
                { id: 'vhs' as const, label: 'VHS' },
                { id: 'light_leak' as const, label: 'Light Leak' },
              ].map(effect => (
                <button
                  key={effect.id}
                  className="btn-secondary"
                  onClick={() => updateClipEffects(selectedClip.id, { overlayPreset: effect.id, overlayIntensity: 55 })}
                >
                  <Sparkles size={14} />
                  {effect.label}
                </button>
              ))}
            </>
          ) : (
            <StatusState title="Select a visual clip" body="Overlay effects apply to video or image clips." />
          )}
        </div>
      </section>
    );
  }

  if (activeTool === 'transitions') {
    return (
      <section className="panel workspace-tool-panel quick-tools-panel">
        <div className="panel-header">Transitions</div>
        <div className="panel-content quick-tool-actions">
          {selectedClip?.type === 'visual' ? (
            transitionTypes.map(transition => (
              <button
                key={transition.id}
                className="btn-secondary"
                onClick={() => updateClipTransition(selectedClip.id, { type: transition.id, duration: 0.35 })}
              >
                {transition.label}
              </button>
            ))
          ) : (
            <StatusState title="Select a visual clip" body="Choose the clip that should receive the transition." />
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="panel workspace-tool-panel quick-tools-panel">
      <div className="panel-header">Audio</div>
      <div className="panel-content">
        <StatusState
          title={`${tracks.filter(track => track.type === 'audio').length} audio track${tracks.filter(track => track.type === 'audio').length === 1 ? '' : 's'}`}
          body="Select an audio clip to adjust volume, fades, and beat markers in the inspector."
        />
      </div>
    </section>
  );
};
