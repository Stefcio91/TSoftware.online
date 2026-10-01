// Powiadomienia o nowych zgłoszeniach: webhook (POST JSON) i Telegram.
// Wywoływane "w tle" – błędy tylko do logu, nigdy nie blokują odpowiedzi.

import http from 'node:http';
import https from 'node:https';

export function postJson(url, body, { timeoutMs = 10_000 } = {}) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(url);
    } catch {
      reject(new Error(`nieprawidłowy URL`));
      return;
    }
    const mod = target.protocol === 'https:' ? https : target.protocol === 'http:' ? http : null;
    if (!mod) {
      reject(new Error(`nieobsługiwany protokół ${target.protocol}`));
      return;
    }
    const data = Buffer.from(JSON.stringify(body), 'utf8');
    const req = mod.request(
      target,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length,
          'User-Agent': 'tsoftware-server/1.0',
        },
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size <= 4096) chunks.push(c);
        });
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', reject);
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error('przekroczony czas')));
    req.on('error', reject);
    req.end(data);
  });
}

function short(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/**
 * Tworzy obiekt z metodami lead(item) i magnet(item). Adresy bierze z ustawień
 * (settings.notify), a gdy są puste – ze zmiennych środowiskowych.
 */
export function createNotifier({ config, getSettings, log = console }) {
  function targets() {
    const n = (getSettings() || {}).notify || {};
    return {
      webhookUrl: n.webhookUrl || config.notifyWebhookUrl || '',
      telegramToken: n.telegramToken || config.telegramBotToken || '',
      telegramChatId: n.telegramChatId || config.telegramChatId || '',
    };
  }

  async function dispatch(type, item, text) {
    const t = targets();
    const jobs = [];
    if (t.webhookUrl) {
      jobs.push(
        postJson(t.webhookUrl, { type, ts: new Date().toISOString(), item })
          .then((r) => {
            if (r.status >= 300) log.warn(`[notify] webhook odpowiedział ${r.status}`);
          })
          .catch((err) => log.warn(`[notify] webhook: ${err.message}`)),
      );
    }
    if (t.telegramToken && t.telegramChatId) {
      jobs.push(
        postJson(`https://api.telegram.org/bot${t.telegramToken}/sendMessage`, {
          chat_id: t.telegramChatId,
          text,
          disable_web_page_preview: true,
        })
          .then((r) => {
            if (r.status >= 300) log.warn(`[notify] telegram odpowiedział ${r.status}: ${short(r.body, 200)}`);
          })
          .catch((err) => log.warn(`[notify] telegram: ${err.message}`)),
      );
    }
    await Promise.allSettled(jobs);
  }

  const panel = `${config.publicUrl}/admin/`;

  return {
    lead(item) {
      const lines = [
        `Nowe zapytanie (${item.source})`,
        `${item.name} <${item.email}>${item.company ? ' · ' + item.company : ''}`,
        item.topic ? `Temat: ${item.topic}` : '',
        short(item.message, 400),
        `→ ${panel}`,
      ].filter(Boolean);
      dispatch('lead', item, lines.join('\n')).catch(() => {});
    },
    magnet(item) {
      const text = `Lead magnet: ${item.email}${item.name ? ' (' + item.name + ')' : ''}\n→ ${panel}`;
      dispatch('magnet', item, text).catch(() => {});
    },
  };
}
