'use strict';
// ============================================================================
// build-frontend.js
// Transforms the original single-file HTML app into a production Electron
// frontend (src/index.html + src/app.js) with:
//   - all CDN libraries replaced by local vendor files (offline)
//   - Babel standalone removed; the React app is pre-compiled to plain JS
//   - an Electron bridge injected (SQLite, printers, PDF/XLSX exports)
//   - Firebase CDN scripts removed (the app already falls back to the SQLite
//     bridge when window.sistemiGenitSQLite.isReady is true)
//   - the Cloudflare challenge iframe script stripped
//
// Input:  ../Sistem_Genit_i_ri_-_FLETE_HYRJE_MODEL_FIX.html  (in /workspace)
// Output: src/index.html, src/app.compiled.js, src/electron-bridge.js
// ============================================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// Source HTML is now bundled INSIDE the project (build/source/) so the build
// is fully reproducible from a clean checkout of the source ZIP, with no
// dependency on any file outside the project directory.
const SRC_HTML = path.join(ROOT, 'build', 'source', 'Sistem_Genit_i_ri_-_FLETE_HYRJE_MODEL_FIX.html');
const OUT_DIR = path.join(ROOT, 'src');

if (!fs.existsSync(SRC_HTML)) {
  console.error('Source HTML not found at', SRC_HTML);
  process.exit(1);
}
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const html = fs.readFileSync(SRC_HTML, 'utf8');
console.log('Source HTML length:', html.length, 'chars');

// ---------------------------------------------------------------------------
// 1. Split the HTML into head + 3 script blocks + tail
// ---------------------------------------------------------------------------
const lines = html.split('\n');

// Locate the script tag boundaries
function findLine(re, from) {
  for (let i = from || 0; i < lines.length; i++) if (re.test(lines[i])) return i;
  return -1;
}

// <script> plain (translation) starts at the first <script> after <div id=root>
const rootDivIdx = findLine(/<div id="root">/, 0);
const s1Open = findLine(/<script>/, rootDivIdx);
const s1Close = findLine(/<\/script>/, s1Open + 1);

const s2Open = findLine(/<script>/, s1Close + 1);
const s2Close = findLine(/<\/script>/, s2Open + 1);

const s3Open = findLine(/<script type="text\/babel">/, s2Close + 1);
const s3Close = findLine(/<\/script>/, s3Open + 1);

console.log('Script1 (translation):', s1Open + 1, '-', s1Close + 1);
console.log('Script2 (db/api):    ', s2Open + 1, '-', s2Close + 1);
console.log('Script3 (react/babel):', s3Open + 1, '-', s3Close + 1);

if (s1Open < 0 || s2Open < 0 || s3Open < 0) {
  console.error('Could not locate all script blocks.');
  process.exit(1);
}

const scriptTranslation = lines.slice(s1Open + 1, s1Close).join('\n');
const scriptDbApi = lines.slice(s2Open + 1, s2Close).join('\n');
const scriptReactBabel = lines.slice(s3Open + 1, s3Close).join('\n');

// ---------------------------------------------------------------------------
// 2. Extract the <head> ... up to the first <script> (CDN block) and the
//    inline <style> block, then rebuild with local vendor links.
// ---------------------------------------------------------------------------

// The head starts at <head> and the inline <style> begins right after the CDN
// <script>/<link> lines. We capture everything from <style> to </style>.
const headOpenIdx = findLine(/<head>/, 0);
const styleOpenIdx = findLine(/<style>/, headOpenIdx);
const styleCloseIdx = findLine(/<\/style>/, styleOpenIdx);
// Extract the raw style then strip any external font imports so the app
// works fully offline (Google Fonts / any CDN @import is removed).
let styleContent = lines.slice(styleOpenIdx, styleCloseIdx + 1).join('\n');
const styleBeforeLen = styleContent.length;
styleContent = styleContent.replace(/@import\s+url\(['"]?https?:\/\/[^)]+['"]?\)\s*;?/gi, '/* font import removed for offline use */');
if (styleContent.length !== styleBeforeLen) {
  console.log('Removed external @import font reference(s) from style block for offline use.');
}

console.log('Style block:', styleOpenIdx + 1, '-', styleCloseIdx + 1, '(', styleContent.length, 'chars)');

// ---------------------------------------------------------------------------
// 3. Compile the Babel (React JSX) source to plain JS using @babel/core
// ---------------------------------------------------------------------------
console.log('Compiling React app with Babel...');
let babel;
try {
  babel = require('@babel/core');
} catch (e) {
  console.error('@babel/core not installed. Run: npm install');
  process.exit(1);
}

let compiledReact;
try {
  const out = babel.transformSync(scriptReactBabel, {
    filename: 'app.jsx',
    presets: [
      ['@babel/preset-react'],
      ['@babel/preset-env', { targets: { electron: '31' }, modules: false }]
    ],
    compact: false,
    comments: false
  });
  compiledReact = out.code;
  console.log('Compiled React app:', compiledReact.length, 'chars');
} catch (e) {
  console.error('Babel compilation failed:', e.message);
  // write the failing source for debugging
  fs.writeFileSync(path.join(OUT_DIR, 'app.failed.jsx'), scriptReactBabel);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 4. Build the Electron bridge (electron-bridge.js) that wires the renderer
//    hooks (window.open printing -> native, erpExportPdf/erpExportXlsx ->
//    native PDF/XLSX, sistemiGenitSQLite already exposed by preload).
// ---------------------------------------------------------------------------

const bridgeJs = `/* Sistemi Genit - Electron renderer bridge
 * Wired after the app loads. Overrides browser-only printing/export so the
 * app uses native Windows printers, native PDF (printToPDF) and real XLSX
 * (exceljs) without any CDN or internet access.
 */
(function () {
  'use strict';
  var API = window.sistemiGenitAPI;
  if (!API || !API.isElectron) { return; } // not in Electron -> keep browser behavior

  // ---- 1. Replace window.open-based document printing with native print ----
  // The app's openHtmlDocument() uses window.open('', '_blank') and writes
  // HTML, then calls w.print(). Under Electron we intercept and route to the
  // native print dialog / direct printer via the main process.
  var originalOpen = window.open;
  window.open = function (url, target) {
    // Only intercept blank-popup printing. If a real URL is requested, defer.
    if (url && /^https?:/i.test(url)) {
      if (API && API.openExternal) API.openExternal(url);
      return null;
    }
    // Return a fake "window" whose document.write accumulates HTML and whose
    // .print() sends it to the main process native print dialog.
    var buffer = '';
    var closed = false;
    var fakeDoc = {
      open: function () { buffer = ''; },
      write: function (s) { if (!closed) buffer += s; },
      writeln: function (s) { if (!closed) buffer += (s || '') + '\\n'; },
      close: function () { closed = true; },
      title: ''
    };
    var fakeWin = {
      document: fakeDoc,
      focus: function () {},
      close: function () { closed = true; },
      print: function () {
        var html = buffer;
        // Strip the toolbar + auto print script for a clean print body, then
        // route to a native print dialog so all installed Windows printers are
        // available.
        API.preview({ html: html, title: fakeDoc.title || 'Dokument' });
      }
    };
    return fakeWin;
  };

  // ---- 2. Replace erpExportPdf / erpExportXlsx with native implementations ----
  // The original app defines these with pdfMake/JSZip. We keep them as
  // fallbacks but prefer the Electron native path when available.
  if (API.exportXlsx) {
    var origXlsx = window.erpExportXlsx;
    window.erpExportXlsx = async function (title, headers, rows, totalsRow, filters) {
      try {
        if (!rows || !rows.length) {
          if (window.Swal) Swal.fire({ icon: 'info', title: 'Nuk ka të dhëna', text: 'Nuk ka rreshta për eksport pas filtrave.' });
          return;
        }
        var hdrs = (headers || []).map(function (h) { return String(h == null ? '' : h); });
        // Build a matrix using the app's own builder if present, else simple.
        var matrix;
        if (typeof window.erpBuildMatrix === 'function') {
          matrix = window.erpBuildMatrix(title, hdrs, rows, totalsRow, filters);
        } else {
          matrix = [];
          if (title) matrix.push([title]);
          if (filters) {
            Object.keys(filters).forEach(function (k) {
              if (filters[k] !== '' && filters[k] != null) matrix.push([k + ': ' + filters[k]]);
            });
          }
          matrix.push(hdrs.slice());
          rows.forEach(function (r) { matrix.push(hdrs.map(function (h) { return r[h]; })); });
          if (totalsRow && rows.length) {
            matrix.push(hdrs.map(function (h, i) {
              if (i === 0) return (totalsRow[h] != null && totalsRow[h] !== '') ? totalsRow[h] : 'TOTAL';
              return totalsRow[h] != null ? totalsRow[h] : '';
            }));
          }
        }
        // detect header row index (first row equal to headers)
        var headerIdx = -1;
        for (var i = 0; i < matrix.length; i++) {
          var rr = matrix[i] || [];
          if (rr.length === hdrs.length && rr.every(function (v, j) { return String(v) === String(hdrs[j]); })) { headerIdx = i; break; }
        }
        var totalsIdx = (totalsRow && rows.length) ? (matrix.length - 1) : null;
        var filterLines = [];
        if (filters) Object.keys(filters).forEach(function (k) {
          if (filters[k] !== '' && filters[k] != null) filterLines.push(k + ': ' + filters[k]);
        });
        var res = await API.exportXlsx({
          matrix: matrix,
          options: {
            sheetName: 'Fletë1',
            title: title,
            headerRowIndex: headerIdx >= 0 ? headerIdx : undefined,
            totalsRowIndex: totalsIdx != null ? totalsIdx : undefined,
            filterSummary: filterLines.length ? filterLines : undefined
          },
          defaultName: (title || 'Sistemi_Genit').replace(/[^a-zA-Z0-9_\\- ]/g, '') + '.xlsx'
        });
        if (res && res.success) {
          if (window.Swal) Swal.fire({ icon: 'success', title: 'Excel u ruajt', text: res.path, timer: 2500 });
        } else if (res && !/Anuluar/.test(res.message || '')) {
          if (window.Swal) Swal.fire({ icon: 'error', title: 'Excel nuk u ruajt', text: res.message || '' });
        }
      } catch (e) {
        if (window.Swal) Swal.fire({ icon: 'error', title: 'Excel', text: String(e && e.message || e) });
      }
    };
    window.__origErpExportXlsx = origXlsx;
  }

  // PDF export: route the app's pdfMake usage to native printToPDF.
  if (API.printToPdf && API.savePdf) {
    // Keep the original erpExportPdf as a fallback for in-memory pdfMake usage,
    // but override the file-save path so it always uses a native dialog.
    var origPdf = window.erpExportPdf;
    window.erpExportPdf = function (title, headers, rows, totalsRow, filters) {
      // Try native: build an HTML table and convert to PDF via printToPDF.
      try {
        if (!rows || !rows.length) {
          if (window.Swal) Swal.fire({ icon: 'info', title: 'Nuk ka të dhëna', text: 'Nuk ka rreshta për eksport pas filtrave.' });
          return;
        }
        var hdrs = (headers || []).map(function (h) { return String(h == null ? '' : h); });
        var biz = (typeof window.erpBusinessHeader === 'function') ? window.erpBusinessHeader() : {};
        var filterLine = filters ? Object.keys(filters).filter(function (k) { return filters[k] !== '' && filters[k] != null; }).map(function (k) { return k + ': ' + filters[k]; }).join(' | ') : '';
        var html = '<!doctype html><html><head><meta charset="utf-8"><style>' +
          '@page{size:A4;margin:14mm}' +
          'body{font-family:Arial,Helvetica,sans-serif;color:#000;font-size:11px}' +
          'h1{font-size:18px;margin:0 0 4px} .biz{font-size:11px;margin-bottom:8px} .meta{font-size:10px;color:#444;margin-bottom:10px}' +
          'table{width:100%;border-collapse:collapse} th,td{border:1px solid #555;padding:4px 6px;text-align:left;font-size:10px}' +
          'th{background:#714B67;color:#fff} tr:nth-child(even) td{background:#fafbfc} .tot td{background:#f3eef2;font-weight:700}' +
          '</style></head><body>';
        html += '<h1>' + esc2(title || '') + '</h1>';
        if (biz.name) html += '<div class="biz"><b>' + esc2(biz.name) + '</b>' + (biz.nipt ? ' · NIPT: ' + esc2(biz.nipt) : '') + (biz.address ? '<br>' + esc2(biz.address) : '') + (biz.phone ? ' · ' + esc2(biz.phone) : '') + '</div>';
        if (filterLine) html += '<div class="meta">Filtra: ' + esc2(filterLine) + '</div>';
        html += '<table><thead><tr>';
        hdrs.forEach(function (h) { html += '<th>' + esc2(h) + '</th>'; });
        html += '</tr></thead><tbody>';
        rows.forEach(function (r, ri) {
          html += '<tr' + (ri % 2 ? '' : '') + '>';
          hdrs.forEach(function (h) { html += '<td>' + esc2(r[h] == null ? '' : r[h]) + '</td>'; });
          html += '</tr>';
        });
        if (totalsRow && rows.length) {
          html += '<tr class="tot">';
          hdrs.forEach(function (h, i) {
            var t = (i === 0) ? (totalsRow[h] != null && totalsRow[h] !== '' ? totalsRow[h] : 'TOTAL') : (totalsRow[h] != null ? totalsRow[h] : '');
            html += '<td>' + esc2(t) + '</td>';
          });
          html += '</tr>';
        }
        html += '</tbody></table></body></html>';
        API.printToPdf({ html: html, profile: { format: 'A4', landscape: hdrs.length > 6, printBackground: true } })
          .then(function (r) {
            if (r && r.success) {
              return API.savePdf({ base64: r.base64, defaultName: (title || 'Sistemi_Genit').replace(/[^a-zA-Z0-9_\\- ]/g, '') + '.pdf' });
            }
            return r;
          })
          .then(function (sv) {
            if (sv && sv.success) { if (window.Swal) Swal.fire({ icon: 'success', title: 'PDF u ruajt', text: sv.path, timer: 2500 }); }
            else if (sv && !/Anuluar/.test(sv.message || '')) { if (window.Swal) Swal.fire({ icon: 'error', title: 'PDF nuk u ruajt', text: sv.message || '' }); }
          })
          .catch(function (e) { if (window.Swal) Swal.fire({ icon: 'error', title: 'PDF', text: String(e && e.message || e) }); });
      } catch (e) {
        // fall back to original pdfMake implementation
        if (typeof origPdf === 'function') return origPdf(title, headers, rows, totalsRow, filters);
      }
    };
    window.__origErpExportPdf = origPdf;
  }

  // ---- 3. Direct-print helper for invoices/receipts to a chosen printer ----
  // Exposed as window.sgDirectPrint(html, printerName, profile) used by the
  // print dialogs in the app (POS receipts, A4/A5 docs, 58/80mm thermal).
  window.sgDirectPrint = function (html, printerName, profile) {
    return API.print({ html: html, printerName: printerName || null, profile: profile || {} });
  };
  window.sgPrintToPdf = function (html, profile) {
    return API.printToPdf({ html: html, profile: profile || {} });
  };
  window.sgSavePdf = function (base64, defaultName) {
    return API.savePdf({ base64: base64, defaultName: defaultName });
  };
  window.sgListPrinters = function () { return API.listPrinters(); };

  // small escape helper (named to avoid clashing with app's esc())
  function esc2(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---- 4. Backup/restore hooks for the Settings module ----
  window.sgCreateBackup = function (auto) { return API.createBackup({ auto: !!auto }); };
  window.sgRestoreBackup = function () { return API.restoreBackup(); };

  console.log('Sistemi Genit: Electron bridge aktiv (native print/PDF/XLSX/backup)');
})();
`;

// ---------------------------------------------------------------------------
// 5. Assemble the final index.html with local vendor references + no Babel.
// ---------------------------------------------------------------------------
const vendorBase = 'vendor';
const indexHtml = `<!DOCTYPE html>
<html lang="sq">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Sistemi Genit</title>
<link rel="icon" href="../assets/logo.png">
<link rel="stylesheet" href="../${vendorBase}/css/font-awesome.min.css">
<link rel="stylesheet" href="../${vendorBase}/css/sweetalert2.min.css">
<link rel="stylesheet" href="../${vendorBase}/css/datatables.min.css">
<link rel="stylesheet" href="../${vendorBase}/css/buttons.dataTables.min.css">
<link rel="stylesheet" href="../${vendorBase}/css/datatables.responsive.min.css">
<script src="../${vendorBase}/js/sweetalert2.min.js"></script>
<script src="../${vendorBase}/js/jquery.min.js"></script>
<script src="../${vendorBase}/js/datatables.min.js"></script>
<script src="../${vendorBase}/js/datatables.responsive.min.js"></script>
<script src="../${vendorBase}/js/jszip.min.js"></script>
<script src="../${vendorBase}/js/pdfmake.min.js"></script>
<script src="../${vendorBase}/js/vfs_fonts.js"></script>
<script src="../${vendorBase}/js/buttons.dataTables.min.js"></script>
<script src="../${vendorBase}/js/buttons.html5.min.js"></script>
<script src="../${vendorBase}/js/buttons.print.min.js"></script>
<script src="../${vendorBase}/js/react.production.min.js"></script>
<script src="../${vendorBase}/js/react-dom.production.min.js"></script>
<script src="../${vendorBase}/js/chart.umd.min.js"></script>
<script src="../${vendorBase}/js/qrcode.min.js"></script>
<script src="../${vendorBase}/js/html5-qrcode.min.js"></script>
${styleContent}
</head>
<body>
<div id="root"></div>
<!-- Albanian translation + Swal/alert overrides (plain JS, unchanged) -->
<script>
${scriptTranslation}
</script>
<!-- Database init + Firebase-compatible API functions (plain JS, unchanged) -->
<script>
${scriptDbApi}
</script>
<!-- React application (pre-compiled, no Babel standalone) -->
<script src="app.compiled.js"></script>
<!-- Electron native bridge (printers, PDF, XLSX, backup) -->
<script src="electron-bridge.js"></script>
</body>
</html>
`;

fs.writeFileSync(path.join(OUT_DIR, 'index.html'), indexHtml);
fs.writeFileSync(path.join(OUT_DIR, 'app.compiled.js'), compiledReact);
fs.writeFileSync(path.join(OUT_DIR, 'electron-bridge.js'), bridgeJs);

console.log('Wrote:', path.join(OUT_DIR, 'index.html'));
console.log('Wrote:', path.join(OUT_DIR, 'app.compiled.js'), '(' + compiledReact.length + ' chars)');
console.log('Wrote:', path.join(OUT_DIR, 'electron-bridge.js'));
console.log('Frontend build complete.');
