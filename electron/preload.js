const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: (options) => ipcRenderer.invoke('dialog:openFile', options),
  saveFileDialog: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  storeGet: (key) => ipcRenderer.invoke('store:get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store:set', key, value),
  getAppPath: () => ipcRenderer.invoke('app:path'),
});
