# Task List 5: Advanced Browser Bridge And Multi-Account Provider System

## Summary

Build a stronger browser-extension/provider system for NeuralScribe. This task list covers the previous 12 advanced extension upgrades plus the new multi-account worker monitor and Meta Extend Video workflow.

The goal is to make generation more reliable, observable, recoverable, and scalable across user-owned browser profiles while keeping the current Auto Generate Video and Auto Animate Video workflows separate and working.

## Key Decisions

- Keep existing Auto Generate Video behavior unchanged.
- Keep existing Auto Animate Video behavior separate from Auto Generate Video.
- Add advanced provider orchestration through the browser bridge, not inside the animation planner.
- Support multiple user-owned Chrome profiles/accounts as separate extension workers.
- Add an app-side monitor window to inspect each connected extension/account.
- Add diagnostics before adding more automation so failures are easy to understand.
- Use provider capabilities at runtime because Meta UI features can differ by account.
- Support Meta Extend Video only when the account UI exposes that option.
- Do not design around bypassing provider limits; add cooldowns, locks, pause controls, and clear failure states.

## Feature Scope

- [x] Create `TASK_LIST_5.md` without deleting or replacing previous task lists.
- [ ] Feature 1: Provider Health Check.
- [ ] Feature 2: Live Provider Debug Panel.
- [ ] Feature 3: Job Flight Recorder.
- [x] Feature 4: Screenshot On Failure.
- [ ] Feature 5: Auto Recovery Modes.
- [ ] Feature 6: Provider Session Lock.
- [x] Feature 7: Queue Dashboard.
- [ ] Feature 8: Per-Provider Adapter Tests.
- [ ] Feature 9: Variant Capture Upgrade.
- [ ] Feature 10: Rate Limit / Cooldown Brain.
- [ ] Feature 11: Provider Fallback.
- [ ] Feature 12: Extension Version Handshake.
- [ ] Feature 13: Multi-account extension workers.
- [ ] Feature 14: Meta Extend Video for Shorts.

Manual tests after feature scoping:

- [x] Confirm `TASK_LIST_3.md` still exists.
- [x] Confirm `TASK_LIST_4.md` still exists.
- [x] Confirm no previous task list was deleted or overwritten.

## Phase 1: Contracts, Safety, And Architecture

- [x] Define browser bridge worker model: `workerId`, `accountLabel`, `chromeProfileLabel`, `provider`, `status`, `currentJobId`, `currentProjectId`, `cooldownUntil`, `extensionVersion`, `lastHeartbeat`, and `lastError`.
- [x] Define provider capability model: `canGenerateImage`, `canGenerateVideo`, `canExtendVideo`, `supportsVariants`, `supportsUpload`, and `supportsDownload`.
- [x] Define provider health model: login status, page status, prompt input status, generate button status, media detection status, and manual action needed.
- [x] Define job debug event schema for extension-to-backend reporting.
- [ ] Define job flight recorder schema for step logs, selector diagnostics, screenshots, provider URL, prompt metadata, and captured media metadata.
- [x] Define account-safe operating rules: user-owned accounts only, one active job per provider account, visible pause/stop controls, no stealth limit bypass.
- [x] Define extension version handshake contract between app, backend, and extension.
- [x] Define new backend route namespace for bridge worker management.
- [ ] Define project save fields needed for provider debug metadata without mixing Auto Generate and Auto Animate state.

Manual tests after Phase 1:

- [ ] Confirm Auto Generate route contracts remain unchanged.
- [ ] Confirm Auto Animate route contracts remain unchanged.
- [x] Confirm new worker/debug models can exist without generation jobs.
- [ ] Confirm old projects can load without worker/debug state.

## Phase 2: Extension Version Handshake

- [x] Add extension manifest version reporting to every bridge connection.
- [x] Add extension build/version constant in background and sidepanel scripts.
- [x] Send version, provider adapters, and capability list in the ready payload.
- [x] Add backend compatibility check for extension version.
- [x] Add frontend warning when the installed extension version is too old.
- [x] Add "reload extension required" state for mismatched versions.
- [ ] Add clear user-facing instructions for reloading the unpacked extension.

Manual tests after Phase 2:

- [ ] Load the current extension and confirm version appears in the app.
- [ ] Simulate an old version and confirm the app warns clearly.
- [ ] Reload the extension and confirm the warning clears.
- [ ] Confirm existing generation jobs still run when versions match.

## Phase 3: Worker Registry And Heartbeats

- [x] Add backend worker registry endpoint under browser bridge APIs.
- [x] Register each extension instance as a separate worker.
- [x] Add heartbeat updates from extension background script.
- [ ] Track provider, profile label, account label, current tab status, and current job status.
- [x] Mark workers stale when heartbeat is missing.
- [x] Recover stale workers when the extension reconnects.
- [x] Prevent duplicate worker records from the same extension session.
- [x] Add backend cleanup for old disconnected workers.

Manual tests after Phase 3:

- [ ] Open one Chrome profile and confirm one worker appears.
- [ ] Open two Chrome profiles and confirm two workers appear.
- [ ] Close one profile and confirm that worker becomes stale.
- [ ] Reopen the profile and confirm the worker reconnects.

## Phase 4: Multi-Account Bridge Monitor UI

- [x] Add app-side `Browser Bridge Monitor` window or panel.
- [x] Show all connected workers/accounts in one view.
- [x] Show account label, provider, profile label, extension version, heartbeat, current job, cooldown, and last error.
- [x] Add Active Profiles and Disconnected tabs in the bridge monitor.
- [x] Add Chrome identity email fallback for profile labels when available.
- [ ] Add editable account nickname for each worker.
- [ ] Add worker controls: pause, resume, run health check, clear local error, and open debug details.
- [x] Add first-pass worker controls: pause, resume, clear error, and clear disconnected workers.
- [ ] Add project/account assignment view for deciding which account handles which provider jobs.
- [x] Add visual state for idle, working, paused, cooldown, failed, stale, and version mismatch.
- [x] Keep this monitor separate from Auto Generate and Auto Animate panels.

Manual tests after Phase 4:

- [ ] Open the monitor with one connected extension.
- [ ] Open the monitor with multiple connected profiles.
- [ ] Pause one worker and confirm it does not claim new jobs.
- [ ] Resume the worker and confirm it can claim jobs again.
- [ ] Confirm Auto Generate and Auto Animate panels still open normally.

## Phase 5: Provider Session Lock And Queue Routing

- [x] Add one-active-job-per-worker lock.
- [ ] Add backend claim logic that assigns jobs to available workers.
- [ ] Add routing by provider, worker health, cooldown, project, and job type.
- [ ] Add round-robin or least-busy assignment for multiple valid workers.
- [ ] Prevent duplicate job claims across multiple extension instances.
- [ ] Recover abandoned locks when a worker becomes stale.
- [x] Add queue policy for paused workers.
- [x] Add queue policy for jobs waiting on cooldown.
- [ ] Add manual reassignment of a job to a different worker.

Manual tests after Phase 5:

- [ ] Start two workers and confirm a job is claimed by only one worker.
- [ ] Pause one worker and confirm jobs route to the other.
- [ ] Simulate worker disconnect and confirm its lock is released.
- [ ] Confirm failed lock recovery does not duplicate generated media.

## Phase 6: Provider Health Check

- [x] Add provider health check command from app to extension.
- [x] Check whether provider page is reachable.
- [ ] Check whether user appears logged in.
- [x] Check whether manual action is required, such as captcha, permission, or blocked page.
- [x] Check whether prompt input can be found.
- [x] Check whether generate button can be found and enabled.
- [x] Check whether media results can be detected.
- [x] Check whether Meta Extend Video control is available for the account.
- [x] Store latest health result per worker.
- [x] Show health status in the bridge monitor.

Manual tests after Phase 6:

- [ ] Run health check on a logged-in provider account.
- [ ] Run health check when provider tab is closed.
- [ ] Run health check when login is required.
- [ ] Confirm health errors are visible in the app.
- [ ] Confirm Meta Extend capability is reported only when available.

## Phase 7: Live Provider Debug Panel

- [x] Stream extension step events to the backend while a job is running.
- [ ] Show live steps in the app: tab opened, page loaded, content script injected, prompt field found, prompt inserted, generate clicked, media detected, upload started, upload completed.
- [x] Show current provider URL and page title.
- [x] Show selector match diagnostics for important UI elements.
- [ ] Show elapsed time for each job step.
- [ ] Add filters by worker, project, job type, provider, and status.
- [ ] Add a detail drawer for the current active job.

Manual tests after Phase 7:

- [ ] Start a generation job and watch live debug steps update.
- [ ] Confirm debug steps stop when job finishes.
- [ ] Trigger a failure and confirm the final failed step is visible.
- [ ] Confirm debug panel does not block normal editor use.

## Phase 8: Job Flight Recorder

- [x] Persist per-job debug events in backend memory first.
- [ ] Save completed job flight record with project debug metadata.
- [x] Store prompt length, provider URL, selected worker, selector scores, media counts, retries, and final result.
- [x] Link flight record to generation job.
- [ ] Add export/debug download option for a single job.
- [x] Add retention limit to avoid unbounded debug storage.
- [x] Add privacy controls for prompt and screenshot storage.

Manual tests after Phase 8:

- [ ] Run a successful job and inspect its flight record.
- [ ] Run a failed job and inspect its failure event.
- [ ] Save and reload a project with debug metadata.
- [ ] Confirm debug retention removes old records as configured.

## Phase 9: Screenshot On Failure

- [x] Capture provider page screenshot when a job fails.
- [x] Upload failure screenshot to backend debug storage.
- [x] Link screenshot from job detail drawer and flight recorder.
- [x] Skip or restrict screenshot capture on sensitive pages such as login, password, payment, or captcha screens.
- [x] Add screenshot capture reason and timestamp.
- [x] Add setting to disable screenshots.
- [x] Add clear screenshots action in debug storage.

Manual tests after Phase 9:

- [ ] Force prompt-input failure and confirm screenshot is attached.
- [ ] Force login-required failure and confirm sensitive screenshot is skipped or restricted.
- [ ] Clear screenshots and confirm they disappear from debug details.
- [ ] Confirm normal generated media is unaffected.

## Phase 10: Auto Recovery Modes

- [x] Add recovery for content-script channel closed: retry injection and message send.
- [ ] Add recovery for prompt input missing: wait, reopen provider target URL, reinject, and rescan.
- [x] Add recovery for disabled generate button: refocus, clear, refill, dispatch input events, and retry.
- [x] Add recovery for no media found: wait longer, scroll results, rescan, and capture diagnostics.
- [x] Add recovery for stale provider result: ignore old media and wait for new result group.
- [x] Add retry limits per failure type.
- [ ] Add clear final error when recovery fails.
- [ ] Record every recovery attempt in the flight recorder.

Manual tests after Phase 10:

- [ ] Simulate closed channel and confirm retry works.
- [ ] Simulate missing prompt input and confirm recovery attempts are logged.
- [ ] Simulate no-media result and confirm final error is clear.
- [ ] Confirm recovery retries do not create duplicate backend jobs.

## Phase 11: Queue Dashboard

- [x] Add queue dashboard for browser-bridge jobs.
- [x] Filter by Auto Generate, Auto Animate, provider, worker/account, project, status, and job type.
- [x] Show queued, active, completed, failed, stale, cooldown, and canceled jobs.
- [x] Add retry failed selected.
- [x] Add clear completed.
- [x] Add clear failed.
- [x] Add clear current project jobs.
- [x] Add clear worker/account jobs.
- [x] Add pause/resume batch controls.
- [x] Add job detail drawer with prompt, error, flight record, screenshot, and result media.

Manual tests after Phase 11:

- [ ] Clear completed jobs and confirm active jobs remain.
- [ ] Clear failed jobs and confirm new jobs are easy to see.
- [ ] Retry selected failed jobs.
- [ ] Confirm clearing jobs in extension sidepanel and app dashboard stay in sync.

## Phase 12: Per-Provider Adapter Tests

- [x] Add `Test Meta Adapter` command in the bridge monitor.
- [x] Run safe provider page detection without submitting project transcript by default.
- [ ] Add optional user-confirmed full test prompt.
- [ ] Test prompt insertion, generate button detection, result detection, and upload path.
- [ ] Store adapter test results separately from project jobs.
- [ ] Add adapter test history per worker.
- [ ] Add provider-specific test summary and failure reason.

Manual tests after Phase 12:

- [ ] Run safe Meta adapter test while logged in.
- [ ] Run adapter test while logged out and confirm login-needed error.
- [ ] Run adapter test with a stale extension version and confirm version warning.
- [ ] Confirm adapter tests do not pollute project media.

## Phase 13: Variant Capture Upgrade

- [x] Detect provider result groups instead of relying only on latest media.
- [x] Separate stale media from new job media.
- [x] Capture up to 4 variants per image/video job when provider exposes them.
- [x] Add variant labels and provider metadata.
- [x] Add media preview grid for variant selection.
- [x] Attach selected variant to the correct scene or animation asset.
- [x] Prevent wrong-scene media assignment.
- [ ] Add manual variant import fallback.
- [ ] Add regenerate one variant without replacing approved variants.

Manual tests after Phase 13:

- [ ] Generate a job with multiple variants and confirm all variants appear.
- [ ] Select variant 1, 2, 3, or 4 and confirm the chosen media attaches correctly.
- [ ] Regenerate one failed/missing variant.
- [ ] Confirm old result media does not attach to a new scene.

## Phase 14: Rate Limit And Cooldown Brain

- [ ] Detect provider rate-limit, slow queue, temporary block, and manual-action errors.
- [x] Add per-worker cooldown state.
- [ ] Add per-provider cooldown policy.
- [x] Add adaptive delay after repeated failures.
- [x] Pause a worker automatically after repeated provider failures.
- [x] Show cooldown countdown in monitor and queue dashboard.
- [ ] Resume automatically when cooldown ends.
- [ ] Allow manual override with clear warning.

Manual tests after Phase 14:

- [ ] Simulate repeated failures and confirm cooldown starts.
- [ ] Confirm cooldown worker does not claim new jobs.
- [ ] Confirm another healthy worker can continue.
- [ ] Confirm cooldown ending allows jobs again.

## Phase 15: Provider Fallback

- [ ] Add capability-aware fallback routing between providers.
- [ ] Allow retrying a failed job with another provider when supported.
- [ ] Preserve prompt, negative prompt, aspect ratio, style, asset metadata, and project link.
- [ ] Add user setting for manual fallback approval.
- [ ] Add optional automatic fallback setting.
- [ ] Record fallback decision in job history.
- [ ] Keep provider-specific results clearly labeled.

Manual tests after Phase 15:

- [ ] Fail a Meta job and retry with another configured provider.
- [ ] Confirm fallback keeps the same project/scene/asset link.
- [ ] Confirm fallback does not happen automatically unless enabled.
- [ ] Confirm fallback history appears in job details.

## Phase 16: Meta Extend Video For Shorts

- [ ] Add bridge job type `extend_video`.
- [ ] Add source video reference for extension jobs.
- [ ] Detect Meta Extend Video control on generated video cards.
- [ ] Add optional continuation prompt field.
- [ ] Trigger Extend only for selected video results.
- [ ] Capture extended result as a child result of the base video.
- [ ] Store base duration, extended duration, provider metadata, and source job ID.
- [ ] Add `Extend Selected Video` button in app media/variant UI.
- [ ] Add Shorts shot builder view: base shot, extended shot, status, duration, and selected final clip.
- [ ] Show unsupported state when the account does not expose Meta Extend.
- [ ] Prevent Extend jobs from entering image-generation or asset-generation queues.

Manual tests after Phase 16:

- [ ] Generate or select a short video result.
- [ ] Detect whether Extend is available for that account.
- [ ] Extend one selected result when available.
- [ ] Confirm the extended clip is linked to the base clip.
- [ ] Confirm unsupported accounts show a clear message and do not fail silently.

## Phase 17: Reliability, Privacy, And Documentation

- [x] Document multi-account setup using separate Chrome profiles.
- [x] Document how each extension worker maps to one browser profile/account.
- [x] Document extension reload/version mismatch steps.
- [x] Document debug log and screenshot privacy behavior.
- [x] Add troubleshooting guide for failed generation.
- [x] Add troubleshooting guide for missing generated media.
- [x] Add troubleshooting guide for wrong variant/scene assignment.
- [x] Add recovery guide for Meta UI changes.
- [x] Add project-level migration notes for older saved projects.

Manual tests after Phase 17:

- [ ] Follow multi-account setup guide with two Chrome profiles.
- [ ] Follow troubleshooting guide for a failed job.
- [ ] Confirm docs match current UI labels.
- [ ] Confirm privacy controls are easy to find.

## Phase 18: End-To-End Validation

- [x] Run frontend build.
- [x] Run frontend lint if configured.
- [x] Run backend syntax/import checks.
- [x] Run extension JavaScript syntax checks.
- [ ] Test Auto Generate Video with one extension worker.
- [ ] Test Auto Animate Video with one extension worker.
- [ ] Test bridge monitor with two extension workers.
- [ ] Test queue clearing from extension sidepanel.
- [ ] Test queue clearing from app dashboard.
- [ ] Test failed job screenshot capture.
- [ ] Test job flight recorder.
- [ ] Test variant capture and selection.
- [ ] Test worker cooldown and recovery.
- [ ] Test Meta Extend Video when available.
- [ ] Confirm old Auto Generate exports still work.
- [ ] Confirm Auto Animate generated assets still save and reload.

Manual tests after Phase 18:

- [ ] Create one Auto Generate project from scratch.
- [ ] Create one Auto Animate project from scratch.
- [ ] Save and reload both projects.
- [ ] Confirm generated media, animation assets, debug logs, and queue states are correct.

## Test Plan

- Run `npm run build` in `frontend`.
- Run frontend lint if the project has a lint script.
- Run `python3 -m compileall backend/src`.
- Run `node --check` on extension scripts.
- Test both workflows separately: Auto Generate Video and Auto Animate Video.
- Test at least two Chrome profiles with the unpacked extension installed.
- Verify worker heartbeats and account labels are visible in the app.
- Verify one worker cannot claim two active jobs at the same time.
- Verify job clearing works in the extension sidepanel and app dashboard.
- Verify generated variants attach to the correct scene or asset.
- Verify Meta Extend Video is only enabled when detected in the provider UI.
- Verify no existing task files are deleted or overwritten.

## Assumptions

- All connected accounts are user-owned accounts.
- Each Chrome profile runs one extension worker.
- Provider UI can change, so selector diagnostics and health checks are required.
- Meta Extend Video availability depends on the account and region.
- Adapter tests should not submit real project prompts unless the user explicitly starts that test.
- Screenshots and debug logs may contain sensitive provider-page information, so privacy controls are required.
- Existing Auto Generate and Auto Animate workflows must remain available while the bridge system is upgraded.

## Current Execution Status

- [x] Created this implementation checklist.
- [ ] Implement Phase 1 contracts.
- [ ] Implement Phase 2 extension version handshake.
- [ ] Implement Phase 3 worker registry and heartbeats.
- [ ] Implement Phase 4 multi-account monitor UI.
- [ ] Implement Phase 5 provider session lock and queue routing.
- [ ] Implement Phase 6 provider health check.
- [ ] Implement Phase 7 live provider debug panel.
- [ ] Implement Phase 8 job flight recorder.
- [x] Implement Phase 9 screenshot on failure.
- [ ] Implement Phase 10 auto recovery modes.
- [x] Implement Phase 11 queue dashboard.
- [ ] Implement Phase 12 provider adapter tests.
- [ ] Implement Phase 13 variant capture upgrade.
- [ ] Implement Phase 14 rate limit and cooldown brain.
- [ ] Implement Phase 15 provider fallback.
- [ ] Implement Phase 16 Meta Extend Video for Shorts.
- [x] Implement Phase 17 reliability, privacy, and documentation.
- [ ] Complete Phase 18 end-to-end validation.
