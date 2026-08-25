# Sistemi Genit — Konfigurimi i Printerit (Printer Configuration)

Ky dokument përshkruan konfigurimin dhe përdorimin e printerave në aplikacionin desktop **Sistemi Genit**, përfshirë printimin direkt, eksportin PDF, dhe formatet e letrave të mbështetura.

---

## 1. Mbështetja e Printerave

Aplikacioni përdor **printimin native të Windows** përmes Electron, jo printimin e shfletuesit. Kjo ofron:
- Detektim automatik i të gjithë printerave të instaluar në Windows
- Printim direkt në një printer specifik (pa dialog)
- Printim me numër kopjesh
- Mbështetje për printera termike (58mm, 80mm) dhe printera A4/A5

---

## 2. Formate të Letrave të Mbështetura

| Formati | Përmasat (mm) | Përdorimi tipik |
|---------|---------------|-----------------|
| A4 | 210 × 297 | Fatura, raporte, dokumente të plota |
| A5 | 148 × 210 | Fatura të vogla, kuponë |
| 58mm (termik) | 58 × 297 (rrotullues) | Printer termik 58mm (psh. XP-58) |
| 80mm (termik) | 80 × 297 (rrotullues) | Printer termik 80mm (psh. XP-80, EPSON TM-T20) |
| Letter | 216 × 279 | Format amerikan |

Formati 58mm dhe 80mm janë **portret/rolled** (rrotullues), duke i bërë të përshtatshme për printerat termike POS.

---

## 3. Si Funksionon Printimi

Aplikacioni ofron disa mënyra printimi:

### 3.1 Printim Direkt (Direct Print)
```javascript
// Përdoret nga ura elektronike (electron-bridge.js)
sgDirectPrint(htmlContent, { printerName, copies, profile })
```
- Hap një dritare të fshehur, ngarkon HTML, dhe printon direkt në printerin e specifikuar
- Nuk shfaq dialog (silent print) përveç nëse kërkohet
- Opsione: `printerName` (emri i printerit nga lista), `copies` (numri i kopjeve), `profile` (formati i letrës)

### 3.2 Pamja Paraprake (Print Preview)
```javascript
sgPrintToPdf(htmlContent, { profile })
```
- Gjeneron PDF përmes `webContents.printToPDF()` dhe e shfaq në një dritare pamjeje paraprake
- Përdoruesi mund të verifikojë përpara printimit

### 3.3 Ruajtja e PDF (Save PDF)
```javascript
sgSavePdf(htmlContent, { profile, defaultName })
```
- Gjeneron PDF dhe hap dialogin "Save As" të Windows
- Përdoruesi zgjedh vendndodhjen dhe emrin e skedarit

### 3.4 Lista e Printerave
```javascript
sgListPrinters()
```
- Kthen një listë të të gjithë printerave të instaluar në Windows
- Çdo printer ka: `name`, `displayName`, `isDefault`, `status`, `options`
- Përdoret për të populluar dropdown e zgjedhjes së printerit në cilësimet

---

## 4. Konfigurimi i Printers

### 4.1 Cilësimet e Aplikacionit
Në aplikacion, navigoni te **Cilësimet (Settings)** → seksioni i printimit. Konfiguroni:
- **Printer për fatura**: zgjidhni nga lista e printerave të instaluar
- **Printer termik (POS)**: zgjidhni printerin termik për kuponët
- **Formati i faturës**: A4, A5, 58mm, ose 80mm
- **Numri i kopjeve**: prezgjedhur (mund të ndryshohet për çdo printim)
- **Printim silent**: po/jo (nëse "jo", shfaqet dialogu i Windows)

### 4.2 Instalimi i Printerit në Windows
Printerat duhet të jenë të instaluar në Windows (Settings → Devices → Printers & scanners) përpara se aplikacioni t'i zbulojë. Për printerat termike:
1. Instaloni driver-in e printerit termik (zakonisht vjen me printerin ose shkarkohet nga faqja e prodhuesit).
2. Shtoni printerin në Windows (plug-and-play për USB, ose manual për bluetooth/serial).
3. Vendosni formatin e letrës në preferencat e printerit (58mm ose 80mm).

---

## 5. Detektimi i Printerave (API Teknik)

Aplikacioni merr listën e printerave përmes:
```javascript
const printers = await win.webContents.getPrintersAsync();
```
Kjo kthen një array me objekte për çdo printer:
```javascript
{
  name: "EPSON_TM_T20",
  displayName: "EPSON TM-T20",
  description: "EPSON TM-T20 Receipt",
  status: 0,           // 0 = gati, 1 = i zënë, etj.
  isDefault: true,
  options: { ... }      // opsione specifike të printerit
}
```

---

## 6. Opsionet e Printimit (Teknik)

### 6.1 Opsionet e printToPDF
```javascript
{
  pageSize: { width: 58000, height: 297000 },  // mikrona
  printBackground: true,
  marginsType: 0,        // 0=asnjë, 1=minimal, 2=standard
  landscape: false
}
```

### 6.2 Opsionet e print() (printim direkt)
```javascript
{
  silent: true,          // pa dialog
  printBackground: true,
  deviceName: "EPSON_TM_T20",  // emri i printerit
  copies: 1,
  landscape: false
}
```

---

## 7. Rrjedha e Printimit për Fatura (Fletë Hyrje/Dalje)

Kur përdoruesi klikon "Printo" për një dokument (Fletë Hyrje, Fletë Dalje, Faturë):
1. Aplikacioni gjeneron HTML për dokumentin (me stilet e aplikacionit)
2. `window.open()` interceptohet nga `electron-bridge.js`
3. Ura kontrollon cilësimet e printimit (printer i zgjedhur, format)
4. Nëse "Printim silent" është aktiv → `sgDirectPrint()` (printim direkt)
5. Nëse jo → `sgPrintToPdf()` (pamje paraprake, pastaj përdoruesi printon)

---

## 8. Zgjidhja e Problemeve të Printimit

| Problemi | Shkaku | Zgjidhja |
|----------|--------|----------|
| Lista e printerave është bosh | Asnjë printer i instaluar | Instaloni një printer në Windows Settings |
| Printer nuk printon | Emri i printerit është gabim | Ripopulloni listën e printerave; sigurohuni që emri përputhet |
| Printim termik i prerë keq | Formati i letrës gabim | Vendosni 58mm ose 80mm në cilësimet + në preferencat e printerit |
| PDF është bosh | `printBackground: false` | Sigurohuni që `printBackground: true` (e prezgjedhur) |
| Karaktere të gabuara në termik | Encoding i fontit | Përdorni font monospace për printer termik |
| Printim shumë i ngadaltë | Rrjeti / printera remote | Printim lokal USB rekomandohet |

---

## 9. Printimi përmes "Windows Print to PDF"

Nëse nuk keni printer fizik, mund të përdorni "Microsoft Print to PDF" (i instaluar automatikisht në Windows 10/11):
1. Zgjidhni "Microsoft Print to PDF" si printer.
2. Kur printoni, Windows kërkon një vendndodhje për të ruajtur PDF.
3. Kjo është e dobishme për testim dhe arkivim.

---

*Versioni i dokumentit: 1.0.0 | Data: 2024*
