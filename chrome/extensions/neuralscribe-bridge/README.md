# NeuralScribe Chrome Bridge

This is NeuralScribe's own Chrome extension.

The extension connects the local app to the user's existing Chrome browser. It does not modify or depend on the third-party extensions stored under `chrome/extentions`.

Phase 1 decisions:

- Use the user's existing Chrome installation.
- Build our own Manifest V3 extension.
- Use `chrome/extensions/neuralscribe-bridge` as the correctly spelled folder path.
- Start with Meta as the first provider adapter.
- Add Grok after the bridge and Meta adapter are stable.
- Use local/free generation flow: local transcription, local/rule-based storyboarding, browser-based provider generation.

Phase 5 MVP:

- Manifest V3 extension with a background service worker.
- Side panel with connection status, backend URL, session token, and provider toggles.
- WebSocket connection to `ws://127.0.0.1:8000/api/browser-bridge/ws`.
- `worker.ready` registration and `worker.heartbeat` messages.
- Reconnect when the backend drops.

Phase 6 MVP:

- Claim queued Meta jobs from the backend.
- Open or reuse the Meta AI create tab.
- Fill the prompt and click generate through `providers/meta-content.js`.
- Watch the page for generated media URLs.
- Mark jobs as completed, failed, or manual-action-required.
- Report completed media URLs to the backend queue.

Useful ideas from the existing extension folders:

- Keep browser UI in a side panel.
- Keep durable connection/control work in the background worker.
- Keep provider-specific DOM selectors isolated from bridge plumbing.
- Send clear status updates to the UI while automation runs.

Manual load:

1. Open Chrome extensions: `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select `chrome/extensions/neuralscribe-bridge`.
5. Click the NeuralScribe Bridge toolbar icon.

## Multi-Account Setup

Use one Chrome profile per provider account. Install this unpacked extension into each Chrome profile that you own and want to use with NeuralScribe.

Recommended setup:

1. Open a separate Chrome profile for each Meta account.
2. Load this unpacked extension in each profile.
3. Open the extension side panel in each profile.
4. Set `Account Label` and `Chrome Profile Label`, or let the extension use the detected Chrome email when Chrome identity access is available.
5. Connect each side panel to the same local backend.
6. In the NeuralScribe app, open `Bridge Monitor` to see Active Profiles and Disconnected profiles.

Each connected profile appears as its own worker. The app can pause, resume, clear errors, run health checks, and inspect queue/debug state per worker.

Use the worker `Nickname` field in the app monitor to give each Chrome profile a stable human label, such as `Meta Main` or `Meta Backup`.

Use the selected job `Assign Worker` control when a specific profile should handle a job. Jobs assigned to one worker are skipped by other workers until the assignment is cleared.

## Queue And Clearing Jobs

The side panel shows visible jobs for the selected project. If no project is selected, it shows jobs across projects.

- `Clear Finished` clears completed, failed, manual-action, and canceled jobs for the selected project, or all projects when no project is selected.
- `Clear All` clears queued, running, completed, failed, manual-action, and canceled jobs for the selected project, or all projects when no project is selected. It also resets this local runner.
- The app-side `Bridge Monitor` has the larger queue dashboard with filters for workflow, provider, worker, project, status, and media type.
- If a provider generated media but automatic capture missed it, paste the media URL into `Manual Media URL` on the selected job and click `Import`.
- `Regen Variant` queues a separate variant-regeneration job so the currently approved variants are not replaced.

## Provider Fallback

The app-side `Bridge Monitor` can retry a failed job with another provider when that provider has an active capable worker. Fallback is manual by default: the app records the fallback provider, previous provider, timestamp, and history in the job metadata, then re-queues the same job with the new provider.

Grok fallback stays disabled until a runnable Grok adapter is added to the extension worker.

`Auto fallback` is an optional dashboard toggle. When enabled, failed jobs can be retried with another active capable provider; when disabled, fallback remains manual only.

## Adapter Tests And Debugging

`Health Check` runs a safe provider inspection. `Test Meta` performs a safe adapter test that checks prompt insertion and generate-button detection without submitting project prompts.

`Full Test` requires user confirmation and submits the prompt shown in the worker card. Full test results are stored as adapter-test history, separate from project jobs.

The `Live Provider Debug` panel shows recent provider steps using the queue filters above it. Job flight-recorder events are persisted in backend debug storage and can be downloaded from selected job details.

Cooldowns are classified by failure type, such as rate limit, slow queue, manual action, blocked provider, prompt missing, or no media. Repeated failures pause the worker temporarily, then auto-resume after cooldown; `Clear Cooldown` manually overrides that wait with a warning.

## Meta Extend Video

For completed video jobs, `Bridge Monitor` can create a child `extend_video` job. The child job keeps the source job id, source media URL, project link, prompt metadata, target duration metadata, and provider metadata.

The `Extend Video` button is capability-gated. Run `Health Check` or `Test Meta` first; the button only enables when an active Meta worker reports that the account exposes Extend Video.

The `Shorts Shot Builder` section groups each base video with its Extend children, shows status and duration, and records whether the base or extended clip is the selected final shot.

## Version Reload Steps

When the app reports a protocol or extension version mismatch:

1. Open `chrome://extensions`.
2. Find `NeuralScribe Bridge`.
3. Click the reload icon on the unpacked extension card.
4. Reopen the side panel and click `Connect`.
5. Confirm the app-side `Bridge Monitor` shows the expected extension version.

## Privacy And Debug Storage

Failure screenshots are optional. Disable `Capture failure screenshots` in the side panel if you do not want provider-page screenshots stored locally.

The extension skips screenshot capture on URLs that look like login, password, captcha, checkpoint, or payment pages. The app-side `Bridge Monitor` can clear stored debug screenshots from the queue dashboard.

Debug events store operational metadata such as worker id, provider, job id, selector diagnostics, result counts, and screenshot links. Avoid putting sensitive secrets in prompts.

## Troubleshooting Failed Generation

Use this order when jobs fail repeatedly:

1. Open the provider tab and confirm the account is logged in.
2. In `Bridge Monitor`, run `Health Check` for that worker.
3. If health says prompt or generate controls are missing, reload the Meta tab and retry.
4. If the worker shows cooldown or repeated failures, wait for cooldown or clear the worker error after checking the provider page.
5. Use `Retry Selected` in the queue dashboard for a failed job.

The extension automatically retries content-script message injection, refills the prompt when the generate button does not enable, scrolls and rescans when media is not found, and pauses the local runner after repeated provider failures.

## Troubleshooting Missing Media

If Meta appears to generate media but the app does not receive it:

1. Check the selected job in `Bridge Monitor`.
2. Open its flight recorder and look for `provider_job_completed`, `failure_screenshot_uploaded`, or media-detection messages.
3. If variants are present, select the correct preview in the job detail panel or in the Auto Generate / Auto Animate panel.
4. If no variants are present, retry the job after confirming Meta is in the correct image/video mode.

## Troubleshooting Wrong Variant Or Wrong Scene

The bridge captures a baseline of existing provider media before each job and only accepts new media tied to the current job. If a wrong image is still attached:

1. Open the job detail in `Bridge Monitor`.
2. Compare the job id, scene id, project, worker, and result variants.
3. Select the correct variant preview.
4. Retry only the affected job instead of regenerating the entire plan.

## Meta UI Changes

Meta can change button labels and page structure. If generation suddenly starts failing:

1. Run `Test Meta` from `Bridge Monitor`.
2. Check the selector diagnostics in the health result.
3. Reload the extension after code updates.
4. Update `providers/meta-content.js` selectors if the prompt box, generate button, result media, or Extend control names changed.

## Older Saved Projects

Older projects may not contain bridge debug metadata, animation asset jobs, or selected variant metadata. They should still open normally. New bridge state is additive and stored through the current generation and project-save paths.
