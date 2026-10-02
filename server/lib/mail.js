// Wysyłka e-maili bez zależności: SMTP (STARTTLS / TLS, AUTH PLAIN|LOGIN), Brevo (HTTP API)
// albo „outbox” – zapis wiadomości jako .eml do katalogu (środowisko bez konfiguracji, testy).
// createMailer(config) → { provider, configured, send({to, subject, html, text, headers}) → {messageId} }.

import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';

const SMTP_TIMEOUT_MS = 20_000;

/** "Imię Nazwisko <adres@domena>" | "adres@domena" → { name, email }. */
export function parseAddress(s) {
  const str = String(s || '').trim();
  const m = /^\s*(?:"?([^"<]*)"?\s*)?<([^<>\s]+@[^<>\s]+)>\s*$/.exec(str);
  if (m) return { name: (m[1] || '').trim(), email: m[2].trim() };
  if (/^[^\s<>@]+@[^\s<>@]+$/.test(str)) return { name: '', email: str };
  return { name: '', email: '' };
}

function formatAddress({ name, email }) {
  if (!name) return email;
  // RFC 2047 dla znaków spoza ASCII w nazwie
  const n = /^[\x20-\x7e]*$/.test(name) ? `"${name.replace(/"/g, '\\"')}"` : encodeWord(name);
  return `${n} <${email}>`;
}

function encodeWord(s) {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}

function base64Lines(str) {
  return Buffer.from(str, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
}

/** Buduje surową wiadomość RFC 5322 (multipart/alternative, UTF-8, base64). */
export function buildMime({ from, to, subject, html, text, replyTo = '', headers = {}, messageId }) {
  const boundary = `=_ts_${crypto.randomBytes(12).toString('hex')}`;
  const id = messageId || `<${crypto.randomUUID()}@${parseAddress(from).email.split('@')[1] || os.hostname()}>`;
  const lines = [
    `From: ${formatAddress(parseAddress(from))}`,
    `To: ${formatAddress(parseAddress(to))}`,
    `Subject: ${encodeWord(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${id}`,
    'MIME-Version: 1.0',
  ];
  if (replyTo) lines.push(`Reply-To: ${formatAddress(parseAddress(replyTo))}`);
  for (const [k, v] of Object.entries(headers || {})) {
    if (v === undefined || v === null || v === '') continue;
    if (!/^[A-Za-z0-9-]+$/.test(k)) continue;
    lines.push(`${k}: ${String(v).replace(/[\r\n]+/g, ' ')}`);
  }
  lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`, '');
  lines.push(`--${boundary}`, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', base64Lines(text || ''), '');
  lines.push(`--${boundary}`, 'Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: base64', '', base64Lines(html || ''), '');
  lines.push(`--${boundary}--`, '');
  return { raw: lines.join('\r\n'), messageId: id };
}

// ---------- SMTP ----------

class SmtpError extends Error {
  constructor(message, { code = 0, transient = false } = {}) {
    super(message);
    this.code = code;
    this.transient = transient;
  }
}

/** Minimalny klient SMTP: jedno połączenie, jedna wiadomość. */
export async function sendSmtp({ host, port = 587, secure = false, user = '', pass = '', from, to, raw, allowInsecure = false, timeoutMs = SMTP_TIMEOUT_MS }) {
  let socket = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
  let buffer = '';
  const waiters = [];

  const attach = (s) => {
    s.setEncoding('utf8');
    s.setTimeout(timeoutMs, () => fail(new SmtpError('SMTP: przekroczono czas oczekiwania', { transient: true })));
    s.on('data', (chunk) => {
      buffer += chunk;
      flush();
    });
    s.on('error', (err) => fail(new SmtpError(`SMTP: ${err.message}`, { transient: true })));
    s.on('close', () => fail(new SmtpError('SMTP: połączenie zamknięte', { transient: true })));
  };
  const fail = (err) => {
    while (waiters.length) waiters.shift().reject(err);
  };
  /** Odpowiedź może być wieloliniowa: "250-..." aż do "250 ...". */
  const flush = () => {
    for (;;) {
      const m = /^(\d{3})([ -])([^\r\n]*)\r?\n/.exec(buffer);
      if (!m) return;
      // Zbierz całą odpowiedź (linie z myślnikiem + ostatnia ze spacją)
      const lines = buffer.split(/\r?\n/);
      let i = 0;
      const got = [];
      for (; i < lines.length; i++) {
        const line = lines[i];
        const mm = /^(\d{3})([ -])(.*)$/.exec(line);
        if (!mm) return; // niekompletne
        got.push(mm[3]);
        if (mm[2] === ' ') break;
      }
      if (i >= lines.length) return;
      buffer = lines.slice(i + 1).join('\n');
      const code = Number(m[1]);
      const w = waiters.shift();
      if (w) w.resolve({ code, lines: got });
    }
  };
  const read = () => new Promise((resolve, reject) => {
    waiters.push({ resolve, reject });
    flush();
  });
  const cmd = async (line, ok = [250]) => {
    if (line !== null) socket.write(line + '\r\n');
    const r = await read();
    if (!ok.includes(r.code)) {
      throw new SmtpError(`SMTP ${line ? line.split(' ')[0] : 'greeting'}: ${r.code} ${r.lines.join(' ')}`, { code: r.code, transient: r.code >= 400 && r.code < 500 });
    }
    return r;
  };

  attach(socket);
  try {
    await cmd(null, [220]);
    const me = os.hostname() || 'localhost';
    let ehlo = await cmd(`EHLO ${me}`, [250]);
    if (!secure) {
      const offersTls = ehlo.lines.some((l) => /^STARTTLS/i.test(l));
      if (offersTls) {
        await cmd('STARTTLS', [220]);
        socket.removeAllListeners('data');
        socket.removeAllListeners('error');
        socket.removeAllListeners('close');
        buffer = '';
        socket = await new Promise((resolve, reject) => {
          const t = tls.connect({ socket, servername: host }, () => resolve(t));
          t.once('error', reject);
        });
        attach(socket);
        ehlo = await cmd(`EHLO ${me}`, [250]);
      } else if (!allowInsecure) {
        throw new SmtpError('SMTP: serwer nie oferuje STARTTLS (ustaw SMTP_SECURE=true dla portu 465 albo SMTP_ALLOW_INSECURE=true)');
      }
    }
    if (user) {
      const auth = ehlo.lines.find((l) => /^AUTH\b/i.test(l)) || '';
      if (/PLAIN/i.test(auth) || !/LOGIN/i.test(auth)) {
        const token = Buffer.from(`\0${user}\0${pass}`, 'utf8').toString('base64');
        await cmd(`AUTH PLAIN ${token}`, [235]);
      } else {
        await cmd('AUTH LOGIN', [334]);
        await cmd(Buffer.from(user, 'utf8').toString('base64'), [334]);
        await cmd(Buffer.from(pass, 'utf8').toString('base64'), [235]);
      }
    }
    await cmd(`MAIL FROM:<${parseAddress(from).email}>`, [250]);
    await cmd(`RCPT TO:<${parseAddress(to).email}>`, [250, 251]);
    await cmd('DATA', [354]);
    const body = raw.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
    socket.write(body.endsWith('\r\n') ? body : body + '\r\n');
    await cmd('.', [250]);
    try {
      await cmd('QUIT', [221]);
    } catch {
      /* serwer mógł już zamknąć połączenie */
    }
  } finally {
    socket.removeAllListeners('close');
    socket.end();
    socket.destroy();
  }
  return { ok: true };
}

// ---------- Brevo ----------

async function sendBrevo({ apiKey, from, to, subject, html, text, replyTo, headers }) {
  const sender = parseAddress(from);
  const rcpt = parseAddress(to);
  const payload = {
    sender: { name: sender.name || undefined, email: sender.email },
    to: [{ email: rcpt.email, name: rcpt.name || undefined }],
    subject,
    htmlContent: html,
    textContent: text,
  };
  if (replyTo) payload.replyTo = { email: parseAddress(replyTo).email };
  if (headers && Object.keys(headers).length) payload.headers = headers;
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(SMTP_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Brevo: ${res.status} ${body.slice(0, 200)}`);
    err.transient = res.status === 429 || res.status >= 500;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  return { messageId: data.messageId || '' };
}

// ---------- fabryka ----------

/**
 * config: { mailProvider: 'smtp'|'brevo'|'outbox'|'none', smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass,
 *           smtpAllowInsecure, brevoApiKey, mailFrom, mailOutboxDir }
 */
export function createMailer(config, { log = console } = {}) {
  const provider = config.mailProvider;
  const from = config.mailFrom || 'TSoftware <kontakt@tsoftware.online>';
  const configured = provider === 'smtp' || provider === 'brevo' || provider === 'outbox';
  let sent = 0;

  async function send({ to, subject, html, text, replyTo = '', headers = {} }) {
    if (!configured) {
      const err = new Error('Wysyłka maili nie jest skonfigurowana (MAIL_PROVIDER / SMTP_* / BREVO_API_KEY w .env)');
      err.status = 503;
      throw err;
    }
    const rcpt = parseAddress(to);
    if (!rcpt.email) throw new Error(`Nieprawidłowy adres odbiorcy: ${to}`);
    const msg = buildMime({ from, to, subject, html, text, replyTo, headers });
    if (provider === 'brevo') {
      const r = await sendBrevo({ apiKey: config.brevoApiKey, from, to, subject, html, text, replyTo, headers });
      sent++;
      return { messageId: r.messageId || msg.messageId };
    }
    if (provider === 'smtp') {
      await sendSmtp({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        user: config.smtpUser,
        pass: config.smtpPass,
        allowInsecure: config.smtpAllowInsecure,
        from,
        to,
        raw: msg.raw,
      });
      sent++;
      return { messageId: msg.messageId };
    }
    // outbox: plik .eml
    const dir = config.mailOutboxDir;
    await fsp.mkdir(dir, { recursive: true });
    const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}.eml`;
    await fsp.writeFile(path.join(dir, name), msg.raw, { mode: 0o600 });
    sent++;
    return { messageId: msg.messageId, file: path.join(dir, name) };
  }

  return {
    provider: configured ? provider : 'none',
    configured,
    from,
    send,
    get sentCount() {
      return sent;
    },
    describe() {
      if (provider === 'smtp') return `SMTP ${config.smtpHost}:${config.smtpPort}`;
      if (provider === 'brevo') return 'Brevo API';
      if (provider === 'outbox') return `outbox (${config.mailOutboxDir})`;
      return 'brak';
    },
  };
}
