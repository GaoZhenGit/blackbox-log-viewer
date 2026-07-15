const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let prefsPath = null;
let prefsCache = {};

function getPrefsPath() {
  if (prefsPath) return prefsPath;

  if (app.isPackaged) {
    prefsPath = path.join(path.dirname(app.getPath('exe')), 'preferences.json');
  } else {
    prefsPath = path.join(app.getAppPath(), 'preferences.json');
  }
  return prefsPath;
}

function loadPrefs() {
  try {
    if (fs.existsSync(getPrefsPath())) {
      prefsCache = JSON.parse(fs.readFileSync(getPrefsPath(), 'utf-8'));
    }
  } catch (e) {
    prefsCache = {};
  }
}

function savePrefs() {
  try {
    fs.writeFileSync(getPrefsPath(), JSON.stringify(prefsCache, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save preferences:', e.message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.maximize();
  mainWindow.show();
  mainWindow.webContents.openDevTools();
}

// --- IPC Handlers ---

ipcMain.handle('dialog:openFile', async (_event, options) => {
  const lastDir = prefsCache['lastOpenDir'] || undefined;
  const result = await dialog.showOpenDialog(mainWindow, {
    ...options,
    defaultPath: lastDir,
    properties: ['openFile'],
  });
  if (!result.canceled && result.filePaths[0]) {
    prefsCache['lastOpenDir'] = path.dirname(result.filePaths[0]);
    savePrefs();
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('dialog:saveFile', async (_event, options) => {
  const lastDir = prefsCache['lastSaveDir'] || undefined;
  const result = await dialog.showSaveDialog(mainWindow, {
    ...options,
    defaultPath: lastDir,
  });
  if (!result.canceled && result.filePath) {
    prefsCache['lastSaveDir'] = path.dirname(result.filePath);
    savePrefs();
    return result.filePath;
  }
  return null;
});

ipcMain.handle('store:get', (_event, key) => {
  return prefsCache[key] ?? null;
});

ipcMain.handle('store:set', (_event, key, value) => {
  prefsCache[key] = value;
  savePrefs();
});

ipcMain.handle('app:path', () => {
  return app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath();
});

// --- App lifecycle ---

app.whenReady().then(() => {
  loadPrefs();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
