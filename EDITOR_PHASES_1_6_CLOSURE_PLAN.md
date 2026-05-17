# Editor Phases 1-6 Closure Plan

## Goal

Close the remaining editor modernization work through Phase 6 in one coordinated pass while keeping the current editor, export, transcription, AI generation, and project save/load flows working.

## Execution Strategy

1. Finish the editor shell and workflow gaps first.
2. Add missing timeline editing primitives and make the existing multi-select/grouping model visible in the UI.
3. Finish direct-manipulation editing with crop controls and improve inspector feedback.
4. Add the remaining practical motion, title, caption, effects, color, and composition controls that fit the current architecture.
5. Extend the current export pipeline where the existing FFmpeg compiler can safely support a feature.
6. Mark items as blocked when they need a larger render-planning rewrite instead of pretending a partial UI control is full support.

## Work Batches

### Batch A: Shell And Timeline Closure

- Shared empty/loading/error state component.
- Clearer visual hierarchy with quieter panel borders.
- Multi-select, group, and ungroup controls.
- Shortcut coverage for grouping and edit nudges.
- Ripple trim, roll trim, slip, and slide edit actions.

### Batch B: Canvas And Inspector Closure

- Crop data model, crop handles, and crop inspector controls.
- Cleaner selection-aware inspector messaging.
- Keyframe curve preview controls.
- Speed controls and speed presets.

### Batch C: Text, Effects, And Composition Closure

- Animated title presets.
- Karaoke preview mode for caption/text clips.
- Transition presets.
- Overlay effects and blend-mode controls.
- Composition presets for picture-in-picture and split screen.
- Border/frame controls, mask controls, chroma key controls, stabilization hook, and expanded color controls.

### Batch D: Export And Verification

- Export support for the subset the current compiler can safely render: static crop, opacity, speed, reverse, freeze frame, borders, chroma key, stabilization, and expanded color controls.
- Browser smoke test for the modernized editor.
- Build and backend compile checks.
- Update the task list with completed and blocked items plus the reason for each blocker.

## Explicit Blocker Boundary

The current export path is clip-by-clip FFmpeg composition without a render-planning layer. Full fidelity for dynamic keyframe animation export, timeline-level transitions, LUT file workflows, advanced masks, true background removal, and variable speed curves requires the render-planning layer already identified in the implementation plan. If those remain incomplete after this pass, they should be marked `[!] Blocked` with that concrete dependency.
