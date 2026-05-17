import { Crosshair, Grid3X3, RotateCcw, Ruler, ShieldCheck } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { TimelineClip } from '../../types';
import { getKeyframedValue } from '../../lib/utils/keyframes';

type CanvasOverlayProps = {
  clip: TimelineClip;
  playheadTime: number;
  containerRef: RefObject<HTMLDivElement | null>;
  showGrid: boolean;
  showRulers: boolean;
  showSafeArea: boolean;
  onToggleGrid: () => void;
  onToggleRulers: () => void;
  onToggleSafeArea: () => void;
  onMove: (x: number, y: number) => void;
  onScale: (scale: number) => void;
  onCrop: (updates: Partial<NonNullable<TimelineClip['crop']>>) => void;
  onReset: () => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const CanvasOverlay = ({
  clip,
  playheadTime,
  containerRef,
  showGrid,
  showRulers,
  showSafeArea,
  onToggleGrid,
  onToggleRulers,
  onToggleSafeArea,
  onMove,
  onScale,
  onCrop,
  onReset,
}: CanvasOverlayProps) => {
  const x = getKeyframedValue(clip, 'x', playheadTime);
  const y = getKeyframedValue(clip, 'y', playheadTime);
  const scale = getKeyframedValue(clip, 'scale', playheadTime);
  const crop = clip.crop ?? { left: 0, right: 0, top: 0, bottom: 0 };
  const nearCenterX = Math.abs(x - 50) <= 1.25;
  const nearCenterY = Math.abs(y - 50) <= 1.25;

  const handleMovePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const initialX = x;
    const initialY = y;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextX = clamp(initialX + ((moveEvent.clientX - startX) / rect.width) * 100, -50, 150);
      const nextY = clamp(initialY + ((moveEvent.clientY - startY) / rect.height) * 100, -50, 150);
      onMove(Math.abs(nextX - 50) <= 1.25 ? 50 : nextX, Math.abs(nextY - 50) <= 1.25 ? 50 : nextY);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleScalePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startX = event.clientX;
    const initialScale = scale;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = ((moveEvent.clientX - startX) / rect.width) * 160;
      onScale(clamp(initialScale + delta, 10, 300));
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleCropPointerDown = (
    edge: keyof NonNullable<TimelineClip['crop']>,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const initial = crop[edge];

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const rawDelta = edge === 'left' || edge === 'right'
        ? ((moveEvent.clientX - startX) / rect.width) * 100
        : ((moveEvent.clientY - startY) / rect.height) * 100;
      const directionalDelta = edge === 'right' || edge === 'bottom' ? -rawDelta : rawDelta;
      onCrop({ [edge]: clamp(initial + directionalDelta, 0, 45) });
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <>
      {showGrid && <div className="canvas-grid-overlay" />}
      {showRulers && (
        <>
          <div className="canvas-ruler-overlay horizontal" />
          <div className="canvas-ruler-overlay vertical" />
        </>
      )}
      {showSafeArea && <div className="canvas-safe-area-overlay" />}
      {nearCenterX && <div className="canvas-alignment-guide vertical" />}
      {nearCenterY && <div className="canvas-alignment-guide horizontal" />}

      <div
        className={`canvas-selection-box ${clip.type === 'text' ? 'text' : 'visual'}`}
        style={{
          left: `${x}%`,
          top: `${y}%`,
          width: clip.type === 'text' ? '36%' : `${Math.max(24, scale)}%`,
          height: clip.type === 'text' ? '18%' : `${Math.max(24, scale)}%`,
        }}
        onPointerDown={handleMovePointerDown}
      >
        <button
          type="button"
          className="canvas-scale-handle"
          title="Scale clip"
          onPointerDown={handleScalePointerDown}
        />
        {(['left', 'right', 'top', 'bottom'] as const).map(edge => (
          <button
            key={edge}
            type="button"
            className={`canvas-crop-handle ${edge}`}
            title={`Crop ${edge}`}
            onPointerDown={event => handleCropPointerDown(edge, event)}
          />
        ))}
      </div>

      <div className="canvas-floating-toolbar">
        <button type="button" className={showGrid ? 'active' : ''} onClick={onToggleGrid} title="Toggle grid">
          <Grid3X3 size={15} />
        </button>
        <button type="button" className={showRulers ? 'active' : ''} onClick={onToggleRulers} title="Toggle rulers">
          <Ruler size={15} />
        </button>
        <button type="button" className={showSafeArea ? 'active' : ''} onClick={onToggleSafeArea} title="Toggle safe area">
          <ShieldCheck size={15} />
        </button>
        <button type="button" onClick={() => onMove(50, 50)} title="Center clip">
          <Crosshair size={15} />
        </button>
        <button type="button" onClick={onReset} title="Reset transform">
          <RotateCcw size={15} />
        </button>
      </div>
    </>
  );
};
