const { app, BrowserWindow, session, shell } = require('electron');
const path = require('path');
const { startServer } = require('./server');
const { createHub } = require('./remote');

// A fixed port keeps the browser storage (crate, MIDI mappings, API key) between launches.
const PORT = 47651;
const ROOT = __dirname;
const DENIED = ['media', 'geolocation', 'notifications', 'openExternal'];

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) app.quit();

let win, server, hub;
async function createWindow() {
  hub = createHub(ROOT, 47652);
  const started = await startServer(ROOT, PORT, hub);
  server = started.server;
  const origin = 'http://localhost:' + started.port;

  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => callback(!DENIED.includes(permission)));
  session.defaultSession.setPermissionCheckHandler((wc, permission) => !DENIED.includes(permission));

  win = new BrowserWindow({
    width: 1360, height: 900, minWidth: 360, minHeight: 600,
    title: 'Booth', backgroundColor: '#0d0f13', autoHideMenuBar: true,
    icon: path.join(ROOT, 'icon-512.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(origin)) { e.preventDefault(); shell.openExternal(url); } });
  // Run with a user gesture so the saved music folders reconnect on their own at launch.
  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript('window.__boothReconnect && window.__boothReconnect()', true).catch(() => {});
  });
  win.loadURL(origin + '/index.html');
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (hub) hub.close(); if (server) server.close(); app.quit(); });
