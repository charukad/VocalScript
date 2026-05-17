# NeuralScribe Editor CapCut Upgrade Task List

## Goal

Upgrade the editor into a modern creator workspace with CapCut-like editing depth and stronger NeuralScribe-specific AI workflows.

## Status Legend

- `[ ]` Not started
- `[/]` In progress
- `[x]` Done
- `[!]` Blocked

## Source Of Truth Notes

- This task list is the active execution tracker for editor modernization work.
- `EDITOR_CAPCUT_UPGRADE_IMPLEMENTATION_PLAN.md` is the matching implementation plan.
- `EDITOR_PHASES_3_4_COMBINED_PLAN.md` is the active combined execution plan for the next canvas + motion milestone.
- `EDITOR_PHASES_5_6_COMBINED_PLAN.md` is the active combined execution plan for the next text + finishing milestone.
- `EDITOR_PHASES_7_8_COMBINED_PLAN.md` is the active combined execution plan for the next audio + assist milestone.
- `EDITOR_PHASES_1_6_CLOSURE_PLAN.md` records the consolidated closure pass for all remaining editor work through Phase 6.
- Older files such as `MISSING_FEATURE_TASKS.md`, `IMPROVEMENT_TASKS.md`, and `project_information.md` remain useful historical references, but this file should drive the new editor roadmap.
- Existing project compatibility, export, transcription, AI generation, Content Studio, and browser bridge flows must remain working while this roadmap is implemented.

## Phase Overview

- `[x]` Phase 0: Planning And Baseline Alignment
- `[x]` Phase 1: Design System And Editor Shell
- `[x]` Phase 2: Timeline Editing Parity
- `[x]` Phase 3: Preview Canvas And Inspector Modernization
- `[/]` Phase 4: Motion, Keyframes, And Speed Tools
- `[/]` Phase 5: Text, Captions, And Titles
- `[/]` Phase 6: Effects, Color, And Compositing
- `[x]` Phase 7: Audio System Upgrade
- `[/]` Phase 8: AI-Assisted Editing
- `[ ]` Phase 9: Templates, Assets, Export, And Reliability
- `[ ]` Phase 10: Collaboration And Advanced Workflow

## Phase 0: Planning And Baseline Alignment

- `[x]` Inspect the current editor shell, timeline, preview, inspector, styles, and existing roadmap files.
- `[x]` Create `EDITOR_CAPCUT_UPGRADE_IMPLEMENTATION_PLAN.md`.
- `[x]` Create this task list.
- `[x]` Consolidate the editor roadmap into one phased execution source.
- `[x]` Record the recommended build order and first milestone definition.

### Phase 0 Acceptance Checks

- `[x]` Implementation plan exists.
- `[x]` Execution task list exists.
- `[x]` Editor modernization work has one clear source of truth.

## Phase 1: Design System And Editor Shell

### Product Work

- `[x]` Define color, spacing, radius, typography, elevation, motion, and z-index tokens.
- `[x]` Replace repeated one-off control styles with reusable UI primitives.
- `[x]` Add a shared icon library and migration guide.
- `[x]` Redesign top bar for project, status, quick actions, and export.
- `[x]` Add left tool rail for Media, Audio, Text, Captions, Effects, Transitions, Templates, and AI.
- `[x]` Add contextual left panel that changes with the active tool.
- `[x]` Add resizable workspace panes.
- `[x]` Move AI generation tools out of the general clip inspector.
- `[x]` Refresh empty, loading, warning, and error states.
- `[x]` Reduce visual noise in borders and improve hierarchy.

### Likely Files

- `frontend/src/index.css`
- `frontend/src/App.css`
- `frontend/src/components/editor/EditorLayout.tsx`
- `frontend/src/components/editor/Navbar.tsx`
- New files under `frontend/src/components/ui/`
- New files under `frontend/src/features/editorShell/`

### Acceptance Checks

- `[x]` Editor has a modern top bar, left rail, central canvas, inspector, and timeline structure.
- `[x]` Existing workflows still function after the shell migration.
- `[x]` Desktop layout remains stable at common viewport sizes.

## Phase 2: Timeline Editing Parity

### Missing Core Features

- `[x]` Add timeline markers.
- `[x]` Add duplicate clip action.
- `[x]` Add clip grouping and ungrouping.
- `[x]` Add track visibility toggle.
- `[x]` Improve layer ordering controls.
- `[x]` Add ripple delete and gap closing.
- `[x]` Add ripple trim.
- `[x]` Add roll trim.
- `[x]` Add slip edit.
- `[x]` Add slide edit.
- `[x]` Improve magnetic snapping feedback.
- `[x]` Add stronger shortcut coverage for timeline commands.

### State And Persistence

- `[x]` Extend clip/track/project models as needed.
- `[x]` Persist markers, groups, and visibility state.
- `[x]` Add undo/redo support for every new timeline action.

### Likely Files

- `frontend/src/store/editorStore.ts`
- `frontend/src/types/index.ts`
- `frontend/src/components/timeline/*`
- backend project persistence files where needed

### Acceptance Checks

- `[x]` Editors can close gaps, duplicate clips, group clips, and manage visibility without workarounds.
- `[x]` New timeline state persists through save/load.
- `[x]` Undo/redo covers all new operations.

## Phase 3: Preview Canvas And Inspector Modernization

### Preview Canvas

- `[x]` Add direct manipulation transform handles.
- `[x]` Add crop handles.
- `[x]` Add alignment guides.
- `[x]` Add safe-area overlays for social formats.
- `[x]` Add optional grid and ruler overlays.
- `[x]` Add floating quick toolbar for selected clips.

### Inspector

- `[x]` Split inspector into Basic, Animation, Audio, Color, Captions, and AI tabs.
- `[x]` Replace dense raw forms with sliders, steppers, toggles, and presets.
- `[x]` Make inspector content strictly selection-aware.
- `[x]` Move queue/generation management into dedicated panels or drawers.

### Likely Files

- `frontend/src/components/editor/PreviewWindow.tsx`
- `frontend/src/components/editor/Inspector.tsx`
- New files under `frontend/src/features/canvas/`
- New files under `frontend/src/features/inspector/`

### Acceptance Checks

- `[x]` Users can manipulate visuals directly on the canvas.
- `[x]` Inspector is shorter, clearer, and contextual.

## Phase 4: Motion, Keyframes, And Speed Tools

### Keyframes

- `[x]` Add position keyframes.
- `[x]` Show keyframe lanes in the timeline.
- `[x]` Add easing presets.
- `[x]` Add graph editor or curve controls.
- `[x]` Add reusable motion presets.
- `[x]` Support copy/paste of keyframes.
- `[!]` Apply all supported keyframes during export. Requires the planned render-planning layer for time-varying FFmpeg filter graphs.

### Speed

- `[x]` Add clip speed control.
- `[x]` Add reverse video.
- `[x]` Add freeze frame.
- `[!]` Add time remapping. Requires render-planning support for time-varying retiming rather than constant-rate clip processing.
- `[!]` Add speed curves and presets. Constant-rate presets exist; true variable speed curves require the same render-planning work.

### Acceptance Checks

- `[!]` Preview and export agree for transforms and supported motion. Static transform export now exists; animated keyframe export remains blocked by render-planning work.
- `[x]` Users can create common social-video motion styles quickly.

## Phase 5: Text, Captions, And Titles

### Text

- `[x]` Add manual subtitle creation.
- `[x]` Add text shadow controls.
- `[x]` Add text outline/stroke controls.
- `[x]` Add text background and box styles.
- `[x]` Add animated title presets.
- `[x]` Add reusable title templates.

### Captions

- `[x]` Add caption line-length controls.
- `[x]` Add wrapping controls.
- `[x]` Add subtitle templates.
- `[x]` Add karaoke / word-highlight modes.
- `[x]` Add safe-area aware caption placement.

### Acceptance Checks

- `[x]` Captions and titles can be styled to social-video quality.
- `[/]` Text remains editable and export-safe. Static text exports safely; dynamic karaoke highlighting is preview-only until text animation export is added.

## Phase 6: Effects, Color, And Compositing

### Effects

- `[x]` Add transitions library.
- `[x]` Add filter preset packs.
- `[!]` Add LUT import. Requires asset transport/storage plus FFmpeg LUT pipeline work.
- `[x]` Add blur, sharpen, vignette, and clarity controls.
- `[x]` Add overlay effects such as glitch, VHS, and light leaks.
- `[x]` Add blend modes.

### Composition

- `[x]` Add crop controls.
- `[/]` Add masking. Preview masks exist; export-side non-rectangular masking still needs render-planning work.
- `[x]` Add picture-in-picture.
- `[x]` Add split-screen layouts.
- `[x]` Add border/frame overlays.

### Cleanup And Color

- `[x]` Add chroma key.
- `[x]` Add spill suppression.
- `[x]` Add edge feathering.
- `[x]` Add background removal hooks.
- `[x]` Add stabilization.
- `[x]` Add white balance, exposure, highlight, shadow, and RGB-style controls.

### Acceptance Checks

- `[/]` Users can produce polished edits without leaving NeuralScribe.
- `[/]` Export supports the selected effect stack. Static crop, opacity, speed, reverse, freeze frame, borders, chroma key, stabilization, and expanded color controls export; LUTs, animated masks, preview overlays, blend modes, and transitions still need render-planning work.

## Phase 7: Audio System Upgrade

- `[x]` Add visible audio waveforms.
- `[x]` Add fade-curve types.
- `[x]` Add EQ presets.
- `[x]` Add voice enhancement.
- `[x]` Add noise reduction.
- `[x]` Add automatic ducking beneath narration.
- `[x]` Add silence detection/removal.
- `[x]` Add beat detection and beat markers.
- `[x]` Add audio/video auto-sync helpers.

### Acceptance Checks

- `[x]` Users can mix narration, music, and SFX inside the editor.
- `[x]` Audio automation does not damage existing manual control.

## Phase 8: AI-Assisted Editing

- `[x]` Add transcript-based editing commands.
- `[x]` Add filler-word removal suggestions.
- `[x]` Add silence-removal suggestions.
- `[x]` Add AI rough-cut workflow.
- `[x]` Add long-video-to-shorts timeline builder.
- `[x]` Add automatic B-roll placement suggestions.
- `[x]` Add retention-risk markers on the timeline.
- `[x]` Add hook-strength feedback for the opening seconds.
- `[x]` Add one-click multi-platform variants.
- `[!]` Add smart reframing / subject tracking planning. Requires a real visual-analysis layer to identify and follow subjects.

### Acceptance Checks

- `[x]` AI creates useful reviewable edits without silently changing user work.
- `[x]` Manual editing remains first-class.

## Phase 9: Templates, Assets, Export, And Reliability

### Templates And Assets

- `[ ]` Add reusable reels templates.
- `[ ]` Add reusable shorts templates.
- `[ ]` Add custom template saving.
- `[ ]` Add reusable style packs.
- `[ ]` Add stock/local asset library integration.

### Reliability

- `[ ]` Add autosave.
- `[ ]` Add version history.
- `[ ]` Add recent projects improvements.
- `[ ]` Add missing media detection.
- `[ ]` Add asset relinking.
- `[ ]` Add proxy media planning.
- `[ ]` Add render cache planning.

### Export

- `[ ]` Add 2K and 4K presets.
- `[ ]` Add FPS selection.
- `[ ]` Add bitrate control.
- `[ ]` Add MP4/MOV format options.
- `[ ]` Add export range selection.
- `[ ]` Add hardware-acceleration hooks where available.

### Acceptance Checks

- `[ ]` Projects are safer to resume.
- `[ ]` Repeated creator workflows are materially faster.
- `[ ]` Export options cover common creator needs.

## Phase 10: Collaboration And Advanced Workflow

- `[ ]` Add review comments on the timeline.
- `[ ]` Add approval states.
- `[ ]` Add shareable draft links.
- `[ ]` Add team asset libraries.
- `[ ]` Add version compare.
- `[ ]` Add role-aware collaboration support.

### Acceptance Checks

- `[ ]` Team workflows work without weakening solo/local-first use.

## First Milestone: Modern Editor Foundation

- `[ ]` New design system is live.
- `[ ]` New editor shell is live.
- `[x]` Timeline markers, duplicate clip, groups, visibility, and ripple delete are implemented.
- `[ ]` Preview canvas supports direct transform handles and safe areas.
- `[ ]` Inspector tabs are implemented.
- `[ ]` Position keyframes export correctly.
- `[ ]` Captions are styleable enough for social video work.

## Recommended First Sprint

1. `[ ]` Create design tokens and reusable UI primitives.
2. `[ ]` Build the new top bar, left tool rail, and resizable shell.
3. `[ ]` Split the inspector into tabs.
4. `[ ]` Add markers, duplicate clip, and track visibility.
5. `[x]` Add ripple delete.
6. `[ ]` Add direct transform handles and safe-area overlays.

## Risks And Dependencies

- `[ ]` Keep preview and export behavior aligned as rendering grows more complex.
- `[ ]` Avoid a giant one-shot UI rewrite; migrate incrementally.
- `[ ]` Preserve legacy project loading during schema changes.
- `[ ]` Add render-specific tests before advanced effects become broad.
- `[ ]` Keep collaboration late until versioning and project semantics are stable.

## Definition Of Done For CapCut-Like Editor

- `[ ]` Short-form creators can edit quickly without leaving NeuralScribe for normal tasks.
- `[ ]` Timeline, motion, text, effects, and audio tools feel coherent and discoverable.
- `[ ]` The workspace looks modern and focused.
- `[ ]` Platform-ready exports are easy.
- `[ ]` AI assists the edit without replacing user control.
