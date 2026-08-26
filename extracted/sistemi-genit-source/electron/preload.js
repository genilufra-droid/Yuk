'use strict';
// ============================================================================
// preload.js - Secure contextBridge for Sistemi Genit
// ----------------------------------------------------------------------------
// Exposes a minimal, validated API to the renderer (window.sistemiGenitAPI and
// window.sistemiGenitSQLite) so the existing HTML app's createElectronSQLiteDatabase()
// shim and export/print hooks work without exposing Node.js.
//
// Security: contextIsolation + sandbox + nodeIntegration:false. Only the
// functions below are reachable from the renderer.
// ============================================================================

const { contextBridge, ipcRenderer } = require('electron');

// validate a database path string
function validPath(p) {
  return typeof p === 'string' && p.length > 0 && p.length < 4096;
}

// validate that a value is JSON-serializable (no functions, no cycles of weird types)
function safeValue(v) {
  try {
    JSON.stringify(v);
    return true;
  } catch (e) {
    return false;
  }
}

// SQLite bridge matching the renderer's createElectronSQLiteDatabase() shim.
// The shim expects:  window.sistemiGenitSQLite = { isReady, once, set, update,
// remove, push, ... } where each returns a Promise resolving to
// { success, value|key, message }.
const sqliteBridge = {
  isReady: true,

  once: (p, queryState) => {
    if (!validPath(p)) return Promise.resolve({ success: false, message: 'Shteg i pavlefshëm' });
    return ipcRenderer.invoke('sqlite:once', p, queryState || null);
  },
  set: (p, value) => {
    if (!validPath(p) || !safeValue(value)) return Promise.resolve({ success: false, message: 'Vlerë e pavlefshme' });
    return ipcRenderer.invoke('sqlite:set', p, value);
  },
  update: (p, value) => {
    if (!validPath(p) || !safeValue(value)) return Promise.resolve({ success: false, message: 'Vlerë e pavlefshme' });
    return ipcRenderer.invoke('sqlite:update', p, value);
  },
  remove: (p) => {
    if (!validPath(p)) return Promise.resolve({ success: false, message: 'Shteg i pavlefshme' });
    return ipcRenderer.invoke('sqlite:remove', p);
  },
  push: (p, value) => {
    if (!validPath(p) || !safeValue(value)) return Promise.resolve({ success: false, message: 'Vlerë e pavlefshme' });
    return ipcRenderer.invoke('sqlite:push', p, value === undefined ? null : value);
  },

  // transaction helper used by the shim - it does read-modify-write in the
  // renderer and commits via set(), which is atomic in SQLite.
  transactionRead: (p) => {
    if (!validPath(p)) return Promise.resolve({ success: false, message: 'Shteg i pavlefshme' });
    return ipcRenderer.invoke('sqlite:once', p, null);
  },

  // explicit transaction control for multi-step atomic operations
  begin: () => ipcRenderer.invoke('sqlite:begin'),
  commit: () => ipcRenderer.invoke('sqlite:commit'),
  rollback: () => ipcRenderer.invoke('sqlite:rollback'),
  atomic: (ops) => {
    if (!Array.isArray(ops)) return Promise.resolve({ success: false, message: 'Operacione të pavlefshme' });
    return ipcRenderer.invoke('sqlite:atomic', ops);
  },

  logActivity: (action, user, detail) =>
    ipcRenderer.invoke('sqlite:logActivity', String(action || ''), String(user || ''), String(detail || '')),

  // ---- Atomic main-process transaction handlers (stock-changing ops) ----
  // Each of these executes document + items + stock + movements + sequence +
  // audit inside ONE better-sqlite3 transaction, so partial writes are
  // impossible. The renderer routes fbCreateSale etc. through these.
  saleCommit: (payload) => ipcRenderer.invoke('sale:commit', payload),
  saleUpdate: (payload) => ipcRenderer.invoke('sale:update', payload),
  saleCancel: (payload) => ipcRenderer.invoke('sale:cancel', payload),
  purchasePost: (payload) => ipcRenderer.invoke('purchase:post', payload),
  purchaseOrderReceive: (payload) => ipcRenderer.invoke('purchaseOrder:receive', payload),
  warehouseDocSave: (payload) => ipcRenderer.invoke('warehouseDoc:save', payload),
  returnCommit: (payload) => ipcRenderer.invoke('return:commit', payload),
  stockCorrection: (payload) => ipcRenderer.invoke('stock:correction', payload),
  stockTransfer: (payload) => ipcRenderer.invoke('stock:transfer', payload),
  stockBulkIn: (payload) => ipcRenderer.invoke('stock:bulkIn', payload),
  authLogin: (payload) => ipcRenderer.invoke('auth:login', payload),
  authHashPassword: (payload) => ipcRenderer.invoke('auth:hashPassword', payload),
  dbDebugCounts: () => ipcRenderer.invoke('db:debugCounts'),
  systemInjectFailure: (payload) => ipcRenderer.invoke('system:injectFailure', payload)
};

// General app API (printers, exports, dialogs, backup)
const appBridge = {
  // printers
  listPrinters: () => ipcRenderer.invoke('printer:list'),
  print: (payload) => ipcRenderer.invoke('printer:print', payload),
  printToPdf: (payload) => ipcRenderer.invoke('printer:printToPdf', payload),
  savePdf: (payload) => ipcRenderer.invoke('printer:savePdf', payload),
  preview: (payload) => ipcRenderer.invoke('printer:preview', payload),

  // excel
  exportXlsx: (payload) => ipcRenderer.invoke('export:xlsx', payload),
  exportAlphaXlsx: (payload) => ipcRenderer.invoke('export:alphaXlsx', payload),

  // dialogs
  saveDialog: (payload) => ipcRenderer.invoke('dialog:save', payload),
  openDialog: (payload) => ipcRenderer.invoke('dialog:open', payload),

  // backup / restore
  createBackup: (payload) => ipcRenderer.invoke('backup:create', payload),
  restoreBackup: () => ipcRenderer.invoke('backup:restore'),

  // app info
  info: () => ipcRenderer.invoke('app:info'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', String(url || '')),
  revealInFolder: (fp) => ipcRenderer.invoke('app:revealInFolder', String(fp || '')),

  // platform flag (renderer uses to enable Electron-only features)
  isElectron: true,
  platform: process.platform
};

contextBridge.exposeInMainWorld('sistemiGenitSQLite', sqliteBridge);
contextBridge.exposeInMainWorld('sistemiGenitAPI', appBridge);
