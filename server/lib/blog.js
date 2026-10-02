// Publiczne strony bloga renderowane na serwerze (szablony: blog-templates.js):
// /blog/, /blog/strona/N/, /blog/kategoria/<slug>/, /blog/tag/<slug>/, /blog/<slug>/,
// /blog/feed.xml, /sitemap.xml, /llms.txt oraz pliki z DATA_DIR/uploads pod /media/….
// Handler zwraca true, gdy obsłużył żądanie; w przeciwnym razie serwer idzie do plików statycznych.

import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream';
import { HttpError, CSP, send, acceptsGzip, isCompressible } from './http.js';
import { MIME } from './static.js';
import { sessionFromRequest } from './auth.js';
import { renderBlogIndex, renderPost, renderNotFound, renderFeed, slugify, esc, postUrl } from './blog-templates.js';
import { SLUG_RE } from './posts.js';

export const PER_PAGE = 9;
const FEED_ITEMS = 20;
const LLMS_ITEMS = 50;
const PAGE_RE = /^[1-9][0-9]{0,5}$/;
/* Strony bloga osadzają YouTube (youtube-nocookie) i mogą mieć okładki z https://. */
const BLOG_CSP = CSP.replace('frame-src ', 'frame-src https://www.youtube-nocookie.com ').replace("img-src 'self' data: ", "img-src 'self' data: https: ");
const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";

function etagOf(body) {
  return `W/"${crypto.createHash('sha1').update(body).digest('base64url').slice(0, 20)}"`;
}

export function createBlogHandler({ config, store, posts, secret, log = console }) {
  const uploadsRoot = path.resolve(posts.uploadsDir);
  const staticRoot = path.resolve(config.staticDir);

  const site = () => ({
    url: String(config.publicUrl || 'https://tsoftware.online').replace(/\/+$/, ''),
    name: 'TSoftware',
    author: 'Tomasz Stachowiak',
    description: 'Konkretnie o automatyzacji, AI i nudnej robocie w firmach.',
    contact: store.settings.contact,
  });

  /** HTML z ETag/304; strony są dynamiczne (odsłony, szkice dla admina), więc tylko rewalidacja. */
  function html(req, res, status, body, headers = {}) {
    const etag = etagOf(body);
    res.setHeader('Content-Security-Policy', BLOG_CSP);
    const h = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ETag: etag, ...headers };
    if (status === 200 && req.headers['if-none-match'] === etag) {
      for (const [k, v] of Object.entries(h)) res.setHeader(k, v);
      res.statusCode = 304;
      return res.end();
    }
    return send(req, res, status, body, h);
  }

  function notFound(req, res) {
    return html(req, res, 404, renderNotFound({ site: site() }));
  }

  function redirect(res, location) {
    res.statusCode = 301;
    res.setHeader('Location', location);
    res.setHeader('Cache-Control', 'no-cache');
    res.end();
  }

  function isAdmin(req) {
    return Boolean(sessionFromRequest(req, secret));
  }

  // ---------- lista ----------

  function index(req, res, { page = 1, category = null, tag = null } = {}) {
    const published = posts.published();
    let list = published;
    let featured = null;
    if (category) list = list.filter((p) => p.categorySlug === category.slug);
    else if (tag) list = list.filter((p) => (p.tags || []).some((t) => slugify(t) === slugify(tag)));
    else {
      featured = published.find((p) => p.featured) || null;
      if (featured) list = list.filter((p) => p.id !== featured.id);
    }
    const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    if (page > pages) return notFound(req, res);
    const ctx = {
      site: site(),
      posts: list.slice((page - 1) * PER_PAGE, page * PER_PAGE),
      page,
      pages,
      categories: posts.categories(),
      category,
      tag,
      featured: page === 1 ? featured : null,
      total: category || tag ? list.length : published.length,
    };
    return html(req, res, 200, renderBlogIndex(ctx));
  }

  // ---------- wpis ----------

  function post(req, res, slug) {
    const admin = isAdmin(req);
    const item = posts.getPostBySlug(slug, { publishedOnly: !admin });
    if (!item) return notFound(req, res);
    const published = posts.published();
    const others = published.filter((p) => p.id !== item.id);

    const tags = new Set((item.tags || []).map((t) => slugify(t)));
    const related = others
      .map((p) => {
        let score = p.categorySlug === item.categorySlug ? 2 : 0;
        for (const t of p.tags || []) if (tags.has(slugify(t))) score++;
        return { p, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || (a.p.publishedAt < b.p.publishedAt ? 1 : a.p.publishedAt > b.p.publishedAt ? -1 : 0))
      .slice(0, 3)
      .map((r) => r.p);
    // Brak wspólnych tagów/kategorii (np. świeży blog) -> dopełnij najnowszymi wpisami.
    if (related.length < 3) {
      for (const p of others) {
        if (related.length >= 3) break;
        if (!related.includes(p)) related.push(p);
      }
    }

    // published() jest od najnowszego: prev = starszy, next = nowszy
    let prev = null;
    let next = null;
    if (item.status === 'published') {
      const i = published.findIndex((p) => p.id === item.id);
      prev = published[i + 1] || null;
      next = i > 0 ? published[i - 1] : null;
    }

    const headers = {};
    if (item.status !== 'published') headers['X-Robots-Tag'] = 'noindex';
    else if (!admin) posts.bumpViews(item.id);
    return html(req, res, 200, renderPost({ site: site(), post: item, related, prev, next }), headers);
  }

  // ---------- RSS, sitemap, llms.txt ----------

  function feed(req, res) {
    const body = renderFeed({ site: site(), posts: posts.published().slice(0, FEED_ITEMS) });
    return send(req, res, 200, body, { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=600' });
  }

  async function fileDay(file) {
    try {
      return (await fsp.stat(file)).mtime.toISOString().slice(0, 10);
    } catch {
      return '';
    }
  }

  async function sitemap(req, res) {
    const s = site();
    const published = posts.published();
    const day = (iso) => (iso ? String(iso).slice(0, 10) : '');
    const urls = [
      { loc: `${s.url}/`, lastmod: await fileDay(path.join(staticRoot, 'index.html')) },
      { loc: `${s.url}/polityka-prywatnosci.html`, lastmod: await fileDay(path.join(staticRoot, 'polityka-prywatnosci.html')) },
      { loc: `${s.url}/blog/`, lastmod: day(published.map((p) => p.updatedAt).sort().pop()) },
    ];
    for (const c of posts.categories()) {
      const newest = published.filter((p) => p.categorySlug === c.slug).map((p) => p.updatedAt).sort().pop();
      urls.push({ loc: `${s.url}/blog/kategoria/${encodeURIComponent(c.slug)}/`, lastmod: day(newest) });
    }
    for (const p of published) urls.push({ loc: postUrl(s, p), lastmod: day(p.updatedAt || p.publishedAt) });
    const body =
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map((u) => `  <url>\n    <loc>${esc(u.loc)}</loc>\n${u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : ''}  </url>`).join('\n') +
      '\n</urlset>\n';
    return send(req, res, 200, body, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=600' });
  }

  async function llms(req, res) {
    const s = site();
    let base = '';
    try {
      base = await fsp.readFile(path.join(staticRoot, 'llms.txt'), 'utf8');
    } catch {
      base = `# ${s.name}\n\n> ${s.description}\n`;
    }
    const lines = posts
      .published()
      .slice(0, LLMS_ITEMS)
      .map((p) => `- [${p.title.replace(/[[\]]/g, '')}](${postUrl(s, p)})${p.excerpt ? ` — ${p.excerpt.replace(/\s+/g, ' ')}` : ''}`);
    const body = `${base.trimEnd()}\n\n## Blog\n\nWpisy o automatyzacji i AI: ${s.url}/blog/ (RSS: ${s.url}/blog/feed.xml)\n\n${lines.join('\n')}\n`;
    return send(req, res, 200, body, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=600' });
  }

  // ---------- /media/… ----------

  async function media(req, res, pathname) {
    const notFoundErr = () => new HttpError(404, 'Nie znaleziono');
    let decoded;
    try {
      decoded = decodeURIComponent(pathname.slice('/media/'.length));
    } catch {
      throw notFoundErr();
    }
    if (decoded.includes('\0') || decoded.includes('\\')) throw notFoundErr();
    const segments = path.posix.normalize(decoded).split('/').filter(Boolean);
    if (!segments.length || segments.some((s) => s === '..' || s.startsWith('.'))) throw notFoundErr();
    const file = path.join(uploadsRoot, ...segments);
    if (!file.startsWith(uploadsRoot + path.sep)) throw notFoundErr();

    let stat;
    try {
      stat = await fsp.stat(file);
    } catch {
      throw notFoundErr();
    }
    if (!stat.isFile()) throw notFoundErr();

    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', stat.mtime.toUTCString());
    if (ext === '.svg') res.setHeader('Content-Security-Policy', SVG_CSP);
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
        log.error(`[media] ${pathname}: ${err.message}`);
        res.destroy();
      }
    };
    const stream = fs.createReadStream(file);
    if (gzip) pipeline(stream, zlib.createGzip(), res, onDone);
    else pipeline(stream, res, onDone);
    return undefined;
  }

  // ---------- dispatcher ----------

  function blogRoute(req, res, url) {
    const pathname = url.pathname;
    if (pathname === '/blog') return redirect(res, '/blog/' + url.search);
    if (pathname === '/blog/feed.xml') return feed(req, res);
    if (!pathname.endsWith('/')) return redirect(res, pathname + '/' + url.search);

    const parts = pathname.split('/').filter(Boolean).slice(1); // bez "blog"
    const pageOf = (segs) => {
      // [] → 1; ['strona', 'N'] → N; inne → null
      if (!segs.length) return 1;
      if (segs.length === 2 && segs[0] === 'strona' && PAGE_RE.test(segs[1])) return Number(segs[1]);
      return null;
    };

    if (!parts.length) return index(req, res, { page: 1 });

    if (parts[0] === 'strona') {
      const page = pageOf(parts);
      if (page === null) return notFound(req, res);
      if (page === 1) return redirect(res, '/blog/' + url.search);
      return index(req, res, { page });
    }

    if (parts[0] === 'kategoria' || parts[0] === 'tag') {
      const slug = parts[1];
      if (!slug || !SLUG_RE.test(slug)) return notFound(req, res);
      const page = pageOf(parts.slice(2));
      if (page === null) return notFound(req, res);
      if (page === 1 && parts.length > 2) return redirect(res, `/blog/${parts[0]}/${slug}/` + url.search);
      if (parts[0] === 'kategoria') {
        const category = posts.categories().find((c) => c.slug === slug);
        if (!category) return notFound(req, res);
        return index(req, res, { page, category: { name: category.name, slug: category.slug } });
      }
      const tag = posts.tags().find((t) => t.slug === slug);
      if (!tag) return notFound(req, res);
      return index(req, res, { page, tag: tag.name });
    }

    if (parts.length === 1 && SLUG_RE.test(parts[0])) return post(req, res, parts[0]);
    return notFound(req, res);
  }

  return async function handleBlog(req, res, url) {
    const pathname = url.pathname;
    const isBlog = pathname === '/blog' || pathname.startsWith('/blog/');
    const isMedia = pathname.startsWith('/media/');
    if (!isBlog && !isMedia && pathname !== '/sitemap.xml' && pathname !== '/llms.txt') return false;

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      throw new HttpError(405, 'Niedozwolona metoda', { headers: { Allow: 'GET, HEAD' } });
    }
    if (isMedia) await media(req, res, pathname);
    else if (pathname === '/sitemap.xml') await sitemap(req, res);
    else if (pathname === '/llms.txt') await llms(req, res);
    else blogRoute(req, res, url);
    return true;
  };
}
