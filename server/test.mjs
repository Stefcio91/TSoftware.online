// Test dymny serwera: node --test server/test.mjs
// Startuje serwer na losowym porcie z tymczasowym DATA_DIR i ADMIN_PASSWORD=test,
// do tego lokalny odbiornik webhooka, i przechodzi przez publiczne API, panel i pliki statyczne.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsoftware-test-'));

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
  const app2 = await createServer({ PORT: '0', HOST: '127.0.0.1', DATA_DIR: dir }, { log: quiet });
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
