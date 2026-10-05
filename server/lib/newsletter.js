// Newsletter: subskrybenci (double opt-in, wypisanie jednym kliknięciem), kampanie z wpisów bloga,
// szablony maili (pl/en), wysyłka wsadowa przez mail.js, automatyczny tygodniowy przegląd,
// zliczanie kliknięć i strony publiczne (potwierdzenie, wypisanie, archiwum).

import crypto from 'node:crypto';
import { HttpError } from './http.js';
import { render } from './markdown.js';
import { esc, formatDate, postUrl, renderPage } from './blog-templates.js';
import { mergeSettings } from './settings.js';
import { isPlainObject } from './util.js';

export const SUB_STATUSES = ['pending', 'active', 'unsubscribed'];
export const SUB_SOURCES = ['home', 'blog', 'post', 'magnet', 'admin', 'en', 'other'];
export const LANGS = ['pl', 'en'];
const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESEND_MIN_MS = 10 * 60 * 1000;
const MAX_POSTS_PER_CAMPAIGN = 8;
const SEND_CONCURRENCY = 2;
const SEND_PAUSE_MS = 120;
const TICK_MS = 5 * 60 * 1000;
const TOKEN_RE = /^[a-f0-9]{32}$/;

/* ---------- teksty ---------- */
const STR = {
  pl: {
    confirmSubject: 'Potwierdź zapis na newsletter TSoftware',
    confirmTitle: 'Jeszcze jedno kliknięcie',
    confirmBody: 'Ktoś (pewnie Ty) podał ten adres na tsoftware.online. Kliknij przycisk, a od następnego wpisu dostaniesz maila raz w tygodniu. Jeśli to nie Ty, po prostu zignoruj tę wiadomość.',
    confirmBtn: 'Potwierdzam zapis',
    confirmFoot: 'Link działa 7 dni.',
    newOnBlog: 'Nowe na blogu',
    readMore: 'Czytaj dalej',
    minutes: (n) => `${n} min czytania`,
    whyHtml: 'Dostajesz tego maila, bo zapisałeś się na newsletter na tsoftware.online.',
    unsub: 'Wypisz się',
    viewInBrowser: 'Zobacz w przeglądarce',
    address: 'TSoftware Tomasz Stachowiak · ul. Sportowa 10E, 58-130 Mrowiny · NIP 8842684500',
    digestSubject: (titles) => (titles.length === 1 ? `Nowy wpis: ${titles[0]}` : `Nowe na blogu: ${titles[0]} i ${titles.length - 1} ${titles.length - 1 === 1 ? 'inny' : titles.length - 1 < 5 ? 'inne' : 'innych'}`),
    digestIntro: 'Cześć! Raz w tygodniu wysyłam to, co nowego napisałem o automatyzacji i AI w firmach. Bez teorii, z liczbami i z tym, co poszło nie tak.',
    pageConfirmedTitle: 'Zapis potwierdzony',
    pageConfirmedLead: 'Dzięki. Następny mail przyjdzie, jak tylko pojawi się nowy wpis. Do tego czasu możesz poczytać, co już jest.',
    pageExpiredTitle: 'Ten link już nie działa',
    pageExpiredLead: 'Linki potwierdzające działają 7 dni. Zapisz się jeszcze raz, wyślę nowy.',
    pageUnsubTitle: 'Wypisano',
    pageUnsubLead: 'Nie dostaniesz już ode mnie maili. Jeśli to była pomyłka, możesz zapisać się ponownie na stronie bloga.',
    pageBadTitle: 'Nie znam tego linku',
    pageBadLead: 'Link jest ucięty albo nieprawidłowy.',
    pageArchiveTitle: 'Archiwum newslettera',
    toBlog: 'Przejdź na blog',
    toHome: 'Strona główna',
    unsubOk: 'Wypisz mnie',
    unsubAsk: 'Wypisać ten adres z newslettera?',
  },
  en: {
    confirmSubject: 'Confirm your TSoftware newsletter signup',
    confirmTitle: 'One more click',
    confirmBody: 'Someone (probably you) entered this address on tsoftware.online. Click the button and you will get one email a week whenever there is a new post. If this was not you, just ignore this message.',
    confirmBtn: 'Confirm signup',
    confirmFoot: 'The link works for 7 days.',
    newOnBlog: 'New on the blog',
    readMore: 'Read more',
    minutes: (n) => `${n} min read`,
    whyHtml: 'You are getting this email because you signed up for the newsletter on tsoftware.online.',
    unsub: 'Unsubscribe',
    viewInBrowser: 'View in browser',
    address: 'TSoftware Tomasz Stachowiak · ul. Sportowa 10E, 58-130 Mrowiny, Poland · VAT ID PL8842684500',
    digestSubject: (titles) => (titles.length === 1 ? `New post: ${titles[0]}` : `New on the blog: ${titles[0]} and ${titles.length - 1} more`),
    digestIntro: 'Hi! Once a week I send what I have written about automation and AI in small companies. No theory, real numbers, and the parts that went wrong.',
    pageConfirmedTitle: 'Signup confirmed',
    pageConfirmedLead: 'Thanks. The next email arrives as soon as there is a new post. Until then, have a look at what is already there.',
    pageExpiredTitle: 'This link no longer works',
    pageExpiredLead: 'Confirmation links work for 7 days. Sign up again and I will send a new one.',
    pageUnsubTitle: 'Unsubscribed',
    pageUnsubLead: 'You will not get any more emails from me. If this was a mistake, you can sign up again on the blog.',
    pageBadTitle: 'Unknown link',
    pageBadLead: 'The link is cut off or invalid.',
    pageArchiveTitle: 'Newsletter archive',
    toBlog: 'Go to the blog',
    toHome: 'Home page',
    unsubOk: 'Unsubscribe me',
    unsubAsk: 'Remove this address from the newsletter?',
  },
};

export function langOf(v) {
  return v === 'en' ? 'en' : 'pl';
}
function prefix(lang) {
  return lang === 'en' ? '/en' : '';
}
function token() {
  return crypto.randomBytes(16).toString('hex');
}
function normEmail(e) {
  return String(e || '').trim().toLowerCase();
}
function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/* ---------- szablon maila ---------- */
const MAIL_CSS = {
  body: 'margin:0;padding:0;background:#f1f4fb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#121a33;',
  wrap: 'width:100%;max-width:600px;margin:0 auto;',
  card: 'background:#ffffff;border-radius:16px;border:1px solid #e3e8f4;overflow:hidden;',
  pad: 'padding:28px 32px;',
  h1: 'margin:0 0 12px;font-size:24px;line-height:1.25;font-weight:800;color:#121a33;',
  h2: 'margin:0 0 8px;font-size:19px;line-height:1.3;font-weight:700;color:#121a33;',
  p: 'margin:0 0 14px;font-size:16px;line-height:1.55;color:#2a3352;',
  small: 'font-size:12px;line-height:1.5;color:#6b7694;',
  btn: 'display:inline-block;padding:12px 22px;border-radius:10px;background:#3f6ff5;color:#ffffff !important;text-decoration:none;font-weight:700;font-size:15px;',
  cat: 'display:inline-block;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#3f6ff5;font-weight:700;margin-bottom:6px;',
  img: 'display:block;width:100%;height:auto;border-radius:12px;border:0;',
  hr: 'border:0;border-top:1px solid #e3e8f4;margin:22px 0;',
};

function brandRow(site, lang) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:18px"><tr>
    <td style="padding:0"><a href="${esc(site.url + prefix(lang) + '/')}" style="text-decoration:none;color:#121a33;font-weight:800;font-size:17px">
      <span style="display:inline-block;box-sizing:border-box;width:28px;height:28px;border:2px solid #3f6ff5;border-radius:8px;background:#ffffff;color:#121a33;text-align:center;line-height:24px;font-size:14px;font-weight:800;margin-right:8px;vertical-align:middle">T<span style="color:#ffb45c;font-weight:800">_</span></span>TSoftware<span style="color:#6b7694;font-weight:600">.online</span></a></td>
  </tr></table>`;
}

function layout({ site, lang, bodyHtml, preheader = '', footHtml = '' }) {
  const S = STR[lang];
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light"><title>${esc(site.name)}</title></head>
<body style="${MAIL_CSS.body}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f4fb"><tr><td style="padding:24px 12px">
<table role="presentation" cellspacing="0" cellpadding="0" style="${MAIL_CSS.wrap}">
  <tr><td style="padding:0 6px">${brandRow(site, lang)}</td></tr>
  <tr><td style="${MAIL_CSS.card}"><div style="${MAIL_CSS.pad}">${bodyHtml}</div></td></tr>
  <tr><td style="padding:18px 10px 0"><p style="${MAIL_CSS.small};margin:0 0 6px">${footHtml}</p><p style="${MAIL_CSS.small};margin:0">${esc(S.address)}</p></td></tr>
</table></td></tr></table></body></html>`;
}

export function confirmEmail({ site, lang, confirmUrl }) {
  const S = STR[lang];
  const html = layout({
    site,
    lang,
    preheader: S.confirmBody.slice(0, 120),
    bodyHtml: `<h1 style="${MAIL_CSS.h1}">${esc(S.confirmTitle)}</h1><p style="${MAIL_CSS.p}">${esc(S.confirmBody)}</p>
      <p style="margin:22px 0"><a href="${esc(confirmUrl)}" style="${MAIL_CSS.btn}">${esc(S.confirmBtn)}</a></p>
      <p style="${MAIL_CSS.small}">${esc(S.confirmFoot)}<br>${esc(confirmUrl)}</p>`,
    footHtml: esc(S.whyHtml),
  });
  const text = `${S.confirmTitle}\n\n${S.confirmBody}\n\n${S.confirmBtn}: ${confirmUrl}\n\n${S.confirmFoot}\n\n${S.address}\n`;
  return { subject: S.confirmSubject, html, text };
}

/**
 * Mail kampanii. Linki do wpisów idą przez /api/newsletter/click (zliczanie) z UTM.
 * `unsubUrl` i `archiveUrl` mogą zawierać placeholder %%UNSUB%% podmieniany per odbiorca.
 */
export function campaignEmail({ site, lang, campaign, posts, unsubUrl, archiveUrl, introHtml }) {
  const S = STR[lang];
  const click = (url) => `${site.url}/api/newsletter/click?c=${encodeURIComponent(campaign.id)}&u=${encodeURIComponent(url)}`;
  const link = (p) => click(`${postUrl(site, p)}?utm_source=newsletter&utm_medium=email&utm_campaign=${encodeURIComponent(campaign.id)}`);
  const abs = (u) => (/^https?:\/\//i.test(u) ? u : site.url + u);
  const items = posts
    .map(
      (p) => `<hr style="${MAIL_CSS.hr}">
      ${p.cover ? `<a href="${esc(link(p))}"><img src="${esc(abs(p.cover))}" alt="" width="536" style="${MAIL_CSS.img};margin-bottom:14px"></a>` : ''}
      ${p.category ? `<span style="${MAIL_CSS.cat}">${esc(p.category)}</span>` : ''}
      <h2 style="${MAIL_CSS.h2}"><a href="${esc(link(p))}" style="color:#121a33;text-decoration:none">${esc(p.title)}</a></h2>
      <p style="${MAIL_CSS.p}">${esc(p.excerpt || '')}</p>
      <p style="margin:0 0 6px"><a href="${esc(link(p))}" style="color:#3f6ff5;font-weight:700;text-decoration:none">${esc(S.readMore)} →</a> <span style="${MAIL_CSS.small}">· ${esc(S.minutes(Math.max(1, Number(p.readingMin) || 1)))}</span></p>`,
    )
    .join('');
  const bodyHtml = `<span style="${MAIL_CSS.cat}">${esc(S.newOnBlog)}</span><h1 style="${MAIL_CSS.h1}">${esc(campaign.subject)}</h1>
    <div style="${MAIL_CSS.p}">${introHtml || ''}</div>${items}`;
  const footHtml = `${esc(S.whyHtml)} <a href="${esc(unsubUrl)}" style="color:#6b7694">${esc(S.unsub)}</a> · <a href="${esc(archiveUrl)}" style="color:#6b7694">${esc(S.viewInBrowser)}</a>`;
  const html = layout({ site, lang, bodyHtml, preheader: posts[0] ? posts[0].excerpt || '' : '', footHtml });
  const text = [
    campaign.subject,
    '',
    stripHtml(introHtml || ''),
    '',
    ...posts.map((p) => `${p.title}\n${p.excerpt || ''}\n${S.readMore}: ${link(p)}\n`),
    S.whyHtml,
    `${S.unsub}: ${unsubUrl}`,
    `${S.viewInBrowser}: ${archiveUrl}`,
    '',
    S.address,
  ].join('\n');
  return { subject: campaign.subject, html, text };
}

/* ---------- moduł ---------- */

export function createNewsletter({ store, posts, mailer, config, log = console }) {
  const siteUrl = String(config.publicUrl || 'https://tsoftware.online').replace(/\/+$/, '');
  const site = () => ({ url: siteUrl, name: 'TSoftware', author: 'Tomasz Stachowiak', contact: store.settings.contact });
  const subs = () => store.subscribers;
  const camps = () => store.campaigns;
  const jobs = new Map();
  let timer = null;

  const settings = () => store.settings.newsletter || {};
  function patchSettings(patch) {
    const { settings: merged } = mergeSettings(store.settings, { newsletter: patch });
    store.setSettings(merged);
    return merged.newsletter;
  }

  const findByEmail = (email) => subs().find((s) => s.email === normEmail(email)) || null;
  const findById = (id) => subs().find((s) => s.id === id) || null;
  const publicSub = (s) => ({
    id: s.id,
    email: s.email,
    status: s.status,
    source: s.source,
    lang: s.lang,
    createdAt: s.createdAt,
    confirmedAt: s.confirmedAt || null,
    unsubscribedAt: s.unsubscribedAt || null,
  });

  function confirmUrl(s) {
    return `${siteUrl}${prefix(s.lang)}/newsletter/${s.lang === 'en' ? 'confirm' : 'potwierdz'}/${s.confirmToken}`;
  }
  function unsubUrl(s) {
    return `${siteUrl}${prefix(s.lang)}/newsletter/${s.lang === 'en' ? 'unsubscribe' : 'wypisz'}/${s.unsubToken}`;
  }
  function archiveUrl(c) {
    return `${siteUrl}${prefix(c.lang)}/newsletter/${c.lang === 'en' ? 'archive' : 'archiwum'}/${c.id}/`;
  }

  async function sendConfirmation(s) {
    const mail = confirmEmail({ site: site(), lang: s.lang, confirmUrl: confirmUrl(s) });
    s.confirmSentAt = new Date().toISOString();
    store.persist('subscribers');
    try {
      await mailer.send({ to: s.email, ...mail, replyTo: settings().replyTo || '' });
    } catch (err) {
      log.error(`[newsletter] potwierdzenie do ${s.email}: ${err.message}`);
      throw err;
    }
  }

  const api = {
    STR,
    settings,

    /** Zapis ze strony: tworzy/odświeża subskrybenta i wysyła mail potwierdzający. */
    async subscribe({ email, lang = 'pl', source = 'other', ip = '' }) {
      const key = normEmail(email);
      lang = langOf(lang);
      if (!SUB_SOURCES.includes(source)) source = 'other';
      let s = findByEmail(key);
      const now = new Date().toISOString();
      if (s && s.status === 'active') return { status: 'active', existing: true };
      if (s && s.status === 'pending' && s.confirmSentAt && Date.now() - new Date(s.confirmSentAt).getTime() < RESEND_MIN_MS) {
        return { status: 'pending', existing: true, resent: false };
      }
      if (!s) {
        s = { id: crypto.randomUUID(), email: key, status: 'pending', lang, source, createdAt: now, confirmToken: token(), unsubToken: token(), ip };
        subs().push(s);
      } else {
        s.status = 'pending';
        s.lang = lang;
        s.source = source;
        s.confirmToken = token();
        s.unsubscribedAt = null;
        s.createdAt = now;
      }
      store.persist('subscribers');
      if (!mailer.configured) {
        // Bez wysyłki maili nie ma jak potwierdzić – aktywujemy od razu, a admin widzi to w logu.
        log.warn(`[newsletter] brak wysyłki maili: ${key} zapisany jako aktywny bez potwierdzenia`);
        s.status = 'active';
        s.confirmedAt = now;
        s.confirmToken = '';
        store.persist('subscribers');
        return { status: 'active', existing: false, unconfirmed: true };
      }
      await sendConfirmation(s);
      return { status: 'pending', existing: false, resent: true };
    },

    confirm(tok) {
      if (!TOKEN_RE.test(String(tok || ''))) return { ok: false, reason: 'bad' };
      const s = subs().find((x) => x.confirmToken === tok) || null;
      if (!s) return { ok: false, reason: 'bad' };
      if (s.status === 'active') return { ok: true, subscriber: s, already: true };
      if (Date.now() - new Date(s.createdAt).getTime() > CONFIRM_TTL_MS) return { ok: false, reason: 'expired', subscriber: s };
      s.status = 'active';
      s.confirmedAt = new Date().toISOString();
      s.confirmToken = '';
      store.persist('subscribers');
      return { ok: true, subscriber: s };
    },

    unsubscribe(tok) {
      if (!TOKEN_RE.test(String(tok || ''))) return { ok: false };
      const s = subs().find((x) => x.unsubToken === tok) || null;
      if (!s) return { ok: false };
      if (s.status !== 'unsubscribed') {
        s.status = 'unsubscribed';
        s.unsubscribedAt = new Date().toISOString();
        store.persist('subscribers');
      }
      return { ok: true, subscriber: s };
    },

    subscriberByUnsubToken(tok) {
      return TOKEN_RE.test(String(tok || '')) ? subs().find((x) => x.unsubToken === tok) || null : null;
    },

    counts() {
      const c = { active: 0, pending: 0, unsubscribed: 0, all: subs().length };
      for (const s of subs()) c[s.status] = (c[s.status] || 0) + 1;
      return c;
    },

    list({ status = '', q = '', limit = 50, offset = 0 } = {}) {
      const needle = normEmail(q);
      let items = subs().filter((s) => (!status || status === 'all' || s.status === status) && (!needle || s.email.includes(needle)));
      items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return { items: items.slice(offset, offset + limit).map(publicSub), total: items.length, counts: api.counts() };
    },

    activeFor(lang) {
      return subs().filter((s) => s.status === 'active' && s.lang === langOf(lang));
    },

    /** Admin dodaje adres ręcznie (osoba wyraziła zgodę gdzie indziej) – od razu aktywny. */
    addManual({ email, lang = 'pl' }) {
      const key = normEmail(email);
      if (findByEmail(key)) throw new HttpError(409, 'Ten adres już jest na liście');
      const now = new Date().toISOString();
      const s = { id: crypto.randomUUID(), email: key, status: 'active', lang: langOf(lang), source: 'admin', createdAt: now, confirmedAt: now, confirmToken: '', unsubToken: token(), ip: '' };
      subs().push(s);
      store.persist('subscribers');
      return publicSub(s);
    },

    remove(id) {
      const i = subs().findIndex((s) => s.id === id);
      if (i < 0) return false;
      subs().splice(i, 1);
      store.persist('subscribers');
      return true;
    },

    /** Osoby z lead magnetu, które zaznaczyły zgodę marketingową → aktywni subskrybenci. */
    importMagnet() {
      let added = 0;
      let skipped = 0;
      const now = new Date().toISOString();
      for (const m of store.magnet) {
        if (!m.marketing) {
          skipped++;
          continue;
        }
        const key = normEmail(m.email);
        if (!key || findByEmail(key)) {
          skipped++;
          continue;
        }
        subs().push({ id: crypto.randomUUID(), email: key, status: 'active', lang: 'pl', source: 'magnet', createdAt: now, confirmedAt: now, confirmToken: '', unsubToken: token(), ip: '' });
        added++;
      }
      if (added) store.persist('subscribers');
      return { added, skipped };
    },

    exportCsv() {
      const cell = (v) => {
        const s = String(v ?? '');
        return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const rows = [['email', 'status', 'lang', 'source', 'createdAt', 'confirmedAt', 'unsubscribedAt']];
      for (const s of subs()) rows.push([s.email, s.status, s.lang, s.source, s.createdAt, s.confirmedAt || '', s.unsubscribedAt || '']);
      return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
    },

    // ---------- kampanie ----------

    campaigns() {
      return [...camps()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
    getCampaign(id) {
      return camps().find((c) => c.id === id) || null;
    },

    normalizeCampaign(data, existing = null) {
      if (!isPlainObject(data)) throw new HttpError(400, 'Oczekiwano obiektu kampanii');
      const base = existing || {};
      const pick = (k) => (Object.hasOwn(data, k) ? data[k] : base[k]);
      const subject = String(pick('subject') ?? '').replace(/[\r\n\0]/g, ' ').trim();
      if (!subject) throw new HttpError(400, 'Temat jest wymagany', { field: 'subject' });
      if (subject.length > 160) throw new HttpError(400, 'Temat: maksimum 160 znaków', { field: 'subject' });
      const intro = String(pick('intro') ?? '').replace(/\0/g, '').trim();
      if (intro.length > 5000) throw new HttpError(400, 'Wstęp: maksimum 5000 znaków', { field: 'intro' });
      const lang = langOf(pick('lang'));
      let postIds = pick('postIds');
      if (postIds === undefined || postIds === null) postIds = [];
      if (!Array.isArray(postIds) || postIds.some((x) => typeof x !== 'string')) throw new HttpError(400, 'postIds musi być listą identyfikatorów', { field: 'postIds' });
      postIds = [...new Set(postIds)].slice(0, MAX_POSTS_PER_CAMPAIGN);
      for (const id of postIds) {
        const p = posts.getPost(id);
        if (!p || p.status !== 'published') throw new HttpError(400, 'Kampania może zawierać tylko opublikowane wpisy', { field: 'postIds' });
      }
      return { subject, intro, lang, postIds };
    },

    createCampaign(data) {
      const f = api.normalizeCampaign(data);
      const now = new Date().toISOString();
      const c = { id: crypto.randomUUID(), ...f, status: 'draft', createdAt: now, updatedAt: now, sentAt: null, stats: { recipients: 0, sent: 0, failed: 0, clicks: 0 }, html: '' };
      camps().push(c);
      store.persist('campaigns');
      return c;
    },

    updateCampaign(id, data) {
      const c = api.getCampaign(id);
      if (!c) return null;
      if (c.status !== 'draft') throw new HttpError(409, 'Wysłanej kampanii nie da się edytować');
      Object.assign(c, api.normalizeCampaign(data, c), { updatedAt: new Date().toISOString() });
      store.persist('campaigns');
      return c;
    },

    deleteCampaign(id) {
      const i = camps().findIndex((c) => c.id === id);
      if (i < 0) return false;
      if (camps()[i].status === 'sending') throw new HttpError(409, 'Kampania jest w trakcie wysyłki');
      camps().splice(i, 1);
      store.persist('campaigns');
      return true;
    },

    campaignPosts(c) {
      return c.postIds.map((id) => posts.getPost(id)).filter((p) => p && p.status === 'published');
    },

    /** Render maila; `%%UNSUB%%` zostaje do podmiany per odbiorca (test/podgląd dostają link do bloga). */
    renderCampaign(c, { unsubToken = '' } = {}) {
      const s = site();
      const unsub = unsubToken ? `${siteUrl}${prefix(c.lang)}/newsletter/${c.lang === 'en' ? 'unsubscribe' : 'wypisz'}/${unsubToken}` : '%%UNSUB%%';
      const introHtml = c.intro ? render(c.intro, { lang: c.lang }).html : '';
      return campaignEmail({ site: s, lang: c.lang, campaign: c, posts: api.campaignPosts(c), unsubUrl: unsub, archiveUrl: archiveUrl(c), introHtml });
    },

    async sendTest(id, to) {
      const c = api.getCampaign(id);
      if (!c) throw new HttpError(404, 'Nie znaleziono kampanii');
      const mail = api.renderCampaign(c);
      const safe = (v) => v.replace(/%%UNSUB%%/g, `${siteUrl}${prefix(c.lang)}/blog/`);
      await mailer.send({ to, subject: `[TEST] ${mail.subject}`, html: safe(mail.html), text: safe(mail.text), replyTo: settings().replyTo || '' });
      return true;
    },

    /** Startuje wysyłkę w tle; zwraca liczbę odbiorców. */
    startSend(id) {
      const c = api.getCampaign(id);
      if (!c) throw new HttpError(404, 'Nie znaleziono kampanii');
      if (c.status !== 'draft') throw new HttpError(409, 'Ta kampania była już wysyłana');
      if (!mailer.configured) throw new HttpError(503, 'Wysyłka maili nie jest skonfigurowana (MAIL_* w .env)');
      const recipients = api.activeFor(c.lang);
      if (!recipients.length) throw new HttpError(409, 'Brak aktywnych subskrybentów w tym języku');
      const base = api.renderCampaign(c);
      c.status = 'sending';
      c.stats = { recipients: recipients.length, sent: 0, failed: 0, clicks: c.stats?.clicks || 0 };
      c.html = base.html.replace(/%%UNSUB%%/g, `${siteUrl}${prefix(c.lang)}/blog/#newsletter`);
      c.subjectSent = base.subject;
      store.persist('campaigns');
      const job = runSend(c, recipients, base).catch((err) => log.error(`[newsletter] wysyłka ${c.id}: ${err.message}`));
      jobs.set(c.id, job);
      job.finally(() => jobs.delete(c.id));
      return recipients.length;
    },

    /** Czeka na trwające wysyłki (testy, zamykanie). */
    async flush() {
      await Promise.all([...jobs.values()]);
    },

    recordClick(campaignId) {
      const c = api.getCampaign(campaignId);
      if (!c) return false;
      c.stats = c.stats || { recipients: 0, sent: 0, failed: 0, clicks: 0 };
      c.stats.clicks = (c.stats.clicks || 0) + 1;
      store.persist('campaigns');
      return true;
    },

    /** Opublikowane wpisy w danym języku od ostatniego przeglądu (albo z 7 dni, gdy nigdy nie było). */
    newPostsSince(lang) {
      lang = langOf(lang);
      const key = lang === 'en' ? 'lastDigestAtEn' : 'lastDigestAt';
      const since = settings()[key] || new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      return posts
        .published()
        .filter((p) => langOf(p.lang) === lang && p.publishedAt && p.publishedAt > since)
        .slice(0, MAX_POSTS_PER_CAMPAIGN);
    },

    /** Szkic „z nowych wpisów”. */
    createDigest(lang) {
      lang = langOf(lang);
      const list = api.newPostsSince(lang);
      if (!list.length) throw new HttpError(409, lang === 'en' ? 'No new posts since the last digest' : 'Brak nowych wpisów od ostatniego przeglądu');
      const S = STR[lang];
      return api.createCampaign({ subject: S.digestSubject(list.map((p) => p.title)), intro: S.digestIntro, lang, postIds: list.map((p) => p.id) });
    },

    /** Automat: wtorek 9:00 (konfigurowalne) → kampania z nowych wpisów do aktywnych w danym języku. */
    async tick(now = new Date()) {
      const s = settings();
      if (!s.auto || !s.auto.enabled || !mailer.configured) return null;
      const weekday = now.getDay() === 0 ? 7 : now.getDay();
      if (weekday !== Number(s.auto.weekday) || now.getHours() !== Number(s.auto.hour)) return null;
      const results = [];
      for (const lang of LANGS) {
        const key = lang === 'en' ? 'lastDigestAtEn' : 'lastDigestAt';
        const last = s[key] ? new Date(s[key]) : null;
        if (last && now - last < 6 * 24 * 3600 * 1000) continue; // raz w tygodniu
        if (!api.activeFor(lang).length) continue;
        const list = api.newPostsSince(lang);
        if (list.length < Math.max(1, Number(s.auto.minPosts) || 1)) continue;
        let c;
        try {
          c = api.createDigest(lang);
          api.startSend(c.id);
        } catch (err) {
          log.error(`[newsletter] automat (${lang}): ${err.message}`);
          continue;
        }
        patchSettings({ [key]: now.toISOString() });
        results.push({ lang, id: c.id, posts: list.length });
        log.info(`[newsletter] automat (${lang}): kampania ${c.id} z ${list.length} wpisami`);
      }
      return results;
    },

    start() {
      if (timer) return;
      timer = setInterval(() => api.tick().catch((err) => log.error(`[newsletter] tick: ${err.message}`)), TICK_MS);
      timer.unref();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },

    // ---------- strony publiczne ----------

    pageConfirm(tok, lang) {
      const S = STR[lang];
      const r = api.confirm(tok);
      const back = `<p><a class="btn btn--primary" href="${prefix(lang)}/blog/">${esc(S.toBlog)}</a></p>`;
      if (r.ok) return { status: 200, html: renderPage({ site: site(), lang, title: S.pageConfirmedTitle, lead: S.pageConfirmedLead, body: back, noindex: true }) };
      if (r.reason === 'expired') return { status: 410, html: renderPage({ site: site(), lang, title: S.pageExpiredTitle, lead: S.pageExpiredLead, body: back, noindex: true }) };
      return { status: 404, html: renderPage({ site: site(), lang, title: S.pageBadTitle, lead: S.pageBadLead, body: back, noindex: true }) };
    },

    pageUnsubscribe(tok, lang, { confirmed = false } = {}) {
      const S = STR[lang];
      const back = `<p><a class="btn btn--ghost" href="${prefix(lang)}/">${esc(S.toHome)}</a></p>`;
      const s = api.subscriberByUnsubToken(tok);
      if (!s) return { status: 404, html: renderPage({ site: site(), lang, title: S.pageBadTitle, lead: S.pageBadLead, body: back, noindex: true }) };
      if (!confirmed && s.status !== 'unsubscribed') {
        // GET: pytamy (skanery linków w poczcie nie wypiszą nikogo przypadkiem); POST z maila (one-click) wypisuje od razu.
        const form = `<form method="post" action="${prefix(lang)}/newsletter/${lang === 'en' ? 'unsubscribe' : 'wypisz'}/${esc(tok)}"><p>${esc(s.email)}</p><p><button class="btn btn--primary" type="submit">${esc(S.unsubOk)}</button></p></form>`;
        return { status: 200, html: renderPage({ site: site(), lang, title: S.unsub, lead: S.unsubAsk, body: form, noindex: true }) };
      }
      api.unsubscribe(tok);
      return { status: 200, html: renderPage({ site: site(), lang, title: S.pageUnsubTitle, lead: S.pageUnsubLead, body: back, noindex: true }) };
    },

    pageArchive(id, lang) {
      const c = api.getCampaign(String(id || ''));
      if (!c || c.status === 'draft' || !c.html) return null;
      return { status: 200, html: c.html, lang: c.lang };
    },
  };

  async function runSend(c, recipients, base) {
    let idx = 0;
    let dirty = 0;
    const worker = async () => {
      for (;;) {
        const s = recipients[idx++];
        if (!s) return;
        const html = base.html.replace(/%%UNSUB%%/g, unsubUrl(s));
        const text = base.text.replace(/%%UNSUB%%/g, unsubUrl(s));
        const headers = { 'List-Unsubscribe': `<${unsubUrl(s)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click', Precedence: 'bulk' };
        let ok = false;
        for (let attempt = 0; attempt < 2 && !ok; attempt++) {
          try {
            await mailer.send({ to: s.email, subject: base.subject, html, text, replyTo: settings().replyTo || '', headers });
            ok = true;
          } catch (err) {
            if (!err.transient || attempt === 1) {
              log.warn(`[newsletter] ${s.email}: ${err.message}`);
              break;
            }
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
        if (ok) c.stats.sent++;
        else c.stats.failed++;
        if (++dirty >= 20) {
          dirty = 0;
          store.persist('campaigns');
        }
        await new Promise((r) => setTimeout(r, SEND_PAUSE_MS));
      }
    };
    await Promise.all(Array.from({ length: Math.min(SEND_CONCURRENCY, recipients.length) }, worker));
    c.status = 'sent';
    c.sentAt = new Date().toISOString();
    store.persist('campaigns');
    log.info(`[newsletter] kampania ${c.id}: wysłano ${c.stats.sent}, nieudane ${c.stats.failed}`);
  }

  return api;
}
