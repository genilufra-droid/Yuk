'use strict';
// ============================================================================
// exports.js
// Real PDF and XLSX generation for Sistemi Genit on the Electron main process.
//
// PDF: generated with Electron's webContents.printToPDF() by rendering an HTML
//      template in a hidden BrowserWindow. This guarantees Albanian characters,
//      page numbering support, and correct A4/A5/58mm/80mm page sizes offline.
// XLSX: generated with the `exceljs` library producing genuine .xlsx files
//       (Open XML) — not CSV renamed. Includes worksheet, headers, numeric
//       cells as numbers, dates as dates, column widths, totals and filter
//       summary. Opens in Excel without repair warnings.
// ============================================================================

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, dialog } = require('electron');

// ---------------------------------------------------------------------------
// PDF generation via printToPDF
// ---------------------------------------------------------------------------
// Renders an HTML string in a hidden offscreen window and calls printToPDF.
// Returns a Buffer (PDF bytes) or throws.
async function htmlToPdf(htmlContent, profile) {
  const { paperSizeFor, pdfOptions } = require('./printers');
  profile = profile || {};
  const win = new BrowserWindow({
    width: 900,
    height: 1200,
    show: false,
    webPreferences: { offscreen: false, sandbox: true, contextIsolation: true }
  });
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
    // give layout a moment to settle
    await new Promise(r => setTimeout(r, 120));
    const opts = pdfOptions(profile);
    const buf = await win.webContents.printToPDF(opts);
    return buf;
  } finally {
    try { win.destroy(); } catch (e) {}
  }
}

// Save a PDF buffer to a user-chosen path (native save dialog).
// Returns { success, path } or { success:false, message }.
async function savePdfDialog(parentWindow, defaultName, pdfBuffer) {
  const filters = [{ name: 'PDF', extensions: ['pdf'] }];
  const { canceled, filePath } = await dialog.showSaveDialog(parentWindow, {
    title: 'Ruaj PDF',
    defaultPath: defaultName || 'Sistemi_Genit.pdf',
    filters
  });
  if (canceled || !filePath) return { success: false, message: 'Anuluar nga përdoruesi' };
  try {
    fs.writeFileSync(filePath, pdfBuffer);
    return { success: true, path: filePath };
  } catch (e) {
    return { success: false, message: 'PDF nuk u ruajt: ' + e.message };
  }
}

// Save arbitrary bytes to a user chosen path.
async function saveFileDialog(parentWindow, defaultName, data, ext, extName) {
  const filters = [{ name: extName || ext.toUpperCase(), extensions: [ext] }];
  const { canceled, filePath } = await dialog.showSaveDialog(parentWindow, {
    title: 'Ruaj skedarin',
    defaultPath: defaultName,
    filters
  });
  if (canceled || !filePath) return { success: false, message: 'Anuluar nga përdoruesi' };
  try {
    fs.writeFileSync(filePath, data);
    return { success: true, path: filePath };
  } catch (e) {
    return { success: false, message: 'Skedari nuk u ruajt: ' + e.message };
  }
}

// ---------------------------------------------------------------------------
// XLSX generation via exceljs
// ---------------------------------------------------------------------------
let ExcelJS;
function loadExcel() {
  if (ExcelJS) return ExcelJS;
  try {
    ExcelJS = require('exceljs');
  } catch (e) {
    throw new Error('exceljs nuk u ngarkua: ' + e.message);
  }
  return ExcelJS;
}

// Build an .xlsx buffer from a matrix of rows.
// matrix: array of arrays (strings/numbers)
// options: { title, headers, sheetName, columnWidths, totalsRowIndex, headerRowIndex, filterSummary }
async function matrixToXlsxBuffer(matrix, options) {
  const Excel = loadExcel();
  const wb = new Excel.Workbook();
  wb.creator = 'Sistemi Genit';
  wb.created = new Date();
  const ws = wb.addWorksheet(options.sheetName || 'Fletë1', {
    properties: { defaultRowHeight: 18 },
    views: [{ showGridLines: true }]
  });

  // Determine max columns
  let maxCols = 0;
  for (const row of matrix) if (row.length > maxCols) maxCols = row.length;
  maxCols = Math.max(maxCols, 1);

  // Title row(s)
  let startRow = 1;
  if (options.title) {
    ws.getCell(1, 1).value = options.title;
    ws.getCell(1, 1).font = { bold: true, size: 14 };
    ws.mergeCells(1, 1, 1, maxCols);
    startRow = 2;
  }
  if (options.filterSummary) {
    const lines = Array.isArray(options.filterSummary) ? options.filterSummary : [options.filterSummary];
    let r = startRow;
    for (const line of lines) {
      ws.getCell(r, 1).value = line;
      ws.getCell(r, 1).font = { italic: true, size: 10 };
      ws.mergeCells(r, 1, r, maxCols);
      r++;
    }
    startRow = r;
  }

  const headerRowIndex = options.headerRowIndex != null
    ? options.headerRowIndex
    : (matrix.findIndex(row => Array.isArray(row) && row.length && String(row[0]).length) );

  // write all rows
  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i] || [];
    const excelRow = ws.getRow(startRow + i);
    for (let c = 0; c < row.length; c++) {
      const cell = excelRow.getCell(c + 1);
      const v = row[c];
      if (typeof v === 'number' && isFinite(v)) {
        cell.value = v;
        cell.numFmt = '#,##0.00';
      } else if (v instanceof Date) {
        cell.value = v;
        cell.numFmt = 'yyyy-mm-dd';
      } else {
        cell.value = (v == null ? '' : String(v));
      }
    }
  }

  // style the header row (bold + fill)
  const headerExcelRow = options.headerRowIndex != null
    ? startRow + options.headerRowIndex
    : startRow;
  for (let c = 0; c < maxCols; c++) {
    const cell = ws.getRow(headerExcelRow).getCell(c + 1);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF714B67' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  }

  // style totals row if present
  if (options.totalsRowIndex != null) {
    const tr = startRow + options.totalsRowIndex;
    for (let c = 0; c < maxCols; c++) {
      const cell = ws.getRow(tr).getCell(c + 1);
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3EEF2' } };
    }
  }

  // optional: thin border around the whole used range (document-style exports)
  if (options.borderAll) {
    const lastRow = startRow + matrix.length - 1;
    const thin = { style: 'thin' };
    for (let r = startRow; r <= lastRow; r++) {
      for (let c = 1; c <= maxCols; c++) {
        ws.getRow(r).getCell(c).border = { top: thin, left: thin, bottom: thin, right: thin };
      }
    }
  }

  // column widths
  if (options.columnWidths && options.columnWidths.length) {
    for (let i = 0; i < options.columnWidths.length; i++) {
      ws.getColumn(i + 1).width = options.columnWidths[i];
    }
  } else {
    // auto width based on content
    for (let c = 0; c < maxCols; c++) {
      let maxLen = 10;
      for (let i = 0; i < matrix.length; i++) {
        const v = (matrix[i] && matrix[i][c] != null) ? String(matrix[i][c]) : '';
        if (v.length > maxLen) maxLen = v.length;
      }
      ws.getColumn(c + 1).width = Math.min(Math.max(maxLen + 2, 10), 60);
    }
  }

  // freeze header row
  ws.views = ws.views || [];
  ws.views[0] = ws.views[0] || {};
  ws.views[0].state = 'frozen';
  ws.views[0].ySplit = headerExcelRow;

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// Save an XLSX buffer via native dialog.
async function saveXlsxDialog(parentWindow, defaultName, buffer) {
  const filters = [{ name: 'Excel', extensions: ['xlsx'] }];
  const { canceled, filePath } = await dialog.showSaveDialog(parentWindow, {
    title: 'Ruaj Excel',
    defaultPath: defaultName || 'Sistemi_Genit.xlsx',
    filters
  });
  if (canceled || !filePath) return { success: false, message: 'Anuluar nga përdoruesi' };
  try {
    fs.writeFileSync(filePath, buffer);
    return { success: true, path: filePath };
  } catch (e) {
    return { success: false, message: 'Excel nuk u ruajt: ' + e.message };
  }
}

module.exports = {
  htmlToPdf,
  savePdfDialog,
  saveFileDialog,
  matrixToXlsxBuffer,
  saveXlsxDialog
};
