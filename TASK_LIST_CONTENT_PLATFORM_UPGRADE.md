# NeuralScribe Content Platform Upgrade Task List

## Goal

Upgrade NeuralScribe from a local-first AI-assisted video editor into a local-first AI content creation platform that supports the loop:

`Create -> Publish -> Analyze -> Learn -> Improve`

## Status Legend

- `[ ]` Not started
- `[/]` In progress
- `[x]` Done
- `[!]` Blocked

## Source-of-Truth Notes

- `project_information.md` better reflects the current product than the older subtitle-focused `README.md`.
- Active custom extension code lives in `chrome/extensions/neuralscribe-bridge`.
- `chrome/extentions/...` contains older/reference extension material and is not the active bridge implementation.
- Existing editor, transcription, save/load, generation, bridge, and export workflows must stay working during the upgrade.

## Phase Overview

- `[x]` Phase 0: Repository Inspection and Safety
- `[ ]` Phase 1: Content Profile Data Model and Backend API
- `[ ]` Phase 2: Content Profile Frontend UI
- `[ ]` Phase 3: Connect Projects to Content Profiles
- `[ ]` Phase 4: Content Studio MVP
- `[ ]` Phase 5: Viral Scoring and Script Analysis
- `[ ]` Phase 6: Agent System MVP
- `[ ]` Phase 7: Storyboard and Viral Visual Planner Upgrade
- `[ ]` Phase 8: Narration Line System
- `[ ]` Phase 9: Google AI Studio Audio Bridge
- `[ ]` Phase 10: AI Timeline Builder
- `[ ]` Phase 11: Analytics Integration Foundation
- `[ ]` Phase 12: Analytics Agent and Learning Agent
- `[ ]` Phase 13: Advanced Creator Features

## Phase 0: Repository Inspection and Safety

- `[x]` Read `project_information.md` first and compare it with the older `README.md`.
- `[x]` Inspect `frontend/src`, including editor layout, types, API client, and `editorStore.ts`.
- `[x]` Inspect backend entry wiring, API routers, project models, project service, SQLite layer, generation queue, and browser bridge service.
- `[x]` Inspect the active Chrome bridge in `chrome/extensions/neuralscribe-bridge`.
- `[x]` Confirm active bridge behavior: WebSocket handles worker status/control; HTTP endpoints handle job claim/status/result flow.
- `[x]` Confirm old `chrome/extentions/...` folders are reference material only.
- `[x]` Create this upgrade task list as the implementation source of record.
- `[x]` Verify the existing frontend/backend still build or start before feature work begins.

### Phase 0 Acceptance Checks

- `[x]` Task list file exists.
- `[x]` Existing app baseline is verified before feature implementation.
- `[x]` No old `chrome/extentions/...` material was treated as active product code.
- `[x]` No large product code changes were made during inspection.

## Likely Existing Files To Change

### Backend

- `backend/src/api/main.py`
- `backend/src/api/projects.py`
- `backend/src/api/generation.py`
- `backend/src/domain/models/project.py`
- `backend/src/domain/models/generation.py`
- `backend/src/domain/services/project_service.py`
- `backend/src/domain/services/sqlite_store.py`
- `backend/src/domain/services/generation_queue_service.py`
- `backend/src/infrastructure/local_llm_service.py`

### Frontend

- `frontend/src/App.tsx`
- `frontend/src/types/index.ts`
- `frontend/src/lib/api/client.ts`
- `frontend/src/store/editorStore.ts`
- `frontend/src/components/editor/ProjectGate.tsx`
- `frontend/src/components/editor/Navbar.tsx`
- New feature folders under `frontend/src/features/`

### Browser Bridge

- `chrome/extensions/neuralscribe-bridge/manifest.json`
- `chrome/extensions/neuralscribe-bridge/background.js`
- `chrome/extensions/neuralscribe-bridge/shared/protocol.js`
- New provider adapter/content script files if Google AI Studio is added to the existing bridge

## Phase 1: Content Profile Data Model and Backend API

- `[ ]` Define platform target types and `ContentProfile` request/response models.
- `[ ]` Add registry/project database tables for content profiles and avatar metadata.
- `[ ]` Add migration-safe initialization for new profile tables.
- `[ ]` Add content profile service methods for create, list, get, update, archive/delete.
- `[ ]` Add profile avatar/file-reference support with safe local storage rules.
- `[ ]` Add `/api/content-profiles` CRUD router and register it in `main.py`.
- `[ ]` Add validation/defaults for required fields, tone/style, and selected platforms.
- `[ ]` Add focused verification coverage for create/list/update/archive persistence.

### Phase 1 Acceptance Checks

- `[ ]` Profiles can be created, listed, updated, and archived safely.
- `[ ]` Profile data persists across backend restarts.
- `[ ]` Avatar/reference behavior is defined and does not break local-first storage.

## Phase 2: Content Profile Frontend UI

- `[ ]` Add `frontend/src/features/contentProfiles/` feature module.
- `[ ]` Add content profile frontend types and API helpers.
- `[ ]` Add Zustand store or local feature state that follows existing project/editor patterns.
- `[ ]` Build profile list UI.
- `[ ]` Build create/edit form with platform selector and avatar input.
- `[ ]` Build profile detail view.
- `[ ]` Add navigation entry into the existing app shell/editor.
- `[ ]` Add loading, empty, save, and error states.

### Phase 2 Acceptance Checks

- `[ ]` Users can create and edit profiles from the UI.
- `[ ]` Users can select multiple target platforms.
- `[ ]` Existing editor workflows remain usable.

## Phase 3: Connect Projects to Content Profiles

- `[ ]` Extend project models with optional `contentProfileId`, `targetPlatform`, `contentGoal`, `videoType`, `plannedTitle`, `plannedDescription`, and optional `scriptId`.
- `[ ]` Extend project save/load serialization while preserving existing projects with missing fields.
- `[ ]` Update project creation/editing UI to select an optional content profile.
- `[ ]` Show the connected profile in the editor shell.
- `[ ]` Apply platform defaults for aspect ratio/export preset/caption safe area/script assumptions.
- `[ ]` Add migration/default behavior for legacy projects.

### Phase 3 Acceptance Checks

- `[ ]` Projects can connect to profiles and persist the link.
- `[ ]` Legacy projects still open cleanly.
- `[ ]` Short-form platform selection can apply vertical defaults where appropriate.

## Phase 4: Content Studio MVP

- `[ ]` Create `frontend/src/features/contentStudio/` route/view shell.
- `[ ]` Add selected profile context and profile switcher.
- `[ ]` Add tabs for Ideas, Script Lab, Storyboard, Voice, Analytics, and Agents.
- `[ ]` Add backend tables for `content_ideas`, `scripts`, `script_versions`, and `narration_lines`.
- `[ ]` Add CRUD endpoints for ideas and scripts.
- `[ ]` Add API for script versions and script splitting.
- `[ ]` Build Ideas tab with saved idea workflow.
- `[ ]` Build Script Lab with script editor, versions, and final selection.

### Phase 4 Acceptance Checks

- `[ ]` Content Studio opens independently from the editor.
- `[ ]` Users can save ideas and scripts under a selected profile.
- `[ ]` Users can split a script into narration lines.

## Phase 5: Viral Scoring and Script Analysis

- `[ ]` Define `Estimated Viral Potential` scoring models.
- `[ ]` Add rule-based scoring service for ideas, hooks, and scripts.
- `[ ]` Add LLM-backed analysis path compatible with existing LLM modes.
- `[ ]` Add rule-based fallback when no LLM is configured.
- `[ ]` Add analyze/rewrite endpoints under `/api/viral`.
- `[ ]` Add Script Lab UI for scores, notes, and rewrite candidates.
- `[ ]` Save selected script versions and analysis metadata.

### Phase 5 Acceptance Checks

- `[ ]` Users can analyze pasted/generated scripts.
- `[ ]` Users can generate improved versions.
- `[ ]` Output includes score breakdown, notes, and improvements.
- `[ ]` Feature works without a cloud LLM.

## Phase 6: Agent System MVP

- `[ ]` Add `backend/src/agents/` package.
- `[ ]` Create shared base agent contract and orchestrator.
- `[ ]` Add database tables for workflow runs, agent runs, tasks, outputs, and learnings.
- `[ ]` Implement Profile Strategy Agent.
- `[ ]` Implement Idea Agent.
- `[ ]` Implement Script Agent.
- `[ ]` Implement Storyboard Agent.
- `[ ]` Add Timeline Editor Agent placeholder contract.
- `[ ]` Add workflow start/read/list endpoints.
- `[ ]` Add Agent Runs UI in Content Studio with status/error/output visibility.

### Phase 6 Acceptance Checks

- `[ ]` Users can start a workflow.
- `[ ]` Agent runs persist and are inspectable.
- `[ ]` Failures expose useful diagnostics.
- `[ ]` Users can approve or reuse generated outputs.

## Phase 7: Storyboard and Viral Visual Planner Upgrade

- `[ ]` Extend storyboard scene model with goal, emotion, visual hook, motion, caption, transition, SFX, and music suggestion fields.
- `[ ]` Extend storyboard generation and repair logic for the richer schema.
- `[ ]` Add Viral Visual Planner output path.
- `[ ]` Add storyboard review/edit UI for new fields.
- `[ ]` Keep approved scenes compatible with the existing generation queue.

### Phase 7 Acceptance Checks

- `[ ]` Scripts can become structured viral storyboards.
- `[ ]` Users can review/edit scenes before generation.
- `[ ]` Existing media generation still works with approved scenes.

## Phase 8: Narration Line System

- `[ ]` Add narration line model/table with status, emotion, speed, pause, and audio asset fields.
- `[ ]` Add APIs to list/create/update/regenerate narration lines.
- `[ ]` Add script-to-lines splitting logic.
- `[ ]` Add Voice/Narration UI for line review and status tracking.
- `[ ]` Support editing one line without rebuilding the whole script.

### Phase 8 Acceptance Checks

- `[ ]` Scripts can be split into editable narration lines.
- `[ ]` Each line has independent generation state.
- `[ ]` Narration lines can later receive audio assets.

## Phase 9: Google AI Studio Audio Bridge

- `[ ]` Inspect whether Google AI Studio belongs inside the existing bridge or a separate extension.
- `[ ]` Generalize provider/job modeling for audio/voice jobs.
- `[ ]` Add voice job creation and result storage endpoints.
- `[ ]` Extend bridge protocol/capabilities for voice generation.
- `[ ]` Add Google AI Studio provider adapter/content script.
- `[ ]` Support `full_script` generation mode.
- `[ ]` Support preferred `line_by_line` generation mode.
- `[ ]` Add audio result reporting and backend import flow.
- `[ ]` Add frontend voice job status UI.
- `[ ]` Auto-import completed narration audio and optionally place clips on the timeline.

### Phase 9 Acceptance Checks

- `[ ]` Voice jobs can be created, claimed, completed, and failed.
- `[ ]` Generated narration audio appears in NeuralScribe assets.
- `[ ]` Line-by-line outputs can be placed in order on the timeline.

## Phase 10: AI Timeline Builder

- `[ ]` Define timeline build input/output contract.
- `[ ]` Build draft generation from script, narration, storyboard, and generated media.
- `[ ]` Place narration clips in order.
- `[ ]` Place visual clips aligned to storyboard timing.
- `[ ]` Add caption/text clips from narration or final script.
- `[ ]` Add preview/confirm flow before applying when feasible.

### Phase 10 Acceptance Checks

- `[ ]` Users can build an editable timeline draft.
- `[ ]` Voice, captions, and visuals are arranged predictably.
- `[ ]` Manual timeline editing remains intact.

## Phase 11: Analytics Integration Foundation

- `[ ]` Add analytics account/connection/snapshot/performance schemas.
- `[ ]` Add per-profile connection status model.
- `[ ]` Add manual analytics import path for MVP.
- `[ ]` Create YouTube and Facebook integration placeholders behind safe abstractions.
- `[ ]` Add Analytics tab views for connection state and imported metrics.
- `[ ]` Document token-storage constraints and avoid insecure secret persistence.

### Phase 11 Acceptance Checks

- `[ ]` Profiles can show analytics connection status.
- `[ ]` Manual metrics can be stored and displayed.
- `[ ]` No tokens are stored insecurely.

## Phase 12: Analytics Agent and Learning Agent

- `[ ]` Implement Analytics Agent.
- `[ ]` Implement Learning Agent.
- `[ ]` Summarize best/worst content by profile.
- `[ ]` Save reusable profile rules and learnings.
- `[ ]` Feed learnings back into Profile Strategy Agent.
- `[ ]` Surface insights in Content Studio.

### Phase 12 Acceptance Checks

- `[ ]` Performance summaries are generated.
- `[ ]` Reusable rules persist per profile.
- `[ ]` Future idea/script generation can read profile learnings.

## Phase 13: Advanced Creator Features

- `[ ]` Competitor content analyzer.
- `[ ]` Trend radar with external data sources.
- `[ ]` Thumbnail/title generator.
- `[ ]` Auto caption designer.
- `[ ]` Brand kit.
- `[ ]` Prompt library.
- `[ ]` Character consistency system.
- `[ ]` Content calendar.
- `[ ]` A/B testing support.
- `[ ]` Comment analyzer.
- `[ ]` Long-video-to-shorts repurposing.
- `[ ]` Publishing package generator.
- `[ ]` Direct publishing/scheduling APIs.

## Current Risks And Unknowns To Resolve Early

- Current generation jobs only model `image` and `video`; voice jobs will need either a generalized media/job type or a separate queue contract.
- `ProjectDetail` stores a broad JSON `state` blob while SQLite also persists normalized per-project tables; new profile/project links need a clear source-of-truth rule.
- The app currently has no project-owned automated tests visible outside dependency folders, so regression checks will need to be added or documented.
- The active bridge is provider-aware but currently only wires a runnable Meta adapter; adding Google AI Studio will test how cleanly the provider abstraction scales.
- Content Studio introduces app-level navigation beyond the current editor-first shell, so route/layout decisions should be made before large UI work starts.
- Analytics credentials need a secure storage plan before real OAuth-backed integrations are claimed as complete.

## MVP Definition Of Done

- `[ ]` Users can create Content Profiles.
- `[ ]` Projects can connect to Content Profiles.
- `[ ]` Content Studio opens and supports ideas/scripts.
- `[ ]` Script analysis/rewrite supports Estimated Viral Potential.
- `[ ]` Agent workflow supports at least idea/script/storyboard preparation.
- `[ ]` Scripts can split into narration lines.
- `[ ]` Storyboards can be reviewed before generation.
- `[ ]` Existing media generation can use improved storyboard prompts.
- `[ ]` Timeline draft builder creates a basic editable draft.
- `[ ]` Existing editor/transcription/save-load/export flows still work.
- `[ ]` This task list stays current as implementation proceeds.
