/* Sistemi Genit - Electron renderer bridge
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
      writeln: function (s) { if (!closed) buffer += (s || '') + '\n'; },
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
          defaultName: (title || 'Sistemi_Genit').replace(/[^a-zA-Z0-9_\- ]/g, '') + '.xlsx'
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
              return API.savePdf({ base64: r.base64, defaultName: (title || 'Sistemi_Genit').replace(/[^a-zA-Z0-9_\- ]/g, '') + '.pdf' });
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
