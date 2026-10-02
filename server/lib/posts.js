// Wpisy bloga: walidacja, CRUD na store.posts (DATA_DIR/posts.json), unikalne slugi,
// licznik odsłon zapisywany z opóźnieniem, import wpisów startowych z server/seed/posts.json,
// kategorie i tagi. Treść Markdown jest renderowana przy zapisie (html, toc, readingMin).

import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './http.js';
import { render } from './markdown.js';
import { slugify } from './blog-templates.js';
import { isPlainObject } from './util.js';

export const AUTHOR = 'Tomasz Stachowiak';
export const POST_STATUSES = ['draft', 'published'];
export const SLUG_RE = /^[a-z0-9-]{1,80}$/;
export const DEFAULT_CATEGORY = 'Wpis';
const VIEWS_FLUSH_MS = 10_000;
const LIMITS = {
  title: 160,
  excerpt: 400,
  content: 200_000,
  category: 60,
  tags: 20,
  tag: 40,
  seoTitle: 120,
  seoDescription: 300,
  cover: 500,
  coverAlt: 200,
};

// ---------- walidacja ----------

function bad(message, field) {
  return new HttpError(400, message, { field });
}

function text(v, { field, label, max, min = 0, required = false, fallback = '' }) {
  if (v === undefined || v === null) v = fallback;
  if (typeof v !== 'string') throw bad(`Pole „${label}” musi być tekstem`, field);
  v = v.replace(/\0/g, '').trim();
  if (required && !v) throw bad(`Pole „${label}” jest wymagane`, field);
  if (v && v.length < min) throw bad(`Pole „${label}”: minimum ${min} znaków`, field);
  if (v.length > max) throw bad(`Pole „${label}”: maksimum ${max} znaków`, field);
  return v;
}

/** ISO 8601 albo wartość z <input type="datetime-local"> (czas lokalny serwera). Puste → null. */
export function parseDate(v, field = 'publishedAt') {
  if (v === undefined || v === null || v === '') return null;
  if (v instanceof Date) v = v.toISOString();
  if (typeof v !== 'string') throw bad('Nieprawidłowa data', field);
  const s = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(s)) {
    throw bad('Nieprawidłowa data (oczekiwano ISO 8601 lub RRRR-MM-DDTHH:MM)', field);
  }
  const d = new Date(s.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) throw bad('Nieprawidłowa data', field);
  return d.toISOString();
}

function tagsField(v, fallback) {
  if (v === undefined || v === null) v = fallback;
  if (typeof v === 'string') v = v.split(',');
  if (!Array.isArray(v)) throw bad('Pole „tagi” musi być listą', 'tags');
  const out = [];
  const seen = new Set();
  for (const raw of v) {
    if (typeof raw !== 'string') throw bad('Każdy tag musi być tekstem', 'tags');
    const t = raw.replace(/\0/g, '').trim().replace(/^#+/, '').trim();
    if (!t) continue;
    if (t.length > LIMITS.tag) throw bad(`Tag „${t.slice(0, 20)}…”: maksimum ${LIMITS.tag} znaków`, 'tags');
    const key = slugify(t);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  if (out.length > LIMITS.tags) throw bad(`Maksymalnie ${LIMITS.tags} tagów`, 'tags');
  return out;
}

function coverField(v, fallback) {
  const s = text(v, { field: 'cover', label: 'okładka', max: LIMITS.cover, fallback });
  if (s && !/^(\/media\/|\/assets\/|https:\/\/)/.test(s)) {
    throw bad('Okładka musi zaczynać się od /media/, /assets/ albo https://', 'cover');
  }
  if (/[\s<>"']/.test(s)) throw bad('Nieprawidłowy adres okładki', 'cover');
  return s;
}

function boolField(v, fallback, field) {
  if (v === undefined || v === null) return !!fallback;
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1 || v === '1') return true;
  if (v === 'false' || v === 0 || v === '0' || v === '') return false;
  throw bad(`Pole „${field}” musi być true/false`, field);
}

/**
 * Normalizuje i waliduje dane wpisu. Dla aktualizacji brakujące pola biorą wartość z `existing`.
 * Zwraca tylko pola edytowalne (bez id, html, toc, readingMin, views, og, dat).
 */
function normalize(data, existing = null) {
  if (!isPlainObject(data)) throw bad('Oczekiwano obiektu z danymi wpisu');
  const base = existing || {};
  const pick = (k) => (Object.hasOwn(data, k) ? data[k] : base[k]);

  const title = text(pick('title'), { field: 'title', label: 'tytuł', min: 2, max: LIMITS.title, required: true });

  let slug;
  if (Object.hasOwn(data, 'slug')) {
    const raw = text(data.slug, { field: 'slug', label: 'slug', max: 200 });
    slug = raw ? slugify(raw) : slugify(title);
  } else slug = existing ? existing.slug : slugify(title);
  if (!SLUG_RE.test(slug)) throw bad('Nieprawidłowy slug', 'slug');

  const category = text(pick('category'), { field: 'category', label: 'kategoria', max: LIMITS.category }) || DEFAULT_CATEGORY;

  const seoIn = pick('seo');
  if (seoIn !== undefined && seoIn !== null && !isPlainObject(seoIn)) throw bad('Pole „seo” musi być obiektem', 'seo');
  const seoBase = isPlainObject(base.seo) ? base.seo : {};
  const seoSrc = isPlainObject(seoIn) ? seoIn : {};
  const seo = {
    title: text(Object.hasOwn(seoSrc, 'title') ? seoSrc.title : seoBase.title, { field: 'seo.title', label: 'tytuł SEO', max: LIMITS.seoTitle }),
    description: text(Object.hasOwn(seoSrc, 'description') ? seoSrc.description : seoBase.description, {
      field: 'seo.description',
      label: 'opis SEO',
      max: LIMITS.seoDescription,
    }),
  };

  const status = pick('status') ?? 'draft';
  if (!POST_STATUSES.includes(status)) throw bad(`Status musi być jednym z: ${POST_STATUSES.join(', ')}`, 'status');

  return {
    slug,
    title,
    excerpt: text(pick('excerpt'), { field: 'excerpt', label: 'zajawka', max: LIMITS.excerpt }),
    content: text(pick('content'), { field: 'content', label: 'treść', max: LIMITS.content }),
    cover: coverField(pick('cover'), base.cover),
    coverAlt: text(pick('coverAlt'), { field: 'coverAlt', label: 'opis okładki', max: LIMITS.coverAlt }),
    category,
    categorySlug: slugify(category),
    tags: tagsField(pick('tags'), base.tags || []),
    status,
    publishedAt: parseDate(pick('publishedAt')),
    seo,
    featured: boolField(pick('featured'), base.featured, 'featured'),
  };
}

/** Pola wyliczane z treści. */
export function derive(content) {
  const { html, toc, plain } = render(content);
  const words = plain ? plain.split(/\s+/).filter(Boolean).length : 0;
  return { html, toc, readingMin: Math.max(1, Math.round(words / 200)) };
}

function byNewest(key) {
  return (a, b) => {
    const ta = a[key] || a.updatedAt || '';
    const tb = b[key] || b.updatedAt || '';
    return ta < tb ? 1 : ta > tb ? -1 : 0;
  };
}

function isUuidLike(v) {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v);
}

// ---------- moduł ----------

export function createPosts({ store, log = console, seedFile = '' }) {
  const uploadsDir = path.join(store.dir, 'uploads');
  let viewsTimer = null;
  let viewsDirty = false;

  const all = () => store.posts;
  const findById = (id) => all().find((p) => p.id === id) || null;
  const slugTaken = (slug, exceptId = null) => all().some((p) => p.slug === slug && p.id !== exceptId);

  function uniqueSlug(slug) {
    if (!slugTaken(slug)) return slug;
    for (let k = 2; k < 10_000; k++) {
      const candidate = `${slug.slice(0, 80 - String(k).length - 1)}-${k}`;
      if (!slugTaken(candidate)) return candidate;
    }
    return `${slug.slice(0, 60)}-${crypto.randomBytes(4).toString('hex')}`;
  }

  async function exists(file) {
    try {
      await fsp.access(file);
      return true;
    } catch {
      return false;
    }
  }

  const api = {
    /** Import wpisów startowych, gdy posts.json jeszcze nie istnieje. */
    async init() {
      const postsFile = path.join(store.dir, 'posts.json');
      if (await exists(postsFile)) return;
      if (!seedFile || !(await exists(seedFile))) {
        log.info('[blog] brak posts.json i pliku z wpisami startowymi – blog startuje pusty');
        return;
      }
      let seed;
      try {
        seed = JSON.parse(await fsp.readFile(seedFile, 'utf8'));
      } catch (err) {
        log.error(`[blog] nie udało się wczytać ${seedFile}: ${err.message}`);
        return;
      }
      if (!Array.isArray(seed)) {
        log.error(`[blog] ${seedFile}: oczekiwano tablicy wpisów`);
        return;
      }
      let imported = 0;
      for (const item of seed) {
        try {
          api.createPost({ status: 'published', ...item }, { seed: true });
          imported++;
        } catch (err) {
          log.error(`[blog] pominięto wpis startowy „${item && item.title}”: ${err.message}`);
        }
      }
      await store.persist('posts');
      log.info(`[blog] zaimportowano ${imported} z ${seed.length} wpisów startowych z ${seedFile}`);
    },

    /** Opublikowane wpisy, najnowsze najpierw. */
    published() {
      return all()
        .filter((p) => p.status === 'published')
        .sort(byNewest('publishedAt'));
    },

    /**
     * Lista dla panelu: filtry status/q/category/tag, stronicowanie.
     * `counts` liczone dla q/category/tag niezależnie od filtra statusu.
     */
    listPosts({ status = '', q = '', category = '', tag = '', limit = 50, offset = 0 } = {}) {
      const needle = String(q || '').trim().toLowerCase();
      const catSlug = category ? slugify(category) : '';
      const tagSlug = tag ? slugify(tag) : '';
      let items = all().filter((p) => {
        if (catSlug && p.categorySlug !== catSlug) return false;
        if (tagSlug && !(p.tags || []).some((t) => slugify(t) === tagSlug)) return false;
        if (needle) {
          const hay = [p.title, p.excerpt, p.content, (p.tags || []).join(' ')].join('\n').toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      });
      const counts = { published: 0, draft: 0, all: items.length };
      for (const p of items) counts[p.status] = (counts[p.status] || 0) + 1;
      if (status) items = items.filter((p) => p.status === status);
      items.sort(byNewest('publishedAt'));
      return { items: items.slice(offset, offset + limit), total: items.length, counts };
    },

    getPost(id) {
      return findById(id);
    },

    getPostBySlug(slug, { publishedOnly = true } = {}) {
      if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return null;
      const post = all().find((p) => p.slug === slug) || null;
      if (!post) return null;
      if (publishedOnly && post.status !== 'published') return null;
      return post;
    },

    /** Tworzy wpis. `seed` pozwala zachować id/daty/odsłony z pliku startowego. */
    createPost(data, { seed = false } = {}) {
      const now = new Date().toISOString();
      const fields = normalize(data, null);
      fields.slug = uniqueSlug(fields.slug);
      if (fields.status === 'published' && !fields.publishedAt) fields.publishedAt = now;
      const computed = derive(fields.content);
      const keepId = seed && isUuidLike(data.id) && !findById(data.id);
      const post = {
        id: keepId ? data.id : crypto.randomUUID(),
        slug: fields.slug,
        title: fields.title,
        excerpt: fields.excerpt,
        content: fields.content,
        html: computed.html,
        toc: computed.toc,
        cover: fields.cover,
        coverAlt: fields.coverAlt,
        category: fields.category,
        categorySlug: fields.categorySlug,
        tags: fields.tags,
        status: fields.status,
        publishedAt: fields.publishedAt,
        // Wpisy startowe dostają daty z pliku (albo datę publikacji), żeby lastmod i „zaktualizowano” miały sens.
        createdAt: (seed && (safeIso(data.createdAt) || fields.publishedAt)) || now,
        updatedAt: (seed && (safeIso(data.updatedAt) || fields.publishedAt)) || now,
        author: AUTHOR,
        readingMin: computed.readingMin,
        seo: fields.seo,
        og: '',
        views: seed && Number.isInteger(data.views) && data.views >= 0 ? data.views : 0,
        featured: fields.featured,
      };
      all().push(post);
      store.persist('posts');
      return post;
    },

    /** Aktualizuje wpis; 409 gdy slug należy do innego wpisu. */
    updatePost(id, data) {
      const post = findById(id);
      if (!post) return null;
      const fields = normalize(data, post);
      if (slugTaken(fields.slug, id)) throw new HttpError(409, 'Ten slug jest już zajęty', { field: 'slug' });
      const now = new Date().toISOString();
      if (fields.status === 'published' && !fields.publishedAt) fields.publishedAt = now;
      const computed = fields.content === post.content && post.html ? { html: post.html, toc: post.toc, readingMin: post.readingMin } : derive(fields.content);
      Object.assign(post, fields, computed, { updatedAt: now, author: AUTHOR });
      store.persist('posts');
      return post;
    },

    /** Usuwa wpis i jego obrazek OG (jeśli leży w uploads/og). */
    deletePost(id) {
      const i = all().findIndex((p) => p.id === id);
      if (i < 0) return false;
      const [post] = all().splice(i, 1);
      store.persist('posts');
      const ogFile = ogPath(post.og);
      if (ogFile) fsp.rm(ogFile, { force: true }).catch((err) => log.warn(`[blog] nie usunięto ${ogFile}: ${err.message}`));
      return true;
    },

    /** Zwiększa licznik odsłon w pamięci; zapis na dysk najwyżej co 10 s. */
    bumpViews(id) {
      const post = findById(id);
      if (!post) return 0;
      post.views = (Number.isInteger(post.views) ? post.views : 0) + 1;
      viewsDirty = true;
      if (!viewsTimer) {
        viewsTimer = setTimeout(() => {
          viewsTimer = null;
          if (viewsDirty) {
            viewsDirty = false;
            store.persist('posts');
          }
        }, VIEWS_FLUSH_MS);
        viewsTimer.unref();
      }
      return post.views;
    },

    /** Zapisuje odłożone odsłony (przy zamykaniu serwera). */
    async flush() {
      if (viewsTimer) {
        clearTimeout(viewsTimer);
        viewsTimer = null;
      }
      if (viewsDirty) {
        viewsDirty = false;
        await store.persist('posts');
      }
    },

    /** Kategorie opublikowanych wpisów: [{name, slug, count}], najliczniejsze najpierw. */
    categories() {
      const map = new Map();
      for (const p of api.published()) {
        const slug = p.categorySlug || slugify(p.category || DEFAULT_CATEGORY);
        const e = map.get(slug) || { name: p.category || DEFAULT_CATEGORY, slug, count: 0 };
        e.count++;
        map.set(slug, e);
      }
      return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pl'));
    },

    /** Tagi opublikowanych wpisów: [{name, slug, count}]. */
    tags() {
      const map = new Map();
      for (const p of api.published()) {
        for (const t of p.tags || []) {
          const slug = slugify(t);
          const e = map.get(slug) || { name: t, slug, count: 0 };
          e.count++;
          map.set(slug, e);
        }
      }
      return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pl'));
    },

    /** Ścieżka pliku OG dla adresu /media/og/<slug>.png[?v=…] albo null. */
    ogPath,
    uploadsDir,
  };

  function ogPath(og) {
    if (typeof og !== 'string' || !og.startsWith('/media/og/')) return null;
    const name = og.slice('/media/og/'.length).split('?')[0];
    if (!/^[a-z0-9-]{1,80}\.png$/.test(name)) return null;
    return path.join(uploadsDir, 'og', name);
  }

  return api;
}

function safeIso(v) {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
