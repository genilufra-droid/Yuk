'use strict';
// ============================================================================
// passwords.js - single source of truth for password hashing (scrypt).
// Previously duplicated in database.js and ipc/atomic.js; extracted during
// the v1.1.1 security audit fixes.
// Format: "scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>" (self-describing, upgradeable)
// ============================================================================

const crypto = require('crypto');

const SCRYPT_N = 16384; // CPU/memory cost
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const SCRYPT_KEYLEN = 32;

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
    const N = parseInt(parts[1], 10);
    const r = parseInt(parts[2], 10);
    const p = parseInt(parts[3], 10);
    const salt = Buffer.from(parts[4], 'hex');
    const expected = Buffer.from(parts[5], 'hex');
    try {
      const hash = crypto.scryptSync(plain, salt, expected.length, { N, r, p, maxmem: 128 * 1024 * 1024 });
      if (hash.length !== expected.length) return false;
      return crypto.timingSafeEqual(hash, expected); // constant-time
    } catch (e) {
      return false;
    }
  }
  return false;
}

function isHashedPassword(stored) {
  return typeof stored === 'string' && stored.startsWith('scrypt$');
}

module.exports = { hashPassword, verifyPassword, isHashedPassword };
