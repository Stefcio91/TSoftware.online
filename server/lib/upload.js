// Przesyłanie obrazków do DATA_DIR/uploads: dekodowanie base64 z limitem, sprawdzenie
// sygnatury pliku, wymiary z nagłówka (PNG/JPEG/WebP/GIF), odrzucanie SVG ze skryptami,
// bezpieczne nazwy plików (ASCII, bez ścieżek). Pliki serwuje /media/… (blog.js).

import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './http.js';
import { slugify } from './blog-templates.js';

export const IMAGE_TYPES = Object.freeze({
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
});
export const MAX_UPLOAD = 5 * 1024 * 1024;
export const MAX_OG = 3 * 1024 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Normalizuje typ: "png" / "image/png" → "image/png"; nieznany → null. */
export function normalizeType(type) {
  let t = String(type || '').trim().toLowerCase().split(';')[0];
  if (t === 'jpg' || t === 'image/jpg') t = 'image/jpeg';
  if (t === 'svg' || t === 'image/svg') t = 'image/svg+xml';
  if (t && !t.includes('/')) t = `image/${t}`;
  return Object.hasOwn(IMAGE_TYPES, t) ? t : null;
}

/** Dekoduje base64 (także data:…;base64,…) pilnując limitu PRZED alokacją bufora. */
export function decodeBase64(data, maxBytes, field = 'data') {
  if (typeof data !== 'string' || !data) throw new HttpError(400, 'Brak danych pliku (base64)', { field });
  let s = data;
  const comma = s.indexOf(',');
  if (s.startsWith('data:') && comma > 0) s = s.slice(comma + 1);
  s = s.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s) || s.length % 4 === 1) throw new HttpError(400, 'Nieprawidłowe dane base64', { field });
  const approx = Math.floor((s.length * 3) / 4);
  if (approx > maxBytes) throw new HttpError(413, `Plik jest za duży (max ${Math.round(maxBytes / 1024 / 1024)} MB)`, { field });
  const buf = Buffer.from(s, 'base64');
  if (!buf.length) throw new HttpError(400, 'Pusty plik', { field });
  if (buf.length > maxBytes) throw new HttpError(413, `Plik jest za duży (max ${Math.round(maxBytes / 1024 / 1024)} MB)`, { field });
  return buf;
}

export function isPng(buf) {
  return buf.length >= 8 && buf.subarray(0, 8).equals(PNG_MAGIC);
}

/** Czy zawartość pasuje do deklarowanego typu (sygnatura pliku). */
export function matchesType(buf, type) {
  switch (type) {
    case 'image/png':
      return isPng(buf);
    case 'image/jpeg':
      return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'image/gif':
      return buf.length >= 6 && (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a');
    case 'image/webp':
      return buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
    case 'image/svg+xml':
      return /<svg[\s>]/i.test(buf.subarray(0, 4096).toString('utf8'));
    default:
      return false;
  }
}

/** SVG z <script albo atrybutami on*= odrzucamy (serwujemy je z naszej domeny). */
export function svgUnsafe(buf) {
  const s = buf.toString('utf8');
  return /<script/i.test(s) || /\son\w+\s*=/i.test(s) || /javascript:/i.test(s) || /<foreignObject/i.test(s);
}

function jpegSize(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break;
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) break;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return { width: 0, height: 0 };
}

function webpSize(buf) {
  if (buf.length < 30) return { width: 0, height: 0 };
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ' && buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L' && buf[20] === 0x2f) {
    const b = buf.readUInt32LE(21);
    return { width: (b & 0x3fff) + 1, height: ((b >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  }
  return { width: 0, height: 0 };
}

/** Wymiary z nagłówka pliku; 0×0 gdy nieznane (SVG, uszkodzony nagłówek). */
export function imageSize(buf, type) {
  try {
    if (type === 'image/png' && buf.length >= 24) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (type === 'image/jpeg') return jpegSize(buf);
    if (type === 'image/gif' && buf.length >= 10) return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    if (type === 'image/webp') return webpSize(buf);
  } catch {
    /* uszkodzony nagłówek → 0×0 */
  }
  return { width: 0, height: 0 };
}

/** Nazwa pliku: slug z nazwy + 4 losowe znaki hex + rozszerzenie z typu (tylko ASCII). */
export function safeFileName(name, type) {
  const base = slugify(path.parse(String(name || '')).name).slice(0, 60) || 'obraz';
  return `${base}-${crypto.randomBytes(2).toString('hex')}${IMAGE_TYPES[type]}`;
}

/**
 * Zapisuje obrazek w uploadsDir/YYYY/MM/<nazwa>. Zwraca { url, file, width, height, size }.
 * Walidacja: znany typ, sygnatura zgodna z typem, SVG bez skryptów.
 */
export async function saveUpload({ uploadsDir, name, type, buf }) {
  const t = normalizeType(type);
  if (!t) throw new HttpError(400, 'Dozwolone typy: PNG, JPEG, WebP, GIF, SVG', { field: 'type' });
  if (!matchesType(buf, t)) throw new HttpError(400, 'Zawartość pliku nie pasuje do deklarowanego typu', { field: 'data' });
  if (t === 'image/svg+xml' && svgUnsafe(buf)) throw new HttpError(400, 'SVG zawiera skrypty lub zdarzenia – odrzucono', { field: 'data' });
  const d = new Date();
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dir = path.join(uploadsDir, yyyy, mm);
  await fsp.mkdir(dir, { recursive: true });
  let fileName = safeFileName(name, t);
  let file = path.join(dir, fileName);
  for (let i = 0; i < 5; i++) {
    try {
      await fsp.writeFile(file, buf, { flag: 'wx', mode: 0o644 });
      break;
    } catch (err) {
      if (err.code !== 'EEXIST' || i === 4) throw err;
      fileName = safeFileName(name, t);
      file = path.join(dir, fileName);
    }
  }
  const { width, height } = imageSize(buf, t);
  return { url: `/media/${yyyy}/${mm}/${fileName}`, file, width, height, size: buf.length, type: t };
}

/** Zapisuje obrazek OG (PNG) jako uploadsDir/og/<slug>.png (nadpisuje). Zwraca { url, file }. */
export async function saveOg({ uploadsDir, slug, buf }) {
  if (!isPng(buf)) throw new HttpError(400, 'Obrazek OG musi być plikiem PNG', { field: 'data' });
  const dir = path.join(uploadsDir, 'og');
  await fsp.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${slug}.png`);
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    await fsp.writeFile(tmp, buf, { mode: 0o644 });
    await fsp.rename(tmp, file);
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
  return { url: `/media/og/${slug}.png?v=${Date.now()}`, file };
}
