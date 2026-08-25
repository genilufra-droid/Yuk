-- ============================================================================
-- Sistemi Genit - SQLite Schema
-- A local ERP/POS database mirroring the Firebase Realtime DB structure of the
-- original single-file HTML app, but with proper relational integrity, foreign
-- keys, indexes, unique constraints and safe sequential document numbering.
-- ============================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- Generic key/value root nodes that the frontend reads/writes as JSON blobs.
-- The Firebase-style API (db.ref(path)) stores arbitrary JSON under a path.
-- We keep a single `kv_nodes` table where path segments map to a JSON payload,
-- plus dedicated relational tables for entities that need constraints.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kv_nodes (
  path        TEXT PRIMARY KEY,
  value_json  TEXT,            -- null means the node was deleted
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- Users
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  password    TEXT,
  role        TEXT DEFAULT 'User',
  name        TEXT,
  active      INTEGER DEFAULT 1,
  rights      TEXT,            -- JSON blob of permission flags
  created_at  TEXT,
  updated_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ----------------------------------------------------------------------------
-- Companies / Settings
-- Settings are stored both as a kv node (settings) and relationally.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id          TEXT PRIMARY KEY,
  name        TEXT,
  nipt        TEXT,
  address     TEXT,
  phone       TEXT,
  email       TEXT,
  currency    TEXT,
  is_default  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  data_json   TEXT              -- full settings blob (Firebase-style)
);

-- ----------------------------------------------------------------------------
-- Products
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id              TEXT PRIMARY KEY,
  sku             TEXT UNIQUE,
  name            TEXT NOT NULL,
  category        TEXT,
  barcode         TEXT,
  cost            REAL DEFAULT 0,
  price           REAL DEFAULT 0,
  tax_rate        REAL DEFAULT 0,
  stock           REAL DEFAULT 0,     -- always in BASE unit
  low_stock       REAL DEFAULT 0,
  unit            TEXT DEFAULT 'copë',
  base_unit       TEXT DEFAULT 'copë',
  units_json      TEXT,                -- JSON array of conversion units
  image_url       TEXT,
  active          INTEGER DEFAULT 1,
  created_at      TEXT,
  updated_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

CREATE TABLE IF NOT EXISTS product_units (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  TEXT NOT NULL,
  unit_name   TEXT NOT NULL,
  coefficient REAL NOT NULL,         -- how many base units = 1 of this unit
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- Categories
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);

-- ----------------------------------------------------------------------------
-- Clients (buyers) and Suppliers (sellers) and Agents
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  nipt        TEXT,
  address     TEXT,
  phone       TEXT,
  email       TEXT,
  city        TEXT,
  balance     REAL DEFAULT 0,
  created_at  TEXT,
  updated_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);

CREATE TABLE IF NOT EXISTS suppliers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  nipt        TEXT,
  address     TEXT,
  phone       TEXT,
  email       TEXT,
  city        TEXT,
  balance     REAL DEFAULT 0,
  created_at  TEXT,
  updated_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);

CREATE TABLE IF NOT EXISTS agents (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT,
  commission  REAL DEFAULT 0,
  active      INTEGER DEFAULT 1,
  created_at  TEXT
);

-- ----------------------------------------------------------------------------
-- Warehouses and stock
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warehouses (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  address     TEXT,
  is_default  INTEGER DEFAULT 0,
  created_at  TEXT
);

CREATE TABLE IF NOT EXISTS warehouse_stock (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  warehouse_id  TEXT,
  product_id    TEXT NOT NULL,
  stock         REAL DEFAULT 0,        -- in base unit
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ws_product ON warehouse_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_ws_warehouse ON warehouse_stock(warehouse_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_unique ON warehouse_stock(warehouse_id, product_id);

-- ----------------------------------------------------------------------------
-- Sales and sale items
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales (
  id            TEXT PRIMARY KEY,
  invoice_no    TEXT UNIQUE,
  doc_no        TEXT,
  pos           TEXT,
  client_id     TEXT,
  client_name   TEXT,
  subtotal      REAL DEFAULT 0,
  discount      REAL DEFAULT 0,
  tax           REAL DEFAULT 0,
  total         REAL DEFAULT 0,
  paid          REAL DEFAULT 0,
  payment_methods TEXT,               -- JSON
  status        TEXT DEFAULT 'completed',
  warehouse     TEXT,
  operator      TEXT,
  created_at    TEXT,
  updated_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_client ON sales(client_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_no);

CREATE TABLE IF NOT EXISTS sale_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id       TEXT NOT NULL,
  product_id    TEXT,
  name          TEXT,
  sku           TEXT,
  unit_name     TEXT,
  qty           REAL DEFAULT 0,
  display_qty   REAL,
  free_qty      REAL DEFAULT 0,
  unit_price    REAL DEFAULT 0,
  line_net      REAL DEFAULT 0,
  line_tax      REAL DEFAULT 0,
  line_total    REAL DEFAULT 0,
  tax_rate      REAL DEFAULT 0,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_si_sale ON sale_items(sale_id);

-- ----------------------------------------------------------------------------
-- Purchases and purchase items
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchases (
  id            TEXT PRIMARY KEY,
  doc_no        TEXT UNIQUE,
  supplier_id   TEXT,
  supplier_name TEXT,
  subtotal      REAL DEFAULT 0,
  tax           REAL DEFAULT 0,
  total         REAL DEFAULT 0,
  warehouse     TEXT,
  status        TEXT DEFAULT 'completed',
  created_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_purchases_created ON purchases(created_at);

CREATE TABLE IF NOT EXISTS purchase_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id   TEXT NOT NULL,
  product_id    TEXT,
  name          TEXT,
  unit_name     TEXT,
  qty           REAL DEFAULT 0,
  unit_cost     REAL DEFAULT 0,
  line_total    REAL DEFAULT 0,
  FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pi_purchase ON purchase_items(purchase_id);

-- ----------------------------------------------------------------------------
-- Purchase orders
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_orders (
  id            TEXT PRIMARY KEY,
  po_number     TEXT UNIQUE,
  supplier_id   TEXT,
  supplier_name TEXT,
  status        TEXT DEFAULT 'ordered',
  total         REAL DEFAULT 0,
  created_by    TEXT,
  created_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_po_created ON purchase_orders(created_at);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id         TEXT NOT NULL,
  product_id    TEXT,
  name          TEXT,
  unit_name     TEXT,
  qty           REAL DEFAULT 0,
  unit_cost     REAL DEFAULT 0,
  line_total    REAL DEFAULT 0,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_poi_po ON purchase_order_items(po_id);

-- ----------------------------------------------------------------------------
-- Warehouse documents (Fletë Hyrje / Fletë Dalje) + items
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warehouse_documents (
  id              TEXT PRIMARY KEY,
  doc_no          TEXT UNIQUE,
  type            TEXT NOT NULL,      -- 'in' (Fletë Hyrje) | 'out' (Fletë Dalje)
  warehouse       TEXT,
  counterparty    TEXT,               -- client or supplier name
  counterparty_id TEXT,
  destination     TEXT,
  source_address  TEXT,
  reference_doc   TEXT,
  reason          TEXT,
  authorized_person TEXT,
  vehicle         TEXT,
  total           REAL DEFAULT 0,
  created_by      TEXT,
  created_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_wd_type ON warehouse_documents(type);
CREATE INDEX IF NOT EXISTS idx_wd_created ON warehouse_documents(created_at);

CREATE TABLE IF NOT EXISTS warehouse_document_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id   TEXT NOT NULL,
  product_id    TEXT,
  name          TEXT,
  unit_name     TEXT,
  qty           REAL DEFAULT 0,
  price         REAL DEFAULT 0,
  value         REAL DEFAULT 0,
  FOREIGN KEY (document_id) REFERENCES warehouse_documents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_wdi_doc ON warehouse_document_items(document_id);

-- ----------------------------------------------------------------------------
-- Stock movements ledger (append-only)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_movements (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL,
  type          TEXT NOT NULL,        -- 'in' | 'out'
  reason        TEXT,                 -- Sale, Purchase, Fletë Hyrje, Fletë Dalje, Transfer, Correction
  qty           REAL DEFAULT 0,       -- base unit (signed handled in app)
  unit_cost     REAL DEFAULT 0,
  warehouse     TEXT,
  ref_doc       TEXT,
  note          TEXT,
  created_by    TEXT,
  created_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_sm_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_sm_created ON stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_sm_type ON stock_movements(type);

-- ----------------------------------------------------------------------------
-- Payments (client + supplier)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_payments (
  id          TEXT PRIMARY KEY,
  client_id   TEXT,
  client_name TEXT,
  amount      REAL DEFAULT 0,
  method      TEXT,
  date        TEXT,
  note        TEXT,
  created_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_cp_client ON client_payments(client_id);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id          TEXT PRIMARY KEY,
  supplier_id   TEXT,
  supplier_name TEXT,
  amount      REAL DEFAULT 0,
  method      TEXT,
  date        TEXT,
  note        TEXT,
  created_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_sp_supplier ON supplier_payments(supplier_id);

-- generic payments table (mirrors Firebase 'payments' node)
CREATE TABLE IF NOT EXISTS payments (
  id          TEXT PRIMARY KEY,
  entity      TEXT,           -- 'sale' | 'supplier' | 'expense'
  ref_id      TEXT,
  amount      REAL DEFAULT 0,
  method      TEXT,
  note        TEXT,
  created_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_payments_ref ON payments(ref_id);

-- ----------------------------------------------------------------------------
-- Expenses
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id          TEXT PRIMARY KEY,
  category    TEXT,
  amount      REAL DEFAULT 0,
  date        TEXT,
  note        TEXT,
  added_by    TEXT,
  created_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);

-- ----------------------------------------------------------------------------
-- Document sequences (safe sequential numbering)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_sequences (
  name        TEXT PRIMARY KEY,     -- 'sales' | 'pos' | 'products' | 'FH' | 'FD' | 'TR' | 'BL'
  last_value  INTEGER DEFAULT 0,
  prefix      TEXT
);

-- ----------------------------------------------------------------------------
-- Audit logs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  action      TEXT,
  user        TEXT,
  detail      TEXT,
  created_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- ----------------------------------------------------------------------------
-- Schema migrations tracking
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  id          TEXT PRIMARY KEY,
  applied_at  TEXT DEFAULT (datetime('now'))
);
