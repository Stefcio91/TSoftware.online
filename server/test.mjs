// Test dymny serwera: node --test server/test.mjs
// Startuje serwer na losowym porcie z tymczasowym DATA_DIR, ADMIN_PASSWORD=test i tymczasowym
// plikiem wpisów startowych bloga (SEED_FILE), do tego lokalny odbiornik webhooka, i przechodzi
// przez publiczne API, panel, pliki statyczne i blog.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer } from './server.js';

const SERVER_JS = fileURLToPath(new URL('./server.js', import.meta.url));
const quiet = { info() {}, warn: (...a) => console.warn(...a), error: (...a) => console.error(...a) };

let app;
let base;
let dataDir;
let hook;
const hookCalls = [];
let cookie = '';
let leadId = '';
/** Ile POST /api/lead poszło z tego IP (każdy liczy się do limitu 10/min) i ile leadów zapisano. */
let leadPosts = 0;
let storedLeads = 0;

const CSRF = { 'X-Requested-With': 'fetch' };

async function api(pathname, { method = 'GET', body, headers = {}, auth = false, raw = false } = {}) {
  const h = { ...headers };
  if (body !== undefined) {
    h['Content-Type'] = h['Content-Type'] || 'application/json';
  }
  if (auth) {
    h.Cookie = cookie;
    Object.assign(h, CSRF);
  }
  if (pathname === '/api/lead' && method === 'POST') leadPosts++;
  const res = await fetch(base + pathname, {
    method,
    headers: h,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    redirect: 'manual',
  });
  if (raw) return res;
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* nie-JSON */
  }
  return { status: res.status, headers: res.headers, text, json };
}

/** Żądanie z "surową" ścieżką (fetch normalizuje "..", http.request nie). */
function rawGet(rawPath) {
  return new Promise((resolve, reject) => {
    const u = new URL(base);
    const req = http.request({ host: u.hostname, port: u.port, path: rawPath, method: 'GET' }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}

const validLead = (extra = {}) => ({
  name: 'Jan Testowy',
  email: 'jan@example.com',
  company: 'Testowa Sp. z o.o.',
  topic: 'automatyzacja',
  message: 'Chciałbym zautomatyzować fakturowanie.',
  page: 'https://tsoftware.online/#kontakt',
  ...extra,
});

/** Wpisy startowe bloga (częściowe, jak server/seed/posts.json) – importowane przy pierwszym starcie. */
const SEED_POSTS = [
  {
    title: 'Automatyzacja faktur w tydzień',
    excerpt: 'Jak OCR + AI księgują faktury tego samego dnia.',
    content: '# Wstęp\n\nFaktury **kosztowe** lądują w skrzynce.\n\n## Krok 1: OCR\n\nTekst.\n\n## Krok 2: AI\n\n> **Tip:** zacznij od jednego dostawcy.\n\n{{cta}}',
    category: 'Automatyzacja',
    tags: ['faktury', 'n8n'],
    publishedAt: '2026-09-20T10:00:00Z',
    featured: true,
  },
  {
    title: 'Chatbot, który nie wkurza',
    excerpt: 'Asystent AI na WhatsApp.',
    content: '## Po co\n\nBo klienci piszą w nocy. https://tsoftware.online/\n\n| A | B |\n|---|---|\n| 1 | 2 |',
    category: 'AI',
    tags: ['chatbot', 'whatsapp'],
    publishedAt: '2026-09-25T10:00:00Z',
  },
  { title: 'Szkic o ERP', content: '## Szkic\n\nJeszcze piszę.', category: 'Automatyzacja', tags: ['erp', 'n8n'], status: 'draft' },
];

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsoftware-test-'));
  const seedFile = path.join(dataDir, 'seed-posts.json');
  fs.writeFileSync(seedFile, JSON.stringify(SEED_POSTS));

  hook = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      hookCalls.push(JSON.parse(Buffer.concat(chunks).toString()));
      res.writeHead(200).end('{"ok":true}');
    });
  });
  await new Promise((r) => hook.listen(0, '127.0.0.1', r));

  app = await createServer(
    {
      PORT: '0',
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      ADMIN_PASSWORD: 'test',
      NOTIFY_WEBHOOK_URL: `http://127.0.0.1:${hook.address().port}/hook`,
      SEED_FILE: seedFile,
    },
    { log: quiet },
  );
  const addr = await app.listen();
  base = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await app.close({ graceMs: 0 });
  await new Promise((r) => hook.close(r));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// ---------- statyczne ----------

test('GET / zwraca stronę (HTML, no-cache, nagłówki bezpieczeństwa)', async () => {
  const r = await api('/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.equal(r.headers.get('cache-control'), 'no-cache');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(r.text, /<!doctype html>/i);
});

test('GET /assets/css/styles.css: text/css, immutable; gzip gdy klient pozwala', async () => {
  const r = await api('/assets/css/styles.css', { raw: true });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/css/);
  assert.equal(r.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  const encoded = await rawGet('/assets/css/styles.css'); // bez Accept-Encoding → bez gzip
  assert.equal(encoded.headers['content-encoding'], undefined);
  assert.ok(Number(encoded.headers['content-length']) > 0);
  const gz = await new Promise((resolve, reject) => {
    const u = new URL(base);
    http
      .get({ host: u.hostname, port: u.port, path: '/assets/css/styles.css', headers: { 'Accept-Encoding': 'gzip' } }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.headers));
      })
      .on('error', reject);
  });
  assert.equal(gz['content-encoding'], 'gzip');
  assert.equal(gz.vary, 'Accept-Encoding');
});

test('HEAD / zwraca nagłówki bez treści', async () => {
  const r = await api('/', { method: 'HEAD', raw: true });
  assert.equal(r.status, 200);
  assert.equal((await r.text()).length, 0);
});

test('/server/server.js, /deploy/*, dotfiles → 404', async () => {
  assert.equal((await api('/server/server.js')).status, 404);
  assert.equal((await api('/server/lib/api.js')).status, 404);
  assert.equal((await api('/deploy/Caddyfile')).status, 404);
  assert.equal((await api('/.env.example')).status, 404);
  assert.equal((await api('/.github/workflows/deploy.yml')).status, 404);
  assert.equal((await api('/scripts/smoke.mjs')).status, 404);
});

test('path traversal → 404', async () => {
  assert.equal((await rawGet('/assets/../server/server.js')).status, 404);
  assert.equal((await rawGet('/assets/%2e%2e/server/server.js')).status, 404);
  assert.equal((await rawGet('/..%2f..%2fetc/passwd')).status, 404);
  assert.equal((await rawGet('/%2e%2e/%2e%2e/etc/passwd')).status, 404);
  assert.equal((await api('/assets/../server/server.js')).status, 404);
});

test('nieznany /api → 404 JSON', async () => {
  const r = await api('/api/nope');
  assert.equal(r.status, 404);
  assert.deepEqual(r.json, { ok: false, error: 'Nie znaleziono' });
  assert.equal(r.headers.get('cache-control'), 'no-store');
});

// ---------- publiczne API ----------

test('GET /api/config: plany + cache 60 s + ETag/304', async () => {
  const r = await api('/api/config');
  assert.equal(r.status, 200);
  assert.equal(r.json.plans.start.price, 1500);
  assert.equal(r.json.contact.email, 'kontakt@tsoftware.online');
  assert.equal(r.json.magnet.url, '/assets/dl/30-procesow-do-automatyzacji.pdf');
  assert.equal(r.json.notify, undefined);
  assert.equal(r.headers.get('cache-control'), 'public, max-age=60');
  const etag = r.headers.get('etag');
  assert.ok(etag);
  const r2 = await api('/api/config', { headers: { 'If-None-Match': etag }, raw: true });
  assert.equal(r2.status, 304);
});

test('GET /api/health', async () => {
  const r = await api('/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.equal(typeof r.json.uptime, 'number');
  assert.equal(r.json.leads, 0);
});

test('POST /api/lead bez application/json → 415', async () => {
  const r = await api('/api/lead', { method: 'POST', body: 'name=x', headers: { 'Content-Type': 'text/plain' } });
  assert.equal(r.status, 415);
  assert.equal(r.json.ok, false);
});

test('POST /api/lead poprawny → 200 + id, webhook dostaje powiadomienie', async () => {
  const r = await api('/api/lead', { method: 'POST', body: validLead() });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.ok, true);
  assert.match(r.json.id, /^[0-9a-f-]{36}$/);
  leadId = r.json.id;
  storedLeads++;
  for (let i = 0; i < 50 && hookCalls.length === 0; i++) await new Promise((res) => setTimeout(res, 20));
  assert.equal(hookCalls.length, 1);
  assert.equal(hookCalls[0].type, 'lead');
  assert.equal(hookCalls[0].item.id, leadId);
  assert.equal(hookCalls[0].item.meta.page, 'https://tsoftware.online/#kontakt');
});

test('honeypot → 200 bez zapisu', async () => {
  const r = await api('/api/lead', { method: 'POST', body: validLead({ website: 'http://spam', name: 'Bot' }) });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true });
  assert.equal((await api('/api/health')).json.leads, storedLeads);
});

test('walidacja: zły e-mail → 400, za krótkie imię → 400, zły source → 400', async () => {
  let r = await api('/api/lead', { method: 'POST', body: validLead({ email: 'nie-email' }) });
  assert.equal(r.status, 400);
  assert.equal(r.json.field, 'email');
  r = await api('/api/lead', { method: 'POST', body: validLead({ name: 'J' }) });
  assert.equal(r.status, 400);
  assert.equal(r.json.field, 'name');
  r = await api('/api/lead', { method: 'POST', body: validLead({ source: 'facebook' }) });
  assert.equal(r.status, 400);
  assert.equal(r.json.field, 'source');
  assert.equal((await api('/api/health')).json.leads, storedLeads);
});

test('limit 10/min na /api/lead → 429', async () => {
  // Limit liczy każdy POST /api/lead z tego IP (także 415, honeypot i odrzucone walidacją).
  const allowedLeft = 10 - leadPosts;
  assert.ok(allowedLeft > 0 && allowedLeft < 10, `nieoczekiwana liczba wcześniejszych żądań: ${leadPosts}`);
  const statuses = [];
  for (let i = 0; i < allowedLeft + 2; i++) {
    const r = await api('/api/lead', { method: 'POST', body: validLead({ name: `Osoba ${i}`, source: i % 2 ? 'kalkulator' : 'form' }) });
    statuses.push(r.status);
    if (r.status === 200) storedLeads++;
    if (r.status === 429) {
      assert.equal(r.json.ok, false);
      assert.ok(r.headers.get('retry-after'));
      break;
    }
  }
  assert.deepEqual(statuses, [...new Array(allowedLeft).fill(200), 429]);
  assert.equal(leadPosts, 11);
  assert.equal((await api('/api/health')).json.leads, storedLeads);
});

test('POST /api/magnet: zapis + url; duplikat nie tworzy drugiego wpisu', async () => {
  let r = await api('/api/magnet', { method: 'POST', body: { email: 'Anna@Example.com', name: 'Anna' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.url, '/assets/dl/30-procesow-do-automatyzacji.pdf');
  r = await api('/api/magnet', { method: 'POST', body: { email: 'anna@example.com' } });
  assert.equal(r.status, 200);
  r = await api('/api/magnet', { method: 'POST', body: { email: 'zly' } });
  assert.equal(r.status, 400);
  r = await api('/api/magnet', { method: 'POST', body: { email: 'bot@x.pl', website: 'spam' } });
  assert.equal(r.status, 200);
});

// ---------- panel ----------

test('admin bez sesji → 401; bez X-Requested-With → 403', async () => {
  assert.equal((await api('/api/admin/me')).status, 401);
  assert.equal((await api('/api/admin/leads')).status, 401);
  const r = await api('/api/admin/login', { method: 'POST', body: { password: 'test' } });
  assert.equal(r.status, 403);
  const bad = await api('/api/admin/login', { method: 'POST', body: { password: 'test' }, headers: { ...CSRF, Origin: 'https://evil.example' } });
  assert.equal(bad.status, 403);
});

test('login: złe hasło → 401, dobre → ciasteczko ts_admin', async () => {
  let r = await api('/api/admin/login', { method: 'POST', body: { password: 'zle' }, headers: CSRF });
  assert.equal(r.status, 401);
  assert.deepEqual(r.json, { ok: false, error: 'Złe hasło' });

  r = await api('/api/admin/login', { method: 'POST', body: { password: 'test' }, headers: CSRF, raw: true });
  assert.equal(r.status, 200);
  const setCookie = r.headers.getSetCookie()[0];
  assert.match(setCookie, /^ts_admin=[^;]+; Path=\/; HttpOnly; SameSite=Strict; Max-Age=604800$/);
  cookie = setCookie.split(';')[0];

  const me = await api('/api/admin/me', { auth: true });
  assert.equal(me.status, 200);
  assert.equal(me.json.ok, true);
  assert.ok(Date.parse(me.json.exp) > Date.now() + 6 * 24 * 3600 * 1000);
});

test('GET /api/admin/leads: lista, szukanie, filtry, liczniki', async () => {
  let r = await api('/api/admin/leads', { auth: true });
  assert.equal(r.status, 200);
  assert.equal(r.json.total, storedLeads);
  assert.equal(r.json.items.length, storedLeads);
  assert.deepEqual(r.json.counts, { nowe: storedLeads, 'w toku': 0, zamkniete: 0, all: storedLeads });
  const item = r.json.items.find((l) => l.id === leadId);
  assert.ok(item);
  assert.equal(item.name, 'Jan Testowy');
  assert.equal(item.status, 'nowe');
  assert.equal(item.ip, '127.0.0.x');
  assert.deepEqual(Object.keys(item).sort(), ['company', 'email', 'id', 'ip', 'message', 'meta', 'name', 'notes', 'source', 'status', 'topic', 'ts', 'ua'].sort());

  r = await api('/api/admin/leads?q=testowy', { auth: true });
  assert.equal(r.json.total, 1);
  assert.equal(r.json.items[0].id, leadId);

  const kalkulator = Math.floor((storedLeads - 1) / 2); // co drugi lead z pętli limitu
  r = await api('/api/admin/leads?source=kalkulator', { auth: true });
  assert.equal(r.json.total, kalkulator);

  r = await api('/api/admin/leads?limit=2&offset=1', { auth: true });
  assert.equal(r.json.items.length, 2);
  assert.equal(r.json.total, storedLeads);

  r = await api(`/api/admin/leads/${leadId}`, { auth: true });
  assert.equal(r.status, 200);
  assert.equal(r.json.item.id, leadId);
  assert.equal((await api('/api/admin/leads/nie-ma', { auth: true })).status, 404);
});

test('PATCH /api/admin/leads/:id: status + notatki; zły status → 400', async () => {
  let r = await api(`/api/admin/leads/${leadId}`, { method: 'PATCH', auth: true, body: { status: 'w toku', notes: 'Oddzwonić' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.item.status, 'w toku');
  assert.equal(r.json.item.notes, 'Oddzwonić');
  r = await api(`/api/admin/leads/${leadId}`, { method: 'PATCH', auth: true, body: { status: 'dziwny' } });
  assert.equal(r.status, 400);
  r = await api('/api/admin/leads?status=w%20toku', { auth: true });
  assert.equal(r.json.total, 1);
  assert.equal(r.json.counts['w toku'], 1);
});

test('GET /api/admin/stats: byDay ma 30 dni', async () => {
  const r = await api('/api/admin/stats', { auth: true });
  assert.equal(r.status, 200);
  assert.equal(r.json.leadsTotal, storedLeads);
  assert.equal(r.json.leads7d, storedLeads);
  assert.equal(r.json.leads30d, storedLeads);
  assert.equal(r.json.magnetTotal, 1);
  assert.equal(r.json.byDay.length, 30);
  assert.match(r.json.byDay[0].day, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(r.json.byDay.reduce((n, d) => n + d.n, 0), storedLeads);
  assert.equal(r.json.bySource.kalkulator, Math.floor((storedLeads - 1) / 2));
  assert.equal(r.json.bySource.form + r.json.bySource.kalkulator, storedLeads);
  assert.equal(r.json.byStatus['w toku'], 1);
  assert.equal(r.json.byTopic.automatyzacja, storedLeads);
  assert.equal(r.json.latest.length, Math.min(5, storedLeads));
});

test('ustawienia: GET maskuje sekrety, PUT zmienia cenę i /api/config to widzi', async () => {
  let r = await api('/api/admin/settings', { auth: true });
  assert.equal(r.status, 200);
  assert.equal(r.json.plans.start.price, 1500);
  assert.equal(r.json.notify.telegramToken, '');

  r = await api('/api/admin/settings', {
    method: 'PUT',
    auth: true,
    body: { plans: { start: { price: 1900 } }, notify: { telegramToken: '123456:ABCDEF' }, nieznane: { x: 1 } },
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.plans.start.price, 1900);
  assert.equal(r.json.plans.start.label, 'od 1 500 zł');
  assert.equal(r.json.plans.firma.price, 4900);
  assert.equal(r.json.notify.telegramToken, '••••CDEF');
  assert.equal(r.json.nieznane, undefined);

  // Zamaskowana wartość odesłana z powrotem nie nadpisuje sekretu.
  r = await api('/api/admin/settings', { method: 'PUT', auth: true, body: { notify: { telegramToken: '••••CDEF' } } });
  assert.equal(r.json.notify.telegramToken, '••••CDEF');
  assert.equal(app.store.settings.notify.telegramToken, '123456:ABCDEF');

  r = await api('/api/admin/settings', { method: 'PUT', auth: true, body: { plans: { start: { price: -5 } } } });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /plans\.start\.price/);

  const cfg = await api('/api/config');
  assert.equal(cfg.json.plans.start.price, 1900);

  await app.store.flush();
  const onDisk = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8'));
  assert.equal(onDisk.plans.start.price, 1900);
});

test('GET /api/admin/export.csv: BOM, średniki, nagłówek', async () => {
  const r = await api('/api/admin/export.csv', { auth: true, raw: true });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv/);
  assert.match(r.headers.get('content-disposition'), /attachment; filename="leady-/);
  const buf = Buffer.from(await r.arrayBuffer());
  assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const lines = buf.toString('utf8').slice(1).split('\r\n').filter(Boolean);
  assert.equal(lines[0], '"id";"ts";"status";"name";"email";"company";"topic";"source";"message";"notes";"ip";"ua";"meta"');
  assert.equal(lines.length, storedLeads + 1);
});

test('magnet w panelu: lista + DELETE', async () => {
  let r = await api('/api/admin/magnet', { auth: true });
  assert.equal(r.json.total, 1);
  assert.equal(r.json.items[0].email, 'Anna@Example.com');
  assert.equal(r.json.items[0].name, 'Anna');
  r = await api(`/api/admin/magnet/${r.json.items[0].id}`, { method: 'DELETE', auth: true });
  assert.equal(r.status, 200);
  assert.equal((await api('/api/admin/magnet', { auth: true })).json.total, 0);
});

test('DELETE /api/admin/leads/:id', async () => {
  const r = await api(`/api/admin/leads/${leadId}`, { method: 'DELETE', auth: true });
  assert.equal(r.status, 200);
  assert.equal((await api(`/api/admin/leads/${leadId}`, { auth: true })).status, 404);
  storedLeads--;
  assert.equal((await api('/api/health')).json.leads, storedLeads);
});

test('dane są trwałe: leads.json na dysku ma tyle wpisów, ile zapisano', async () => {
  await app.store.flush();
  const leads = JSON.parse(fs.readFileSync(path.join(dataDir, 'leads.json'), 'utf8'));
  assert.equal(leads.length, storedLeads);
  assert.ok(fs.existsSync(path.join(dataDir, 'secret')));
  assert.equal(fs.readdirSync(dataDir).filter((f) => f.endsWith('.tmp')).length, 0);
});

// ---------- blog ----------

const SEED_TITLE = 'Automatyzacja faktur w tydzień';
const SEED_SLUG = 'automatyzacja-faktur-w-tydzien';
const SEED2_SLUG = 'chatbot-ktory-nie-wkurza';
let postId = '';
let postSlug = '';
let mediaUrl = '';
let ogUrl = '';

/** Minimalny poprawny PNG (RGBA, przezroczyste piksele) o zadanych wymiarach. */
function pngFixture(width = 1, height = 1) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bity na kanał
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('blog: import z pliku startowego → /blog/ 200 z tytułem; /blog i /blog/x → 301; HEAD; ETag/304', async () => {
  assert.equal(app.store.posts.length, 3);
  assert.ok(fs.existsSync(path.join(dataDir, 'posts.json')));
  const r = await api('/blog/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html; charset=utf-8/);
  assert.equal(r.headers.get('cache-control'), 'no-cache');
  assert.match(r.headers.get('content-security-policy'), /frame-src https:\/\/www\.youtube-nocookie\.com/);
  assert.ok(r.text.includes(SEED_TITLE));
  assert.ok(r.text.includes('pcard--big'), 'wyróżniony wpis');
  assert.ok(r.text.includes(`/blog/${SEED2_SLUG}/`));
  assert.ok(!r.text.includes('Szkic o ERP'), 'szkic nie jest na liście');
  assert.ok(r.text.includes('"@type":"Blog"'));
  const etag = r.headers.get('etag');
  assert.ok(etag);
  assert.equal((await api('/blog/', { headers: { 'If-None-Match': etag }, raw: true })).status, 304);

  let red = await api('/blog', { raw: true });
  assert.equal(red.status, 301);
  assert.equal(red.headers.get('location'), '/blog/');
  red = await api('/blog/' + SEED_SLUG + '?utm=1', { raw: true });
  assert.equal(red.status, 301);
  assert.equal(red.headers.get('location'), `/blog/${SEED_SLUG}/?utm=1`);

  const head = await api('/blog/', { method: 'HEAD', raw: true });
  assert.equal(head.status, 200);
  assert.equal((await head.text()).length, 0);
});

test('blog: /blog/<slug>/ ma <h1>, BlogPosting JSON-LD, spis treści, callout, CTA i sąsiedni wpis', async () => {
  const r = await api(`/blog/${SEED_SLUG}/`);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes(`<h1>${SEED_TITLE}</h1>`));
  assert.ok(r.text.includes('"@type":"BlogPosting"'));
  assert.ok(r.text.includes('"@type":"BreadcrumbList"'));
  assert.ok(r.text.includes(`<link rel="canonical" href="https://tsoftware.online/blog/${SEED_SLUG}/">`));
  assert.ok(r.text.includes('<h2 id="wstep">Wstęp</h2>'), 'h1 w treści staje się h2 z id');
  assert.ok(r.text.includes('class="toc__l2"><a href="#krok-1-ocr">'));
  assert.ok(r.text.includes('class="callout callout--tip"'));
  assert.ok(r.text.includes('class="cta-inline"'));
  assert.ok(r.text.includes(`href="/blog/${SEED2_SLUG}/" rel="next"`), 'nowszy wpis jako „Następny”');
  assert.equal(r.headers.get('x-robots-tag'), null);
});

test('blog: nieznany slug, zły slug, strona poza zakresem → 404 HTML; POST → 405', async () => {
  for (const p of ['/blog/nie-ma-takiego/', '/blog/Zly_Slug/', '/blog/strona/99/', '/blog/strona/abc/', '/blog/kategoria/nie-ma/', '/blog/tag/nie-ma/', '/blog/a/b/c/']) {
    const r = await api(p);
    assert.equal(r.status, 404, p);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.ok(r.text.includes('Tego wpisu nie ma'), p);
    assert.ok(r.text.includes('noindex'), p);
  }
  const r = await api('/blog/', { method: 'POST', body: {} });
  assert.equal(r.status, 405);
  assert.equal(r.headers.get('allow'), 'GET, HEAD');
});

test('blog: kategoria i tag z paginacją i przekierowaniem strony 1', async () => {
  let r = await api('/blog/kategoria/automatyzacja/');
  assert.equal(r.status, 200);
  assert.ok(r.text.includes('<h1>Automatyzacja</h1>'));
  assert.ok(r.text.includes(SEED_TITLE));
  assert.ok(!r.text.includes(SEED2_SLUG));
  assert.ok(r.text.includes('1 wpis.'));
  r = await api('/blog/tag/n8n/');
  assert.equal(r.status, 200);
  assert.ok(r.text.includes('<h1>#n8n</h1>'));
  const red = await api('/blog/kategoria/automatyzacja/strona/1/', { raw: true });
  assert.equal(red.status, 301);
  assert.equal(red.headers.get('location'), '/blog/kategoria/automatyzacja/');
  assert.equal((await api('/blog/kategoria/automatyzacja/strona/2/')).status, 404);
});

test('blog: /blog/feed.xml to RSS z pozycjami i cache 10 min', async () => {
  const r = await api('/blog/feed.xml');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/rss+xml; charset=utf-8');
  assert.equal(r.headers.get('cache-control'), 'public, max-age=600');
  assert.match(r.text, /^<\?xml version="1.0" encoding="UTF-8"\?>\s*<rss version="2.0"/);
  assert.equal((r.text.match(/<item>/g) || []).length, 2);
  assert.ok(r.text.includes(`<link>https://tsoftware.online/blog/${SEED_SLUG}/</link>`));
  assert.ok(r.text.includes(`<title><![CDATA[${SEED_TITLE}]]></title>`));
  assert.ok(r.text.includes('<content:encoded><![CDATA[<h2 id="wstep">'));
});

test('blog: /sitemap.xml jest dynamiczny (strona, polityka, blog, kategorie, wpisy z lastmod)', async () => {
  const r = await api('/sitemap.xml');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /application\/xml/);
  assert.ok(r.text.includes('<loc>https://tsoftware.online/</loc>'));
  assert.ok(r.text.includes('<loc>https://tsoftware.online/polityka-prywatnosci.html</loc>'));
  assert.ok(r.text.includes('<loc>https://tsoftware.online/blog/</loc>'));
  assert.ok(r.text.includes('<loc>https://tsoftware.online/blog/kategoria/automatyzacja/</loc>'));
  assert.ok(r.text.includes(`<loc>https://tsoftware.online/blog/${SEED_SLUG}/</loc>`));
  assert.match(r.text, new RegExp(`${SEED_SLUG}/</loc>\\s*<lastmod>\\d{4}-\\d{2}-\\d{2}</lastmod>`));
  assert.ok(!r.text.includes('szkic-o-erp'));
});

test('blog: /llms.txt = treść statyczna + sekcja „## Blog” z opublikowanymi wpisami', async () => {
  const r = await api('/llms.txt');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/plain/);
  assert.ok(r.text.startsWith('# TSoftware'));
  assert.ok(r.text.includes('\n## Blog\n'));
  assert.ok(r.text.includes(`- [${SEED_TITLE}](https://tsoftware.online/blog/${SEED_SLUG}/) — Jak OCR + AI`));
  assert.ok(!r.text.includes('Szkic o ERP'));
});

test('GET /api/posts: kształt pozycji, limit, filtr kategorii; /api/posts/:slug z html; nieznany → 404 JSON', async () => {
  let r = await api('/api/posts?limit=1');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'public, max-age=60');
  assert.equal(r.json.items.length, 1);
  const item = r.json.items[0];
  assert.equal(item.slug, SEED2_SLUG, 'najnowszy najpierw');
  assert.deepEqual(
    Object.keys(item).sort(),
    ['id', 'slug', 'title', 'excerpt', 'cover', 'coverAlt', 'category', 'categorySlug', 'tags', 'publishedAt', 'readingMin', 'url'].sort(),
  );
  assert.equal(item.url, `https://tsoftware.online/blog/${SEED2_SLUG}/`);
  assert.equal(item.readingMin, 1);
  r = await api('/api/posts?category=Automatyzacja&limit=20');
  assert.equal(r.json.items.length, 1);
  assert.equal(r.json.items[0].slug, SEED_SLUG);
  r = await api('/api/posts?tag=whatsapp');
  assert.equal(r.json.items[0].slug, SEED2_SLUG);

  r = await api(`/api/posts/${SEED_SLUG}`);
  assert.equal(r.status, 200);
  assert.ok(r.json.html.includes('<h2 id="wstep">'));
  assert.equal(r.json.content, undefined);
  r = await api('/api/posts/szkic-o-erp');
  assert.equal(r.status, 404);
  assert.deepEqual(r.json, { ok: false, error: 'Nie znaleziono' });
  assert.equal((await api('/api/posts/Zly_Slug')).status, 404);
});

test('panel: POST /api/admin/posts – walidacja, szkic z wyliczonym html/toc/readingMin; lista z licznikami; GET :id', async () => {
  assert.equal((await api('/api/admin/posts')).status, 401);
  let r = await api('/api/admin/posts', { method: 'POST', auth: true, body: { title: 'A' } });
  assert.equal(r.status, 400);
  assert.equal(r.json.field, 'title');
  r = await api('/api/admin/posts', { method: 'POST', auth: true, body: { title: 'Nowy wpis', status: 'inny' } });
  assert.equal(r.status, 400);
  assert.equal(r.json.field, 'status');
  r = await api('/api/admin/posts', { method: 'POST', auth: true, body: { title: 'Nowy wpis', cover: 'http://zle.example/x.png' } });
  assert.equal(r.status, 400);
  assert.equal(r.json.field, 'cover');
  r = await api('/api/admin/posts', { method: 'POST', auth: true, body: { title: 'Nowy wpis', tags: Array.from({ length: 21 }, (_, i) => `t${i}`) } });
  assert.equal(r.status, 400);

  r = await api('/api/admin/posts', {
    method: 'POST',
    auth: true,
    body: {
      title: 'Nowy wpis testowy: ERP i AI',
      excerpt: 'Zajawka.',
      content: '## Pierwszy\n\n' + 'słowo '.repeat(450) + '\n\n## Drugi\n\n### Pod\n\nTekst',
      category: 'Automatyzacja',
      tags: ['n8n', ' #erp ', 'n8n', ''],
      cover: '/assets/img/og.png',
      coverAlt: 'Okładka',
      seo: { title: 'SEO tytuł' },
    },
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.ok, true);
  const item = r.json.item;
  postId = item.id;
  postSlug = item.slug;
  assert.match(postId, /^[0-9a-f-]{36}$/);
  assert.equal(postSlug, 'nowy-wpis-testowy-erp-i-ai');
  assert.equal(item.status, 'draft');
  assert.equal(item.publishedAt, null);
  assert.deepEqual(item.tags, ['n8n', 'erp']);
  assert.equal(item.category, 'Automatyzacja');
  assert.equal(item.categorySlug, 'automatyzacja');
  assert.equal(item.author, 'Tomasz Stachowiak');
  assert.equal(item.readingMin, 2);
  assert.equal(item.views, 0);
  assert.equal(item.featured, false);
  assert.equal(item.og, '');
  assert.deepEqual(item.seo, { title: 'SEO tytuł', description: '' });
  assert.deepEqual(item.toc, [
    { id: 'pierwszy', text: 'Pierwszy', level: 2 },
    { id: 'drugi', text: 'Drugi', level: 2 },
    { id: 'pod', text: 'Pod', level: 3 },
  ]);
  assert.ok(item.html.startsWith('<h2 id="pierwszy">Pierwszy</h2>'));
  assert.deepEqual(
    Object.keys(item).sort(),
    ['id', 'slug', 'title', 'excerpt', 'content', 'html', 'toc', 'cover', 'coverAlt', 'category', 'categorySlug', 'tags', 'status', 'publishedAt', 'createdAt', 'updatedAt', 'author', 'readingMin', 'seo', 'og', 'views', 'featured'].sort(),
  );

  // domyślna kategoria i slug z kolizją
  r = await api('/api/admin/posts', { method: 'POST', auth: true, body: { title: 'Nowy wpis testowy: ERP i AI', content: 'x' } });
  assert.equal(r.json.item.slug, 'nowy-wpis-testowy-erp-i-ai-2');
  assert.equal(r.json.item.category, 'Wpis');
  const dupId = r.json.item.id;

  r = await api('/api/admin/posts', { auth: true });
  assert.equal(r.status, 200);
  assert.equal(r.json.total, 5);
  assert.deepEqual(r.json.counts, { published: 2, draft: 3, all: 5 });
  assert.equal(r.json.items[0].html, undefined, 'lista bez html');
  assert.equal(typeof r.json.items[0].content, 'string');
  r = await api('/api/admin/posts?status=draft&q=erp', { auth: true });
  assert.equal(r.json.total, 3, 'q szuka w tytule/zajawce/treści/tagach');
  assert.deepEqual(r.json.counts, { published: 0, draft: 3, all: 3 });
  r = await api('/api/admin/posts?q=faktur', { auth: true });
  assert.equal(r.json.total, 1);
  assert.equal(r.json.items[0].slug, SEED_SLUG);
  assert.equal((await api('/api/admin/posts?status=dziwny', { auth: true })).status, 400);

  r = await api(`/api/admin/posts/${postId}`, { auth: true });
  assert.equal(r.status, 200);
  assert.equal(r.json.item.id, postId);
  assert.ok(r.json.item.html);
  assert.equal((await api('/api/admin/posts/nie-ma', { auth: true })).status, 404);

  r = await api(`/api/admin/posts/${dupId}`, { method: 'DELETE', auth: true });
  assert.equal(r.status, 200);
});

test('szkic: 404 anonimowo, dla admina 200 z X-Robots-Tag: noindex i bez liczenia odsłon', async () => {
  let r = await api(`/blog/${postSlug}/`);
  assert.equal(r.status, 404);
  r = await api(`/blog/${postSlug}/`, { headers: { Cookie: cookie } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-robots-tag'), 'noindex');
  assert.ok(r.text.includes('<h1>Nowy wpis testowy: ERP i AI</h1>'));
  assert.equal(app.posts.getPost(postId).views, 0);
  assert.equal((await api('/api/posts/' + postSlug)).status, 404);
});

test('PUT /api/admin/posts/:id: publikacja ustawia publishedAt, tytuł nie zmienia sluga, konflikt sluga → 409', async () => {
  let r = await api(`/api/admin/posts/${postId}`, { method: 'PUT', auth: true, body: { status: 'published', title: 'Nowy wpis testowy (v2)' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.item.status, 'published');
  assert.equal(r.json.item.slug, postSlug);
  assert.ok(Date.parse(r.json.item.publishedAt) > Date.now() - 10_000);
  assert.equal(r.json.item.title, 'Nowy wpis testowy (v2)');

  r = await api(`/api/admin/posts/${postId}`, { method: 'PUT', auth: true, body: { slug: SEED_SLUG } });
  assert.equal(r.status, 409);
  assert.deepEqual(r.json, { ok: false, error: 'Ten slug jest już zajęty', field: 'slug' });

  r = await api(`/api/admin/posts/${postId}`, { method: 'PUT', auth: true, body: { slug: 'Nowy Slug ĄĆ', publishedAt: '2026-09-28T12:30' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.item.slug, 'nowy-slug-ac');
  assert.equal(new Date(r.json.item.publishedAt).getTime(), new Date('2026-09-28T12:30').getTime());
  postSlug = r.json.item.slug;
  r = await api(`/api/admin/posts/${postId}`, { method: 'PUT', auth: true, body: { publishedAt: 'wczoraj' } });
  assert.equal(r.status, 400);
  assert.equal(r.json.field, 'publishedAt');
  assert.equal((await api('/api/admin/posts/nie-ma', { method: 'PUT', auth: true, body: { title: 'x' } })).status, 404);

  // teraz jest publiczny: strona, lista, API, podobne wpisy (wspólna kategoria i tag n8n)
  r = await api(`/blog/${postSlug}/`);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes('Podobne wpisy'));
  assert.ok(r.text.includes(`/blog/${SEED_SLUG}/`));
  assert.ok(r.text.includes(`href="/blog/${SEED2_SLUG}/" rel="prev"`), 'starszy wpis (chatbot, 25.09) jako „Poprzedni”');
  assert.ok((await api('/blog/')).text.includes('Nowy wpis testowy (v2)'));
  assert.equal((await api(`/api/posts/${postSlug}`)).status, 200);
  assert.ok((await api('/sitemap.xml')).text.includes(`/blog/${postSlug}/</loc>`));
});

test('POST /api/admin/posts/:id/preview: html z <h2 id=…>, toc, readingMin bez zapisu', async () => {
  const r = await api(`/api/admin/posts/nowy/preview`, { method: 'POST', auth: true, body: { content: '# Nagłówek\n\nTekst **pogrubiony**.\n\n## Nagłówek' } });
  assert.equal(r.status, 200, r.text);
  assert.ok(r.json.html.includes('<h2 id="naglowek">Nagłówek</h2>'));
  assert.ok(r.json.html.includes('<h2 id="naglowek-2">Nagłówek</h2>'));
  assert.ok(r.json.html.includes('<strong>pogrubiony</strong>'));
  assert.equal(r.json.readingMin, 1);
  assert.deepEqual(r.json.toc.map((t) => t.id), ['naglowek', 'naglowek-2']);
  assert.equal((await api(`/api/admin/posts/nowy/preview`, { method: 'POST', auth: true, body: { content: 5 } })).status, 400);
});

test('POST /api/admin/upload: PNG 1×1 → url + wymiary; /media/… serwuje plik; traversal/dotfile → 404; złe dane → 400/413', async () => {
  const png = pngFixture(1, 1);
  let r = await api('/api/admin/upload', { method: 'POST', auth: true, body: { name: 'Zdjęcie Biura.PNG', type: 'image/png', data: png.toString('base64') } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.ok, true);
  assert.match(r.json.url, /^\/media\/\d{4}\/\d{2}\/zdjecie-biura-[0-9a-f]{4}\.png$/);
  assert.equal(r.json.width, 1);
  assert.equal(r.json.height, 1);
  mediaUrl = r.json.url;

  const file = await api(mediaUrl, { raw: true });
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'image/png');
  assert.equal(file.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.ok(file.headers.get('etag'));
  assert.ok(Buffer.from(await file.arrayBuffer()).equals(png));
  assert.equal((await api(mediaUrl, { headers: { 'If-None-Match': file.headers.get('etag') }, raw: true })).status, 304);
  assert.equal((await api(mediaUrl, { method: 'HEAD', raw: true })).status, 200);

  assert.equal((await rawGet('/media/../secret')).status, 404);
  assert.equal((await rawGet('/media/%2e%2e/secret')).status, 404);
  assert.equal((await rawGet('/media/..%2fsecret')).status, 404);
  assert.equal((await api('/media/.hidden')).status, 404);
  assert.equal((await api('/media/')).status, 404);
  assert.equal((await api(path.posix.dirname(mediaUrl) + '/')).status, 404);
  assert.equal((await api('/media/x.png', { method: 'POST', body: {} })).status, 405);

  // data URL + typ bez prefiksu też przechodzi
  r = await api('/api/admin/upload', { method: 'POST', auth: true, body: { name: 'a.png', type: 'png', data: 'data:image/png;base64,' + png.toString('base64') } });
  assert.equal(r.status, 200, r.text);

  r = await api('/api/admin/upload', { method: 'POST', auth: true, body: { name: 'a.bmp', type: 'image/bmp', data: png.toString('base64') } });
  assert.equal(r.status, 400);
  assert.equal(r.json.field, 'type');
  r = await api('/api/admin/upload', { method: 'POST', auth: true, body: { name: 'a.jpg', type: 'image/jpeg', data: png.toString('base64') } });
  assert.equal(r.status, 400, 'sygnatura nie pasuje do typu');
  r = await api('/api/admin/upload', { method: 'POST', auth: true, body: { name: 'a.png', type: 'image/png', data: '%%%' } });
  assert.equal(r.status, 400);
  const svgBad = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  r = await api('/api/admin/upload', { method: 'POST', auth: true, body: { name: 'z.svg', type: 'image/svg+xml', data: svgBad.toString('base64') } });
  assert.equal(r.status, 400);
  const svgBad2 = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><a onclick="x()"></a></svg>');
  r = await api('/api/admin/upload', { method: 'POST', auth: true, body: { name: 'z.svg', type: 'image/svg+xml', data: svgBad2.toString('base64') } });
  assert.equal(r.status, 400);
  const svgOk = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>');
  r = await api('/api/admin/upload', { method: 'POST', auth: true, body: { name: 'ok.svg', type: 'image/svg+xml', data: svgOk.toString('base64') } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.width, 0);
  const svgRes = await api(r.json.url, { raw: true });
  assert.equal(svgRes.headers.get('content-type'), 'image/svg+xml');
  assert.match(svgRes.headers.get('content-security-policy'), /default-src 'none'/);

  const big = Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]);
  r = await api('/api/admin/upload', { method: 'POST', auth: true, body: { name: 'big.png', type: 'image/png', data: big.toString('base64') } });
  assert.equal(r.status, 413);
});

test('POST /api/admin/posts/:id/og: zapisuje PNG i ustawia post.og; nie-PNG → 400', async () => {
  const png = pngFixture(2, 1);
  let r = await api(`/api/admin/posts/${postId}/og`, { method: 'POST', auth: true, body: { data: png.toString('base64') } });
  assert.equal(r.status, 200, r.text);
  assert.match(r.json.url, new RegExp(`^/media/og/${postSlug}\\.png\\?v=\\d+$`));
  ogUrl = r.json.url;
  assert.equal(app.posts.getPost(postId).og, ogUrl);
  assert.equal((await api(`/api/admin/posts/${postId}`, { auth: true })).json.item.og, ogUrl);
  const file = await api(ogUrl, { raw: true });
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'image/png');
  assert.ok((await api(`/blog/${postSlug}/`)).text.includes(`<meta property="og:image" content="https://tsoftware.online${ogUrl.replace(/&/g, '&amp;')}">`));
  r = await api(`/api/admin/posts/${postId}/og`, { method: 'POST', auth: true, body: { data: Buffer.from('nie png').toString('base64') } });
  assert.equal(r.status, 400);
  assert.equal((await api('/api/admin/posts/nie-ma/og', { method: 'POST', auth: true, body: { data: png.toString('base64') } })).status, 404);
});

test('odsłony: dwa anonimowe GET → +2 w topPosts; GET admina nie liczy; zapis na dysk przy flush', async () => {
  const views = async () => (await api('/api/admin/stats', { auth: true })).json.topPosts.find((p) => p.id === postId)?.views || 0;
  const before = await views();
  await api(`/blog/${postSlug}/`);
  await api(`/blog/${postSlug}/`);
  await api(`/blog/${postSlug}/`, { headers: { Cookie: cookie } });
  assert.equal(await views(), before + 2);
  const stats = (await api('/api/admin/stats', { auth: true })).json;
  assert.equal(stats.postsPublished, 3);
  assert.equal(stats.postsDraft, 1);
  assert.deepEqual(Object.keys(stats.topPosts[0]).sort(), ['id', 'slug', 'title', 'views']);
  assert.equal((await api('/api/health')).json.postsTotal, 4);
  await app.posts.flush();
  await app.store.flush();
  const onDisk = JSON.parse(fs.readFileSync(path.join(dataDir, 'posts.json'), 'utf8'));
  assert.equal(onDisk.find((p) => p.id === postId).views, before + 2);
  assert.equal(onDisk.length, 4);
});

test('DELETE /api/admin/posts/:id usuwa wpis i jego plik OG', async () => {
  const ogFile = path.join(dataDir, 'uploads', 'og', `${postSlug}.png`);
  assert.ok(fs.existsSync(ogFile));
  const r = await api(`/api/admin/posts/${postId}`, { method: 'DELETE', auth: true });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true });
  assert.equal((await api(`/api/admin/posts/${postId}`, { auth: true })).status, 404);
  assert.equal((await api(`/api/admin/posts/${postId}`, { method: 'DELETE', auth: true })).status, 404);
  assert.equal((await api(`/blog/${postSlug}/`)).status, 404);
  for (let i = 0; i < 50 && fs.existsSync(ogFile); i++) await new Promise((res) => setTimeout(res, 10));
  assert.ok(!fs.existsSync(ogFile));
  assert.equal((await api('/api/health')).json.postsTotal, 3);
});

test('markdown: escapowanie HTML, javascript: wycięte, youtube, tabela, callout, unikalne id, obrazek, listy', async () => {
  const { render } = await import('./lib/markdown.js');
  let r = render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
  assert.ok(!r.html.includes('<script'));
  assert.ok(r.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(r.html.includes('&lt;img src=x onerror=alert(1)&gt;'));

  r = render('[klik](javascript:alert(1)) [dane](data:text/html,x) [ok](https://example.com "T") [tu](/#kontakt) ![x](javascript:alert(1))');
  assert.ok(!/javascript:|data:/.test(r.html));
  assert.ok(r.html.includes('>klik<') || r.html.includes('klik'));
  assert.ok(r.html.includes('<a href="https://example.com" title="T" target="_blank" rel="noopener">ok</a>'));
  assert.ok(r.html.includes('<a href="/#kontakt">tu</a>'));
  assert.ok(!r.html.includes('target="_blank" rel="noopener">tu'));

  r = render('{{youtube dQw4w9WgXcQ}}\n\n{{youtube <bad>}}\n\n{{cta}}\n\n{{pdf}}');
  assert.ok(r.html.includes('<div class="embed"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" title="YouTube" loading="lazy" allowfullscreen'));
  assert.ok(r.html.includes('<p>{{youtube &lt;bad&gt;}}</p>'));
  assert.equal((r.html.match(/class="cta-inline"/g) || []).length, 2);
  assert.ok(r.html.includes('href="/#lista"'));

  r = render('| A | B |\n|:--|--:|\n| 1 \\| x | **2** |');
  assert.ok(r.html.startsWith('<div class="table-wrap"><table><thead><tr><th style="text-align:left">A</th>'));
  assert.ok(r.html.includes('<td style="text-align:left">1 | x</td><td style="text-align:right"><strong>2</strong></td>'));

  r = render('> **Uwaga:** ostrożnie\n\n> **Efekt:** 2 h dziennie\n\n> zwykły');
  assert.ok(r.html.includes('<blockquote class="callout callout--uwaga"><p><strong>Uwaga:</strong> ostrożnie</p></blockquote>'));
  assert.ok(r.html.includes('class="callout callout--efekt"'));
  assert.ok(r.html.includes('<blockquote><p>zwykły</p></blockquote>'));

  r = render('# Ten sam\n## Ten sam\n### Ten sam\n#### Ten sam\n##   \n## Żółć & "x"');
  assert.deepEqual(r.toc, [
    { id: 'ten-sam', text: 'Ten sam', level: 2 },
    { id: 'ten-sam-2', text: 'Ten sam', level: 2 },
    { id: 'ten-sam-3', text: 'Ten sam', level: 3 },
    { id: 'sekcja', text: '', level: 2 },
    { id: 'zolc-x', text: 'Żółć & "x"', level: 2 },
  ]);
  assert.ok(r.html.includes('<h4 id="ten-sam-4">Ten sam</h4>'));
  assert.ok(r.html.includes('<h2 id="zolc-x">Żółć &amp; &quot;x&quot;</h2>'));

  r = render('![Opis](/media/a.png)\n\nTekst ![inline](/media/b.png) dalej\n\n![](/media/c.png)');
  assert.ok(r.html.includes('<figure><img src="/media/a.png" alt="Opis" loading="lazy" decoding="async"><figcaption>Opis</figcaption></figure>'));
  assert.ok(r.html.includes('<p>Tekst <img src="/media/b.png" alt="inline" loading="lazy" decoding="async"> dalej</p>'));
  assert.ok(r.html.includes('<figure><img src="/media/c.png" alt="" loading="lazy" decoding="async"></figure>'));

  r = render('- a\n- b\n  - b1\n  - b2\n- c\n\n1. x\n2. y\n\n---\n\nlinia  \nłamana\\\ndruga `kod <b>` https://t.pl/x. koniec');
  assert.ok(r.html.includes('<ul><li>a</li><li>b<ul><li>b1</li><li>b2</li></ul></li><li>c</li></ul>'));
  assert.ok(r.html.includes('<ol><li>x</li><li>y</li></ol>'));
  assert.ok(r.html.includes('<hr>'));
  assert.ok(r.html.includes('linia<br>\nłamana<br>\ndruga <code>kod &lt;b&gt;</code> <a href="https://t.pl/x" target="_blank" rel="noopener">https://t.pl/x</a>. koniec'));
  assert.equal(r.plain, 'a b b1 b2 c x y linia łamana druga kod <b> https://t.pl/x. koniec');

  r = render('```js\nconst a = "<b>";\n```');
  assert.equal(r.html, '<pre><code class="language-js">const a = &quot;&lt;b&gt;&quot;;</code></pre>');
  for (const weird of [null, undefined, 42, {}, '', '*', '**', '[', '`', '>'.repeat(100) + 'x', '|\n|-|', '\\', '![', '- ', '1. ']) {
    const out = render(weird);
    assert.equal(typeof out.html, 'string');
    assert.ok(Array.isArray(out.toc));
  }
});

test('logout czyści ciasteczko', async () => {
  const r = await api('/api/admin/logout', { method: 'POST', auth: true, raw: true });
  assert.equal(r.status, 200);
  assert.match(r.headers.getSetCookie()[0], /^ts_admin=; .*Max-Age=0/);
  const me = await api('/api/admin/me', { headers: { Cookie: 'ts_admin=zle.zle' } });
  assert.equal(me.status, 401);
});

test('--hash wypisuje hash scrypt, który działa jako ADMIN_PASSWORD_HASH', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [SERVER_JS, '--hash', 'tajne'], { timeout: 20_000 });
  const hash = stdout.trim();
  assert.match(hash, /^scrypt\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  const { verifyPassword } = await import('./lib/auth.js');
  assert.equal(await verifyPassword('tajne', { hash }), true);
  assert.equal(await verifyPassword('inne', { hash }), false);
});

test('bez ADMIN_PASSWORD panel odpowiada 503', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsoftware-test2-'));
  const app2 = await createServer({ PORT: '0', HOST: '127.0.0.1', DATA_DIR: dir, SEED_FILE: path.join(dir, 'brak.json') }, { log: quiet });
  const addr = await app2.listen();
  try {
    const res = await fetch(`http://127.0.0.1:${addr.port}/api/admin/me`);
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /ADMIN_PASSWORD/);
  } finally {
    await app2.close({ graceMs: 0 });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
