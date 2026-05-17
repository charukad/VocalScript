# NeuralScribe Editor Combined Phase 3 + 4 Plan

## Goal

Merge the next two editor roadmap phases into one practical milestone:

1. Make the preview canvas feel direct and modern.
2. Turn the current keyframe foundation into a usable motion workflow.

This combined phase should improve everyday editing speed without waiting for every advanced render feature to exist first.

## Combined Milestone

### Wave 1: Canvas + Motion Workspace

- Add direct clip positioning on the preview canvas.
- Add visible selection overlays, center alignment guides, safe-area overlay, and grid toggle.
- Add optional rulers for more precise layout work.
- Add a floating quick toolbar for common clip actions.
- Expose X/Y position controls in the inspector.
- Add reusable motion presets.
- Add easing choices to keyframes.
- Add copy/paste for clip keyframes.
- Show keyframe markers directly on timeline clips.

### Wave 2: Deeper Motion Controls

- Add crop controls and crop handles.
- Add a richer curve editor / graph view.
- Add clip speed control, reverse, freeze frame, time remapping, and speed presets.
- Add export-time support for dynamic keyframes and time-based motion parity.

## Execution Order

1. Extend shared clip/keyframe types and store actions.
2. Build canvas overlay primitives and toolbar.
3. Wire direct manipulation into the preview surface.
4. Upgrade the inspector animation controls.
5. Add timeline keyframe visibility.
6. Verify the combined workflow in the running app.
7. Leave renderer-dependent work tracked separately until the FFmpeg path is upgraded to match.

## Files Likely To Change

- `frontend/src/types/index.ts`
- `frontend/src/store/editorStore.ts`
- `frontend/src/lib/utils/keyframes.ts`
- `frontend/src/components/editor/PreviewWindow.tsx`
- `frontend/src/components/editor/Inspector.tsx`
- `frontend/src/components/timeline/DraggableClip.tsx`
- `frontend/src/App.css`
- New files under `frontend/src/features/canvas/`

## Acceptance Checks For Wave 1

- A selected clip can be moved directly in the preview.
- Center guides appear while positioning.
- Safe-area, grid, and ruler overlays can be toggled from the preview.
- The inspector exposes position and motion controls without bloating unrelated tabs.
- Motion presets create usable keyframes.
- Easing can be changed per keyframe.
- Keyframes can be copied and pasted between clips.
- Timeline clips visibly show their keyframe positions.

## Execution Status

- `[x]` Wave 1 canvas positioning, overlays, rulers, and floating toolbar implemented.
- `[x]` Wave 1 inspector position controls, motion presets, easing, and keyframe clipboard implemented.
- `[x]` Timeline clip keyframe markers implemented.
- `[x]` Browser verification completed against project `np1`.
- `[/]` Wave 2 renderer-dependent work remains tracked for the next pass.

## Explicitly Deferred

- Crop authoring and crop handles.
- Graph editor / Bézier curve UI.
- Speed ramps, reverse, freeze frame, and time remapping.
- Export parity for dynamic motion keyframes.

Those remain Phase 3 + 4 work, but they depend on a larger render-schema and FFmpeg upgrade than Wave 1 needs.
