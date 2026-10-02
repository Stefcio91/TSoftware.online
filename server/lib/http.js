// Pomocnicze funkcje HTTP: nagłówki bezpieczeństwa, odpowiedzi JSON/tekst z gzip,
// czytanie JSON z limitem, adres klienta za proxy, klasa HttpError.

import zlib from 'node:zlib';
import { isPlainObject } from './util.js';

/* Zewnętrzne hosty tylko dla narzędzi reklamowych/analitycznych, które i tak
   ładują się dopiero po zgodzie (assets/js/consent.js). */
export const CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net https://plausible.io; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://www.google.com https://www.google.pl https://*.g.doubleclick.net https://www.facebook.com; " +
  "font-src 'self'; " +
  "connect-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://*.g.doubleclick.net https://www.facebook.com https://plausible.io; " +
  "frame-src https://www.googletagmanager.com https://td.doubleclick.net; " +
  "frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

/** Błąd z kodem HTTP; wiadomość trafia do klienta (po polsku), więc bez szczegółów technicznych. */
export class HttpError extends Error {
  constructor(status, message, { field, headers } = {}) {
    super(message);
    this.status = status;
    this.field = field;
    this.headers = headers;
  }
}

export function securityHeaders(res, secure = false) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', CSP);
  if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

/**
 * Adres klienta. Przy TRUST_PROXY=N bierze N-ty adres od końca z X-Forwarded-For
 * (ten dopisany przez nasze proxy); bez zaufania – adres gniazda.
 */
export function clientIp(req, trustProxy = 0) {
  let ip = req.socket?.remoteAddress || '';
  if (trustProxy > 0) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) {
      const parts = String(xff).split(',').map((s) => s.trim()).filter(Boolean);
      if (parts.length) ip = parts[Math.max(0, parts.length - trustProxy)];
    }
  }
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

export function isSecure(req, trustProxy = 0) {
  if (req.socket?.encrypted) return true;
  if (trustProxy > 0) {
    const proto = req.headers['x-forwarded-proto'];
    if (proto) return String(proto).split(',')[0].trim().toLowerCase() === 'https';
  }
  return false;
}

export function acceptsGzip(req) {
  const ae = req.headers['accept-encoding'];
  return typeof ae === 'string' && /(^|,)\s*gzip\s*(;(?!\s*q=0(\.0+)?\s*(,|$))|,|$)/.test(ae);
}

export function isCompressible(type) {
  return /^(text\/|application\/(json|javascript|xml|manifest\+json)|image\/svg\+xml)/i.test(type);
}

/** Wysyła bufor/tekst; gzip dla typów tekstowych, gdy klient na to pozwala. Obsługuje HEAD. */
export function send(req, res, status, body, headers = {}) {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  const type = String(res.getHeader('content-type') || '');
  if (isCompressible(type)) {
    res.setHeader('Vary', 'Accept-Encoding');
    if (buf.length > 1024 && acceptsGzip(req)) {
      buf = zlib.gzipSync(buf);
      res.setHeader('Content-Encoding', 'gzip');
    }
  }
  res.setHeader('Content-Length', buf.length);
  res.statusCode = status;
  if (req.method === 'HEAD') return res.end();
  return res.end(buf);
}

export function sendJson(req, res, status, obj, headers = {}) {
  return send(req, res, status, JSON.stringify(obj), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
}

export function sendText(req, res, status, text, headers = {}) {
  return send(req, res, status, text, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
}

/** Czyta ciało żądania jako obiekt JSON. 415 bez application/json, 413 ponad limit, 400 zły JSON. */
export function readJson(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const ct = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (ct !== 'application/json') {
      reject(new HttpError(415, 'Wymagany Content-Type: application/json'));
      req.resume();
      return;
    }
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > maxBytes) {
      reject(new HttpError(413, `Zbyt duże żądanie (max ${Math.round(maxBytes / 1024)} KB)`));
      return;
    }
    const chunks = [];
    let size = 0;
    let done = false;
    const fail = (err) => {
      if (done) return;
      done = true;
      reject(err);
    };
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > maxBytes) {
        fail(new HttpError(413, `Zbyt duże żądanie (max ${Math.round(maxBytes / 1024)} KB)`));
        req.pause();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        const value = text.trim() ? JSON.parse(text) : {};
        if (!isPlainObject(value)) throw new Error('not an object');
        resolve(value);
      } catch {
        reject(new HttpError(400, 'Nieprawidłowy JSON (oczekiwano obiektu)'));
      }
    });
    req.on('error', () => fail(new HttpError(400, 'Błąd odczytu żądania')));
  });
}
