# NeuralScribe - Project Information

## 🚀 Current Features

NeuralScribe is a browser-based Non-Linear Editor (NLE) that integrates AI transcription capabilities. Here is what the application can currently do:

### 1. Advanced Timeline Engine
* **Multi-Track Support:** Unlimited Video (V1, V2, etc.) and Audio (A1, A2, etc.) tracks.
* **True Drag-and-Drop:** Assets can be dragged from the Media Pool and placed precisely at any timestamp on the timeline. Clips can be dragged left/right to adjust timing.
* **Navigation & Shortcuts:** 
  * `Spacebar` to Play/Pause.
  * `Backspace` or `Delete` to remove a selected clip.
  * `Ctrl` + `Scroll` (or Mac trackpad pinch) to dynamically zoom the timeline.
  * Click on the ruler to scrub the playhead to any specific time.

### 2. Live Preview System
* **Real-Time Synchronization:** A custom playback loop accurately synchronizes hidden browser `<audio>` and `<video>` elements to the global playhead time.
* **Scrubbing Support:** Clicking around the paused timeline immediately updates the visible video frame.

### 3. Media Processing & Exporting
* **Image + Audio Stitching:** Upload a static image (like podcast cover art) alongside audio; the backend will infinitely loop the image to match the audio length and export a complete `.mp4`.
* **Video Audio Replacement:** Upload a background video; the backend strips its original audio, replaces it with your custom timeline audio, trims it, and exports an `.mp4`.

### 4. AI Subtitle Generation
* **Faster-Whisper Integration:** Automatically transcribes the finalized audio track and generates an `.srt` file.

---

## 🛠️ Missing Features (Roadmap)

To compete with professional editors like Premiere Pro, CapCut, or DaVinci Resolve, the following features are missing and should be prioritized next:

### High Priority
1. **Subtitle Burn-in (Hardcoding):** The ability to actually render the AI-generated text onto the visual video frame rather than just providing an `.srt` download.
2. **Text / Title Overlays:** A new "Text Track" (T1) allowing users to add custom text, change fonts, colors, and positioning on screen.
3. **Clip Trimming & Splitting (The Razor Tool):** Currently, you can move clips, but you cannot change their duration. You need the ability to drag the edges of a clip to make it shorter, or use a "Razor" to split a clip in half.

### Medium Priority
4. **Volume Control & Audio Mixing:** A slider on each clip to adjust its individual volume (crucial for lowering background music under a voiceover).
5. **Timeline Snapping (Magnet Tool):** Moving a clip close to another clip should "snap" them together to prevent micro-gaps.
6. **Undo/Redo History:** Pressing `Ctrl+Z` to revert accidental clip movements or deletions.

### Low Priority / Polish
7. **Transitions:** Crossfades between visual clips and fade-in/fade-out for audio clips.
8. **Export Aspect Ratios:** The ability to choose between 16:9 (YouTube) and 9:16 (TikTok / Shorts / Reels) before exporting.
9. **Multi-Video Compositing:** Currently, the backend only takes the *first* visual clip. The backend needs a full FFmpeg complex filter overhaul to handle rendering multiple video clips sequentially or picture-in-picture.
