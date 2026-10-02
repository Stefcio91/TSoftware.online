// Renderer Markdown bez zależności: render(md) → { html, toc, plain }.
// Cały tekst jest escapowany (surowy HTML w treści pokazuje się jako tekst),
// adresy javascript:/data: są wycinane, nagłówki dostają unikalne id.
// Obsługa: nagłówki #..####, akapity, **pogrubienie**, *kursywa*, `kod`, bloki ```lang,
// linki, obrazki (<figure>), listy (jeden poziom zagnieżdżenia), cytaty (+ callouty),
// ---, tabele, twarde łamanie linii, autolinki https://, shortcody {{youtube ID}}, {{cta}}, {{pdf}}.

import { esc, slugify } from './blog-templates.js';

const MAX_DEPTH = 12;

const RE_FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/;
const RE_FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})\s*$/;
const RE_HEADING = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*$/;
const RE_HR = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const RE_QUOTE = /^ {0,3}>/;
const RE_LIST = /^(\s*)([-*+]|\d{1,9}[.)])(?:\s+(.*)|\s*)$/;
const RE_TABLE_CELL = /^:?-+:?$/;
const RE_SHORTCODE = /^\s*\{\{\s*(youtube|cta|pdf)(?:\s+([^\s{}]+))?\s*\}\}\s*$/i;
const RE_YT_ID = /^[A-Za-z0-9_-]{6,20}$/;
const RE_CALLOUT = /^\s*\*\*(uwaga|tip|efekt):\*\*/i;
const RE_IMAGE_ONLY = /^!\[[^\]]*\]\([^)]*\)$/;
const RE_AUTOLINK = /https?:\/\/[^\s<>"'`]+/iy;
const RE_PUNCT = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
const RE_BAD_PROTO = /^(javascript|data|vbscript|file):/i;

const CTA_HTML = '<div class="cta-inline"><p>Masz podobny proces? <a href="/#kontakt">Pogadajmy</a>, policzę, ile da się oddać automatom.</p></div>';
const PDF_HTML = '<div class="cta-inline"><p>Darmowy PDF: <a href="/#lista">30 procesów, które da się zautomatyzować w tydzień</a>.</p></div>';

/** Główne wejście. Nigdy nie rzuca – przy błędzie zwraca treść jako escapowany akapit. */
export function render(md) {
  let text;
  try {
    text = typeof md === 'string' ? md : String(md ?? '');
  } catch {
    text = '';
  }
  text = text.replace(/\r\n?/g, '\n').replace(/\0/g, '').replace(/\t/g, '    ');
  const ctx = { ids: new Set(), toc: [], plain: [], depth: 0 };
  try {
    const html = blocks(text.split('\n'), ctx);
    return { html, toc: ctx.toc, plain: plainText(ctx.plain) };
  } catch {
    return { html: text.trim() ? `<p>${esc(text)}</p>` : '', toc: [], plain: text.replace(/\s+/g, ' ').trim() };
  }
}

function plainText(parts) {
  return parts.join('').replace(/\s+/g, ' ').trim();
}

/** Czy linia zaczyna nowy blok (przerywa akapit / listę). */
function startsBlock(line) {
  return (
    RE_FENCE.test(line) ||
    RE_HEADING.test(line) ||
    RE_HR.test(line) ||
    RE_QUOTE.test(line) ||
    RE_LIST.test(line) ||
    RE_SHORTCODE.test(line)
  );
}

/** Linia separatora tabeli (`|---|:--:|`): każda komórka to same myślniki z opcjonalnymi dwukropkami. */
function isTableSep(line) {
  if (!line.includes('|') || !line.includes('-')) return false;
  const cells = splitCells(line);
  return cells.length > 0 && cells.every((c) => RE_TABLE_CELL.test(c));
}

function isTableStart(lines, i) {
  return i + 1 < lines.length && lines[i].includes('|') && isTableSep(lines[i + 1]);
}

// ---------- bloki ----------

function blocks(lines, ctx) {
  const out = [];
  const n = lines.length;
  let i = 0;
  while (i < n) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    let m = RE_FENCE.exec(line);
    if (m) {
      const fenceChar = m[1][0];
      const lang = m[2].toLowerCase();
      const buf = [];
      i++;
      while (i < n) {
        const c = RE_FENCE_CLOSE.exec(lines[i]);
        if (c && c[1][0] === fenceChar) break;
        buf.push(lines[i]);
        i++;
      }
      i++; // zamknięcie (albo koniec pliku)
      const code = buf.join('\n');
      ctx.plain.push('\n', code, '\n');
      out.push(`<pre><code${lang ? ` class="language-${esc(lang)}"` : ''}>${esc(code)}</code></pre>`);
      continue;
    }

    m = RE_HEADING.exec(line);
    if (m) {
      const level = Math.min(4, Math.max(2, m[1].length));
      const raw = (m[2] || '').replace(/\s+#+\s*$/, '').trim();
      const start = ctx.plain.length;
      const html = inline(raw, ctx);
      const text = plainText(ctx.plain.slice(start));
      const id = uniqueId(ctx, text);
      if (level <= 3) ctx.toc.push({ id, text, level });
      ctx.plain.push('\n');
      out.push(`<h${level} id="${esc(id)}">${html}</h${level}>`);
      i++;
      continue;
    }

    if (RE_HR.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    if (RE_QUOTE.test(line)) {
      const inner = [];
      while (i < n && RE_QUOTE.test(lines[i])) {
        inner.push(lines[i].replace(/^ {0,3}> ?/, ''));
        i++;
      }
      const callout = RE_CALLOUT.exec(inner.join('\n'));
      const cls = callout ? ` class="callout callout--${callout[1].toLowerCase()}"` : '';
      let body;
      if (ctx.depth >= MAX_DEPTH) {
        const text = inner.join('\n');
        ctx.plain.push(text, '\n');
        body = `<p>${esc(text)}</p>`;
      } else {
        ctx.depth++;
        body = blocks(inner, ctx);
        ctx.depth--;
      }
      out.push(`<blockquote${cls}>${body}</blockquote>`);
      continue;
    }

    if (isTableStart(lines, i)) {
      const header = splitCells(lines[i]);
      const aligns = splitCells(lines[i + 1]).map((c) => {
        const l = c.startsWith(':');
        const r = c.endsWith(':');
        return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
      });
      i += 2;
      const rows = [];
      while (i < n && lines[i].trim() && lines[i].includes('|') && !RE_FENCE.test(lines[i])) {
        rows.push(splitCells(lines[i]));
        i++;
      }
      const cell = (tag, text, k) => {
        const style = aligns[k] ? ` style="text-align:${aligns[k]}"` : '';
        const html = inline(text, ctx);
        ctx.plain.push(' ');
        return `<${tag}${style}>${html}</${tag}>`;
      };
      const head = `<thead><tr>${header.map((c, k) => cell('th', c, k)).join('')}</tr></thead>`;
      const body = rows.length
        ? `<tbody>${rows
            .map((r) => `<tr>${header.map((_, k) => cell('td', r[k] ?? '', k)).join('')}</tr>`)
            .join('')}</tbody>`
        : '';
      ctx.plain.push('\n');
      out.push(`<div class="table-wrap"><table>${head}${body}</table></div>`);
      continue;
    }

    m = RE_LIST.exec(line);
    if (m) {
      const r = list(lines, i, ctx);
      out.push(r.html);
      i = r.next;
      continue;
    }

    m = RE_SHORTCODE.exec(line);
    if (m) {
      const html = shortcode(m[1].toLowerCase(), m[2] || '');
      if (html) {
        out.push(html);
        i++;
        continue;
      }
    }

    // akapit
    const para = [line];
    i++;
    while (i < n && lines[i].trim() && !startsBlock(lines[i]) && !isTableStart(lines, i)) {
      para.push(lines[i]);
      i++;
    }
    const text = para.join('\n').trim();
    if (RE_IMAGE_ONLY.test(text)) {
      const img = parseLink(text, 1);
      if (img) {
        out.push(imageHtml(img, ctx, true));
        ctx.plain.push('\n');
        continue;
      }
    }
    out.push(`<p>${inline(text, ctx)}</p>`);
    ctx.plain.push('\n');
  }
  return out.join('\n');
}

function uniqueId(ctx, text) {
  const base = text.trim() ? slugify(text) : 'sekcja';
  let id = base;
  let k = 2;
  while (ctx.ids.has(id)) id = `${base}-${k++}`;
  ctx.ids.add(id);
  return id;
}

function shortcode(name, arg) {
  if (name === 'cta') return CTA_HTML;
  if (name === 'pdf') return PDF_HTML;
  if (name === 'youtube' && RE_YT_ID.test(arg)) {
    return `<div class="embed"><iframe src="https://www.youtube-nocookie.com/embed/${arg}" title="YouTube" loading="lazy" allowfullscreen allow="accelerometer; encrypted-media; picture-in-picture"></iframe></div>`;
  }
  return null;
}

function splitCells(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (c === '|') {
      cells.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

/** Lista od linii `start`; jeden poziom zagnieżdżenia (wcięcie ≥ 2 spacje). */
function list(lines, start, ctx) {
  const n = lines.length;
  const first = RE_LIST.exec(lines[start]);
  const baseIndent = first[1].length;
  const items = []; // { text: [string], children: [{ marker, text: [string] }] }
  let cur = null;
  let child = null;
  let i = start;
  let prevBlank = false;
  const tagFor = (marker) => (/\d/.test(marker) ? 'ol' : 'ul');
  const startAttr = (marker) => {
    if (!/\d/.test(marker)) return '';
    const num = parseInt(marker, 10);
    return num !== 1 ? ` start="${num}"` : '';
  };

  while (i < n) {
    const line = lines[i];
    if (!line.trim()) {
      // pusta linia: lista trwa tylko, gdy dalej jest kolejny punkt albo wcięta kontynuacja
      let j = i + 1;
      while (j < n && !lines[j].trim()) j++;
      if (j < n) {
        const lm = RE_LIST.exec(lines[j]);
        const sameKind = lm && (lm[1].length >= baseIndent + 2 || tagFor(lm[2]) === tagFor(first[2]));
        if ((lm && lm[1].length >= baseIndent && sameKind) || (/^\s{2,}\S/.test(lines[j]) && !RE_HR.test(lines[j]))) {
          prevBlank = true;
          i = j;
          continue;
        }
      }
      break;
    }
    if (RE_HR.test(line) || RE_FENCE.test(line) || RE_HEADING.test(line) || RE_QUOTE.test(line)) break;
    const m = RE_LIST.exec(line);
    if (m) {
      const indent = m[1].length;
      const text = m[3] || '';
      if (cur && indent >= baseIndent + 2) {
        child = { marker: m[2], text: [text] };
        cur.children.push(child);
      } else if (tagFor(m[2]) !== tagFor(first[2])) {
        break; // inny rodzaj listy → nowa lista
      } else {
        cur = { marker: m[2], text: [text], children: [] };
        child = null;
        items.push(cur);
      }
      prevBlank = false;
      i++;
      continue;
    }
    if (/^\s+/.test(line)) {
      (child || cur).text.push(line.trim());
      prevBlank = false;
      i++;
      continue;
    }
    if (prevBlank || isTableStart(lines, i) || RE_SHORTCODE.test(line)) break;
    // leniwa kontynuacja akapitu w punkcie
    (child || cur).text.push(line.trim());
    i++;
  }

  const item = (it) => {
    const html = inline(it.text.join('\n'), ctx);
    ctx.plain.push('\n');
    let sub = '';
    if (it.children && it.children.length) {
      const tag = tagFor(it.children[0].marker);
      sub = `<${tag}${startAttr(it.children[0].marker)}>${it.children.map((c) => `<li>${item(c)}</li>`).join('')}</${tag}>`;
    }
    return html + sub;
  };
  const tag = tagFor(first[2]);
  const html = `<${tag}${startAttr(first[2])}>${items.map((it) => `<li>${item(it)}</li>`).join('')}</${tag}>`;
  return { html, next: i };
}

// ---------- inline ----------

function isWordChar(c) {
  return !!c && /[\p{L}\p{N}_]/u.test(c);
}

/** Bezpieczny adres: bez javascript:/data:/vbscript:/file: (także z białymi znakami i znakami sterującymi). */
export function safeUrl(u) {
  // eslint-disable-next-line no-control-regex
  const s = String(u ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, '');
  const probe = s.replace(/\s+/g, '').toLowerCase();
  if (!s || RE_BAD_PROTO.test(probe)) return null;
  return s;
}

function isExternal(url) {
  return /^https?:\/\//i.test(url);
}

/**
 * Parsuje `[tekst](url "tytuł")` zaczynając od `[` na pozycji `i`.
 * Zwraca { text, url, title, end } albo null.
 */
function parseLink(src, i) {
  if (src[i] !== '[') return null;
  const n = src.length;
  let depth = 0;
  let j = i;
  for (; j < n; j++) {
    const c = src[j];
    if (c === '\\') {
      j++;
      continue;
    }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) break;
    }
  }
  if (j >= n || src[j + 1] !== '(') return null;
  const text = src.slice(i + 1, j);
  let k = j + 2;
  while (k < n && (src[k] === ' ' || src[k] === '\n')) k++;
  let url = '';
  if (src[k] === '<') {
    const close = src.indexOf('>', k + 1);
    if (close < 0) return null;
    url = src.slice(k + 1, close);
    k = close + 1;
  } else {
    let parens = 0;
    const s = k;
    for (; k < n; k++) {
      const c = src[k];
      if (c === '\\') {
        k++;
        continue;
      }
      if (c === ' ' || c === '\n') break;
      if (c === '(') parens++;
      else if (c === ')') {
        if (parens === 0) break;
        parens--;
      }
    }
    url = src.slice(s, k);
  }
  while (k < n && (src[k] === ' ' || src[k] === '\n')) k++;
  let title = '';
  if (src[k] === '"' || src[k] === "'") {
    const q = src[k];
    const close = src.indexOf(q, k + 1);
    if (close < 0) return null;
    title = src.slice(k + 1, close);
    k = close + 1;
    while (k < n && (src[k] === ' ' || src[k] === '\n')) k++;
  }
  if (src[k] !== ')') return null;
  const unescape = (s) => s.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1');
  return { text, url: unescape(url), title: unescape(title), end: k + 1 };
}

function imageHtml(r, ctx, figure) {
  const url = safeUrl(r.url);
  const alt = r.text.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1');
  ctx.plain.push(alt);
  if (!url) return esc(alt);
  const title = r.title ? ` title="${esc(r.title)}"` : '';
  const img = `<img src="${esc(url)}" alt="${esc(alt)}" loading="lazy" decoding="async"${title}>`;
  if (!figure) return img;
  return `<figure>${img}${alt ? `<figcaption>${esc(alt)}</figcaption>` : ''}</figure>`;
}

function linkHtml(r, ctx) {
  const url = safeUrl(r.url);
  const inner = inline(r.text, ctx, { noLink: true });
  if (!url) return inner;
  const title = r.title ? ` title="${esc(r.title)}"` : '';
  const ext = isExternal(url) ? ' target="_blank" rel="noopener"' : '';
  return `<a href="${esc(url)}"${title}${ext}>${inner}</a>`;
}

/** Szuka domknięcia pojedynczego znacznika `ch` od pozycji `from`; pomija kod i podwójne znaczniki. */
function findSingleClose(src, from, ch) {
  const n = src.length;
  let j = from;
  while (j < n) {
    const c = src[j];
    if (c === '\\') {
      j += 2;
      continue;
    }
    if (c === '`') {
      let k = j;
      while (k < n && src[k] === '`') k++;
      const p = src.indexOf(src.slice(j, k), k);
      j = p >= 0 ? p + (k - j) : k;
      continue;
    }
    if (c === ch) {
      if (src[j + 1] === ch) {
        const p = src.indexOf(ch + ch, j + 2);
        j = p >= 0 ? p + 2 : j + 2;
        continue;
      }
      if (j > from && !/\s/.test(src[j - 1]) && !(ch === '_' && isWordChar(src[j + 1]))) return j;
    }
    j++;
  }
  return -1;
}

function parseEmphasis(src, i, ctx) {
  const ch = src[i];
  const n = src.length;
  if (ch === '_' && isWordChar(src[i - 1])) return null;
  const triple = src[i + 1] === ch && src[i + 2] === ch;
  const double = !triple && src[i + 1] === ch;

  if (triple) {
    const open = i + 3;
    if (open >= n || /\s/.test(src[open])) return null;
    const p = src.indexOf(ch + ch + ch, open);
    if (p < 0 || /\s/.test(src[p - 1])) return null;
    return { html: `<strong><em>${inline(src.slice(open, p), ctx)}</em></strong>`, end: p + 3 };
  }
  if (double) {
    const open = i + 2;
    if (open >= n || /\s/.test(src[open])) return null;
    let j = open;
    while (j < n) {
      const p = src.indexOf(ch + ch, j);
      if (p < 0 || p === open) return null;
      if (!/\s/.test(src[p - 1]) && !(ch === '_' && isWordChar(src[p + 2]))) {
        return { html: `<strong>${inline(src.slice(open, p), ctx)}</strong>`, end: p + 2 };
      }
      j = p + 1;
    }
    return null;
  }
  const open = i + 1;
  if (open >= n || /\s/.test(src[open])) return null;
  const p = findSingleClose(src, open, ch);
  if (p < 0) return null;
  return { html: `<em>${inline(src.slice(open, p), ctx)}</em>`, end: p + 1 };
}

/** Markdown liniowy → HTML (escapowany); tekst jawny trafia też do ctx.plain. */
function inline(src, ctx, { noLink = false } = {}) {
  const n = src.length;
  let out = '';
  let buf = '';
  const flush = () => {
    if (buf) {
      out += esc(buf);
      ctx.plain.push(buf);
      buf = '';
    }
  };
  const hardBreak = () => {
    buf = buf.replace(/ +$/, '');
    flush();
    ctx.plain.push('\n');
    out += '<br>\n';
  };

  let i = 0;
  while (i < n) {
    const ch = src[i];

    if (ch === '\\') {
      const next = src[i + 1];
      if (next === '\n') {
        hardBreak();
        i += 2;
        continue;
      }
      if (next && RE_PUNCT.test(next)) {
        buf += next;
        i += 2;
        continue;
      }
      buf += ch;
      i++;
      continue;
    }

    if (ch === '\n') {
      if (/ {2,}$/.test(buf)) hardBreak();
      else buf += '\n';
      i++;
      continue;
    }

    if (ch === '`') {
      let k = i;
      while (k < n && src[k] === '`') k++;
      const ticks = src.slice(i, k);
      let found = -1;
      let j = k;
      while (j < n) {
        const p = src.indexOf(ticks, j);
        if (p < 0) break;
        let e = p;
        while (e < n && src[e] === '`') e++;
        if (e - p === ticks.length) {
          found = p;
          break;
        }
        j = e;
      }
      if (found >= 0) {
        flush();
        let code = src.slice(k, found).replace(/\n/g, ' ');
        if (code.length >= 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim()) code = code.slice(1, -1);
        out += `<code>${esc(code)}</code>`;
        ctx.plain.push(code);
        i = found + ticks.length;
        continue;
      }
      buf += ticks;
      i = k;
      continue;
    }

    if (ch === '!' && src[i + 1] === '[') {
      flush();
      const r = parseLink(src, i + 1);
      if (r) {
        out += imageHtml(r, ctx, false);
        i = r.end;
        continue;
      }
    }

    if (ch === '[' && !noLink) {
      flush();
      const r = parseLink(src, i);
      if (r) {
        out += linkHtml(r, ctx);
        i = r.end;
        continue;
      }
    }

    if (ch === '*' || ch === '_') {
      flush();
      const r = parseEmphasis(src, i, ctx);
      if (r) {
        out += r.html;
        i = r.end;
        continue;
      }
    }

    if ((ch === 'h' || ch === 'H') && !noLink) {
      const prev = i > 0 ? src[i - 1] : '';
      if (!prev || !/[\p{L}\p{N}/]/u.test(prev)) {
        RE_AUTOLINK.lastIndex = i;
        const m = RE_AUTOLINK.exec(src);
        if (m) {
          let url = m[0].replace(/[.,;:!?'"]+$/, '');
          // nawias zamykający bez otwierającego w adresie → nie należy do adresu
          while (url.endsWith(')') && (url.match(/\(/g) || []).length < (url.match(/\)/g) || []).length) url = url.slice(0, -1);
          const safe = safeUrl(url);
          if (safe) {
            flush();
            out += `<a href="${esc(safe)}" target="_blank" rel="noopener">${esc(safe)}</a>`;
            ctx.plain.push(safe);
            i += url.length;
            continue;
          }
        }
      }
    }

    buf += ch;
    i++;
  }
  flush();
  return out;
}
