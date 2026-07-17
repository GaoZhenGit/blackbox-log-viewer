const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getFilePath: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch (e) {
      return null;
    }
  },
  openFileDialog: (options) => ipcRenderer.invoke('dialog:openFile', options),
  saveFileDialog: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  storeGet: (key) => ipcRenderer.invoke('store:get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store:set', key, value),
  getAppPath: () => ipcRenderer.invoke('app:path'),
  getEncoderInfo: () => ipcRenderer.invoke('encoder:info'),
  probeVideo: (videoPath) => ipcRenderer.invoke('video:probe', videoPath),

  exportVideoStart: (config) => ipcRenderer.invoke('export:start', config),
  exportVideoStartB: (config) => ipcRenderer.invoke('export:start-b', config),
  exportVideoCancel: () => {
    ipcRenderer.send('export:cancel');
    ipcRenderer.send('export:start-b-cancel'); // Plan B cancel
  },
  sendFrame: (buffer) => ipcRenderer.send('export:frame', buffer),

  onExportProgress: (callback) => {
    ipcRenderer.on('export:progress', (_event, data) => callback(data));
  },
  onExportCmdLine: (callback) => {
    ipcRenderer.on('export:cmdline', (_event, data) => callback(data));
  },
  onExportComplete: (callback) => {
    ipcRenderer.on('export:complete', (_event, data) => callback(data));
  },
  removeExportListeners: () => {
    ipcRenderer.removeAllListeners('export:progress');
    ipcRenderer.removeAllListeners('export:cmdline');
    ipcRenderer.removeAllListeners('export:complete');
  },
});
