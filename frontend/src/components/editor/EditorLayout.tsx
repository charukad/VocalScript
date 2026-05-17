import React from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragMoveEvent } from '@dnd-kit/core';
import { Navbar } from './Navbar';
import { ProjectGate } from './ProjectGate';
import { BrowserBridgeMonitor } from './BrowserBridgeMonitor';
import { TimelinePanel } from '../timeline/TimelinePanel';
import { ExportModal } from './ExportModal';
import { useEditorStore } from '../../store/editorStore';
import { ContentProfilesPanel } from '../../features/contentProfiles/ContentProfilesPanel';
import { ToolRail } from '../../features/editorShell/ToolRail';
import { WorkspaceLayout } from '../../features/editorShell/WorkspaceLayout';
import type { EditorToolId } from '../../features/editorShell/types';

export const EditorLayout = () => {
  const { 
    updateClipStartTime, 
    updateClipTrack, 
    addAssetToTimeline, 
    assets,
    selectedClipId,
    selectedClipIds,
    removeClip,
    duplicateClip,
    rippleDeleteClip,
    groupSelectedClips,
    ungroupSelectedClips,
    rippleTrimClip,
    rollTrimClip,
    slipClip,
    slideClip,
    addMarker,
    setSnapGuideForTime,
    clearSnapGuide,
    togglePlayback,
    showExportModal,
    undo,
    redo
  } = useEditorStore();
  const currentProject = useEditorStore(state => state.currentProject);
  const [showBridgeMonitor, setShowBridgeMonitor] = React.useState(false);
  const [showContentProfiles, setShowContentProfiles] = React.useState(false);
  const [activeTool, setActiveTool] = React.useState<EditorToolId>('media');
  
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayback();
      } else if (e.code === 'KeyZ' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.code === 'KeyZ' && (e.metaKey || e.ctrlKey) && e.shiftKey) || (e.code === 'KeyY' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        redo();
      } else if (e.code === 'Delete' && e.shiftKey && selectedClipId) {
        e.preventDefault();
        rippleDeleteClip(selectedClipId);
      } else if ((e.code === 'Backspace' || e.code === 'Delete') && selectedClipId) {
        e.preventDefault();
        removeClip(selectedClipId);
      } else if (e.code === 'KeyD' && (e.metaKey || e.ctrlKey) && selectedClipId) {
        e.preventDefault();
        duplicateClip(selectedClipId);
      } else if (e.code === 'KeyG' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        ungroupSelectedClips();
      } else if (e.code === 'KeyG' && (e.metaKey || e.ctrlKey) && selectedClipIds.length > 1) {
        e.preventDefault();
        groupSelectedClips();
      } else if (e.code === 'KeyM' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        addMarker(useEditorStore.getState().playheadTime);
      } else if (e.code === 'KeyK' && (e.metaKey || e.ctrlKey) && selectedClipId) {
        e.preventDefault();
        const state = useEditorStore.getState();
        state.splitClip(selectedClipId, state.playheadTime);
      } else if (selectedClipId && e.altKey && e.code === 'BracketRight') {
        e.preventDefault();
        rippleTrimClip(selectedClipId, 'right', e.shiftKey ? 1 : 0.1);
      } else if (selectedClipId && e.altKey && e.code === 'BracketLeft') {
        e.preventDefault();
        rippleTrimClip(selectedClipId, 'right', e.shiftKey ? -1 : -0.1);
      } else if (selectedClipId && e.altKey && e.code === 'Period') {
        e.preventDefault();
        rollTrimClip(selectedClipId, e.shiftKey ? 1 : 0.1);
      } else if (selectedClipId && e.altKey && e.code === 'Comma') {
        e.preventDefault();
        rollTrimClip(selectedClipId, e.shiftKey ? -1 : -0.1);
      } else if (selectedClipId && e.altKey && e.code === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) {
          slideClip(selectedClipId, 0.1);
        } else {
          slipClip(selectedClipId, 0.1);
        }
      } else if (selectedClipId && e.altKey && e.code === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) {
          slideClip(selectedClipId, -0.1);
        } else {
          slipClip(selectedClipId, -0.1);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedClipId,
    selectedClipIds.length,
    removeClip,
    duplicateClip,
    rippleDeleteClip,
    groupSelectedClips,
    ungroupSelectedClips,
    rippleTrimClip,
    rollTrimClip,
    slipClip,
    slideClip,
    addMarker,
    togglePlayback,
    undo,
    redo,
  ]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over, delta } = event;
    
    // Check if dragging a pool asset into a timeline track
    if (active.data.current?.type === 'pool-asset' && over && over.data.current?.type === 'timeline-track') {
      const assetId = active.id as string;
      const trackId = over.id as string;
      const asset = assets.find(a => a.id === assetId);
      const trackType = over.data.current.trackType;
      
      if (asset && asset.type === trackType) {
        // Calculate dropped start time
        // This is a bit tricky: delta.x is the distance dragged.
        // For precise dropping, we should use the initial click pos or the over rect.
        // For now, we will add it to the end of the track by omitting startTime, 
        // or we use event.active.rect.current.translated to calculate relative position to the track
        
        const trackRect = over.rect;
        const activeRect = active.rect.current.translated;
        if (trackRect && activeRect) {
           const dropX = activeRect.left - trackRect.left;
           addAssetToTimeline(asset, trackId, Math.max(0, dropX));
        } else {
           addAssetToTimeline(asset, trackId);
        }
      } else if (asset) {
        alert(`Cannot drop ${asset.type} into a ${trackType} track!`);
      }
      clearSnapGuide();
      return;
    }
    
    // Check if dragging a timeline clip
    if (active.data.current?.type === 'timeline-clip') {
      if (over && over.data.current?.type === 'timeline-track') {
        // Dragged to a potentially different track
        const trackId = over.id as string;
        const trackType = over.data.current.trackType;
        const clipType = active.data.current.clipType;
        
        if (clipType === trackType) {
          updateClipTrack(active.id as string, trackId, delta.x);
        } else {
          // Revert if wrong type
          updateClipStartTime(active.id as string, 0); // delta 0 = no change
        }
      } else {
        // Dragged horizontally within the same track (no valid over)
        updateClipStartTime(active.id as string, delta.x);
      }
    }
    clearSnapGuide();
  };

  const handleDragMove = (event: DragMoveEvent) => {
    if (event.active.data.current?.type !== 'timeline-clip') return;
    const state = useEditorStore.getState();
    const clip = state.clips.find(candidate => candidate.id === event.active.id);
    if (!clip) return;
    setSnapGuideForTime(clip.startTime + event.delta.x / state.zoom, clip.id);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={clearSnapGuide}
    >
      {showExportModal && <ExportModal />}
      <div className="editor-layout">
        {showContentProfiles && <ContentProfilesPanel onClose={() => setShowContentProfiles(false)} />}
        {showBridgeMonitor && <BrowserBridgeMonitor onClose={() => setShowBridgeMonitor(false)} />}
        {currentProject ? (
          <>
            <Navbar
              onOpenBridgeMonitor={() => setShowBridgeMonitor(true)}
              onOpenContentProfiles={() => setShowContentProfiles(true)}
            />
            <div className="editor-shell-body">
              <ToolRail activeTool={activeTool} onSelectTool={setActiveTool} />
              <WorkspaceLayout activeTool={activeTool} />
            </div>
            <TimelinePanel />
          </>
        ) : (
          <ProjectGate onOpenContentProfiles={() => setShowContentProfiles(true)} />
        )}
      </div>
    </DndContext>
  );
};
