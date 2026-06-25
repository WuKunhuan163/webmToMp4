# webmToMp4 `src/` Directory Architecture

This directory contains the modernized, modularized source code for the WebM to MP4 transcoder and speaker mode generator. The project has been strictly refactored from a legacy monolithic script into a scalable frontend architecture.

## Directory Structure

### 1. `core/` (Core Business Logic)
Handles all stateful operations, hardware interfaces, and heavy computations:
- **`State.js`**: Global singleton state tree managing variables like active blobs, streams, and operational locks.
- **`OperationManager.js`**: Mutex lock system to prevent race conditions between recording, transcoding, and compositing.
- **`Camera.js`**: WebRTC wrapper for initializing, monitoring, and closing the webcam stream.
- **`Recorder.js`**: `MediaRecorder` API encapsulation for capturing `webm` chunks from the webcam stream.
- **`Converter.js`**: Business-layer wrapper around the underlying FFmpeg WASM worker for WebM -> MP4 transcoding.
- **`SpeakerMode.js`**: Canvas-based compositor that merges webcam video over a presentation slide background.

### 2. `utils/` (Helper Utilities)
Stateless utility functions and DOM management:
- **`dom.js`**: Centralized DOM element references to avoid repetitive `document.getElementById` queries.
- **`logger.js`**: Custom UI-based logging system that outputs to the on-screen console.
- **`uiUtils.js`**: Functions to format file sizes, manipulate UI button states, update progress indicators, and trigger file downloads.
- **`mediaValidator.js`**: Quality assurance utility that dynamically mounts the output MP4 to verify its integrity and duration against the original recording.

### 3. `modules/` (WASM & Worker Engine)
The low-level transcoder components completely isolated from the UI:
- **`ffmpeg-converter-optimized.js`**: The main class exposing the `OptimizedFFmpegConverter` API.
- **`ffmpeg-worker.js`**: The Web Worker thread script that executes the `@ffmpeg/ffmpeg` commands without blocking the main UI thread.
- **`ffmpeg-progress-calculator.js`**: Heuristic algorithm that estimates real-time transcoding progress.
- **`path-resolver.js`**: Critical module ensuring FFmpeg core and WASM binaries are properly resolved regardless of deployment environment (Vercel vs. GitHub Pages sub-directories).

### 4. `styles/` (Stylesheets)
- **`main.css`**: The extracted CSS rules for the application.

### 5. Root Entry
- **`main.js`**: The Vite entry point. It orchestrates the module initialization, binds DOM event listeners, and kickstarts the application lifecycle.
- **`template.html`**: A structural fragment of the DOM used during the HTML refactoring process.

## Design Philosophy
This architecture guarantees that the heavy-lifting logic (`modules/` and `core/`) is fully decoupled from the UI (`utils/dom.js` and `main.js`), allowing the `OptimizedFFmpegConverter` to be flawlessly exported and reused in other applications (like `1minSlidePre`).
