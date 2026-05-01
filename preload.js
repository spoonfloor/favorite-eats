// preload.js
// Exposes the small Electron APIs still needed by the renderer.

const { contextBridge, ipcRenderer } = require('electron');

// Guard: only expose minimal, explicit functions

const api = Object.freeze({
  // Optional helper: ask main for some environment info if you want (not required)
  getEnv: () => ipcRenderer.invoke('getEnv'),

  // Export the active shopping list to a new Google Doc.
  googleDocsExportShoppingList: (payload) =>
    ipcRenderer.invoke('googleDocsExportShoppingList', payload),
});

contextBridge.exposeInMainWorld('electronAPI', api);
