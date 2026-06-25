# Agent Remote Control

This application features a built-in headless control tunnel designed specifically for AI Agents to interact with the DOM and evaluate test conditions without requiring Selenium/Puppeteer overhead.

## 1. Vite SSE Tunnel

The Vite development server (`vite.config.js`) proxies two endpoints:
- `POST /agent-command`: Send a JSON command from the agent's shell.
- `GET /agent-sse`: The browser listens to this stream to execute the commands.

## 2. Supported Commands

Agents can use `curl` to manipulate the browser remotely. The backend awaits the browser's `fetch` callback to ensure synchronous execution (avoiding timeouts).

### Click an Element
```bash
curl -X POST -H "Content-Type: application/json" -d '{"action": "click", "selector": "#recordBtn"}' http://localhost:5173/agent-command
```

### Force Reload
```bash
curl -X POST -H "Content-Type: application/json" -d '{"action": "reload"}' http://localhost:5173/agent-command
```

### Force State Transition
```bash
curl -X POST -H "Content-Type: application/json" -d '{"action": "state", "targetState": "CONVERTED"}' http://localhost:5173/agent-command
```

## 3. Extracting Logs via CDP

The frontend intercepts all `logger.log()` outputs and saves them to a global array `window.__agentLogs`.
You can use a Node.js script with `playwright-core` attached to `--remote-debugging-port=9222` to run `page.evaluate(() => window.__agentLogs)` and verify test assertions.