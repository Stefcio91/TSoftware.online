// Szablony stron bloga renderowanych na serwerze: lista wpisów, wpis, 404.
// Czyste funkcje: (dane) → HTML. Styl bierze się z /assets/css/styles.css + /assets/css/blog.css.

const SITE_DEFAULT = {
  url: 'https://tsoftware.online',
  name: 'TSoftware',
  author: 'Tomasz Stachowiak',
  description: 'Konkretnie o automatyzacji, AI i nudnej robocie w firmach.',
};

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function slugify(s) {
  const map = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };
  return String(s ?? '')
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => map[c])
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'wpis';
}

const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function isoDate(iso) {
  const d = new Date(iso || 0);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}
function minutes(n) {
  const m = Math.max(1, Math.round(Number(n) || 1));
  return `${m} min czytania`;
}
function abs(site, u) {
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return site.url.replace(/\/$/, '') + (u.startsWith('/') ? u : '/' + u);
}
function jsonLd(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}
function catSlug(post) {
  return post.categorySlug || slugify(post.category || 'inne');
}
export function postUrl(site, post) {
  return `${site.url.replace(/\/$/, '')}/blog/${encodeURIComponent(post.slug)}/`;
}
function catUrl(c) {
  return `/blog/kategoria/${encodeURIComponent(c.slug || slugify(c.name || c))}/`;
}
function tagUrl(t) {
  return `/blog/tag/${encodeURIComponent(slugify(t))}/`;
}

/* ---------- ikony (symbol sprite + inline) ---------- */
const SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
<symbol id="i-palette" viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2s0-2 1.5-2h1.5A4.5 4.5 0 0 0 21 12.5C21 7 17 3 12 3z"/><circle cx="8" cy="11" r="1.2"/><circle cx="11.5" cy="7.5" r="1.2"/><circle cx="16" cy="9" r="1.2"/></symbol>
<symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.4 7.8-8 9-4.6-1.2-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.3l2.4 2.4 4.8-5"/></symbol>
<symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></symbol>
<symbol id="i-link" viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"/></symbol>
<symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
<symbol id="i-share" viewBox="0 0 24 24"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/></symbol>
<symbol id="i-rss" viewBox="0 0 24 24"><path d="M5 11a8 8 0 0 1 8 8M5 5a14 14 0 0 1 14 14"/><circle cx="6" cy="18" r="1.5"/></symbol>
<symbol id="i-doc" viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></symbol>
</svg>`;
const SOCIAL = {
  linkedin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 8.5v10M6.5 5.5v.1M10.5 18.5v-6a3 3 0 0 1 6 0v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8h2V4.5h-2.5A3.5 3.5 0 0 0 10 8v2.5H8V14h2v6h3.5v-6h2.2l.5-3.5H13.5V8.6c0-.4.2-.6.5-.6z" fill="currentColor"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4l14 16M19 4L5 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.2 8.5c.3-.3.6-.3.8 0l.8 1.6c.1.2 0 .5-.2.7l-.5.5a5 5 0 0 0 2.6 2.6l.5-.5c.2-.2.5-.3.7-.2l1.6.8c.3.2.3.5 0 .8l-.6.7c-.5.5-1.3.6-2 .3a9 9 0 0 1-4.8-4.8c-.3-.7-.2-1.5.3-2z" fill="currentColor"/></svg>',
};

/* ---------- wspólny szkielet ---------- */
function head({ site, title, description, canonical, ogImage, ogType = 'website', extra = '', noindex = false }) {
  const img = ogImage || abs(site, '/assets/img/og.png');
  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="#141c31">
  ${noindex ? '<meta name="robots" content="noindex, follow">' : '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">'}
  <meta name="author" content="${esc(site.author)}">
  <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
  <link rel="canonical" href="${esc(canonical)}">
  <link rel="alternate" type="application/rss+xml" title="Blog ${esc(site.name)}" href="${esc(abs(site, '/blog/feed.xml'))}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:locale" content="pl_PL">
  <meta property="og:site_name" content="${esc(site.name)}.online">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${esc(img)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(img)}">
  <link rel="preload" as="font" type="font/woff2" crossorigin href="/assets/fonts/bricolage-grotesque-latin.woff2">
  <link rel="stylesheet" href="/assets/css/fonts.css">
  <link rel="stylesheet" href="/assets/css/styles.css">
  <link rel="stylesheet" href="/assets/css/blog.css">
  <script>document.documentElement.classList.add("js");(function(){var t="slate";try{t=localStorage.getItem("ts-theme")||t;}catch(e){}if(t!=="dark")document.documentElement.setAttribute("data-theme",t);})();</script>
  ${extra}
</head>`;
}

function header(active = 'blog') {
  const link = (href, label, key) => `<a href="${href}"${active === key ? ' class="is-active" aria-current="page"' : ''}>${label}</a>`;
  return `<header class="site-header" id="site-header">
    <div class="container">
      <a class="brand" href="/" aria-label="TSoftware — strona główna">
        <svg class="brand__mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--accent-strong)"/><path d="M9 10h14M16 10v12" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="23.5" r="2.4" fill="#ffb45c"/></svg>
        <span>TSoftware<span class="brand__tld">.online</span></span>
      </a>
      <nav class="nav" id="site-nav" aria-label="Nawigacja główna">
        ${link('/#uslugi', 'Usługi', 'uslugi')}
        ${link('/#jak-to-dziala', 'Jak to działa', 'jak')}
        ${link('/#realizacje', 'Realizacje', 'realizacje')}
        ${link('/#kalkulator', 'Kalkulator', 'kalkulator')}
        ${link('/blog/', 'Blog', 'blog')}
        ${link('/#kontakt', 'Kontakt', 'kontakt')}
      </nav>
      <div class="header-cta">
        <div class="theme" id="theme">
          <button type="button" class="theme__btn" id="theme-btn" aria-haspopup="true" aria-expanded="false" aria-label="Zmień motyw kolorystyczny" title="Motyw"><svg class="ic" viewBox="0 0 24 24"><use href="#i-palette"/></svg></button>
          <div class="theme__menu" id="theme-menu" role="menu" hidden>
            <button type="button" role="menuitemradio" data-theme-set="slate" aria-checked="true"><i style="--sw:#4a7bff;--sb:#141c31"></i>Granat</button>
            <button type="button" role="menuitemradio" data-theme-set="dark" aria-checked="false"><i style="--sw:#3f6ff5;--sb:#070b16"></i>Ciemny</button>
            <button type="button" role="menuitemradio" data-theme-set="light" aria-checked="false"><i style="--sw:#2f5bff;--sb:#f5f7fc"></i>Jasny</button>
            <button type="button" role="menuitemradio" data-theme-set="warm" aria-checked="false"><i style="--sw:#0f8a95;--sb:#faf8f3"></i>Ciepły</button>
          </div>
        </div>
        <a class="btn btn--primary" href="/#kontakt" data-magnetic>Pogadajmy</a>
        <button class="nav-toggle" type="button" aria-controls="site-nav" aria-expanded="false" aria-label="Otwórz menu"><span></span><span></span><span></span></button>
      </div>
    </div>
  </header>`;
}

function footer(site) {
  const c = site.contact || {};
  return `<footer class="site-footer">
    <div class="container">
      <div class="footer__brand">
        <a class="brand" href="/" aria-label="TSoftware — strona główna">
          <svg class="brand__mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--accent-strong)"/><path d="M9 10h14M16 10v12" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="23.5" r="2.4" fill="#ffb45c"/></svg>
          <span>TSoftware<span class="brand__tld">.online</span></span>
        </a>
        <p>Automaty, AI, grafiki, strony i integracje dla firm, które mają lepsze rzeczy do roboty niż przepisywanie danych.</p>
      </div>
      <div>
        <h3 class="footer__h">Usługi</h3>
        <ul>
          <li><a href="/#automatyzacja">Automatyzacje</a></li>
          <li><a href="/#wdrozenia-ai">Wdrażanie AI</a></li>
          <li><a href="/#asystenci-ai">Asystenci AI i chatboty</a></li>
          <li><a href="/#grafika-ai">Grafiki i wideo</a></li>
          <li><a href="/#strony-www">Strony i aplikacje</a></li>
          <li><a href="/#integracje-erp">Integracje ERP</a></li>
        </ul>
      </div>
      <div>
        <h3 class="footer__h">Firma</h3>
        <ul>
          <li><a href="/blog/">Blog</a></li>
          <li><a href="/blog/feed.xml">RSS</a></li>
          <li><a href="/#realizacje">Realizacje</a></li>
          <li><a href="/#kalkulator">Kalkulator oszczędności</a></li>
          <li><a href="/#cennik">Cennik</a></li>
          <li><a href="/#lista">Darmowy PDF: 30 procesów</a></li>
          <li><a href="/polityka-prywatnosci.html">Polityka prywatności</a></li>
          <li><a href="#" data-consent-open>Ustawienia prywatności</a></li>
        </ul>
      </div>
      <div class="footer__bottom">
        <span>© <span id="year">${new Date().getFullYear()}</span> TSoftware · tsoftware.online</span>
        <span>${esc(c.owner || site.author)} · NIP ${esc(c.nip || '8842684500')} · Mrowiny</span>
      </div>
    </div>
  </footer>`;
}

function waFab(site) {
  const c = site.contact || {};
  const num = String(c.whatsapp || '48503844406').replace(/\D/g, '');
  return `<a class="wa-fab" id="wa-fab" href="https://wa.me/${num}?text=${encodeURIComponent('Cześć, piszę ze strony tsoftware.online. ')}" target="_blank" rel="noopener" aria-label="Napisz na WhatsApp">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2a9.8 9.8 0 0 0-8.4 14.8L2.2 21.8l4.9-1.3A9.8 9.8 0 1 0 12 2.2zm0 17.9a8.1 8.1 0 0 1-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8.1 8.1 0 1 1 12 20.1zm4.5-6c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.7a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>
    <span>WhatsApp</span>
  </a>`;
}

const SCRIPTS = `<script src="/assets/js/consent.js"></script>
  <script src="/assets/js/features.js" defer></script>
  <script src="/assets/js/main.js" defer></script>
  <script src="/assets/js/blog.js" defer></script>`;

function cover(post, { sizes = '(max-width: 760px) 100vw, 50vw', eager = false } = {}) {
  if (post.cover) {
    return `<img src="${esc(post.cover)}" alt="${esc(post.coverAlt || post.title)}" sizes="${sizes}" ${eager ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"'}>`;
  }
  const letter = (post.category || post.title || 'T').trim().charAt(0).toUpperCase();
  return `<div class="pcard__ph" aria-hidden="true" style="--h:${hue(post.category || post.title)}"><b>${esc(letter)}</b><span>${esc(post.category || 'wpis')}</span></div>`;
}
function hue(s) {
  let h = 0;
  for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function card(post, { big = false } = {}) {
  const url = `/blog/${encodeURIComponent(post.slug)}/`;
  return `<article class="pcard${big ? ' pcard--big' : ''}">
    <a class="pcard__link" href="${url}">
      <div class="pcard__media">${cover(post, { sizes: big ? '(max-width: 900px) 100vw, 60vw' : '(max-width: 760px) 100vw, 33vw' })}</div>
      <div class="pcard__body">
        <div class="pcard__top"><span class="pcard__cat">${esc(post.category || 'Wpis')}</span>${post.featured && big ? '<span class="pcard__star">wyróżniony</span>' : ''}</div>
        <h2 class="pcard__title">${esc(post.title)}</h2>
        <p class="pcard__excerpt">${esc(post.excerpt || '')}</p>
        <div class="pcard__meta"><time datetime="${esc(isoDate(post.publishedAt))}">${esc(formatDate(post.publishedAt))}</time><span>·</span><span>${esc(minutes(post.readingMin))}</span></div>
      </div>
    </a>
  </article>`;
}

function ctaBlock() {
  return `<section class="blog-cta">
    <div class="container blog-cta__inner">
      <div class="blog-cta__box">
        <svg class="ic" aria-hidden="true"><use href="#i-doc"/></svg>
        <div>
          <h2>30 procesów, które da się zautomatyzować w tydzień</h2>
          <p>Darmowy PDF: konkretne procesy z sześciu obszarów firmy, z czasem wdrożenia i efektem.</p>
        </div>
        <a class="btn btn--primary" href="/#lista">Wyślij mi PDF</a>
      </div>
      <div class="blog-cta__box blog-cta__box--alt">
        <svg class="ic" aria-hidden="true"><use href="#i-check"/></svg>
        <div>
          <h2>Masz proces, który Cię wkurza?</h2>
          <p>Napisz w dwóch zdaniach, co zabiera najwięcej czasu. Odpiszę, co da się zautomatyzować i od czego zacząć.</p>
        </div>
        <a class="btn btn--ghost" href="/#kontakt">Pogadajmy</a>
      </div>
    </div>
  </section>`;
}

function pagination(base, page, pages) {
  if (pages <= 1) return '';
  const link = (p) => (p === 1 ? base : `${base}strona/${p}/`);
  let items = '';
  for (let p = 1; p <= pages; p++) {
    items += p === page ? `<span class="pager__num is-current" aria-current="page">${p}</span>` : `<a class="pager__num" href="${link(p)}">${p}</a>`;
  }
  return `<nav class="pager" aria-label="Strony bloga">
    ${page > 1 ? `<a class="pager__arrow" href="${link(page - 1)}" rel="prev">← Nowsze</a>` : '<span class="pager__arrow is-off">← Nowsze</span>'}
    <div class="pager__nums">${items}</div>
    ${page < pages ? `<a class="pager__arrow" href="${link(page + 1)}" rel="next">Starsze →</a>` : '<span class="pager__arrow is-off">Starsze →</span>'}
  </nav>`;
}

/* =========================================================================
   LISTA WPISÓW
   ctx: { site, posts, page, pages, categories:[{name,slug,count}], category?:{name,slug}, tag?:string, featured?:post, total }
   ========================================================================= */
export function renderBlogIndex(ctx) {
  const site = { ...SITE_DEFAULT, ...(ctx.site || {}) };
  const { posts = [], page = 1, pages = 1, categories = [], category = null, tag = null, featured = null } = ctx;
  const base = category ? `/blog/kategoria/${encodeURIComponent(category.slug)}/` : tag ? `/blog/tag/${encodeURIComponent(slugify(tag))}/` : '/blog/';
  const canonical = abs(site, page > 1 ? `${base}strona/${page}/` : base);
  const titleCore = category ? `${category.name} — blog o automatyzacji` : tag ? `#${tag} — blog o automatyzacji` : 'Blog o automatyzacji i AI dla firm';
  const title = `${titleCore}${page > 1 ? ` (strona ${page})` : ''} — ${site.name}`;
  const description = category
    ? `Wpisy z kategorii „${category.name}”: ${site.description}`
    : tag
      ? `Wpisy z tagiem #${tag}: ${site.description}`
      : `${site.description} Przykłady wdrożeń, liczby, narzędzia i błędy, których lepiej uniknąć.`;
  const extra = [
    page > 1 ? `<link rel="prev" href="${esc(abs(site, page === 2 ? base : `${base}strona/${page - 1}/`))}">` : '',
    page < pages ? `<link rel="next" href="${esc(abs(site, `${base}strona/${page + 1}/`))}">` : '',
    jsonLd({
      '@context': 'https://schema.org',
      '@type': 'Blog',
      '@id': abs(site, '/blog/#blog'),
      url: abs(site, '/blog/'),
      name: `Blog ${site.name}`,
      description: site.description,
      inLanguage: 'pl-PL',
      publisher: { '@type': 'Organization', name: site.name, url: site.url, logo: abs(site, '/assets/img/favicon.svg') },
      blogPost: posts.slice(0, 10).map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: postUrl(site, p), datePublished: isoDate(p.publishedAt) })),
    }),
  ].join('\n  ');

  const showFeatured = featured && page === 1 && !category && !tag;
  const list = posts.filter((p) => !(showFeatured && p.id === featured.id));
  const chips = [`<a class="pill${!category && !tag ? ' is-on' : ''}" href="/blog/">Wszystkie</a>`]
    .concat(categories.map((c) => `<a class="pill${category && category.slug === c.slug ? ' is-on' : ''}" href="${catUrl(c)}">${esc(c.name)}${c.count ? ` <small>${c.count}</small>` : ''}</a>`))
    .join('');

  return `${head({ site, title, description, canonical, extra })}
<body class="page-blog">
  ${SPRITE}
  <a class="skip-link" href="#main">Przejdź do treści</a>
  <div class="scroll-progress" aria-hidden="true"><i></i></div>
  ${waFab(site)}
  ${header('blog')}
  <main id="main" class="blog">
    <section class="blog-hero">
      <div class="container">
        <p class="eyebrow">${category ? 'Kategoria' : tag ? 'Tag' : 'Blog'}</p>
        <h1>${category ? esc(category.name) : tag ? `#${esc(tag)}` : 'Konkretnie o automatyzacji, AI i nudnej robocie'}</h1>
        <p class="blog-hero__lead">${category || tag ? `${esc(ctx.total ?? list.length)} ${plural(ctx.total ?? list.length, 'wpis', 'wpisy', 'wpisów')}. ` : ''}Bez teorii: jak to robimy u klientów, co działa, ile kosztuje i czego unikać.</p>
        <nav class="blog-cats" aria-label="Kategorie">${chips}<a class="blog-cats__rss" href="/blog/feed.xml" title="Kanał RSS"><svg class="ic"><use href="#i-rss"/></svg>RSS</a></nav>
      </div>
    </section>
    <section class="section blog-list">
      <div class="container">
        ${showFeatured ? card(featured, { big: true }) : ''}
        ${list.length ? `<div class="pgrid">${list.map((p) => card(p)).join('')}</div>` : `<p class="blog-empty">Jeszcze nic tu nie ma. Pierwsze wpisy już się piszą.</p>`}
        ${pagination(base, page, pages)}
      </div>
    </section>
    ${ctaBlock()}
  </main>
  ${footer(site)}
  ${SCRIPTS}
</body>
</html>`;
}

function plural(n, one, few, many) {
  n = Math.abs(Number(n) || 0);
  if (n === 1) return one;
  const d = n % 10, h = n % 100;
  if (d >= 2 && d <= 4 && !(h >= 12 && h <= 14)) return few;
  return many;
}

/* =========================================================================
   WPIS
   ctx: { site, post, related:[post], prev?:post, next?:post }
   post.html = wyrenderowany Markdown; post.toc = [{id,text,level}]
   ========================================================================= */
export function renderPost(ctx) {
  const site = { ...SITE_DEFAULT, ...(ctx.site || {}) };
  const { post, related = [], prev = null, next = null } = ctx;
  const url = postUrl(site, post);
  const title = `${post.seo?.title || post.title} — Blog ${site.name}`;
  const description = post.seo?.description || post.excerpt || site.description;
  const ogImage = abs(site, post.og || post.cover || '/assets/img/og.png');
  const published = isoDate(post.publishedAt);
  const modified = isoDate(post.updatedAt || post.publishedAt);
  const updatedVisible = post.updatedAt && post.publishedAt && new Date(post.updatedAt) - new Date(post.publishedAt) > 2 * 864e5;
  const tags = Array.isArray(post.tags) ? post.tags.filter(Boolean) : [];
  const toc = Array.isArray(post.toc) ? post.toc.filter((t) => t.level === 2 || t.level === 3) : [];
  const wordCount = String(post.content || '').split(/\s+/).filter(Boolean).length;

  const extra = [
    `<meta property="article:published_time" content="${esc(published)}">`,
    `<meta property="article:modified_time" content="${esc(modified)}">`,
    `<meta property="article:author" content="${esc(site.author)}">`,
    post.category ? `<meta property="article:section" content="${esc(post.category)}">` : '',
    tags.map((t) => `<meta property="article:tag" content="${esc(t)}">`).join('\n  '),
    jsonLd({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      '@id': `${url}#post`,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      headline: post.title,
      description,
      image: ogImage,
      datePublished: published,
      dateModified: modified,
      inLanguage: 'pl-PL',
      wordCount,
      articleSection: post.category || undefined,
      keywords: tags.length ? tags.join(', ') : undefined,
      author: { '@type': 'Person', name: site.author, url: site.url },
      publisher: { '@type': 'Organization', name: site.name, url: site.url, logo: { '@type': 'ImageObject', url: abs(site, '/assets/img/favicon.svg') } },
    }),
    jsonLd({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Strona główna', item: site.url + '/' },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: abs(site, '/blog/') },
        post.category ? { '@type': 'ListItem', position: 3, name: post.category, item: abs(site, catUrl({ name: post.category, slug: catSlug(post) })) } : null,
        { '@type': 'ListItem', position: post.category ? 4 : 3, name: post.title, item: url },
      ].filter(Boolean),
    }),
  ].filter(Boolean).join('\n  ');

  const shareText = encodeURIComponent(post.title);
  const shareUrl = encodeURIComponent(url);
  const share = (cls) => `<div class="share ${cls}" data-share data-url="${esc(url)}" data-title="${esc(post.title)}">
      <span class="share__label">Udostępnij</span>
      <a class="share__btn" href="https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}" target="_blank" rel="noopener" aria-label="Udostępnij na LinkedIn" data-net="linkedin">${SOCIAL.linkedin}</a>
      <a class="share__btn" href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}" target="_blank" rel="noopener" aria-label="Udostępnij na Facebooku" data-net="facebook">${SOCIAL.facebook}</a>
      <a class="share__btn" href="https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}" target="_blank" rel="noopener" aria-label="Udostępnij na X" data-net="x">${SOCIAL.x}</a>
      <a class="share__btn" href="https://wa.me/?text=${shareText}%20${shareUrl}" target="_blank" rel="noopener" aria-label="Wyślij na WhatsApp" data-net="whatsapp">${SOCIAL.whatsapp}</a>
      <button type="button" class="share__btn" data-copy aria-label="Kopiuj link"><svg class="ic"><use href="#i-link"/></svg></button>
      <button type="button" class="share__btn share__btn--native" data-native hidden aria-label="Udostępnij"><svg class="ic"><use href="#i-share"/></svg></button>
      <span class="share__done" aria-live="polite"></span>
    </div>`;

  const tocHtml = toc.length
    ? `<nav class="toc" aria-label="Spis treści"><p class="toc__title">W tym wpisie</p><ol>${toc.map((t) => `<li class="toc__l${t.level}"><a href="#${esc(t.id)}">${esc(t.text)}</a></li>`).join('')}</ol></nav>`
    : '';

  return `${head({ site, title, description, canonical: url, ogImage, ogType: 'article', extra })}
<body class="page-post">
  ${SPRITE}
  <a class="skip-link" href="#main">Przejdź do treści</a>
  <div class="scroll-progress" aria-hidden="true"><i></i></div>
  ${waFab(site)}
  ${header('blog')}
  <main id="main" class="post">
    <header class="post-hero">
      <div class="container post-hero__inner">
        <nav class="crumbs" aria-label="Okruszki"><a href="/">Start</a><span>/</span><a href="/blog/">Blog</a>${post.category ? `<span>/</span><a href="${catUrl({ name: post.category, slug: catSlug(post) })}">${esc(post.category)}</a>` : ''}</nav>
        <h1>${esc(post.title)}</h1>
        ${post.excerpt ? `<p class="post-hero__lead">${esc(post.excerpt)}</p>` : ''}
        <div class="post-meta">
          <span class="post-meta__author"><i aria-hidden="true">T</i>${esc(site.author)}</span>
          <time datetime="${esc(published)}">${esc(formatDate(post.publishedAt))}</time>
          <span><svg class="ic"><use href="#i-clock"/></svg>${esc(minutes(post.readingMin))}</span>
          ${updatedVisible ? `<span class="post-meta__upd">zaktualizowano ${esc(formatDate(post.updatedAt))}</span>` : ''}
        </div>
      </div>
    </header>
    ${post.cover ? `<figure class="post-cover"><div class="container"><img src="${esc(post.cover)}" alt="${esc(post.coverAlt || post.title)}" width="1200" height="675" fetchpriority="high" decoding="async"></div></figure>` : ''}
    <div class="container post-layout">
      <aside class="post-side">
        ${tocHtml}
        ${share('share--side')}
        <div class="side-cta">
          <p class="side-cta__t">Chcesz to u siebie?</p>
          <p>Napisz, co Cię boli w codziennej robocie. Odpiszę, co da się zautomatyzować.</p>
          <a class="btn btn--primary" href="/#kontakt">Pogadajmy</a>
        </div>
      </aside>
      <article class="post-body prose" id="tresc">
        ${post.html || '<p>Treść w przygotowaniu.</p>'}
        ${tags.length ? `<div class="post-tags">${tags.map((t) => `<a class="tag" href="${tagUrl(t)}">#${esc(t)}</a>`).join('')}</div>` : ''}
        ${share('share--bottom')}
        <div class="author-box">
          <div class="author-box__avatar" aria-hidden="true">T</div>
          <div>
            <p class="author-box__name">${esc(site.author)}</p>
            <p>Automatyzuję nudną robotę w firmach: spinam systemy, dokładam AI i buduję narzędzia, które oddają ludziom godziny. Piszę o tym, co naprawdę działa u klientów.</p>
            <div class="author-box__links"><a href="/#realizacje">Realizacje</a><a href="/#kontakt">Kontakt</a><a href="https://wa.me/${String((site.contact || {}).whatsapp || '48503844406').replace(/\D/g, '')}" target="_blank" rel="noopener">WhatsApp</a></div>
          </div>
        </div>
      </article>
    </div>
    ${prev || next ? `<nav class="post-nav container" aria-label="Sąsiednie wpisy">
      ${prev ? `<a class="post-nav__a" href="/blog/${encodeURIComponent(prev.slug)}/" rel="prev"><small>Poprzedni</small><span>${esc(prev.title)}</span></a>` : '<span></span>'}
      ${next ? `<a class="post-nav__a post-nav__a--next" href="/blog/${encodeURIComponent(next.slug)}/" rel="next"><small>Następny</small><span>${esc(next.title)}</span></a>` : '<span></span>'}
    </nav>` : ''}
    ${related.length ? `<section class="section related"><div class="container">
      <div class="section__head"><div><p class="eyebrow">Czytaj dalej</p><h2>Podobne wpisy</h2></div></div>
      <div class="pgrid">${related.slice(0, 3).map((p) => card(p)).join('')}</div>
    </div></section>` : ''}
    ${ctaBlock()}
  </main>
  ${footer(site)}
  ${SCRIPTS}
</body>
</html>`;
}

/* =========================================================================
   404 dla /blog/...
   ========================================================================= */
export function renderNotFound(ctx = {}) {
  const site = { ...SITE_DEFAULT, ...(ctx.site || {}) };
  return `${head({ site, title: `Nie ma takiego wpisu — Blog ${site.name}`, description: 'Tej strony nie ma.', canonical: abs(site, '/blog/'), noindex: true })}
<body class="page-blog">
  ${SPRITE}
  ${header('blog')}
  <main id="main" class="blog">
    <section class="blog-hero"><div class="container">
      <p class="eyebrow">404</p>
      <h1>Tego wpisu nie ma</h1>
      <p class="blog-hero__lead">Może został usunięty albo link jest ucięty. Zobacz, co jest na blogu.</p>
      <p><a class="btn btn--primary" href="/blog/">Wszystkie wpisy</a></p>
    </div></section>
  </main>
  ${footer(site)}
  ${SCRIPTS}
</body>
</html>`;
}

/* =========================================================================
   RSS
   ctx: { site, posts }
   ========================================================================= */
export function renderFeed(ctx) {
  const site = { ...SITE_DEFAULT, ...(ctx.site || {}) };
  const posts = ctx.posts || [];
  const cdata = (s) => `<![CDATA[${String(s ?? '').replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
  const items = posts.map((p) => `    <item>
      <title>${cdata(p.title)}</title>
      <link>${esc(postUrl(site, p))}</link>
      <guid isPermaLink="true">${esc(postUrl(site, p))}</guid>
      <pubDate>${new Date(p.publishedAt || Date.now()).toUTCString()}</pubDate>
      ${p.category ? `<category>${cdata(p.category)}</category>` : ''}
      <description>${cdata(p.excerpt || '')}</description>
      ${p.html ? `<content:encoded>${cdata(p.html)}</content:encoded>` : ''}
      ${p.cover ? `<enclosure url="${esc(abs(site, p.cover))}" type="image/${/\.png$/i.test(p.cover) ? 'png' : /\.webp$/i.test(p.cover) ? 'webp' : 'jpeg'}" length="0"/>` : ''}
    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Blog ${esc(site.name)}</title>
    <link>${esc(abs(site, '/blog/'))}</link>
    <atom:link href="${esc(abs(site, '/blog/feed.xml'))}" rel="self" type="application/rss+xml"/>
    <description>${esc(site.description)}</description>
    <language>pl-PL</language>
    <lastBuildDate>${new Date(posts[0]?.publishedAt || Date.now()).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;
}
