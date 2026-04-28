import React from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { Navbar } from './Navbar';
import { MediaPool } from './MediaPool';
import { PreviewWindow } from './PreviewWindow';
import { Inspector } from './Inspector';
import { TimelinePanel } from '../timeline/TimelinePanel';
import { useEditorStore } from '../../store/editorStore';

export const EditorLayout = () => {
  const { 
    updateClipStartTime, 
    updateClipTrack, 
    addAssetToTimeline, 
    assets,
    selectedClipId,
    removeClip,
    togglePlayback
  } = useEditorStore();
  
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
      } else if ((e.code === 'Backspace' || e.code === 'Delete') && selectedClipId) {
        e.preventDefault();
        removeClip(selectedClipId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedClipId, removeClip, togglePlayback]);

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
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="editor-layout">
        <Navbar />
        <div className="workspace">
          <MediaPool />
          <PreviewWindow />
          <Inspector />
        </div>
        <TimelinePanel />
      </div>
    </DndContext>
  );
};
