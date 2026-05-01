# Task List 4: Auto Animate Video

## Phase 1: Contracts And Architecture

- [x] Create `TASK_LIST_4.md` without deleting or replacing previous task lists.
- [x] Define Auto Animate as a separate feature from Auto Generate Video.
- [x] Confirm Auto Generate routes, store fields, and UI behavior remain unchanged.
- [x] Add animation-specific backend route namespace: `/api/animation`.
- [x] Add animation-specific frontend state separate from storyboard/generation state.
- [x] Define animation plan schema for scenes, layers, assets, motions, and reuse decisions.
- [x] Define asset memory schema for characters, backgrounds, props, icons, overlays, and style tags.
- [x] Document V1 renderer decision: use existing timeline/keyframes first.

Manual tests after Phase 1:

- [ ] Confirm Auto Generate Video still opens and behaves the same.
- [x] Confirm no existing task list was deleted or overwritten.
- [x] Confirm new animation models do not depend on generation job models.

## Phase 2: Animation Planner Backend

- [x] Add animation domain models: `AnimationPlan`, `AnimationScene`, `AnimationAssetNeed`, `AnimationLayer`, `AnimationMotion`.
- [x] Add `AnimationPlannerService`.
- [x] Add transcript-to-animation-plan endpoint.
- [x] Support planning from existing transcript/captions.
- [x] Support planning from uploaded audio by reusing transcription service.
- [x] Add rule-based fallback planner when no LLM is configured.
- [x] Add optional LLM planning using existing local/OpenRouter/Gemini LLM infrastructure.
- [x] Make planner classify assets as `reuse`, `generate`, or `optional`.

Manual tests after Phase 2:

- [x] Generate animation plan from transcript.
- [x] Generate animation plan from audio.
- [x] Confirm planner returns reusable assets instead of one generated clip per scene.
- [x] Confirm fallback mode works without API keys or local LLM.

## Phase 3: Asset Memory And Reuse

- [x] Add project-level animation asset library.
- [x] Store reusable asset metadata in project save state.
- [x] Match needed assets against existing project assets by type, name, style, and tags.
- [x] Mark missing assets before generation.
- [x] Add asset statuses: `available`, `missing`, `queued`, `generated`, `failed`.
- [x] Prevent duplicate asset generation for the same character/background/prop.
- [x] Allow users to manually assign an existing asset to a missing asset need.

Manual tests after Phase 3:

- [ ] Create a plan with repeated character/background needs.
- [ ] Confirm repeated assets are listed once.
- [ ] Confirm existing project assets can be reused.
- [ ] Confirm only missing assets are selected for generation.

## Phase 4: Animation UI Panel

- [x] Add a new `Auto Animate Video` panel beside the current editor tools.
- [x] Do not modify `AutoGeneratePanel` behavior.
- [x] Add source selector for audio, video, or existing captions.
- [x] Add animation style input with flexible free-text style support.
- [x] Show generated animation scenes.
- [x] Show reusable asset list grouped by character, background, prop, icon, text, and overlay.
- [x] Show which assets will be reused and which are missing.
- [x] Add approve/edit controls for scenes, assets, and motion notes.

Manual tests after Phase 4:

- [ ] Open Auto Animate panel.
- [ ] Confirm Auto Generate panel still works.
- [ ] Generate a plan and edit one scene.
- [ ] Assign an existing asset to a missing need.
- [ ] Confirm UI state saves with the project.

## Phase 5: Generate Missing Assets Only

- [x] Add animation asset generation job creation separate from storyboard scene generation.
- [x] Reuse existing browser bridge/provider infrastructure only through a separate animation API adapter.
- [x] Queue one job per missing reusable asset, not one job per scene.
- [x] Store generated assets in the project asset library.
- [x] Attach provider prompt, negative prompt, style, and tags to each generated asset.
- [x] Support retry for failed asset jobs.
- [x] Prevent generated animation assets from automatically entering the old Auto Generate scene flow.

Manual tests after Phase 5:

- [ ] Plan a video with 8 scenes and 3 reusable assets.
- [ ] Confirm only the 3 missing assets are queued.
- [ ] Confirm generated assets appear in the animation asset library.
- [ ] Confirm failed assets can be retried.
- [ ] Confirm Auto Generate job queue remains unaffected.

## Phase 6: Build Animated Timeline

- [x] Convert approved animation plan into layered timeline clips.
- [x] Place backgrounds, characters, props, icons, text, and captions on separate visual/text tracks.
- [x] Create clips with correct scene timing.
- [x] Apply motion presets as timeline keyframes where supported.
- [x] Add basic presets: fade, slide, pop, zoom, pan, float, bounce, and caption highlight.
- [x] Use existing trim/move/delete/edit behavior after clips are created.
- [x] Add placeholder clips for missing or failed assets.

Manual tests after Phase 6:

- [ ] Build timeline from approved animation plan.
- [ ] Confirm clips are layered correctly.
- [ ] Confirm generated assets are reused across multiple scenes.
- [ ] Confirm user can edit created clips manually.
- [ ] Confirm missing assets become visible placeholders.

## Phase 7: Preview, Export, And Reliability

- [x] Preview Auto Animate timeline using existing preview system.
- [x] Export through existing export path for V1.
- [ ] Verify text clips, overlays, and static asset layers render correctly.
- [x] Document current V1 limitation: only keyframes supported by existing export path will render.
- [x] Add graceful warnings for unsupported animation motions.
- [x] Save animation plan, asset library, and timeline links in project state.
- [x] Add recovery behavior when source assets are missing.

Manual tests after Phase 7:

- [ ] Save and reload a project with an animation plan.
- [ ] Preview the generated animated timeline.
- [ ] Export a simple animated video.
- [ ] Confirm unsupported motions show clear warnings.
- [ ] Confirm existing Auto Generate exports still work.

## Phase 8: Advanced Animation Roadmap

- [x] Add character pose libraries.
- [x] Add expression libraries.
- [x] Add talking-mouth/lip-sync placeholders.
- [x] Add scene layout templates for 16:9, 9:16, and 1:1.
- [x] Add kinetic caption templates.
- [x] Add transcript-triggered motion cues.
- [x] Add camera brain for pan, push-in, pull-out, and parallax.
- [x] Evaluate Remotion renderer as a future optional export path.

Manual tests after Phase 8:

- [x] Reuse one character across multiple poses.
- [x] Apply different layout templates.
- [x] Generate kinetic captions from transcript.
- [x] Confirm future renderer work does not break V1 timeline workflow.

## V1 Implementation Notes

- [x] Auto Animate V1 uses the existing timeline and export path.
- [x] Scale, opacity, and text overlay keyframes are represented on timeline clips.
- [x] Position-style motions such as slide, pan, float, and parallax now create editable x/y keyframes for preview.
- [x] Remotion is intentionally not part of V1.
- [x] Phase 8 adds advanced cue metadata while keeping the V1 timeline/export workflow as the active renderer.

## Stabilization Pass: 2026-05-01

- [x] Sync Auto Animate jobs and generated media across the whole project, not only the current batch.
- [x] Add a generated-media shelf so already imported Auto Animate assets are visible in the panel.
- [x] Keep Generate Asset and Find Media controls visible when a job record is missing or stale.
- [x] Make failed animation asset jobs retry from the missing-assets workflow instead of silently reusing stale failures.
- [x] Reset stale `queued` asset needs back to `missing` when backend jobs no longer exist.
- [x] Add x/y keyframe support to preview and Inspector controls.
- [x] Add procedural character gesture presets: talking bob, hand wave, point, and walk cycle.
- [x] Add a reusable narrator gesture hand layer to animation plans so hand movement can be built from still assets instead of generated video clips.
- [x] Harden the bridge Clear All flow so stale provider results are ignored after jobs are cleared.
- [x] Stop the extension from force-reloading the Meta tab for every job.
- [x] Retry Meta content-script messages when Chrome closes the message channel during page navigation.
- [x] Add richer Meta prompt-input diagnostics to failed jobs in the extension panel.
