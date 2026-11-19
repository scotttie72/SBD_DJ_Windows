// Tiny static file server so Booth runs from http://localhost.
// YouTube refuses to play embeds from file:// pages, so the app cannot load its files directly.
const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

const ALLOWED = new Set(['index.html', 'sw.js', 'manifest.webmanifest', 'remote.html', 'icon-192.png', 'icon-512.png', 'maskable-512.png']);

function startServer(root, preferredPort, hub) {
  const server = http.createServer((req, res) => {
    if (hub && req.url.startsWith('/host/')) return hub.handleHost(req, res);
    let p;
    try { p = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end(); }
    if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(root, p));
    if (path.dirname(file) !== root || !ALLOWED.has(path.basename(file))) { res.writeHead(404); return res.end('Not found'); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    const listen = port => {
      server.once('error', err => { if (err.code === 'EADDRINUSE' && port !== 0) listen(0); else reject(err); });
      server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port }));
    };
    listen(preferredPort);
  });
}
module.exports = { startServer };
