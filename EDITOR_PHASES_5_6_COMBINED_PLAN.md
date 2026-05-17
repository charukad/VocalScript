# NeuralScribe Editor Combined Phase 5 + 6 Plan

## Goal

Merge the next two editor roadmap phases into one creator-facing milestone:

1. Make titles and captions look production-ready inside the editor.
2. Add a first pass of finishing controls that improve color and polish without leaving NeuralScribe.

## Combined Milestone

### Wave 1: Social Text + Finishing Controls

- Add manual caption creation beside the existing text tool.
- Add reusable text templates for title, subtitle, lower-third, and social-caption work.
- Add text shadow, stroke, wrap-width, line-length, and background-box controls.
- Add safe-area placement presets for captions.
- Add reusable color look presets.
- Add blur, sharpen, vignette, and clarity controls with preview and export support.
- Keep all Wave 1 additions on the existing clip model and export path so they remain editable and saveable.

### Wave 2: Advanced Styling + Compositing

- Add animated title presets and richer subtitle animation modes.
- Add karaoke / word-highlight caption playback.
- Add transitions, LUT import, overlay effect packs, and blend modes.
- Add crop, masking, picture-in-picture presets, split-screen layouts, and border overlays.
- Add chroma key, spill suppression, edge feathering, stabilization, and deeper color wheels.

## Execution Order

1. Extend shared text and effect types plus editor defaults.
2. Add export-compatible blueprint fields and FFmpeg/Pillow handling.
3. Add manual caption authoring and text preset controls.
4. Add finishing controls to the color inspector and preview.
5. Verify text styling and finishing effects in the running app.
6. Leave animation-heavy and compositing-heavy work tracked for the next wave.

## Files Likely To Change

- `frontend/src/types/index.ts`
- `frontend/src/store/editorStore.ts`
- `frontend/src/components/editor/Inspector.tsx`
- `frontend/src/components/editor/PreviewWindow.tsx`
- `frontend/src/components/timeline/TimelineToolbar.tsx`
- `frontend/src/lib/api/client.ts`
- `backend/src/domain/models/blueprint.py`
- `backend/src/infrastructure/ffmpeg_compiler.py`
- `frontend/src/App.css`

## Acceptance Checks For Wave 1

- A user can create a caption clip directly from the timeline toolbar.
- A selected text clip can switch between reusable social-video templates.
- Shadow, stroke, box, wrap width, and line-length controls update the preview.
- Caption placement presets keep text inside safer lower-third positions.
- Color look presets and finishing sliders update selected visual clips.
- Export receives the same new text/effect fields used by the editor.

## Explicitly Deferred

- Animated title packs.
- Karaoke / per-word highlight captions.
- Transitions, LUT import, blend modes, and stylized overlay packs.
- Crop, masking, split-screen, border overlays, and full compositing templates.
- Chroma key, spill suppression, stabilization, and advanced color wheels.

Those remain Phase 5 + 6 work, but Wave 1 focuses on the styling controls creators reach for constantly.

## Execution Status

- `[x]` Wave 1 social text controls and finishing controls implemented.
- `[x]` Browser verification completed against project `np1`.
- `[x]` Frontend build and backend module compilation completed.
- `[ ]` Wave 2 advanced styling and compositing not started.
