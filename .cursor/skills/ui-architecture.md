# UI Architecture & State Machine

## 1. CSS-Driven FSM (Finite State Machine)

The application has strict operational entropy control. 
**Rule:** JS MUST NOT directly manipulate DOM visibility (`display: none`) or interaction states (`disabled: true`).

Instead, the UI is driven by `scripts/utils/uiStateMachine.js` which modifies the root `document.body.dataset.state` attribute.

### Available States
- `INITIAL`: Camera off.
- `CAMERA_ON`: Camera active, ready to record.
- `RECORDING`: Actively capturing `mediaRecorder`.
- `RECORDED`: WebM generated.
- `CONVERTING`: FFmpeg transcoding.
- `CONVERTED`: MP4 generated.
- `SYNTHESIZING`: Generating PIP video.
- `SYNTHESIZED`: PIP video completed.

All UI element visibility is strictly controlled in `stylesheets/state.css` via attribute selectors:
```css
[data-state="RECORDING"] #convertBtn {
    display: block !important;
    pointer-events: none !important;
    opacity: 0.5 !important;
}
```

## 2. Orthogonal Camera State

The camera's physical status (on/off) is orthogonal to the application state (e.g., you can be in `CONVERTED` state while the camera is off to save battery).
This is tracked via `document.body.dataset.camera = 'on' | 'off'`.
The `#closeCameraBtn` is governed exclusively by this orthogonal attribute in `state.css`.

## 3. IndexedDB Persistence

Since video Blobs are too large for `sessionStorage`, `scripts/core/State.js` intercepts page reloads.
- The app binds to a Session ID (`sid`) in the URL query parameters.
- `persistState()`: Flushes `webmBlob`, `mp4Blob`, and UI statistics to IndexedDB against the `sid` key.
- `restoreState()`: Blocks the `App.init()` boot sequence. If a previous session exists, it injects the Blobs into the DOM and fast-forwards the FSM directly to `RECORDED` or `CONVERTED` before giving control back to the user.