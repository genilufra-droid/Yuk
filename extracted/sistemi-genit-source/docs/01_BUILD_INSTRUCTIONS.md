# Sistemi Genit — Udhëzimet e Ndërtimit (Build Instructions)

Ky dokument përshkruan se si të ndërtohet aplikacioni desktop **Sistemi Genit** nga kodi burim, duke përfshirë ndërtimin e front-end (Babel), paketimin e Windows .exe (NSIS), dhe versionin portable.

---

## 1. Kërkesat e Sistemit (Prerequisites)

### 1.1 Për zhvillim dhe ndërtim
| Komponent | Versioni i kërkuar | Shënime |
|-----------|-------------------|---------|
| Node.js | 20.x ose më i ri | LTS i rekomanduar |
| npm | 10.x | Vjen me Node.js |
| Git | çdo version | Për klonim/verzionim |
| Python 3 | 3.9+ | Vetëm nëse better-sqlite3 ndërtohet nga burimi |
| C++ kompilator | g++ / MSVC | Vetëm nëse better-sqlite3 ndërtohet nga burimi |

### 1.2 Për ndërtim në Linux/macOS (kompilim kryq për Windows)
| Komponent | Versioni | Shënime |
|-----------|----------|---------|
| Wine (32-bit) | 8.0+ | E domosdoshme për ekzekutimin e kompiluesit NSIS |
| Xvfb | çdo version | Për ekzekutim headless të Wine |
| wine32 (i386) | 8.0+ | NSIS është binare 32-bit |

Instalimi i wine32 në Debian/Ubuntu:
```bash
sudo dpkg --add-architecture i386
sudo apt-get update
sudo apt-get install -y wine wine32:i386
```

### 1.3 Për ndërtim në Windows (indigenous)
Nuk kërkon Wine. Node.js + npm + Python + MSVC Build Tools janë të mjaftueshme. better-sqlite3 ofron prebuilt binaries për Windows x64.

---

## 2. Struktura e Projektit

```
sistemi-genit/
├── package.json              # Konfigurimi i npm + electron-builder
├── electron/
│   ├── main.js               # Procesi kryzor Electron (dritare, IPC, siguri)
│   ├── preload.js            # contextBridge — API i siguruar për renderer
│   ├── database.js           # Backend SQLite me API të pajtueshëm me Firebase
│   ├── printers.js           # Detektim printerash + opsione printimi
│   └── exports.js            # Eksport PDF (printToPDF) + XLSX (exceljs)
├── database/
│   └── schema.sql            # Skema SQLite (25+ tabela)
├── build/
│   ├── build-frontend.js     # Skripti i ndërtimit të front-end (Babel)
│   └── make-icon.py          # Gjenerimi i ikonës .ico
├── assets/
│   ├── icon.ico              # Ikona e aplikacionit (Windows)
│   ├── icon.png              # Pamja paraprake e ikonës
│   └── logo.png              # Logo origjinale e aplikacionit
├── vendor/                   # Të gjitha bibliotekat CDN të vendosura lokalisht
│   ├── js/                   # React, jQuery, DataTables, Chart.js, etj.
│   ├── css/                  # Font Awesome, SweetAlert, DataTables CSS
│   └── webfonts/             # Font Awesome webfonts (woff2, ttf)
├── src/                      # Rezultati i ndërtimit të front-end (gjenerohet)
│   ├── index.html            # HTML me referenca vendore (pa CDN)
│   ├── app.compiled.js       # Aplikacioni React i kompiluar nga Babel
│   └── electron-bridge.js    # Urë lidhëse për print/PDF/XLSX/backup native
└── release/                  # Rezultati i paketimit (gjenerohet)
    ├── Sistemi-Genit-Setup-1.0.0.exe       # Instaluesi NSIS
    ├── Sistemi-Genit-Portable-1.0.0.exe    # Versioni portable
    └── win-unpacked/                        # Aplikacioni i paketuar
```

---

## 3. Hapat e Ndërtimit

### 3.1 Instalimi i varësive
```bash
cd sistemi-genit
npm install
```
Ky instalohet:
- **better-sqlite3** ^11.3.0 — biblioteka native SQLite (sinkrone)
- **exceljs** ^4.4.0 — gjenerim real i skedarëve .xlsx
- **@babel/core**, **@babel/preset-react**, **@babel/preset-env** — kompilim JSX
- **electron** ^31.3.1 — runtime Electron
- **electron-builder** ^24.13.3 — paketim .exe

Skripti `postinstall` ekzekuton automatikisht `electron-builder install-app-deps` për të rindërtuar better-sqlite3 për ABI-në e Electron.

### 3.2 Ndërtimi i front-end
```bash
npm run build:frontend
```
Ky skript:
1. Lexon skedarin burimor HTML (Sistem_Genit_i_ri_-_FLETE_HYRJE_MODEL_FIX.html)
2. Ndán në blloqe script: përkthimi shqip, funksionet e databazës, aplikacioni React (JSX)
3. Kompilon JSX me Babel (preset-react + preset-env, target: electron 31)
4. Gjeneron `electron-bridge.js` që mbyllja window.open dhe rrjedhat e print/PDF/XLSX në funksionet native
5. Zëvendëson të gjitha referencat CDN me skedarë vendor lokalë
6. Hiq Firebase CDN, Babel standalone, dhe iframe Cloudflare
7. Shkruan: `src/index.html`, `src/app.compiled.js`, `src/electron-bridge.js`

### 3.3 Ndërtimi i instaluesit NSIS (.exe)
```bash
npm run build
```
Ose manualisht:
```bash
npm run build:frontend
npx electron-builder --win nsis --config.win.signAndEditExecutable=false
```
Rezultati: `release/Sistemi-Genit-Setup-1.0.0.exe` (~83 MB)

### 3.4 Ndërtimi i versionit portable
```bash
npm run build:portable
```
Ose manualisht:
```bash
npm run build:frontend
npx electron-builder --win portable --config.win.signAndEditExecutable=false
```
Rezultati: `release/Sistemi-Genit-Portable-1.0.0.exe` (~74 MB)

### 3.5 Vetëm paketim (pa installer)
```bash
npm run pack
```
Rezultati: `release/win-unpacked/` (aplikacioni i plotë i paketuar, i ekzekutueshëm direkt)

### 3.6 Gjenerimi i ikonës (opsionale)
```bash
python3 build/make-icon.py
```
Gjeneron `assets/icon.ico` (6 rezolucionet: 16, 32, 48, 64, 128, 256) dhe `assets/icon.png`.

---

## 4. Konfigurimi i electron-builder

Konfigurimi ndodhet në `package.json` në fushën `"build"`:

```json
{
  "appId": "al.sistemigenit.desktop",
  "productName": "Sistemi Genit",
  "asar": true,
  "asarUnpack": ["node_modules/better-sqlite3/**/*"],
  "win": {
    "target": ["nsis"],
    "icon": "assets/icon.ico",
    "artifactName": "Sistemi-Genit-Setup-${version}.${ext}",
    "requestedExecutionLevel": "asInvoker"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true,
    "shortcutName": "Sistemi Genit",
    "perMachine": false,
    "deleteAppDataOnUninstall": false,
    "allowElevation": true
  }
}
```

### Pika të rëndësishme:
- **asarUnpack**: better-sqlite3 është një modul native (.node) dhe duhet të jetë jashtë asar për të ngarkuar.
- **requestedExecutionLevel: asInvoker**: Aplikacioni ekzekutohet pa kërkuar privilegje administratori.
- **deleteAppDataOnUninstall: false**: Të dhënat e përdoruesit (databaza SQLite) ruhen kur aplikacioni çinstalohet.
- **oneClick: false**: Instaluesi tregon një magjistar me hapa (jo instalim me një klikim).
- **allowToChangeInstallationDirectory: true**: Përdoruesi mund të zgjedhë dosjen e instalimit.

---

## 5. Nënshkrimi i Kodit (Code Signing) — OPSIONALE

Instaluesi i prodhuar nuk është i nënshkruar kodit (pa certifikatë). Për të eliminuar paralajmërimin "Windows protected your PC" (SmartScreen), nevojitet një certifikatë Authenticode.

### Me certifikatë (PFX):
```bash
export CSC_LINK=/path/to/certificate.pfx
export CSC_KEY_PASSWORD=yourpassword
npx electron-builder --win nsis
```
(Për këtë rast, hiq `--config.win.signAndEditExecutable=false`)

### Pa certifikatë (zhvillim/testim):
Përdoret `--config.win.signAndEditExecutable=false` si më sipër. Përdoruesit duhet të klikojnë "More info" → "Run anyway" në SmartScreen.

---

## 6. Verifikimi i Ndërtimit

Pas ndërtimit, verifikoni:
```bash
# Kontrolloni madhësinë dhe llojin e instaluesit
file release/Sistemi-Genit-Setup-1.0.0.exe
# Duhet të tregojë: PE32 executable ... Nullsoft Installer self-extracting archive

# Kontrolloni modulin native better-sqlite3 është binare Windows
file release/win-unpacked/resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node
# Duhet të tregojë: PE32+ executable (DLL) ... for MS Windows

# Kontrolloni që app.asar ekziston
ls -la release/win-unpacked/resources/app.asar
```

---

## 7. Zhvillim Lokal (Development)

Për të ekzekutuar aplikacionin në mënyrë zhvilluese:
```bash
npm run dev
```
Kjo ngarkon aplikacionin nga `src/index.html` direkt pa paketim. Ndryshimet në kod kërkojnë rindërtim të front-end (`npm run build:frontend`) para se të shfaqen.

Për të rindërtuar automatikisht gjatë zhvillimit, përdorni `nodemon` ose një watcher mbi `build/build-frontend.js`.

---

## 8. Zgjidhja e Problemeve (Troubleshooting)

| Problemi | Shkaku i mundshëm | Zgjidhja |
|----------|-------------------|----------|
| `better-sqlite3: NODE_MODULE_VERSION mismatch` | ABI e Node dhe Electron nuk përputhen | Ekzekutoni `npx electron-rebuild -f -w better-sqlite3` |
| `wine is required` | Wine nuk është instaluar | Instaloni wine + wine32 (shih seksionin 1.2) |
| `could not load kernel32.dll` | Prefixi Wine nuk është inicializuar | `rm -rf ~/.wine && WINEARCH=win32 wineboot --init` |
| `__uninstaller ... no files found` | makensis.exe 32-bit nuk ekzekutohet | Sigurohuni që wine32:i386 është instaluar |
| `ECONNREFUSED` gjatë shkarkimit të Electron | Problemi me rrjetin/proxy | Vendosni `ELECTRON_MIRROR` për mirror alternativ |
| Aplikacioni hapet por faqja është bosh | app.compiled.js nuk u gjenerua | Ekzekutoni `npm run build:frontend` |

---

*Versioni i dokumentit: 1.0.0 | Data: 2024*
