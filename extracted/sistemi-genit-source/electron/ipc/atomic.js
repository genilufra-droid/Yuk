'use strict';
// ============================================================================
// atomic.js - Atomic main-process transactions for Sistemi Genit
// ----------------------------------------------------------------------------
// All stock-changing operations (sales, purchases, PO receiving, Fletë Hyrje,
// Fletë Dalje, returns, stock corrections, transfers, sale edit/cancel) are
// executed here inside a SINGLE better-sqlite3 transaction. The document, its
// line items, the stock movements, the warehouse_stock update, the payment
// record, the document_sequence reservation and the audit log all commit or
// roll back TOGETHER. No partial state can ever be written.
//
// Data model: operational records are written BOTH to the relational tables
// (sales, sale_items, stock_movements, warehouse_stock, ...) AND mirrored to
// kv_nodes paths so the existing Firebase-style renderer reads keep working.
// The relational tables are the source of truth for integrity; kv_nodes keeps
// the app's existing UI queries functional.
// ============================================================================

const crypto = require('crypto');

function pushId() {
  const t = Date.now().toString(36);
  const r = crypto.randomBytes(8).toString('hex');
  return (t + r).slice(0, 20);
}

function round2(n) { n = Number(n) || 0; return Math.round((n + Number.EPSILON) * 100) / 100; }

// ---------------------------------------------------------------------------
// Password hashing (scrypt). Kept in sync with database.js so atomic.js is
// self-contained for the auth:login / auth:hashPassword handlers.
// Format: scrypt$N$r$p$saltHex$hashHex  (self-describing, upgradeable).
// ---------------------------------------------------------------------------
const SCRYPT_N = 16384, SCRYPT_r = 8, SCRYPT_p = 1, SCRYPT_KEYLEN = 32;

function hashPassword(plain) {
  if (typeof plain !== 'string' || plain.length === 0) return null;
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p, maxmem: 128 * 1024 * 1024 });
  return 'scrypt$' + SCRYPT_N + '$' + SCRYPT_r + '$' + SCRYPT_p + '$' + salt.toString('hex') + '$' + hash.toString('hex');
}

function verifyPassword(plain, stored) {
  if (typeof plain !== 'string' || typeof stored !== 'string') return false;
  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length !== 6) return false;
    const N = parseInt(parts[1], 10), r = parseInt(parts[2], 10), p = parseInt(parts[3], 10);
    const salt = Buffer.from(parts[4], 'hex');
    const expected = Buffer.from(parts[5], 'hex');
    try {
      const hash = crypto.scryptSync(plain, salt, expected.length, { N, r, p, maxmem: 128 * 1024 * 1024 });
      if (hash.length !== expected.length) return false;
      return crypto.timingSafeEqual(hash, expected);
    } catch (e) { return false; }
  }
  return false;
}

function isHashedPassword(stored) {
  return typeof stored === 'string' && stored.startsWith('scrypt$');
}

// Convert a renderer item's entered/display qty into base-unit qty using the
// unit multiplier. Falls back to the explicit qty if no multiplier.
function baseQty(it) {
  if (Number(it.qty) != null && it.qty !== '') {
    const q = Number(it.qty);
    const mult = Number(it.unitMultiplier) || 1;
    return round2(q); // renderer already passes qty in base units; respect it
  }
  const entered = Number(it.displayQty || it.enteredQty || 0) || 0;
  const free = Number(it.freeDisplayQty || it.freeQty || 0) || 0;
  const mult = Number(it.unitMultiplier) || 1;
  return round2((entered + free) * mult);
}

function nowIso() { return new Date().toISOString(); }

// Register all atomic handlers on the given ipcMain + db instance.
function registerAtomicHandlers(ipcMain, db, logError) {

  // -------------------------------------------------------------------------
  // Internal helpers used inside transactions
  // -------------------------------------------------------------------------
  function insertStockMovement(m) {
    const id = pushId();
    db.raw().prepare(
      'INSERT INTO stock_movements (id, product_id, type, reason, qty, unit_cost, warehouse, ref_doc, note, created_by, created_at) ' +
      'VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    ).run(
      id,
      String(m.productId || ''),
      String(m.type || 'in'),
      String(m.reason || ''),
      Number(m.qty) || 0,
      Number(m.unitCost) || 0,
      String(m.warehouse || ''),
      String(m.reference || m.refDoc || ''),
      String(m.note || ''),
      String(m.createdBy || ''),
      String(m.createdAt || nowIso())
    );
    return id;
  }

  // Legacy databases may hold products only in kv_nodes (Firebase-style) and
  // never in the relational `products` table. warehouse_stock has a FOREIGN
  // KEY to products(id), so any stock op on such a product used to roll back
  // with "FOREIGN KEY constraint failed". Auto-create a minimal products row
  // so stock operations are self-healing.
  function ensureProductRow(productId, name) {
    const id = String(productId || '');
    if (!id) return;
    const ex = db.raw().prepare('SELECT id FROM products WHERE id = ?').get(id);
    if (!ex) {
      db.raw().prepare('INSERT INTO products (id, name, created_at, updated_at) VALUES (?,?,?,?)')
        .run(id, String(name || id), nowIso(), nowIso());
    }
  }

  // Upsert warehouse_stock for a product/warehouse pair.
  function adjustWarehouseStock(productId, warehouse, deltaQty) {
    ensureProductRow(productId);
    const wh = String(warehouse || 'Magazina Kryesore');
    const delta = Number(deltaQty) || 0;
    db.raw().prepare(
      'INSERT INTO warehouse_stock (warehouse_id, product_id, stock) VALUES (?, ?, ?) ' +
      'ON CONFLICT(warehouse_id, product_id) DO UPDATE SET stock = warehouse_stock.stock + ?'
    ).run(wh, String(productId || ''), delta, delta);
  }

  function setWarehouseStock(productId, warehouse, stock) {
    ensureProductRow(productId);
    const wh = String(warehouse || 'Magazina Kryesore');
    const s = Number(stock) || 0;
    db.raw().prepare(
      'INSERT INTO warehouse_stock (warehouse_id, product_id, stock) VALUES (?, ?, ?) ' +
      'ON CONFLICT(warehouse_id, product_id) DO UPDATE SET stock = ?'
    ).run(wh, String(productId || ''), s, s);
  }

  // Update products.stock (aggregate across warehouses) to the sum.
  function recomputeProductStock(productId) {
    const row = db.raw().prepare(
      'SELECT COALESCE(SUM(stock), 0) AS s FROM warehouse_stock WHERE product_id = ?'
    ).get(String(productId || ''));
    const total = Number(row && row.s) || 0;
    db.raw().prepare('UPDATE products SET stock = ? WHERE id = ?').run(total, String(productId || ''));
    return total;
  }

  // Mirror a sale/return/etc to kv_nodes so renderer's fbGetSales() works.
  function mirrorSaleToKv(saleId, payload) {
    try {
      db._writeRecursive('sales/' + saleId, payload);
    } catch (e) { /* non-fatal mirror */ }
  }

  function userName(user) {
    if (!user) return 'system';
    return user.name || user.email || 'system';
  }

  // =========================================================================
  // sale:commit - create a sale + items + stock-out + movements + payment +
  //                invoice number (reserved atomically) + audit log.
  // payload: { sale: {...}, user }
  // =========================================================================
  ipcMain.handle('sale:commit', (event, payload) => {
    try {
      const { sale, user } = payload || {};
      if (!sale) return { success: false, message: 'Të dhënat e shitjes mungojnë' };
      const items = Array.isArray(sale.items) ? sale.items : [];
      if (!items.length) return { success: false, message: 'Shitja nuk ka rreshta' };

      const result = db.atomic(() => {
        const saleId = pushId();
        const now = nowIso();
        // 1. Reserve the invoice number INSIDE this transaction.
        const prefix = db._settingsInvoicePrefix();
        const invoiceNo = db.nextDocNumber('sales', prefix, 5);
        const warehouseDocNo = 'FD-' + String(invoiceNo).replace(/[^0-9A-Z]/gi, '').slice(-6);

        // 2. Insert into relational sales table.
        db.raw().prepare(
          'INSERT INTO sales (id, invoice_no, doc_no, pos, client_id, client_name, subtotal, discount, tax, total, paid, payment_methods, status, warehouse, operator, created_at, updated_at) ' +
          'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
        ).run(
          saleId, invoiceNo, warehouseDocNo, String(sale.pos || ''),
          String(sale.clientId || sale.client_id || ''),
          String(sale.customerName || sale.client_name || ''),
          round2(sale.subtotal), round2(sale.discount), round2(sale.tax), round2(sale.total),
          round2(sale.paid != null ? sale.paid : sale.total),
          JSON.stringify(sale.paymentMethods || sale.payment_methods || null),
          String(sale.status || 'completed'),
          String(sale.warehouse || 'Magazina Kryesore'),
          userName(user), now, now
        );

        // 3. Insert sale_items + stock movements + warehouse_stock decrement.
        const insertedItems = [];
        for (const it of items) {
          const baseQ = baseQty(it);
          db.raw().prepare(
            'INSERT INTO sale_items (sale_id, product_id, name, sku, unit_name, qty, display_qty, free_qty, unit_price, line_net, line_tax, line_total, tax_rate) ' +
            'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
          ).run(
            saleId, String(it.productId || ''), String(it.name || ''), String(it.sku || ''),
            String(it.unitName || ''), baseQ, Number(it.displayQty) || 0, Number(it.freeQty) || 0,
            round2(it.unitPrice || it.price), round2(it.lineNet || 0), round2(it.lineTax || 0),
            round2(it.lineTotal || it.total), Number(it.taxRate) || 0
          );
          // Stock OUT movement.
          insertStockMovement({
            productId: it.productId, type: 'out', qty: baseQ,
            unitCost: Number(it.cost) || 0,
            warehouse: it.warehouse || sale.warehouse || 'Magazina Kryesore',
            reference: saleId, reason: 'Sale',
            note: 'Shitje ' + invoiceNo, createdBy: user && (user.email || user.name), createdAt: now
          });
          adjustWarehouseStock(it.productId, it.warehouse || sale.warehouse || 'Magazina Kryesore', -baseQ);
          recomputeProductStock(it.productId);
          insertedItems.push(Object.assign({}, it, { qty: baseQ }));
        }

        // 4. Payment record if present.
        if (sale.paymentMethod || sale.paid != null) {
          const payId = pushId();
          db.raw().prepare(
            'INSERT INTO payments (id, entity, ref_id, amount, method, note, created_at) VALUES (?,?,?,?,?,?,?)'
          ).run(payId, 'sale', saleId, round2(sale.paid != null ? sale.paid : sale.total), String(sale.paymentMethod || ''), 'Pagesë shitjeje ' + invoiceNo, now);
        }

        // 5. Audit log.
        db.logActivity('Sale', userName(user), invoiceNo + ' — Total ' + round2(sale.total) + ' (' + items.length + ' items)');

        // 6. Mirror to kv_nodes for renderer compatibility.
        const kvPayload = Object.assign({
          status: 'completed', invoiceNo, warehouseDocNo, cashier: userName(user), createdAt: now
        }, sale, { items: insertedItems });
        mirrorSaleToKv(saleId, kvPayload);

        return { id: saleId, invoiceNo, warehouseDocNo };
      });

      return { success: true, message: 'Shitja u ruajt', id: result.id, invoiceNo: result.invoiceNo, data: Object.assign({ id: result.id }, sale, { invoiceNo: result.invoiceNo }) };
    } catch (err) {
      logError('sale:commit', err);
      return { success: false, message: 'Shitja nuk u ruajt (rollback i plotë): ' + err.message };
    }
  });

  // =========================================================================
  // sale:update - edit a sale: reverse the old stock effect, then apply the
  //                new effect, all in one transaction. No double counting.
  // payload: { id, sale: newSale, user }
  // =========================================================================
  ipcMain.handle('sale:update', (event, payload) => {
    try {
      const { id, sale, user } = payload || {};
      if (!id) return { success: false, message: 'ID e shitjes mungon' };
      if (!sale) return { success: false, message: 'Të dhënat e shitjes mungojnë' };
      const now = nowIso();

      const result = db.atomic(() => {
        // 1. Read existing sale + items from the relational table.
        const existing = db.raw().prepare('SELECT * FROM sales WHERE id = ?').get(id);
        if (!existing) throw new Error('Shitja nuk u gjet');
        const oldItems = db.raw().prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(id);

        // 2. REVERSE old stock effect: add back the quantities.
        for (const it of oldItems) {
          insertStockMovement({
            productId: it.product_id, type: 'in', qty: it.qty,
            warehouse: existing.warehouse || 'Magazina Kryesore',
            reference: id, reason: 'Sale Reversal',
            note: 'Anulim editim shitje ' + existing.invoice_no,
            createdBy: user && (user.email || user.name), createdAt: now
          });
          adjustWarehouseStock(it.product_id, existing.warehouse || 'Magazina Kryesore', it.qty);
          recomputeProductStock(it.product_id);
        }

        // 3. Delete old sale_items.
        db.raw().prepare('DELETE FROM sale_items WHERE sale_id = ?').run(id);

        // 4. Update the sale header.
        db.raw().prepare(
          'UPDATE sales SET client_id=?, client_name=?, subtotal=?, discount=?, tax=?, total=?, paid=?, payment_methods=?, status=?, warehouse=?, updated_at=? WHERE id=?'
        ).run(
          String(sale.clientId || sale.client_id || ''),
          String(sale.customerName || sale.client_name || ''),
          round2(sale.subtotal), round2(sale.discount), round2(sale.tax), round2(sale.total),
          round2(sale.paid != null ? sale.paid : sale.total),
          JSON.stringify(sale.paymentMethods || sale.payment_methods || null),
          String(sale.status || existing.status || 'completed'),
          String(sale.warehouse || existing.warehouse || 'Magazina Kryesore'),
          now, id
        );

        // 5. Apply NEW stock effect with new items.
        const insertedItems = [];
        for (const it of (Array.isArray(sale.items) ? sale.items : [])) {
          const baseQ = baseQty(it);
          db.raw().prepare(
            'INSERT INTO sale_items (sale_id, product_id, name, sku, unit_name, qty, display_qty, free_qty, unit_price, line_net, line_tax, line_total, tax_rate) ' +
            'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
          ).run(
            id, String(it.productId || ''), String(it.name || ''), String(it.sku || ''),
            String(it.unitName || ''), baseQ, Number(it.displayQty) || 0, Number(it.freeQty) || 0,
            round2(it.unitPrice || it.price), round2(it.lineNet || 0), round2(it.lineTax || 0),
            round2(it.lineTotal || it.total), Number(it.taxRate) || 0
          );
          insertStockMovement({
            productId: it.productId, type: 'out', qty: baseQ,
            warehouse: it.warehouse || sale.warehouse || existing.warehouse || 'Magazina Kryesore',
            reference: id, reason: 'Sale',
            note: 'Editim shitje ' + existing.invoice_no, createdBy: user && (user.email || user.name), createdAt: now
          });
          adjustWarehouseStock(it.productId, it.warehouse || sale.warehouse || existing.warehouse || 'Magazina Kryesore', -baseQ);
          recomputeProductStock(it.productId);
          insertedItems.push(Object.assign({}, it, { qty: baseQ }));
        }

        db.logActivity('Update Sale', userName(user), existing.invoice_no);
        // Mirror updated sale to kv_nodes.
        const kvPayload = Object.assign({}, sale, { items: insertedItems, updatedAt: now, invoiceNo: existing.invoice_no });
        mirrorSaleToKv(id, kvPayload);
        return { id };
      });

      return { success: true, message: 'Shitja u përditësua', id: result.id };
    } catch (err) {
      logError('sale:update', err);
      return { success: false, message: 'Përditësimi i shitjes dështoi (rollback): ' + err.message };
    }
  });

  // =========================================================================
  // sale:cancel - cancel a sale and reverse its full stock effect.
  // payload: { id, user }
  // =========================================================================
  ipcMain.handle('sale:cancel', (event, payload) => {
    try {
      const { id, user } = payload || {};
      if (!id) return { success: false, message: 'ID e shitjes mungon' };
      const now = nowIso();

      db.atomic(() => {
        const existing = db.raw().prepare('SELECT * FROM sales WHERE id = ?').get(id);
        if (!existing) throw new Error('Shitja nuk u gjet');
        if (existing.status === 'cancelled') throw new Error('Shitja është anuluar tashmë');
        const oldItems = db.raw().prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(id);

        // Reverse stock effect for each line.
        for (const it of oldItems) {
          insertStockMovement({
            productId: it.product_id, type: 'in', qty: it.qty,
            warehouse: existing.warehouse || 'Magazina Kryesore',
            reference: id, reason: 'Sale Cancel',
            note: 'Anulim shitje ' + existing.invoice_no,
            createdBy: user && (user.email || user.name), createdAt: now
          });
          adjustWarehouseStock(it.product_id, existing.warehouse || 'Magazina Kryesore', it.qty);
          recomputeProductStock(it.product_id);
        }

        db.raw().prepare('UPDATE sales SET status=?, updated_at=? WHERE id=?').run('cancelled', now, id);
        db.logActivity('Cancel Sale', userName(user), existing.invoice_no);
        // Mirror status change to kv_nodes.
        const cur = db.readValue('sales/' + id) || {};
        cur.status = 'cancelled'; cur.updatedAt = now;
        try { db._writeRecursive('sales/' + id, cur); } catch (e) {}
      });

      return { success: true, message: 'Shitja u anulua dhe stoku u rikthye' };
    } catch (err) {
      logError('sale:cancel', err);
      return { success: false, message: 'Anulimi i shitjes dështoi (rollback): ' + err.message };
    }
  });

  // =========================================================================
  // purchase:post - post a purchase (supplier invoice) + items + stock-in +
  //                 movements + doc number, atomically.
  // payload: { purchase, user }
  // =========================================================================
  ipcMain.handle('purchase:post', (event, payload) => {
    try {
      const { purchase, user } = payload || {};
      if (!purchase) return { success: false, message: 'Të dhënat e blerjes mungojnë' };
      const items = Array.isArray(purchase.items) ? purchase.items : [];
      if (!items.length) return { success: false, message: 'Blerja nuk ka rreshta' };
      const now = nowIso();

      const result = db.atomic(() => {
        const purchaseId = pushId();
        const docNo = db.nextDocNumber('purchases', 'PUR-', 5);
        const warehouse = purchase.warehouse || 'Magazina Kryesore';

        db.raw().prepare(
          'INSERT INTO purchases (id, doc_no, supplier_id, supplier_name, subtotal, tax, total, warehouse, status, created_at) ' +
          'VALUES (?,?,?,?,?,?,?,?,?,?)'
        ).run(
          purchaseId, docNo,
          String(purchase.supplierId || purchase.supplier_id || ''),
          String(purchase.supplierName || purchase.supplier_name || ''),
          round2(purchase.subtotal), round2(purchase.tax), round2(purchase.total),
          warehouse, 'completed', now
        );

        for (const it of items) {
          const baseQ = baseQty(it);
          db.raw().prepare(
            'INSERT INTO purchase_items (purchase_id, product_id, name, unit_name, qty, unit_cost, line_total) ' +
            'VALUES (?,?,?,?,?,?,?)'
          ).run(
            purchaseId, String(it.productId || ''), String(it.name || ''), String(it.unitName || ''),
            baseQ, round2(it.unitCost || it.cost), round2(it.lineTotal || it.total)
          );
          insertStockMovement({
            productId: it.productId, type: 'in', qty: baseQ,
            unitCost: Number(it.unitCost || it.cost) || 0,
            warehouse, reference: docNo, reason: 'Purchase',
            note: 'Blerje ' + docNo, createdBy: user && (user.email || user.name), createdAt: now
          });
          adjustWarehouseStock(it.productId, warehouse, baseQ);
          recomputeProductStock(it.productId);
          // Optionally update product cost.
          if (purchase.updateCost && Number(it.unitCost || it.cost) > 0) {
            db.raw().prepare('UPDATE products SET cost = ? WHERE id = ?').run(round2(it.unitCost || it.cost), String(it.productId || ''));
          }
        }

        db.logActivity('Purchase', userName(user), docNo + ' — ' + (purchase.supplierName || '') + ' (' + round2(purchase.total) + ')');
        // Mirror to kv_nodes.
        const kvPayload = Object.assign({}, purchase, { id: purchaseId, docNo, status: 'completed', createdAt: now });
        try { db._writeRecursive('purchases/' + purchaseId, kvPayload); } catch (e) {}
        return { id: purchaseId, docNo };
      });

      return { success: true, message: 'Blerja u postua', id: result.id, docNo: result.docNo };
    } catch (err) {
      logError('purchase:post', err);
      return { success: false, message: 'Blerja nuk u postua (rollback): ' + err.message };
    }
  });

  // =========================================================================
  // purchaseOrder:receive - receive a PO into stock: creates Fletë Hyrje,
  //                       posts stock-in movements, updates PO status, all
  //                       atomically with a double-post guard.
  // payload: { po, user, updateCost, warehouse, receiptMeta }
  // =========================================================================
  ipcMain.handle('purchaseOrder:receive', (event, payload) => {
    try {
      const { po, user, updateCost, warehouse, receiptMeta } = payload || {};
      if (!po || !po.id) return { success: false, message: 'Porosia mungon' };
      const now = nowIso();
      const targetWarehouse = warehouse || po.warehouse || 'Magazina Kryesore';

      const result = db.atomic(() => {
        // --- Double-post guard (authoritative, inside the transaction) ---
        let cur = db.raw().prepare('SELECT status, po_number FROM purchase_orders WHERE id = ?').get(po.id);
        if (!cur) {
          // Legacy PO exists only in kv_nodes: create the relational header
          // inside this transaction so the receive can proceed (self-heal).
          db.raw().prepare(
            'INSERT INTO purchase_orders (id, po_number, supplier_id, supplier_name, status, total, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)'
          ).run(String(po.id), String(po.poNumber || ''), String(po.supplierId || ''), String(po.supplierName || ''),
            String(po.status || 'ordered'), Number(po.total || 0), String(po.createdBy || ''), String(po.createdAt || now));
          cur = { status: String(po.status || 'ordered'), po_number: String(po.poNumber || '') };
        }
        if (cur.status === 'received' || cur.status === 'cancelled') {
          throw new Error('Kjo porosi është marrë në stok tashmë (status: ' + cur.status + '). Postim i dyfishtë nuk lejohet.');
        }

        const items = Array.isArray(po.items) ? po.items : [];
        // Reserve a Fletë Hyrje number INSIDE this transaction.
        const fhDocNo = db.nextDocNumber('FH', 'FH-', 5);

        // Create the warehouse document (Fletë Hyrje) row.
        const docId = pushId();
        db.raw().prepare(
          'INSERT INTO warehouse_documents (id, doc_no, type, warehouse, counterparty, counterparty_id, reference_doc, reason, total, created_by, created_at) ' +
          'VALUES (?,?,?,?,?,?,?,?,?,?,?)'
        ).run(
          docId, fhDocNo, 'in', targetWarehouse,
          String(po.supplierName || ''), String(po.supplierId || ''),
          String(po.poNumber || cur.po_number || ''), 'Marrje porosie blerjeje',
          round2(po.total), userName(user), now
        );

        // Post stock-in movements + warehouse_stock for each line. The unique
        // index idx_sm_purchase_dedup (ref_doc='PO-xxxxx', reason='Purchase')
        // guarantees a second receive on the same PO is rejected at the DB
        // level even under a race.
        for (const it of items) {
          const baseQ = baseQty(it);
          // Fletë Hyrje movement keyed to the PO number (dedup-protected).
          insertStockMovement({
            productId: it.productId, type: 'in', qty: baseQ,
            unitCost: Number(it.unitCost || it.cost) || 0,
            warehouse: targetWarehouse, reference: po.poNumber || cur.po_number,
            reason: 'Fletë Hyrje', note: 'Marrje nga PO ' + (po.poNumber || cur.po_number),
            createdBy: user && (user.email || user.name), createdAt: now
          });
          // Also a 'Purchase' ledger entry for costing/reports (dedup on PO number).
          insertStockMovement({
            productId: it.productId, type: 'in', qty: baseQ,
            unitCost: Number(it.unitCost || it.cost) || 0,
            warehouse: targetWarehouse, reference: po.poNumber || cur.po_number,
            reason: 'Purchase', note: 'Blerje nga PO ' + (po.poNumber || cur.po_number),
            createdBy: user && (user.email || user.name), createdAt: now
          });
          adjustWarehouseStock(it.productId, targetWarehouse, baseQ);
          recomputeProductStock(it.productId);
          if (updateCost && Number(it.unitCost || it.cost) > 0) {
            db.raw().prepare('UPDATE products SET cost = ? WHERE id = ?').run(round2(it.unitCost || it.cost), String(it.productId || ''));
          }
        }

        // Mark the PO as received.
        db.raw().prepare(
          'UPDATE purchase_orders SET status=?, total=? WHERE id=?'
        ).run('received', round2(po.total), po.id);

        db.logActivity('Marrje porosie blerjeje', userName(user), (po.poNumber || cur.po_number) + ' (' + items.length + ' rreshta) → FH ' + fhDocNo);

        // Mirror receipt + PO status to kv_nodes.
        const receiptKv = {
          docNo: fhDocNo, type: 'in', supplierName: po.supplierName, supplierId: po.supplierId,
          warehouse: targetWarehouse, items: items, total: round2(po.total),
          poId: po.id, poNumber: po.poNumber || cur.po_number,
          createdAt: now, createdBy: user && (user.email || user.name)
        };
        try { db._writeRecursive('warehouse_receipts_in/' + docId, receiptKv); } catch (e) {}
        const poKv = db.readValue('purchase_orders/' + po.id) || {};
        poKv.status = 'received'; poKv.receivedAt = now; poKv.receivedWarehouse = targetWarehouse;
        poKv.warehouseReceiptId = docId; poKv.warehouseReceiptNo = fhDocNo;
        try { db._writeRecursive('purchase_orders/' + po.id, poKv); } catch (e) {}

        return { docId, fhDocNo };
      });

      return { success: true, message: 'Porosia u mor në stok — Fletë Hyrje ' + result.fhDocNo, id: result.docId, docNo: result.fhDocNo };
    } catch (err) {
      logError('purchaseOrder:receive', err);
      const msg = err && err.message ? err.message : String(err);
      // Surface the double-post guard message verbatim (it's user-friendly Albanian).
      if (msg.indexOf('Postim i dyfishtë') >= 0 || msg.indexOf('marrë në stok tashmë') >= 0) {
        return { success: false, message: msg };
      }
      return { success: false, message: 'Marrja e porosisë dështoi (rollback i plotë): ' + msg };
    }
  });

  // =========================================================================
  // warehouseDoc:save - Fletë Hyrje (in) / Fletë Dalje (out). Posts stock +
  //                     movements + doc number atomically.
  // payload: { doc: {type, items, ...}, user }
  // =========================================================================
  ipcMain.handle('warehouseDoc:save', (event, payload) => {
    try {
      const { doc, user } = payload || {};
      if (!doc) return { success: false, message: 'Dokumenti mungon' };
      const items = Array.isArray(doc.items) ? doc.items : [];
      if (!items.length) return { success: false, message: 'Dokumenti nuk ka rreshta' };
      const type = doc.type === 'out' ? 'out' : 'in';
      const seqName = type === 'in' ? 'FH' : 'FD';
      const prefix = type === 'in' ? 'FH-' : 'FD-';
      const now = nowIso();

      const result = db.atomic(() => {
        const docNo = db.nextDocNumber(seqName, prefix, 5);
        const docId = pushId();
        const warehouse = doc.warehouse || 'Magazina Kryesore';

        db.raw().prepare(
          'INSERT INTO warehouse_documents (id, doc_no, type, warehouse, counterparty, counterparty_id, destination, source_address, reference_doc, reason, authorized_person, vehicle, total, created_by, created_at) ' +
          'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
        ).run(
          docId, docNo, type, warehouse,
          String(doc.counterparty || doc.supplierName || doc.clientName || ''),
          String(doc.counterpartyId || ''),
          String(doc.destination || ''),
          String(doc.sourceAddress || ''),
          String(doc.referenceDoc || ''),
          String(doc.reason || ''),
          String(doc.authorizedPerson || ''),
          String(doc.vehicle || ''),
          round2(doc.total), userName(user), now
        );

        for (const it of items) {
          const baseQ = baseQty(it);
          db.raw().prepare(
            'INSERT INTO warehouse_document_items (document_id, product_id, name, unit_name, qty, price, value) ' +
            'VALUES (?,?,?,?,?,?,?)'
          ).run(docId, String(it.productId || ''), String(it.name || ''), String(it.unitName || ''), baseQ, round2(it.price || it.unitCost), round2(it.value || it.lineTotal));
          // stock movement: 'in' adds, 'out' removes
          const moveType = type === 'in' ? 'in' : 'out';
          const stockDelta = type === 'in' ? baseQ : -baseQ;
          insertStockMovement({
            productId: it.productId, type: moveType, qty: baseQ,
            unitCost: Number(it.price || it.unitCost) || 0,
            warehouse, reference: docNo,
            reason: type === 'in' ? 'Fletë Hyrje' : 'Fletë Dalje',
            note: (type === 'in' ? 'Fletë Hyrje ' : 'Fletë Dalje ') + docNo,
            createdBy: user && (user.email || user.name), createdAt: now
          });
          adjustWarehouseStock(it.productId, warehouse, stockDelta);
          recomputeProductStock(it.productId);
        }

        const label = type === 'in' ? 'Fletë Hyrje' : 'Fletë Dalje';
        db.logActivity(label, userName(user), docNo + ' (' + items.length + ' artikuj)');
        // Mirror to kv_nodes.
        const kvPath = type === 'in' ? 'warehouse_receipts_in' : 'warehouse_receipts_out';
        const kvPayload = Object.assign({}, doc, { id: docId, docNo, type, createdAt: now, createdBy: user && (user.email || user.name) });
        try { db._writeRecursive(kvPath + '/' + docId, kvPayload); } catch (e) {}
        return { id: docId, docNo };
      });

      return { success: true, message: (type === 'in' ? 'Fletë Hyrje' : 'Fletë Dalje') + ' u krijua', id: result.id, docNo: result.docNo };
    } catch (err) {
      logError('warehouseDoc:save', err);
      return { success: false, message: 'Dokumenti nuk u ruajt (rollback): ' + err.message };
    }
  });

  // =========================================================================
  // return:commit - process a return: credit stock back + movements + record.
  // payload: { saleId, items, user }
  // =========================================================================
  ipcMain.handle('return:commit', (event, payload) => {
    try {
      const { saleId, items, user } = payload || {};
      if (!saleId) return { success: false, message: 'ID e shitjes mungon' };
      const list = Array.isArray(items) ? items : [];
      if (!list.length) return { success: false, message: 'Kthimi nuk ka rreshta' };
      const now = nowIso();

      const result = db.atomic(() => {
        const totalRefund = list.reduce((s, it) => s + round2(it.lineTotal), 0);
        const returnId = pushId();

        // Mirror the return to kv_nodes 'returns' (renderer reads it).
        const returnKv = {
          saleId, items: list, totalRefund: round2(totalRefund),
          processedBy: user && (user.email || user.name), createdAt: now
        };
        try { db._writeRecursive('returns/' + returnId, returnKv); } catch (e) {}

        // Credit stock back for each item.
        for (const it of list) {
          const baseQ = baseQty(it);
          insertStockMovement({
            productId: it.productId, type: 'in', qty: baseQ,
            warehouse: it.warehouse || 'Magazina Kryesore',
            reference: saleId, reason: 'Return',
            note: 'Kthim për shitjen ' + saleId,
            createdBy: user && (user.email || user.name), createdAt: now
          });
          adjustWarehouseStock(it.productId, it.warehouse || 'Magazina Kryesore', baseQ);
          recomputeProductStock(it.productId);
        }

        db.logActivity('Return', userName(user), 'Refund ' + round2(totalRefund) + ' (' + list.length + ' items) for sale ' + saleId);
        return { id: returnId, totalRefund: round2(totalRefund) };
      });

      return { success: true, message: 'Kthimi u procesua', id: result.id, totalRefund: result.totalRefund };
    } catch (err) {
      logError('return:commit', err);
      return { success: false, message: 'Kthimi dështoi (rollback): ' + err.message };
    }
  });

  // =========================================================================
  // stock:correction - adjust stock to an absolute or delta value atomically.
  // payload: { productId, warehouse, newQty?, deltaQty?, reason, note, user }
  // =========================================================================
  ipcMain.handle('stock:correction', (event, payload) => {
    try {
      const { productId, warehouse, newQty, deltaQty, reason, note, user } = payload || {};
      if (!productId) return { success: false, message: 'Produkti mungon' };
      const now = nowIso();
      const wh = warehouse || 'Magazina Kryesore';

      const result = db.atomic(() => {
        const row = db.raw().prepare('SELECT stock FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?').get(wh, String(productId));
        const current = row ? Number(row.stock) : 0;
        let delta;
        if (newQty != null && newQty !== '') {
          delta = round2(Number(newQty)) - current;
        } else {
          delta = round2(Number(deltaQty) || 0);
        }
        if (delta === 0) return { changed: false, current };

        const moveType = delta > 0 ? 'in' : 'out';
        insertStockMovement({
          productId, type: moveType, qty: Math.abs(delta),
          warehouse: wh, reference: 'CORR-' + db.nextDocNumber('CORR', 'CORR-', 5),
          reason: reason || 'Correction',
          note: note || 'Korrigjim stoku', createdBy: user && (user.email || user.name), createdAt: now
        });
        adjustWarehouseStock(productId, wh, delta);
        const total = recomputeProductStock(productId);
        db.logActivity('Stock Correction', userName(user), 'Produkt ' + productId + ' Δ' + delta + ' (tani ' + total + ' bazë)');
        return { changed: true, delta: round2(delta), current: total };
      });

      return { success: true, message: 'Korrigjimi u aplikua', data: result };
    } catch (err) {
      logError('stock:correction', err);
      return { success: false, message: 'Korrigjimi dështoi (rollback): ' + err.message };
    }
  });

  // =========================================================================
  // stock:transfer - move stock from source to destination warehouse. Both
  //                  the OUT and IN legs happen in ONE transaction so stock
  //                  can never vanish or duplicate.
  // payload: { productId, sourceWarehouse, destWarehouse, qty, note, user }
  // =========================================================================
  ipcMain.handle('stock:transfer', (event, payload) => {
    try {
      const { productId, sourceWarehouse, destWarehouse, qty, note, user } = payload || {};
      if (!productId) return { success: false, message: 'Produkti mungon' };
      const qtyNum = Number(qty);
      if (!qtyNum || qtyNum <= 0) return { success: false, message: 'Sasia e pavlefshme' };
      const src = sourceWarehouse || 'Magazina Kryesore';
      const dest = destWarehouse || 'Depo 2';
      if (src === dest) return { success: false, message: 'Magazina burim dhe destinacion janë të njëjta' };
      const now = nowIso();

      const result = db.atomic(() => {
        // Verify source has enough stock.
        const row = db.raw().prepare('SELECT stock FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?').get(src, String(productId));
        const available = row ? Number(row.stock) : 0;
        if (available < qtyNum) throw new Error('Stok i pamjaftueshëm në magazinën burim (' + available + ' < ' + qtyNum + ')');

        const transferNo = 'TR-' + db.nextDocNumber('TR', 'TR-', 5);
        // OUT from source.
        insertStockMovement({
          productId, type: 'out', qty: qtyNum, warehouse: src,
          reference: transferNo, reason: 'Transfer Out',
          note: note || ('Transfer te ' + dest), createdBy: user && (user.email || user.name), createdAt: now
        });
        adjustWarehouseStock(productId, src, -qtyNum);
        // IN to destination.
        insertStockMovement({
          productId, type: 'in', qty: qtyNum, warehouse: dest,
          reference: transferNo, reason: 'Transfer In',
          note: note || ('Transfer nga ' + src), createdBy: user && (user.email || user.name), createdAt: now
        });
        adjustWarehouseStock(productId, dest, qtyNum);
        const total = recomputeProductStock(productId);
        db.logActivity('Stock Transfer', userName(user), 'Produkt ' + productId + ' ' + qtyNum + ' nga ' + src + ' te ' + dest);
        return { transferNo, total };
      });

      return { success: true, message: 'Transferi u krye', data: result };
    } catch (err) {
      logError('stock:transfer', err);
      return { success: false, message: 'Transferi dështoi (rollback): ' + err.message };
    }
  });

  // =========================================================================
  // stock:bulkIn - bulk stock-in (multiple lines) in one transaction.
  // payload: { lines, user }
  // =========================================================================
  ipcMain.handle('stock:bulkIn', (event, payload) => {
    try {
      const { lines, user } = payload || {};
      const list = Array.isArray(lines) ? lines : [];
      if (!list.length) return { success: false, message: 'Nuk ka rreshta hyrjeje' };
      const now = nowIso();

      db.atomic(() => {
        for (const l of list) {
          const baseQ = baseQty(l);
          insertStockMovement({
            productId: l.productId, type: 'in', qty: baseQ,
            unitCost: Number(l.unitCost) || 0,
            warehouse: l.warehouse || 'Magazina Kryesore',
            reference: l.reference || '', reason: l.reason || 'Stock In',
            note: l.notes || '', createdBy: user && (user.email || user.name), createdAt: now
          });
          adjustWarehouseStock(l.productId, l.warehouse || 'Magazina Kryesore', baseQ);
          recomputeProductStock(l.productId);
        }
        const ref = list[0] && list[0].reference ? ' (' + list[0].reference + ')' : '';
        db.logActivity('Hyrje stoku në masë', userName(user), list.length + ' artikuj u futën në stok' + ref);
      });

      return { success: true, message: 'Stoku u regjistrua (' + list.length + ' artikuj)' };
    } catch (err) {
      logError('stock:bulkIn', err);
      return { success: false, message: 'Hyrja në masë dështoi (rollback): ' + err.message };
    }
  });

  // =========================================================================
  // auth:login - verify credentials against hashed passwords, auto-upgrading
  //              any legacy plaintext user on first successful login.
  // payload: { email, password }
  // =========================================================================
  ipcMain.handle('auth:login', (event, payload) => {
    try {
      const { email, password } = payload || {};
      if (!email || !password) return { success: false, message: 'Email ose fjalëkalim i gabuar' };
      // Look up the user via the kv_nodes users tree (renderer model).
      const users = db.readValue('users') || {};
      const entry = Object.entries(users).find(([k, u]) => u && String(u.email || '').toLowerCase() === String(email).toLowerCase());
      if (!entry) return { success: false, message: 'Email ose fjalëkalim i gabuar' };
      const [id, user] = entry;

      if (user.active === false) return { success: false, message: 'Llogaria është çaktivizuar. Kontakto Admin-in.' };

      const stored = user.password;
      let ok = false;
      if (isHashedPassword(stored)) {
        ok = verifyPassword(password, stored);
      } else if (typeof stored === 'string' && stored.length > 0) {
        // Legacy plaintext: verify, then auto-upgrade to a hash.
        ok = (stored === password);
        if (ok) {
          try {
            db.atomic(() => { db.upgradeUserPasswordIfPlain(id, password); });
            logError && logError('auth:login', new Error('Auto-upgraded plaintext password to scrypt hash for user ' + id));
          } catch (e) {}
        }
      }
      if (!ok) return { success: false, message: 'Email ose fjalëkalim i gabuar' };
      return { success: true, data: { id, email: user.email, name: user.name, role: user.role || 'User', rights: user.rights || null } };
    } catch (err) {
      logError('auth:login', err);
      return { success: false, message: 'Gabim gjatë hyrjes: ' + err.message };
    }
  });

  // =========================================================================
  // auth:hashPassword - hash a password for storage (used by add/update user).
  // payload: { password }
  // =========================================================================
  ipcMain.handle('auth:hashPassword', (event, payload) => {
    try {
      const { password } = payload || {};
      if (typeof password !== 'string' || password.length < 4) return { success: false, message: 'Fjalëkalimi duhet të ketë të paktën 4 karaktere' };
      return { success: true, hash: hashPassword(password) };
    } catch (err) {
      logError('auth:hashPassword', err);
      return { success: false, message: err.message };
    }
  });

  // =========================================================================
  // system:injectFailure - TEST ONLY: forces a throw after partial writes
  //                        inside a transaction so tests can verify rollback.
  // payload: { op, ...args, failAfter: N }
  // =========================================================================
  ipcMain.handle('system:injectFailure', (event, payload) => {
    try {
      const { op, failAfter } = payload || {};
      const args = payload;
      const failAt = Number(failAfter) || 0;
      let written = 0;
      try {
        db.atomic(() => {
          if (op === 'sale') {
            const sale = args.sale || { items: [{ productId: 'p-test', qty: 1, name: 'Test' }], total: 10 };
            const items = sale.items;
            const saleId = pushId();
            for (const it of items) {
              insertStockMovement({ productId: it.productId, type: 'out', qty: Number(it.qty) || 1, reference: saleId, reason: 'Sale', warehouse: 'Magazina Kryesore', createdAt: nowIso() });
              adjustWarehouseStock(it.productId, 'Magazina Kryesore', -(Number(it.qty) || 1));
              written++;
              if (failAt > 0 && written >= failAt) throw new Error('INJECTED_FAILURE_AFTER_' + written);
            }
            db.raw().prepare('INSERT INTO sales (id, invoice_no, total, status, created_at) VALUES (?,?,?,?,?)').run(saleId, 'FAIL-TEST', round2(sale.total), 'completed', nowIso());
            written++;
            if (failAt > 0 && written >= failAt) throw new Error('INJECTED_FAILURE_AFTER_' + written);
            return { written };
          }
          throw new Error('Unknown inject op: ' + op);
        });
        return { success: true, message: 'No failure injected (failAfter not reached)', written };
      } catch (innerErr) {
        // The transaction rolled back. Return a structured result so the test
        // can assert nothing was committed.
        return { success: false, injected: true, message: innerErr.message, written };
      }
    } catch (err) {
      logError('system:injectFailure', err);
      return { success: false, message: err.message };
    }
  });

  // =========================================================================
  // db:debugCounts - returns row counts of relational tables for tests/reports.
  // =========================================================================
  ipcMain.handle('db:debugCounts', () => {
    try {
      const tables = ['sales', 'sale_items', 'purchases', 'purchase_items', 'purchase_orders', 'warehouse_documents', 'warehouse_document_items', 'stock_movements', 'warehouse_stock', 'payments', 'document_sequences', 'audit_logs'];
      const counts = {};
      for (const t of tables) {
        try { counts[t] = db.raw().prepare('SELECT COUNT(*) AS c FROM ' + t).get().c; } catch (e) { counts[t] = -1; }
      }
      return { success: true, counts };
    } catch (err) {
      logError('db:debugCounts', err);
      return { success: false, message: err.message };
    }
  });
}

module.exports = { registerAtomicHandlers, pushId, round2, hashPassword, verifyPassword };
