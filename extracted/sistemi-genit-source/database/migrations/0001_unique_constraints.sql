-- Migration 0001: Add unique constraints to prevent duplicate document numbers
-- and double-posting of the same source document into stock movements.
-- These constraints make document sequence generation and double-post
-- protection enforceable at the database level, inside atomic transactions.

-- Unique invoice numbers on sales (NULLs are allowed so old/partial rows coexist).
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_invoice_unique ON sales(invoice_no) WHERE invoice_no IS NOT NULL;

-- Unique purchase doc numbers.
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_docno_unique ON purchases(doc_no) WHERE doc_no IS NOT NULL;

-- Unique purchase order numbers.
CREATE UNIQUE INDEX IF NOT EXISTS idx_po_number_unique ON purchase_orders(po_number) WHERE po_number IS NOT NULL;

-- Unique warehouse document numbers (Fletë Hyrje / Fletë Dalje).
CREATE UNIQUE INDEX IF NOT EXISTS idx_wd_docno_unique ON warehouse_documents(doc_no) WHERE doc_no IS NOT NULL;

-- Double-post guard: a purchase order can only be received once. We track the
-- received state with a unique index on (ref_doc, reason) for purchase stock
-- movements keyed by the PO number, so a second "Kalo në stok" on the same PO
-- is rejected at the DB level even under race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sm_purchase_dedup
  ON stock_movements(ref_doc, reason)
  WHERE reason = 'Purchase' AND ref_doc IS NOT NULL;

-- Double-post guard for Fletë Hyrje tied to a PO (ref_doc = PO number).
CREATE UNIQUE INDEX IF NOT EXISTS idx_sm_fletehyrje_dedup
  ON stock_movements(ref_doc, reason)
  WHERE reason = 'Fletë Hyrje' AND ref_doc IS NOT NULL;
