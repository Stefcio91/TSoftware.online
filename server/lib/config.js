// Konfiguracja: zmienne środowiskowe (.env) + domyślne ustawienia serwisu.
// Ustawienia z DEFAULT_SETTINGS można nadpisać w panelu (zapis do DATA_DIR/settings.json).

import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Katalog `server/` (ten plik leży w `server/lib/`). */
export const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const LEAD_SOURCES = ['form', 'kalkulator', 'konfigurator', 'magnet', 'inne'];
export const LEAD_STATUSES = ['nowe', 'w toku', 'zamkniete'];

export const DEFAULT_SETTINGS = Object.freeze({
  plans: {
    start: { price: 1500, label: 'od 1 500 zł' },
    firma: { price: 4900, label: 'od 4 900 zł' },
    opieka: { price: 490, label: 'od 490 zł/mies.' },
  },
  configurator: {
    base: 900,
    perSystem: 400,
    perAction: 300,
    perAI: 600,
    bonus3Systems: 500,
    spreadLow: 0.85,
    spreadHigh: 1.25,
  },
  contact: {
    owner: 'Tomasz Stachowiak',
    company: 'TSoftware Tomasz Stachowiak',
    nip: '8842684500',
    address: 'ul. Sportowa 10E, 58-130 Mrowiny',
    email: 'kontakt@tsoftware.online',
    phone: '+48 503 844 406',
    whatsapp: '48503844406',
    hours: 'pon.–pt. 9:00–17:00',
  },
  features: { intro: true, leadMagnet: true, whatsapp: true, themeSwitch: true },
  theme: { default: 'slate' },
  magnet: {
    enabled: true,
    title: '30 procesów, które da się zautomatyzować w tydzień',
    url: '/assets/dl/30-procesow-do-automatyzacji.pdf',
  },
  notify: { webhookUrl: '', telegramToken: '', telegramChatId: '' },
});

function parseTrustProxy(v) {
  if (v === undefined || v === null || v === '') return 0;
  const s = String(v).trim().toLowerCase();
  if (s === 'true' || s === 'yes') return 1;
  if (s === 'false' || s === 'no') return 0;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function parsePort(v, fallback) {
  if (v === undefined || v === null || String(v).trim() === '') return fallback;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 65535 ? n : fallback;
}

/**
 * Czyta konfigurację z obiektu środowiska (domyślnie process.env).
 * Testy przekazują własny obiekt, żeby nie dotykać process.env.
 */
export function loadConfig(env = process.env) {
  return {
    port: parsePort(env.PORT, 3000),
    host: env.HOST || '127.0.0.1',
    staticDir: path.resolve(env.STATIC_DIR || path.resolve(SERVER_DIR, '..')),
    dataDir: path.resolve(env.DATA_DIR || path.join(SERVER_DIR, 'data')),
    adminPassword: env.ADMIN_PASSWORD || '',
    adminPasswordHash: env.ADMIN_PASSWORD_HASH || '',
    sessionSecret: env.SESSION_SECRET || '',
    // 0 = nie ufaj nagłówkom X-Forwarded-*; N = liczba zaufanych proxy przed serwerem (Caddy = 1).
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    notifyWebhookUrl: env.NOTIFY_WEBHOOK_URL || '',
    telegramBotToken: env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: env.TELEGRAM_CHAT_ID || '',
    publicUrl: String(env.PUBLIC_URL || 'https://tsoftware.online').replace(/\/+$/, ''),
  };
}
