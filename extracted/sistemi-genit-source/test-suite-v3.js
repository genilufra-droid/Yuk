'use strict';
// ============================================================================
// test-suite-v3.js — Comprehensive atomic-transaction test suite for Sistemi Genit
// ----------------------------------------------------------------------------
// Tests run WITHOUT the full Electron GUI. We instantiate the real
// SistemiGenitDatabase (better-sqlite3) against a TEMP database file, then
// register the atomic IPC handlers with a MOCK ipcMain that records each
// handler. We then invoke the handlers directly and assert on the relational
// tables + kv_nodes mirror.
//
// Coverage:
//   T1  Password hashing (scrypt) + verify + plaintext auto-upgrade
//   T2  sale:commit — sale + items + stock OUT + warehouse_stock + payment +
//        invoice sequence reserved atomically; kv_nodes mirror written
//   T3  sale:cancel — full stock reversal; status=cancelled; no orphan movements
//   T4  sale:update — old effect reversed, new applied; net stock correct
//   T5  purchase:post — stock IN + movements + doc sequence
//   T6  purchaseOrder:receive — stock IN + Fletë Hyrje doc + PO marked received
//   T7  purchaseOrder:receive DOUBLE-POST GUARD — second receive BLOCKED; stock
//        not double counted
//   T8  warehouseDoc:save Fletë Hyrje (in) — stock IN + movement
//   T9  warehouseDoc:save Fletë Dalje (out) — stock OUT + movement
//   T10 return:commit — stock credited back + return record
//   T11 stock:correction — absolute adjustment + movement
//   T12 stock:transfer — OUT source + IN dest in ONE transaction; net zero
//   T13 ROLLBACK INJECTION — simulate failure after N writes; verify NOTHING
//        committed (sales count unchanged, stock unchanged)
//   T14 document_sequence atomicity — two sales get sequential invoice numbers
//   T15 persistence — write, close db, reopen, read back
//   T16 relational tables actually populated (db:debugCounts)
//
// Exit code 0 = all pass, 1 = any failure.
// ============================================================================

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// ---- load the real database class ----
const { SistemiGenitDatabase } = require('./electron/database');
const { registerAtomicHandlers, hashPassword, verifyPassword } = require('./electron/ipc/atomic');

// ---- mock ipcMain ----
function makeMockIpcMain() {
  const handlers = {};
  return {
    handle(channel, fn) { handlers[channel] = fn; },
    removeHandler(channel) { delete handlers[channel]; },
    _invoke(channel, event, payload) {
      const fn = handlers[channel];
      if (!fn) return Promise.reject(new Error('No handler for ' + channel));
      return Promise.resolve(fn(event, payload));
    },
    _has(channel) { return typeof handlers[channel] === 'function'; }
  };
}

// ---- test harness ----
let db, ipc, PASS = 0, FAIL = 0;
const results = [];
function assert(cond, msg) {
  if (cond) { PASS++; results.push({ status: 'PASS', test: msg }); console.log('  [PASS] ' + msg); }
  else { FAIL++; results.push({ status: 'FAIL', test: msg }); console.log('  [FAIL] ' + msg); }
}
function assertEq(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { PASS++; results.push({ status: 'PASS', test: msg, value: actual }); console.log('  [PASS] ' + msg + ' => ' + JSON.stringify(actual)); }
  else { FAIL++; results.push({ status: 'FAIL', test: msg, expected: expected, actual: actual }); console.log('  [FAIL] ' + msg + ' expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual)); }
}
function assertClose(actual, expected, tol, msg) {
  const ok = Math.abs(Number(actual) - Number(expected)) <= tol;
  if (ok) { PASS++; results.push({ status: 'PASS', test: msg, value: actual }); console.log('  [PASS] ' + msg + ' => ' + actual + ' (≈' + expected + ')'); }
  else { FAIL++; results.push({ status: 'FAIL', test: msg, expected: expected, actual: actual }); console.log('  [FAIL] ' + msg + ' expected≈' + expected + ' actual=' + actual); }
}

// ---- helpers to seed test products ----
function seedProduct(id, name, stock, price) {
  db.raw().prepare(
    "INSERT INTO products (id, sku, name, cost, price, stock, unit, base_unit, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
  ).run(id, 'SKU-' + id, name, Number(price) * 0.6 || 5, Number(price) || 10, Number(stock) || 0, 'copë', 'copë', 1, new Date().toISOString(), new Date().toISOString());
  if (Number(stock) > 0) {
    db.raw().prepare(
      "INSERT INTO warehouse_stock (warehouse_id, product_id, stock) VALUES (?,?,?) ON CONFLICT(warehouse_id, product_id) DO UPDATE SET stock=?"
    ).run('Magazina Kryesore', id, Number(stock), Number(stock));
  }
}
function getStock(productId, warehouse) {
  const row = db.raw().prepare(
    "SELECT stock FROM warehouse_stock WHERE product_id=? AND warehouse_id=?"
  ).get(productId, warehouse || 'Magazina Kryesore');
  return row ? Number(row.stock) : 0;
}
function getProductStock(productId) {
  const row = db.raw().prepare("SELECT stock FROM products WHERE id=?").get(productId);
  return row ? Number(row.stock) : 0;
}
function countRows(table, where) {
  const sql = 'SELECT COUNT(*) AS c FROM ' + table + (where ? ' WHERE ' + where : '');
  return Number(db.raw().prepare(sql).get().c);
}

const errors = [];
function logError(ctx, err) { errors.push({ ctx: ctx, message: err && err.message ? err.message : String(err) }); }

// ---- invoke an IPC handler (await) ----
async function invoke(channel, payload) {
  return ipc._invoke(channel, {}, payload);
}

// ===========================================================================
async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  console.log('Test DB: ' + dbPath);
  db = new SistemiGenitDatabase(dbPath);
  ipc = makeMockIpcMain();
  registerAtomicHandlers(ipc, db, logError);

  // verify all handlers registered
  console.log('\n=== T0: Handler Registration ===');
  const expected = ['sale:commit','sale:update','sale:cancel','purchase:post','purchaseOrder:receive','warehouseDoc:save','return:commit','stock:correction','stock:transfer','stock:bulkIn','auth:login','auth:hashPassword','system:injectFailure','db:debugCounts'];
  for (const h of expected) assert(ipc._has(h), 'handler registered: ' + h);

  // =========================================================================
  console.log('\n=== T1: Password Hashing (scrypt) ===');
  {
    const plain = 'MySecret123!';
    const hashed = hashPassword(plain);
    assert(hashed && hashed.startsWith('scrypt$'), 'hash format starts with scrypt$');
    assert(hashed !== plain, 'hash differs from plaintext');
    assert(verifyPassword(plain, hashed) === true, 'verifyPassword accepts correct password');
    assert(verifyPassword('wrongpass', hashed) === false, 'verifyPassword rejects wrong password');
    // plaintext auto-upgrade via auth:login
    // Write the user to BOTH the relational users table and kv_nodes (the
    // handler reads from kv_nodes / db.readValue('users')).
    db.raw().prepare("INSERT INTO users (id, email, password, role, name, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)")
      .run('u1', 'admin@test.com', 'plaintextpw', 'Admin', 'Admin', 1, new Date().toISOString(), new Date().toISOString());
    db.set('users/u1', { email: 'admin@test.com', password: 'plaintextpw', role: 'Admin', name: 'Admin', active: true });
    const r1 = await invoke('auth:login', { email: 'admin@test.com', password: 'plaintextpw' });
    assert(r1 && r1.success === true, 'auth:login succeeds with plaintext (auto-upgrade path)');
    // verify the password is now hashed in kv_nodes (the handler reads/writes kv_nodes)
    const usersKv = db.readValue('users') || {};
    const upgradedUser = usersKv['u1'];
    assert(upgradedUser && typeof upgradedUser.password === 'string' && upgradedUser.password.startsWith('scrypt$'), 'plaintext password auto-upgraded to scrypt hash');
    assert(upgradedUser.password !== 'plaintextpw', 'plaintext no longer stored');
    // re-login with hashed password
    const r2 = await invoke('auth:login', { email: 'admin@test.com', password: 'plaintextpw' });
    assert(r2 && r2.success === true, 'auth:login succeeds after upgrade (hashed verify)');
    const r3 = await invoke('auth:login', { email: 'admin@test.com', password: 'WRONG' });
    assert(r3 && r3.success === false, 'auth:login rejects wrong password (hashed)');
    // auth:hashPassword
    const r4 = await invoke('auth:hashPassword', { password: 'newpass' });
    assert(r4 && r4.success === true && r4.hash.startsWith('scrypt$'), 'auth:hashPassword returns scrypt hash');
  }

  // =========================================================================
  console.log('\n=== T2: sale:commit (atomic) ===');
  {
    seedProduct('p1', 'Ujë 1L', 100, 40);
    const stockBefore = getStock('p1');
    const r = await invoke('sale:commit', {
      sale: {
        items: [{ productId: 'p1', name: 'Ujë 1L', qty: 5, unitPrice: 40, lineTotal: 200 }],
        subtotal: 200, tax: 0, total: 200, paid: 200, paymentMethod: 'cash',
        warehouse: 'Magazina Kryesore'
      },
      user: { email: 'admin@test.com', name: 'Admin' }
    });
    assert(r && r.success === true, 'sale:commit returns success');
    assert(r && r.invoiceNo, 'sale:commit reserved an invoice number');
    assertEq(countRows('sales', "status='completed'"), 1, 'one sale row in relational sales table');
    assertEq(countRows('sale_items'), 1, 'one sale_items row');
    assertEq(countRows('stock_movements', "reason='Sale'"), 1, 'one Sale stock movement');
    assertEq(countRows('payments'), 1, 'one payment row');
    assertClose(getStock('p1'), stockBefore - 5, 0.001, 'warehouse_stock decremented by 5 (100->95)');
    assertClose(getProductStock('p1'), stockBefore - 5, 0.001, 'products.stock recomputed (95)');
    assertEq(countRows('document_sequences', "name='sales'"), 1, 'document_sequences row created for sales');
    // kv_nodes mirror
    const kvSales = db.readValue('sales');
    assert(kvSales && Object.keys(kvSales).length >= 1, 'sale mirrored to kv_nodes (renderer compatibility)');
    // audit log
    assertEq(countRows('audit_logs', "action='Sale'"), 1, 'audit log entry created');
  }

  // =========================================================================
  console.log('\n=== T3: sale:cancel (atomic reversal) ===');
  {
    const stockBefore = getStock('p1'); // 95
    const salesBefore = countRows('sales', "status='completed'");
    const saleRows = db.raw().prepare("SELECT id FROM sales WHERE status='completed' LIMIT 1").all();
    const saleId = saleRows[0].id;
    const r = await invoke('sale:cancel', { id: saleId, user: { email: 'admin@test.com' } });
    assert(r && r.success === true, 'sale:cancel returns success');
    assertEq(countRows('sales', "status='cancelled'"), 1, 'sale status set to cancelled');
    assertEq(countRows('sales', "status='completed'"), salesBefore - 1, 'one fewer completed sale');
    assertClose(getStock('p1'), stockBefore + 5, 0.001, 'stock restored (+5 => 100) after cancel');
    // movements: original 'out' + reversal 'in'
    assert(countRows('stock_movements', "reason='Sale'") >= 1, 'original Sale movement exists');
  }

  // =========================================================================
  console.log('\n=== T4: sale:update (reversal + new effect) ===');
  {
    // create a fresh sale then update it
    seedProduct('p2', 'Bukë', 50, 25);
    const r0 = await invoke('sale:commit', {
      sale: { items: [{ productId: 'p2', name: 'Bukë', qty: 4, unitPrice: 25, lineTotal: 100 }], subtotal: 100, total: 100, paid: 100, paymentMethod: 'cash' },
      user: { email: 'admin@test.com' }
    });
    assert(r0.success, 'setup sale created for update test');
    const stockAfterFirst = getStock('p2'); // 46
    const sid = r0.id;
    // update: change qty from 4 to 10 (net effect +6 out)
    const r = await invoke('sale:update', {
      id: sid,
      sale: { items: [{ productId: 'p2', name: 'Bukë', qty: 10, unitPrice: 25, lineTotal: 250 }], subtotal: 250, total: 250, paid: 250, paymentMethod: 'cash' },
      user: { email: 'admin@test.com' }
    });
    assert(r && r.success === true, 'sale:update returns success');
    assertClose(getStock('p2'), 50 - 10, 0.001, 'stock = 40 after update (old 4 reversed, new 10 applied)');
    assertEq(countRows('sale_items', "sale_id='" + sid + "'"), 1, 'exactly one sale_items row after update (old deleted, new inserted)');
  }

  // =========================================================================
  console.log('\n=== T5: purchase:post (atomic stock IN) ===');
  {
    seedProduct('p3', 'Qumësht', 0, 60);
    const r = await invoke('purchase:post', {
      purchase: {
        docNo: 'BL-TEST1',
        supplierName: 'Distributor Alfa',
        items: [{ productId: 'p3', name: 'Qumësht', qty: 20, unitCost: 30, lineTotal: 600 }],
        subtotal: 600, total: 600, warehouse: 'Magazina Kryesore'
      },
      user: { email: 'admin@test.com' }
    });
    assert(r && r.success === true, 'purchase:post returns success');
    assertEq(countRows('purchases'), 1, 'one purchase row');
    assertEq(countRows('purchase_items'), 1, 'one purchase_items row');
    assertClose(getStock('p3'), 20, 0.001, 'stock IN: 0 -> 20');
    assertEq(countRows('stock_movements', "reason='Purchase'"), 1, 'one Purchase stock movement');
  }

  // =========================================================================
  console.log('\n=== T6: purchaseOrder:receive (atomic + Fletë Hyrje) ===');
  {
    // create a PO row directly
    const poId = 'po-test-1';
    db.raw().prepare(
      "INSERT INTO purchase_orders (id, po_number, supplier_id, supplier_name, status, total, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)"
    ).run(poId, 'PO-TEST1', 'sup1', 'Distributor Beta', 'ordered', 300, 'admin', new Date().toISOString());
    // mirror PO to kv_nodes
    db._writeRecursive('purchase_orders/' + poId, { id: poId, poNumber: 'PO-TEST1', supplierName: 'Distributor Beta', status: 'ordered', total: 300, items: [{ productId: 'p4', name: 'Kafe', qty: 15, unitCost: 20, lineTotal: 300 }] });
    seedProduct('p4', 'Kafe', 0, 80);
    const r = await invoke('purchaseOrder:receive', {
      po: { id: poId, poNumber: 'PO-TEST1', supplierName: 'Distributor Beta', supplierId: 'sup1', total: 300, items: [{ productId: 'p4', name: 'Kafe', qty: 15, unitCost: 20, lineTotal: 300 }] },
      user: { email: 'admin@test.com' },
      updateCost: true,
      warehouse: 'Magazina Kryesore'
    });
    assert(r && r.success === true, 'purchaseOrder:receive returns success');
    assert(r && r.docNo && r.docNo.startsWith('FH-'), 'Fletë Hyrje number generated (FH-...)');
    assertClose(getStock('p4'), 15, 0.001, 'stock IN: 0 -> 15 from PO receive');
    assertEq(countRows('warehouse_documents', "type='in'"), 1, 'one Fletë Hyrje warehouse document');
    const poRow = db.raw().prepare("SELECT status FROM purchase_orders WHERE id=?").get(poId);
    assertEq(poRow.status, 'received', 'PO status marked received');
    // cost update
    const prod = db.raw().prepare("SELECT cost FROM products WHERE id=?").get('p4');
    assertClose(prod.cost, 20, 0.001, 'product cost updated to 20 (updateCost=true)');
    assertEq(countRows('stock_movements', "reason='Fletë Hyrje'"), 1, 'Fletë Hyrje stock movement');
  }

  // =========================================================================
  console.log('\n=== T7: purchaseOrder:receive DOUBLE-POST GUARD ===');
  {
    // Try to receive the SAME PO again — must be BLOCKED
    const stockBefore = getStock('p4'); // 15
    const r = await invoke('purchaseOrder:receive', {
      po: { id: 'po-test-1', poNumber: 'PO-TEST1', supplierName: 'Distributor Beta', total: 300, items: [{ productId: 'p4', name: 'Kafe', qty: 15, unitCost: 20, lineTotal: 300 }] },
      user: { email: 'admin@test.com' }
    });
    assert(r && r.success === false, 'second receive of same PO is BLOCKED (returns success:false)');
    assert(r && r.message && (r.message.indexOf('dyfishtë') >= 0 || r.message.indexOf('marrë në stok') >= 0), 'double-post guard returns Albanian "already received" message');
    assertClose(getStock('p4'), stockBefore, 0.001, 'stock NOT double-counted (still 15)');
    assertEq(countRows('warehouse_documents', "type='in'"), 1, 'no second Fletë Hyrje created');
    assertEq(countRows('stock_movements', "reason='Fletë Hyrje'"), 1, 'no second Fletë Hyrje movement');
  }

  // =========================================================================
  console.log('\n=== T8: warehouseDoc:save Fletë Hyrje (IN) ===');
  {
    seedProduct('p5', 'Sheqer', 10, 30);
    const r = await invoke('warehouseDoc:save', {
      doc: { type: 'in', counterparty: 'Furnitor Gama', counterpartyId: 'sup2', items: [{ productId: 'p5', name: 'Sheqer', qty: 25, unitCost: 15, lineTotal: 375 }], total: 375, warehouse: 'Magazina Kryesore' },
      user: { email: 'admin@test.com' }
    });
    assert(r && r.success === true, 'warehouseDoc:save (Fletë Hyrje) returns success');
    assert(r && r.docNo && r.docNo.startsWith('FH-'), 'FH doc number generated');
    assertClose(getStock('p5'), 35, 0.001, 'stock IN: 10 -> 35');
  }

  // =========================================================================
  console.log('\n=== T9: warehouseDoc:save Fletë Dalje (OUT) ===');
  {
    const stockBefore = getStock('p5'); // 35
    const r = await invoke('warehouseDoc:save', {
      doc: { type: 'out', counterparty: 'Klient Delta', counterpartyId: 'cl1', items: [{ productId: 'p5', name: 'Sheqer', qty: 5, unitCost: 15, lineTotal: 75 }], total: 75, warehouse: 'Magazina Kryesore' },
      user: { email: 'admin@test.com' }
    });
    assert(r && r.success === true, 'warehouseDoc:save (Fletë Dalje) returns success');
    assert(r && r.docNo && r.docNo.startsWith('FD-'), 'FD doc number generated');
    assertClose(getStock('p5'), stockBefore - 5, 0.001, 'stock OUT: 35 -> 30');
    assertEq(countRows('warehouse_documents', "type='out'"), 1, 'one Fletë Dalje document');
  }

  // =========================================================================
  console.log('\n=== T10: return:commit (stock credit back) ===');
  {
    // first create a sale to return from
    seedProduct('p6', 'Leng', 30, 50);
    const s = await invoke('sale:commit', {
      sale: { items: [{ productId: 'p6', name: 'Leng', qty: 8, unitPrice: 50, lineTotal: 400 }], subtotal: 400, total: 400, paid: 400, paymentMethod: 'cash' },
      user: { email: 'admin@test.com' }
    });
    assert(s.success, 'setup sale for return test');
    const stockAfterSale = getStock('p6'); // 22
    const r = await invoke('return:commit', {
      saleId: s.id,
      items: [{ productId: 'p6', name: 'Leng', qty: 3, unitPrice: 50, lineTotal: 150 }],
      user: { email: 'admin@test.com' }
    });
    assert(r && r.success === true, 'return:commit returns success');
    assertClose(getStock('p6'), stockAfterSale + 3, 0.001, 'stock credited back (+3 => 25)');
  }

  // =========================================================================
  console.log('\n=== T11: stock:correction (absolute adjustment) ===');
  {
    seedProduct('p7', 'Vaj', 20, 90);
    const r = await invoke('stock:correction', {
      productId: 'p7', warehouse: 'Magazina Kryesore', newQty: 18, reason: 'Inventar', note: 'Count adjustment', user: { email: 'admin@test.com' }
    });
    assert(r && r.success === true, 'stock:correction returns success');
    assertClose(getStock('p7'), 18, 0.001, 'stock corrected to absolute 18 (was 20)');
    assertEq(countRows('stock_movements', "ref_doc LIKE 'CORR-%'"), 1, 'one Correction stock movement (ref_doc CORR-...)');
  }

  // =========================================================================
  console.log('\n=== T12: stock:transfer (OUT source + IN dest atomic) ===');
  {
    // need a second warehouse
    seedProduct('p8', 'Cikla', 40, 15);
    // ensure dest warehouse row exists
    db.raw().prepare("INSERT OR IGNORE INTO warehouses (id, name) VALUES (?,?)").run('Magazina Dytësore', 'Magazina Dytësore');
    const srcBefore = getStock('p8', 'Magazina Kryesore'); // 40
    const r = await invoke('stock:transfer', {
      productId: 'p8', sourceWarehouse: 'Magazina Kryesore', destWarehouse: 'Magazina Dytësore', qty: 10, note: 'Transfer test', user: { email: 'admin@test.com' }
    });
    assert(r && r.success === true, 'stock:transfer returns success');
    assertClose(getStock('p8', 'Magazina Kryesore'), srcBefore - 10, 0.001, 'source warehouse decremented (40->30)');
    assertClose(getStock('p8', 'Magazina Dytësore'), 10, 0.001, 'dest warehouse incremented (0->10)');
    // net stock across warehouses unchanged
    assertClose(getProductStock('p8'), 40, 0.001, 'total product stock unchanged (40)');
  }

  // =========================================================================
  console.log('\n=== T13: ROLLBACK INJECTION (failure halfway = full rollback) ===');
  {
    seedProduct('p9', 'Biskota', 200, 12);
    const stockBefore = getStock('p9');
    const salesBefore = countRows('sales');
    const movementsBefore = countRows('stock_movements');
    // inject failure after 1 write (movement done, then sale insert fails)
    const r = await invoke('system:injectFailure', {
      op: 'sale', failAfter: 1,
      sale: { items: [{ productId: 'p9', qty: 5, name: 'Biskota' }], total: 60 }
    });
    assert(r && r.injected === true, 'failure was injected (transaction threw)');
    assert(r && r.message && r.message.indexOf('INJECTED_FAILURE') >= 0, 'injected failure message present');
    assertEq(countRows('sales'), salesBefore, 'NO sale row committed after rollback');
    assertClose(getStock('p9'), stockBefore, 0.001, 'stock UNCHANGED after rollback (still 200)');
    assertEq(countRows('stock_movements'), movementsBefore, 'NO stock movement committed after rollback');
  }

  // =========================================================================
  console.log('\n=== T14: document_sequence atomicity (sequential invoice numbers) ===');
  {
    seedProduct('p10', 'Çokollatë', 500, 25);
    const r1 = await invoke('sale:commit', {
      sale: { items: [{ productId: 'p10', name: 'Çokollatë', qty: 1, unitPrice: 25, lineTotal: 25 }], subtotal: 25, total: 25, paid: 25, paymentMethod: 'cash' },
      user: { email: 'admin@test.com' }
    });
    const r2 = await invoke('sale:commit', {
      sale: { items: [{ productId: 'p10', name: 'Çokollatë', qty: 1, unitPrice: 25, lineTotal: 25 }], subtotal: 25, total: 25, paid: 25, paymentMethod: 'cash' },
      user: { email: 'admin@test.com' }
    });
    assert(r1.success && r2.success, 'both sequential sales succeed');
    assert(r1.invoiceNo !== r2.invoiceNo, 'two sales get DIFFERENT invoice numbers');
    // extract numeric parts and verify sequential
    const n1 = parseInt(String(r1.invoiceNo).replace(/[^0-9]/g, ''), 10);
    const n2 = parseInt(String(r2.invoiceNo).replace(/[^0-9]/g, ''), 10);
    assert(n2 === n1 + 1, 'invoice numbers are sequential (n2 = n1 + 1)');
  }

  // =========================================================================
  console.log('\n=== T15: Persistence (close + reopen) ===');
  {
    const beforeCounts = await invoke('db:debugCounts', {});
    const stockP10Before = getStock('p10');
    // close db
    db.close();
    // reopen
    db = new SistemiGenitDatabase(dbPath);
    // re-register handlers (simulating app restart)
    ipc = makeMockIpcMain();
    registerAtomicHandlers(ipc, db, logError);
    const afterCounts = await invoke('db:debugCounts', {});
    assertEq(afterCounts.counts, beforeCounts.counts, 'relational table counts identical after close/reopen');
    assertClose(getStock('p10'), stockP10Before, 0.001, 'stock persisted across close/reopen');
    // verify a sale still readable
    const salesCount = countRows('sales');
    assert(salesCount > 0, 'sales persisted after reopen');
    // verify kv_nodes mirror persisted
    const kvSales = db.readValue('sales');
    assert(kvSales && Object.keys(kvSales).length >= 1, 'kv_nodes sales mirror persisted');
  }

  // =========================================================================
  console.log('\n=== T16: Relational tables populated (db:debugCounts) ===');
  {
    const r = await invoke('db:debugCounts', {});
    assert(r && r.success === true, 'db:debugCounts returns success');
    assert(r.counts.sales > 0, 'sales table has rows (relational write confirmed)');
    assert(r.counts.sale_items > 0, 'sale_items table has rows');
    assert(r.counts.stock_movements > 0, 'stock_movements table has rows');
    assert(r.counts.warehouse_stock > 0, 'warehouse_stock table has rows');
    assert(r.counts.document_sequences > 0, 'document_sequences table has rows');
    assert(r.counts.audit_logs > 0, 'audit_logs table has rows');
    assert(r.counts.payments > 0, 'payments table has rows');
    console.log('    Relational counts: ' + JSON.stringify(r.counts));
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n========================================');
  console.log('  TEST SUMMARY: ' + PASS + ' PASS / ' + FAIL + ' FAIL');
  console.log('========================================');
  const summary = {
    timestamp: new Date().toISOString(),
    passed: PASS, failed: FAIL,
    total: PASS + FAIL,
    passRate: ((PASS / (PASS + FAIL)) * 100).toFixed(1) + '%',
    results: results,
    errors: errors
  };
  const outDir = path.join(__dirname, 'test-output');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'test-results-v3.json'), JSON.stringify(summary, null, 2));
  console.log('Report: ' + path.join(outDir, 'test-results-v3.json'));

  // cleanup
  try { db.close(); } catch (e) {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}

  process.exit(FAIL > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
