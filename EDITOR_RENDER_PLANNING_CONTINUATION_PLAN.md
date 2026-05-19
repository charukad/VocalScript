# NeuralScribe Editor Render Planning Continuation Plan

## Goal

Start replacing static export assumptions with a render-planning layer that can translate timeline animation data into FFmpeg filter expressions.

## First Delivery Slice

- Add keyframes to the export blueprint.
- Export visual transform keyframes for scale, rotation, opacity, x, and y.
- Export audio volume keyframes for audio clips and video clips with embedded audio.
- Add export-side support for fade and crossfade-style clip alpha fades.
- Keep unsupported render-planning work explicit instead of pretending everything is solved:
  - text keyframe export
  - variable speed/time remapping
  - non-rectangular masks
  - LUT import
  - render cache invalidation

## Likely Files

- `frontend/src/lib/api/client.ts`
- `backend/src/domain/models/blueprint.py`
- `backend/src/infrastructure/ffmpeg_compiler.py`
- `TASK_LIST_EDITOR_CAPCUT_UPGRADE.md`

## Acceptance Checks

- Frontend build passes.
- Backend compile passes.
- FFmpeg smoke export renders a clip with animated visual keyframes.
- FFmpeg smoke export renders an audio clip with volume keyframes.
