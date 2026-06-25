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
          try {
             const command = JSON.parse(body);
             const id = Date.now().toString();
             command.id = id;
             
             if (sseResponse) {
               // Setup a one-time listener for the command result
               const resultHandler = (resultReq, resultRes) => {
                 let resultBody = '';
                 resultReq.on('data', chunk => { resultBody += chunk; });
                 resultReq.on('end', () => {
                   resultRes.writeHead(200, { 'Content-Type': 'application/json' });
                   resultRes.end(JSON.stringify({ success: true }));
                   
                   // Send the actual frontend result back to the original /agent-command caller
                   res.writeHead(200, { 'Content-Type': 'application/json' });
                   res.end(resultBody);
                 });
               };
               
               // Hook into the /agent-result endpoint temporarily
               server.middlewares.use(`/agent-result/${id}`, resultHandler);
               
               sseResponse.write(`data: ${JSON.stringify(command)}\n\n`);
               
               // Timeout if frontend doesn't respond
               setTimeout(() => {
                 if (!res.headersSent) {
                   res.writeHead(504, { 'Content-Type': 'application/json' });
                   res.end(JSON.stringify({ success: false, error: 'Frontend command timeout' }));
                 }
               }, 5000);
               
             } else {
               res.writeHead(404, { 'Content-Type': 'application/json' });
               res.end(JSON.stringify({ success: false, error: 'No frontend connected via SSE' }));
             }
          } catch(e) {
             res.writeHead(400, { 'Content-Type': 'application/json' });
             res.end(JSON.stringify({ success: false, error: 'Invalid JSON command' }));
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