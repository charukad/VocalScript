import { useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { Inspector } from '../../components/editor/Inspector';
import { PreviewWindow } from '../../components/editor/PreviewWindow';
import { ToolPanel } from './ToolPanel';
import type { EditorToolId } from './types';

type ResizeSide = 'left' | 'right' | null;

const MIN_TOOL_PANEL_WIDTH = 260;
const MAX_TOOL_PANEL_WIDTH = 420;
const DEFAULT_TOOL_PANEL_WIDTH = 300;
const MIN_INSPECTOR_WIDTH = 280;
const MAX_INSPECTOR_WIDTH = 420;
const DEFAULT_INSPECTOR_WIDTH = 300;
const MIN_PREVIEW_WIDTH = 420;

const getStoredWidth = (key: string, fallback: number): number => {
  const stored = window.localStorage.getItem(key);
  const numeric = stored ? Number(stored) : Number.NaN;
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

type WorkspaceLayoutProps = {
  activeTool: EditorToolId;
};

export const WorkspaceLayout = ({ activeTool }: WorkspaceLayoutProps) => {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [toolPanelWidth, setToolPanelWidth] = useState(() =>
    getStoredWidth('neuralscribe.editor.toolPanelWidth', DEFAULT_TOOL_PANEL_WIDTH)
  );
  const [inspectorWidth, setInspectorWidth] = useState(() =>
    getStoredWidth('neuralscribe.editor.inspectorWidth', DEFAULT_INSPECTOR_WIDTH)
  );
  const [resizeSide, setResizeSide] = useState<ResizeSide>(null);

  const style = useMemo(() => ({
    '--tool-panel-width': `${toolPanelWidth}px`,
    '--inspector-width': `${inspectorWidth}px`,
  }) as CSSProperties, [toolPanelWidth, inspectorWidth]);

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!resizeSide || !workspaceRef.current) return;
    const rect = workspaceRef.current.getBoundingClientRect();
    if (resizeSide === 'left') {
      const max = Math.min(MAX_TOOL_PANEL_WIDTH, rect.width - inspectorWidth - MIN_PREVIEW_WIDTH);
      const next = clamp(event.clientX - rect.left, MIN_TOOL_PANEL_WIDTH, max);
      setToolPanelWidth(next);
      window.localStorage.setItem('neuralscribe.editor.toolPanelWidth', String(Math.round(next)));
      return;
    }
    const max = Math.min(MAX_INSPECTOR_WIDTH, rect.width - toolPanelWidth - MIN_PREVIEW_WIDTH);
    const next = clamp(rect.right - event.clientX, MIN_INSPECTOR_WIDTH, max);
    setInspectorWidth(next);
    window.localStorage.setItem('neuralscribe.editor.inspectorWidth', String(Math.round(next)));
  };

  const stopResize = () => setResizeSide(null);

  return (
    <div
      ref={workspaceRef}
      className={`workspace resizable-workspace ${resizeSide ? 'is-resizing' : ''}`}
      style={style}
      onPointerMove={handlePointerMove}
      onPointerUp={stopResize}
      onPointerCancel={stopResize}
      onPointerLeave={stopResize}
    >
      <ToolPanel activeTool={activeTool} />
      <button
        className="workspace-resize-handle"
        aria-label="Resize tool panel"
        onPointerDown={event => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setResizeSide('left');
        }}
      />
      <PreviewWindow />
      <button
        className="workspace-resize-handle"
        aria-label="Resize inspector"
        onPointerDown={event => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setResizeSide('right');
        }}
      />
      <Inspector />
    </div>
  );
};
