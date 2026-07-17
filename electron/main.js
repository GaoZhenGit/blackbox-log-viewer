const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { detectEncoder } = require('./gpu-detect.js');
const { startExport, probeVideo, getFfmpegPath } = require('./ffmpeg.js');

// Polyfills
const $stub = function() { return $stub.fn; };
$stub.fn = new Proxy({}, { get: () => () => $stub.fn });
$stub.extend = function() {
  var args = Array.prototype.slice.call(arguments);
  if (typeof args[0] === 'boolean') args.shift(); // drop jQuery deep-copy flag
  return Object.assign.apply(null, args);
};
globalThis.$ = $stub;
globalThis.jQuery = $stub;
globalThis.document = {
  hidden: false, addEventListener: () => {}, removeEventListener: () => {},
  createElement: (tag) => tag === 'canvas' ? createCanvas(1, 1) : {},
  documentElement: { style: {} },
};
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
globalThis.window = globalThis;
globalThis.navigator = { userAgent: 'node' };
globalThis.Modernizr = { canvas: true };
globalThis.semver = { gte: () => true, lt: () => false, gt: () => false, valid: () => true, clean: (v) => v };
globalThis.userSettings = {
  drawSticks: false, drawCraft: false, drawAnalyser: false,
  sticks: { size: 0 }, craft: { size: 0 }, analyser: { size: 0 },
};
globalThis.blackboxLogViewer = {
  getMarker: () => null,
  getBookmarks: () => [],
  getBookmarkTimes: () => [],
};

const { FlightLog } = require('./bundle/flightlog-bundle.cjs');
const { FlightLogGrapher, GraphConfig, ThemeColors } = require('./bundle/grapher-bundle.cjs');
const { createCanvas } = require('@napi-rs/canvas');

// Populate ThemeColors cache with dark theme values (same as browser CSS variables)
const DARK_THEME = {
  '--graph-background': '#1a1a1a',
  '--graph-grid': 'rgba(255,255,255,0.2)',
  '--graph-text': 'rgba(255,255,255,0.95)',
  '--graph-text-secondary': 'rgba(255,255,255,0.75)',
  '--graph-axis': 'rgba(255,255,255,0.6)',
};
for (const [k, v] of Object.entries(DARK_THEME)) {
  ThemeColors.colorCache[k] = v;
}

let mainWindow = null;
let activeExport = null;
let prefsPath = null;
let prefsCache = {};

function getPrefsPath() {
  if (prefsPath) return prefsPath;
  if (app.isPackaged) prefsPath = path.join(path.dirname(app.getPath('exe')), 'preferences.json');
  else prefsPath = path.join(app.getAppPath(), 'preferences.json');
  return prefsPath;
}

function loadPrefs() {
  try { if (fs.existsSync(getPrefsPath())) prefsCache = JSON.parse(fs.readFileSync(getPrefsPath(), 'utf-8')); }
  catch (e) { prefsCache = {}; }
}

function savePrefs() {
  try { fs.writeFileSync(getPrefsPath(), JSON.stringify(prefsCache, null, 2), 'utf-8'); }
  catch (e) { console.error('Failed to save prefs:', e.message); }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, show: false, backgroundThrottling: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  if (process.env.NODE_ENV === 'development') mainWindow.loadURL('http://localhost:5173');
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  mainWindow.maximize();
  mainWindow.show();
  mainWindow.webContents.openDevTools();
}

// IPC
ipcMain.handle('dialog:openFile', async (_event, options) => {
  const lastDir = prefsCache['lastOpenDir'] || undefined;
  const result = await dialog.showOpenDialog(mainWindow, { ...options, defaultPath: lastDir, properties: ['openFile'] });
  if (!result.canceled && result.filePaths[0]) {
    prefsCache['lastOpenDir'] = path.dirname(result.filePaths[0]); savePrefs();
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('dialog:saveFile', async (_event, options) => {
  const lastDir = prefsCache['lastSaveDir'] || undefined;
  let defaultPath = lastDir ? path.join(lastDir, path.basename(options.defaultPath || 'video.mp4')) : options.defaultPath;
  const result = await dialog.showSaveDialog(mainWindow, { ...options, defaultPath });
  if (!result.canceled && result.filePath) {
    prefsCache['lastSaveDir'] = path.dirname(result.filePath); savePrefs();
    return result.filePath;
  }
  return null;
});

ipcMain.handle('store:get', (_event, key) => prefsCache[key] ?? null);
ipcMain.handle('store:set', (_event, key, value) => { prefsCache[key] = value; savePrefs(); });
ipcMain.handle('app:path', () => app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath());
ipcMain.handle('encoder:info', () => detectEncoder());

ipcMain.handle('video:probe', async (_event, videoPath) => {
  try { return await probeVideo(videoPath); }
  catch (e) { console.error('ffprobe error:', e.message); return null; }
});

ipcMain.handle('export:start', (_event, config) => {
  if (activeExport) { activeExport.cancel(); activeExport = null; }
  activeExport = startExport(config,
    (progress) => { if (mainWindow) mainWindow.webContents.send('export:progress', progress); },
    (error) => {
      if (mainWindow) mainWindow.webContents.send('export:complete', { success: !error, error: error ? error.message : null });
      activeExport = null;
    },
    (cmdLine) => { if (mainWindow) mainWindow.webContents.send('export:cmdline', cmdLine); }
  );
});

ipcMain.on('export:frame', (_event, buffer) => { if (activeExport) activeExport.writeFrame(buffer); });
ipcMain.on('export:cancel', () => { if (activeExport) { activeExport.cancel(); activeExport = null; } });

// Plan B
ipcMain.handle('export:start-b', (_event, config) => {
  const { logPath, outputPath, width, height, frameRate, encoder, bitrate, gop, videoSourcePath } = config;
  const renderUserSettings = config.userSettings || {};
  if (activeExport) { activeExport.cancel(); activeExport = null; }

  const logData = fs.readFileSync(logPath);
  const flightLog = new FlightLog(new Uint8Array(logData));
  if (!flightLog.openLog(0)) {
    if (mainWindow) mainWindow.webContents.send('export:complete', { success: false, error: 'Failed to parse log' });
    return;
  }

  // Follow browser logic: clamp inTime/outTime to log range (same as video_export_dialog.show)
  const logMin = flightLog.getMinTime(), logMax = flightLog.getMaxTime();
  let inT = config.inTime, outT = config.outTime;
  if (inT === false || inT === undefined || inT < logMin || inT > logMax) inT = logMin;
  if (outT === false || outT === undefined || outT < logMin || outT > logMax) outT = logMax;
  const flightVideoOffset = config.flightVideoOffset || 0;

  // Build GraphConfig preserving multi-graph structure (labels, heights, fields)
  const renderGraphs = config.graphs || [];

  const graphConfig = new GraphConfig();
  if (renderGraphs.length > 0) {
    graphConfig.adaptGraphs(flightLog, renderGraphs.map(g => ({
      label: g.label || '',
      height: g.height || 100,
      fields: (g.fields || []).map(f => ({
        name: f.fieldName, color: f.color, curve: { width: f.width || 1.5 }
      }))
    })));
  }

  // Create canvases
  const mainCanvas = createCanvas(width, height);
  const stickCanvas = createCanvas(width, height);
  const craftCanvas = createCanvas(width, height);
  const analyserCanvas = createCanvas(width, height);

  // Merge user settings from renderer (workspace) with export-specific overrides.
  // Provide fallback defaults for stick/craft/analyser in case they're missing.
  const grapherOpts = Object.assign({
    sticks: { left: '75%', top: '20%', size: '30%' },
    craft: { left: '15%', top: '48%', size: '40%' },
    analyser: { left: '2%', top: '60%', size: '35%' },
    drawSticks: true, craftType: '3D', drawAnalyser: true,
  }, renderUserSettings, {
    eraseBackground: true, fillBackground: false, drawEvents: false,
  });
  const grapher = new FlightLogGrapher(
    flightLog, graphConfig,
    mainCanvas, stickCanvas, craftCanvas, analyserCanvas,
    grapherOpts
  );

  // Compute overlay positions (same formula as grapher.resize CSS layout)
  function overlayPos(opt, canvasW, canvasH, isStick) {
    const sizePct = parseInt(opt.size) || 0;
    if (sizePct <= 0) return null;
    let w, h;
    if (isStick) {
      h = (canvasH * sizePct) / 2 / 100;
      w = (canvasW * sizePct) / 100;
    } else {
      h = canvasH * sizePct / 100;
      w = h; // craft and analyser are square
    }
    const left = Math.max((canvasW * parseInt(opt.left)) / 100 - w / 2, 0);
    const top = Math.max((canvasH * parseInt(opt.top)) / 100 - h / 2, 0);
    return { left, top, w, h };
  }
  const stickPos = overlayPos(renderUserSettings.sticks || {}, width, height, true);
  const craftPos = overlayPos(renderUserSettings.craft || {}, width, height, false);
  const analyserPos = overlayPos(renderUserSettings.analyser || {}, width, height, false);

  const ctx = mainCanvas.getContext('2d');

  const frameDuration = 1e6 / frameRate;

  // Log sync: compute video start offset matching browser logic
  // browser: video.currentTime = (frameTime - logMin) / 1e6 + flightVideoOffset
  const logToVideoSec = (inT - logMin) / 1e6 + flightVideoOffset;
  // Positive offset: video leads → seek video forward
  // Negative offset: log leads → trim log start so graph and video align at output time 0
  let videoStartSec = 0;
  if (logToVideoSec > 0) {
    videoStartSec = logToVideoSec;
  } else if (logToVideoSec < 0) {
    inT += Math.round(-logToVideoSec * 1e6); // trim log start
  }
  console.log('[PlanB] sync: offset=' + flightVideoOffset + ' videoStart=' + videoStartSec.toFixed(3) + 's inT=' + inT);
  const totalFrames = Math.round((outT - inT) / frameDuration);
  console.log('[PlanB] frames:', totalFrames, 'duration:', (totalFrames / frameRate).toFixed(1) + 's', 'resolution:', width + 'x' + height);

  const ffmpegArgs = [];
  if (videoSourcePath) {
    if (videoStartSec > 0) ffmpegArgs.push('-ss', String(videoStartSec));
    ffmpegArgs.push('-i', videoSourcePath);
  }
  ffmpegArgs.push('-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-r', String(frameRate), '-i', '-');
  if (videoSourcePath) {
    ffmpegArgs.push('-filter_complex', '[0:v]setpts=PTS-STARTPTS[bg];[1:v]setpts=PTS-STARTPTS[fg];[bg][fg]overlay=format=auto[out]');
    ffmpegArgs.push('-map', '[out]');
  } else {
    ffmpegArgs.push('-map', '0:v');
  }
  ffmpegArgs.push('-c:v', encoder);
  if (bitrate) ffmpegArgs.push('-b:v', String(bitrate));
  if (gop) ffmpegArgs.push('-g', String(gop));
  ffmpegArgs.push('-pix_fmt', 'yuv420p', '-y', outputPath);

  const cmdLine = [getFfmpegPath(), ...ffmpegArgs].join(' ');
  console.log('[PlanB]', cmdLine);
  if (mainWindow) mainWindow.webContents.send('export:cmdline', cmdLine);

  const { spawn } = require('child_process');
  const ffmpeg = spawn(getFfmpegPath(), ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
  let cancelled = false;

  ffmpeg.on('error', (err) => {
    if (mainWindow) mainWindow.webContents.send('export:complete', { success: false, error: err.message });
  });
  ffmpeg.on('close', (code) => {
    const totalElapsed = (Date.now() - renderStartTime) / 1000;
    console.log('[PlanB] ffmpeg done: code=' + code + ' totalTime=' + totalElapsed.toFixed(1) + 's');
    activeExport = null;
    if (mainWindow) mainWindow.webContents.send('export:complete', { success: code === 0 || code === null });
  });

  let lastTime = 0;
  ffmpeg.stderr.on('data', (d) => {
    const m = d.toString().match(/time=(\d+):(\d+):(\d+)\.(\d+)/);
    if (m) { const sec = +m[1]*3600 + +m[2]*60 + +m[3] + +m[4]/100; if (sec > lastTime) { lastTime = sec; } }
  });

  activeExport = { cancel() { cancelled = true; ffmpeg.stdin.end(); }, writeFrame() {} };

  let fi = 0, ft = inT;
  const renderStartTime = Date.now();
  let totalRenderUs = 0, totalGetImageUs = 0, totalWriteUs = 0;
  function renderLoop() {
    if (cancelled) return;
    const end = Math.min(fi + 8, totalFrames);
    for (; fi < end; fi++, ft += frameDuration) {
      const t0 = performance.now();
      grapher.render(ft);
      // Composite overlays (same order as FlightLogVideoRenderer)
      if (stickPos) ctx.drawImage(stickCanvas, stickPos.left, stickPos.top);
      if (craftPos) ctx.drawImage(craftCanvas, craftPos.left, craftPos.top);
      if (analyserPos) ctx.drawImage(analyserCanvas, analyserPos.left, analyserPos.top);
      const t1 = performance.now();
      const imgData = ctx.getImageData(0, 0, width, height);
      const t2 = performance.now();
      if (!ffmpeg.stdin.destroyed) ffmpeg.stdin.write(Buffer.from(imgData.data));
      const t3 = performance.now();
      totalRenderUs += (t1 - t0) * 1000;
      totalGetImageUs += (t2 - t1) * 1000;
      totalWriteUs += (t3 - t2) * 1000;
    }
    if (mainWindow) mainWindow.webContents.send('export:progress', { frameIndex: fi, totalFrames });
    if (fi >= totalFrames) {
      const elapsed = (Date.now() - renderStartTime) / 1000;
      const avgRender = (totalRenderUs / totalFrames / 1000).toFixed(1);
      const avgGetImg = (totalGetImageUs / totalFrames / 1000).toFixed(1);
      const avgWrite = (totalWriteUs / totalFrames / 1000).toFixed(1);
      const fps = (totalFrames / elapsed).toFixed(1);
      console.log('[PlanB] perf: ' + totalFrames + ' frames in ' + elapsed.toFixed(1) + 's = ' + fps + ' fps');
      console.log('[PlanB] avg: render=' + avgRender + 'ms getImageData=' + avgGetImg + 'ms stdinWrite=' + avgWrite + 'ms');
      ffmpeg.stdin.end();
    }
    else setImmediate(renderLoop);
  }
  setImmediate(renderLoop);
});

ipcMain.on('export:start-b-cancel', () => {
  if (activeExport) { activeExport.cancel(); activeExport = null; }
});

// Lifecycle
app.whenReady().then(() => { loadPrefs(); createWindow(); });
app.on('window-all-closed', () => {
  if (activeExport) { activeExport.cancel(); activeExport = null; }
  app.quit();
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
