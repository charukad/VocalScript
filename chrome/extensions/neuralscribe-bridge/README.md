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
