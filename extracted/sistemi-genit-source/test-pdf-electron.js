'use strict';
// ============================================================================
// test-pdf-electron.js — Provon PDF real përmes Electron printToPDF
// Ekzekutohet brenda Electron. Provon të gjithë formatet: A4, A5, 58mm, 80mm
// dhe verifikon që çdo output është PDF i vërtetë (%PDF header).
// Ruaj rezultatet në një skedar JSON.
// ============================================================================

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, 'test-output');
fs.mkdirSync(OUT_DIR, { recursive: true });

const SAMPLE_HTML = `<!doctype html><html><head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; padding: 20px; color: #222; }
  h1 { color: #5E35B1; margin-bottom: 4px; }
  .doc-num { color: #888; font-size: 14px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background: #5E35B1; color: #fff; }
  .total-row td { font-weight: bold; background: #f5f0ff; }
  .footer { margin-top: 30px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
</style></head><body>
<h1>Fletë Hyrje FH-0001</h1>
<div class="doc-num">Nr: FH-0001 | Data: 15/07/2024 | Furnitor: Distributor Alfa</div>
<table>
  <tr><th>Produkt</th><th>Sasi</th><th>Çmim (L)</th><th>Total (L)</th></tr>
  <tr><td>Ujë 1L</td><td>20</td><td>40</td><td>800</td></tr>
  <tr><td>Bukë</td><td>10</td><td>25</td><td>250</td></tr>
  <tr class="total-row"><td colspan="3">TOTAL</td><td>1,050</td></tr>
</table>
<div class="footer">Sistemi Genit — Dokument i gjeneruar automatikisht</div>
</body></html>`;

// IMPORTANT: Electron printToPDF interprets a custom pageSize object
// {width,height} as INCHES (not microns). Using microns here previously
// produced 58mm PDFs of ~4,176,000 x ~21,384,000 points (absurd). With inches:
//   58mm -> 2.28346 in -> ~164.4 pts
//   80mm -> 3.14961 in -> ~226.8 pts
// Verified via pdfinfo after generation.
const MM_PER_INCH = 25.4;
const mmIn = (mm) => mm / MM_PER_INCH;
const FORMATS = [
  { name: 'A4', opts: { pageSize: 'A4', printBackground: true, margins: { marginType: 0 } } },
  { name: 'A5', opts: { pageSize: 'A5', printBackground: true, margins: { marginType: 0 } } },
  { name: '58mm', opts: { pageSize: { width: mmIn(58), height: mmIn(297) }, printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } } },
  { name: '80mm', opts: { pageSize: { width: mmIn(80), height: mmIn(297) }, printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } } }
];

const results = [];
let win;

async function runTest(format) {
  return new Promise((resolve) => {
    const w = new BrowserWindow({
      width: 800, height: 600, show: false,
      webPreferences: { offscreen: false, sandbox: false }
    });
    w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(SAMPLE_HTML));
    w.webContents.on('did-finish-load', async () => {
      try {
        const buf = await w.webContents.printToPDF(format.opts);
        const size = buf.length;
        const header = buf.slice(0, 5).toString('latin1');
        const isPdf = header.indexOf('%PDF') === 0;
        const outFile = path.join(OUT_DIR, 'flet-hyrje-' + format.name + '.pdf');
        fs.writeFileSync(outFile, buf);
        results.push({
          format: format.name,
          status: isPdf ? 'PASS' : 'FAIL',
          size: size,
          header: header.replace(/\n/g, ''),
          file: outFile,
          isPdf: isPdf
        });
        console.log(`[${isPdf ? 'PASS' : 'FAIL'}] PDF ${format.name}: ${size} bytes, header="${header.replace(/\n/g,'')}" → ${outFile}`);
      } catch (e) {
        results.push({ format: format.name, status: 'FAIL', error: e.message });
        console.log(`[FAIL] PDF ${format.name}: ${e.message}`);
      }
      w.close();
      resolve();
    });
    w.webContents.on('did-fail-load', (e, code, desc) => {
      results.push({ format: format.name, status: 'FAIL', error: 'did-fail-load: ' + desc });
      console.log(`[FAIL] PDF ${format.name}: did-fail-load ${desc}`);
      w.close();
      resolve();
    });
  });
}

app.whenReady().then(async () => {
  console.log('=== TEST PDF REAL (Electron printToPDF) ===');
  console.log('Formatet: A4, A5, 58mm, 80mm\n');
  for (const fmt of FORMATS) {
    await runTest(fmt);
  }
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`\n=== PERMBLEDHJA: ${passed} PASS / ${failed} FAIL ===`);

  const report = { timestamp: new Date().toISOString(), passed, failed, results };
  fs.writeFileSync(path.join(OUT_DIR, 'pdf-test-results.json'), JSON.stringify(report, null, 2));
  console.log('Raporti: ' + path.join(OUT_DIR, 'pdf-test-results.json'));
  app.quit();
});

app.on('window-all-closed', () => {});

// Safety timeout
setTimeout(() => { console.log('Timeout — dalje.'); app.quit(); process.exit(0); }, 30000);
