// Serwowanie plików statycznych z STATIC_DIR (katalog repozytorium):
// "/" → index.html, katalog → index.html, MIME, Cache-Control, ETag, gzip, HEAD.
// Zabronione: "..", pliki/katalogi z kropką, server/, deploy/, scripts/, node_modules/.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream';
import { HttpError, acceptsGzip, isCompressible } from './http.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
};

const DENY_TOP = new Set(['server', 'deploy', 'scripts', 'node_modules']);

function cacheControl(urlPath, ext) {
  if (urlPath.startsWith('/assets/dl/')) return 'public, max-age=3600';
  if (urlPath.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
  if (ext === '.html' || ext === '.htm') return 'no-cache';
  return 'public, max-age=3600';
}

export function createStaticHandler({ staticDir, log = console }) {
  const root = path.resolve(staticDir);
  const notFound = () => new HttpError(404, 'Nie znaleziono');

  return async function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      throw new HttpError(405, 'Niedozwolona metoda', { headers: { Allow: 'GET, HEAD' } });
    }

    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      throw notFound();
    }
    if (decoded.includes('\0')) throw notFound();

    // normalize usuwa "/../"; dodatkowo odrzucamy wszystko, co zaczyna się od kropki.
    const normalized = path.posix.normalize(decoded);
    const segments = normalized.split('/').filter(Boolean);
    if (segments.some((s) => s === '..' || s.startsWith('.'))) throw notFound();
    if (segments.length && DENY_TOP.has(segments[0].toLowerCase())) throw notFound();

    let filePath = path.join(root, ...segments);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) throw notFound();

    let stat;
    try {
      stat = await fsp.stat(filePath);
    } catch {
      throw notFound();
    }

    if (stat.isDirectory()) {
      if (!normalized.endsWith('/')) {
        // /admin → /admin/ (żeby względne ścieżki w admin/index.html działały)
        res.statusCode = 301;
        res.setHeader('Location', encodeURI(normalized) + '/');
        res.setHeader('Cache-Control', 'no-cache');
        return res.end();
      }
      filePath = path.join(filePath, 'index.html');
      try {
        stat = await fsp.stat(filePath);
      } catch {
        throw notFound();
      }
    }
    if (!stat.isFile()) throw notFound();

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const urlPath = '/' + segments.join('/');
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;

    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', cacheControl(urlPath, ext));
    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', stat.mtime.toUTCString());
    if (isCompressible(type)) res.setHeader('Vary', 'Accept-Encoding');

    if (req.headers['if-none-match'] === etag) {
      res.statusCode = 304;
      return res.end();
    }

    const gzip = isCompressible(type) && stat.size > 1024 && acceptsGzip(req);
    res.statusCode = 200;
    if (gzip) res.setHeader('Content-Encoding', 'gzip');
    else res.setHeader('Content-Length', stat.size);
    if (req.method === 'HEAD') return res.end();

    const onDone = (err) => {
      if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
        log.error(`[static] ${urlPath}: ${err.message}`);
        res.destroy();
      }
    };
    const file = fs.createReadStream(filePath);
    if (gzip) pipeline(file, zlib.createGzip(), res, onDone);
    else pipeline(file, res, onDone);
    return undefined;
  };
}
