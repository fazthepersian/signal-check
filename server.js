/* ================================================================
   SIGNAL CHECK — LOCAL DEV SERVER
   Run with: node server.js
   ================================================================ */

require('dotenv').config({ override: true });
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3003;

// Import the API handlers (same files used by Vercel in production)
const chatHandler  = require('./api/chat');
const emailHandler = require('./api/email');

// File extension → MIME type
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

// Add Express-style helpers to Node's raw response object
// (api/chat.js uses res.status().json() — these shims make that work)
function shimResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json');
    }
    res.end(JSON.stringify(data));
  };
  return res;
}

const server = http.createServer((req, res) => {
  shimResponse(res);

  const urlPath = req.url.split('?')[0]; // strip query string

  // ── API routes ─────────────────────────────────────────────
  if (urlPath === '/api/email') {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.statusCode = 200;
      res.end();
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          req.body = JSON.parse(body);
        } catch {
          req.body = {};
        }
        try {
          await emailHandler(req, res);
        } catch (err) {
          console.error('Email handler error:', err);
          res.statusCode = 500;
          res.json({ error: 'Server error', message: 'Something went wrong. Please try again.' });
        }
      });
      return;
    }

    res.statusCode = 405;
    res.end('Method not allowed');
    return;
  }

  if (urlPath === '/api/chat') {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.statusCode = 200;
      res.end();
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          req.body = JSON.parse(body);
        } catch {
          req.body = {};
        }
        try {
          await chatHandler(req, res);
        } catch (err) {
          console.error('Handler error:', err);
          res.statusCode = 500;
          res.json({ error: 'Server error', message: 'Something went wrong. Please try again.' });
        }
      });
      return;
    }

    res.statusCode = 405;
    res.end('Method not allowed');
    return;
  }

  // ── Static files ───────────────────────────────────────────
  let filePath;

  if (urlPath === '/' || urlPath === '') {
    filePath = path.join(__dirname, 'index.html');
  } else {
    filePath = path.join(__dirname, urlPath);
  }

  // Security: prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      res.statusCode = 404;
      res.end('Not found: ' + urlPath);
      return;
    }

    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.statusCode = 200;
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('✅  Signal Check is running!');
  console.log(`    Open: http://localhost:${PORT}`);
  console.log('');
  console.log('    Press Ctrl+C to stop.');
  console.log('');
});
