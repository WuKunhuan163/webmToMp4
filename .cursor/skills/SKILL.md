# WebMToMP4 Agent Skills

Welcome to the `webmToMp4` project documentation for Cursor Agents. This project is a completely serverless frontend application that records video (WebM) via the browser camera, transcodes it to MP4 using WebAssembly (FFmpeg.wasm), and provides PIP (Picture-in-Picture) composite rendering.

## Core Workflows

Before modifying the codebase, please review the relevant architecture documents:

1. **[UI State Machine & Persistence](ui-architecture.md)**: Understand the CSS-driven FSM (`uiStateMachine.js`) and IndexedDB persistence layer. **Never use JS to directly modify `style.display` or `disabled` on DOM elements.**
2. **[FFmpeg Web Worker](ffmpeg-architecture.md)**: Understand how `Converter.js` communicates with `ffmpeg-worker.js` and how SharedArrayBuffer is bypassed for GitHub Pages compatibility.
3. **[Agent Remote Control](remote-control.md)**: Learn how to headless-test the application via Vite SSE endpoints (`/agent-command`) and fetch logs via CDP (`window.__agentLogs`).