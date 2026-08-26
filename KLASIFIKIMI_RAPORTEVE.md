# Klasifikimi i raporteve Alpha WEB sipas moduleve

Bazuar në katalogun e guidës (55 raporte) + menunë reale e modulit **Blerje** (screenshot).
Statuset: ✅ = i implementuar në Sistemi Genit (v1.1.6) · 🔧 = i mundshëm me të dhënat aktuale · ⛔ = kërkon të dhëna shtesë që s'ekzistojnë në sistem.

## 🟣 BLERJE (18)
| Raporti | Status |
|---|---|
| Regjistri Përmbledhës i blerjeve | ✅ |
| Regjistri Analitik i blerjeve | ✅ |
| Regjistri Analitik i blerjeve (Format 2) | ✅ |
| Regjistri Analitik i blerjeve me detajime | 🔧 (kolona shtesë në të njëjtin motor) |
| Blerje Analitike | 🔧 |
| Libri i Blerjeve sipas Muajve | ✅ |
| Artikuj të blerë | ✅ |
| Artikuj të blerë me detajime | 🔧 |
| Listë çmimesh blerje | ✅ |
| Eksportimi i faturave të blerjeve | ✅ |
| Kartela e artikullit (nga blerjet) | 🔧 (shih MAGAZINË) |
| Artikuj të blerë sipas datës së skadencës dhe serisë | ⛔ kërkon fushat skadencë/seri |
| Artikuj të blerë sipas degëve administrative | ⛔ kërkon fushën dega |
| Regjistri i Doganimeve të Importit | ⛔ kërkon të dhëna doganore |
| Konvertimi i Kontratave të Blerjes | ⛔ kërkon modulin e kontratave |
| Situacion i Furnitorit | 🔧 |

## 🟢 SHITJE (10)
| Raporti | Status |
|---|---|
| Libri i Shitjeve | ✅ |
| Regjistri Analitik i Shitjeve | 🔧 |
| Shitjet Ditore | ✅ |
| Regjistri Përmbledhës i Shitjeve | 🔧 |
| Shitjet sipas Artikujve | ✅ (Artikuj të shitur) |
| Shitjet sipas Klienteve | ✅ |
| Marzhi i Shitjeve sipas Klienteve | 🔧 |
| Kartela e Klientit | 🔧 |
| Situacion i Klientit | 🔧 |
| Regjistri Përmbledhës Faturime dhe Pagesa | 🔧 |

## 🟠 MAGAZINË (17)
| Raporti | Status |
|---|---|
| Gjendja e artikujve në sasi dhe vlerë | ✅ |
| Artikuj me gjendje negative | ✅ |
| Gjendja e artikujve min/max | 🔧 |
| Gjendja sipas magazinës | 🔧 (kërkon warehouse_stock) |
| Gjendja e përmbledhur e artikujve | 🔧 |
| Gjendja e magazinës / në vleftë / sipas furnitorëve / me detajime | 🔧 |
| Fletë Inventarizimi | 🔧 |
| Maturimi i stokut | 🔧 |
| Regjistri Përmbledhës / Analitik i magazinës | 🔧 |
| Kartela e artikullit (+ formatet 2, shitje, magazinë) | 🔧 |
| Analiza e artikujve | 🔧 |
| Lidhja e dokumentave | 🔧 |

## 🔵 ARKË (5)
| Raporti | Status |
|---|---|
| Ditari Klasik | ✅ |
| Ditari Total | ✅ |
| Arkëtime (sipas kategorisë) | 🔧 |
| Gjendja e përmbledhur e arkës | 🔧 |

## 🔴 FINANCË / KONTABËL (9) — ⛔ kërkojnë hierarki kontabël
Bilanci · Pasqyra e konsoliduar · PASH · Cash Flow · Pasqyra e lëvizjes së fondeve · Lëvizja e llogarive D/K · Bilanci vertetues (Trial Balance) · Libri i madh · Kartela e llogarive.

## 📄 DOKUMENTE (të sistemit, jo raporte)
Fletë Hyrje · Fletë Dalje · Faturë shitjeje · Faturë blerjeje — të gjitha tashmë në formatet zyrtare.

**Gjithsej në v1.2.0: të 54 raportet e katalogut janë implementuar dhe të grupuara në UI sipas moduleve (Blerje / Shitje / Magazinë / Arkë / Financë) si në Alpha WEB.** Raportet e financës (Bilanci, PASH, Cash Flow, etj.) janë versione të thjeshtuara të derivuara nga të dhënat ekzistuese (shitje / blerje / shpenzime / lëvizje stoku), me hierarkinë e llogarive të ruajtur; raportet që në Alpha WEB kërkojnë të dhëna që nuk ekzistojnë këtu (skadenca/seri, dogana, kontrata, degë) janë zëvendësuar me derivime ose kolona bosh.
