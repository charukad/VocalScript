# NeuralScribe Improvement Tasks

## Phase 1: Stabilize Current Editor

- [x] Make text tracks visible and editable in the timeline.
- [x] Make text clips movable, selectable, removable, trimmable, and splittable like other clips.
- [x] Fix missing theme variables used by the export modal and text controls.
- [x] Route all export entry points through the export settings modal.
- [x] Improve export error handling so FFmpeg errors are easier to understand.
- [x] Add ignore rules for generated/runtime artifacts (`.DS_Store`, `__pycache__`, build output, logs, exported media).
- [ ] Remove already tracked generated/system artifacts from the repository index.
- [x] Verify frontend build and backend syntax checks.

## Phase 2: Caption Workflow

- [x] Add an editable transcript/subtitle panel.
- [x] Add subtitle style controls.
- [x] Support burned-in subtitles in exported video.
- [x] Support `.srt` and `.vtt` downloads.
- [ ] Add line wrapping and subtitle length controls.

## Phase 3: Timeline Editing

- [x] Add undo/redo.
- [x] Add snapping/magnet mode.
- [ ] Add ripple delete and gap closing.
- [x] Make track mute/solo/lock controls functional.
- [x] Add precise time inputs for clip start and duration.

## Phase 4: Export And Project Reliability

- [x] Add export progress and cancel state.
- [x] Add export presets for YouTube, Shorts/Reels, and square video.
- [x] Add audio-only export.
- [ ] Add project save/load.
- [ ] Add autosave and recent projects.
- [ ] Warn when media files are missing.

## Phase 5: AI Features

- [ ] Add word-level timestamps.
- [ ] Add subtitle translation.
- [ ] Add transcript summaries.
- [ ] Add silence removal.
- [ ] Add chapter detection.
- [ ] Add short-clip suggestions from long videos.
