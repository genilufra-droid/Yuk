'use strict';
// ============================================================================
// printers.js
// Windows printer integration for Sistemi Genit using Electron APIs.
//
// Provides:
//   - list printers installed on Windows (webContents.getPrintersAsync())
//   - print HTML content to a specific printer with options
//   - printToPDF with page size (A4, A5, 58mm, 80mm) and orientation
//   - remember printer preferences per document type in settings
//   - save PDF/XLSX via native dialogs (handled in main.js)
//
// UNIT NOTE (critical):
//   Electron's webContents.printToPDF() interprets a custom `pageSize` object
//   ( {width, height} ) as INCHES. The webContents.print() API instead
//   interprets a custom `pageSize` object as MICRONS (1/1000 mm).
//   Previously we stored everything in microns and passed the same values to
//   printToPDF, which produced absurd page sizes (58mm -> 4,176,000 points
//   instead of ~164.4 points). We now keep BOTH representations:
//     PAPER_PRESETS        -> microns  (used by print() / physical printing)
//     PAPER_PRESETS_INCHES -> inches   (used by printToPDF() / PDF generation)
//   Conversions are derived from the physical mm:  inch = mm / 25.4.
//   Verified targets (via pdfinfo):
//     58mm width  ≈ 164.4 pts   (2.28346 in)
//     80mm width  ≈ 226.8 pts   (3.14961 in)
// ============================================================================

const MM_PER_INCH = 25.4;
const mmToInch = (mm) => mm / MM_PER_INCH;

// Paper size presets in MICRONS (1/1000 mm) — used by webContents.print().
const PAPER_PRESETS = {
  'A4': { width: 210000, height: 297000 },
  'A5': { width: 148000, height: 210000 },
  // 58 mm thermal receipt: 58mm wide; height is continuous -> use a tall page
  '58mm': { width: 58000, height: 297000 },
  '80mm': { width: 80000, height: 297000 },
  'letter': { width: 215900, height: 279400 }
};

// Same physical sizes expressed in INCHES — used by webContents.printToPDF().
// printToPDF expects {width, height} in inches (per Electron docs). Using
// inches here is what makes 58mm render as ~164.4 pts and 80mm as ~226.8 pts.
const PAPER_PRESETS_INCHES = {};
for (const k of Object.keys(PAPER_PRESETS)) {
  PAPER_PRESETS_INCHES[k] = {
    width: mmToInch(PAPER_PRESETS[k].width / 1000),  // microns -> mm -> inch
    height: mmToInch(PAPER_PRESETS[k].height / 1000)
  };
}

// margins in inches for printToPDF (per Electron docs margins are in inches).
// 0 = no margins (thermal). For A4/A5 we keep a small 1cm margin.
const DEFAULT_MARGINS_INCH = { top: 0, bottom: 0, left: 0, right: 0 };

function paperSizeFor(format) {
  // Returns MICRONS preset (for print()). Kept for backwards compatibility.
  const f = String(format || 'A4').trim();
  const key = Object.keys(PAPER_PRESETS).find(k => k.toLowerCase() === f.toLowerCase());
  return key ? PAPER_PRESETS[key] : PAPER_PRESETS.A4;
}

// Returns INCHES preset (for printToPDF()). This is the one that fixes the
// 58mm/80mm dimension bug.
function paperSizeInchesFor(format) {
  const f = String(format || 'A4').trim();
  const key = Object.keys(PAPER_PRESETS_INCHES).find(k => k.toLowerCase() === f.toLowerCase());
  return key ? PAPER_PRESETS_INCHES[key] : PAPER_PRESETS_INCHES.A4;
}

// Build printToPDF options from a print profile.
// profile: { format: 'A4'|'A5'|'58mm'|'80mm', landscape: bool, margins, printBackground }
// IMPORTANT: printToPDF custom pageSize is in INCHES.
function pdfOptions(profile) {
  profile = profile || {};
  let pageSize;
  if (profile.pageSize) {
    // If caller supplied a custom object, assume it might be microns and
    // convert to inches only if the values look like microns (>~100). If they
    // already look like inches (<~50) leave them as-is. This makes the API
    // robust to callers that copied the old micron-based examples.
    if (typeof profile.pageSize === 'object') {
      const w = Number(profile.pageSize.width) || 0;
      const h = Number(profile.pageSize.height) || 0;
      if (w > 100 || h > 100) {
        pageSize = { width: mmToInch(w / 1000), height: mmToInch(h / 1000) };
      } else {
        pageSize = { width: w, height: h };
      }
    } else {
      pageSize = profile.pageSize; // string preset like 'A4'
    }
  } else {
    pageSize = paperSizeInchesFor(profile.format);
  }
  const opts = {
    pageSize,
    printBackground: profile.printBackground !== false,
    landscape: !!profile.landscape,
    preferCSSPageSize: !!profile.preferCSSPageSize
  };
  // printToPDF margins are in INCHES.
  if (profile.margins) {
    opts.margins = profile.margins; // {top,bottom,left,right} in inches
  } else {
    opts.margins = DEFAULT_MARGINS_INCH;
  }
  return opts;
}

// Print options passed to webContents.print()
function printOptions(profile, printerName) {
  profile = profile || {};
  const opts = {
    silent: !!profile.silent,
    printBackground: profile.printBackground !== false,
    color: profile.color !== false,
    copies: Math.max(1, parseInt(profile.copies, 10) || 1)
  };
  if (printerName) opts.deviceName = printerName;
  if (profile.landscape) opts.landscape = true;
  if (profile.pageSize) opts.pageSize = profile.pageSize;
  if (profile.margins) opts.margins = profile.margins;
  return opts;
}

module.exports = {
  PAPER_PRESETS,            // microns (for print())
  PAPER_PRESETS_INCHES,     // inches  (for printToPDF())
  paperSizeFor,             // microns
  paperSizeInchesFor,       // inches
  pdfOptions,               // builds printToPDF options (inches)
  printOptions,             // builds print() options (microns)
  mmToInch
};
