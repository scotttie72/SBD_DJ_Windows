// Phone remote hub. The Booth window talks to it over /host/* (this computer only).
// Phones reach a separate LAN server that only exists while the remote is switched on and PIN-protected.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REMOTE_FILES = { '/': 'remote.html', '/remote.html': 'remote.html', '/icon-192.png': 'icon-192.png' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png' };
const LOOPBACK = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

function createHub(appRoot, lanPort) {
  let pin = '', lan = null, lanActual = 0;
  let state = 'null', library = '[]';
  const phones = new Set(), hosts = new Set(), fails = new Map();

  const send = (res, event, data) => { try { res.write('event: ' + event + '\ndata: ' + data + '\n\n'); } catch (e) {} };
  const status = () => JSON.stringify({ host: hosts.size > 0, phones: phones.size });
  const broadcastStatus = () => { const s = status(); phones.forEach(r => send(r, 'status', s)); hosts.forEach(r => send(r, 'status', s)); };
  const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const sse = (req, res, set) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 2000\n\n'); set.add(res);
    const beat = setInterval(() => { try { res.write(': keep-alive\n\n'); } catch (e) {} }, 15000);
    req.on('close', () => { clearInterval(beat); set.delete(res); broadcastStatus(); });
  };
  const readBody = (req, limit) => new Promise((resolve, reject) => {
    let n = 0; const parts = [];
    req.on('data', c => { n += c.length; if (n > limit) { reject(new Error('too large')); req.destroy(); } else parts.push(c); });
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
    req.on('error', reject);
  });
  const urls = () => {
    const out = [];
    for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push('http://' + a.address + ':' + lanActual);
    return out;
  };

  async function configure(wantOn, newPin) {
    pin = String(newPin || '').replace(/\D/g, '');
    if (pin.length < 4) wantOn = false;
    if (wantOn && !lan) await startLan();
    else if (!wantOn && lan) stopLan();
    return { enabled: !!lan, port: lanActual, urls: lan ? urls() : [] };
  }
  function startLan() {
    return new Promise(resolve => {
      const s = http.createServer(handleRemote);
      const attempt = p => {
        s.removeAllListeners('error');
        s.once('error', e => { if (e.code === 'EADDRINUSE' && p !== 0) attempt(0); else resolve(); });
        s.listen(p, '0.0.0.0', () => { lan = s; lanActual = s.address().port; resolve(); });
      };
      attempt(lanPort);
    });
  }
  function stopLan() {
    phones.forEach(r => { try { r.end(); } catch (e) {} }); phones.clear();
    lan.close(); if (lan.closeAllConnections) lan.closeAllConnections();
    lan = null; lanActual = 0; broadcastStatus();
  }

  function authOk(req, res, given) {
    const ip = req.socket.remoteAddress, f = fails.get(ip) || { n: 0, until: 0 };
    if (f.until > Date.now()) { json(res, 429, { error: 'Too many wrong PINs. Wait a minute.' }); return false; }
    if (typeof given !== 'string' || !pin || given !== pin) {
      f.n++; if (f.n >= 5) { f.until = Date.now() + 60000; f.n = 0; }
      fails.set(ip, f); json(res, 401, { error: 'Wrong PIN' }); return false;
    }
    fails.delete(ip); return true;
  }

  async function handleRemote(req, res) {
    const u = new URL(req.url, 'http://x'), p = u.pathname;
    if (req.method === 'GET' && REMOTE_FILES[p]) {
      const file = path.join(appRoot, REMOTE_FILES[p]);
      return fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'text/plain', 'Cache-Control': 'no-cache' }); res.end(data);
      });
    }
    if (!['/auth', '/events', '/library', '/cmd'].includes(p)) { res.writeHead(404); return res.end(); }
    const given = req.headers['x-pin'] || u.searchParams.get('pin');
    if (!authOk(req, res, given)) return;
    if (p === '/auth') return json(res, 200, { ok: true });
    if (p === '/library') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(library); }
    if (p === '/events') {
      sse(req, res, phones); send(res, 'status', status()); if (state !== 'null') send(res, 'state', state); broadcastStatus(); return;
    }
    if (p === '/cmd' && req.method === 'POST') {
      if (!hosts.size) return json(res, 503, { error: 'Booth is not open on the computer.' });
      let body; try { body = await readBody(req, 200000); JSON.parse(body); } catch (e) { return json(res, 400, { error: 'Bad command' }); }
      hosts.forEach(r => send(r, 'cmd', body)); res.writeHead(204); return res.end();
    }
    res.writeHead(405); res.end();
  }

  async function handleHost(req, res) {
    if (!LOOPBACK.includes(req.socket.remoteAddress)) { res.writeHead(403); return res.end(); }
    const p = new URL(req.url, 'http://x').pathname;
    try {
      if (p === '/host/ping') return json(res, 200, { host: true });
      if (p === '/host/commands' && req.method === 'GET') { sse(req, res, hosts); send(res, 'status', status()); broadcastStatus(); return; }
      if (p === '/host/state' && req.method === 'POST') { state = await readBody(req, 100000); phones.forEach(r => send(r, 'state', state)); res.writeHead(204); return res.end(); }
      if (p === '/host/library' && req.method === 'POST') { library = await readBody(req, 8e6); phones.forEach(r => send(r, 'library', '1')); res.writeHead(204); return res.end(); }
      if (p === '/host/config' && req.method === 'POST') { const c = JSON.parse(await readBody(req, 2000)); return json(res, 200, await configure(!!c.enabled, c.pin)); }
    } catch (e) { return json(res, 400, { error: String(e.message || e) }); }
    res.writeHead(404); res.end();
  }
  return { handleHost, configure, close() { if (lan) stopLan(); hosts.forEach(r => { try { r.end(); } catch (e) {} }); } };
}
module.exports = { createHub };
