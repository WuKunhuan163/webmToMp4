# FFmpeg Architecture

This project uses `@ffmpeg/ffmpeg` and `@ffmpeg/core`.

## 1. Web Worker Decoupling

Transcoding operations block the main UI thread. Therefore, all FFmpeg instances are isolated in `scripts/modules/ffmpeg-worker.js`.
Communication between the main thread (`ffmpeg-converter-optimized.js`) and the worker relies on `postMessage`.

## 2. GitHub Pages Compatibility (No SharedArrayBuffer)

Many deployment environments (like standard GitHub Pages) do not provide the strict Cross-Origin Isolation headers (`Cross-Origin-Embedder-Policy: require-corp`, `Cross-Origin-Opener-Policy: same-origin`) necessary for `SharedArrayBuffer`.

To maintain broad compatibility:
- The worker uses the standard, single-threaded `ffmpeg-core.js` and `.wasm` binaries.
- It bypasses multi-threading `SharedArrayBuffer` requirements entirely.

## 3. Two-Pass FFmpeg Optimization

Conversion logic automatically adjusts FFmpeg parameters depending on the WebM input size to balance speed and compression ratio:
- `speed` mode: uses `preset=ultrafast, crf=38`.
- `balanced` mode: used for larger files, adjusting bitrate dynamically.

Progress is intercepted by reading the FFmpeg stdout logs (e.g., `frame=  120`) and mathematically approximated via `ffmpeg-progress-calculator.js` because WebM duration metadata from Chrome `MediaRecorder` is notoriously missing or inaccurate.