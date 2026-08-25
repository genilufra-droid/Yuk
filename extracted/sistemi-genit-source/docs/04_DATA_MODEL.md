# Sistemi Genit — Data Model & Architecture

**Version:** 1.0.0 — **Date:** 2026-07-12

## 1. Overview

Sistemi Genit uses a **dual-write data model** backed by a single SQLite
database (better-sqlite3, WAL mode). Every operational write goes to **two**
layers simultaneously, inside one atomic transaction:

1. **Relational tables** (source of truth for integrity, reporting, and
   auditability) — `sales`, `sale_items`, `purchases`, `purchase_items`,
   `purchase_orders`, `warehouse_documents`, `warehouse_document_items`,
   `stock_movements`, `warehouse_stock`, `payments`, `document_sequences`,
   `audit_logs`, etc.
2. **kv_nodes** (Firebase-compatible key/value store) — a single table
   (`path` PRIMARY KEY, `value_json` TEXT) that reconstructs nested JSON
   objects from child rows. The renderer's existing Firebase-style API
   (`db.ref(path).once/set/update/remove/push/transaction`) reads from this
   layer, so all existing UI queries continue to work without modification.

Both layers are written inside the **same** better-sqlite3 transaction. If
any part fails, the entire transaction rolls back — neither layer shows a
partial result.

## 2. Why Two Layers?

The application was originally built against Firebase Realtime Database. The
renderer code uses a Firebase-compatible shim (`db.ref('sales/xxx').once(...)`
etc.) that is implemented on top of `kv_nodes`. Rewriting every renderer query
to use SQL would be a massive, risky change.

Instead, the main process now performs **atomic transactions** that write to
the relational tables (for integrity, unique constraints, stock math) AND
mirror the same data to `kv_nodes` (for renderer compatibility). The
relational tables are the authoritative source; `kv_nodes` is a derived
projection that keeps the UI functional.

## 3. Relational Tables (Source of Truth)

| Table | Purpose | Key Constraints |
|-------|---------|-----------------|
| `sales` | Sale headers | `invoice_no` UNIQUE |
| `sale_items` | Sale line items | FK to sales |
| `purchases` | Purchase headers | `doc_no` UNIQUE |
| `purchase_items` | Purchase line items | FK to purchases |
| `purchase_orders` | PO headers | `po_number` UNIQUE |
| `purchase_order_items` | PO line items | FK to purchase_orders |
| `warehouse_documents` | Fletë Hyrje / Fletë Dalje | `doc_no` UNIQUE |
| `warehouse_document_items` | Warehouse doc line items | FK to warehouse_documents |
| `stock_movements` | Every stock in/out event | Dedup indexes (purchase, fletehyrje) |
| `warehouse_stock` | Per-warehouse product stock | UNIQUE(warehouse_id, product_id) |
| `products` | Product master | stock field = SUM(warehouse_stock) |
| `payments` | Sale payments | — |
| `document_sequences` | Atomic doc number counters | `name` PRIMARY KEY |
| `audit_logs` | Activity audit trail | — |
| `users` | User accounts | password = scrypt hash |

### Unique Constraint Migrations

`database/migrations/0001_unique_constraints.sql` adds:
- `idx_sales_invoice_unique` — prevents duplicate invoice numbers
- `idx_purchases_docno_unique` — prevents duplicate purchase doc numbers
- `idx_po_number_unique` — prevents duplicate PO numbers
- `idx_wd_docno_unique` — prevents duplicate warehouse doc numbers
- `idx_sm_purchase_dedup` — prevents duplicate stock movements for same purchase
- `idx_sm_fletehyrje_dedup` — prevents duplicate stock movements for same FH doc

## 4. kv_nodes (Firebase-Compatible Projection)

The `kv_nodes` table stores arbitrary JSON as leaf rows:

```sql
CREATE TABLE kv_nodes (
  path        TEXT PRIMARY KEY,
  value_json  TEXT
);
```

The `SistemiGenitDatabase` class reconstructs nested objects from child rows.
For example, `db.readValue('users')` assembles all `users/*` rows into a
single `{ id: { ...userObj } }` object, exactly like Firebase's
`ref('users').once('value')`.

### Atomic Handlers Mirror to kv_nodes

Each atomic IPC handler calls a mirror function (e.g. `mirrorSaleToKv`)
that writes the same sale to `sales/<id>` in kv_nodes, so the renderer's
existing `fbGetSales()` / `useFetch('sales')` queries return the data
without any renderer code changes.

## 5. Atomic Transaction Flow (Example: sale:commit)

```
Renderer: sistemiGenitSQLite.saleCommit({ items, payment, ... })
    │
    ▼  (IPC invoke, one round-trip)
Main Process: ipcMain.handle('sale:commit', ...)
    │
    ▼  db.atomic(() => { ... })  ← single better-sqlite3 transaction
    │
    ├── 1. Reserve invoice number: nextDocNumber('sales', 'INV-', 5)
    │      INSERT INTO document_sequences ... ON CONFLICT DO UPDATE
    │
    ├── 2. INSERT INTO sales (...)
    ├── 3. INSERT INTO sale_items (...)  (per line)
    ├── 4. INSERT INTO stock_movements (...)  (stock OUT, per line)
    ├── 5. UPDATE warehouse_stock SET stock = stock - qty  (per line)
    ├── 6. UPDATE products SET stock = <recomputed>  (per line)
    ├── 7. INSERT INTO payments (...)
    ├── 8. INSERT INTO audit_logs (...)
    └── 9. mirrorSaleToKv(saleId)  ← write sales/<id> to kv_nodes
    │
    ▼  transaction commits (all 9 steps) or rolls back (none commit)
    │
Renderer: receives { success: true, saleId, invoiceNo }
```

If step 5 fails (e.g., stock would go negative and the handler enforces it),
steps 1-4 are rolled back. The invoice number is NOT consumed. No partial
state exists in either layer.

## 6. Password Security

Passwords are hashed with **scrypt** (Node.js built-in `crypto.scryptSync`,
no external dependencies):

- Format: `scrypt$N$r$p$saltHex$hashHex` (self-describing, upgradeable)
- Parameters: N=16384, r=8, p=1, keylen=32
- Salt: 16 random bytes per password
- Verification: constant-time compare (`crypto.timingSafeEqual`)

**Auto-upgrade:** Legacy plaintext passwords (from older database files) are
automatically upgraded to scrypt on the first successful login. The
`auth:login` handler detects plaintext, verifies it, and if correct, replaces
it with a scrypt hash inside a transaction — all transparent to the user.

No plaintext passwords are stored or compared after the first login.

## 7. Document Sequence Generation

Document numbers (invoice numbers, PO numbers, Fletë Hyrje/Dalje numbers)
are generated **atomically inside the same transaction** as the document
creation, using the `document_sequences` table:

```sql
INSERT INTO document_sequences (name, last_number)
VALUES ('sales', 1)
ON CONFLICT(name) DO UPDATE SET last_number = last_number + 1;
```

This guarantees:
- No two documents ever get the same number (row-level lock serializes)
- The number is only consumed if the transaction commits (rollback releases it)
- Numbers are sequential and gap-free per document type

## 8. IPC Handler Inventory

| Channel | Purpose | Atomic |
|---------|---------|--------|
| `sale:commit` | Create sale + stock OUT + payment + invoice# | ✅ |
| `sale:update` | Edit sale (reverse old, apply new) | ✅ |
| `sale:cancel` | Cancel sale (reverse stock, set status) | ✅ |
| `purchase:post` | Post purchase + stock IN + doc# | ✅ |
| `purchaseOrder:receive` | Receive PO → Fletë Hyrje + stock IN | ✅ |
| `warehouseDoc:save` | Fletë Hyrje (IN) / Fletë Dalje (OUT) | ✅ |
| `return:commit` | Return + stock credit back | ✅ |
| `stock:correction` | Absolute/delta stock adjustment | ✅ |
| `stock:transfer` | OUT source + IN dest (one tx) | ✅ |
| `stock:bulkIn` | Multiple stock-in lines atomically | ✅ |
| `auth:login` | Login (verify hash, auto-upgrade) | ✅ |
| `auth:hashPassword` | Hash password for storage | ✅ |
| `db:debugCounts` | Return relational table row counts | read-only |
| `system:injectFailure` | TEST: force rollback for verification | ✅ |
