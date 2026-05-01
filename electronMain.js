// electronMain.js

// Electron main process — handles app lifecycle and real file I/O.

const { app, BrowserWindow, ipcMain, shell, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const { ensureGoogleDocsAccessToken } = require('./googleDocsAuth');
const { exportShoppingListToGoogleDocs } = require('./googleDocsExport');

// 🔧 Adjustable constants

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');
let APP_CONFIG = {
  googleDocsAuth: null,
};

function createWindow() {
  const { width, height, x, y } = screen.getPrimaryDisplay().workArea;
  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    icon: path.join(__dirname, 'assets', 'app-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // isolate renderer from Node
      nodeIntegration: false, // no require() / process in renderer
      sandbox: false,
      enableRemoteModule: false, // belt & suspenders
    },
  });

  // load your existing web app entry
  win.loadFile('index.html');

  // Enforce a consistent no-zoom baseline on every page load.
  // This prevents page-to-page zoom drift and guarantees zoom won't "stick"
  // across restarts (we do not persist zoom anywhere).
  win.webContents.on('did-finish-load', () => {
    try {
      win.webContents.setZoomFactor(1.0);
    } catch (_) {
      // ignore
    }
  });
}

// --- Config helpers ---
function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const json = JSON.parse(raw);
    if (json && typeof json === 'object') {
      APP_CONFIG = {
        ...APP_CONFIG,
        ...json,
      };
    }
  } catch (_) {
    // no config yet or unreadable; ignore
  }
}

function saveConfig() {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(APP_CONFIG, null, 2));
  } catch (err) {
    console.warn('⚠️ Could not persist config:', err.message);
  }
}

function getGoogleDocsAuthConfig() {
  return APP_CONFIG.googleDocsAuth && typeof APP_CONFIG.googleDocsAuth === 'object'
    ? APP_CONFIG.googleDocsAuth
    : null;
}

function setGoogleDocsAuthConfig(nextAuth) {
  APP_CONFIG.googleDocsAuth = nextAuth && typeof nextAuth === 'object' ? nextAuth : null;
  saveConfig();
}

ipcMain.handle('getEnv', async () => ({
  appPath: app.getAppPath(),
  userData: app.getPath('userData'),
}));

ipcMain.handle('googleDocsExportShoppingList', async (event, payload = null) => {
  try {
    const accessToken = await ensureGoogleDocsAccessToken({
      appPath: app.getAppPath(),
      userDataPath: app.getPath('userData'),
      persistedAuth: getGoogleDocsAuthConfig(),
      onAuthChanged: (nextAuth) => {
        setGoogleDocsAuthConfig(nextAuth);
      },
      openExternal: (url) => shell.openExternal(url),
    });

    const exportResult = await exportShoppingListToGoogleDocs({
      accessToken,
      payload,
    });

    if (String(exportResult?.url || '').trim()) {
      try {
        await shell.openExternal(exportResult.url);
      } catch (openErr) {
        console.warn('⚠️ Could not open exported Google Doc automatically:', openErr);
      }
    }

    return {
      ok: true,
      ...exportResult,
    };
  } catch (err) {
    console.error('❌ Google Docs export failed:', err);
    return {
      ok: false,
      code: String(err?.code || 'google_docs_export_failed'),
      message: String(err?.userMessage || err?.message || 'Could not export shopping list.'),
    };
  }
});

// --- App startup ---

app.whenReady().then(() => {
  app.setName('Favorite Eats Editor');

  loadConfig();

  // macOS: set dock icon in dev and prod

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
