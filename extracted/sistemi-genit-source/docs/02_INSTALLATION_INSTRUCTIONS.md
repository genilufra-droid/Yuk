# Sistemi Genit — Udhëzimet e Instalimit (Installation Instructions)

Ky dokument përshkruan instalimin e aplikacionit desktop **Sistemi Genit** në Windows, përfshirë dy mënyra: instaluesi NSIS dhe versioni portable.

---

## 1. Kërkesat e Sistemit (Windows)

| Komponent | Kërkesa minimale | Rekomandohet |
|-----------|------------------|--------------|
| Sistemi Operativ | Windows 10 (64-bit) | Windows 11 (64-bit) |
| Procesori | x64, 1.6 GHz | x64, 2.0+ GHz |
| RAM | 2 GB | 4+ GB |
| Hapësira e diskut | 250 MB (instalim) + hapësirë për të dhëna | 1+ GB |
| Ekrani | 1024×768 | 1280×800 ose më lart |

**Shënim**: Aplikacioni është 64-bit (x64) dhe nuk funksionon në Windows 32-bit.

---

## 2. Mënyra A: Instaluesi NSIS (Rekomandohet)

Ky është instaluesi standard që krijon shkurtore në Desktop dhe Start Menu.

### 2.1 Shkarkimi
Shkarkoni skedarin **`Sistemi-Genit-Setup-1.0.0.exe`** (~83 MB).

### 2.2 Ekzekutimi
1. Gjeni skedarin e shkarkuar në shfletuesin e skedarëve (zakonisht dosja `Downloads`).
2. **Dopjo-klikoni** mbi `Sistemi-Genit-Setup-1.0.0.exe`.
3. Nëse shfaqet **Windows SmartScreen** me mesazhin "Windows protected your PC":
   - Klikoni **"More info"** (Më shumë informacion)
   - Klikoni **"Run anyway"** (Ekzekuto gjithsesi)
   - *(Kjo ndodh sepse instaluesi nuk është i nënshkruar me certifikatë komerciale. Është normal për aplikacione të pavarura.)*
4. Nëse shfaqet **User Account Control (UAC)**, klikoni **"Yes"** për të lejuar instalimin.

### 2.3 Magjistari i Instalimit
1. **Gjuha**: Zgjidhni gjuhën e instaluesit (në dispozicion).
2. **Ekrani i mirëseardhjes**: Klikoni **"Next"**.
3. **Dosja e instalimit**: Vendosi për të instaluar. Vendosi për të zgjedhur dosjen: klikoni **"Browse..."**. Vendosi i prezgjedhur: `C:\Users\[përdoruesi]\AppData\Local\sistemi-genit`.
4. **Shkurtoret**: Klikoni **"Next"** për të pranuar krijimin e shkurtores në Desktop dhe Start Menu.
5. **Instalimi**: Klikoni **"Install"**. Procesi merr rreth 30-60 sekonda.
6. **Përfundimi**: Klikoni **"Finish"**. Aplikacioni mund të hapet automatikisht nëse zgjidhni "Launch Sistemi Genit".

### 2.4 Pas instalimit
- Shkurtore në **Desktop**: ikona "Sistemi Genit"
- Shkurtore në **Start Menu**: "Sistemi Genit"
- Çinstalimi: Start Menu → "Sistemi Genit" → "Uninstall Sistemi Genit"

**E RËNDËSISHME**: Çinstalimi **nuk** fshin të dhënat e aplikacionit (databaza SQLite). Kjo është e dizajnuar që përdoruesit të mos humbasin të dhënat nëse çinstalojnë/riinstalojnë. Për të fshirë plotësisht, fshini manualisht dosjen `%APPDATA%\sistemi-genit`.

---

## 3. Mënyra B: Versioni Portable

Versioni portable nuk kërkon instalim dhe mund të ekzekutohet nga çdo dosje (p.sh., nga një flash USB).

### 3.1 Shkarkimi
Shkarkoni skedarin **`Sistemi-Genit-Portable-1.0.0.exe`** (~74 MB).

### 3.2 Ekzekutimi
1. Ruajeni në një dosje (p.sh., Desktop ose flash USB).
2. **Dopjo-klikoni** mbi `Sistemi-Genit-Portable-1.0.0.exe`.
3. Nëse shfaqet **Windows SmartScreen**, ndiqni hapat e Mënyrës A, seksioni 2.2, hapi 3.
4. Aplikacioni ekstrakton automatikisht dhe hapet.

**Shënim për versionin portable**: Të dhënat (databaza SQLite) ruhen në `%APPDATA%\sistemi-genit` (e njëjta vendndodhje si versioni i instaluar). Nëse dëshironi të merrni të dhënat me vete në USB, kopjoni dosjen `%APPDATA%\sistemi-genit` së bashku me skedarin .exe.

---

## 4. Ekzekutimi i Parë

### 4.1 Kredencialet Demo
Në ekranin e hyrjes, përdorni kredencialet demo:
- **Administrator**: `admin@demo.com` / `admin123`
- **Përdorues**: `user1@demo.com` / `user123`

### 4.2 Migrimi i të Dhënave (nëse po zëvendësoni versionin HTML)
Nëse keni përdorur më parë versionin HTML të aplikacionit në një shfletues, të dhënat mund të kenë mbetur në `localStorage` të shfletuesit. Aplikacioni desktop verifikon automatikisht për të dhëna të migrueshme në ekzekutimin e parë. Për detaje, shihni dokumentin **03_DATA_MIGRATION.md**.

### 4.3 Krijimi i Përdoruesit të Parë
Rekomandohet që pas hyrjes me demo të krijoni një përdorues të ri administrator dhe të fshini llogarinë demo për siguri.

---

## 5. Vendndodhja e Skedarëve të Aplikacionit

| Skedar/Dosje | Vendndodhja | Përshkrimi |
|--------------|-------------|------------|
| Programi i instaluar | `%LOCALAPPDATA%\sistemi-genit\` (ose dosja e zgjedhur) | Skedarët e aplikacionit |
| Databaza SQLite | `%APPDATA%\sistemi-genit\sistemi_genit.db` | Të gjitha të dhënat e aplikacionit |
| Backup automatik | `%APPDATA%\sistemi-genit\backups\` | Backup-et automatike (data-stampuar) |
| Logjet e gabimeve | `%APPDATA%\sistemi-genit\logs\error.log` | Logje për diagnostikim |
| Preferencat | Ruhen në databazë SQLite | Cilësimet e aplikacionit |

**Për të hapur dosjen e të dhënave**: Shtypni `Win+R`, shkruani `%APPDATA%\sistemi-genit` dhe shtypni Enter.

---

## 6. Përditësimi (Update)

Për të përditësuar aplikacionin në një version të ri:
1. Shkarkoni instaluesin e ri (`Sistemi-Genit-Setup-X.X.X.exe`).
2. Mbyllni aplikacionin nëse është i hapur.
3. Ekzekutoni instaluesin e ri mbi të vjetrin ( instalimi zëvendëson automatikisht).
4. Të dhënat ruhen automatikisht (nuk fshihen).

**Versioni portable**: Zëvendësoni skedarin .exe me versionin e ri. Të dhënat ruhen në `%APPDATA%\sistemi-genit`.

---

## 7. Çinstalimi

### 7.1 Përmes Windows
1. Start Menu → "Sistemi Genit" → "Uninstall Sistemi Genit", OSE
2. Settings → Apps → "Sistemi Genit" → Uninstall.

### 7.2 Fshirja e plotë e të dhënave
Pas çinstalimit, të dhënat ruhen ende. Për fshirje të plotë:
1. Fshini dosjen `%APPDATA%\sistemi-genit`.
2. (Opsionale) Fshini dosjen e instalimit nëse nuk u fshi automatikisht.

---

## 8. Zgjidhja e Problemeve të Instalimit

| Problemi | Zgjidhja |
|----------|----------|
| "This app can't run on your PC" | Aplikacioni është 64-bit; sigurohuni që Windows-i juaj është 64-bit |
| SmartScreen bllokon instalimin | "More info" → "Run anyway" (shih seksionin 2.2) |
| Aplikacioni hapet por faqja bosh | Kontrolloni `%APPDATA%\sistemi-genit\logs\error.log` |
| "VCRUNTIME140.dll missing" | Instaloni Microsoft Visual C++ Redistributable (x64) |
| Antivirusi bllokon .exe | Shtoni përjashtim (exclusion) për dosjen e instalimit; aplikacioni nuk përmban malware |
| Aplikacioni nuk gjen printer | Shihni dokumentin 02_PRINTER_CONFIGURATION.md |

---

*Versioni i dokumentit: 1.0.0 | Data: 2024*
