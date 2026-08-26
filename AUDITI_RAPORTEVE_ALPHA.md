# AUDIT — Raportet Alpha kundrejt guidës PDF (Sistemi Genit v1.1.5)

**Data:** 2026-08-26 · **Metoda:** çdo kërkesë e guidës u kontrollua në kod (`build/source/*.html` = motori `alpha*`, `electron/exports.js` = `alphaXlsxBuffer`) dhe u verifikua duke ekzekutuar kodin real të kompiluar (HTML + XLSX me 0/1/25 rreshta).

---

## A. Anatomia e raportit (faqa 2 e guidës)

| Zona | Kërkesa e guidës | Status | Shënim |
|---|---|---|---|
| Titulli | Qendër, Calibri Bold, jeshile #008000, ~30px | ✅ PO | Ishte 26px → u korrigjua në **30px** në 1.1.5 |
| Filtrat | Etiketa+vlera, Times New Roman, gri #808080, horizontal | ✅ PO | `Fillimi/Përfundimi/Monedha/Kursi` |
| Tabela | Header/nënkolona, sfond #F0FFF0, kufij #808080, tekst jeshil | ✅ PO | |
| Totali | Vijë e zezë sipër, tekst jeshil bold | ✅ PO | `.alpha-total` |
| Footer | Copyright italic majtas jeshil, `1/1` djathtas | ✅ PO | |

## B. Eksporti Excel (faqa 3)

| Kontrolli | Status | Shënim |
|---|---|---|
| Worksheet `Sheet` | ✅ PO | |
| Merge i titullit | ✅ PO | |
| Merge i filtrave | ✅ PO | Ishte pa merge → u shtua në 1.1.5 |
| Merge i header-it të grupuar (rowspan/colspan) | ✅ PO | |
| Gjerësi kolonash | ✅ PO | auto sipas përmbajtjes |
| Lartësi rreshtash | ✅ PO | U shtuan në 1.1.5 (titull 30, header 16, data 15, filtra 14) |
| Numra me 2 decimale | ✅ PO | `#,##0.00` |
| HTML dhe XLSX me të njëjtat kolona/renditje | ✅ PO | Ndërtohen nga i njëjti objekt `spec` |

## C. Checklist para dorëzimi (faqa 4)

| Kontrolli | Status |
|---|---|
| Titulli/filtrat/footer në pozicionet e duhura | ✅ PO |
| Ngjyrat #008000 / #F0FFF0 / #808080 | ✅ PO |
| Header i grupuar me rowspan/colspan saktë | ✅ PO |
| HTML = Excel kolona & renditje | ✅ PO |
| Funksionon me 0, 1 dhe shumë rreshta | ✅ PO (testuar 0/1/25) |
| Printimi ruan header-in dhe totalin | ✅ PO (thead ripërsëritet në faqet e printit) |
| Faqëzim i personalizuar shumë-faqësh | ⚠️ PJESËRISHT — mbështetet te printimi i shfletuesit |

## D. Opsionet & formatet e dokumentit në UI

| Opsion | Status |
|---|---|
| Zgjedhja e raportit + periudha Nga/Deri | ✅ PO |
| Preview / Printo / PDF / Excel | ✅ PO — PDF = i njëjti HTML (printToPDF), pra identik |
| Filtrat shtesë të Alpha WEB ("Të lëshuara", "Nd. Thënie") | ❌ JO — janë të lidhur me atë sistem; vlerat ekuivalente s'ekzistojnë këtu |

## E. Mbulimi i katalogut të 55 raporteve

**Të implementuara (6):** Regjistri Përmbledhës i blerjeve · Regjistri Analitik i blerjeve · Libri i Shitjeve · Artikuj të shitur · Gjendja e artikujve (sasi/vlerë) · Ditari Klasik i arkës.
**Të mbetura (49):** pjesa tjetër e familjeve Arkë (Ditari Total, Arkëtime, Gjendje e Përmbledhur), Blerje (me Detajime, Analitike, Libri i blerjeve), Shitje (regjistra sipas klientëve, marzh), Magazinë (Inventarizim, Maturim, Regjistra, Kartela), Financë (Bilanci, PASH, Cash Flow, Libri i Madh, Trial Balance, etj.).
Motori i përbashkë tani ekziston, pra çdo raport tjetër shtohet vetëm me `spec` + mapper të dhënash — pa ri-shpikur asgjë.

## F. Devijimet e gjetura dhe të rregulluara në këtë audit (v1.1.5)

1. Titulli 26px → **30px** (spec ~30px).
2. Filtrat në XLSX pa merge → **merge i plotë** si te burimi.
3. Mungonin lartësitë e rreshtave në XLSX → **të vendosura**.

## Konkluzioni

Motori dhe 6 raportet e para i plotësojnë kërkesat e guidës për strukturë, ngjyra, merge, totale, footer dhe dalje identike HTML/Print/PDF/Excel. Mbulimi i katalogut është 6/55 — pjesa tjetër shtohet incremental me të njëjtin motor; prioriteti i radhës sipas punës: Magazinë → Arkë → Shitje → Financë (kjo e fundit kërkon edhe hierarki kontabël të shtuar në sistem).
