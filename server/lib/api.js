// API: publiczne (/api/lead, /api/magnet, /api/config, /api/health, /api/posts)
// i panelu (/api/admin/*, sesja w ciasteczku, CSRF, limity żądań), w tym wpisy bloga i obrazki.

import crypto from 'node:crypto';
import { LEAD_SOURCES, LEAD_STATUSES } from './config.js';
import { HttpError, sendJson, send, readJson, clientIp, isSecure } from './http.js';
import { mergeSettings, maskSettings, publicConfig } from './settings.js';
import { COOKIE_NAME, SESSION_TTL_MS, createSessionToken, verifyPassword, serializeCookie, sessionFromRequest } from './auth.js';
import { anonymizeIp, localDay, clampInt, isPlainObject } from './util.js';
import { POST_STATUSES, SLUG_RE, derive } from './posts.js';
import { decodeBase64, saveUpload, saveOg, MAX_UPLOAD, MAX_OG } from './upload.js';
import { blogBase, langOf, LANGS } from './blog-templates.js';
import { SUB_STATUSES, SUB_SOURCES } from './newsletter.js';

const MAX_BODY = 64 * 1024;
/** Wpis ma do 200 000 znaków treści (plus JSON) – osobny limit dla tras wpisów. */
const MAX_POST_BODY = 1024 * 1024;
/** Obrazki idą jako base64 w JSON: 5 MB pliku ≈ 6,7 MB tekstu. */
const MAX_UPLOAD_BODY = 8 * 1024 * 1024;
const MAX_META = 4 * 1024;
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z0-9-]{2,}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const LIMITS = {
  lead: { limit: 10, windowMs: 60_000 },
  magnet: { limit: 10, windowMs: 60_000 },
  login: { limit: 5, windowMs: 15 * 60_000 },
  newsletter: { limit: 6, windowMs: 60_000 },
};

// ---------- walidacja ----------

function strField(body, key, { min = 0, max = 500, required = false, label = key } = {}) {
  let v = body[key];
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw new HttpError(400, `Pole „${label}” musi być tekstem`, { field: key });
  v = v.replace(/\0/g, '').trim();
  if (required && !v) throw new HttpError(400, `Pole „${label}” jest wymagane`, { field: key });
  if (v && v.length < min) throw new HttpError(400, `Pole „${label}”: minimum ${min} znaków`, { field: key });
  if (v.length > max) throw new HttpError(400, `Pole „${label}”: maksimum ${max} znaków`, { field: key });
  return v;
}

function emailField(body, key = 'email') {
  const v = strField(body, key, { required: true, max: 254, label: 'e-mail' });
  if (!EMAIL_RE.test(v)) throw new HttpError(400, 'Nieprawidłowy adres e-mail', { field: key });
  return v;
}

function isHoneypot(body) {
  const w = body.website;
  return w !== undefined && w !== null && String(w).trim() !== '';
}

function tooMany(retryAfter) {
  return new HttpError(429, 'Zbyt wiele żądań. Spróbuj ponownie za chwilę.', {
    headers: { 'Retry-After': String(retryAfter) },
  });
}

// ---------- mini-router ----------

function createRouter() {
  const routes = [];
  return {
    add(method, pattern, handler, opts = {}) {
      routes.push({ method, parts: pattern.split('/').filter(Boolean), handler, ...opts });
    },
    match(method, pathname) {
      const parts = pathname.split('/').filter(Boolean);
      const allowed = new Set();
      for (const r of routes) {
        if (r.parts.length !== parts.length) continue;
        const params = {};
        let ok = true;
        for (let i = 0; i < parts.length; i++) {
          const rp = r.parts[i];
          if (rp.startsWith(':')) params[rp.slice(1)] = parts[i];
          else if (rp !== parts[i]) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        allowed.add(r.method);
        if (r.method === method || (r.method === 'GET' && method === 'HEAD')) return { route: r, params };
      }
      return { route: null, allowed: [...allowed] };
    },
  };
}

// ---------- API ----------

export function createApi({ config, store, posts, limiter, notifier, secret, newsletter = null, mailer = null, log = console }) {
  const adminEnabled = Boolean(config.adminPassword || config.adminPasswordHash);
  const router = createRouter();
  const siteUrl = String(config.publicUrl || 'https://tsoftware.online').replace(/\/+$/, '');

  /** Publiczny kształt wpisu (bez treści); `withHtml` dołącza wyrenderowany HTML. */
  function publicPost(p, withHtml = false) {
    const item = {
      id: p.id,
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      cover: p.cover,
      coverAlt: p.coverAlt,
      category: p.category,
      categorySlug: p.categorySlug,
      tags: p.tags,
      publishedAt: p.publishedAt,
      readingMin: p.readingMin,
      lang: langOf(p.lang),
      url: `${siteUrl}${blogBase(p.lang)}${p.slug}/`,
    };
    if (withHtml) item.html = p.html;
    return item;
  }

  /** Wpis dla panelu na liście: wszystko poza wyrenderowanym HTML (ten jest w GET /api/admin/posts/:id). */
  function adminListItem(p) {
    const { html, ...rest } = p;
    return rest;
  }

  // ---- publiczne ----

  router.add('GET', '/api/health', (req, res) => {
    sendJson(req, res, 200, { ok: true, uptime: Math.round(process.uptime()), leads: store.leads.length, postsTotal: store.posts.length, subscribers: store.subscribers.filter((x) => x.status === 'active').length });
  });

  router.add('GET', '/api/posts', (req, res, { url }) => {
    const limit = clampInt(url.searchParams.get('limit'), 1, 20, 3);
    const category = (url.searchParams.get('category') || '').trim();
    const tag = (url.searchParams.get('tag') || '').trim();
    const langQ = url.searchParams.get('lang') || '';
    const lang = LANGS.includes(langQ) ? langQ : '';
    const { items } = posts.listPosts({ status: 'published', category, tag, lang, limit, offset: 0 });
    sendJson(req, res, 200, { items: items.map((p) => publicPost(p)) }, { 'Cache-Control': 'public, max-age=60' });
  });

  router.add('GET', '/api/posts/:slug', (req, res, { params }) => {
    const post = SLUG_RE.test(params.slug) ? posts.getPostBySlug(params.slug, { publishedOnly: true }) : null;
    if (!post) throw new HttpError(404, 'Nie znaleziono');
    sendJson(req, res, 200, publicPost(post, true), { 'Cache-Control': 'public, max-age=60' });
  });

  router.add('GET', '/api/config', (req, res) => {
    const body = JSON.stringify(publicConfig(store.settings));
    const etag = `W/"${crypto.createHash('sha1').update(body).digest('base64url').slice(0, 20)}"`;
    const headers = { 'Cache-Control': 'public, max-age=60', ETag: etag };
    if (req.headers['if-none-match'] === etag) {
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
      res.statusCode = 304;
      return res.end();
    }
    return send(req, res, 200, body, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  });

  router.add('POST', '/api/lead', async (req, res, { ip }) => {
    const rl = limiter.hit(`lead:${ip}`, LIMITS.lead.limit, LIMITS.lead.windowMs);
    if (!rl.ok) throw tooMany(rl.retryAfter);
    const body = await readJson(req, MAX_BODY);
    if (isHoneypot(body)) return sendJson(req, res, 200, { ok: true });

    const name = strField(body, 'name', { required: true, min: 2, max: 120, label: 'imię i nazwisko' });
    const email = emailField(body);
    const company = strField(body, 'company', { max: 200, label: 'firma' });
    const topic = strField(body, 'topic', { max: 120, label: 'temat' });
    const message = strField(body, 'message', { required: true, min: 5, max: 5000, label: 'wiadomość' });

    let source = body.source;
    if (source === undefined || source === null || source === '') source = 'form';
    if (!LEAD_SOURCES.includes(source)) {
      throw new HttpError(400, `Pole „source” musi być jednym z: ${LEAD_SOURCES.join(', ')}`, { field: 'source' });
    }

    let meta = body.meta;
    if (meta === undefined || meta === null) meta = {};
    if (!isPlainObject(meta)) throw new HttpError(400, 'Pole „meta” musi być obiektem', { field: 'meta' });
    // Formularz na stronie wysyła `page` – zachowujemy go w meta.
    if (typeof body.page === 'string' && body.page && meta.page === undefined) meta.page = body.page.slice(0, 500);
    if (Buffer.byteLength(JSON.stringify(meta), 'utf8') > MAX_META) {
      throw new HttpError(400, 'Pole „meta” jest za duże (max 4 KB)', { field: 'meta' });
    }

    const item = {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      name,
      email,
      company,
      topic,
      message,
      source,
      meta,
      status: 'nowe',
      notes: '',
      ip: anonymizeIp(ip),
      ua: String(req.headers['user-agent'] || '').slice(0, 300),
    };
    store.addLead(item);
    notifier.lead(item);
    return sendJson(req, res, 200, { ok: true, id: item.id });
  });

  router.add('POST', '/api/magnet', async (req, res, { ip }) => {
    const rl = limiter.hit(`magnet:${ip}`, LIMITS.magnet.limit, LIMITS.magnet.windowMs);
    if (!rl.ok) throw tooMany(rl.retryAfter);
    const body = await readJson(req, MAX_BODY);
    const magnet = store.settings.magnet;
    if (isHoneypot(body)) return sendJson(req, res, 200, { ok: true, url: magnet.url });
    if (!magnet.enabled) throw new HttpError(404, 'Materiał do pobrania jest obecnie niedostępny');

    const email = emailField(body);
    const name = strField(body, 'name', { max: 120, label: 'imię' });
    const marketing = body.marketing === true || body.marketing === 'true';
    const { item, created } = store.upsertMagnet({ email, name, marketing, ip: anonymizeIp(ip) });
    if (created) notifier.magnet(item);
    return sendJson(req, res, 200, { ok: true, url: magnet.url });
  });

  // ---- panel: logowanie ----

  router.add(
    'POST',
    '/api/admin/login',
    async (req, res, { ip }) => {
      const key = `login:${ip}`;
      const rl = limiter.check(key, LIMITS.login.limit, LIMITS.login.windowMs);
      if (!rl.ok) throw tooMany(rl.retryAfter);
      const body = await readJson(req, MAX_BODY);
      if (typeof body.password !== 'string') throw new HttpError(400, 'Brak hasła', { field: 'password' });
      const ok = await verifyPassword(body.password, {
        password: config.adminPassword,
        hash: config.adminPasswordHash,
      });
      if (!ok) {
        limiter.hit(key, LIMITS.login.limit, LIMITS.login.windowMs);
        return sendJson(req, res, 401, { ok: false, error: 'Złe hasło' });
      }
      const token = createSessionToken(secret);
      res.setHeader(
        'Set-Cookie',
        serializeCookie(COOKIE_NAME, token, { maxAge: SESSION_TTL_MS / 1000, secure: isSecure(req, config.trustProxy) }),
      );
      return sendJson(req, res, 200, { ok: true });
    },
    { admin: true, csrf: true },
  );

  router.add(
    'POST',
    '/api/admin/logout',
    (req, res) => {
      res.setHeader('Set-Cookie', serializeCookie(COOKIE_NAME, '', { maxAge: 0, secure: isSecure(req, config.trustProxy) }));
      sendJson(req, res, 200, { ok: true });
    },
    { admin: true, csrf: true },
  );

  router.add(
    'GET',
    '/api/admin/me',
    (req, res, { session }) => {
      sendJson(req, res, 200, { ok: true, exp: new Date(session.exp).toISOString() });
    },
    { admin: true, auth: true },
  );

  // ---- panel: leady ----

  router.add(
    'GET',
    '/api/admin/leads',
    (req, res, { url }) => {
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const status = url.searchParams.get('status') || '';
      const source = url.searchParams.get('source') || '';
      const limit = clampInt(url.searchParams.get('limit'), 1, 500, 50);
      const offset = clampInt(url.searchParams.get('offset'), 0, Number.MAX_SAFE_INTEGER, 0);

      let items = store.leads.filter(
        (l) =>
          (!source || l.source === source) &&
          (!q || [l.name, l.email, l.company, l.message].some((v) => String(v || '').toLowerCase().includes(q))),
      );
      // Liczniki statusów liczone dla aktualnego wyszukiwania (q, source), niezależnie od filtra statusu.
      const counts = { nowe: 0, 'w toku': 0, zamkniete: 0, all: items.length };
      for (const l of items) counts[l.status] = (counts[l.status] || 0) + 1;
      if (status) items = items.filter((l) => l.status === status);
      items.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));

      sendJson(req, res, 200, { items: items.slice(offset, offset + limit), total: items.length, counts, limit, offset });
    },
    { admin: true, auth: true },
  );

  router.add(
    'GET',
    '/api/admin/leads/:id',
    (req, res, { params }) => {
      const item = store.getLead(params.id);
      if (!item) throw new HttpError(404, 'Nie znaleziono');
      sendJson(req, res, 200, { item });
    },
    { admin: true, auth: true },
  );

  router.add(
    'PATCH',
    '/api/admin/leads/:id',
    async (req, res, { params }) => {
      const body = await readJson(req, MAX_BODY);
      const patch = {};
      if (body.status !== undefined) {
        if (!LEAD_STATUSES.includes(body.status)) {
          throw new HttpError(400, `Status musi być jednym z: ${LEAD_STATUSES.join(', ')}`, { field: 'status' });
        }
        patch.status = body.status;
      }
      if (body.notes !== undefined) patch.notes = strField(body, 'notes', { max: 5000, label: 'notatki' });
      const item = store.updateLead(params.id, patch);
      if (!item) throw new HttpError(404, 'Nie znaleziono');
      sendJson(req, res, 200, { ok: true, item });
    },
    { admin: true, auth: true, csrf: true },
  );

  router.add(
    'DELETE',
    '/api/admin/leads/:id',
    (req, res, { params }) => {
      if (!store.removeLead(params.id)) throw new HttpError(404, 'Nie znaleziono');
      sendJson(req, res, 200, { ok: true });
    },
    { admin: true, auth: true, csrf: true },
  );

  // ---- panel: lead magnet ----

  router.add(
    'GET',
    '/api/admin/magnet',
    (req, res, { url }) => {
      const limit = clampInt(url.searchParams.get('limit'), 1, 500, 50);
      const offset = clampInt(url.searchParams.get('offset'), 0, Number.MAX_SAFE_INTEGER, 0);
      const items = [...store.magnet].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
      sendJson(req, res, 200, { items: items.slice(offset, offset + limit), total: items.length, limit, offset });
    },
    { admin: true, auth: true },
  );

  router.add(
    'DELETE',
    '/api/admin/magnet/:id',
    (req, res, { params }) => {
      if (!store.removeMagnet(params.id)) throw new HttpError(404, 'Nie znaleziono');
      sendJson(req, res, 200, { ok: true });
    },
    { admin: true, auth: true, csrf: true },
  );

  // ---- panel: ustawienia ----

  router.add(
    'GET',
    '/api/admin/settings',
    (req, res) => {
      sendJson(req, res, 200, maskSettings(store.settings));
    },
    { admin: true, auth: true },
  );

  router.add(
    'PUT',
    '/api/admin/settings',
    async (req, res) => {
      const body = await readJson(req, MAX_BODY);
      const { settings, errors } = mergeSettings(store.settings, body, { strict: true });
      if (errors.length) throw new HttpError(400, errors.join('; '));
      store.setSettings(settings);
      sendJson(req, res, 200, maskSettings(settings));
    },
    { admin: true, auth: true, csrf: true },
  );


  // ---- newsletter: publiczne ----

  router.add('POST', '/api/newsletter/subscribe', async (req, res, { ip }) => {
    if (!newsletter) throw new HttpError(404, 'Nie znaleziono');
    const rl = limiter.hit(`newsletter:${ip}`, LIMITS.newsletter.limit, LIMITS.newsletter.windowMs);
    if (!rl.ok) throw tooMany(rl.retryAfter);
    const body = await readJson(req, MAX_BODY);
    if (isHoneypot(body)) return sendJson(req, res, 200, { ok: true, status: 'pending' });
    const email = emailField(body);
    if (!(body.consent === true || body.consent === 'true' || body.consent === 'on' || body.consent === 1)) {
      throw new HttpError(400, 'Potrzebna jest zgoda na otrzymywanie newslettera', { field: 'consent' });
    }
    const lang = langOf(body.lang);
    const source = SUB_SOURCES.includes(body.source) ? body.source : lang === 'en' ? 'en' : 'other';
    let r;
    try {
      r = await newsletter.subscribe({ email, lang, source, ip: anonymizeIp(ip) });
    } catch (err) {
      log.error(`[newsletter] zapis ${email}: ${err.message}`);
      throw new HttpError(503, lang === 'en' ? 'Could not send the confirmation email. Try again in a moment.' : 'Nie udało się wysłać maila z potwierdzeniem. Spróbuj za chwilę.');
    }
    return sendJson(req, res, 200, { ok: true, status: r.status, existing: !!r.existing });
  });

  router.add('GET', '/api/newsletter/click', (req, res, { url }) => {
    const c = String(url.searchParams.get('c') || '');
    let target = String(url.searchParams.get('u') || '');
    const ok = target.startsWith(siteUrl + '/') || target === siteUrl || /^\/(?!\/)/.test(target);
    if (!ok) target = siteUrl + '/';
    if (newsletter && /^[0-9a-f-]{36}$/i.test(c)) newsletter.recordClick(c);
    res.statusCode = 302;
    res.setHeader('Location', target);
    res.setHeader('Cache-Control', 'no-store');
    res.end();
  });

  // ---- newsletter: panel ----

  const nl = () => {
    if (!newsletter) throw new HttpError(404, 'Nie znaleziono');
    return newsletter;
  };
  const adminRw = { admin: true, auth: true, csrf: true };
  const adminRo = { admin: true, auth: true };

  router.add(
    'GET',
    '/api/admin/newsletter/subscribers',
    (req, res, { url }) => {
      const status = url.searchParams.get('status') || 'all';
      if (status !== 'all' && !SUB_STATUSES.includes(status)) throw new HttpError(400, `Status musi być jednym z: all, ${SUB_STATUSES.join(', ')}`, { field: 'status' });
      const q = (url.searchParams.get('q') || '').trim();
      const limit = clampInt(url.searchParams.get('limit'), 1, 500, 50);
      const offset = clampInt(url.searchParams.get('offset'), 0, Number.MAX_SAFE_INTEGER, 0);
      sendJson(req, res, 200, nl().list({ status, q, limit, offset }));
    },
    adminRo,
  );

  router.add(
    'GET',
    '/api/admin/newsletter/subscribers.csv',
    (req, res) => {
      send(req, res, 200, nl().exportCsv(), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="newsletter.csv"', 'Cache-Control': 'no-store' });
    },
    adminRo,
  );

  router.add(
    'POST',
    '/api/admin/newsletter/subscribers',
    async (req, res) => {
      const body = await readJson(req, MAX_BODY);
      const email = emailField(body);
      sendJson(req, res, 201, { ok: true, item: nl().addManual({ email, lang: langOf(body.lang) }) });
    },
    adminRw,
  );

  router.add(
    'POST',
    '/api/admin/newsletter/subscribers/import-magnet',
    (req, res) => {
      sendJson(req, res, 200, { ok: true, ...nl().importMagnet() });
    },
    adminRw,
  );

  router.add(
    'DELETE',
    '/api/admin/newsletter/subscribers/:id',
    (req, res, { params }) => {
      if (!nl().remove(params.id)) throw new HttpError(404, 'Nie znaleziono');
      sendJson(req, res, 200, { ok: true });
    },
    adminRw,
  );

  router.add(
    'GET',
    '/api/admin/newsletter/campaigns',
    (req, res) => {
      sendJson(req, res, 200, { items: nl().campaigns().map(campaignItem) });
    },
    adminRo,
  );

  function campaignItem(c) {
    const { html, ...rest } = c;
    return rest;
  }

  router.add(
    'GET',
    '/api/admin/newsletter/campaigns/:id',
    (req, res, { params }) => {
      const c = nl().getCampaign(params.id);
      if (!c) throw new HttpError(404, 'Nie znaleziono');
      sendJson(req, res, 200, { item: campaignItem(c) });
    },
    adminRo,
  );

  router.add(
    'POST',
    '/api/admin/newsletter/campaigns',
    async (req, res) => {
      const body = await readJson(req, MAX_BODY);
      sendJson(req, res, 201, { ok: true, item: campaignItem(nl().createCampaign(body)) });
    },
    adminRw,
  );

  router.add(
    'PUT',
    '/api/admin/newsletter/campaigns/:id',
    async (req, res, { params }) => {
      const body = await readJson(req, MAX_BODY);
      const c = nl().updateCampaign(params.id, body);
      if (!c) throw new HttpError(404, 'Nie znaleziono');
      sendJson(req, res, 200, { ok: true, item: campaignItem(c) });
    },
    adminRw,
  );

  router.add(
    'DELETE',
    '/api/admin/newsletter/campaigns/:id',
    (req, res, { params }) => {
      if (!nl().deleteCampaign(params.id)) throw new HttpError(404, 'Nie znaleziono');
      sendJson(req, res, 200, { ok: true });
    },
    adminRw,
  );

  router.add(
    'POST',
    '/api/admin/newsletter/campaigns/:id/preview',
    (req, res, { params }) => {
      const c = nl().getCampaign(params.id);
      if (!c) throw new HttpError(404, 'Nie znaleziono');
      const m = nl().renderCampaign(c);
      const safe = (v) => v.replace(/%%UNSUB%%/g, '#');
      sendJson(req, res, 200, { subject: m.subject, html: safe(m.html), text: safe(m.text) });
    },
    adminRw,
  );

  router.add(
    'POST',
    '/api/admin/newsletter/campaigns/:id/test',
    async (req, res, { params }) => {
      const body = await readJson(req, MAX_BODY);
      const to = emailField(body, 'to');
      if (!mailer || !mailer.configured) throw new HttpError(503, 'Wysyłka maili nie jest skonfigurowana (MAIL_* w .env)');
      try {
        await nl().sendTest(params.id, to);
      } catch (err) {
        if (err instanceof HttpError) throw err;
        throw new HttpError(502, `Wysyłka nie powiodła się: ${err.message}`);
      }
      sendJson(req, res, 200, { ok: true });
    },
    adminRw,
  );

  router.add(
    'POST',
    '/api/admin/newsletter/campaigns/:id/send',
    (req, res, { params }) => {
      const recipients = nl().startSend(params.id);
      sendJson(req, res, 200, { ok: true, recipients });
    },
    adminRw,
  );

  router.add(
    'POST',
    '/api/admin/newsletter/digest',
    async (req, res) => {
      const body = await readJson(req, MAX_BODY).catch(() => ({}));
      sendJson(req, res, 201, { ok: true, item: campaignItem(nl().createDigest(langOf(body && body.lang))) });
    },
    adminRw,
  );

  function newsletterSettings() {
    const s = store.settings.newsletter || {};
    return {
      auto: { ...s.auto },
      fromName: s.fromName || '',
      replyTo: s.replyTo || '',
      lastDigestAt: s.lastDigestAt || null,
      lastDigestAtEn: s.lastDigestAtEn || null,
      provider: mailer ? mailer.provider : 'none',
      mailConfigured: Boolean(mailer && mailer.configured),
      from: mailer ? mailer.from : '',
      counts: nl().counts(),
    };
  }

  router.add(
    'GET',
    '/api/admin/newsletter/settings',
    (req, res) => {
      sendJson(req, res, 200, newsletterSettings());
    },
    adminRo,
  );

  router.add(
    'PUT',
    '/api/admin/newsletter/settings',
    async (req, res) => {
      const body = await readJson(req, MAX_BODY);
      const patch = {};
      if (isPlainObject(body.auto)) {
        patch.auto = {};
        if (Object.hasOwn(body.auto, 'enabled')) patch.auto.enabled = body.auto.enabled === true;
        if (Object.hasOwn(body.auto, 'weekday')) patch.auto.weekday = clampInt(body.auto.weekday, 1, 7, 2);
        if (Object.hasOwn(body.auto, 'hour')) patch.auto.hour = clampInt(body.auto.hour, 0, 23, 9);
        if (Object.hasOwn(body.auto, 'minPosts')) patch.auto.minPosts = clampInt(body.auto.minPosts, 1, 10, 1);
      }
      if (Object.hasOwn(body, 'fromName')) patch.fromName = strField(body, 'fromName', { max: 80, label: 'nadawca' });
      if (Object.hasOwn(body, 'replyTo')) {
        const r = strField(body, 'replyTo', { max: 254, label: 'reply-to' });
        if (r && !EMAIL_RE.test(r)) throw new HttpError(400, 'Nieprawidłowy adres reply-to', { field: 'replyTo' });
        patch.replyTo = r;
      }
      const { settings, errors } = mergeSettings(store.settings, { newsletter: patch }, { strict: true });
      if (errors.length) throw new HttpError(400, errors.join('; '));
      store.setSettings(settings);
      sendJson(req, res, 200, newsletterSettings());
    },
    adminRw,
  );

  // ---- panel: statystyki i eksport ----

  router.add(
    'GET',
    '/api/admin/stats',
    (req, res) => {
      const now = Date.now();
      const since7 = now - 7 * DAY_MS;
      const since30 = now - 30 * DAY_MS;
      const byDayMap = new Map();
      for (let i = 29; i >= 0; i--) byDayMap.set(localDay(new Date(now - i * DAY_MS)), 0);
      const byTopic = {};
      const bySource = {};
      const byStatus = { nowe: 0, 'w toku': 0, zamkniete: 0 };
      let leads7d = 0;
      let leads30d = 0;

      for (const l of store.leads) {
        const t = Date.parse(l.ts);
        if (t >= since7) leads7d++;
        if (t >= since30) leads30d++;
        const day = localDay(new Date(t));
        if (byDayMap.has(day)) byDayMap.set(day, byDayMap.get(day) + 1);
        const topic = l.topic || '(brak)';
        byTopic[topic] = (byTopic[topic] || 0) + 1;
        bySource[l.source] = (bySource[l.source] || 0) + 1;
        byStatus[l.status] = (byStatus[l.status] || 0) + 1;
      }

      const latest = [...store.leads]
        .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
        .slice(0, 5)
        .map(({ id, ts, name, email, company, topic, source, status }) => ({ id, ts, name, email, company, topic, source, status }));

      let postsPublished = 0;
      let postsDraft = 0;
      for (const p of store.posts) {
        if (p.status === 'published') postsPublished++;
        else postsDraft++;
      }
      const topPosts = store.posts
        .filter((p) => (p.views || 0) > 0)
        .sort((a, b) => (b.views || 0) - (a.views || 0) || a.title.localeCompare(b.title, 'pl'))
        .slice(0, 5)
        .map(({ id, slug, title, views }) => ({ id, slug, title, views }));

      sendJson(req, res, 200, {
        leadsTotal: store.leads.length,
        leads7d,
        leads30d,
        magnetTotal: store.magnet.length,
        byDay: [...byDayMap].map(([day, n]) => ({ day, n })),
        byTopic,
        bySource,
        byStatus,
        latest,
        postsPublished,
        postsDraft,
        topPosts,
      });
    },
    { admin: true, auth: true },
  );

  // ---- panel: blog ----

  router.add(
    'GET',
    '/api/admin/posts',
    (req, res, { url }) => {
      const status = url.searchParams.get('status') || '';
      if (status && !POST_STATUSES.includes(status)) {
        throw new HttpError(400, `Status musi być jednym z: ${POST_STATUSES.join(', ')}`, { field: 'status' });
      }
      const q = (url.searchParams.get('q') || '').trim();
      const category = (url.searchParams.get('category') || '').trim();
      const tag = (url.searchParams.get('tag') || '').trim();
      const limit = clampInt(url.searchParams.get('limit'), 1, 500, 50);
      const offset = clampInt(url.searchParams.get('offset'), 0, Number.MAX_SAFE_INTEGER, 0);
      const langQ = url.searchParams.get('lang') || '';
      if (langQ && !LANGS.includes(langQ)) throw new HttpError(400, 'Język musi być „pl” albo „en”', { field: 'lang' });
      const { items, total, counts } = posts.listPosts({ status, q, category, tag, lang: langQ, limit, offset });
      sendJson(req, res, 200, { items: items.map(adminListItem), total, counts, limit, offset });
    },
    { admin: true, auth: true },
  );

  router.add(
    'GET',
    '/api/admin/posts/:id',
    (req, res, { params }) => {
      const item = posts.getPost(params.id);
      if (!item) throw new HttpError(404, 'Nie znaleziono');
      sendJson(req, res, 200, { item });
    },
    { admin: true, auth: true },
  );

  router.add(
    'POST',
    '/api/admin/posts',
    async (req, res) => {
      const body = await readJson(req, MAX_POST_BODY);
      const item = posts.createPost(body);
      sendJson(req, res, 200, { ok: true, item });
    },
    { admin: true, auth: true, csrf: true },
  );

  router.add(
    'PUT',
    '/api/admin/posts/:id',
    async (req, res, { params }) => {
      const body = await readJson(req, MAX_POST_BODY);
      const item = posts.updatePost(params.id, body);
      if (!item) throw new HttpError(404, 'Nie znaleziono');
      sendJson(req, res, 200, { ok: true, item });
    },
    { admin: true, auth: true, csrf: true },
  );

  router.add(
    'DELETE',
    '/api/admin/posts/:id',
    (req, res, { params }) => {
      if (!posts.deletePost(params.id)) throw new HttpError(404, 'Nie znaleziono');
      sendJson(req, res, 200, { ok: true });
    },
    { admin: true, auth: true, csrf: true },
  );

  // Podgląd Markdown bez zapisu; :id może być dowolny (także dla jeszcze niezapisanego wpisu).
  router.add(
    'POST',
    '/api/admin/posts/:id/preview',
    async (req, res) => {
      const body = await readJson(req, MAX_POST_BODY);
      const content = strField(body, 'content', { max: 200_000, label: 'treść' });
      sendJson(req, res, 200, derive(content));
    },
    { admin: true, auth: true, csrf: true },
  );

  router.add(
    'POST',
    '/api/admin/upload',
    async (req, res) => {
      const body = await readJson(req, MAX_UPLOAD_BODY);
      const name = strField(body, 'name', { max: 255, label: 'nazwa pliku' });
      const type = strField(body, 'type', { required: true, max: 100, label: 'typ' });
      const buf = decodeBase64(body.data, MAX_UPLOAD);
      const saved = await saveUpload({ uploadsDir: posts.uploadsDir, name, type, buf });
      sendJson(req, res, 200, { ok: true, url: saved.url, width: saved.width, height: saved.height, size: saved.size, type: saved.type });
    },
    { admin: true, auth: true, csrf: true },
  );

  router.add(
    'POST',
    '/api/admin/posts/:id/og',
    async (req, res, { params }) => {
      const post = posts.getPost(params.id);
      if (!post) throw new HttpError(404, 'Nie znaleziono');
      const body = await readJson(req, MAX_UPLOAD_BODY);
      const buf = decodeBase64(body.data, MAX_OG);
      const { url } = await saveOg({ uploadsDir: posts.uploadsDir, slug: post.slug, buf });
      post.og = url;
      post.updatedAt = new Date().toISOString();
      store.persist('posts');
      sendJson(req, res, 200, { ok: true, url });
    },
    { admin: true, auth: true, csrf: true },
  );

  router.add(
    'GET',
    '/api/admin/export.csv',
    (req, res) => {
      const columns = ['id', 'ts', 'status', 'name', 'email', 'company', 'topic', 'source', 'message', 'notes', 'ip', 'ua', 'meta'];
      const cell = (v) => {
        const s = v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
        return `"${s.replace(/"/g, '""')}"`;
      };
      const rows = [columns.map(cell).join(';')];
      const sorted = [...store.leads].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
      for (const l of sorted) rows.push(columns.map((c) => cell(l[c])).join(';'));
      const csv = '﻿' + rows.join('\r\n') + '\r\n';
      send(req, res, 200, csv, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="leady-${localDay()}.csv"`,
        'Cache-Control': 'no-store',
      });
    },
    { admin: true, auth: true },
  );

  // ---- bramka dla tras panelu ----

  function sameHost(req, headerName) {
    const value = req.headers[headerName];
    if (!value) return true; // brak nagłówka → nie da się sprawdzić; wystarcza X-Requested-With
    const host = String(req.headers.host || '').toLowerCase();
    try {
      return new URL(String(value)).host.toLowerCase() === host;
    } catch {
      return false;
    }
  }

  function checkCsrf(req) {
    if (String(req.headers['x-requested-with'] || '').toLowerCase() !== 'fetch') {
      throw new HttpError(403, 'Brak nagłówka X-Requested-With: fetch');
    }
    if (!sameHost(req, 'origin') || !sameHost(req, 'referer')) {
      throw new HttpError(403, 'Żądanie z innej domeny zostało odrzucone');
    }
  }

  return async function handleApi(req, res, url) {
    const { route, params, allowed } = router.match(req.method, url.pathname);
    if (!route) {
      if (allowed && allowed.length) {
        throw new HttpError(405, 'Niedozwolona metoda', { headers: { Allow: allowed.join(', ') } });
      }
      throw new HttpError(404, 'Nie znaleziono');
    }

    const ctx = { url, params, ip: clientIp(req, config.trustProxy), session: null };

    if (route.admin) {
      if (!adminEnabled) {
        throw new HttpError(503, 'Panel nieaktywny: ustaw ADMIN_PASSWORD (albo ADMIN_PASSWORD_HASH) w pliku .env i zrestartuj serwer');
      }
      if (route.csrf) checkCsrf(req);
      if (route.auth) {
        ctx.session = sessionFromRequest(req, secret);
        if (!ctx.session) throw new HttpError(401, 'Wymagane logowanie');
      }
    }

    await route.handler(req, res, ctx);
  };
}
