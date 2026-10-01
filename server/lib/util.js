// Drobne funkcje pomocnicze używane w kilku modułach.

export function isPlainObject(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Głęboka kopia zwykłych danych JSON (zdejmuje też Object.freeze). */
export function clone(v) {
  return structuredClone(v);
}

/**
 * Anonimizuje adres IP do celów antyspamowych (RODO: nie trzymamy pełnego adresu).
 * IPv4: trzy pierwsze oktety + ".x"; IPv6: cztery pierwsze grupy + ":x".
 */
export function anonymizeIp(ip) {
  if (!ip) return '';
  let s = String(ip).trim();
  if (s.startsWith('::ffff:')) s = s.slice(7);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return s.split('.').slice(0, 3).join('.') + '.x';
  if (s.includes(':')) return expandIpv6(s).slice(0, 4).join(':') + ':x';
  return 'x';
}

function expandIpv6(s) {
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  const [head, tail = ''] = s.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const fill = s.includes('::') ? new Array(Math.max(0, 8 - h.length - t.length)).fill('0') : [];
  return [...h, ...fill, ...t].map((g) => g || '0');
}

/** Data w lokalnej strefie serwera jako "YYYY-MM-DD" (strefę ustawia zmienna TZ). */
export function localDay(d = new Date()) {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Liczba całkowita z parametru zapytania, obcięta do [min, max]; brak/śmieci → fallback. */
export function clampInt(v, min, max, fallback) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
