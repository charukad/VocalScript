# NeuralScribe Editor Combined Phase 7 + 8 Plan

## Goal

Merge the next two editor roadmap phases into one practical milestone:

1. Make everyday audio editing more expressive and useful inside the timeline.
2. Turn existing transcript data into reviewable editing assistance instead of passive metadata.

## Combined Milestone

### Wave 1: Audio Craft + Transcript Assist

- Recognize the existing waveform rendering as the baseline audio visualization layer.
- Add fade-curve types for clip fades with matching preview/export behavior.
- Add beat-candidate marker generation from local waveform peaks.
- Add a transcript assist view with:
  - filler-word suggestions
  - silence-gap suggestions
  - hook feedback for the opening seconds
  - long-caption / retention-risk suggestions
- Add one-click creation of review markers from transcript insights.
- Add an explicit transcript-based edit command that splits the selected clip at caption boundaries.

### Wave 2: Smart Mix + Rough Cut

- Add EQ presets, voice enhancement, and noise reduction.
- Add automatic ducking beneath narration.
- Add stronger beat analysis and audio/video sync helpers.
- Add filler removal workflows, silence removal proposals, rough-cut generation, B-roll suggestions, and short-form reframing workflows.
- Add one-click multi-platform variants and deeper subject-tracking planning.

## Execution Order

1. Extend shared audio types and export payloads for fade curves.
2. Add export-compatible fade curve handling.
3. Add reusable transcript-insight helpers.
4. Add store actions for beat markers, review markers, and caption-boundary splits.
5. Add audio controls and an Assist inspector tab.
6. Verify the workflow in the running editor.

## Files Likely To Change

- `frontend/src/types/index.ts`
- `frontend/src/store/editorStore.ts`
- `frontend/src/components/editor/Inspector.tsx`
- `frontend/src/components/editor/PreviewWindow.tsx`
- `frontend/src/lib/api/client.ts`
- `frontend/src/lib/utils/editorInsights.ts`
- `backend/src/domain/models/blueprint.py`
- `backend/src/infrastructure/ffmpeg_compiler.py`

## Acceptance Checks For Wave 1

- Selected audio clips expose configurable fade curves.
- Preview and export receive the same fade-curve intent.
- A selected audio clip can create beat-candidate markers from its waveform.
- Transcript assist lists reviewable findings without changing the timeline automatically.
- Review markers can be added from transcript findings.
- A selected clip can be split explicitly at caption boundaries.

## Explicitly Deferred

- EQ presets, voice cleanup, noise reduction, and automatic ducking.
- Production-grade beat detection and audio/video sync.
- Automatic silence removal, filler removal, rough cuts, B-roll placement, reframing, and multi-platform variants.

Those remain Phase 7 + 8 work, but Wave 1 turns already-available timeline and transcript data into useful editor actions now.

## Execution Status

- `[x]` Wave 1 fade curves, beat-candidate markers, transcript assist, review markers, and caption-boundary split command implemented.
- `[x]` Browser verification completed against project `v4`.
- `[x]` Frontend build and backend module compilation completed.
- `[ ]` Wave 2 not started.
