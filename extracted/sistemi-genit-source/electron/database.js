'use strict';
// ============================================================================
// database.js
// SQLite backend for Sistemi Genit that exposes a Firebase Realtime Database
// compatible API so the existing renderer code (db.ref(path).once/set/update/
// remove/push/transaction/orderByChild/equalTo/limitToLast) works unchanged.
//
// Storage model (Firebase-faithful):
//   - kv_nodes(path PRIMARY KEY, value_json, updated_at)
//   - Every LEAF node (primitive or array) is stored as one row at its path.
//   - Every OBJECT node is reconstructed from its children rows (path/key).
//     An empty object {} is stored as a marker row so existence checks work.
//   - This makes remove(path/child), push(path, item) and update(path, patch)
//     all work exactly like Firebase: each child is individually addressable.
//
// All stock-changing ops run inside SQLite transactions (better-sqlite3 is
// synchronous so partial failures are impossible inside a transaction).
// ============================================================================

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  Database = null;
  global.__SISTEMI_GENIT_SQLITE_LOAD_ERROR = e && e.message;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function deepClone(v) {
  if (v === undefined) return undefined;
  return JSON.parse(JSON.stringify(v));
}

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Generate a Firebase-like push id (20 chars).
function pushId() {
  const t = Date.now().toString(36);
  const r = crypto.randomBytes(8).toString('hex');
  return (t + r).slice(0, 20);
}

function partsOf(p) {
  return String(p || '').split('/').filter(Boolean);
}

// ---------------------------------------------------------------------------
// Secure password hashing using scrypt (Node built-in crypto, no external deps).
// Format: "scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>"
// We use scrypt (memory-hard) which is the Node-recommended KDF. The hash
// includes the parameters + salt so it is self-describing and upgradeable.
// ---------------------------------------------------------------------------
const { hashPassword, verifyPassword, isHashedPassword } = require('./passwords');

// ---------------------------------------------------------------------------
// SistemiGenitDatabase
// ---------------------------------------------------------------------------
class SistemiGenitDatabase {
  constructor(dbPath) {
    if (!Database) {
      const err = global.__SISTEMI_GENIT_SQLITE_LOAD_ERROR || 'better-sqlite3 nuk u ngarkua';
      throw new Error('Gabim me databazën: ' + err);
    }
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    // v1.4.0 performance: safe-with-WAL tuning for a desktop single-writer app
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -65536');           // ~64 MB page cache
    this.db.pragma('mmap_size = 268435456');         // 256 MB mmap
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('journal_size_limit = 67108864');
    this._applySchema();
    this._runMigrations();
    this._transactionDepth = 0;

    // prepared statements
    this.stGet = this.db.prepare('SELECT value_json FROM kv_nodes WHERE path = ?');
    this.stUpsert = this.db.prepare(
      'INSERT INTO kv_nodes (path, value_json, updated_at) VALUES (?, ?, datetime(\'now\')) ' +
      'ON CONFLICT(path) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime(\'now\')'
    );
    this.stDelete = this.db.prepare('DELETE FROM kv_nodes WHERE path = ?');
    this.stDeleteTree = this.db.prepare('DELETE FROM kv_nodes WHERE path = ? OR path LIKE ?');
    this.stChildren = this.db.prepare('SELECT path, value_json FROM kv_nodes WHERE path LIKE ? AND path NOT LIKE ?');
    this.stLog = this.db.prepare(
      'INSERT INTO audit_logs (action, user, detail, created_at) VALUES (?, ?, ?, ?)'
    );
  }

  // -------------------------------------------------------------------------
  // schema + migrations
  // -------------------------------------------------------------------------
  _applySchema() {
    const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
    let sql = '';
    try { sql = fs.readFileSync(schemaPath, 'utf8'); } catch (e) {}
    if (sql) this.db.exec(sql);
  }

  _runMigrations() {
    const migrationsDir = path.join(__dirname, '..', 'database', 'migrations');
    let files = [];
    try { files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort(); } catch (e) {}
    const applied = this.db.prepare('SELECT id FROM schema_migrations').all().map(r => r.id);
    for (const f of files) {
      const id = f.replace(/\.sql$/, '');
      if (applied.includes(id)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
      const tx = this.db.transaction(() => {
        this.db.exec(sql);
        this.db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(id);
      });
      tx();
    }
  }

  // -------------------------------------------------------------------------
  // transaction control
  // -------------------------------------------------------------------------
  begin() { this.db.exec('BEGIN'); this._transactionDepth++; }
  commit() { if (this._transactionDepth <= 0) return; this.db.exec('COMMIT'); this._transactionDepth--; }
  rollback() { if (this._transactionDepth <= 0) return; try { this.db.exec('ROLLBACK'); } catch (e) {} this._transactionDepth--; }
  inTransaction() { return this._transactionDepth > 0; }
  atomic(fn) { const tx = this.db.transaction(fn); return tx(); }

  // -------------------------------------------------------------------------
  // Core KV operations (recursive, Firebase-faithful)
  // -------------------------------------------------------------------------

  // Read the value at a path (reconstructing objects from children).
  readValue(p) {
    const arr = partsOf(p);
    if (arr.length === 0) {
      // root: build the whole tree from every row
      return this._assembleTree('');
    }
    // exact leaf row?
    const row = this.stGet.get(p);
    if (row) {
      if (row.value_json === null) return null;
      let v;
      try { v = JSON.parse(row.value_json); } catch (e) { return null; }
      if (v === '__EMPTY_OBJ__') return {};
      return deepClone(v);
    }
    // otherwise assemble the subtree rooted at p from all descendant rows
    return this._assembleTree(p);
  }

  // Build a nested object from all rows under `root` (recursive, any depth).
  _assembleTree(root) {
    const prefix = root === '' ? '' : (root + '/');
    let rows;
    if (root === '') {
      rows = this.db.prepare("SELECT path, value_json FROM kv_nodes").all();
    } else {
      rows = this.db.prepare("SELECT path, value_json FROM kv_nodes WHERE path LIKE ?").all(prefix + '%');
    }
    if (!rows.length) return null;
    const out = {};
    let touched = false;
    for (const r of rows) {
      if (r.value_json === null) continue;
      touched = true;
      let v;
      try { v = JSON.parse(r.value_json); } catch (e) { continue; }
      if (v === '__EMPTY_OBJ__') v = {};
      const rel = r.path.slice(prefix.length);
      if (rel === '') { Object.assign(out, v); continue; }
      const segs = rel.split('/');
      let cur = out;
      for (let i = 0; i < segs.length - 1; i++) {
        if (cur[segs[i]] == null || typeof cur[segs[i]] !== 'object') cur[segs[i]] = {};
        cur = cur[segs[i]];
      }
      cur[segs[segs.length - 1]] = v;
    }
    return touched ? out : null;
  }

  // Recursively write a value at a path. Objects are split into child rows.
  _writeRecursive(p, value) {
    if (value === null || value === undefined) {
      this.stDeleteTree.run(p, p + '/%');
      return;
    }
    if (isObj(value)) {
      const keys = Object.keys(value);
      if (keys.length === 0) {
        // empty object marker + remove any stale children
        this.stDeleteTree.run(p + '/%', p + '/%/%');
        this.stDeleteTree.run(p, p + '/%'); // remove leaf marker if any
        this.stUpsert.run(p, JSON.stringify('__EMPTY_OBJ__'));
        return;
      }
      // remove a stale leaf marker at p (it's now an object with children)
      this.stDelete.run(p);
      for (const k of keys) this._writeRecursive(p + '/' + k, value[k]);
      return;
    }
    // primitive or array -> leaf row; remove any children
    this.stDeleteTree.run(p + '/%', p + '/%/%');
    this.stUpsert.run(p, JSON.stringify(value));
  }

  // set: replace the value at path entirely (Firebase semantics).
  set(p, value) {
    this._writeRecursive(p, value);
  }

  // update: shallow merge. Each key in `value` replaces that child entirely.
  update(p, value) {
    if (value === null || value === undefined) return;
    if (!isObj(value)) {
      this._writeRecursive(p, value);
      return;
    }
    for (const k of Object.keys(value)) {
      this._writeRecursive(p + '/' + k, value[k]);
    }
  }

  // push: generate id, write child, return key.
  push(p, value) {
    const id = pushId();
    const childPath = p ? p + '/' + id : id;
    this._writeRecursive(childPath, value === undefined ? null : value);
    return id;
  }

  remove(p) { this._writeRecursive(p, null); }

  // transaction semantics (read-modify-write)
  transaction(p, updateFn) {
    const current = this.readValue(p);
    let next;
    const tx = this.db.transaction(() => {
      next = updateFn(deepClone(current));
      this.set(p, next);
    });
    tx();
    return { committed: true, value: deepClone(next === undefined ? current : next) };
  }

  // query helpers (orderByChild / equalTo / limitToLast)
  query(path, state) {
    let val = this.readValue(path);
    if (val === null || val === undefined) return null;
    if (isObj(val)) {
      let entries = Object.keys(val).map(k => Object.assign({ __key: k }, val[k]));
      if (state.orderByChild) {
        entries.sort((a, b) => {
          const av = a[state.orderByChild], bv = b[state.orderByChild];
          if (av == null && bv == null) return 0;
          if (av == null) return -1;
          if (bv == null) return 1;
          if (typeof av === 'number' && typeof bv === 'number') return av - bv;
          return String(av).localeCompare(String(bv));
        });
      }
      if (state.equalTo != null) {
        entries = entries.filter(e => e[state.orderByChild] === state.equalTo);
      }
      if (state.limitToLast && state.limitToLast > 0) {
        entries = entries.slice(-state.limitToLast);
      }
      const out = {};
      entries.forEach(e => { const k = e.__key; delete e.__key; out[k] = e; });
      return out;
    }
    return val;
  }

  // audit log
  logActivity(action, user, detail) {
    try { this.stLog.run(action || '', user || '', detail || '', new Date().toISOString()); } catch (e) {}
  }

  // -------------------------------------------------------------------------
  // Secure password helpers (scrypt). Exposed for use by IPC auth handlers.
  // -------------------------------------------------------------------------
  hashPassword(plain) { return hashPassword(plain); }
  verifyPassword(plain, stored) { return verifyPassword(plain, stored); }
  isHashedPassword(stored) { return isHashedPassword(stored); }

  // Auto-upgrade a plaintext user row to a hashed password. Returns true if
  // upgraded (so callers can re-read). Safe no-op if already hashed.
  upgradeUserPasswordIfPlain(userId, plain) {
    try {
      // operate on kv_nodes users/<id>/password (the Firebase-style path the
      // renderer reads), keeping the data model consistent.
      const pwdPath = 'users/' + userId + '/password';
      const row = this.stGet.get(pwdPath);
      let current = null;
      if (row && row.value_json) { try { current = JSON.parse(row.value_json); } catch (e) {} }
      if (isHashedPassword(current)) return false; // already hashed
      // current holds plaintext (or null). Only hash if it matches the login
      // attempt, which the caller guarantees by passing the verified plain.
      const hashed = hashPassword(plain);
      this.stUpsert.run(pwdPath, JSON.stringify(hashed));
      return true;
    } catch (e) { return false; }
  }

  // -------------------------------------------------------------------------
  // Document sequence generation (atomic, inside a transaction).
  // MUST be called while a better-sqlite3 transaction is active so the number
  // reservation and the document creation commit/rollback together.
  // Returns the formatted document number, e.g. "INV-00001".
  // -------------------------------------------------------------------------
  nextDocNumber(name, prefix, padLen) {
    const pad = padLen || 5;
    // INSERT ... ON CONFLICT DO UPDATE ensures the counter row exists and is
    // incremented atomically within the current transaction. Two concurrent
    // reservations are serialized by SQLite's row lock, so duplicate numbers
    // are impossible.
    const stmt = this.db.prepare(
      'INSERT INTO document_sequences (name, last_value, prefix) VALUES (?, 1, ?) ' +
      'ON CONFLICT(name) DO UPDATE SET last_value = last_value + 1'
    );
    stmt.run(name, prefix || '');
    const row = this.db.prepare('SELECT last_value, prefix FROM document_sequences WHERE name = ?').get(name);
    const n = row ? Number(row.last_value) : 1;
    const usePrefix = prefix != null ? prefix : (row && row.prefix ? row.prefix : '');
    return (usePrefix || '') + String(n).padStart(pad, '0');
  }

  // Resolve prefix from settings.invoicePrefix (stored as a kv node) when the
  // caller does not pass an explicit prefix. Used by sale:commit.
  _settingsInvoicePrefix() {
    try {
      const row = this.stGet.get('settings/invoicePrefix');
      if (row && row.value_json) { const v = JSON.parse(row.value_json); if (typeof v === 'string' && v) return v; }
    } catch (e) {}
    return 'INV-';
  }

  close() { try { this.db.close(); } catch (e) {} }

  // Backup: checkpoint WAL into the main DB, then copy the file.
  backupTo(destPath) {
    // merge WAL into main db file
    try { this.db.pragma('wal_checkpoint(TRUNCATE)'); } catch (e) {}
    fs.copyFileSync(this.dbPath, destPath);
    return true;
  }

  raw() { return this.db; }
}

module.exports = { SistemiGenitDatabase, pushId };
