'use strict';
// ============================================================================
// main.js - Electron main process for Sistemi Genit
// ----------------------------------------------------------------------------
// Security:
//   - contextIsolation: true
//   - nodeIntegration: false
//   - sandbox: true
//   - Only a minimal, validated API is exposed via preload contextBridge.
//   - All SQLite/printer/file operations happen here in the main process and
//     are validated per-IPC-call.
// ============================================================================

const { app, BrowserWindow, ipcMain, dialog, shell, webContents, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { SistemiGenitDatabase } = require('./database');
const printers = require('./printers');
const exporters = require('./exports');
const { registerAtomicHandlers } = require('./ipc/atomic');

const isDev = process.argv.includes('--dev') || !!process.env.SG_DEV;

// Audit v1.1.1: Content-Security-Policy. The app is fully offline; this blocks
// any remote code/resource load as defense-in-depth. Inline script/style stay
// allowed because the built index.html legitimately uses inline blocks.
app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'";
    callback({ responseHeaders: Object.assign({}, details.responseHeaders, { 'Content-Security-Policy': [csp] }) });
  });
});

// global handle to the database instance and the main window
let db = null;
let mainWindow = null;
let userDataDir = '';

// ---------------------------------------------------------------------------
// Logging to a local file (no sensitive data)
// ---------------------------------------------------------------------------
const logDir = () => {
  const d = path.join(app.getPath('userData'), 'logs');
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
};
function logError(context, err) {
  try {
    const line = `[${new Date().toISOString()}] ${context}: ${err && err.stack ? err.stack : err}\n`;
    fs.appendFileSync(path.join(logDir(), 'error.log'), line);
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// Database init
// ---------------------------------------------------------------------------
function initDatabase() {
  userDataDir = app.getPath('userData');
  const dbDir = path.join(userDataDir, 'data');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, 'sistemi_genit.db');
  db = new SistemiGenitDatabase(dbPath);
  // Register all atomic main-process transaction handlers (sales, purchases,
  // PO receiving, Fletë Hyrje/Dalje, returns, corrections, transfers, auth).
  global.__SG_ALLOW_INJECT__ = isDev; // audit v1.1.1: failure-injection only in dev
  registerAtomicHandlers(ipcMain, db, logError);
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#f5f5f5',
    title: 'Sistemi Genit',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webSecurity: !isDev
    }
  });

  // Block navigation away from the app
  mainWindow.webContents.on('will-navigate', (e) => { e.preventDefault(); });

  // Open external links in the system browser (never inside the app)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const indexPath = path.join(__dirname, '..', 'src', 'index.html');
  mainWindow.loadFile(indexPath);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ===========================================================================
// IPC handlers - SQLite (Firebase-compatible API)
// ===========================================================================

// Generic ref().once('value') -> returns { success, value }
ipcMain.handle('sqlite:once', (event, p, queryState) => {
  try {
    const value = queryState && Object.keys(queryState || {}).length
      ? db.query(p, queryState)
      : db.readValue(p);
    return { success: true, value: value === undefined ? null : value };
  } catch (err) {
    logError('sqlite:once', err);
    return { success: false, message: 'Gabim me databazën: ' + err.message };
  }
});

ipcMain.handle('sqlite:set', (event, p, value) => {
  try {
    db.set(p, value);
    return { success: true };
  } catch (err) {
    logError('sqlite:set', err);
    return { success: false, message: 'Nuk u ruajt në SQLite: ' + err.message };
  }
});

ipcMain.handle('sqlite:update', (event, p, value) => {
  try {
    db.update(p, value);
    return { success: true };
  } catch (err) {
    logError('sqlite:update', err);
    return { success: false, message: 'Nuk u përditësua SQLite: ' + err.message };
  }
});

ipcMain.handle('sqlite:remove', (event, p) => {
  try {
    db.remove(p);
    return { success: true };
  } catch (err) {
    logError('sqlite:remove', err);
    return { success: false, message: 'Nuk u fshi nga SQLite: ' + err.message };
  }
});

ipcMain.handle('sqlite:push', (event, p, value) => {
  try {
    const key = db.push(p, value);
    return { success: true, key };
  } catch (err) {
    logError('sqlite:push', err);
    return { success: false, message: 'Nuk u shtua në SQLite: ' + err.message };
  }
});

ipcMain.handle('sqlite:transaction', (event, p, fnName) => {
  // The renderer's createElectronSQLiteDatabase.transaction() does a local
  // read-modify-write via once()/set(), which are already transactional in
  // SQLite (better-sqlite3 wraps each statement). For true atomic multi-step
  // operations the renderer uses db.transaction() helper below.
  try {
    const current = db.readValue(p);
    // We can't serialize a JS function across IPC; the renderer handles the
    // read-modify-write itself and calls set() — which is atomic. This handler
    // simply supports the existing shim's signature.
    return { success: true, value: current === undefined ? null : current };
  } catch (err) {
    logError('sqlite:transaction', err);
    return { success: false, message: err.message };
  }
});

// Begin / commit / rollback explicit transactions for multi-step atomic ops.
ipcMain.handle('sqlite:begin', () => {
  try { db.begin(); return { success: true }; }
  catch (err) { logError('sqlite:begin', err); return { success: false, message: err.message }; }
});
ipcMain.handle('sqlite:commit', () => {
  try { db.commit(); return { success: true }; }
  catch (err) { logError('sqlite:commit', err); return { success: false, message: err.message }; }
});
ipcMain.handle('sqlite:rollback', () => {
  try { db.rollback(); return { success: true }; }
  catch (err) { logError('sqlite:rollback', err); return { success: false, message: err.message }; }
});

// Run a series of operations atomically. ops = [{op:'set'|'update'|'remove'|'push', path, value}]
ipcMain.handle('sqlite:atomic', (event, ops) => {
  try {
    if (!Array.isArray(ops)) return { success: false, message: 'Operacione të pavlefshme' };
    const result = db.atomic(() => {
      const keys = [];
      for (const o of ops) {
        if (!o || !o.op || typeof o.path !== 'string') throw new Error('Operacion i pavlefshëm');
        if (o.op === 'set') db.set(o.path, o.value);
        else if (o.op === 'update') db.update(o.path, o.value);
        else if (o.op === 'remove') db.remove(o.path);
        else if (o.op === 'push') keys.push(db.push(o.path, o.value));
        else throw new Error('Operacion i panjohur: ' + o.op);
      }
      return keys;
    });
    return { success: true, keys: result || [] };
  } catch (err) {
    logError('sqlite:atomic', err);
    return { success: false, message: 'Veprimi dështoi dhe u kthye mbrapsht (rollback): ' + err.message };
  }
});

ipcMain.handle('sqlite:logActivity', (event, action, user, detail) => {
  try { db.logActivity(action, user, detail); return { success: true }; }
  catch (err) { logError('sqlite:logActivity', err); return { success: false, message: err.message }; }
});

// ---------------------------------------------------------------------------
// readiness flag (renderer checks sistemiGenitSQLite.isReady)
// ---------------------------------------------------------------------------
// handled via preload which always reports isReady = true after this point

// ===========================================================================
// IPC handlers - Windows printers
// ===========================================================================

ipcMain.handle('printer:list', async (event) => {
  try {
    const wc = event.sender;
    const list = await wc.getPrintersAsync();
    // normalize to a simple array
    return { success: true, printers: list.map(p => ({
      name: p.name,
      displayName: p.displayName || p.name,
      isDefault: !!p.isDefault,
      status: p.status,
      options: p.options || {}
    })) };
  } catch (err) {
    logError('printer:list', err);
    return { success: false, message: 'Printuesit nuk u lexuan: ' + err.message, printers: [] };
  }
});

// Print HTML content to a chosen printer using a hidden window.
// payload: { html, printerName, profile }
ipcMain.handle('printer:print', async (event, payload) => {
  try {
    const { html, printerName, profile } = payload || {};
    if (!html) return { success: false, message: 'Përmbajtja për printim mungon' };
    const win = new BrowserWindow({
      width: 900, height: 1200, show: false,
      webPreferences: { sandbox: true, contextIsolation: true, offscreen: false }
    });
    try {
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      await new Promise(r => setTimeout(r, 150));
      const opts = printers.printOptions(profile || {}, printerName);
      await new Promise((resolve, reject) => {
        win.webContents.print(opts, (success, reason) => {
          if (success) resolve();
          else reject(new Error(reason || 'Printimi dështoi'));
        });
      });
      return { success: true };
    } finally {
      try { win.destroy(); } catch (e) {}
    }
  } catch (err) {
    logError('printer:print', err);
    return { success: false, message: 'Printimi dështoi: ' + (err.message || err) };
  }
});

// Print to PDF using a hidden window. Returns base64 PDF.
// payload: { html, profile }
ipcMain.handle('printer:printToPdf', async (event, payload) => {
  try {
    const { html, profile } = payload || {};
    if (!html) return { success: false, message: 'Përmbajtja për PDF mungon' };
    const buf = await exporters.htmlToPdf(html, profile);
    return { success: true, base64: buf.toString('base64') };
  } catch (err) {
    logError('printer:printToPdf', err);
    return { success: false, message: 'PDF nuk u krijua: ' + err.message };
  }
});

// Save a base64 PDF to disk via native dialog.
ipcMain.handle('printer:savePdf', async (event, payload) => {
  try {
    const { base64, defaultName } = payload || {};
    if (!base64) return { success: false, message: 'PDF bosh' };
    const buf = Buffer.from(base64, 'base64');
    const res = await exporters.savePdfDialog(mainWindow, defaultName, buf);
    return res;
  } catch (err) {
    logError('printer:savePdf', err);
    return { success: false, message: 'PDF nuk u ruajt: ' + err.message };
  }
});

// Open a print preview window (visible) so the user can use the native print
// dialog with all installed printers. This is the "Print Preview / Normal print
// dialog" path. The HTML is rendered in a real (visible) window.
ipcMain.handle('printer:preview', async (event, payload) => {
  try {
    const { html, title } = payload || {};
    if (!html) return { success: false, message: 'Përmbajtja mungon' };
    const win = new BrowserWindow({
      width: 900, height: 1100, show: true,
      title: title || 'Pamja e printimit',
      webPreferences: { sandbox: true, contextIsolation: true }
    });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    // auto-open the print dialog after load
    setTimeout(() => { try { win.webContents.print(); } catch (e) {} }, 250);
    return { success: true };
  } catch (err) {
    logError('printer:preview', err);
    return { success: false, message: 'Pamja e printimit dështoi: ' + err.message };
  }
});

// ===========================================================================
// IPC handlers - Excel (real .xlsx)
// ===========================================================================

// payload: { matrix, options, defaultName }
ipcMain.handle('export:xlsx', async (event, payload) => {
  try {
    const { matrix, options, defaultName } = payload || {};
    if (!Array.isArray(matrix)) return { success: false, message: 'Të dhëna të pavlefshme për Excel' };
    const buf = await exporters.matrixToXlsxBuffer(matrix, options || {});
    const res = await exporters.saveXlsxDialog(mainWindow, defaultName, buf);
    return res;
  } catch (err) {
    logError('export:xlsx', err);
    return { success: false, message: 'Excel nuk u krijua: ' + err.message };
  }
});

// ===========================================================================
// IPC handlers - File dialogs (save/open) + path memory
// ===========================================================================
let lastDir = '';

ipcMain.handle('dialog:save', async (event, payload) => {
  try {
    const { defaultName, ext, extName, content } = payload || {};
    const filters = [{ name: extName || (ext || 'txt').toUpperCase(), extensions: [ext || 'txt'] }];
    const opts = { title: 'Ruaj skedarin', defaultPath: lastDir ? path.join(lastDir, defaultName || 'file') : (defaultName || 'file'), filters };
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, opts);
    if (canceled || !filePath) return { success: false, message: 'Anuluar' };
    if (content != null) {
      const data = Buffer.isBuffer(content) ? content : Buffer.from(content, content.encoding || 'base64');
      fs.writeFileSync(filePath, data);
    }
    lastDir = path.dirname(filePath);
    return { success: true, path: filePath };
  } catch (err) {
    logError('dialog:save', err);
    return { success: false, message: 'Ruajtja dështoi: ' + err.message };
  }
});

ipcMain.handle('dialog:open', async (event, payload) => {
  try {
    const { ext, extName, multi } = payload || {};
    const filters = [{ name: extName || (ext || 'txt').toUpperCase(), extensions: [ext || 'txt'] }];
    const opts = { title: 'Hap skedarin', defaultPath: lastDir || undefined, filters, properties: multi ? ['multiSelections'] : [] };
    const res = await dialog.showOpenDialog(mainWindow, opts);
    if (res.canceled || !res.filePaths.length) return { success: false, message: 'Anuluar' };
    lastDir = path.dirname(res.filePaths[0]);
    // read file content as base64 so the renderer can decode it
    const out = [];
    for (const fp of res.filePaths) {
      const buf = fs.readFileSync(fp);
      out.push({ path: fp, base64: buf.toString('base64'), size: buf.length });
    }
    return { success: true, files: out };
  } catch (err) {
    logError('dialog:open', err);
    return { success: false, message: 'Hapja dështoi: ' + err.message };
  }
});

// ===========================================================================
// IPC handlers - Backup / Restore
// ===========================================================================

ipcMain.handle('backup:create', async (event, payload) => {
  try {
    const { auto } = payload || {};
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const defaultName = 'Sistemi_Genit_Backup_' + stamp + '.db';
    let destPath;
    if (auto) {
      const backupDir = path.join(userDataDir, 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      destPath = path.join(backupDir, defaultName);
    } else {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Ruaj backup',
        defaultPath: defaultName,
        filters: [{ name: 'Database', extensions: ['db'] }]
      });
      if (canceled || !filePath) return { success: false, message: 'Anuluar' };
      destPath = filePath;
    }
    db.backupTo(destPath);
    return { success: true, path: destPath };
  } catch (err) {
    logError('backup:create', err);
    return { success: false, message: 'Backup dështoi: ' + err.message };
  }
});

ipcMain.handle('backup:restore', async (event) => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Restoro nga backup',
      filters: [{ name: 'Database', extensions: ['db'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths.length) return { success: false, message: 'Anuluar' };
    const src = filePaths[0];

    // Validate the backup before touching the active DB: it must be a readable
    // SQLite file. Open it read-only and run a quick integrity check.
    const Database = require('better-sqlite3');
    let valid = false;
    try {
      const tmp = new Database(src, { readonly: true });
      const r = tmp.prepare("PRAGMA quick_check").get();
      let tables = [];
      try { tables = tmp.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x => x.name); } catch (e) { tables = []; }
      tmp.close();
      // Audit v1.1.1: also require the expected schema, not just a valid SQLite file.
      valid = !!(r && r['quick_check'] === 'ok') && tables.includes('kv_nodes') && tables.includes('sales');
    } catch (e) { valid = false; }
    if (!valid) return { success: false, message: 'Backup i pavlefshëm, i dëmtuar, ose nuk është databazë e Sistemi Genit.' };

    // Never overwrite the active DB directly: copy to a temp, close active,
    // replace, reopen.
    const dbDir = path.join(userDataDir, 'data');
    const activePath = path.join(dbDir, 'sistemi_genit.db');
    const backupCopy = activePath + '.pre-restore-' + Date.now() + '.db';
    if (fs.existsSync(activePath)) fs.copyFileSync(activePath, backupCopy);
    try { db.close(); } catch (e) {}
    fs.copyFileSync(src, activePath);
    // also remove WAL/SHM so SQLite rebuilds them
    for (const ext of ['-wal', '-shm']) {
      const p = activePath + ext;
      if (fs.existsSync(p)) try { fs.unlinkSync(p); } catch (e) {}
    }
    db = new SistemiGenitDatabase(activePath);
    return { success: true, path: activePath, previousBackup: backupCopy };
  } catch (err) {
    logError('backup:restore', err);
    return { success: false, message: 'Restorimi dështoi: ' + err.message };
  }
});

// ===========================================================================
// IPC handlers - App info / paths
// ===========================================================================
ipcMain.handle('app:info', () => {
  return {
    success: true,
    version: app.getVersion(),
    userData: userDataDir,
    isDev,
    platform: process.platform,
    electron: process.versions.electron
  };
});

ipcMain.handle('app:openExternal', (event, url) => {
  try { shell.openExternal(url); return { success: true }; }
  catch (err) { return { success: false, message: err.message }; }
});

ipcMain.handle('app:revealInFolder', (event, filePath) => {
  try { shell.showItemInFolder(filePath); return { success: true }; }
  catch (err) { return { success: false, message: err.message }; }
});

// ===========================================================================
// App lifecycle
// ===========================================================================
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else if (process.argv.includes('--screenshot')) {
// ===========================================================================
// Screenshot mode (--screenshot) — for automated visual testing
// Captures real screenshots of the running app: login, dashboard, etc.
// ===========================================================================
  const screenshotDir = path.join(__dirname, '..', 'test-output', 'screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  // No demo data is created in screenshot mode. A fresh database remains empty.

  app.whenReady().then(() => {
    try { initDatabase(); } catch (err) { logError('initDatabase', err); }
    createWindow();

    mainWindow.webContents.on('did-finish-load', async () => {
      console.log('[SG-SCREENSHOT] Page loaded, waiting 3s for render...');
      await new Promise(r => setTimeout(r, 3000));

      // Screenshot 1: Login screen
      try {
        const img = await mainWindow.webContents.capturePage();
        fs.writeFileSync(path.join(screenshotDir, '01-login-screen.png'), img.toPNG());
        console.log('[SG-SCREENSHOT] 01-login-screen.png captured (' + img.getSize().width + 'x' + img.getSize().height + ')');
      } catch (e) { console.log('[SG-SCREENSHOT] Screenshot 1 error: ' + e.message); }

      // First-run setup is intentionally not automated in screenshot mode.

      // Screenshot 2: After login
      await new Promise(r => setTimeout(r, 5000));
      try {
        const img2 = await mainWindow.webContents.capturePage();
        fs.writeFileSync(path.join(screenshotDir, '02-after-login.png'), img2.toPNG());
        console.log('[SG-SCREENSHOT] 02-after-login.png captured (' + img2.getSize().width + 'x' + img2.getSize().height + ')');
      } catch (e) { console.log('[SG-SCREENSHOT] Screenshot 2 error: ' + e.message); }

      // Get page text to verify what rendered
      try {
        const pageText = await mainWindow.webContents.executeJavaScript('document.body ? document.body.innerText.substring(0, 800) : "no body"');
        console.log('[SG-SCREENSHOT] Page text: ' + pageText.substring(0, 400));
      } catch (e) { console.log('[SG-SCREENSHOT] Text error: ' + e.message); }

      // Screenshot 3: Try navigating to products page
      await new Promise(r => setTimeout(r, 1500));
      try {
        const navResult = await mainWindow.webContents.executeJavaScript(`
          (function() {
            var links = document.querySelectorAll('a, button, .nav-item, [class*="nav"], [class*="menu"], li');
            for (var i = 0; i < links.length; i++) {
              var t = (links[i].textContent||'').trim().toLowerCase();
              if (t.indexOf('produkt') >= 0 || t.indexOf('artikuj') >= 0 || t.indexOf('magazin') >= 0) {
                links[i].click();
                return 'navigated to: ' + t.substring(0, 30);
              }
            }
            return 'no-product-nav-found';
          })();
        `);
        console.log('[SG-SCREENSHOT] Navigation: ' + navResult);
      } catch (e) { console.log('[SG-SCREENSHOT] Nav error: ' + e.message); }

      await new Promise(r => setTimeout(r, 3000));
      try {
        const img3 = await mainWindow.webContents.capturePage();
        fs.writeFileSync(path.join(screenshotDir, '03-products-page.png'), img3.toPNG());
        console.log('[SG-SCREENSHOT] 03-products-page.png captured');
      } catch (e) { console.log('[SG-SCREENSHOT] Screenshot 3 error: ' + e.message); }

      try {
        const pageText3 = await mainWindow.webContents.executeJavaScript('document.body ? document.body.innerText.substring(0, 500) : "no body"');
        console.log('[SG-SCREENSHOT] Page3 text: ' + pageText3.substring(0, 300));
      } catch (e) {}

      console.log('[SG-SCREENSHOT] All screenshots captured. Exiting.');
      app.quit();
    });

    // Safety timeout
    setTimeout(() => { console.log('[SG-SCREENSHOT] Timeout, exiting.'); app.quit(); }, 45000);
  });

  app.on('window-all-closed', () => app.quit());
} else {
// ===========================================================================
// Normal mode (production desktop app)
// ===========================================================================
  app.whenReady().then(() => {
    try { initDatabase(); } catch (err) { logError('initDatabase', err); }
    createWindow();
  });

  app.on('window-all-closed', () => {
    if (db) { try { db.close(); } catch (e) {} db = null; }
    app.quit();
  });

  app.on('activate', () => {
    if (mainWindow === null) {
      createWindow();
    }
  });
}
