# NeuralScribe Chrome Bridge

This folder is reserved for NeuralScribe's own Chrome extension.

The extension will connect the local app to the user's existing Chrome browser. It will not modify or depend on the third-party extensions stored under `chrome/extentions`.

Phase 1 decisions:

- Use the user's existing Chrome installation.
- Build our own Manifest V3 extension.
- Use `chrome/extensions/neuralscribe-bridge` as the correctly spelled folder path.
- Start with Meta as the first provider adapter.
- Add Grok after the bridge and Meta adapter are stable.
- Use local/free generation flow: local transcription, local/rule-based storyboarding, browser-based provider generation.
