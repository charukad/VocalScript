# Task List 3: Auto Video Generation With Chrome Bridge

## Phase 1: Contracts And Architecture

- [x] Finalize storyboard scene schema.
- [x] Finalize generation job schema.
- [x] Finalize Chrome extension bridge message protocol.
- [x] Decide provider order: Meta first or Grok first.
- [x] Decide extension folder path.
- [x] Add backend config values for local LLM and browser bridge.
- [x] Document manual testing checklist for each phase.

Manual tests after Phase 1:

- [ ] Read the plan and confirm the full flow is correct.
- [ ] Confirm no paid API is required.
- [ ] Confirm third-party extensions will not be modified.

## Phase 2: Storyboard Backend MVP

- [x] Add generation/storyboard backend models.
- [x] Add transcript-to-scenes rule-based storyboard service.
- [x] Add optional Ollama local LLM service.
- [x] Add optional LM Studio/OpenAI-compatible local server support.
- [x] Add optional OpenRouter free-model support through environment variables.
- [x] Add optional Gemini support through environment variables.
- [x] Add JSON validation and timing repair for LLM output.
- [x] Add endpoint to create storyboard from existing transcript.
- [x] Add endpoint to create storyboard from audio/transcription result.
- [x] Add transcript-only endpoint that does not export media.

Manual tests after Phase 2:

- [ ] Import audio.
- [ ] Generate or reuse transcript.
- [ ] Generate transcript without exporting audio or video.
- [ ] Create storyboard scenes.
- [ ] Confirm scene start/end times are valid.
- [ ] Confirm prompts are readable and match the transcript.
- [ ] Test fallback mode with no local LLM running.
- [ ] Test OpenRouter mode with a rotated key stored in `.env`.
- [ ] Test Gemini mode with `GEMINI_API_KEY` stored in `.env`.

## Phase 3: Storyboard Frontend UI

- [x] Add Auto Generate Video panel.
- [x] Add source audio selector.
- [x] Add provider selector.
- [x] Add media type selector.
- [x] Add visual style selector.
- [x] Add storyboard generation button.
- [x] Add editable scene list.
- [x] Add add/delete/duplicate scene actions.
- [x] Add approve storyboard action.
- [x] Add transcript-only action in the inspector.
- [x] Reuse transcript results for SRT/VTT downloads and editable captions.
- [x] Allow transcript captions to become timeline text clips.

Manual tests after Phase 3:

- [ ] Open Auto Generate Video panel.
- [ ] Select an audio clip.
- [ ] Click Generate Transcript without opening export.
- [ ] Download SRT and VTT from the transcript result.
- [ ] Edit one caption and confirm downloads update.
- [ ] Add transcript captions to the timeline.
- [ ] Generate storyboard.
- [ ] Edit a scene prompt.
- [ ] Add a scene.
- [ ] Delete a scene.
- [ ] Confirm UI state does not reset unexpectedly.

## Phase 4: Generation Queue Backend

- [x] Add generation job queue service.
- [x] Add queued/running/completed/failed/canceled statuses.
- [x] Add job create endpoint.
- [x] Add job list endpoint.
- [x] Add job cancel endpoint.
- [x] Add job retry endpoint.
- [x] Add generated media storage folder.
- [x] Add endpoint for extension to submit job result.
- [x] Add endpoint for frontend to fetch generated media.
- [x] Add worker claim endpoint.
- [x] Add job status update endpoint.

Manual tests after Phase 4:

- [ ] Create jobs from approved scenes.
- [ ] See jobs in queued state.
- [ ] Cancel a queued job.
- [ ] Mark a mock job as completed.
- [ ] Retry a failed mock job.
- [ ] Confirm generated files are saved outside git-tracked source.

## Phase 5: Chrome Extension Bridge MVP

- [x] Create our own Manifest V3 extension.
- [x] Add side panel/status page.
- [x] Add background service worker.
- [x] Add backend WebSocket connection.
- [x] Add extension registration message.
- [x] Add connected/disconnected UI state.
- [x] Add heartbeat/reconnect behavior.
- [x] Add local session token or pairing code.

Manual tests after Phase 5:

- [ ] Load unpacked extension in Chrome.
- [ ] Start backend.
- [ ] Confirm extension connects.
- [ ] Stop backend.
- [ ] Confirm extension disconnects.
- [ ] Restart backend.
- [ ] Confirm extension reconnects.

## Phase 6: Provider Adapter MVP

- [x] Add provider adapter interface.
- [x] Add Meta provider content script.
- [x] Add provider tab open/reuse logic.
- [x] Add prompt input detection.
- [x] Add prompt fill action.
- [x] Add generate button click action.
- [x] Add result DOM observer.
- [x] Add media URL extraction.
- [x] Add manual-action-needed status for login/captcha.
- [x] Add result reporting back to backend.

Manual tests after Phase 6:

- [ ] Log into selected provider manually.
- [ ] Send one prompt from backend/app.
- [ ] Confirm provider tab opens.
- [ ] Confirm prompt is inserted correctly.
- [ ] Confirm generation starts.
- [ ] Confirm media is detected.
- [ ] Confirm result reaches backend.
- [ ] Confirm manual login state is shown when logged out.

## Phase 7: Timeline Import

- [x] Download or store generated media in backend.
- [x] Add generated media asset response format.
- [x] Add frontend action to import generated media.
- [x] Place generated media clips on a visual track.
- [x] Match clip timing to storyboard scenes.
- [x] Keep failed scenes as placeholders.
- [x] Store scene prompt metadata on generated clips.

Manual tests after Phase 7:

- [ ] Generate 2 to 3 scenes.
- [ ] Confirm generated media appears in the media pool.
- [ ] Confirm clips are added to the timeline.
- [ ] Confirm clip timing matches scene timing.
- [ ] Play the timeline with original audio.
- [ ] Export the final video.

## Phase 8: Reliability And Batch Controls

- [ ] Add batch pause.
- [ ] Add batch resume.
- [ ] Add per-job retry.
- [ ] Add provider rate-limit delay.
- [ ] Add duplicate result protection.
- [ ] Add job persistence across backend restart.
- [ ] Add extension job resume after service worker sleep.
- [ ] Add clearer error messages.

Manual tests after Phase 8:

- [ ] Pause a running batch.
- [ ] Resume a paused batch.
- [ ] Retry a failed scene.
- [ ] Refresh Chrome during a job and confirm recovery.
- [ ] Restart backend and confirm job state is not lost.
- [ ] Confirm duplicate clips are not created.

## Phase 9: Grok Provider

- [ ] Add Grok provider content script.
- [ ] Add Grok prompt input detection.
- [ ] Add Grok generation trigger.
- [ ] Add Grok result detection.
- [ ] Add Grok media extraction.
- [ ] Add provider switch in UI.

Manual tests after Phase 9:

- [ ] Select Grok provider.
- [ ] Send one image prompt.
- [ ] Confirm result returns to backend.
- [ ] Compare behavior with Meta provider.

## Phase 10: Video Generation And Polish

- [ ] Add video scene support.
- [ ] Add image-first/video-later generation setting.
- [ ] Add prompt templates by video style.
- [ ] Add storyboard regeneration for selected scenes.
- [ ] Add scene placeholder visuals.
- [ ] Add final UX copy for free/local workflow.
- [ ] Add troubleshooting panel for Chrome bridge.

Manual tests after Phase 10:

- [ ] Generate an image-based video from audio.
- [ ] Generate a video-based scene if provider supports it.
- [ ] Regenerate one scene.
- [ ] Export final video.
- [ ] Confirm the workflow is understandable for a new user.

## Recommended Build Order

- [x] Phase 1: Contracts And Architecture
- [x] Phase 2: Storyboard Backend MVP
- [x] Phase 3: Storyboard Frontend UI
- [x] Phase 4: Generation Queue Backend
- [x] Phase 5: Chrome Extension Bridge MVP
- [x] Phase 6: Provider Adapter MVP
- [x] Phase 7: Timeline Import
- [ ] Phase 8: Reliability And Batch Controls
- [ ] Phase 9: Grok Provider
- [ ] Phase 10: Video Generation And Polish
