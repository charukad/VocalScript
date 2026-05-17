# NeuralScribe Editor CapCut Upgrade Implementation Plan

## Goal

Upgrade the existing NeuralScribe editor into a modern creator-first editor with:

1. CapCut-level editing usability for short-form social video work.
2. A more modern, polished, discoverable UI.
3. Advanced AI-assisted editing capabilities that build on NeuralScribe's existing content platform features.

The editor should become fast for casual creators, capable enough for serious short-form work, and still clearly differentiated by NeuralScribe's local-first AI workflow.

## Current Baseline

NeuralScribe already has:

- React/Vite editor shell with media pool, preview, inspector, timeline, export flow, and project save/load.
- Multi-track visual, audio, and text clips.
- Drag/drop timeline placement.
- Undo/redo, snapping, clip splitting, trimming, track mute/solo/lock, and keyframe foundations.
- Local transcription, subtitle editing, caption export/burn-in, FFmpeg export, storyboard generation, narration workflows, and browser bridge generation.
- Content Studio, content profiles, analytics, agents, and creator workflow features.

The biggest remaining editor gap is no longer basic AI support. It is editing depth, render parity, and modern interaction design.

## Product Direction

NeuralScribe should target three layers:

### Layer 1: CapCut-Like Core Editor

- Fast timeline editing.
- Motion/keyframe tools.
- Text and caption design.
- Effects, transitions, and color tools.
- Audio mixing and cleanup.
- Friendly, modern workspace organization.

### Layer 2: Creator Productivity

- Templates.
- Project presets.
- Reusable styles.
- Multi-platform export variants.
- Faster asset handling and better project reliability.

### Layer 3: NeuralScribe Differentiators

- Transcript-based editing.
- Script-to-video workflows.
- Retention-aware timeline suggestions.
- AI rough cuts.
- Storyboard-to-timeline automation.
- Profile-aware creative recommendations.

## Product Principles

1. Keep the editor task-first, not feature-first.
2. Show only the most relevant controls for the current selection.
3. Prefer direct manipulation on the canvas and timeline over form-heavy workflows.
4. Keep AI useful but optional; manual editing must remain excellent.
5. Use a modern UI system instead of accumulating one-off CSS.
6. Maintain compatibility with existing projects and export behavior during each phase.

## Target Workspace Layout

```text
Top Bar
  Project name | save state | undo/redo | aspect ratio | export

Left Rail
  Media | Audio | Text | Captions | Effects | Transitions | Templates | AI

Left Panel
  Contextual asset/tool browser for the selected rail item

Center
  Preview canvas with direct manipulation, guides, safe areas, playback controls

Right Inspector
  Context tabs: Basic | Animation | Audio | Color | Captions | AI

Bottom
  Full-width timeline with tracks, markers, transitions, waveforms, keyframe lanes
```

## Feature Scope

### Must-Have Editor Parity

- Ripple delete and gap closing.
- Ripple trim, roll trim, slip, and slide tools.
- Timeline markers.
- Clip duplication.
- Clip grouping/ungrouping.
- Track visibility toggle.
- Better layer stacking controls.
- Timeline zoom polish and snapping feedback.
- Waveform display.
- Speed changes, reverse, freeze frame, time remapping, speed curves.
- Position keyframes and export-time keyframe rendering.
- Animation presets and easing.
- Transitions library.
- Crop, masking, picture-in-picture, split-screen, and manual transform handles.
- Text shadows, outlines, animated text presets, subtitle templates, and caption line controls.
- Filters, LUTs, blur, vignette, sharpen, blend modes, chroma key, stabilization, and background removal.
- Audio fades, EQ presets, ducking, noise reduction, and voice enhancement.
- Export FPS, bitrate, frame size, format, range, and proxy/render reliability features.

### Advanced Editor Features

- Transcript-based editing.
- Silence and filler-word removal.
- AI rough cuts from transcripts.
- Long-video-to-shorts timeline generation.
- Automatic B-roll placement.
- Retention-risk markers in the timeline.
- Hook-strength feedback for first 3 seconds.
- One-click multi-platform variants.
- Smart reframing and face/speaker tracking.
- Reusable templates, styles, and motion presets.
- Beat detection and rhythm-aware cut suggestions.
- Version history and compare.
- Review comments and collaboration later.

## UI Modernization Scope

### Design System

- Shared design tokens for color, spacing, typography, radius, shadows, and z-index.
- Standardized buttons, inputs, tabs, toolbars, menus, sliders, segmented controls, and empty states.
- One icon system, preferably `lucide-react`.
- Reduced border noise, stronger hierarchy, and better density control.
- Modern dark theme with neutral surfaces and restrained accent usage.

### Editor Shell

- Slimmer, clearer top bar.
- Dedicated left tool rail.
- Contextual left browser panel.
- Resizable panes.
- Inspector tabs instead of one long mixed-control column.
- AI and generation workflows moved into their own surfaces instead of living inside clip inspection.
- Better project status, save state, and quick actions.

### Preview And Canvas

- Larger visual priority for the canvas.
- Direct manipulation handles.
- Safe-area overlays, alignment guides, grids, and rulers.
- Floating clip toolbar.
- Better empty states.

### Timeline

- Stronger clip color coding.
- Better track headers and icons.
- Waveform visuals.
- Visible transitions.
- Keyframe lanes and markers.
- Clearer playhead and snapping affordances.

### Content Studio

- Profile-aware sidebar.
- Better split views for script/storyboard/voice work.
- Less form density.
- More dashboard-like analytics and publishing surfaces.

## Proposed Frontend Architecture

```text
frontend/src/
  components/
    ui/
      Button.tsx
      IconButton.tsx
      Input.tsx
      Select.tsx
      SegmentedControl.tsx
      Tabs.tsx
      Tooltip.tsx
      Panel.tsx
  features/
    editorShell/
      EditorShell.tsx
      TopBar.tsx
      ToolRail.tsx
      WorkspaceLayout.tsx
    editorPanels/
      MediaBrowserPanel.tsx
      TextBrowserPanel.tsx
      EffectsBrowserPanel.tsx
      AiToolsPanel.tsx
    inspector/
      InspectorTabs.tsx
      BasicInspector.tsx
      AnimationInspector.tsx
      AudioInspector.tsx
      ColorInspector.tsx
      CaptionInspector.tsx
    timeline/
      TimelineCanvas.tsx
      TrackHeader.tsx
      TimelineMarkerLane.tsx
      KeyframeLane.tsx
      TransitionLane.tsx
      WaveformLane.tsx
    canvas/
      PreviewCanvas.tsx
      CanvasOverlay.tsx
      TransformHandles.tsx
      SafeAreaOverlay.tsx
    effects/
    captions/
    templates/
```

Existing components can be migrated gradually rather than rewritten all at once.

## Backend / Render Architecture Changes

The current editor already previews some behavior that export must eventually match. The upgrade should ensure preview and render stay aligned.

### Required Render-Side Capabilities

- Keyframed transform export.
- Multi-clip visual compositing.
- Text/caption animation rendering.
- Transitions.
- Filters/effects graph.
- Speed ramps and freeze frames.
- Audio fades, ducking, EQ, and noise processing where practical.
- Masking, chroma key, and picture-in-picture.

### Suggested Render Strategy

1. Define a richer timeline render schema independent of UI components.
2. Add a render-planning layer that converts clips, keyframes, effects, and transitions into FFmpeg filter graphs.
3. Keep export features additive and version-tolerant so old projects still open.
4. Add render-focused tests as soon as export behavior becomes more complex.

## Implementation Phases

## Phase 0: Planning And Baseline Alignment

### Goals

- Establish this document and the matching task list as the editor modernization source of truth.
- Reconcile older editor notes with the new roadmap.
- Confirm current editor capabilities, tests, and limitations before implementation begins.

### Deliverables

- `EDITOR_CAPCUT_UPGRADE_IMPLEMENTATION_PLAN.md`
- `TASK_LIST_EDITOR_CAPCUT_UPGRADE.md`
- Finalized phased roadmap.

### Acceptance

- Existing editor baseline is documented.
- Older roadmap files are treated as supporting references, not the main execution plan.

## Phase 1: Design System And Editor Shell

### Goals

- Modernize the editor's visual foundation without changing editing behavior yet.

### Main Work

- Add UI tokens and reusable component primitives.
- Add one icon library and replace repeated hand-authored icons over time.
- Split the current editor shell into top bar, left rail, contextual panel, preview center, right inspector, and timeline region.
- Add resizable panes.
- Move AI/generation tools out of the clip inspector into dedicated rail/panel destinations.
- Refresh empty/loading/error states.

### Likely Files

- `frontend/src/index.css`
- `frontend/src/App.css`
- `frontend/src/components/editor/EditorLayout.tsx`
- `frontend/src/components/editor/Navbar.tsx`
- New files under `frontend/src/components/ui/`
- New files under `frontend/src/features/editorShell/`

### Acceptance

- Editor has a modern shell with clear hierarchy.
- Current workflows still function.
- UI is usable on common desktop viewport sizes.

## Phase 2: Timeline Editing Parity

### Goals

- Make the timeline feel like a serious short-form editor.

### Main Work

- Add markers.
- Add duplicate clip.
- Add grouping/ungrouping.
- Add track visibility.
- Add ripple delete and gap closing.
- Add ripple trim, roll trim, slip, and slide operations.
- Improve snapping feedback and magnetic placement behavior.
- Add stronger layer ordering controls.
- Add timeline command routing and shortcut coverage.

### Likely Files

- `frontend/src/store/editorStore.ts`
- `frontend/src/components/timeline/*`
- `frontend/src/types/index.ts`
- `backend/src/domain/models/project.py`
- project persistence files as needed

### Acceptance

- Editors can perform core timeline edits without workarounds.
- New operations persist through save/load.
- Undo/redo covers the new timeline actions.

## Phase 3: Preview Canvas And Inspector Modernization

### Goals

- Make the preview interactive and the inspector contextual.

### Main Work

- Add direct manipulation handles for crop/transform.
- Add alignment guides, safe areas, grids, and rulers.
- Add floating quick actions for selected clips.
- Split inspector into tabs:
  - Basic
  - Animation
  - Audio
  - Color
  - Captions
  - AI
- Improve numeric controls with sliders, steppers, toggles, and presets.

### Likely Files

- `frontend/src/components/editor/PreviewWindow.tsx`
- `frontend/src/components/editor/Inspector.tsx`
- New files under `frontend/src/features/canvas/`
- New files under `frontend/src/features/inspector/`

### Acceptance

- Users can position, crop, and inspect clips more naturally.
- The inspector is shorter, clearer, and selection-aware.

## Phase 4: Motion, Keyframes, And Speed Tools

### Goals

- Bring motion editing up to modern creator-editor expectations.

### Main Work

- Add position keyframes.
- Add easing presets and graph editing.
- Add animation presets.
- Show keyframes in the timeline.
- Apply keyframes during export.
- Add speed changes, reverse, freeze frame, time remapping, and speed curves.

### Acceptance

- Preview and export match for keyframed transforms.
- Users can build common zoom/pan/motion effects without manual hacks.

## Phase 5: Text, Captions, And Titles

### Goals

- Turn captions and text into a strong creator workflow rather than a utility.

### Main Work

- Add manual subtitle creation.
- Add subtitle line-length and wrap controls.
- Add title presets.
- Add text shadow, outline, background, stroke, and animation controls.
- Add caption template packs.
- Add karaoke/word-highlighting modes.
- Add safe-area aware caption placement.

### Acceptance

- Text and captions can be styled to social-video quality.
- Caption output remains editable and export-safe.

## Phase 6: Effects, Color, And Compositing

### Goals

- Add the visual finish users expect from a creator editor.

### Main Work

- Add transitions library.
- Add filter presets and LUT import.
- Add blur, vignette, sharpen, clarity, glitch/VHS/light leak overlays.
- Add blend modes.
- Add crop, masks, picture-in-picture, split-screen, borders, and frames.
- Add chroma key, spill suppression, edge feathering, basic stabilization, and background removal hooks.
- Expand color tools with white balance, exposure, highlights/shadows, and RGB-style adjustments.

### Acceptance

- Users can create polished social edits without leaving NeuralScribe.
- Export rendering supports the chosen effects stack.

## Phase 7: Audio System Upgrade

### Goals

- Make audio editing good enough for narration, music, and social content.

### Main Work

- Add visible waveforms.
- Add fade curves.
- Add EQ presets.
- Add noise reduction and voice enhancement.
- Add auto ducking under narration.
- Add silence detection/removal.
- Add beat detection and music markers.
- Add audio/video sync helpers.

### Acceptance

- Users can mix narration, music, and effects without external tools.

## Phase 8: AI-Assisted Editing

### Goals

- Use NeuralScribe's existing AI foundation to beat conventional editors.

### Main Work

- Add transcript-based editing.
- Add filler-word and silence removal suggestions.
- Add AI rough cuts.
- Add long-video-to-shorts timeline generation.
- Add automatic B-roll placement suggestions.
- Add retention-risk markers and slow-section alerts.
- Add hook-strength guidance for the first seconds.
- Add one-click platform variants using project/profile settings.

### Acceptance

- AI can create a useful first edit while preserving manual control.
- Suggestions are reviewable, not silently destructive.

## Phase 9: Templates, Assets, Export, And Reliability

### Goals

- Improve repeatability, project trust, and shipping quality.

### Main Work

- Add reusable reels/shorts templates.
- Add custom template saving.
- Add stock asset integrations or local libraries.
- Add autosave, version history, recent projects, relink flow, and missing-media warnings.
- Add proxy media and render cache planning.
- Add export frame rate, bitrate, 2K/4K presets, format choice, export ranges, and hardware-acceleration hooks.

### Acceptance

- Repeated content workflows become much faster.
- Projects are safer to resume and easier to deliver.

## Phase 10: Collaboration And Advanced Workflow

### Goals

- Add higher-end team features after the solo editor is mature.

### Main Work

- Review comments on the timeline.
- Shareable draft links.
- Approval states.
- Team asset libraries.
- Version compare.
- Role-aware collaboration surfaces.

### Acceptance

- Teams can review and approve edits without breaking local-first foundations.

## Recommended Build Order

1. Phase 1: Design system and shell.
2. Phase 2: Timeline parity.
3. Phase 3: Preview/canvas and inspector.
4. Phase 4: Motion and speed.
5. Phase 5: Text and captions.
6. Phase 6: Effects and compositing.
7. Phase 7: Audio.
8. Phase 8: AI-assisted editing.
9. Phase 9: templates/export/reliability.
10. Phase 10: collaboration.

## First Milestone Definition

The first serious editor milestone is complete when:

- The new shell is live.
- Timeline markers, duplicate, grouping, visibility, and ripple delete work.
- Preview canvas has direct transform handles and safe areas.
- Inspector tabs exist.
- Position keyframes export correctly.
- Captions are styleable enough for social video.

That milestone would already make the product feel dramatically more modern than the current editor.

## Risks And Dependencies

- Export complexity will grow quickly once keyframes, transitions, speed ramps, and effects become real render features.
- UI modernization should avoid a giant rewrite; migrate shell and panels incrementally.
- Some advanced effects may need libraries or native tooling beyond FFmpeg-only shortcuts.
- Collaboration features should stay later until project/version semantics are stable.
- Existing AI/editor behavior must remain usable during the transition.

## Definition Of Done For "CapCut-Like"

NeuralScribe can reasonably be called CapCut-like when a creator can:

- Build a short-form edit quickly from media or script.
- Use timeline tools without friction.
- Add styled captions, text, effects, transitions, and audio polish.
- Animate clips with keyframes and speed tools.
- Export platform-ready versions.
- Do all of that in a modern interface that feels organized and responsive.

The product becomes distinctly NeuralScribe when those same workflows are helped by scripts, profiles, agents, analytics, and local-first AI.
