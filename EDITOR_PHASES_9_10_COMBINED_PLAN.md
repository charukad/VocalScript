# NeuralScribe Editor Phases 9 And 10 Combined Plan

## Goal

Finish the next local-first editor milestone by adding reusable creative presets, stronger recovery and export workflows, and the review primitives that can exist before true cloud collaboration is built.

## Phase 9 Delivery Slice

- Enable the `Templates` workspace in the editor shell.
- Add built-in short-form and long-form templates plus reusable caption style packs.
- Add local custom template saving so creators can reuse project/export styling.
- Expose autosave status more clearly in the top bar.
- Preserve missing imported assets during restore, surface them in the UI, and support relinking files without rebuilding the timeline manually.
- Add manual project versions backed by saved snapshots.
- Improve the project gate with richer recent-project metadata.
- Expand export controls with `2K`, FPS, bitrate, MP4/MOV, custom range export, and a hardware-acceleration intent hook.

## Phase 10 Delivery Slice

- Add a dedicated `Workflow` workspace.
- Add project approval states for draft, in review, approved, and changes requested.
- Add timeline review comments with timestamps plus resolve/reopen behavior.
- Add local version comparison summaries so editors can compare draft progress before restore.
- Keep collaboration-shaped features honest:
  - Real shareable draft links remain blocked until projects have a share/sync backend.
  - Team asset libraries remain blocked until shared storage and permissions exist.
  - Role-aware collaboration remains blocked until authentication and identity are introduced.

## Likely Files

- `frontend/src/types/index.ts`
- `frontend/src/store/editorStore.ts`
- `frontend/src/lib/api/client.ts`
- `frontend/src/components/editor/ExportModal.tsx`
- `frontend/src/components/editor/ProjectGate.tsx`
- `frontend/src/components/editor/Navbar.tsx`
- `frontend/src/features/editorShell/*`
- `frontend/src/App.css`
- `backend/src/domain/models/blueprint.py`
- `backend/src/domain/services/export_orchestrator.py`
- `backend/src/infrastructure/ffmpeg_compiler.py`

## Acceptance Checks

- Templates are accessible from the main editor shell and can apply reusable settings.
- Missing imported media survives save/load and can be relinked from the UI.
- Editors can create and restore named local versions.
- Export supports the new surfaced controls and custom timeline ranges.
- Review comments and approval state persist with the project.
- Version comparison works locally.
- Collaboration features that require backend identity/sync are documented as blocked rather than simulated.
