// Szablony stron bloga renderowanych na serwerze (pl/en): lista wpisów, wpis, 404, RSS, prosta strona.
// Czyste funkcje: (dane) → HTML. Styl bierze się z /assets/css/styles.css + /assets/css/blog.css.
// Język: ctx.lang ('pl' domyślnie, 'en' = adresy pod /en/, angielskie teksty interfejsu).

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

/* ---------- język ---------- */
export const LANGS = ['pl', 'en'];
export function langOf(v) {
  return v === 'en' ? 'en' : 'pl';
}
/** Prefiks adresów: '' dla pl, '/en' dla en. */
export function prefix(lang) {
  return langOf(lang) === 'en' ? '/en' : '';
}
/** Segmenty adresów bloga w danym języku. */
export const SEG = {
  pl: { page: 'strona', category: 'kategoria', tag: 'tag', feed: 'feed.xml' },
  en: { page: 'page', category: 'category', tag: 'tag', feed: 'feed.xml' },
};

const T = {
  pl: {
    locale: 'pl-PL',
    ogLocale: 'pl_PL',
    siteDescription: 'Konkretnie o automatyzacji, AI i nudnej robocie w firmach.',
    skip: 'Przejdź do treści',
    navAria: 'Nawigacja główna',
    brandAria: 'TSoftware — strona główna',
    nav: [
      ['/#uslugi', 'Usługi', 'uslugi'],
      ['/#jak-to-dziala', 'Jak to działa', 'jak'],
      ['/#realizacje', 'Realizacje', 'realizacje'],
      ['/#kalkulator', 'Kalkulator', 'kalkulator'],
      ['/#druk-3d', 'Druk 3D', 'druk3d'],
      ['/blog/', 'Blog', 'blog'],
      ['/#kontakt', 'Kontakt', 'kontakt'],
    ],
    themeAria: 'Zmień motyw kolorystyczny',
    themeTitle: 'Motyw',
    themes: ['Granat', 'Ciemny', 'Jasny', 'Ciepły'],
    cta: 'Pogadajmy',
    menuOpen: 'Otwórz menu',
    langSwitch: 'EN',
    langSwitchAria: 'Switch to English',
    langSwitchTitle: 'English version',
    footerTagline: 'Automaty, AI, grafiki, strony i integracje dla firm, które mają lepsze rzeczy do roboty niż przepisywanie danych.',
    footerServices: 'Usługi',
    footerCompany: 'Firma',
    services: [
      ['/#automatyzacja', 'Automatyzacje'],
      ['/#wdrozenia-ai', 'Wdrażanie AI'],
      ['/#asystenci-ai', 'Asystenci AI i chatboty'],
      ['/#grafika-ai', 'Grafiki i wideo'],
      ['/#strony-www', 'Strony i aplikacje'],
      ['/#integracje-erp', 'Integracje ERP'],
      ['/#druk-3d', 'Druk 3D i modelowanie'],
      ['/#handel', 'Pośrednictwo handlowe'],
    ],
    company: [
      ['/blog/', 'Blog'],
      ['/blog/feed.xml', 'RSS'],
      ['/#realizacje', 'Realizacje'],
      ['/#kalkulator', 'Kalkulator oszczędności'],
      ['/#cennik', 'Cennik'],
      ['/#lista', 'Darmowy PDF: 30 procesów'],
      ['/polityka-prywatnosci.html', 'Polityka prywatności'],
    ],
    privacySettings: 'Ustawienia prywatności',
    otherLang: ['/en/', 'English version'],
    waAria: 'Napisz na WhatsApp',
    waText: 'Cześć, piszę ze strony tsoftware.online. ',
    minutes: (m) => `${m} min czytania`,
    rssTitle: (name) => `Blog ${name}`,
    ctaPdfTitle: '30 procesów, które da się zautomatyzować w tydzień',
    ctaPdfText: 'Darmowy PDF: konkretne procesy z sześciu obszarów firmy, z czasem wdrożenia i efektem.',
    ctaPdfBtn: 'Wyślij mi PDF',
    ctaTalkTitle: 'Masz proces, który Cię wkurza?',
    ctaTalkText: 'Napisz w dwóch zdaniach, co zabiera najwięcej czasu. Odpiszę, co da się zautomatyzować i od czego zacząć.',
    nlTitle: 'Nowe wpisy na maila, raz w tygodniu',
    nlText: 'Jeden mail z tym, co napisałem w tym tygodniu. Bez „ofert specjalnych”, z linkiem do wypisania w każdej wiadomości.',
    nlPlaceholder: 'twoj@firma.pl',
    nlBtn: 'Zapisz mnie',
    nlConsent: 'Chcę dostawać newsletter TSoftware.',
    nlPolicy: 'Polityka prywatności',
    nlHoneypot: 'Nie wypełniaj',
    pagerAria: 'Strony bloga',
    newer: '← Nowsze',
    older: 'Starsze →',
    eyebrowCat: 'Kategoria',
    eyebrowTag: 'Tag',
    eyebrowBlog: 'Blog',
    indexTitle: 'Blog o automatyzacji i AI dla firm',
    indexTitleCat: (c) => `${c} — blog o automatyzacji`,
    indexTitleTag: (t) => `#${t} — blog o automatyzacji`,
    indexPage: (p) => ` (strona ${p})`,
    indexH1: 'Konkretnie o automatyzacji, AI i nudnej robocie',
    indexLead: 'Bez teorii: jak to robimy u klientów, co działa, ile kosztuje i czego unikać.',
    indexDesc: (d) => `${d} Przykłady wdrożeń, liczby, narzędzia i błędy, których lepiej uniknąć.`,
    indexDescCat: (c, d) => `Wpisy z kategorii „${c}”: ${d}`,
    indexDescTag: (t, d) => `Wpisy z tagiem #${t}: ${d}`,
    posts: (n) => `${n} ${plural(n, 'wpis', 'wpisy', 'wpisów')}. `,
    all: 'Wszystkie',
    catsAria: 'Kategorie',
    rss: 'Kanał RSS',
    empty: 'Jeszcze nic tu nie ma. Pierwsze wpisy już się piszą.',
    featured: 'wyróżniony',
    defaultCat: 'Wpis',
    blogTitleSuffix: (name) => ` — Blog ${name}`,
    home: 'Strona główna',
    start: 'Start',
    crumbsAria: 'Okruszki',
    updated: 'zaktualizowano',
    share: 'Udostępnij',
    shareLinkedin: 'Udostępnij na LinkedIn',
    shareFacebook: 'Udostępnij na Facebooku',
    shareX: 'Udostępnij na X',
    shareWa: 'Wyślij na WhatsApp',
    copyLink: 'Kopiuj link',
    tocAria: 'Spis treści',
    tocTitle: 'W tym wpisie',
    sideCtaTitle: 'Chcesz to u siebie?',
    sideCtaText: 'Napisz, z czym przychodzisz i co zabiera Ci czas. Odpiszę, co da się zautomatyzować.',
    contentSoon: 'Treść w przygotowaniu.',
    authorBio: 'Automatyzuję nudną robotę w firmach: spinam systemy, dokładam AI i buduję narzędzia, które oddają ludziom godziny. Piszę o tym, co naprawdę działa u klientów.',
    caseStudies: 'Realizacje',
    contact: 'Kontakt',
    neighbours: 'Sąsiednie wpisy',
    prev: 'Poprzedni',
    next: 'Następny',
    readOn: 'Czytaj dalej',
    related: 'Podobne wpisy',
    inOtherLang: 'Ten wpis po angielsku',
    notFoundTitle: 'Nie ma takiego wpisu',
    notFoundH1: 'Tego wpisu nie ma',
    notFoundLead: 'Może został usunięty albo link jest ucięty. Zobacz, co jest na blogu.',
    notFoundDesc: 'Tej strony nie ma.',
    allPosts: 'Wszystkie wpisy',
  },
  en: {
    locale: 'en-GB',
    ogLocale: 'en_GB',
    siteDescription: 'Straight talk about automation, AI and boring work in small companies.',
    skip: 'Skip to content',
    navAria: 'Main navigation',
    brandAria: 'TSoftware — home page',
    nav: [
      ['/en/#uslugi', 'Services', 'uslugi'],
      ['/en/#jak-to-dziala', 'How it works', 'jak'],
      ['/en/#realizacje', 'Case studies', 'realizacje'],
      ['/en/#kalkulator', 'Calculator', 'kalkulator'],
      ['/en/#druk-3d', '3D printing', 'druk3d'],
      ['/en/blog/', 'Blog', 'blog'],
      ['/en/#kontakt', 'Contact', 'kontakt'],
    ],
    themeAria: 'Change colour theme',
    themeTitle: 'Theme',
    themes: ['Navy', 'Dark', 'Light', 'Warm'],
    cta: "Let's talk",
    menuOpen: 'Open menu',
    langSwitch: 'PL',
    langSwitchAria: 'Przełącz na polski',
    langSwitchTitle: 'Wersja polska',
    footerTagline: 'Automation, AI, graphics, websites and integrations for companies with better things to do than retyping data.',
    footerServices: 'Services',
    footerCompany: 'Company',
    services: [
      ['/en/#automatyzacja', 'Automation'],
      ['/en/#wdrozenia-ai', 'AI adoption'],
      ['/en/#asystenci-ai', 'AI assistants and chatbots'],
      ['/en/#grafika-ai', 'Graphics and video'],
      ['/en/#strony-www', 'Websites and apps'],
      ['/en/#integracje-erp', 'ERP integrations'],
      ['/en/#druk-3d', '3D printing and modelling'],
      ['/en/#handel', 'Trade agent'],
    ],
    company: [
      ['/en/blog/', 'Blog'],
      ['/en/blog/feed.xml', 'RSS'],
      ['/en/#realizacje', 'Case studies'],
      ['/en/#kalkulator', 'Savings calculator'],
      ['/en/#cennik', 'Pricing'],
      ['/en/#lista', 'Free PDF: 30 processes'],
      ['/en/privacy-policy.html', 'Privacy policy'],
    ],
    privacySettings: 'Privacy settings',
    otherLang: ['/', 'Wersja polska'],
    waAria: 'Message on WhatsApp',
    waText: 'Hi, I am writing from tsoftware.online. ',
    minutes: (m) => `${m} min read`,
    rssTitle: (name) => `${name} blog`,
    ctaPdfTitle: '30 processes you can automate in a week',
    ctaPdfText: 'Free PDF: concrete processes from six areas of a company, with the time to build and the effect.',
    ctaPdfBtn: 'Send me the PDF',
    ctaTalkTitle: 'Got a process that drives you mad?',
    ctaTalkText: 'Write two sentences about what eats the most time. I will reply with what can be automated and where to start.',
    nlTitle: 'New posts by email, once a week',
    nlText: 'One email with what I wrote this week. No "special offers", with an unsubscribe link in every message.',
    nlPlaceholder: 'you@company.com',
    nlBtn: 'Sign me up',
    nlConsent: 'I want the TSoftware newsletter.',
    nlPolicy: 'Privacy policy',
    nlHoneypot: 'Leave empty',
    pagerAria: 'Blog pages',
    newer: '← Newer',
    older: 'Older →',
    eyebrowCat: 'Category',
    eyebrowTag: 'Tag',
    eyebrowBlog: 'Blog',
    indexTitle: 'Blog on automation and AI for small companies',
    indexTitleCat: (c) => `${c} — automation blog`,
    indexTitleTag: (t) => `#${t} — automation blog`,
    indexPage: (p) => ` (page ${p})`,
    indexH1: 'Straight talk about automation, AI and boring work',
    indexLead: 'No theory: how we do it for clients, what works, what it costs and what to avoid.',
    indexDesc: (d) => `${d} Real implementations, numbers, tools and the mistakes worth avoiding.`,
    indexDescCat: (c, d) => `Posts in "${c}": ${d}`,
    indexDescTag: (t, d) => `Posts tagged #${t}: ${d}`,
    posts: (n) => `${n} ${n === 1 ? 'post' : 'posts'}. `,
    all: 'All',
    catsAria: 'Categories',
    rss: 'RSS feed',
    empty: 'Nothing here yet. The first posts are being written.',
    featured: 'featured',
    defaultCat: 'Post',
    blogTitleSuffix: (name) => ` — ${name} blog`,
    home: 'Home',
    start: 'Home',
    crumbsAria: 'Breadcrumbs',
    updated: 'updated',
    share: 'Share',
    shareLinkedin: 'Share on LinkedIn',
    shareFacebook: 'Share on Facebook',
    shareX: 'Share on X',
    shareWa: 'Send on WhatsApp',
    copyLink: 'Copy link',
    tocAria: 'Table of contents',
    tocTitle: 'In this post',
    sideCtaTitle: 'Want this in your company?',
    sideCtaText: 'Tell me what hurts in your daily work. I will reply with what can be automated.',
    contentSoon: 'Content coming soon.',
    authorBio: 'I automate boring work in companies: I connect systems, add AI and build tools that give people their hours back. I write about what really works for clients.',
    caseStudies: 'Case studies',
    contact: 'Contact',
    neighbours: 'Neighbouring posts',
    prev: 'Previous',
    next: 'Next',
    readOn: 'Keep reading',
    related: 'Related posts',
    inOtherLang: 'This post in Polish',
    notFoundTitle: 'No such post',
    notFoundH1: 'This post does not exist',
    notFoundLead: 'It may have been removed, or the link is cut off. See what is on the blog.',
    notFoundDesc: 'This page does not exist.',
    allPosts: 'All posts',
  },
};
export function strings(lang) {
  return T[langOf(lang)];
}

const MONTHS_PL = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function formatDate(iso, lang = 'pl') {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return langOf(lang) === 'en' ? `${d.getDate()} ${MONTHS_EN[d.getMonth()]} ${d.getFullYear()}` : `${d.getDate()} ${MONTHS_PL[d.getMonth()]} ${d.getFullYear()}`;
}
function isoDate(iso) {
  const d = new Date(iso || 0);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}
function minutes(n, lang) {
  const m = Math.max(1, Math.round(Number(n) || 1));
  return strings(lang).minutes(m);
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
/** Adres bloga w danym języku: /blog/ albo /en/blog/. */
export function blogBase(lang) {
  return `${prefix(lang)}/blog/`;
}
export function postPath(post) {
  return `${blogBase(post.lang)}${encodeURIComponent(post.slug)}/`;
}
export function postUrl(site, post) {
  return `${site.url.replace(/\/$/, '')}${postPath(post)}`;
}
function catUrl(c, lang) {
  return `${blogBase(lang)}${SEG[langOf(lang)].category}/${encodeURIComponent(c.slug || slugify(c.name || c))}/`;
}
function tagUrl(t, lang) {
  return `${blogBase(lang)}${SEG[langOf(lang)].tag}/${encodeURIComponent(slugify(t))}/`;
}
function feedPath(lang) {
  return `${blogBase(lang)}feed.xml`;
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
function head({ site, lang = 'pl', title, description, canonical, ogImage, ogType = 'website', extra = '', noindex = false, alternates = [] }) {
  const S = strings(lang);
  const img = ogImage || abs(site, lang === 'en' ? '/assets/img/og-en.png' : '/assets/img/og.png');
  const alt = alternates
    .filter((a) => a && a.href)
    .map((a) => `<link rel="alternate" hreflang="${esc(a.hreflang)}" href="${esc(a.href)}">`)
    .join('\n  ');
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="#141c31">
  ${noindex ? '<meta name="robots" content="noindex, follow">' : '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">'}
  <meta name="author" content="${esc(site.author)}">
  <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
  <link rel="canonical" href="${esc(canonical)}">
  ${alt}
  <link rel="alternate" type="application/rss+xml" title="${esc(S.rssTitle(site.name))}" href="${esc(abs(site, feedPath(lang)))}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:locale" content="${S.ogLocale}">
  <meta property="og:locale:alternate" content="${lang === 'en' ? 'pl_PL' : 'en_GB'}">
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

/** Nagłówek; `switchHref` = adres tej samej strony w drugim języku (domyślnie druga wersja bloga). */
function header(active = 'blog', lang = 'pl', switchHref = '') {
  const S = strings(lang);
  const other = lang === 'en' ? 'pl' : 'en';
  const sw = switchHref || blogBase(other);
  const link = (href, label, key) => `<a href="${href}"${active === key ? ' class="is-active" aria-current="page"' : ''}>${label}</a>`;
  return `<header class="site-header" id="site-header">
    <div class="container">
      <a class="brand" href="${prefix(lang)}/" aria-label="${esc(S.brandAria)}">
        <svg class="brand__mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="var(--bg, #141c31)" stroke="var(--accent, #78a2ff)" stroke-width="2"/><path d="M8 10h12M14 10v12" fill="none" stroke="var(--fg, #ffffff)" stroke-width="2.6" stroke-linecap="round"/><rect class="brand__cursor" x="19" y="20" width="6" height="2.6" rx="1.3" fill="#ffb45c"/></svg>
        <span>TSoftware<span class="brand__tld">.online</span></span>
      </a>
      <nav class="nav" id="site-nav" aria-label="${esc(S.navAria)}">
        ${S.nav.map(([href, label, key]) => link(href, label, key)).join('\n        ')}
      </nav>
      <div class="header-cta">
        <a class="lang-switch" href="${esc(sw)}" hreflang="${other}" lang="${other}" aria-label="${esc(S.langSwitchAria)}" title="${esc(S.langSwitchTitle)}">${S.langSwitch}</a>
        <div class="theme" id="theme">
          <button type="button" class="theme__btn" id="theme-btn" aria-haspopup="true" aria-expanded="false" aria-label="${esc(S.themeAria)}" title="${esc(S.themeTitle)}"><svg class="ic" viewBox="0 0 24 24"><use href="#i-palette"/></svg></button>
          <div class="theme__menu" id="theme-menu" role="menu" hidden>
            <button type="button" role="menuitemradio" data-theme-set="slate" aria-checked="true"><i style="--sw:#4a7bff;--sb:#141c31"></i>${S.themes[0]}</button>
            <button type="button" role="menuitemradio" data-theme-set="dark" aria-checked="false"><i style="--sw:#3f6ff5;--sb:#070b16"></i>${S.themes[1]}</button>
            <button type="button" role="menuitemradio" data-theme-set="light" aria-checked="false"><i style="--sw:#2f5bff;--sb:#f5f7fc"></i>${S.themes[2]}</button>
            <button type="button" role="menuitemradio" data-theme-set="warm" aria-checked="false"><i style="--sw:#0f8a95;--sb:#faf8f3"></i>${S.themes[3]}</button>
          </div>
        </div>
        <a class="btn btn--primary" href="${prefix(lang)}/#kontakt" data-magnetic>${esc(S.cta)}</a>
        <button class="nav-toggle" type="button" aria-controls="site-nav" aria-expanded="false" aria-label="${esc(S.menuOpen)}"><span></span><span></span><span></span></button>
      </div>
    </div>
  </header>`;
}

function footer(site, lang = 'pl') {
  const S = strings(lang);
  const c = site.contact || {};
  return `<footer class="site-footer">
    <div class="container">
      <div class="footer__brand">
        <a class="brand" href="${prefix(lang)}/" aria-label="${esc(S.brandAria)}">
          <svg class="brand__mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="var(--bg, #141c31)" stroke="var(--accent, #78a2ff)" stroke-width="2"/><path d="M8 10h12M14 10v12" fill="none" stroke="var(--fg, #ffffff)" stroke-width="2.6" stroke-linecap="round"/><rect class="brand__cursor" x="19" y="20" width="6" height="2.6" rx="1.3" fill="#ffb45c"/></svg>
          <span>TSoftware<span class="brand__tld">.online</span></span>
        </a>
        <p>${esc(S.footerTagline)}</p>
      </div>
      <div>
        <h3 class="footer__h">${esc(S.footerServices)}</h3>
        <ul>
          ${S.services.map(([href, label]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('\n          ')}
        </ul>
      </div>
      <div>
        <h3 class="footer__h">${esc(S.footerCompany)}</h3>
        <ul>
          ${S.company.map(([href, label]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('\n          ')}
          <li><a href="#" data-consent-open>${esc(S.privacySettings)}</a></li>
          <li><a href="${S.otherLang[0]}" hreflang="${lang === 'en' ? 'pl' : 'en'}" lang="${lang === 'en' ? 'pl' : 'en'}">${esc(S.otherLang[1])}</a></li>
        </ul>
      </div>
      <div class="footer__bottom">
        <span>© <span id="year">${new Date().getFullYear()}</span> TSoftware · tsoftware.online</span>
        <span>${esc(c.owner || site.author)} · NIP ${esc(c.nip || '8842684500')} · Mrowiny</span>
      </div>
    </div>
  </footer>`;
}

function waFab(site, lang = 'pl') {
  const S = strings(lang);
  const c = site.contact || {};
  const num = String(c.whatsapp || '48503844406').replace(/\D/g, '');
  return `<a class="wa-fab" id="wa-fab" href="https://wa.me/${num}?text=${encodeURIComponent(S.waText)}" target="_blank" rel="noopener" aria-label="${esc(S.waAria)}">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2a9.8 9.8 0 0 0-8.4 14.8L2.2 21.8l4.9-1.3A9.8 9.8 0 1 0 12 2.2zm0 17.9a8.1 8.1 0 0 1-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8.1 8.1 0 1 1 12 20.1zm4.5-6c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.7a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>
    <span>WhatsApp</span>
  </a>`;
}

const SCRIPTS = `<script src="/assets/js/i18n.js"></script>
  <script src="/assets/js/consent.js"></script>
  <script src="/assets/js/features.js" defer></script>
  <script src="/assets/js/main.js" defer></script>
  <script src="/assets/js/blog.js" defer></script>
  <script src="/assets/js/newsletter.js" defer></script>`;

function cover(post, lang, { sizes = '(max-width: 760px) 100vw, 50vw', eager = false } = {}) {
  if (post.cover) {
    return `<img src="${esc(post.cover)}" alt="${esc(post.coverAlt || post.title)}" sizes="${sizes}" ${eager ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"'}>`;
  }
  const letter = (post.category || post.title || 'T').trim().charAt(0).toUpperCase();
  return `<div class="pcard__ph" aria-hidden="true" style="--h:${hue(post.category || post.title)}"><b>${esc(letter)}</b><span>${esc(post.category || strings(lang).defaultCat)}</span></div>`;
}
function hue(s) {
  let h = 0;
  for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function card(post, { big = false } = {}) {
  const lang = langOf(post.lang);
  const S = strings(lang);
  const url = postPath(post);
  return `<article class="pcard${big ? ' pcard--big' : ''}">
    <a class="pcard__link" href="${url}">
      <div class="pcard__media">${cover(post, lang, { sizes: big ? '(max-width: 900px) 100vw, 60vw' : '(max-width: 760px) 100vw, 33vw' })}</div>
      <div class="pcard__body">
        <div class="pcard__top"><span class="pcard__cat">${esc(post.category || S.defaultCat)}</span>${post.featured && big ? `<span class="pcard__star">${esc(S.featured)}</span>` : ''}</div>
        <h2 class="pcard__title">${esc(post.title)}</h2>
        <p class="pcard__excerpt">${esc(post.excerpt || '')}</p>
        <div class="pcard__meta"><time datetime="${esc(isoDate(post.publishedAt))}">${esc(formatDate(post.publishedAt, lang))}</time><span>·</span><span>${esc(minutes(post.readingMin, lang))}</span></div>
      </div>
    </a>
  </article>`;
}

/** Formularz zapisu na newsletter (obsługa: /assets/js/newsletter.js → POST /api/newsletter/subscribe). */
export function newsletterForm(lang = 'pl', { compact = false, source = 'blog' } = {}) {
  const S = strings(lang);
  const policy = lang === 'en' ? '/en/privacy-policy.html' : '/polityka-prywatnosci.html';
  return `<form class="nl${compact ? ' nl--compact' : ''}" id="newsletter" novalidate data-source="${esc(source)}" data-lang="${lang}">
      <div class="nl__text">
        <h3>${esc(S.nlTitle)}</h3>
        <p>${esc(S.nlText)}</p>
      </div>
      <div class="nl__fields">
        <label class="sr-only" for="nl-email-${source}">E-mail</label>
        <input id="nl-email-${source}" name="email" type="email" required placeholder="${esc(S.nlPlaceholder)}" autocomplete="email" inputmode="email">
        <div class="form__hp" aria-hidden="true"><label>${esc(S.nlHoneypot)} <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
        <button class="btn btn--primary" type="submit">${esc(S.nlBtn)}</button>
      </div>
      <label class="nl__consent"><input type="checkbox" name="consent" required> ${esc(S.nlConsent)} <a href="${policy}">${esc(S.nlPolicy)}</a></label>
      <p class="nl__status" role="status" aria-live="polite"></p>
    </form>`;
}

function ctaBlock(lang = 'pl') {
  const S = strings(lang);
  const p = prefix(lang);
  return `<section class="blog-cta">
    <div class="container blog-cta__inner">
      <div class="blog-cta__box">
        <svg class="ic" aria-hidden="true"><use href="#i-doc"/></svg>
        <div>
          <h2>${esc(S.ctaPdfTitle)}</h2>
          <p>${esc(S.ctaPdfText)}</p>
        </div>
        <a class="btn btn--primary" href="${p}/#lista">${esc(S.ctaPdfBtn)}</a>
      </div>
      <div class="blog-cta__box blog-cta__box--alt">
        <svg class="ic" aria-hidden="true"><use href="#i-check"/></svg>
        <div>
          <h2>${esc(S.ctaTalkTitle)}</h2>
          <p>${esc(S.ctaTalkText)}</p>
        </div>
        <a class="btn btn--ghost" href="${p}/#kontakt">${esc(S.cta)}</a>
      </div>
    </div>
    <div class="container">${newsletterForm(lang, { source: 'blog' })}</div>
  </section>`;
}

function pagination(base, page, pages, lang = 'pl') {
  if (pages <= 1) return '';
  const S = strings(lang);
  const seg = SEG[langOf(lang)].page;
  const link = (p) => (p === 1 ? base : `${base}${seg}/${p}/`);
  let items = '';
  for (let p = 1; p <= pages; p++) {
    items += p === page ? `<span class="pager__num is-current" aria-current="page">${p}</span>` : `<a class="pager__num" href="${link(p)}">${p}</a>`;
  }
  return `<nav class="pager" aria-label="${esc(S.pagerAria)}">
    ${page > 1 ? `<a class="pager__arrow" href="${link(page - 1)}" rel="prev">${esc(S.newer)}</a>` : `<span class="pager__arrow is-off">${esc(S.newer)}</span>`}
    <div class="pager__nums">${items}</div>
    ${page < pages ? `<a class="pager__arrow" href="${link(page + 1)}" rel="next">${esc(S.older)}</a>` : `<span class="pager__arrow is-off">${esc(S.older)}</span>`}
  </nav>`;
}

function plural(n, one, few, many) {
  n = Math.abs(Number(n) || 0);
  if (n === 1) return one;
  const d = n % 10, h = n % 100;
  if (d >= 2 && d <= 4 && !(h >= 12 && h <= 14)) return few;
  return many;
}

/* =========================================================================
   LISTA WPISÓW
   ctx: { site, lang, posts, page, pages, categories:[{name,slug,count}], category?:{name,slug}, tag?:string, featured?:post, total }
   ========================================================================= */
export function renderBlogIndex(ctx) {
  const site = { ...SITE_DEFAULT, ...(ctx.site || {}) };
  const lang = langOf(ctx.lang);
  const S = strings(lang);
  const seg = SEG[lang];
  const { posts = [], page = 1, pages = 1, categories = [], category = null, tag = null, featured = null } = ctx;
  const siteDesc = lang === 'en' ? S.siteDescription : site.description;
  const root = blogBase(lang);
  const base = category ? `${root}${seg.category}/${encodeURIComponent(category.slug)}/` : tag ? `${root}${seg.tag}/${encodeURIComponent(slugify(tag))}/` : root;
  const canonical = abs(site, page > 1 ? `${base}${seg.page}/${page}/` : base);
  const titleCore = category ? S.indexTitleCat(category.name) : tag ? S.indexTitleTag(tag) : S.indexTitle;
  const title = `${titleCore}${page > 1 ? S.indexPage(page) : ''} — ${site.name}`;
  const description = category ? S.indexDescCat(category.name, siteDesc) : tag ? S.indexDescTag(tag, siteDesc) : S.indexDesc(siteDesc);
  const other = lang === 'en' ? 'pl' : 'en';
  const alternates = !category && !tag && page === 1 ? [{ hreflang: 'pl', href: abs(site, '/blog/') }, { hreflang: 'en', href: abs(site, '/en/blog/') }, { hreflang: 'x-default', href: abs(site, '/blog/') }] : [];
  const extra = [
    page > 1 ? `<link rel="prev" href="${esc(abs(site, page === 2 ? base : `${base}${seg.page}/${page - 1}/`))}">` : '',
    page < pages ? `<link rel="next" href="${esc(abs(site, `${base}${seg.page}/${page + 1}/`))}">` : '',
    jsonLd({
      '@context': 'https://schema.org',
      '@type': 'Blog',
      '@id': abs(site, `${root}#blog`),
      url: abs(site, root),
      name: S.rssTitle(site.name),
      description: siteDesc,
      inLanguage: S.locale,
      publisher: { '@type': 'Organization', name: site.name, url: site.url, logo: abs(site, '/assets/img/favicon.svg') },
      blogPost: posts.slice(0, 10).map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: postUrl(site, p), datePublished: isoDate(p.publishedAt) })),
    }),
  ].join('\n  ');

  const showFeatured = featured && page === 1 && !category && !tag;
  const list = posts.filter((p) => !(showFeatured && p.id === featured.id));
  const chips = [`<a class="pill${!category && !tag ? ' is-on' : ''}" href="${root}">${esc(S.all)}</a>`]
    .concat(categories.map((c) => `<a class="pill${category && category.slug === c.slug ? ' is-on' : ''}" href="${catUrl(c, lang)}">${esc(c.name)}${c.count ? ` <small>${c.count}</small>` : ''}</a>`))
    .join('');

  return `${head({ site, lang, title, description, canonical, extra, alternates })}
<body class="page-blog">
  ${SPRITE}
  <a class="skip-link" href="#main">${esc(S.skip)}</a>
  <div class="scroll-progress" aria-hidden="true"><i></i></div>
  ${waFab(site, lang)}
  ${header('blog', lang, blogBase(other))}
  <main id="main" class="blog">
    <section class="blog-hero">
      <div class="container">
        <p class="eyebrow">${category ? esc(S.eyebrowCat) : tag ? esc(S.eyebrowTag) : esc(S.eyebrowBlog)}</p>
        <h1>${category ? esc(category.name) : tag ? `#${esc(tag)}` : esc(S.indexH1)}</h1>
        <p class="blog-hero__lead">${category || tag ? esc(S.posts(ctx.total ?? list.length)) : ''}${esc(S.indexLead)}</p>
        <nav class="blog-cats" aria-label="${esc(S.catsAria)}">${chips}<a class="blog-cats__rss" href="${feedPath(lang)}" title="${esc(S.rss)}"><svg class="ic"><use href="#i-rss"/></svg>RSS</a></nav>
      </div>
    </section>
    <section class="section blog-list">
      <div class="container">
        ${showFeatured ? card(featured, { big: true }) : ''}
        ${list.length ? `<div class="pgrid">${list.map((p) => card(p)).join('')}</div>` : `<p class="blog-empty">${esc(S.empty)}</p>`}
        ${pagination(base, page, pages, lang)}
      </div>
    </section>
    ${ctaBlock(lang)}
  </main>
  ${footer(site, lang)}
  ${SCRIPTS}
</body>
</html>`;
}

/* =========================================================================
   WPIS
   ctx: { site, post, related:[post], prev?:post, next?:post, translation?:post }
   post.html = wyrenderowany Markdown; post.toc = [{id,text,level}]
   ========================================================================= */
export function renderPost(ctx) {
  const site = { ...SITE_DEFAULT, ...(ctx.site || {}) };
  const { post, related = [], prev = null, next = null, translation = null } = ctx;
  const lang = langOf(post.lang);
  const S = strings(lang);
  const siteDesc = lang === 'en' ? S.siteDescription : site.description;
  const url = postUrl(site, post);
  const title = `${post.seo?.title || post.title}${S.blogTitleSuffix(site.name)}`;
  const description = post.seo?.description || post.excerpt || siteDesc;
  const ogImage = abs(site, post.og || post.cover || (lang === 'en' ? '/assets/img/og-en.png' : '/assets/img/og.png'));
  const published = isoDate(post.publishedAt);
  const modified = isoDate(post.updatedAt || post.publishedAt);
  const updatedVisible = post.updatedAt && post.publishedAt && new Date(post.updatedAt) - new Date(post.publishedAt) > 2 * 864e5;
  const tags = Array.isArray(post.tags) ? post.tags.filter(Boolean) : [];
  const toc = Array.isArray(post.toc) ? post.toc.filter((t) => t.level === 2 || t.level === 3) : [];
  const wordCount = String(post.content || '').split(/\s+/).filter(Boolean).length;
  const p = prefix(lang);
  const other = lang === 'en' ? 'pl' : 'en';
  const alternates = translation
    ? [
        { hreflang: lang, href: url },
        { hreflang: other, href: postUrl(site, translation) },
        { hreflang: 'x-default', href: lang === 'pl' ? url : postUrl(site, translation) },
      ]
    : [];

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
      inLanguage: S.locale,
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
        { '@type': 'ListItem', position: 1, name: S.home, item: site.url + p + '/' },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: abs(site, blogBase(lang)) },
        post.category ? { '@type': 'ListItem', position: 3, name: post.category, item: abs(site, catUrl({ name: post.category, slug: catSlug(post) }, lang)) } : null,
        { '@type': 'ListItem', position: post.category ? 4 : 3, name: post.title, item: url },
      ].filter(Boolean),
    }),
  ].filter(Boolean).join('\n  ');

  const shareText = encodeURIComponent(post.title);
  const shareUrl = encodeURIComponent(url);
  const share = (cls) => `<div class="share ${cls}" data-share data-url="${esc(url)}" data-title="${esc(post.title)}">
      <span class="share__label">${esc(S.share)}</span>
      <a class="share__btn" href="https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}" target="_blank" rel="noopener" aria-label="${esc(S.shareLinkedin)}" data-net="linkedin">${SOCIAL.linkedin}</a>
      <a class="share__btn" href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}" target="_blank" rel="noopener" aria-label="${esc(S.shareFacebook)}" data-net="facebook">${SOCIAL.facebook}</a>
      <a class="share__btn" href="https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}" target="_blank" rel="noopener" aria-label="${esc(S.shareX)}" data-net="x">${SOCIAL.x}</a>
      <a class="share__btn" href="https://wa.me/?text=${shareText}%20${shareUrl}" target="_blank" rel="noopener" aria-label="${esc(S.shareWa)}" data-net="whatsapp">${SOCIAL.whatsapp}</a>
      <button type="button" class="share__btn" data-copy aria-label="${esc(S.copyLink)}"><svg class="ic"><use href="#i-link"/></svg></button>
      <button type="button" class="share__btn share__btn--native" data-native hidden aria-label="${esc(S.share)}"><svg class="ic"><use href="#i-share"/></svg></button>
      <span class="share__done" aria-live="polite"></span>
    </div>`;

  const tocHtml = toc.length
    ? `<nav class="toc" aria-label="${esc(S.tocAria)}"><p class="toc__title">${esc(S.tocTitle)}</p><ol>${toc.map((t) => `<li class="toc__l${t.level}"><a href="#${esc(t.id)}">${esc(t.text)}</a></li>`).join('')}</ol></nav>`
    : '';

  return `${head({ site, lang, title, description, canonical: url, ogImage, ogType: 'article', extra, alternates })}
<body class="page-post">
  ${SPRITE}
  <a class="skip-link" href="#main">${esc(S.skip)}</a>
  <div class="scroll-progress" aria-hidden="true"><i></i></div>
  ${waFab(site, lang)}
  ${header('blog', lang, translation ? postPath(translation) : blogBase(other))}
  <main id="main" class="post">
    <header class="post-hero">
      <div class="container post-hero__inner">
        <nav class="crumbs" aria-label="${esc(S.crumbsAria)}"><a href="${p}/">${esc(S.start)}</a><span>/</span><a href="${blogBase(lang)}">Blog</a>${post.category ? `<span>/</span><a href="${catUrl({ name: post.category, slug: catSlug(post) }, lang)}">${esc(post.category)}</a>` : ''}</nav>
        <h1>${esc(post.title)}</h1>
        ${post.excerpt ? `<p class="post-hero__lead">${esc(post.excerpt)}</p>` : ''}
        <div class="post-meta">
          <span class="post-meta__author"><i aria-hidden="true">T</i>${esc(site.author)}</span>
          <time datetime="${esc(published)}">${esc(formatDate(post.publishedAt, lang))}</time>
          <span><svg class="ic"><use href="#i-clock"/></svg>${esc(minutes(post.readingMin, lang))}</span>
          ${updatedVisible ? `<span class="post-meta__upd">${esc(S.updated)} ${esc(formatDate(post.updatedAt, lang))}</span>` : ''}
          ${translation ? `<a class="post-meta__lang" href="${postPath(translation)}" hreflang="${other}" lang="${other}">${esc(S.inOtherLang)}</a>` : ''}
        </div>
      </div>
    </header>
    ${post.cover ? `<figure class="post-cover"><div class="container"><img src="${esc(post.cover)}" alt="${esc(post.coverAlt || post.title)}" width="1200" height="630" fetchpriority="high" decoding="async"></div></figure>` : ''}
    <div class="container post-layout">
      <aside class="post-side">
        ${tocHtml}
        ${share('share--side')}
        <div class="side-cta">
          <p class="side-cta__t">${esc(S.sideCtaTitle)}</p>
          <p>${esc(S.sideCtaText)}</p>
          <a class="btn btn--primary" href="${p}/#kontakt">${esc(S.cta)}</a>
        </div>
      </aside>
      <article class="post-body prose" id="tresc">
        ${post.html || `<p>${esc(S.contentSoon)}</p>`}
        ${tags.length ? `<div class="post-tags">${tags.map((t) => `<a class="tag" href="${tagUrl(t, lang)}">#${esc(t)}</a>`).join('')}</div>` : ''}
        ${share('share--bottom')}
        <div class="author-box">
          <div class="author-box__avatar" aria-hidden="true">T</div>
          <div>
            <p class="author-box__name">${esc(site.author)}</p>
            <p>${esc(S.authorBio)}</p>
            <div class="author-box__links"><a href="${p}/#realizacje">${esc(S.caseStudies)}</a><a href="${p}/#kontakt">${esc(S.contact)}</a><a href="https://wa.me/${String((site.contact || {}).whatsapp || '48503844406').replace(/\D/g, '')}" target="_blank" rel="noopener">WhatsApp</a></div>
          </div>
        </div>
      </article>
    </div>
    ${prev || next ? `<nav class="post-nav container" aria-label="${esc(S.neighbours)}">
      ${prev ? `<a class="post-nav__a" href="${postPath(prev)}" rel="prev"><small>${esc(S.prev)}</small><span>${esc(prev.title)}</span></a>` : '<span></span>'}
      ${next ? `<a class="post-nav__a post-nav__a--next" href="${postPath(next)}" rel="next"><small>${esc(S.next)}</small><span>${esc(next.title)}</span></a>` : '<span></span>'}
    </nav>` : ''}
    ${related.length ? `<section class="section related"><div class="container">
      <div class="section__head"><div><p class="eyebrow">${esc(S.readOn)}</p><h2>${esc(S.related)}</h2></div></div>
      <div class="pgrid">${related.slice(0, 3).map((r) => card(r)).join('')}</div>
    </div></section>` : ''}
    ${ctaBlock(lang)}
  </main>
  ${footer(site, lang)}
  ${SCRIPTS}
</body>
</html>`;
}

/* =========================================================================
   404 dla /blog/...
   ========================================================================= */
export function renderNotFound(ctx = {}) {
  const site = { ...SITE_DEFAULT, ...(ctx.site || {}) };
  const lang = langOf(ctx.lang);
  const S = strings(lang);
  return `${head({ site, lang, title: `${S.notFoundTitle}${S.blogTitleSuffix(site.name)}`, description: S.notFoundDesc, canonical: abs(site, blogBase(lang)), noindex: true })}
<body class="page-blog">
  ${SPRITE}
  ${header('blog', lang)}
  <main id="main" class="blog">
    <section class="blog-hero"><div class="container">
      <p class="eyebrow">404</p>
      <h1>${esc(S.notFoundH1)}</h1>
      <p class="blog-hero__lead">${esc(S.notFoundLead)}</p>
      <p><a class="btn btn--primary" href="${blogBase(lang)}">${esc(S.allPosts)}</a></p>
    </div></section>
  </main>
  ${footer(site, lang)}
  ${SCRIPTS}
</body>
</html>`;
}

/* =========================================================================
   PROSTA STRONA (potwierdzenie newslettera, wypisanie itp.)
   ctx: { site, lang, title, lead, body (HTML), noindex }
   ========================================================================= */
export function renderPage(ctx = {}) {
  const site = { ...SITE_DEFAULT, ...(ctx.site || {}) };
  const lang = langOf(ctx.lang);
  const S = strings(lang);
  const title = `${ctx.title || ''} — ${site.name}`;
  return `${head({ site, lang, title, description: ctx.lead || '', canonical: abs(site, blogBase(lang)), noindex: ctx.noindex !== false })}
<body class="page-blog">
  ${SPRITE}
  ${header('blog', lang)}
  <main id="main" class="blog">
    <section class="blog-hero"><div class="container">
      <p class="eyebrow">${esc(ctx.eyebrow || 'Newsletter')}</p>
      <h1>${esc(ctx.title || '')}</h1>
      ${ctx.lead ? `<p class="blog-hero__lead">${esc(ctx.lead)}</p>` : ''}
      ${ctx.body || ''}
    </div></section>
  </main>
  ${footer(site, lang)}
  ${SCRIPTS}
</body>
</html>`;
}

/* =========================================================================
   RSS
   ctx: { site, lang, posts }
   ========================================================================= */
export function renderFeed(ctx) {
  const site = { ...SITE_DEFAULT, ...(ctx.site || {}) };
  const lang = langOf(ctx.lang);
  const S = strings(lang);
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
    <title>${esc(S.rssTitle(site.name))}</title>
    <link>${esc(abs(site, blogBase(lang)))}</link>
    <atom:link href="${esc(abs(site, feedPath(lang)))}" rel="self" type="application/rss+xml"/>
    <description>${esc(lang === 'en' ? S.siteDescription : site.description)}</description>
    <language>${S.locale}</language>
    <lastBuildDate>${new Date(posts[0]?.publishedAt || Date.now()).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;
}
