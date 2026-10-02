#!/usr/bin/env node
// Serwer tsoftware.online: pliki statyczne + blog (SSR) + API formularzy + API panelu.
// Tylko wbudowane moduły Node (http, fs, path, crypto, url, zlib). Uruchomienie:
//   ADMIN_PASSWORD=haslo node server/server.js
//   node server/server.js --hash 'haslo'   → wypisuje ADMIN_PASSWORD_HASH

import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './lib/config.js';
import { Store } from './lib/store.js';
import { RateLimiter } from './lib/ratelimit.js';
import { createNotifier } from './lib/notify.js';
import { createApi } from './lib/api.js';
import { createPosts } from './lib/posts.js';
import { createBlogHandler } from './lib/blog.js';
import { createStaticHandler } from './lib/static.js';
import { HttpError, securityHeaders, sendJson, sendText, isSecure } from './lib/http.js';
import { hashPassword } from './lib/auth.js';

const defaultLog = {
  info: (...a) => console.log(...a),
  warn: (...a) => console.warn(...a),
  error: (...a) => console.error(...a),
};

function handleError(req, res, err, isApi, pathname, log) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const known = err instanceof HttpError;
  const status = known ? err.status : 500;
  if (!known) log.error(`[500] ${req.method} ${pathname}: ${(err && err.stack) || err}`);
  if (known && err.headers) for (const [k, v] of Object.entries(err.headers)) res.setHeader(k, v);
  if (status === 413) res.setHeader('Connection', 'close');
  const message = known ? err.message : 'Błąd serwera';
  if (isApi) {
    const body = { ok: false, error: message };
    if (known && err.field) body.field = err.field;
    sendJson(req, res, status, body);
  } else {
    sendText(req, res, status, message);
  }
}

/**
 * Buduje serwer (bez nasłuchiwania). Zwraca { config, store, server, listen(), close() }.
 * `env` to obiekt zmiennych środowiskowych – testy podają własny.
 */
export async function createServer(env = process.env, { log = defaultLog } = {}) {
  const config = loadConfig(env);
  const store = new Store(config.dataDir, log);
  await store.init();
  const secret = config.sessionSecret || (await store.loadOrCreateSecret());
  const posts = createPosts({ store, log, seedFile: config.seedFile, staticDir: config.staticDir });
  await posts.init();
  const limiter = new RateLimiter();
  const notifier = createNotifier({ config, getSettings: () => store.settings, log });
  const api = createApi({ config, store, posts, limiter, notifier, secret, log });
  const blog = createBlogHandler({ config, store, posts, secret, log });
  const serveStatic = createStaticHandler({ staticDir: config.staticDir, log });

  const server = http.createServer(async (req, res) => {
    const started = process.hrtime.bigint();
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      url = new URL('http://localhost/');
    }
    const pathname = url.pathname;
    const isApi = pathname === '/api' || pathname.startsWith('/api/');

    res.once('close', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      log.info(`${req.method} ${pathname} ${res.statusCode} ${ms.toFixed(1)}ms`);
    });

    securityHeaders(res, isSecure(req, config.trustProxy));
    try {
      if (isApi) await api(req, res, url);
      else if (!(await blog(req, res, url))) await serveStatic(req, res, pathname);
    } catch (err) {
      handleError(req, res, err, isApi, pathname, log);
    }
  });
  // Dłużej niż domyślne 5 s, żeby połączenia keep-alive z Caddy nie były zamykane w trakcie żądania.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  return {
    config,
    store,
    posts,
    server,
    adminEnabled: Boolean(config.adminPassword || config.adminPasswordHash),
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.port, config.host, () => {
          server.off('error', reject);
          resolve(server.address());
        });
      });
    },
    async close({ graceMs = 5000 } = {}) {
      limiter.stop();
      await new Promise((resolve) => {
        server.close(() => resolve());
        server.closeIdleConnections?.();
        const t = setTimeout(() => server.closeAllConnections?.(), graceMs);
        t.unref();
      });
      await posts.flush();
      await store.flush();
    },
  };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--hash') {
    const password = argv[1];
    if (!password) {
      console.error("Użycie: node server/server.js --hash 'hasło'");
      process.exit(2);
    }
    console.log(hashPassword(password));
    return;
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Użycie: node server/server.js            uruchamia serwer (konfiguracja przez zmienne środowiskowe, patrz .env.example)');
    console.log("       node server/server.js --hash 'hasło'   wypisuje wartość do ADMIN_PASSWORD_HASH");
    return;
  }

  const log = defaultLog;
  process.on('uncaughtException', (err) => log.error(`[uncaughtException] ${(err && err.stack) || err}`));
  process.on('unhandledRejection', (err) => log.error(`[unhandledRejection] ${(err && err.stack) || err}`));

  const app = await createServer(process.env, { log });
  const addr = await app.listen();
  log.info(`tsoftware-server nasłuchuje na http://${addr.address}:${addr.port}`);
  log.info(`  pliki statyczne: ${app.config.staticDir}`);
  log.info(`  dane: ${app.config.dataDir}`);
  log.info(`  blog: ${app.store.posts.length} wpisów (${app.store.posts.filter((p) => p.status === 'published').length} opublikowanych)`);
  log.info(`  zaufane proxy: ${app.config.trustProxy ? app.config.trustProxy : 'brak (TRUST_PROXY nieustawione)'}`);
  if (!app.adminEnabled) log.warn('  UWAGA: brak ADMIN_PASSWORD / ADMIN_PASSWORD_HASH – panel (/api/admin/*) odpowiada 503');

  let closing = false;
  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    log.info(`${signal}: zamykam serwer…`);
    const force = setTimeout(() => {
      log.error('Wymuszone zakończenie po 10 s');
      process.exit(1);
    }, 10_000);
    force.unref();
    app
      .close()
      .then(() => process.exit(0))
      .catch((err) => {
        log.error(`Błąd przy zamykaniu: ${err.message}`);
        process.exit(1);
      });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((err) => {
    console.error(`Nie udało się uruchomić serwera: ${(err && err.stack) || err}`);
    process.exit(1);
  });
}
