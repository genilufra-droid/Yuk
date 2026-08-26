# RAPORTI I AUDITIT TË PLOTË — Sistemi Genit v1.1.0

**Data:** 2026-08-25 · **Repo:** github.com/genilufra-droid/Yuk (main = `b359066`)
**Scope i audituar:** kodi burim `Sistemi-Genit-source-1.1.0-PA-DEMO.zip` (main process, preload, renderer, schema/migrations, build pipeline), workflow-i i GitHub Actions, dhe të 6 commit-et e engagement-it (`6e6f6fe … b359066`).

---

## 1. Përmbledhje ekzekutive

Sistemi Genit është një ERP/POS desktop offline (Electron 31 + SQLite/better-sqlite3, WAL) i portuar nga një app i vetëm HTML me Firebase. Arkitektura është **e shëndoshë**: izolim i proceseve, transaksione atomike me dual-write (relacional + kv_nodes), numra dokumentesh me constraints në DB. Gjendja e përgjithshme: **mirë për përdorim të brendshëm**, me disa gjetje sigurie dhe mirëmbajtjeje që duhen adresuar (shih §4–§6).

Gjatë engagement-it u dorëzuan: fatura zyrtare shqiptare (shitje + blerje) identike në print/preview/PDF/Excel; fletët Hyrje/Dalje në formatin e bllokut fizik; numrimi manual/automatik; rregullimi i **5 bug-eve reale** (crash-e dhe rollback-e); versioni 1.1.0.

---

## 2. Inventari i audituar

| Pjesë | Rreshta (përaf.) | Komentar |
|---|---|---|
| `build/source/*.html` (burimi i vetëm i frontend-it) | 12 800 | 3 script-e: përkthime, db/api plain-JS, React JSX |
| `src/app.compiled.js` (artefakt) | 17 000+ | gjenerohet nga `build/build-frontend.js` (Babel) |
| `electron/main.js` | 593 | IPC: sqlite:*, printer:*, export:*, dialog:*, backup:*, app:* |
| `electron/ipc/atomic.js` | ~930 | 14 handler-e transaksionesh atomike |
| `electron/database.js` | 395 | emulator Firebase mbi SQLite + scrypt |
| `electron/preload.js` | 128 | contextBridge i validuar |
| `database/schema.sql` + 1 migration | 405+29 | ~25 tabela, indexes, partial-unique |
| `.github/workflows/build-only-exe-from-zip-FIXED.yml` | – | manual `workflow_dispatch`, windows-latest, NSIS |

---

## 3. Arkitektura

- **Main process** mban të gjitha veprimet SQLite/print/eksport; **renderer** i sandbox-uar flet vetëm përmes `window.sistemiGenitSQLite` / `window.sistemiGenitAPI`.
- **Dual-write**: çdo veprim operacional shkruan në tabelat relacionale (burim i vërtetë) dhe pasqyrohet në `kv_nodes` (për kompatibilitetin Firebase të renderer-it), brenda **të njëjtit transaksion** better-sqlite3 → gjendje e pjesshme e pamundur.
- **Build pipeline**: HTML i vetëm → `build-frontend.js` (zhvesh CDN, kompilon JSX, injekton bridge) → `src/`. I riprodhueshëm nga checkout, por i pazakontë (shih §6).
- **CI**: workflow manual që ekstrakton ZIP-in, `npm ci`, `electron-builder --win nsis` (pa signing), ngarkon vetëm Setup EXE.

---

## 4. Siguria — gjetjet

### Pozitive (të verifikuara në kod)
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` në të gjitha dritaret (main.js r. 74-76, 254, 314).
- Navigimi bllokohet (`will-navigate` preventDefault); linquet e jashtme hapen vetëm me `shell.openExternal`.
- Preload validon çdo path/vlerë (`validPath`, `safeValue`) para IPC.
- Fjalëkalimet me **scrypt** (N=16384) + `crypto.timingSafeEqual` (krahasim konstant në kohë).
- Restore i backup-it ruan kopje `.pre-restore-*.db` para zëvendësimit (main.js r. 446-449).
- Login ekzekutohet në main process (`auth:login`), jo në renderer.

### 🔴 H1 — Token GitHub i ekspozuar (proces, jo kod)
Token-i i përdorur për push u ngjit në chat. **Veprim:** revokoje tani te https://github.com/settings/tokens dhe përdor vetëm token me scope minimal + expiry të shkurtër.

### 🔴 H2 — Mungon Content-Security-Policy
`grep "Content-Security-Policy"` → 0 rezultate në main.js dhe index.html. Pa CSP, çdo XSS hipotetik në renderer ka dorë të lirë. **Veprim:** shto `session.defaultSession.webRequest.onHeadersReceived` me CSP `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:` (app-i është offline, s'ka nevojë për më shumë).

### 🟠 M1 — `system:injectFailure` i arritshëm në build-in e prodlimit
Handler testues i ekspozuar në preload (`systemInjectFailure`) që detyron rollback-e të kontrolluara. Nuk ka asnjë gardh `isDev`. **Veprim:** ktheje në `if (!isDev) return {success:false}`.

### 🟠 M2 — Identiteti besohet nga renderer-i
Sesioni ruhet në `localStorage['fb_user']` (JSON i lexueshëm/ndryshueshëm) dhe handler-ët atomikë pranojnë objektin `user` nga renderer për emrin e operatorit/audit. Një përdorues me devtools mund të falsifikojë rolin në UI dhe emrin në `audit_logs`. **Veprim:** audit-log duhet të verifikojë sesionin në main (p.sh. token i nënshkruar në login), jo payload nga renderer.

### 🟠 M3 — API shkrimi e përgjithshme `sqlite:set/update/remove/push/atomic`
E nevojshme për kompatibilitetin Firebase, por renderer-i mund të shkruajë çdo path (p.sh. `settings`, `users`). **Veprim afatgjatë:** kufizo path-et me allow-list ose kalo të gjitha shkrimet në handler-ë atomikë të tipit `sale:commit`.

### 🟡 L1 — Kod i dyfishuar
`hashPassword/verifyPassword` të kopjuara në `database.js` dhe `ipc/atomic.js` (2+2 `scryptSync`). **Veprim:** nxirri në modul të përbashkët.

### 🟡 L2 — Restore pa validim skeme
Backup restore zëvendëson `.db` pa kontrolluar versionin e skemës/migrations. Kopja pre-restore e zbut, por një skedar i gabuar e lë app-in pa punë deri në rikthim manual. **Veprim:** hap DB-në në një instancë provë dhe ekzekuto `_runMigrations` para swap-it.

---

## 5. Integriteti i të dhënave

### Pozitive
- Të gjitha veprimet që ndryshojnë stokun në **një transaksion** (dokument + rreshta + lëvizje stoku + warehouse_stock + sekuencë + audit).
- `document_sequences` për numra të njëpasnjëshëm; partial-unique indexes për `invoice_no/doc_no/po_number`.
- **Double-post guards**: unique index mbi `stock_movements(ref_doc, reason)` për 'Purchase' dhe 'Fletë Hyrje' → një PO s'mund të marrë stok dy herë edhe në race conditions.
- WAL + `foreign_keys = ON`.

### 🟠 F1 — Self-heal krijon produkte "placeholder"
Për të shmangur `FOREIGN KEY constraint failed` te të dhënat legacy, `ensureProductRow` fut rresht minimal me `name = id`. **Veprim:** pas migrimit, backfill me emrat realë nga `kv_nodes('products/…')` dhe raport cleanup.

### 🟡 F2 — `kv_nodes` si projeksion i derivuar
Nëse një mjet i jashtëm shkruan vetëm në tabela relacionale, UI (që lexon kv) nuk e sheh. I dokumentuar si dizajn; **veprim afatgjatë:** kalo leximet e UI-së në SQL dhe hiq kv_nodes.

---

## 6. Cilësia e kodit / mirëmbajtja

| Gjetja | Severiteti | Rekomandim |
|---|---|---|
| Burim 12.8k-rreshtësh në një HTML; frontend i kompiluar i commit-uar | 🟠 | Fut modulizim gradual (Vite/esbuild) dhe mbaj artefaktin jashtë repo |
| Repo ruan ZIP 2.6 MB (root + `.github/workflows/`) dhe historia është plot upload/delete ZIP-esh | 🟠 | Mbaj kodin si skedarë në repo; fshi kopjen në workflows |
| S'ka teste në CI (`test-suite-v3.js` ekziston, 470 rreshta, por s'ekzekutohet nga workflow) | 🟠 | Shto step "run tests" (Node) + build |
| Përzierje React UMD + jQuery/DataTables + SweetAlert2 | 🟡 | OK për tani, por planifikim për t'i hequr dependencitë jQuery |
| Dependencat: electron ^31 (korrik 2024), better-sqlite3 ^11 | 🟡 | Plan upgrade electron → rebuild native modules në CI |
| Data të pasakta në docs (test report "2024" vs copyright 2026) | 🟢 | Përditëso |

---

## 7. Funksionaliteti (gjendja aktuale, e verifikuar me harness)

- **Fatura shitjes & blerjes**: layout zyrtar ( kutitë Shitësi/Blerësi, tabela 9-kolonëshe, TVSH me qelizë blu, NSLF 32-hex / NIVF UUID, **pa QR**) — identik në print, preview, PDF, Excel dhe në ekran.
- **Fletë Hyrje/Dalje**: formati i bllokut fizik (subhead me serial 7-shifror të kuq, 21 rreshta, shirit nënshkrimesh 2-rreshtësh); lëvizjet `in` printohen si **FLETË - HYRJE**, `out` si **FLETË DALJE**.
- **Numrat**: FH nga blerja → automatik i lidhur me PO + mundësi manuale; FD nga shitja → automatik i lidhur me faturën; FD i pavarur → prompt manual/automatik.
- **View-switcher** (butoni i verdhë) nuk crash-on më; listat rifreskohen live pas veprimeve.

---

## 8. Bug-u të gjetura & të rregulluara gjatë engagement-it

| # | Simptoma | Shkaku rrënjësor | Fix | Commit |
|---|---|---|---|---|
| 1 | Print i stokut-in s'hapej / crash | `ReferenceError: docNo` (variable e gabuar në serial padding) | `doc` | 838f5ea |
| 2 | "Fletë Hyrje nuk u ruajt: FOREIGN KEY constraint failed" | Produkte/PO legacy vetëm në kv_nodes | self-heal `ensureProductRow` + krijim header PO brenda transaksionit | 838f5ea |
| 3 | "Diçka nuk funksionoi" te butoni i verdhë | `removeChild` DOMException: DataTables ri-prindëron tabelën; React s'e heq dot | tabela mbetet e montuar (display:none) + destroy i sigurt | b359066 |
| 4 | Stok-in s'shihej pa reload | View-t StockView / Fletë Hyrje pa listener `erp-data-changed` | listener + refresh | 838f5ea |
| 5 | Preview në ekran ndryshe nga printi | Komponentë JSX të shkëputur nga builder-at | `dangerouslySetInnerHTML` me të njëjtin HTML + try/catch | 70e245e / 838f5ea |

---

## 9. Verifikimi i kryer & kufizimet

**U verifikua:** `node --check` mbi `app.compiled.js` dhe `atomic.js`; harness që ekzekuton **kodin real të kompiluar** (19 kontrolle fatura + 16 kontrolle FH/FD, të gjitha PASS); kontrolle statike të sigurisë (grep).
**S'u verifikua dot këtu:** ekzekutim real në Windows (instalim NSIS, printera fizikë 58/80mm, dialogët native) — kërkon makinë Windows; rekomandohet test manual pas build-it të parë 1.1.0.

---

## 10. Rekomandimet me prioritet

1. **Tani:** revoko token-in; shto CSP; gardh `isDev` te `system:injectFailure`.
2. **Këtë javë:** shto testet në CI; backfill emrave të produkteve self-heal; validim skeme në restore.
3. **Afatgjatë:** moduli i përbashkët i hash-it; allow-list për shkrimet sqlite; lexime UI nga SQL (heqje e kv_nodes); modulizim i frontend-it; upgrade Electron.

---

*Auditi u krye nga agjenti në Arena.ai mbi gjendjen `b359066` të repo-s dhe ZIP-in 1.1.0.*
