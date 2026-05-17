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
- `[x]` Phase 1: Content Profile Data Model and Backend API
- `[x]` Phase 2: Content Profile Frontend UI
- `[x]` Phase 3: Connect Projects to Content Profiles
- `[x]` Phase 4: Content Studio MVP
- `[x]` Phase 5: Viral Scoring and Script Analysis
- `[x]` Phase 6: Agent System MVP
- `[x]` Phase 7: Storyboard and Viral Visual Planner Upgrade
- `[x]` Phase 8: Narration Line System
- `[x]` Phase 9: Google AI Studio Audio Bridge
- `[x]` Phase 10: AI Timeline Builder
- `[x]` Phase 11: Analytics Integration Foundation
- `[x]` Phase 12: Analytics Agent and Learning Agent
- `[!]` Phase 13: Advanced Creator Features

## Phase 0: Repository Inspection and Safety

- `[x]` Read `project_information.md` first and compare it with the older `README.md`.
- `[x]` Inspect `frontend/src`, including editor layout, types, API client, and `editorStore.ts`.
- `[x]` Inspect backend entry wiring, API routers, project models, project service, SQLite layer, generation queue, and browser bridge service.
- `[x]` Inspect the active Chrome bridge in `chrome/extensions/neuralscribe-bridge`.
- `[x]` Confirm active bridge behavior: WebSocket handles worker status/control; HTTP endpoints handle job claim/status/result flow.
- `[x]` Confirm old `chrome/extentions/...` folders are reference material only.
- `[x]` Create this upgrade task list as the implementation source of record.
- `[x]` Verify the existing frontend/backend still build or start before feature work begins.
- `[x]` Harden startup discovery so remembered projects outside the writable workspace do not prevent the backend from starting.

### Phase 0 Acceptance Checks

- `[x]` Task list file exists.
- `[x]` Existing app baseline is verified before feature implementation.
- `[x]` No old `chrome/extentions/...` material was treated as active product code.
- `[x]` No large product code changes were made during inspection.
- `[x]` Registered read-only legacy projects no longer block application startup.

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

- `[x]` Define platform target types and `ContentProfile` request/response models.
- `[x]` Add registry database tables for content profiles and avatar metadata.
- `[x]` Add migration-safe initialization for new profile tables.
- `[x]` Add content profile service methods for create, list, get, update, archive/delete.
- `[x]` Add profile avatar/file-reference support with safe local storage rules.
- `[x]` Add `/api/content-profiles` CRUD router and register it in `main.py`.
- `[x]` Add validation/defaults for required fields, tone/style, and selected platforms.
- `[x]` Add focused verification coverage for create/list/update/archive persistence.

### Phase 1 Acceptance Checks

- `[x]` Profiles can be created, listed, updated, and archived safely.
- `[x]` Profile data persists across backend restarts.
- `[x]` Avatar/reference behavior is defined and does not break local-first storage.

## Phase 2: Content Profile Frontend UI

- `[x]` Add `frontend/src/features/contentProfiles/` feature module.
- `[x]` Add content profile frontend types and API helpers.
- `[x]` Add Zustand store or local feature state that follows existing project/editor patterns.
- `[x]` Build profile list UI.
- `[x]` Build create/edit form with platform selector and avatar input.
- `[x]` Build profile detail view.
- `[x]` Add navigation entry into the existing app shell/editor.
- `[x]` Add loading, empty, save, and error states.

### Phase 2 Acceptance Checks

- `[x]` Users can create and edit profiles from the UI.
- `[x]` Users can select multiple target platforms.
- `[x]` Existing editor workflows remain usable.

## Phase 3: Connect Projects to Content Profiles

- `[x]` Extend project models with optional `contentProfileId`, `targetPlatform`, `contentGoal`, `videoType`, `plannedTitle`, `plannedDescription`, and optional `scriptId`.
- `[x]` Extend project save/load serialization while preserving existing projects with missing fields.
- `[x]` Update project creation/editing UI to select an optional content profile.
- `[x]` Show the connected profile in the editor shell.
- `[x]` Apply currently available platform defaults for aspect ratio/export orientation; defer caption safe area/script assumptions until those systems exist.
- `[x]` Add migration/default behavior for legacy projects.

### Phase 3 Acceptance Checks

- `[x]` Projects can connect to profiles and persist the link.
- `[x]` Legacy projects still open cleanly.
- `[x]` Short-form platform selection can apply vertical defaults where appropriate.

## Phase 4: Content Studio MVP

- `[x]` Create `frontend/src/features/contentStudio/` route/view shell.
- `[x]` Add selected profile context and profile switcher.
- `[x]` Add tabs for Ideas, Script Lab, Storyboard, Voice, Analytics, and Agents.
- `[x]` Add Trending Topics tab with manual trend capture and rule-based local suggestions.
- `[x]` Add backend tables for `content_ideas`, `scripts`, `script_versions`, and `narration_lines`.
- `[x]` Add backend trend persistence for profile-scoped topics.
- `[x]` Add CRUD endpoints for ideas and scripts.
- `[x]` Add API for script versions and script splitting.
- `[x]` Build Ideas tab with saved idea workflow.
- `[x]` Build Script Lab with script editor, versions, and final selection.

### Phase 4 Acceptance Checks

- `[x]` Content Studio opens independently from the editor.
- `[x]` Users can save ideas and scripts under a selected profile.
- `[x]` Users can save trends and generate local fallback trend suggestions.
- `[x]` Users can split a script into narration lines.

## Phase 5: Viral Scoring and Script Analysis

- `[x]` Define `Estimated Viral Potential` scoring models.
- `[x]` Add rule-based scoring service for ideas, hooks, and scripts.
- `[x]` Add LLM-backed analysis path compatible with existing LLM modes.
- `[x]` Add rule-based fallback when no LLM is configured.
- `[x]` Add analyze/rewrite endpoints under `/api/viral`.
- `[x]` Add Script Lab UI for scores, notes, and rewrite candidates.
- `[x]` Save selected script versions and analysis metadata.

### Phase 5 Acceptance Checks

- `[x]` Users can analyze pasted/generated scripts.
- `[x]` Users can generate improved versions.
- `[x]` Output includes score breakdown, notes, and improvements.
- `[x]` Feature works without a cloud LLM.

## Phase 6: Agent System MVP

- `[x]` Add `backend/src/agents/` package.
- `[x]` Create shared base agent contract and orchestrator.
- `[x]` Add database tables for workflow runs, agent runs, tasks, outputs, and learnings.
- `[x]` Implement Profile Strategy Agent.
- `[x]` Implement Idea Agent.
- `[x]` Implement Script Agent.
- `[x]` Implement Storyboard Agent.
- `[x]` Add Timeline Editor Agent placeholder contract.
- `[x]` Add workflow start/read/list endpoints.
- `[x]` Add Agent Runs UI in Content Studio with status/error/output visibility.

### Phase 6 Acceptance Checks

- `[x]` Users can start a workflow.
- `[x]` Agent runs persist and are inspectable.
- `[x]` Failures expose useful diagnostics.
- `[x]` Users can reuse generated outputs as reviewable draft ideas/scripts.

## Phase 7: Storyboard and Viral Visual Planner Upgrade

- `[x]` Extend storyboard scene model with goal, emotion, visual hook, motion, caption, transition, SFX, and music suggestion fields.
- `[x]` Extend storyboard generation and repair logic for the richer schema.
- `[x]` Add Viral Visual Planner output path.
- `[x]` Add storyboard review/edit UI for new fields.
- `[x]` Keep approved scenes compatible with the existing generation queue.

### Phase 7 Acceptance Checks

- `[x]` Scripts can become structured viral storyboards.
- `[x]` Users can review/edit scenes before generation.
- `[x]` Existing media generation still works with approved scenes.

## Phase 8: Narration Line System

- `[x]` Add narration line model/table with status, emotion, speed, pause, and audio asset fields.
- `[x]` Add APIs to list/create/update/regenerate narration lines.
- `[x]` Add script-to-lines splitting logic.
- `[x]` Add Voice/Narration UI for line review and status tracking.
- `[x]` Support editing one line without rebuilding the whole script.

### Phase 8 Acceptance Checks

- `[x]` Scripts can be split into editable narration lines.
- `[x]` Each line has independent generation state.
- `[x]` Narration lines can later receive audio assets.

## Phase 9: Google AI Studio Audio Bridge

- `[x]` Inspect whether Google AI Studio belongs inside the existing bridge or a separate extension.
- `[x]` Generalize provider/job modeling for audio/voice jobs.
- `[x]` Add voice job creation and result storage endpoints.
- `[x]` Extend bridge protocol/capabilities for voice generation.
- `[x]` Add Google AI Studio provider adapter/content script.
- `[x]` Support `full_script` generation mode.
- `[x]` Support preferred `line_by_line` generation mode.
- `[x]` Add audio result reporting and backend import flow.
- `[x]` Add frontend voice job status UI.
- `[x]` Auto-import completed narration audio and optionally place clips on the timeline.

### Phase 9 Acceptance Checks

- `[x]` Voice jobs can be created, claimed, completed, and failed locally.
- `[x]` Generated narration audio appears in NeuralScribe assets locally.
- `[x]` Line-by-line outputs can be placed in order on the timeline locally.
- `[!]` Live Google AI Studio selector/audio validation still needs a signed-in provider session.

## Phase 10: AI Timeline Builder

- `[x]` Define timeline build input/output contract.
- `[x]` Build draft generation from script, narration, storyboard, and generated media.
- `[x]` Place narration clips in order.
- `[x]` Place visual clips aligned to storyboard timing.
- `[x]` Add caption/text clips from narration or final script.
- `[x]` Add preview/confirm flow before applying when feasible.

### Phase 10 Acceptance Checks

- `[x]` Users can build an editable timeline draft.
- `[x]` Voice, captions, and visuals are arranged predictably.
- `[x]` Manual timeline editing remains intact.

## Phase 11: Analytics Integration Foundation

- `[x]` Add analytics account/connection/snapshot/performance schemas.
- `[x]` Add per-profile connection status model.
- `[x]` Add manual analytics import path for MVP.
- `[x]` Create YouTube and Facebook integration placeholders behind safe abstractions.
- `[x]` Add Analytics tab views for connection state and imported metrics.
- `[x]` Document token-storage constraints and avoid insecure secret persistence.

### Phase 11 Acceptance Checks

- `[x]` Profiles can show analytics connection status.
- `[x]` Manual metrics can be stored and displayed.
- `[x]` No tokens are stored insecurely.

## Phase 12: Analytics Agent and Learning Agent

- `[x]` Implement Analytics Agent.
- `[x]` Implement Learning Agent.
- `[x]` Summarize best/worst content by profile.
- `[x]` Save reusable profile rules and learnings.
- `[x]` Feed learnings back into Profile Strategy Agent.
- `[x]` Surface insights in Content Studio.

### Phase 12 Acceptance Checks

- `[x]` Performance summaries are generated.
- `[x]` Reusable rules persist per profile.
- `[x]` Future idea/script generation can read profile learnings.

## Phase 13: Advanced Creator Features

- `[x]` Competitor content analyzer with manual local observations and summary insights.
- `[x]` Trend radar with external RSS/Atom feed import, provider readiness visibility, and local/manual fallback paths.
- `[x]` Thumbnail/title generator with local fallback options and LLM-ready structured output.
- `[x]` Auto caption designer with branded preset generation and timeline clip application.
- `[x]` Brand kit with profile-scoped creative defaults and packaging integration.
- `[x]` Prompt library with profile-scoped reusable templates and archive support.
- `[x]` Character consistency system with reusable profile-scoped character records and prompt packs.
- `[x]` Content calendar with profile-scoped scheduling and idea/script links.
- `[x]` A/B testing support for local experiment planning, variants, winners, and metrics capture.
- `[x]` Comment analyzer with manual import, sentiment/theme/question summaries, and saved analysis runs.
- `[x]` Long-video-to-shorts repurposing with local transcript-to-candidate extraction.
- `[x]` Publishing package generator with platform-ready copy, hashtags, CTA, and notes.
- `[!]` Direct publishing/scheduling APIs: local destination state, provider descriptors, scheduled job queue, and dispatch contract are implemented; live OAuth-backed provider publishing remains blocked on real credentials/provider setup.

## Remaining Work Execution Plan

### Batch A: Local Insight Systems

- `[x]` Extend trend radar beyond manual/local suggestions with external-source import support and provider-status visibility.
- `[x]` Add profile-scoped character consistency records plus reusable prompt packs.
- `[x]` Add comment analysis for manually imported comments with sentiment, themes, questions, and content-request summaries.

### Batch B: Repurposing And Packaging

- `[x]` Add long-video-to-shorts repurposing suggestions from pasted transcripts/scripts.
- `[x]` Add publishing package generation for titles, descriptions, post copy, hashtags, and platform notes.

### Batch C: Publishing Foundations

- `[x]` Add publishing provider descriptors and profile-level destination state.
- `[x]` Add local publish-job/schedule models and APIs that can queue future external provider work without storing raw secrets.
- `[x]` Add Publishing UI that exposes package generation, provider readiness, and scheduled publish jobs.
- `[x]` Mark any live provider work that still needs OAuth credentials or signed-in platform sessions as blocked instead of overstating completeness.

### Batch D: Verification And Closeout

- `[x]` Add focused backend coverage for every new service/API slice.
- `[x]` Re-run backend tests, backend compile verification, and frontend production build.
- `[x]` Re-check Content Studio tabs in the browser after the new views land.
- `[x]` Update Phase 13 statuses and the risks/unknowns section to reflect what is genuinely finished versus externally blocked.

## Final Completion Plan

### Batch E: Local Closeout

- `[x]` Close SQLite connections reliably so the backend test suite no longer emits repeated `ResourceWarning`s.
- `[x]` Add configuration-aware publishing provider readiness so blocked providers explain what is missing.
- `[x]` Add dispatch preflight checks for provider readiness, destination connection, and token-reference presence.
- `[x]` Surface the richer publishing readiness state in Content Studio.

### Batch F: External Completion

- `[!]` Validate Google AI Studio selectors and real audio capture in a signed-in browser session.
- `[!]` Configure real OAuth credentials, secure token references, and provider approvals before claiming live direct publishing is complete.

## Current Risks And Unknowns To Resolve Early

- Current generation jobs only model `image` and `video`; voice jobs will need either a generalized media/job type or a separate queue contract.
- `ProjectDetail` stores a broad JSON `state` blob while SQLite also persists normalized per-project tables; new profile/project links need a clear source-of-truth rule.
- The app currently has no project-owned automated tests visible outside dependency folders, so regression checks will need to be added or documented.
- The active bridge now supports provider-aware adapter testing for Meta and Google AI Studio; live Google AI Studio validation still depends on an authenticated provider session.
- Google AI Studio live automation remains the main external unknown: the local queue/import path, adapter-test path, and audio result reporting are implemented, but final selectors and real audio capture still need validation inside an authenticated AI Studio session.
- SQLite connection lifecycle cleanup is complete; the backend suite now runs without the earlier repeated connection warnings.
- Content Studio introduces app-level navigation beyond the current editor-first shell, so route/layout decisions should be made before large UI work starts.
- Analytics credentials need a secure storage plan before real OAuth-backed integrations are claimed as complete.
- Live publishing remains intentionally blocked until OAuth-backed provider integrations and secure token handling are implemented; local scheduling/job state exists, but no provider is falsely reported as dispatch-ready.

## MVP Definition Of Done

- `[x]` Users can create Content Profiles.
- `[x]` Projects can connect to Content Profiles.
- `[x]` Content Studio opens and supports ideas/scripts.
- `[x]` Script analysis/rewrite supports Estimated Viral Potential.
- `[x]` Agent workflow supports at least idea/script/storyboard preparation.
- `[x]` Scripts can split into narration lines.
- `[x]` Storyboards can be reviewed before generation.
- `[x]` Existing media generation can use improved storyboard prompts.
- `[x]` Timeline draft builder creates a basic editable draft.
- `[x]` Existing editor/transcription/save-load/export flows still work.
- `[x]` This task list stays current as implementation proceeds.
