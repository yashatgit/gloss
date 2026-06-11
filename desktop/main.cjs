// Gloss desktop shell (Electron).
//
// Dev:  GLOSS_DEV_URL is set → load the Vite dev server (which proxies /api to
//       the API server you started with `pnpm dev`). Electron is just the window.
// Prod: pick a FREE port (so it never collides with a running `pnpm dev`), spawn
//       the bundled API server (Electron's Node) with the data dir at the
//       per-user app data and the built client served from one origin, then load it.

const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');

const DEV_URL = process.env.GLOSS_DEV_URL;
// Match the web app's data dir name so documents + saved keys are shared
// (resolveDataDir uses "gloss" → ~/Library/Application Support/gloss on macOS).
app.setName('gloss');
let serverProc = null;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function ping(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (r) => {
      r.resume();
      resolve(r.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await ping(url)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('API server did not become healthy in time');
}

async function startServer(port) {
  // Everything the packaged app needs lives under desktop/ (server.mjs + the
  // copied client build), so paths are relative to __dirname — works both from
  // the repo and from inside Gloss.app/Contents/Resources/app.
  serverProc = spawn(process.execPath, [path.join(__dirname, 'dist', 'server.mjs')], {
    cwd: __dirname,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(port),
      GLOSS_DATA_DIR: app.getPath('userData'),
      GLOSS_SERVE_CLIENT: path.join(__dirname, 'dist', 'client'),
    },
    stdio: 'inherit',
  });
  await waitForServer(`http://127.0.0.1:${port}/api/health`);
}

async function createWindow(url) {
  const win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#eef0f6',
    webPreferences: { contextIsolation: true },
  });
  // Open external links in the user's browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    shell.openExternal(u);
    return { action: 'deny' };
  });
  await win.loadURL(url);
}

app.whenReady().then(async () => {
  let url = DEV_URL;
  if (!DEV_URL) {
    const port = await getFreePort();
    url = `http://127.0.0.1:${port}`;
    try {
      await startServer(port);
    } catch (err) {
      console.error('[gloss] server start failed:', err);
    }
  }
  await createWindow(url);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow(url);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('quit', () => {
  if (serverProc) serverProc.kill();
});
