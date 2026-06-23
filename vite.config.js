import { defineConfig } from 'vite';

const agentRemoteControlPlugin = () => {
  let sseResponse = null;
  let pendingPayload = null;

  return {
    name: 'agent-remote-control',
    configureServer(server) {
      server.middlewares.use('/agent-payload', (req, res) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              pendingPayload = JSON.parse(body);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, message: 'Payload cached in backend memory' }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
            }
          });
        } else if (req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(pendingPayload || {}));
        } else if (req.method === 'DELETE') {
          pendingPayload = null;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        }
      });

      server.middlewares.use('/agent-sse', (req, res) => {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });
        sseResponse = res;
        res.write('data: {"type": "connected"}\n\n');
        
        req.on('close', () => {
          if (sseResponse === res) sseResponse = null;
        });
      });

      server.middlewares.use('/agent-command', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end('Method Not Allowed');
        }

        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          if (sseResponse) {
            sseResponse.write(`data: ${body}\n\n`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Command sent to frontend' }));
          } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'No frontend connected via SSE' }));
          }
        });
      });
    }
  };
};


export default defineConfig({
  plugins: [agentRemoteControlPlugin()],
  base: './', // 这一行极其重要！保证 Vercel 根目录和 GitHub Pages 子目录都能完美工作
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
  }
});