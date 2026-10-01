// Logowanie do panelu: porównanie hasła (stałoczasowe), hash scrypt,
// podpisany token sesji w ciasteczku `ts_admin`.

import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

export const COOKIE_NAME = 'ts_admin';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SCRYPT_KEYLEN = 64;

/** Zwraca hash w formacie `scrypt$<saltb64>$<hashb64>` (do ADMIN_PASSWORD_HASH). */
export function hashPassword(password) {
  if (typeof password !== 'string' || !password) throw new Error('Puste hasło');
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

function parseHash(hash) {
  const parts = String(hash).split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return null;
  try {
    const salt = Buffer.from(parts[1], 'base64');
    const key = Buffer.from(parts[2], 'base64');
    if (salt.length < 8 || key.length < 16) return null;
    return { salt, key };
  } catch {
    return null;
  }
}

/**
 * Sprawdza hasło: najpierw ADMIN_PASSWORD_HASH (scrypt), potem ADMIN_PASSWORD.
 * Porównania przez timingSafeEqual (dla czystego hasła – na skrótach SHA-256,
 * żeby długości były równe).
 */
export async function verifyPassword(input, { password = '', hash = '' } = {}) {
  if (typeof input !== 'string' || input.length === 0 || input.length > 1024) return false;
  if (hash) {
    const parsed = parseHash(hash);
    if (!parsed) return false;
    const derived = await scrypt(input, parsed.salt, parsed.key.length);
    return crypto.timingSafeEqual(derived, parsed.key);
  }
  if (password) {
    const a = crypto.createHash('sha256').update(input, 'utf8').digest();
    const b = crypto.createHash('sha256').update(password, 'utf8').digest();
    return crypto.timingSafeEqual(a, b);
  }
  return false;
}

function sign(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

/** Token = base64url(exp w ms) + "." + HMAC-SHA256(secret). */
export function createSessionToken(secret, exp = Date.now() + SESSION_TTL_MS) {
  const payload = Buffer.from(String(exp), 'utf8').toString('base64url');
  return `${payload}.${sign(secret, payload)}`;
}

/** Zwraca `exp` (ms) dla ważnego tokenu albo null. */
export function verifySessionToken(secret, token) {
  if (typeof token !== 'string' || token.length > 512) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = Buffer.from(token.slice(dot + 1), 'utf8');
  const expected = Buffer.from(sign(secret, payload), 'utf8');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) return null;
  const exp = Number(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!Number.isFinite(exp) || exp <= Date.now()) return null;
  return exp;
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    let value = part.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export function serializeCookie(name, value, { maxAge, secure = false } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
  if (typeof maxAge === 'number') parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
