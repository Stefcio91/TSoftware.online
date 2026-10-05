/* =============================================================================
   TSoftware — admin.js
   Panel właściciela: vanilla JS, bez zależności. Rozmawia z API pod /api/admin/*
   (ten sam origin, cookie HttpOnly). Każdy string z serwera trafia do DOM przez
   textContent (helper h()) — nigdy przez innerHTML. Jedyny wyjątek: podgląd wpisu
   na blogu, czyli HTML wyrenderowany przez własny serwer z Markdowna właściciela.
   ============================================================================= */
(function () {
  'use strict';

  /* ---------------------------------------------------------------------------
     Narzędzia DOM
     ------------------------------------------------------------------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const SVG_NS = 'http://www.w3.org/2000/svg';

  /** Ucieczka HTML — używana tylko tam, gdzie string ląduje w atrybucie/tekście
   *  budowanym ręcznie. Reszta idzie przez textContent. */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** h('div', {class:'x', onclick: fn, dataset:{id:1}}, 'tekst', node, [nodes]) */
  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'style') el.style.cssText = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, String(v));
      }
    }
    appendChildren(el, Array.prototype.slice.call(arguments, 2));
    return el;
  }
  function appendChildren(el, children) {
    for (const c of children) {
      if (c == null || c === false) continue;
      if (Array.isArray(c)) { appendChildren(el, c); continue; }
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
  }
  function svg(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    if (attrs) for (const k of Object.keys(attrs)) {
      if (attrs[k] == null) continue;
      if (k === 'text') el.textContent = attrs[k];
      else el.setAttribute(k, String(attrs[k]));
    }
    appendChildren(el, Array.prototype.slice.call(arguments, 2));
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function show(el) { el.hidden = false; }
  function hide(el) { el.hidden = true; }
  function debounce(fn, ms) {
    let t = 0;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  /* ---------------------------------------------------------------------------
     Daty i etykiety
     ------------------------------------------------------------------------- */
  function toDate(ts) {
    if (ts == null || ts === '') return null;
    let d;
    if (typeof ts === 'number') d = new Date(ts < 1e11 ? ts * 1000 : ts);
    else if (/^\d+$/.test(String(ts))) { const n = Number(ts); d = new Date(n < 1e11 ? n * 1000 : n); }
    else d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  const fmtExact = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fmtShort = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' });
  const fmtShortYear = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtDayMonth = new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit' });
  const fmtDayLong = new Intl.DateTimeFormat('pl-PL', { weekday: 'short', day: 'numeric', month: 'long' });

  function exactDate(ts) { const d = toDate(ts); return d ? fmtExact.format(d) : '—'; }
  function relTime(ts) {
    const d = toDate(ts);
    if (!d) return '—';
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 0) return fmtShort.format(d);
    if (diff < 45) return 'przed chwilą';
    if (diff < 3600) return Math.round(diff / 60) + ' min temu';
    if (diff < 86400) { const g = Math.round(diff / 3600); return g + ' godz. temu'; }
    if (diff < 172800) return 'wczoraj';
    if (diff < 7 * 86400) return Math.round(diff / 86400) + ' dni temu';
    return d.getFullYear() === new Date().getFullYear() ? fmtShort.format(d) : fmtShortYear.format(d);
  }
  function plural(n, one, few, many) {
    n = Math.abs(Number(n) || 0);
    if (n === 1) return one;
    const m10 = n % 10, m100 = n % 100;
    if (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) return few;
    return many;
  }
  function leadsWord(n) { return plural(n, 'zgłoszenie', 'zgłoszenia', 'zgłoszeń'); }

  const STATUS = [
    { key: 'nowe', label: 'Nowe', slug: 'nowe' },
    { key: 'w toku', label: 'W toku', slug: 'w-toku' },
    { key: 'zamkniete', label: 'Zamknięte', slug: 'zamkniete' }
  ];
  function statusInfo(s) {
    const key = String(s || '').toLowerCase();
    return STATUS.find((x) => x.key === key) || { key: key, label: key || 'brak', slug: 'inne' };
  }
  const SOURCES = { form: 'Formularz', formularz: 'Formularz', kalkulator: 'Kalkulator', konfigurator: 'Konfigurator', magnet: 'Lead magnet', inne: 'Inne' };
  function sourceLabel(s) { const k = String(s || '').toLowerCase(); return SOURCES[k] || (s ? String(s) : 'Inne'); }

  /* ---------------------------------------------------------------------------
     API
     ------------------------------------------------------------------------- */
  function ApiError(message, status, data) {
    this.name = 'ApiError';
    this.message = message;
    this.status = status || 0;
    this.data = data || null;
  }
  ApiError.prototype = Object.create(Error.prototype);

  const OFFLINE_MSG = 'Brak połączenia z serwerem. Sprawdź, czy backend (node server/server.js) działa.';

  async function api(path, opts) {
    opts = opts || {};
    const init = {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'fetch', 'Accept': 'application/json' }
    };
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    let res;
    try {
      res = await fetch(path, init);
    } catch (e) {
      throw new ApiError(OFFLINE_MSG, 0, null);
    }
    let data = null;
    const text = await res.text().catch(() => '');
    if (text) { try { data = JSON.parse(text); } catch (e) { data = null; } }

    if (res.status === 401) {
      if (!opts.quiet401) onUnauthorized();
      throw new ApiError('Sesja wygasła. Zaloguj się ponownie.', 401, data);
    }
    if (res.status === 429) {
      toast('Za dużo prób, odczekaj chwilę.', 'error');
      throw new ApiError('Za dużo prób, odczekaj chwilę.', 429, data);
    }
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) ? String(data.error || data.message) : 'Błąd serwera (' + res.status + ')';
      throw new ApiError(msg, res.status, data);
    }
    if (data === null) {
      if (!text) return {};
      throw new ApiError('Serwer odpowiedział czymś, co nie jest JSON-em.', res.status, null);
    }
    return data;
  }
  function qs(params) {
    const u = new URLSearchParams();
    Object.keys(params).forEach((k) => { if (params[k] !== '' && params[k] != null) u.set(k, params[k]); });
    const s = u.toString();
    return s ? '?' + s : '';
  }

  /* ---------------------------------------------------------------------------
     Toasty
     ------------------------------------------------------------------------- */
  const toastsEl = $('#toasts');
  function toast(msg, kind) {
    const el = h('div', { class: 'toast toast--' + (kind || 'ok'), role: kind === 'error' ? 'alert' : 'status' }, msg);
    toastsEl.append(el);
    requestAnimationFrame(() => el.classList.add('is-in'));
    setTimeout(() => { el.classList.remove('is-in'); setTimeout(() => el.remove(), 260); }, kind === 'error' ? 5000 : 3200);
  }

  /* ---------------------------------------------------------------------------
     Stan
     ------------------------------------------------------------------------- */
  const PAGE = 50;
  const state = {
    view: null,
    param: null,
    authed: false,
    leads: { items: [], total: 0, counts: {}, offset: 0, q: '', status: '', source: '', req: 0 },
    drawer: { id: null, item: null, opener: null, open: false },
    magnet: { items: [], total: 0, req: 0 },
    stats: { data: null, posts: null },
    settings: { original: null, built: false },
    blog: { items: [], total: 0, counts: {}, q: '', status: '', lang: '', req: 0 },
    post: { id: null, item: null, base: null, saving: false, tags: [], cover: '', slugAuto: true, previewReq: 0, readingMin: 0, savedAt: null, leaveTarget: null, leaving: false, autosaveTimer: 0, ogBlob: null, translationOf: '', trReq: 0 },
    newsletter: {
      tab: null,
      subs: { items: [], total: 0, counts: {}, q: '', status: 'all', req: 0 },
      camps: { items: [], req: 0 },
      settings: { data: null, original: null, req: 0 },
      camp: { id: null, item: null, posts: [], rawIds: {}, selected: [], base: null, saving: false, req: 0, postsReq: 0, poll: 0, width: 600, activeN: null, savedAt: null }
    }
  };

  const els = {
    boot: $('#boot'), login: $('#login'), app: $('#app'),
    loginForm: $('#login-form'), password: $('#password'), loginError: $('#login-error'), loginNote: $('#login-note'), loginSubmit: $('#login-submit'),
    nav: $('#nav'), navBadge: $('#nav-badge-new'), navBadgeDrafts: $('#nav-badge-drafts'), navBadgeNl: $('#nav-badge-nl'), logout: $('#logout'),
    views: { leads: $('#view-leads'), blog: $('#view-blog'), post: $('#view-post'), newsletter: $('#view-newsletter'), stats: $('#view-stats'), magnet: $('#view-magnet'), settings: $('#view-settings') },
    leadsQ: $('#leads-q'), leadsStatus: $('#leads-status'), leadsSource: $('#leads-source'), leadsList: $('#leads-list'), leadsState: $('#leads-state'), leadsMore: $('#leads-more'), leadsCount: $('#leads-count'), leadsExport: $('#leads-export'),
    drawer: $('#drawer'), drawerBackdrop: $('#drawer-backdrop'), drawerTitle: $('#drawer-title'), drawerBody: $('#drawer-body'), drawerClose: $('#drawer-close'),
    statsBody: $('#stats-body'), statsRefresh: $('#stats-refresh'),
    magnetList: $('#magnet-list'), magnetState: $('#magnet-state'), magnetMore: $('#magnet-more'), magnetCount: $('#magnet-count'), magnetCopy: $('#magnet-copy'),
    settingsForm: $('#settings-form'), settingsSections: $('#settings-sections'), settingsState: $('#settings-state'), settingsSave: $('#settings-save'), settingsReset: $('#settings-reset'), settingsHint: $('#settings-hint'),
    blogQ: $('#blog-q'), blogStatus: $('#blog-status'), blogLang: $('#blog-lang'), postsList: $('#posts-list'), postsState: $('#posts-state'), postsMore: $('#posts-more'), postsCount: $('#posts-count'),
    postH1: $('#h-post'), postState: $('#post-state'), postForm: $('#post-form'), postSaveState: $('#post-savestate'), postViewLink: $('#post-view'), postSaveDraft: $('#post-save-draft'), postPublish: $('#post-publish'),
    postGuard: $('#post-guard'), postGuardStay: $('#post-guard-stay'), postGuardSave: $('#post-guard-save'), postGuardDiscard: $('#post-guard-discard'),
    postRestore: $('#post-restore'), postRestoreText: $('#post-restore-text'), postRestoreYes: $('#post-restore-yes'), postRestoreNo: $('#post-restore-no'),
    postDanger: $('#post-danger'), postDelete: $('#post-delete')
  };

  /* ---------------------------------------------------------------------------
     Ekrany: boot / login / app
     ------------------------------------------------------------------------- */
  function showBoot() { show(els.boot); hide(els.login); hide(els.app); }
  function showLogin(note) {
    state.authed = false;
    closeDrawer(true);
    hide(els.boot); hide(els.app); show(els.login);
    hide(els.loginError);
    if (note) { els.loginNote.textContent = note; show(els.loginNote); } else { hide(els.loginNote); }
    els.loginSubmit.disabled = false;
    els.loginSubmit.removeAttribute('aria-busy');
    setTimeout(() => { try { els.password.focus(); } catch (e) { /* noop */ } }, 30);
  }
  function showApp() {
    state.authed = true;
    hide(els.boot); hide(els.login); show(els.app);
    const r = routeFromHash();
    setView(r ? r.view : 'leads', r ? r.param : null, true);
  }
  function onUnauthorized() {
    if (!state.authed) return;
    showLogin('Sesja wygasła — zaloguj się ponownie.');
  }

  async function boot() {
    showBoot();
    try {
      await api('/api/admin/me', { quiet401: true });
      showApp();
    } catch (e) {
      showLogin(e.status === 401 ? '' : e.message);
    }
  }

  els.loginForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const pw = els.password.value;
    hide(els.loginError);
    if (!pw) {
      els.loginError.textContent = 'Wpisz hasło.';
      show(els.loginError);
      els.password.focus();
      return;
    }
    els.loginSubmit.disabled = true;
    els.loginSubmit.setAttribute('aria-busy', 'true');
    try {
      await api('/api/admin/login', { method: 'POST', body: { password: pw }, quiet401: true });
      els.password.value = '';
      hide(els.loginNote);
      showApp();
    } catch (e) {
      els.loginError.textContent = e.status === 401 ? 'Nieprawidłowe hasło.' : e.message;
      show(els.loginError);
      els.password.select();
    } finally {
      els.loginSubmit.disabled = false;
      els.loginSubmit.removeAttribute('aria-busy');
    }
  });

  els.logout.addEventListener('click', async () => {
    els.logout.disabled = true;
    try { await api('/api/admin/logout', { method: 'POST', quiet401: true }); } catch (e) { /* i tak wylogowujemy lokalnie */ }
    els.logout.disabled = false;
    resetState();
    showLogin();
    toast('Wylogowano.', 'info');
  });

  function resetState() {
    state.leads.items = []; state.leads.total = 0; state.leads.counts = {}; state.leads.offset = 0;
    state.magnet.items = []; state.magnet.total = 0;
    state.stats.data = null; state.stats.posts = null;
    state.settings.original = null;
    state.blog.items = []; state.blog.total = 0; state.blog.counts = {}; state.blog.q = ''; state.blog.status = ''; state.blog.lang = '';
    if (state.view === 'post') leavePost();
    postStateReset();
    newsletterReset();
    clear(els.leadsList); clear(els.statsBody); clear(els.magnetList); clear(els.postsList);
    hide(els.navBadge); hide(els.navBadgeDrafts); hide(els.navBadgeNl);
  }

  /* ---------------------------------------------------------------------------
     Routing (hash)
     ------------------------------------------------------------------------- */
  const VIEWS = {
    leads: { hash: 'zgloszenia', load: () => loadLeads() },
    blog: { hash: 'blog', load: () => loadBlog() },
    post: { hash: 'blog/', param: true, nav: 'blog', load: () => openPost(state.param) },
    newsletter: { hash: 'newsletter', sub: true, load: () => loadNewsletter(state.param) },
    stats: { hash: 'statystyki', load: () => loadStats() },
    magnet: { hash: 'lead-magnet', load: () => loadMagnet() },
    settings: { hash: 'ustawienia', load: () => loadSettings() }
  };
  /** '#blog/12' → { view: 'post', param: '12' }; '#blog' → { view: 'blog', param: null };
   *  widoki z `sub`: '#newsletter' → param null, '#newsletter/kampania/3' → param 'kampania/3'. */
  function routeFromHash() {
    const hsh = (location.hash || '').replace(/^#\/?/, '').replace(/\/+$/, '');
    const dec = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };
    for (const k of Object.keys(VIEWS)) {
      const v = VIEWS[k];
      if (v.param) {
        if (hsh.indexOf(v.hash) === 0 && hsh.length > v.hash.length) return { view: k, param: dec(hsh.slice(v.hash.length)) };
      } else if (v.sub) {
        if (hsh === v.hash) return { view: k, param: null };
        if (hsh.indexOf(v.hash + '/') === 0) return { view: k, param: hsh.slice(v.hash.length + 1).split('/').map(dec).join('/') || null };
      } else if (v.hash === hsh) return { view: k, param: null };
    }
    return null;
  }
  function hashFor(name, param) {
    const v = VIEWS[name];
    if (v.param) return '#' + v.hash + encodeURIComponent(param);
    if (v.sub && param) return '#' + v.hash + '/' + String(param).split('/').map(encodeURIComponent).join('/');
    return '#' + v.hash;
  }
  function setView(name, param, force) {
    if (!VIEWS[name]) { name = 'leads'; param = null; }
    param = param == null ? null : String(param);
    if (state.view === name && state.param === param && !force) return;
    if (state.view === 'post' && !(name === 'post' && state.param === param)) leavePost();
    if (state.view === 'newsletter' && name !== 'newsletter') leaveNewsletter();
    state.view = name;
    state.param = param;
    Object.keys(els.views).forEach((k) => { if (k === name) show(els.views[k]); else hide(els.views[k]); });
    const navKey = VIEWS[name].nav || name;
    $$('a[data-view]', els.nav).forEach((a) => {
      if (a.dataset.view === navKey) {
        a.setAttribute('aria-current', 'page');
        if (typeof a.scrollIntoView === 'function') { try { a.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* stare przeglądarki */ } }
      } else a.removeAttribute('aria-current');
    });
    const want = hashFor(name, param);
    if (location.hash !== want) history.replaceState(null, '', want);
    setDocTitle();
    closeDrawer(true);
    window.scrollTo({ top: 0 });
    VIEWS[name].load();
  }
  window.addEventListener('hashchange', () => {
    if (!state.authed) return;
    const r = routeFromHash() || { view: 'leads', param: null };
    // Edytor wpisu z niezapisanymi zmianami: pytamy inline, zamiast wychodzić po cichu.
    if (state.view === 'post' && !(r.view === 'post' && r.param === state.param) && !state.post.leaving && isPostDirty()) {
      guardLeave(location.hash);
      return;
    }
    state.post.leaving = false;
    setView(r.view, r.param);
  });

  /* ---------------------------------------------------------------------------
     Stany list (ładowanie / pusto / błąd)
     ------------------------------------------------------------------------- */
  function renderState(el, kind, title, text, retry) {
    clear(el);
    el.className = 'leads__state' + (kind === 'error' ? ' leads__state--error' : '');
    if (kind === 'loading') {
      el.append(h('div', { class: 'boot__spinner', 'aria-hidden': 'true' }), h('p', null, text || 'Ładowanie…'));
    } else {
      if (title) el.append(h('h3', null, title));
      if (text) el.append(h('p', null, text));
      if (retry) el.append(h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: retry }, 'Spróbuj ponownie'));
    }
    show(el);
  }

  /* ---------------------------------------------------------------------------
     Zgłoszenia
     ------------------------------------------------------------------------- */
  function renderStatusChips() {
    const counts = state.leads.counts || {};
    const chips = [{ key: '', label: 'Wszystkie', n: counts.all }].concat(STATUS.map((s) => ({ key: s.key, label: s.label, n: counts[s.key] })));
    clear(els.leadsStatus);
    chips.forEach((c) => {
      const btn = h('button', {
        class: 'chip', type: 'button', 'aria-pressed': state.leads.status === c.key ? 'true' : 'false',
        onclick: () => { if (state.leads.status === c.key) return; state.leads.status = c.key; renderStatusChips(); loadLeads(); }
      }, c.label, c.n != null ? h('span', { class: 'chip__n' }, String(c.n)) : null);
      els.leadsStatus.append(btn);
    });
    const nowe = Number(counts.nowe);
    if (nowe > 0) { els.navBadge.textContent = String(nowe); show(els.navBadge); } else { hide(els.navBadge); }
  }

  function leadsParams(offset) {
    return qs({ status: state.leads.status, q: state.leads.q, source: state.leads.source, limit: PAGE, offset: offset || 0 });
  }

  async function loadLeads(opts) {
    opts = opts || {};
    const append = !!opts.append;
    const L = state.leads;
    const offset = append ? L.items.length : 0;
    const req = ++L.req;
    if (!append) {
      clear(els.leadsList);
      renderState(els.leadsState, 'loading');
      hide(els.leadsMore);
      els.leadsCount.textContent = '';
    } else {
      els.leadsMore.disabled = true;
      els.leadsMore.setAttribute('aria-busy', 'true');
    }
    try {
      const data = await api('/api/admin/leads' + leadsParams(offset));
      if (req !== L.req) return;
      const items = Array.isArray(data.items) ? data.items : [];
      L.items = append ? L.items.concat(items) : items;
      L.total = Number.isFinite(Number(data.total)) ? Number(data.total) : L.items.length;
      if (data.counts && isObj(data.counts)) L.counts = data.counts;
      L.offset = L.items.length;
      renderLeads(append ? items : null);
    } catch (e) {
      if (req !== L.req || e.status === 401) return;
      if (append) toast(e.message, 'error');
      else renderState(els.leadsState, 'error', 'Nie udało się pobrać zgłoszeń', e.message, () => loadLeads());
    } finally {
      els.leadsMore.disabled = false;
      els.leadsMore.removeAttribute('aria-busy');
    }
  }

  function renderLeads(appended) {
    const L = state.leads;
    renderStatusChips();
    if (appended) {
      appended.forEach((it) => els.leadsList.append(leadRow(it)));
    } else {
      clear(els.leadsList);
      L.items.forEach((it) => els.leadsList.append(leadRow(it)));
    }
    if (!L.items.length) {
      const filtered = L.q || L.status || L.source;
      renderState(els.leadsState, 'empty',
        filtered ? 'Nic nie pasuje do filtrów' : 'Jeszcze nic nie wpadło.',
        filtered ? 'Spróbuj innego hasła albo wyczyść filtry.' : 'Jak ktoś napisze przez stronę, pojawi się tutaj.');
    } else {
      hide(els.leadsState);
    }
    els.leadsCount.textContent = L.items.length ? 'Pokazano ' + L.items.length + ' z ' + L.total : '';
    if (L.items.length < L.total) show(els.leadsMore); else hide(els.leadsMore);
  }

  function leadRow(item) {
    const st = statusInfo(item.status);
    const li = h('li', { class: 'lead lead--' + st.slug, dataset: { id: item.id } });
    const openBtn = h('button', { class: 'lead__open', type: 'button', onclick: () => openDrawer(item.id, openBtn) },
      item.name || item.email || 'Bez nazwy');
    li.addEventListener('click', (ev) => {
      if (ev.target.closest('a, button')) return;
      openDrawer(item.id, openBtn);
    });
    li.append(
      h('span', { class: 'lead__date', title: exactDate(item.ts) }, relTime(item.ts)),
      h('span', { class: 'lead__who' }, openBtn, item.company ? h('span', { class: 'lead__company' }, item.company) : null),
      item.email ? h('a', { class: 'lead__email', href: 'mailto:' + item.email, title: item.email }, item.email) : h('span', { class: 'lead__email' }, '—'),
      h('span', { class: 'lead__topic', title: item.topic || '' }, item.topic || '—'),
      h('span', { class: 'lead__source' }, h('span', { class: 'badge' }, sourceLabel(item.source))),
      h('span', { class: 'lead__status' }, h('span', { class: 'pill pill--' + st.slug }, st.label)),
      h('span', { class: 'lead__msg' }, firstLine(item.message))
    );
    return li;
  }
  function firstLine(s) {
    const t = String(s == null ? '' : s).trim();
    const nl = t.indexOf('\n');
    return (nl >= 0 ? t.slice(0, nl) : t).replace(/\s+/g, ' ');
  }

  els.leadsQ.addEventListener('input', debounce(() => {
    const v = els.leadsQ.value.trim();
    if (v === state.leads.q) return;
    state.leads.q = v;
    loadLeads();
  }, 300));
  els.leadsQ.addEventListener('search', () => { const v = els.leadsQ.value.trim(); if (v !== state.leads.q) { state.leads.q = v; loadLeads(); } });
  els.leadsSource.addEventListener('change', () => { state.leads.source = els.leadsSource.value; loadLeads(); });
  els.leadsMore.addEventListener('click', () => loadLeads({ append: true }));

  /* ---------------------------------------------------------------------------
     Szuflada
     ------------------------------------------------------------------------- */
  function findLead(id) {
    const sid = String(id);
    return state.leads.items.find((x) => String(x.id) === sid)
      || ((state.stats.data && Array.isArray(state.stats.data.latest)) ? state.stats.data.latest.find((x) => String(x.id) === sid) : null)
      || null;
  }

  async function openDrawer(id, opener) {
    const cached = findLead(id);
    state.drawer = { id: id, item: cached ? clone(cached) : null, opener: opener || document.activeElement, open: true };
    show(els.drawerBackdrop); show(els.drawer);
    document.body.classList.add('has-drawer');
    if (cached) renderDrawer(cached); else renderDrawerLoading();
    els.drawerClose.focus();
    try {
      const d = await api('/api/admin/leads/' + encodeURIComponent(id));
      const item = d && d.item ? d.item : (d && d.id != null ? d : null);
      if (!state.drawer.open || String(state.drawer.id) !== String(id)) return;
      if (item) {
        state.drawer.item = item;
        mergeLead(item);
        renderDrawer(item);
      } else if (!cached) {
        renderDrawerError('Serwer nie zwrócił szczegółów zgłoszenia.');
      }
    } catch (e) {
      if (!state.drawer.open || String(state.drawer.id) !== String(id) || e.status === 401) return;
      if (!cached) renderDrawerError(e.message);
    }
  }

  function closeDrawer(silent) {
    if (!state.drawer.open && silent) { hide(els.drawer); hide(els.drawerBackdrop); document.body.classList.remove('has-drawer'); return; }
    let opener = state.drawer.opener;
    const id = state.drawer.id;
    state.drawer = { id: null, item: null, opener: null, open: false };
    hide(els.drawer); hide(els.drawerBackdrop);
    document.body.classList.remove('has-drawer');
    if (silent) return;
    // Wiersz mógł zostać przerysowany (zmiana statusu) — wtedy wracamy do jego aktualnego przycisku.
    if (!(opener && document.contains(opener)) && id != null) {
      const row = $$('.lead', els.leadsList).find((li) => li.dataset.id === String(id));
      opener = row ? $('.lead__open', row) : null;
    }
    if (opener && typeof opener.focus === 'function') opener.focus();
  }
  els.drawerClose.addEventListener('click', () => closeDrawer());
  els.drawerBackdrop.addEventListener('click', () => closeDrawer());
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && state.drawer.open) { ev.preventDefault(); closeDrawer(); }
  });

  function renderDrawerLoading() {
    els.drawerTitle.textContent = 'Ładowanie…';
    clear(els.drawerBody);
    els.drawerBody.append(h('div', { class: 'leads__state' }, h('div', { class: 'boot__spinner', 'aria-hidden': 'true' }), h('p', null, 'Pobieram szczegóły…')));
  }
  function renderDrawerError(msg) {
    els.drawerTitle.textContent = 'Błąd';
    clear(els.drawerBody);
    const st = h('div');
    renderState(st, 'error', 'Nie udało się pobrać zgłoszenia', msg, () => openDrawer(state.drawer.id, state.drawer.opener));
    els.drawerBody.append(st);
  }

  /** Polski numer: 9 cyfr (opcjonalnie +48), nie będący fragmentem dłuższej liczby. */
  function findPhone(item) {
    const parts = [item.phone, item.message];
    if (item.meta) {
      const m = parseMeta(item.meta);
      if (isObj(m)) { parts.push(m.phone, m.telefon, m.tel); }
      parts.push(typeof item.meta === 'string' ? item.meta : JSON.stringify(item.meta));
    }
    const hay = parts.filter((p) => p != null && p !== '').map(String).join(' \n ');
    const re = /(?<!\d)(?:\+?48[\s.-]?)?(?:\d[\s.-]?){8}\d(?!\d)/g;
    let m;
    while ((m = re.exec(hay))) {
      let digits = m[0].replace(/\D/g, '');
      if (digits.length === 11 && digits.slice(0, 2) === '48') digits = digits.slice(2);
      if (digits.length === 9) return digits;
    }
    return null;
  }
  function parseMeta(meta) {
    if (meta == null || meta === '') return null;
    if (typeof meta === 'string') { try { return JSON.parse(meta); } catch (e) { return meta; } }
    return meta;
  }
  function prettyMeta(meta) {
    const m = parseMeta(meta);
    if (m == null) return '';
    return typeof m === 'string' ? m : JSON.stringify(m, null, 2);
  }

  function renderDrawer(item) {
    const st = statusInfo(item.status);
    const body = els.drawerBody;
    els.drawerTitle.textContent = item.name || item.email || ('Zgłoszenie #' + item.id);
    clear(body);

    body.append(h('div', { class: 'drawer__row' },
      h('span', { class: 'pill pill--' + st.slug, id: 'drawer-status-pill' }, st.label),
      h('span', { class: 'badge' }, sourceLabel(item.source)),
      h('span', { class: 'count', title: exactDate(item.ts) }, relTime(item.ts))
    ));

    const phone = findPhone(item);
    const actions = h('div', { class: 'drawer__actions' });
    if (item.email) {
      const subject = 'Re: ' + (item.topic || 'Twoje zgłoszenie na TSoftware.online');
      actions.append(h('a', { class: 'btn btn--primary btn--sm', href: 'mailto:' + item.email + '?subject=' + encodeURIComponent(subject) }, 'Odpisz mailem'));
    }
    if (phone) {
      actions.append(h('a', { class: 'btn btn--ghost btn--sm', href: 'https://wa.me/48' + phone, target: '_blank', rel: 'noopener noreferrer' }, 'WhatsApp'));
    }
    if (actions.childNodes.length) body.append(actions);

    const kv = h('dl', { class: 'kv' });
    const row = (label, valueNode, dim) => { if (valueNode == null || valueNode === '') return; kv.append(h('dt', null, label), h('dd', { class: dim ? 'is-dim' : null }, valueNode)); };
    row('E-mail', item.email ? h('a', { href: 'mailto:' + item.email }, item.email) : null);
    row('Firma', item.company || null);
    row('Telefon', phone ? h('a', { href: 'tel:+48' + phone }, phone.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')) : null);
    row('Temat', item.topic || null);
    row('Źródło', sourceLabel(item.source));
    row('Data', exactDate(item.ts));
    row('ID', String(item.id), true);
    if (item.ip) row('IP', String(item.ip), true);
    if (item.ua) row('Przeglądarka', String(item.ua), true);
    body.append(kv);

    body.append(h('div', { class: 'block' },
      h('span', { class: 'block__label' }, 'Wiadomość'),
      h('pre', { class: 'msg' }, item.message ? String(item.message) : '(pusta)')
    ));

    const metaText = prettyMeta(item.meta);
    if (metaText) {
      body.append(h('details', { class: 'block', open: true },
        h('summary', null, h('span', { class: 'block__label' }, 'Szczegóły z kalkulatora / konfiguratora')),
        h('pre', { class: 'meta' }, metaText)
      ));
    }

    // Status
    const statusSel = h('select', { id: 'drawer-status' });
    STATUS.forEach((s) => statusSel.append(h('option', { value: s.key, selected: s.key === st.key }, s.label)));
    if (!STATUS.some((s) => s.key === st.key) && st.key) statusSel.prepend(h('option', { value: st.key, selected: true }, st.label));
    statusSel.addEventListener('change', async () => {
      const next = statusSel.value;
      statusSel.disabled = true;
      try {
        const updated = await patchLead(item.id, { status: next });
        const ns = statusInfo(updated.status);
        const pill = $('#drawer-status-pill');
        if (pill) { pill.className = 'pill pill--' + ns.slug; pill.textContent = ns.label; }
        toast('Status: ' + ns.label + '.');
      } catch (e) {
        if (e.status !== 401) { toast(e.message, 'error'); statusSel.value = st.key; }
      } finally { statusSel.disabled = false; }
    });
    body.append(h('div', { class: 'field' }, h('label', { for: 'drawer-status' }, 'Status'), statusSel));

    // Notatki
    const notes = h('textarea', { id: 'drawer-notes', rows: 4, placeholder: 'Notatka tylko dla Ciebie: co ustalone, co obiecane, kiedy oddzwonić…' });
    notes.value = item.notes ? String(item.notes) : '';
    const saveBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, 'Zapisz notatkę');
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true; saveBtn.setAttribute('aria-busy', 'true');
      try { await patchLead(item.id, { notes: notes.value }); toast('Zapisano.'); }
      catch (e) { if (e.status !== 401) toast(e.message, 'error'); }
      finally { saveBtn.disabled = false; saveBtn.removeAttribute('aria-busy'); }
    });
    body.append(h('div', { class: 'field' }, h('label', { for: 'drawer-notes' }, 'Notatki'), notes, h('div', { class: 'drawer__row' }, saveBtn)));

    // Usuwanie z potwierdzeniem inline
    const danger = h('div', { class: 'danger' });
    const delBtn = h('button', { class: 'btn btn--danger btn--sm', type: 'button' }, 'Usuń zgłoszenie');
    delBtn.addEventListener('click', () => {
      confirmInline(danger, delBtn, 'Usunąć to zgłoszenie? Nie da się tego cofnąć.', async () => {
        await api('/api/admin/leads/' + encodeURIComponent(item.id), { method: 'DELETE' });
        removeLead(item.id);
        closeDrawer(true);
        toast('Usunięto zgłoszenie.');
      });
    });
    danger.append(delBtn);
    body.append(danger);
  }

  /** Zamienia przycisk na pasek potwierdzenia; bez window.confirm.
   *  opts: { yes: 'Tak, wyślij', kind: 'primary' } — domyślnie czerwone „Tak, usuń”. */
  function confirmInline(container, button, question, onConfirm, opts) {
    opts = opts || {};
    const kind = opts.kind || 'danger';
    hide(button);
    const yes = h('button', { class: 'btn btn--' + kind + ' btn--sm', type: 'button' }, opts.yes || 'Tak, usuń');
    const no = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, 'Anuluj');
    const box = h('div', { class: 'confirm' + (kind !== 'danger' ? ' confirm--' + kind : ''), role: 'group', 'aria-label': 'Potwierdzenie' }, h('span', null, question), yes, no);
    const restore = () => { box.remove(); show(button); button.focus(); };
    no.addEventListener('click', restore);
    yes.addEventListener('click', async () => {
      yes.disabled = true; no.disabled = true; yes.setAttribute('aria-busy', 'true');
      try { await onConfirm(); box.remove(); }
      catch (e) { if (e.status !== 401) toast(e.message, 'error'); restore(); }
    });
    container.append(box);
    yes.focus();
  }

  async function patchLead(id, patch) {
    const d = await api('/api/admin/leads/' + encodeURIComponent(id), { method: 'PATCH', body: patch });
    const prev = findLead(id) || state.drawer.item || {};
    const updated = d && d.item ? d.item : Object.assign({}, prev, patch);
    if (patch.status && prev.status !== updated.status) bumpCounts(prev.status, updated.status);
    mergeLead(updated);
    if (state.drawer.item && String(state.drawer.item.id) === String(id)) state.drawer.item = updated;
    return updated;
  }
  function bumpCounts(from, to) {
    const c = state.leads.counts;
    if (!isObj(c)) return;
    if (from != null && typeof c[from] === 'number' && c[from] > 0) c[from]--;
    if (to != null && typeof c[to] === 'number') c[to]++;
    renderStatusChips();
  }
  function mergeLead(item) {
    const sid = String(item.id);
    const idx = state.leads.items.findIndex((x) => String(x.id) === sid);
    if (idx >= 0) {
      state.leads.items[idx] = Object.assign({}, state.leads.items[idx], item);
      const old = $$('.lead', els.leadsList).find((li) => li.dataset.id === sid);
      if (old) old.replaceWith(leadRow(state.leads.items[idx]));
    }
  }
  function removeLead(id) {
    const sid = String(id);
    const idx = state.leads.items.findIndex((x) => String(x.id) === sid);
    if (idx >= 0) {
      const gone = state.leads.items.splice(idx, 1)[0];
      state.leads.total = Math.max(0, state.leads.total - 1);
      const c = state.leads.counts;
      if (isObj(c)) {
        if (typeof c.all === 'number' && c.all > 0) c.all--;
        if (gone.status && typeof c[gone.status] === 'number' && c[gone.status] > 0) c[gone.status]--;
      }
      renderLeads();
    }
  }

  /* ---------------------------------------------------------------------------
     Statystyki
     ------------------------------------------------------------------------- */
  async function loadStats() {
    clear(els.statsBody);
    const st = h('div');
    renderState(st, 'loading');
    els.statsBody.append(st);
    try {
      // Blog jest opcjonalny: jeśli backend nie ma /posts (404), statystyki i tak się renderują.
      // Newsletter też opcjonalny: inne błędy niż 401 połykamy, kafelek po prostu się nie pokaże.
      const optional = (e) => { if (e.status === 401) throw e; return null; };
      const [stats, posts, nl] = await Promise.all([
        api('/api/admin/stats'),
        api('/api/admin/posts' + qs({ status: 'published', limit: PAGE, offset: 0 })).catch(optional),
        api('/api/admin/newsletter/subscribers' + qs({ status: 'active', limit: 1, offset: 0 })).catch(optional)
      ]);
      state.stats.data = stats;
      state.stats.posts = posts && Array.isArray(posts.items) ? posts : null;
      state.stats.nl = nl && isObj(nl.counts) ? nl.counts : null;
      if (state.stats.nl) updateNlBadge(state.stats.nl.active);
      renderStats(state.stats.data, state.stats.posts, state.stats.nl);
    } catch (e) {
      if (e.status === 401) return;
      clear(els.statsBody);
      const err = h('div');
      renderState(err, 'error', 'Nie udało się pobrać statystyk', e.message, () => loadStats());
      els.statsBody.append(err);
    }
  }
  els.statsRefresh.addEventListener('click', () => loadStats());

  function renderStats(d, posts, nl) {
    d = d || {};
    const root = els.statsBody;
    clear(root);
    const n = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;

    const tileCount = 4 + (posts ? 1 : 0) + (nl ? 1 : 0);
    const tiles = h('div', { class: 'tiles' + (tileCount > 4 ? ' tiles--' + tileCount : '') },
      tile('Razem', n(d.leadsTotal), 'wszystkie zgłoszenia'),
      tile('Ostatnie 7 dni', n(d.leads7d), leadsWord(n(d.leads7d)), 'signal'),
      tile('Ostatnie 30 dni', n(d.leads30d), leadsWord(n(d.leads30d))),
      tile('Lead magnet', n(d.magnetTotal), plural(n(d.magnetTotal), 'zapis', 'zapisy', 'zapisów'))
    );
    if (posts) {
      const published = n(posts.counts && posts.counts.published != null ? posts.counts.published : posts.total);
      tiles.append(tile('Wpisy', published, plural(published, 'opublikowany', 'opublikowane', 'opublikowanych')));
    }
    if (nl) {
      const active = n(nl.active);
      const tl = tile('Subskrybenci', active, plural(active, 'aktywny', 'aktywnych', 'aktywnych') + (n(nl.pending) ? ' · ' + n(nl.pending) + ' czeka' : ''));
      tl.append(h('a', { class: 'tile__link', href: '#newsletter' }, 'Newsletter'));
      tiles.append(tl);
    }

    const chartCard = h('div', { class: 'card' }, h('h2', null, 'Zgłoszenia dziennie'), h('p', { class: 'card__sub' }, 'Ostatnie 30 dni'));
    const chart = h('div', { class: 'chart' });
    chartCard.append(chart);
    renderChart(chart, Array.isArray(d.byDay) ? d.byDay : []);

    const latest = h('div', { class: 'card' }, h('h2', null, 'Ostatnie 5'));
    const list = Array.isArray(d.latest) ? d.latest.slice(0, 5) : [];
    if (!list.length) latest.append(h('p', { class: 'bars__empty' }, 'Jeszcze pusto.'));
    else {
      const ul = h('div', { class: 'latest' });
      list.forEach((it) => {
        ul.append(h('button', { class: 'latest__item', type: 'button', onclick: (ev) => { setView('leads'); openDrawer(it.id, ev.currentTarget); } },
          h('span', { class: 'latest__name' }, it.name || it.email || 'Bez nazwy'),
          h('span', { class: 'latest__when', title: exactDate(it.ts) }, relTime(it.ts)),
          h('span', { class: 'latest__topic' }, [it.topic, it.company].filter(Boolean).join(' · ') || sourceLabel(it.source))
        ));
      });
      latest.append(ul);
    }

    const byStatus = isObj(d.byStatus) ? d.byStatus : null;
    const statusCard = byStatus ? h('div', { class: 'card' }, h('h2', null, 'Statusy'), barsList(byStatus, (k) => statusInfo(k).label)) : null;

    const topPosts = posts ? h('div', { class: 'card' }, h('h2', null, 'Najczęściej czytane'), topPostsList(posts.items)) : null;

    root.append(
      tiles,
      h('div', { class: 'stats__grid' }, chartCard, latest),
      h('div', { class: 'stats__grid stats__grid--even' },
        statusCard,
        h('div', { class: 'card' }, h('h2', null, 'Tematy'), barsList(d.byTopic, (k) => k)),
        h('div', { class: 'card' }, h('h2', null, 'Źródła'), barsList(d.bySource, sourceLabel)),
        topPosts)
    );
  }

  /** Top 5 wpisów wg odsłon (z ostatniej strony opublikowanych). */
  function topPostsList(items) {
    const list = (Array.isArray(items) ? items.slice() : []).sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0)).slice(0, 5);
    if (!list.length) return h('p', { class: 'bars__empty' }, 'Jeszcze nic nie opublikowałeś.');
    const wrap = h('div', { class: 'latest' });
    list.forEach((it) => {
      wrap.append(h('a', { class: 'latest__item', href: '#blog/' + encodeURIComponent(it.id) },
        h('span', { class: 'latest__name' }, it.title || 'Bez tytułu'),
        h('span', { class: 'latest__when' }, (Number(it.views) || 0) + ' ' + plural(Number(it.views) || 0, 'odsłona', 'odsłony', 'odsłon')),
        h('span', { class: 'latest__topic' }, [it.category, it.readingMin ? readingLabel(it.readingMin) : null].filter(Boolean).join(' · ') || '—')
      ));
    });
    return wrap;
  }

  function tile(label, value, sub, mod) {
    return h('div', { class: 'card tile' + (mod ? ' tile--' + mod : '') },
      h('span', { class: 'tile__label' }, label),
      h('span', { class: 'tile__value' }, String(value)),
      sub ? h('span', { class: 'tile__sub' }, sub) : null);
  }

  function barsList(obj, labelFn) {
    const entries = isObj(obj) ? Object.keys(obj).map((k) => [k, Number(obj[k]) || 0]).sort((a, b) => b[1] - a[1]) : [];
    if (!entries.length) return h('p', { class: 'bars__empty' }, 'Brak danych.');
    const max = Math.max.apply(null, entries.map((e) => e[1])) || 1;
    const wrap = h('div', { class: 'bars', role: 'list' });
    entries.slice(0, 12).forEach(([k, v]) => {
      wrap.append(h('div', { class: 'bars__row', role: 'listitem' },
        h('span', { class: 'bars__label', title: labelFn(k) || k }, labelFn(k) || k || '(brak)'),
        h('span', { class: 'bars__n' }, String(v)),
        h('span', { class: 'bars__track', 'aria-hidden': 'true' }, h('span', { class: 'bars__fill', style: 'width:' + Math.max(1, Math.round(v / max * 100)) + '%' }))
      ));
    });
    return wrap;
  }

  /** Wykres słupkowy (SVG, bez bibliotek). Rysuje ostatnie 30 dni, brakujące dni = 0. */
  function renderChart(container, byDay) {
    const map = {};
    (byDay || []).forEach((r) => { if (r && r.day) map[String(r.day).slice(0, 10)] = Number(r.n) || 0; });
    const days = [];
    const today = new Date(); today.setHours(12, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      days.push({ key: key, date: d, n: map[key] || 0 });
    }
    const total = days.reduce((a, b) => a + b.n, 0);
    let tip = null;

    function draw() {
      clear(container);
      const W = Math.max(280, container.clientWidth || 600);
      const H = 250;
      const m = { top: 14, right: 8, bottom: 30, left: 34 };
      const pw = W - m.left - m.right, ph = H - m.top - m.bottom;
      const maxN = Math.max.apply(null, days.map((d) => d.n));
      const step = niceStep(maxN);
      const yMax = Math.max(step, Math.ceil(Math.max(maxN, 1) / step) * step);
      const y = (v) => m.top + ph - (v / yMax) * ph;
      const slot = pw / days.length;
      const bw = Math.min(24, Math.max(3, slot - 2));

      const root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': 'Zgłoszenia dziennie z ostatnich 30 dni, razem ' + total });
      const grid = svg('g', { class: 'grid' });
      for (let v = 0; v <= yMax; v += step) {
        const yy = Math.round(y(v)) + 0.5;
        grid.append(svg('line', { x1: m.left, x2: W - m.right, y1: yy, y2: yy }));
        grid.append(svg('text', { x: m.left - 8, y: yy + 3.5, 'text-anchor': 'end', text: String(v) }));
      }
      root.append(grid);
      root.append(svg('line', { class: 'axis', x1: m.left, x2: W - m.right, y1: Math.round(y(0)) + 0.5, y2: Math.round(y(0)) + 0.5 }));

      days.forEach((d, i) => {
        const x = m.left + i * slot + (slot - bw) / 2;
        const top = y(d.n), base = y(0);
        const hgt = Math.max(0, base - top);
        const r = Math.min(4, hgt, bw / 2);
        const g = svg('g', { class: 'bar', tabindex: '0', role: 'img', 'aria-label': fmtDayLong.format(d.date) + ': ' + d.n + ' ' + leadsWord(d.n) });
        g.append(svg('rect', { x: m.left + i * slot, y: m.top, width: slot, height: ph }));
        if (hgt > 0) {
          const path = 'M' + x + ',' + base + ' V' + (top + r) + ' Q' + x + ',' + top + ' ' + (x + r) + ',' + top + ' H' + (x + bw - r) + ' Q' + (x + bw) + ',' + top + ' ' + (x + bw) + ',' + (top + r) + ' V' + base + ' Z';
          g.append(svg('path', { d: path }));
        } else {
          g.append(svg('path', { d: 'M' + x + ',' + (base - 1.5) + ' h' + bw + ' v1.5 h-' + bw + ' Z', opacity: '0.35' }));
        }
        const showTip = () => {
          if (!tip) { tip = h('div', { class: 'chart__tip', role: 'tooltip' }, h('b'), h('span')); container.append(tip); }
          tip.firstChild.textContent = d.n + ' ' + leadsWord(d.n);
          tip.lastChild.textContent = fmtDayLong.format(d.date);
          tip.hidden = false;
          const cx = x + bw / 2;
          const left = Math.min(Math.max(cx, 70), W - 70);
          tip.style.left = left + 'px';
          tip.style.top = Math.max(top, m.top) + 'px';
        };
        const hideTip = () => { if (tip) tip.hidden = true; };
        g.addEventListener('pointerenter', showTip);
        g.addEventListener('pointerleave', hideTip);
        g.addEventListener('focus', showTip);
        g.addEventListener('blur', hideTip);
        root.append(g);
        if ((days.length - 1 - i) % 7 === 0) {
          root.append(svg('text', { x: x + bw / 2, y: H - 8, 'text-anchor': 'middle', text: fmtDayMonth.format(d.date) }));
        }
      });
      container.append(root);
      if (!total) container.append(h('p', { class: 'chart__empty' }, 'Brak zgłoszeń z ostatnich 30 dni.'));
    }
    draw();
    if (typeof ResizeObserver !== 'undefined') {
      let lastW = container.clientWidth;
      const ro = new ResizeObserver(debounce(() => {
        if (!document.contains(container)) { ro.disconnect(); return; }
        if (container.clientWidth !== lastW) { lastW = container.clientWidth; draw(); }
      }, 120));
      ro.observe(container);
    }
  }
  function niceStep(max) {
    if (max <= 4) return 1;
    const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
    for (const s of steps) if (max / s <= 4) return s;
    return Math.pow(10, Math.floor(Math.log10(max)));
  }

  /* ---------------------------------------------------------------------------
     Lead magnet
     ------------------------------------------------------------------------- */
  const MAGNET_PAGE = 100;
  async function loadMagnet(opts) {
    opts = opts || {};
    const append = !!opts.append;
    const M = state.magnet;
    const offset = append ? M.items.length : 0;
    const req = ++M.req;
    if (!append) { clear(els.magnetList); renderState(els.magnetState, 'loading'); hide(els.magnetMore); els.magnetCount.textContent = ''; }
    else { els.magnetMore.disabled = true; els.magnetMore.setAttribute('aria-busy', 'true'); }
    try {
      const data = await api('/api/admin/magnet' + qs({ limit: MAGNET_PAGE, offset: offset }));
      if (req !== M.req) return;
      const items = Array.isArray(data.items) ? data.items : [];
      M.items = append ? M.items.concat(items) : items;
      M.total = Number.isFinite(Number(data.total)) ? Number(data.total) : M.items.length;
      renderMagnet(append ? items : null);
    } catch (e) {
      if (req !== M.req || e.status === 401) return;
      if (append) toast(e.message, 'error');
      else renderState(els.magnetState, 'error', 'Nie udało się pobrać zapisów', e.message, () => loadMagnet());
    } finally {
      els.magnetMore.disabled = false; els.magnetMore.removeAttribute('aria-busy');
    }
  }
  function renderMagnet(appended) {
    const M = state.magnet;
    if (appended) appended.forEach((it) => els.magnetList.append(magnetRow(it)));
    else { clear(els.magnetList); M.items.forEach((it) => els.magnetList.append(magnetRow(it))); }
    if (!M.items.length) renderState(els.magnetState, 'empty', 'Jeszcze nikt się nie zapisał.', 'Zapisy z lead magnetu na stronie pojawią się tutaj.');
    else hide(els.magnetState);
    els.magnetCount.textContent = M.total + ' ' + plural(M.total, 'zapis', 'zapisy', 'zapisów');
    if (M.items.length < M.total) show(els.magnetMore); else hide(els.magnetMore);
    els.magnetCopy.disabled = !M.total;
  }
  function magnetRow(item) {
    const li = h('li', { class: 'magnet__row', dataset: { id: item.id } });
    const del = h('button', { class: 'btn btn--ghost btn--sm magnet__del', type: 'button', 'aria-label': 'Usuń ' + (item.email || '') }, 'Usuń');
    del.addEventListener('click', () => {
      confirmInline(li, del, 'Usunąć ' + (item.email || 'ten zapis') + '?', async () => {
        await api('/api/admin/magnet/' + encodeURIComponent(item.id), { method: 'DELETE' });
        const idx = state.magnet.items.findIndex((x) => String(x.id) === String(item.id));
        if (idx >= 0) state.magnet.items.splice(idx, 1);
        state.magnet.total = Math.max(0, state.magnet.total - 1);
        renderMagnet();
        toast('Usunięto zapis.');
      });
    });
    li.append(
      item.email ? h('a', { class: 'magnet__email', href: 'mailto:' + item.email }, item.email) : h('span', { class: 'magnet__email' }, '—'),
      h('span', { class: 'magnet__name' }, item.name || ''),
      h('span', { class: 'magnet__date', title: exactDate(item.ts) }, relTime(item.ts)),
      del
    );
    return li;
  }
  els.magnetMore.addEventListener('click', () => loadMagnet({ append: true }));
  els.magnetCopy.addEventListener('click', async () => {
    const M = state.magnet;
    els.magnetCopy.disabled = true; els.magnetCopy.setAttribute('aria-busy', 'true');
    try {
      let items = M.items.slice();
      let guard = 0;
      while (items.length < M.total && guard++ < 50) {
        const data = await api('/api/admin/magnet' + qs({ limit: MAGNET_PAGE, offset: items.length }));
        const more = Array.isArray(data.items) ? data.items : [];
        if (!more.length) break;
        items = items.concat(more);
      }
      const emails = Array.from(new Set(items.map((x) => x.email).filter(Boolean)));
      if (!emails.length) { toast('Nie ma czego kopiować.', 'info'); return; }
      await copyText(emails.join('\n'));
      toast('Skopiowano ' + emails.length + ' ' + plural(emails.length, 'adres', 'adresy', 'adresów') + '.');
    } catch (e) {
      if (e.status !== 401) toast(e.message || 'Nie udało się skopiować.', 'error');
    } finally {
      els.magnetCopy.disabled = false; els.magnetCopy.removeAttribute('aria-busy');
    }
  });
  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(text); return; } catch (e) { /* fallback */ }
    }
    const ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;left:-9999px;top:0;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.focus(); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    if (!ok) throw new Error('Przeglądarka nie pozwoliła skopiować. Zaznacz adresy ręcznie.');
  }

  /* ---------------------------------------------------------------------------
     Ustawienia
     ------------------------------------------------------------------------- */
  const SETTINGS_SCHEMA = [
    {
      title: 'Cennik', sub: 'Kwoty w zł i etykiety widoczne na stronie w sekcji „Cennik”.', wide: true,
      groups: [
        { title: 'Start', fields: [{ path: 'plans.start.price', label: 'Cena (zł)', type: 'number', min: 0, step: 1 }, { path: 'plans.start.label', label: 'Etykieta', type: 'text', placeholder: 'od 1 500 zł' }] },
        { title: 'Firma', fields: [{ path: 'plans.firma.price', label: 'Cena (zł)', type: 'number', min: 0, step: 1 }, { path: 'plans.firma.label', label: 'Etykieta', type: 'text', placeholder: 'od 4 900 zł' }] },
        { title: 'Opieka', fields: [{ path: 'plans.opieka.price', label: 'Cena (zł/mies.)', type: 'number', min: 0, step: 1 }, { path: 'plans.opieka.label', label: 'Etykieta', type: 'text', placeholder: 'od 490 zł/mies.' }] }
      ]
    },
    {
      title: 'Konfigurator', sub: 'Składniki wyceny w konfiguratorze na stronie.',
      fields: [
        { path: 'configurator.base', label: 'Baza (zł)', type: 'number', min: 0, step: 1 },
        { path: 'configurator.perSystem', label: 'Za system (zł)', type: 'number', min: 0, step: 1 },
        { path: 'configurator.perAction', label: 'Za akcję (zł)', type: 'number', min: 0, step: 1 },
        { path: 'configurator.perAI', label: 'Za moduł AI (zł)', type: 'number', min: 0, step: 1 },
        { path: 'configurator.bonus3Systems', label: 'Rabat za 3 systemy (zł)', type: 'number', min: 0, step: 1 },
        { path: 'configurator.spreadLow', label: 'Widełki: dół (mnożnik)', type: 'number', min: 0, step: 0.01, hint: 'np. 0.85' },
        { path: 'configurator.spreadHigh', label: 'Widełki: góra (mnożnik)', type: 'number', min: 0, step: 0.01, hint: 'np. 1.25' }
      ]
    },
    {
      title: 'Kontakt', sub: 'Dane w stopce, sekcji kontakt i w schema.org.',
      fields: [
        { path: 'contact.owner', label: 'Właściciel', type: 'text' },
        { path: 'contact.company', label: 'Firma', type: 'text' },
        { path: 'contact.nip', label: 'NIP', type: 'text' },
        { path: 'contact.address', label: 'Adres', type: 'text' },
        { path: 'contact.email', label: 'E-mail', type: 'email' },
        { path: 'contact.phone', label: 'Telefon', type: 'tel' },
        { path: 'contact.whatsapp', label: 'WhatsApp (numer)', type: 'tel' },
        { path: 'contact.hours', label: 'Godziny', type: 'text', placeholder: 'pn–pt 9–17' }
      ]
    },
    {
      title: 'Funkcje', sub: 'Włączniki elementów strony.',
      fields: [
        { path: 'features.intro', label: 'Intro (animacja na start)', type: 'bool' },
        { path: 'features.leadMagnet', label: 'Lead magnet', type: 'bool' },
        { path: 'features.whatsapp', label: 'Przycisk WhatsApp', type: 'bool' },
        { path: 'features.themeSwitch', label: 'Przełącznik motywu', type: 'bool' }
      ]
    },
    {
      title: 'Motyw domyślny', sub: 'Jak strona wygląda przed wyborem motywu przez odwiedzającego.',
      fields: [
        { path: 'theme.default', label: 'Motyw', type: 'select', options: [['dark', 'Ciemny (dark)'], ['slate', 'Granat (slate)'], ['light', 'Jasny (light)'], ['warm', 'Ciepły (warm)']], wide: true }
      ]
    },
    {
      title: 'Lead magnet', sub: 'Materiał do pobrania za e-mail.',
      fields: [
        { path: 'magnet.enabled', label: 'Włączony', type: 'bool', wide: true },
        { path: 'magnet.title', label: 'Tytuł', type: 'text', wide: true },
        { path: 'magnet.url', label: 'Adres pliku (URL)', type: 'url', wide: true, placeholder: 'https://…' }
      ]
    },
    {
      title: 'Śledzenie i reklamy', sub: 'Puste pola = nic się nie ładuje. Google Analytics 4, Tag Manager i Meta Pixel wczytują się dopiero po zgodzie odwiedzającego (Consent Mode v2). Plausible nie używa ciasteczek i nie wymaga zgody. GA4 wpisz tutaj bezpośrednio albo skonfiguruj w Tag Managerze, nie w obu miejscach (podwójne liczenie).',
      fields: [
        { path: 'tracking.ga4Id', label: 'Google Analytics 4: ID pomiaru', type: 'text', placeholder: 'G-XXXXXXXXXX' },
        { path: 'tracking.gtmId', label: 'Google Tag Manager ID', type: 'text', placeholder: 'GTM-XXXXXXX' },
        { path: 'tracking.metaPixelId', label: 'Meta Pixel ID', type: 'text', placeholder: '123456789012345' },
        { path: 'tracking.plausible', label: 'Plausible (analityka bez ciasteczek)', type: 'bool' }
      ]
    },
    {
      title: 'Powiadomienia', sub: 'Gdzie wysyłać info o nowych zgłoszeniach. Zapisane wartości wracają zamaskowane — zostaw, jeśli nie zmieniasz.',
      fields: [
        { path: 'notify.webhookUrl', label: 'Webhook URL', type: 'secret', wide: true, placeholder: 'https://… (n8n / Make / Slack)' },
        { path: 'notify.telegramToken', label: 'Telegram: token bota', type: 'secret' },
        { path: 'notify.telegramChatId', label: 'Telegram: chat ID', type: 'secret' }
      ]
    }
  ];
  const settingsInputs = {}; // path -> { el, field }

  function buildSettingsForm() {
    if (state.settings.built) return;
    state.settings.built = true;
    clear(els.settingsSections);
    SETTINGS_SCHEMA.forEach((sec) => {
      const card = h('section', { class: 'card' + (sec.wide ? ' card--wide' : '') }, h('h2', null, sec.title), sec.sub ? h('p', { class: 'card__sub' }, sec.sub) : null);
      if (sec.groups) {
        const g = h('div', { class: 'fgrid fgrid--3' });
        sec.groups.forEach((grp) => {
          const box = h('div', { class: 'fgroup' }, h('h3', null, grp.title));
          grp.fields.forEach((f) => box.append(fieldControl(f)));
          g.append(box);
        });
        card.append(g);
      } else {
        const g = h('div', { class: 'fgrid' });
        sec.fields.forEach((f) => g.append(fieldControl(f)));
        card.append(g);
      }
      els.settingsSections.append(card);
    });
  }
  function fieldControl(f) {
    const id = 'set-' + f.path.replace(/\./g, '-');
    let el, wrap;
    if (f.type === 'bool') {
      el = h('input', { type: 'checkbox', id: id });
      wrap = h('label', { class: 'switch' + (f.wide ? ' field--wide' : ''), for: id }, h('span', null, f.label), el, h('span', { class: 'switch__track', 'aria-hidden': 'true' }));
    } else if (f.type === 'select') {
      el = h('select', { id: id });
      (f.options || []).forEach(([v, l]) => el.append(h('option', { value: v }, l)));
      wrap = h('div', { class: 'field' + (f.wide ? ' field--wide' : '') }, h('label', { for: id }, f.label), el);
    } else {
      el = h('input', {
        id: id,
        type: f.type === 'secret' ? 'password' : (f.type === 'number' ? 'number' : f.type),
        inputmode: f.type === 'number' ? 'decimal' : null,
        min: f.min, step: f.step, placeholder: f.placeholder,
        autocomplete: f.type === 'secret' ? 'new-password' : 'off',
        spellcheck: 'false'
      });
      wrap = h('div', { class: 'field' + (f.wide ? ' field--wide' : '') + (f.type === 'secret' ? ' field--secret' : '') },
        h('label', { for: id }, f.label), el, f.hint ? h('span', { class: 'field__hint' }, f.hint) : null);
    }
    el.addEventListener('input', () => markDirty());
    el.addEventListener('change', () => markDirty());
    settingsInputs[f.path] = { el: el, field: f, wrap: wrap };
    return wrap;
  }

  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o != null && typeof o === 'object') ? o[k] : undefined, obj);
  }
  function setPath(obj, path, value) {
    const keys = path.split('.');
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) { if (!isObj(o[keys[i]])) o[keys[i]] = {}; o = o[keys[i]]; }
    o[keys[keys.length - 1]] = value;
  }

  function fillSettings(settings) {
    Object.keys(settingsInputs).forEach((path) => {
      const { el, field, wrap } = settingsInputs[path];
      const v = getPath(settings, path);
      if (field.type === 'bool') el.checked = !!v;
      else if (v == null) el.value = '';
      else el.value = String(v);
      wrap.classList.remove('is-changed');
    });
    markDirty();
  }

  /** Zwraca { values, errors } — values tylko dla pól, które da się sparsować. */
  function collectSettings() {
    const values = {};
    const errors = [];
    Object.keys(settingsInputs).forEach((path) => {
      const { el, field } = settingsInputs[path];
      let v;
      if (field.type === 'bool') v = !!el.checked;
      else if (field.type === 'number') {
        const raw = el.value.trim().replace(',', '.');
        if (raw === '') { errors.push(field.label + ': wpisz liczbę.'); return; }
        v = Number(raw);
        if (!Number.isFinite(v)) { errors.push(field.label + ': to nie jest liczba.'); return; }
      } else v = el.value;
      setPath(values, path, v);
    });
    return { values: values, errors: errors };
  }

  /** Głęboki diff: zwraca tylko klucze z `next`, które różnią się od `orig`. */
  function diffSettings(orig, next) {
    const out = {};
    let changed = false;
    Object.keys(next).forEach((k) => {
      const a = orig != null && typeof orig === 'object' ? orig[k] : undefined;
      const b = next[k];
      if (isObj(b)) {
        const sub = diffSettings(isObj(a) ? a : {}, b);
        if (sub !== null) { out[k] = sub; changed = true; }
      } else if (a !== b) {
        if (a === undefined && (b === '' || b === false)) return; // klucz nieznany serwerowi i pusty — nie wysyłamy
        out[k] = b; changed = true;
      }
    });
    return changed ? out : null;
  }

  function markDirty() {
    if (!state.settings.original) return;
    const { values } = collectSettings();
    const d = diffSettings(state.settings.original, values);
    let n = 0;
    Object.keys(settingsInputs).forEach((path) => {
      const { wrap } = settingsInputs[path];
      const changed = d !== null && getPath(d, path) !== undefined;
      wrap.classList.toggle('is-changed', changed);
      if (changed) n++;
    });
    els.settingsHint.textContent = n ? ('Niezapisane zmiany: ' + n + '.') : 'Zmiany zapisują się dopiero po kliknięciu „Zapisz”.';
    els.settingsHint.classList.toggle('is-dirty', n > 0);
  }

  async function loadSettings() {
    buildSettingsForm();
    hide($('#savebar'));
    renderState(els.settingsState, 'loading');
    els.settingsSections.hidden = true;
    try {
      const data = await api('/api/admin/settings');
      state.settings.original = clone(unwrapSettings(data));
      fillSettings(state.settings.original);
      hide(els.settingsState);
      els.settingsSections.hidden = false;
      show($('#savebar'));
    } catch (e) {
      if (e.status === 401) return;
      renderState(els.settingsState, 'error', 'Nie udało się pobrać ustawień', e.message, () => loadSettings());
    }
  }
  function unwrapSettings(data) {
    if (data && isObj(data.settings) && !data.plans) return data.settings;
    return data || {};
  }

  els.settingsForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!state.settings.original) return;
    const { values, errors } = collectSettings();
    if (errors.length) { toast(errors[0], 'error'); return; }
    const patch = diffSettings(state.settings.original, values);
    if (!patch) { toast('Brak zmian do zapisania.', 'info'); return; }
    els.settingsSave.disabled = true; els.settingsSave.setAttribute('aria-busy', 'true');
    try {
      const data = await api('/api/admin/settings', { method: 'PUT', body: patch });
      const merged = unwrapSettings(data);
      state.settings.original = isObj(merged) && (merged.plans || merged.contact || merged.features) ? clone(merged) : deepMerge(clone(state.settings.original), patch);
      fillSettings(state.settings.original);
      toast('Zapisano.');
    } catch (e) {
      if (e.status !== 401) toast(e.message, 'error');
    } finally {
      els.settingsSave.disabled = false; els.settingsSave.removeAttribute('aria-busy');
    }
  });
  els.settingsReset.addEventListener('click', () => loadSettings());
  function deepMerge(target, src) {
    Object.keys(src).forEach((k) => {
      if (isObj(src[k])) { if (!isObj(target[k])) target[k] = {}; deepMerge(target[k], src[k]); }
      else target[k] = src[k];
    });
    return target;
  }

  /* ---------------------------------------------------------------------------
     Blog — pomocnicze
     ------------------------------------------------------------------------- */
  const POST_STATUS = [
    { key: 'published', label: 'Opublikowany', slug: 'published' },
    { key: 'draft', label: 'Szkic', slug: 'draft' }
  ];
  function postStatusInfo(s) {
    const key = String(s || '').toLowerCase();
    return POST_STATUS.find((x) => x.key === key) || { key: key || 'draft', label: key ? key : 'Szkic', slug: 'draft' };
  }
  const CATEGORY_DEFAULTS = ['Automatyzacje', 'AI w firmie', 'Integracje', 'Poradniki', 'Case study', 'Narzędzia'];
  const PL_MAP = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };
  /** Slug z polskimi znakami: „Jak zacząć z AI?” → „jak-zaczac-z-ai”. */
  function slugify(s) {
    let t = String(s == null ? '' : s).toLowerCase().replace(/[ąćęłńóśźż]/g, (c) => PL_MAP[c]);
    try { t = t.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* stare przeglądarki */ }
    return t.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96).replace(/-+$/, '');
  }
  function postLang(l) { return String(l || '').toLowerCase() === 'en' ? 'en' : 'pl'; }
  function postPath(slug, lang) { return (postLang(lang) === 'en' ? '/en/blog/' : '/blog/') + (slug || '') + '/'; }
  function postUrl(slug, lang) { return location.origin + postPath(slug, lang); }
  function langPill(lang) { const l = postLang(lang); return h('span', { class: 'pill pill--lang pill--lang-' + l, title: l === 'en' ? 'Wpis po angielsku' : 'Wpis po polsku' }, l.toUpperCase()); }
  function postDate(item) { return item.publishedAt || item.updatedAt || item.createdAt || null; }
  function readingLabel(min) { const n = Math.max(1, Math.round(Number(min) || 1)); return n + ' min czytania'; }
  function hueFor(s) { let x = 7; for (const ch of String(s || '')) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return x % 360; }
  function toLocalInput(ts) {
    const d = toDate(ts);
    if (!d) return '';
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fromLocalInput(v) {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  function truncate(s, n) {
    s = String(s == null ? '' : s).trim();
    if (s.length <= n) return s;
    const cut = s.slice(0, n - 1);
    const sp = cut.lastIndexOf(' ');
    return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.–-]+$/, '') + '…';
  }
  const fmtClock = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' });

  /* ---------------------------------------------------------------------------
     Blog — lista wpisów
     ------------------------------------------------------------------------- */
  function updateDraftBadge(n) {
    n = Number(n);
    if (n > 0) { els.navBadgeDrafts.textContent = String(n); show(els.navBadgeDrafts); } else { hide(els.navBadgeDrafts); }
  }
  function renderPostChips() {
    const counts = state.blog.counts || {};
    const chips = [
      { key: '', label: 'Wszystkie', n: counts.all },
      { key: 'published', label: 'Opublikowane', n: counts.published },
      { key: 'draft', label: 'Szkice', n: counts.draft }
    ];
    clear(els.blogStatus);
    chips.forEach((c) => {
      els.blogStatus.append(h('button', {
        class: 'chip', type: 'button', 'aria-pressed': state.blog.status === c.key ? 'true' : 'false',
        onclick: () => { if (state.blog.status === c.key) return; state.blog.status = c.key; renderPostChips(); loadBlog(); }
      }, c.label, c.n != null ? h('span', { class: 'chip__n' }, String(c.n)) : null));
    });
    updateDraftBadge(counts.draft);
    renderLangChips();
  }
  function renderLangChips() {
    const counts = state.blog.counts || {};
    const chips = [
      { key: '', label: 'Każdy język', n: null },
      { key: 'pl', label: 'PL', n: counts.pl },
      { key: 'en', label: 'EN', n: counts.en }
    ];
    clear(els.blogLang);
    chips.forEach((c) => {
      els.blogLang.append(h('button', {
        class: 'chip', type: 'button', 'aria-pressed': state.blog.lang === c.key ? 'true' : 'false',
        onclick: () => { if (state.blog.lang === c.key) return; state.blog.lang = c.key; renderLangChips(); loadBlog(); }
      }, c.label, c.n != null ? h('span', { class: 'chip__n' }, String(c.n)) : null));
    });
  }

  async function loadBlog(opts) {
    opts = opts || {};
    const append = !!opts.append;
    const B = state.blog;
    const offset = append ? B.items.length : 0;
    const req = ++B.req;
    if (!append) {
      clear(els.postsList);
      renderState(els.postsState, 'loading');
      hide(els.postsMore);
      els.postsCount.textContent = '';
    } else {
      els.postsMore.disabled = true;
      els.postsMore.setAttribute('aria-busy', 'true');
    }
    try {
      const data = await api('/api/admin/posts' + qs({ status: B.status, lang: B.lang, q: B.q, limit: PAGE, offset: offset }));
      if (req !== B.req) return;
      const items = Array.isArray(data.items) ? data.items : [];
      B.items = append ? B.items.concat(items) : items;
      B.total = Number.isFinite(Number(data.total)) ? Number(data.total) : B.items.length;
      if (data.counts && isObj(data.counts)) B.counts = data.counts;
      renderPosts(append ? items : null);
    } catch (e) {
      if (req !== B.req || e.status === 401) return;
      if (append) toast(e.message, 'error');
      else renderState(els.postsState, 'error', 'Nie udało się pobrać wpisów', e.message, () => loadBlog());
    } finally {
      els.postsMore.disabled = false;
      els.postsMore.removeAttribute('aria-busy');
    }
  }

  function renderPosts(appended) {
    const B = state.blog;
    renderPostChips();
    if (appended) appended.forEach((it) => els.postsList.append(postRow(it)));
    else { clear(els.postsList); B.items.forEach((it) => els.postsList.append(postRow(it))); }
    if (!B.items.length) {
      const filtered = B.q || B.status || B.lang;
      renderState(els.postsState, 'empty',
        filtered ? 'Nic nie pasuje do filtrów' : 'Jeszcze nic nie napisałeś.',
        filtered ? 'Spróbuj innego hasła albo wyczyść filtry.' : 'Pierwszy wpis to zwykle najtrudniejszy, więc zacznij od czegoś, co i tak tłumaczysz klientom co tydzień.');
      if (!filtered) els.postsState.append(h('a', { class: 'btn btn--primary btn--sm', href: '#blog/nowy' }, 'Napisz pierwszy wpis'));
    } else {
      hide(els.postsState);
    }
    els.postsCount.textContent = B.items.length ? 'Pokazano ' + B.items.length + ' z ' + B.total : '';
    if (B.items.length < B.total) show(els.postsMore); else hide(els.postsMore);
  }

  function postThumb(item) {
    if (item.cover) return h('span', { class: 'post__thumb' }, h('img', { src: String(item.cover), alt: '', loading: 'lazy' }));
    const letter = (String(item.title || '').trim().charAt(0) || '?').toUpperCase();
    return h('span', { class: 'post__thumb post__thumb--ph', style: '--thumb-h:' + hueFor(item.slug || item.title), 'aria-hidden': 'true' }, letter);
  }
  function postRow(item) {
    const st = postStatusInfo(item.status);
    const href = '#blog/' + encodeURIComponent(item.id);
    const li = h('li', { class: 'post post--' + st.slug + (item.featured ? ' post--featured' : ''), dataset: { id: item.id } });
    li.addEventListener('click', (ev) => {
      if (ev.target.closest('a, button')) return;
      location.hash = href;
    });
    const when = postDate(item);
    li.append(
      postThumb(item),
      h('span', { class: 'post__main' },
        h('a', { class: 'post__title', href: href }, item.title || 'Bez tytułu'),
        h('span', { class: 'post__line' },
          langPill(item.lang),
          h('span', { class: 'post__slug' }, postPath(item.slug, item.lang))
        )
      ),
      // Na desktopie display:contents (kolumny siatki; status ma własną kolumnę w CSS),
      // na telefonie jedna linia metadanych pod tytułem.
      h('span', { class: 'post__meta' },
        h('span', { class: 'post__cat' }, item.category ? h('span', { class: 'badge' }, String(item.category)) : h('span', { class: 'post__none' }, '—')),
        h('span', { class: 'post__date', title: exactDate(when) }, relTime(when)),
        h('span', { class: 'post__views', title: 'Odsłony' }, String(Number(item.views) || 0), h('span', { class: 'post__meta-l' }, ' odsłon')),
        h('span', { class: 'post__reading' }, readingLabel(item.readingMin))
      ),
      h('span', { class: 'post__status' }, h('span', { class: 'pill pill--' + st.slug }, st.label))
    );
    return li;
  }

  els.blogQ.addEventListener('input', debounce(() => {
    const v = els.blogQ.value.trim();
    if (v === state.blog.q) return;
    state.blog.q = v;
    loadBlog();
  }, 300));
  els.blogQ.addEventListener('search', () => { const v = els.blogQ.value.trim(); if (v !== state.blog.q) { state.blog.q = v; loadBlog(); } });
  els.postsMore.addEventListener('click', () => loadBlog({ append: true }));

  /* ---------------------------------------------------------------------------
     Blog — edytor wpisu
     ------------------------------------------------------------------------- */
  const P = {
    title: $('#p-title'), slug: $('#p-slug'), slugLock: $('#p-slug-lock'), slugHint: $('#p-slug-hint'),
    category: $('#p-category'), categoryList: $('#p-category-list'),
    tags: $('#p-tags'), tagsInput: $('#p-tags-input'),
    excerpt: $('#p-excerpt'), excerptCount: $('#p-excerpt-count'),
    coverZone: $('#p-cover-zone'), coverFile: $('#p-cover-file'), coverPreview: $('#p-cover-preview'), coverImg: $('#p-cover-img'), coverUrl: $('#p-cover-url'),
    coverReplace: $('#p-cover-replace'), coverRemove: $('#p-cover-remove'), coverAlt: $('#p-cover-alt'),
    content: $('#p-content'), mdbar: $('#p-mdbar'), imageFile: $('#p-image-file'),
    seoTitle: $('#p-seo-title'), seoTitleCount: $('#p-seo-title-count'), seoDesc: $('#p-seo-desc'), seoDescCount: $('#p-seo-desc-count'),
    status: $('#p-status'), publishedAt: $('#p-published-at'), featured: $('#p-featured'),
    lang: $('#p-lang'), translation: $('#p-translation'), translationHint: $('#p-translation-hint'), slugPrefix: $('#p-slug-prefix'),
    preview: $('#p-preview'), previewTitle: $('#p-preview-title'), previewCover: $('#p-preview-cover'), previewCoverImg: $('#p-preview-cover-img'),
    previewReading: $('#p-preview-reading'), previewState: $('#p-preview-state'), previewToc: $('#p-preview-toc')
  };
  const SH = {
    root: $('#post-share'), canvas: $('#og-canvas'), generate: $('#og-generate'), download: $('#og-download'), redraw: $('#og-redraw'), state: $('#og-state'),
    stored: $('#og-stored'), storedImg: $('#og-stored-img'), storedLink: $('#og-stored-link'),
    url: $('#share-url'), copyLink: $('#share-copy-link'), wa: $('#share-wa'), socials: $('#socials')
  };
  const EMPTY_POST = { title: '', slug: '', excerpt: '', content: '', cover: '', coverAlt: '', category: '', tags: [], status: 'draft', publishedAt: null, featured: false, seo: { title: '', description: '' }, og: '', views: 0, readingMin: 1, lang: 'pl', translationOf: '' };

  function postStateReset() {
    const S = state.post;
    stopAutosave();
    S.id = null; S.item = null; S.base = null; S.saving = false; S.tags = []; S.cover = ''; S.slugAuto = true;
    S.previewReq = 0; S.readingMin = 0; S.savedAt = null; S.leaveTarget = null; S.leaving = false; S.ogBlob = null;
    S.translationOf = ''; S.trReq++;
  }

  async function openPost(param) {
    postStateReset();
    const S = state.post;
    const id = (!param || param === 'nowy') ? null : String(param);
    S.id = id;
    hide(els.postGuard); hide(els.postRestore);
    els.postForm.hidden = true;
    hide(els.postState);
    els.postH1.textContent = id ? 'Wpis' : 'Nowy wpis';
    setDocTitle();
    if (!id) { finishPostLoad(clone(EMPTY_POST)); return; }
    renderState(els.postState, 'loading', null, 'Pobieram wpis…');
    try {
      const d = await api('/api/admin/posts/' + encodeURIComponent(id));
      const item = d && d.item ? d.item : (d && d.id != null ? d : null);
      if (state.view !== 'post' || S.id !== id) return;
      if (!item) { renderState(els.postState, 'error', 'Nie udało się pobrać wpisu', 'Serwer nie zwrócił wpisu.', () => openPost(id)); return; }
      finishPostLoad(item);
    } catch (e) {
      if (state.view !== 'post' || S.id !== id || e.status === 401) return;
      renderState(els.postState, 'error', e.status === 404 ? 'Nie ma takiego wpisu' : 'Nie udało się pobrać wpisu', e.message,
        e.status === 404 ? null : () => openPost(id));
      if (e.status === 404) els.postState.append(h('a', { class: 'btn btn--ghost btn--sm', href: '#blog' }, 'Wróć do listy'));
    }
  }

  function finishPostLoad(item) {
    const S = state.post;
    S.item = item;
    S.readingMin = Number(item.readingMin) || 0;
    fillPostForm(item);
    S.base = snapshotPost();
    hide(els.postState);
    els.postForm.hidden = false;
    els.postH1.textContent = item.id != null ? (item.title || 'Wpis') : 'Nowy wpis';
    setDocTitle();
    fillCategoryList();
    updatePostButtons();
    updateSaveState();
    setupShare();
    requestPreview(true);
    checkLocalDraft(item);
    startAutosave();
    // Nowy wpis: kursor w tytule, chyba że użytkownik już coś kliknął w formularzu.
    if (item.id == null) setTimeout(() => { try { if (!els.postForm.contains(document.activeElement)) P.title.focus(); } catch (e) { /* noop */ } }, 30);
  }

  function leavePost() {
    stopAutosave();
    state.post.previewReq++;
    hide(els.postGuard); hide(els.postRestore);
  }

  function fillPostForm(item) {
    const S = state.post;
    P.title.value = item.title || '';
    P.slug.value = item.slug || '';
    P.category.value = item.category || '';
    S.tags = Array.isArray(item.tags) ? item.tags.map((t) => String(t)).filter(Boolean) : [];
    renderTags();
    P.excerpt.value = item.excerpt || '';
    S.cover = item.cover ? String(item.cover) : '';
    P.coverAlt.value = item.coverAlt || '';
    renderCover();
    P.content.value = item.content || '';
    P.seoTitle.value = (item.seo && item.seo.title) || '';
    P.seoDesc.value = (item.seo && item.seo.description) || '';
    P.status.value = item.status === 'published' ? 'published' : 'draft';
    P.publishedAt.value = toLocalInput(item.publishedAt);
    P.featured.checked = !!item.featured;
    P.lang.value = postLang(item.lang);
    S.translationOf = item.translationOf != null && item.translationOf !== '' ? String(item.translationOf) : '';
    renderTranslationOptions(null);
    loadTranslationOptions();
    updateLangUi();
    P.slug.removeAttribute('aria-invalid');
    setSlugAuto(item.id == null && !item.slug);
    updateSlugHint();
    updateCounters();
    updateSeoPlaceholders();
    updatePreviewHead();
  }

  function collectPost() {
    const S = state.post;
    return {
      title: P.title.value.trim(),
      slug: P.slug.value.trim(),
      category: P.category.value.trim(),
      tags: S.tags.slice(),
      excerpt: P.excerpt.value.trim(),
      cover: S.cover || '',
      coverAlt: P.coverAlt.value.trim(),
      content: P.content.value,
      seo: { title: P.seoTitle.value.trim(), description: P.seoDesc.value.trim() },
      status: P.status.value === 'published' ? 'published' : 'draft',
      publishedAt: fromLocalInput(P.publishedAt.value),
      featured: !!P.featured.checked,
      lang: postLang(P.lang.value),
      translationOf: P.translation.value || ''
    };
  }
  function snapshotPost() { return JSON.stringify(collectPost()); }
  function isPostDirty() {
    const S = state.post;
    return state.view === 'post' && S.base != null && !els.postForm.hidden && snapshotPost() !== S.base;
  }

  function updateSaveState() {
    const S = state.post;
    const el = els.postSaveState;
    let text = '', dirty = false;
    if (S.saving) text = 'Zapisywanie…';
    else if (isPostDirty()) { text = 'Niezapisane zmiany'; dirty = true; }
    else if (S.savedAt) text = 'Zapisano ' + fmtClock.format(S.savedAt);
    else if (S.item && S.item.id != null && S.item.updatedAt) text = 'Zapisano ' + relTime(S.item.updatedAt);
    else if (S.item && S.item.id == null) text = 'Jeszcze niezapisany';
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('is-dirty', dirty);
    el.classList.toggle('is-busy', !!S.saving);
  }
  function setDocTitle() {
    const hd = els.views[state.view] ? $('h1', els.views[state.view]) : null;
    document.title = hd && hd.textContent ? hd.textContent + ' — Panel TSoftware' : 'Panel — TSoftware';
  }

  function updatePostButtons() {
    const S = state.post;
    const item = S.item;
    const livePublished = !!(item && item.id != null && item.status === 'published');
    els.postPublish.textContent = livePublished ? 'Zapisz zmiany' : 'Opublikuj';
    els.postSaveDraft.textContent = livePublished ? 'Cofnij do szkicu' : 'Zapisz szkic';
    if (item && item.id != null && item.slug) {
      // Szkic też da się obejrzeć: serwer pokazuje go zalogowanemu adminowi (z noindex).
      els.postViewLink.href = postUrl(item.slug, item.lang);
      els.postViewLink.removeAttribute('aria-disabled');
      els.postViewLink.classList.remove('is-disabled');
      els.postViewLink.textContent = livePublished ? 'Zobacz na stronie' : 'Podgląd na stronie';
      els.postViewLink.title = livePublished ? 'Otwiera wpis na stronie w nowej karcie' : 'Szkic widzisz tylko Ty (po zalogowaniu)';
    } else {
      els.postViewLink.removeAttribute('href');
      els.postViewLink.setAttribute('aria-disabled', 'true');
      els.postViewLink.classList.add('is-disabled');
      els.postViewLink.textContent = 'Zobacz na stronie';
      els.postViewLink.title = 'Dostępne po zapisaniu';
    }
    if (S.id != null) show(els.postDanger); else hide(els.postDanger);
  }

  /** Każda zmiana w formularzu przechodzi tędy. */
  function onPostInput() {
    updateSaveState();
    if (SH.root.open && !SH.root.hidden) scheduleOgDraw();
  }

  // --- Tytuł / slug -----------------------------------------------------------
  function setSlugAuto(on) {
    state.post.slugAuto = !!on;
    P.slugLock.setAttribute('aria-pressed', on ? 'true' : 'false');
    P.slugLock.title = on ? 'Slug generuje się z tytułu (kliknij, żeby edytować ręcznie)' : 'Slug ręczny (kliknij, żeby generować z tytułu)';
    P.slugLock.setAttribute('aria-label', P.slugLock.title);
    P.slug.readOnly = !!on;
    P.slug.classList.toggle('is-auto', !!on);
    if (on) { P.slug.value = slugify(P.title.value); updateSlugHint(); }
  }
  function updateSlugHint() {
    const s = P.slug.value.trim();
    P.slugHint.textContent = s ? postUrl(s, P.lang.value).replace(/^https?:\/\//, '') : 'Adres powstanie z tytułu przy zapisie.';
  }
  P.title.addEventListener('input', () => {
    if (state.post.slugAuto) { P.slug.value = slugify(P.title.value); updateSlugHint(); }
    updateSeoPlaceholders();
    updatePreviewHead();
    onPostInput();
  });
  P.slug.addEventListener('input', () => {
    P.slug.removeAttribute('aria-invalid');
    updateSlugHint();
    onPostInput();
  });
  P.slug.addEventListener('blur', () => {
    if (state.post.slugAuto) return;
    const cleaned = slugify(P.slug.value);
    if (cleaned !== P.slug.value) { P.slug.value = cleaned; updateSlugHint(); onPostInput(); }
  });
  P.slugLock.addEventListener('click', () => {
    setSlugAuto(!state.post.slugAuto);
    onPostInput();
    if (!state.post.slugAuto) P.slug.focus();
  });

  // --- Kategoria / tagi -------------------------------------------------------
  function fillCategoryList() {
    const seen = new Set();
    const list = [];
    const add = (c) => { const v = String(c || '').trim(); if (!v || seen.has(v.toLowerCase())) return; seen.add(v.toLowerCase()); list.push(v); };
    state.blog.items.forEach((it) => add(it.category));
    if (state.stats.posts && Array.isArray(state.stats.posts.items)) state.stats.posts.items.forEach((it) => add(it.category));
    if (state.post.item) add(state.post.item.category);
    CATEGORY_DEFAULTS.forEach(add);
    clear(P.categoryList);
    list.forEach((c) => P.categoryList.append(h('option', { value: c })));
  }
  P.category.addEventListener('input', onPostInput);

  function renderTags() {
    $$('.tag', P.tags).forEach((el) => el.remove());
    state.post.tags.forEach((t, i) => {
      P.tags.insertBefore(h('span', { class: 'tag' }, t,
        h('button', { type: 'button', class: 'tag__x', 'aria-label': 'Usuń tag ' + t, onclick: () => { state.post.tags.splice(i, 1); renderTags(); onPostInput(); P.tagsInput.focus(); } }, '×')
      ), P.tagsInput);
    });
  }
  function addTagsFromInput() {
    const parts = P.tagsInput.value.split(',').map((s) => s.trim()).filter(Boolean);
    P.tagsInput.value = '';
    if (!parts.length) return;
    parts.forEach((t) => { if (!state.post.tags.some((x) => x.toLowerCase() === t.toLowerCase())) state.post.tags.push(t.slice(0, 40)); });
    renderTags();
    onPostInput();
  }
  P.tagsInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ',') { ev.preventDefault(); addTagsFromInput(); }
    else if (ev.key === 'Backspace' && !P.tagsInput.value && state.post.tags.length) { state.post.tags.pop(); renderTags(); onPostInput(); }
  });
  P.tagsInput.addEventListener('input', () => { if (P.tagsInput.value.indexOf(',') >= 0) addTagsFromInput(); });
  P.tagsInput.addEventListener('blur', addTagsFromInput);
  P.tags.addEventListener('click', (ev) => { if (ev.target === P.tags) P.tagsInput.focus(); });

  // --- Zajawka / SEO ------------------------------------------------------------
  function counterState(el, n, min, max) {
    el.textContent = max ? n + ' / ' + max : String(n);
    el.classList.toggle('is-over', n > max);
    el.classList.toggle('is-ok', n >= min && n <= max);
  }
  function updateCounters() {
    const ex = P.excerpt.value.length;
    P.excerptCount.textContent = String(ex);
    P.excerptCount.classList.toggle('is-ok', ex >= 120 && ex <= 200);
    P.excerptCount.classList.toggle('is-over', ex > 200);
    counterState(P.seoTitleCount, (P.seoTitle.value || P.title.value).trim().length, 1, 60);
    counterState(P.seoDescCount, (P.seoDesc.value || P.excerpt.value).trim().length, 1, 160);
  }
  function updateSeoPlaceholders() {
    P.seoTitle.placeholder = P.title.value.trim() || 'Tytuł wpisu';
    P.seoDesc.placeholder = P.excerpt.value.trim() || 'Zajawka wpisu';
    updateCounters();
  }
  P.excerpt.addEventListener('input', () => { updateSeoPlaceholders(); onPostInput(); });
  P.seoTitle.addEventListener('input', () => { updateCounters(); onPostInput(); });
  P.seoDesc.addEventListener('input', () => { updateCounters(); onPostInput(); });

  // --- Publikacja ---------------------------------------------------------------
  P.status.addEventListener('change', () => {
    if (P.status.value === 'published' && !P.publishedAt.value) P.publishedAt.value = toLocalInput(new Date());
    onPostInput();
  });
  P.publishedAt.addEventListener('input', onPostInput);
  P.publishedAt.addEventListener('change', onPostInput);
  P.featured.addEventListener('change', onPostInput);

  // --- Język i tłumaczenie -------------------------------------------------------
  function updateLangUi() {
    const l = postLang(P.lang.value);
    P.slugPrefix.textContent = l === 'en' ? '/en/blog/' : '/blog/';
    P.translationHint.textContent = l === 'en'
      ? 'Polska wersja tego wpisu — strona pokaże przełącznik PL/EN.'
      : 'Angielska wersja tego wpisu — strona pokaże przełącznik PL/EN.';
    updateSlugHint();
  }
  /** Lista wpisów w drugim języku do wyboru jako tłumaczenie. `items` null = jeszcze nie pobrane. */
  function renderTranslationOptions(items) {
    const S = state.post;
    const want = S.translationOf;
    clear(P.translation);
    P.translation.append(h('option', { value: '' }, 'brak'));
    let found = !want;
    (items || []).forEach((it) => {
      if (S.id != null && String(it.id) === String(S.id)) return;
      const id = String(it.id);
      if (id === want) found = true;
      const st = postStatusInfo(it.status);
      P.translation.append(h('option', { value: id }, (it.title || 'Bez tytułu') + (st.key === 'published' ? '' : ' (' + st.label.toLowerCase() + ')')));
    });
    // Wartość spoza listy (np. wpis zmienił język) zostaje — nie gubimy po cichu powiązania.
    if (!found && want) P.translation.append(h('option', { value: want }, 'Wpis #' + want + (items ? ' (poza listą)' : '')));
    P.translation.value = want;
    if (P.translation.value !== want) { P.translation.value = ''; }
  }
  async function loadTranslationOptions() {
    const S = state.post;
    const other = postLang(P.lang.value) === 'en' ? 'pl' : 'en';
    const req = ++S.trReq;
    P.translation.disabled = true;
    try {
      const d = await api('/api/admin/posts' + qs({ lang: other, limit: 100, offset: 0 }));
      if (req !== S.trReq || state.view !== 'post') return;
      renderTranslationOptions(Array.isArray(d.items) ? d.items : []);
    } catch (e) {
      if (req !== S.trReq || e.status === 401) return;
      renderTranslationOptions([]);
    } finally {
      if (req === S.trReq) P.translation.disabled = false;
    }
  }
  P.lang.addEventListener('change', () => {
    // Zmiana języka = inny zbiór możliwych tłumaczeń; dotychczasowe powiązanie zerujemy.
    state.post.translationOf = '';
    renderTranslationOptions(null);
    loadTranslationOptions();
    updateLangUi();
    updatePostButtons();
    setupShare();
    onPostInput();
  });
  P.translation.addEventListener('change', () => { state.post.translationOf = P.translation.value || ''; onPostInput(); });

  // --- Upload ---------------------------------------------------------------------
  const UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
  const UPLOAD_MAX = 5 * 1024 * 1024;
  function readFileBase64(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('Nie udało się odczytać pliku.'));
      fr.onload = () => {
        const s = String(fr.result || '');
        const i = s.indexOf(',');
        resolve(i >= 0 ? s.slice(i + 1) : s);
      };
      fr.readAsDataURL(file);
    });
  }
  async function uploadImage(file) {
    if (!file) throw new Error('Nie wybrano pliku.');
    const type = String(file.type || '').toLowerCase();
    if (UPLOAD_TYPES.indexOf(type) < 0) throw new Error('Dozwolone formaty: PNG, JPG, WebP, GIF, SVG.');
    if (file.size > UPLOAD_MAX) throw new Error('Plik jest za duży (' + (file.size / 1048576).toFixed(1) + ' MB, limit 5 MB).');
    const data = await readFileBase64(file);
    const name = file.name && /\./.test(file.name) ? file.name : ('obraz.' + (type === 'image/jpeg' ? 'jpg' : type === 'image/svg+xml' ? 'svg' : type.slice(6)));
    const d = await api('/api/admin/upload', { method: 'POST', body: { name: name, type: type, data: data } });
    if (!d || !d.url) throw new Error('Serwer nie zwrócił adresu pliku.');
    return d;
  }

  // --- Okładka ----------------------------------------------------------------------
  function renderCover() {
    const S = state.post;
    if (S.cover) {
      P.coverImg.src = S.cover;
      P.coverUrl.textContent = S.cover;
      show(P.coverPreview); hide(P.coverZone);
    } else {
      P.coverImg.removeAttribute('src');
      P.coverUrl.textContent = '';
      hide(P.coverPreview); show(P.coverZone);
    }
    updatePreviewHead();
  }
  async function setCoverFromFile(file) {
    P.coverZone.classList.add('is-busy'); P.coverZone.disabled = true;
    P.coverReplace.disabled = true;
    try {
      const d = await uploadImage(file);
      if (state.view !== 'post') return;
      state.post.cover = String(d.url);
      renderCover();
      onPostInput();
      toast('Okładka wgrana.');
      P.coverAlt.focus();
    } catch (e) {
      if (e.status !== 401) toast(e.message, 'error');
    } finally {
      P.coverZone.classList.remove('is-busy'); P.coverZone.disabled = false;
      P.coverReplace.disabled = false;
    }
  }
  P.coverZone.addEventListener('click', () => P.coverFile.click());
  P.coverReplace.addEventListener('click', () => P.coverFile.click());
  P.coverFile.addEventListener('change', () => { const f = P.coverFile.files && P.coverFile.files[0]; P.coverFile.value = ''; if (f) setCoverFromFile(f); });
  P.coverRemove.addEventListener('click', () => { state.post.cover = ''; renderCover(); onPostInput(); P.coverZone.focus(); });
  ['dragenter', 'dragover'].forEach((t) => P.coverZone.addEventListener(t, (ev) => { ev.preventDefault(); P.coverZone.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((t) => P.coverZone.addEventListener(t, () => P.coverZone.classList.remove('is-over')));
  P.coverZone.addEventListener('drop', (ev) => {
    ev.preventDefault();
    const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (f) setCoverFromFile(f);
  });
  P.coverAlt.addEventListener('input', () => { updatePreviewHead(); onPostInput(); });

  // --- Treść: pasek narzędzi Markdown --------------------------------------------------
  function taSelection(ta) { return { s: ta.selectionStart, e: ta.selectionEnd, text: ta.value.slice(ta.selectionStart, ta.selectionEnd) }; }
  function taReplace(ta, s, e, text, selStart, selEnd) {
    ta.focus();
    ta.setRangeText(text, s, e, 'end');
    if (selStart != null) ta.setSelectionRange(s + selStart, s + (selEnd != null ? selEnd : selStart));
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function wrapSel(ta, before, after, placeholder) {
    const r = taSelection(ta);
    const inner = r.text || placeholder || '';
    taReplace(ta, r.s, r.e, before + inner + after, before.length, before.length + inner.length);
  }
  function prefixLines(ta, prefix, placeholder) {
    const r = taSelection(ta);
    const v = ta.value;
    const ls = v.lastIndexOf('\n', r.s - 1) + 1;
    let le = v.indexOf('\n', r.e);
    if (le < 0) le = v.length;
    if (r.e > r.s && v.charAt(r.e - 1) === '\n') le = r.e - 1;
    const block = v.slice(ls, le) || placeholder || '';
    const out = block.split('\n').map((line) => (line.indexOf(prefix) === 0 ? line : prefix + line)).join('\n');
    taReplace(ta, ls, le, out, 0, out.length);
  }
  function insertAtCursor(ta, text, selStart, selEnd) {
    const r = taSelection(ta);
    taReplace(ta, r.s, r.e, text, selStart, selEnd);
  }
  function insertBlock(ta, text) {
    const r = taSelection(ta);
    const v = ta.value;
    const needsBefore = r.s > 0 && v.charAt(r.s - 1) !== '\n';
    const needsAfter = r.e < v.length && v.charAt(r.e) !== '\n';
    insertAtCursor(ta, (needsBefore ? '\n\n' : '') + text + (needsAfter ? '\n\n' : '\n'));
  }
  function youtubeId(s) {
    s = String(s || '').trim();
    const m = s.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{6,})/) || (/^[A-Za-z0-9_-]{8,}$/.test(s) ? [null, s] : null);
    return m ? m[1] : '';
  }
  const MD_TOOLS = [
    { label: 'B', cls: 'mdbar__b', title: 'Pogrubienie (Ctrl+B)', run: (ta) => wrapSel(ta, '**', '**', 'pogrubienie') },
    { label: 'I', cls: 'mdbar__i', title: 'Kursywa (Ctrl+I)', run: (ta) => wrapSel(ta, '*', '*', 'kursywa') },
    { label: 'H2', title: 'Nagłówek 2', run: (ta) => prefixLines(ta, '## ', 'Nagłówek') },
    { label: 'H3', title: 'Nagłówek 3', run: (ta) => prefixLines(ta, '### ', 'Nagłówek') },
    { label: 'Link', title: 'Link', run: (ta) => { const r = taSelection(ta); const t = r.text || 'tekst linku'; const out = '[' + t + '](https://)'; taReplace(ta, r.s, r.e, out, t.length + 3, out.length - 1); } },
    { label: 'Lista', title: 'Lista punktowana', run: (ta) => prefixLines(ta, '- ', 'punkt') },
    { label: 'Cytat', title: 'Cytat', run: (ta) => prefixLines(ta, '> ', 'cytat') },
    { label: 'Kod', title: 'Kod', run: (ta) => { const r = taSelection(ta); if (r.text.indexOf('\n') >= 0) taReplace(ta, r.s, r.e, '```\n' + r.text + '\n```', 4, 4 + r.text.length); else wrapSel(ta, '`', '`', 'kod'); } },
    { label: 'Obraz', title: 'Wgraj obraz i wstaw', run: () => P.imageFile.click() },
    { label: 'YouTube', title: 'Osadź film z YouTube', run: (ta) => {
      const r = taSelection(ta);
      const id = youtubeId(r.text);
      if (id) { taReplace(ta, r.s, r.e, '{{youtube ' + id + '}}'); return; }
      const out = '{{youtube ID}}';
      insertBlock(ta, out);
      const pos = ta.selectionStart - (out.length + 1);
      const idAt = ta.value.indexOf('ID}}', Math.max(0, pos));
      if (idAt >= 0) ta.setSelectionRange(idAt, idAt + 2);
    } }
  ];
  MD_TOOLS.forEach((t) => {
    P.mdbar.append(h('button', { type: 'button', class: 'mdbar__btn' + (t.cls ? ' ' + t.cls : ''), title: t.title, 'aria-label': t.title, onclick: () => t.run(P.content) }, t.label));
  });
  P.content.addEventListener('keydown', (ev) => {
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
    const k = String(ev.key).toLowerCase();
    if (k === 'b') { ev.preventDefault(); MD_TOOLS[0].run(P.content); }
    else if (k === 'i') { ev.preventDefault(); MD_TOOLS[1].run(P.content); }
  });
  P.content.addEventListener('input', () => { onPostInput(); requestPreview(); });

  async function insertImageFile(file) {
    const ta = P.content;
    const r = taSelection(ta);
    const marker = '![wgrywam…]()';
    taReplace(ta, r.s, r.e, marker);
    try {
      const d = await uploadImage(file);
      const alt = (file.name || 'obraz').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
      const md = '![' + alt + '](' + d.url + ')';
      const i = ta.value.indexOf(marker);
      if (i >= 0) taReplace(ta, i, i + marker.length, md, 2, 2 + alt.length); else insertAtCursor(ta, md);
      toast('Obraz wstawiony.');
    } catch (e) {
      const i = ta.value.indexOf(marker);
      if (i >= 0) taReplace(ta, i, i + marker.length, '', 0, 0);
      if (e.status !== 401) toast(e.message, 'error');
    }
  }
  P.imageFile.addEventListener('change', () => { const f = P.imageFile.files && P.imageFile.files[0]; P.imageFile.value = ''; if (f) insertImageFile(f); });
  P.content.addEventListener('paste', (ev) => {
    const items = ev.clipboardData && ev.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && items[i].type.indexOf('image/') === 0) {
        const f = items[i].getAsFile();
        if (f) { ev.preventDefault(); insertImageFile(f); return; }
      }
    }
  });
  P.content.addEventListener('drop', (ev) => {
    const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (f && f.type.indexOf('image/') === 0) { ev.preventDefault(); insertImageFile(f); }
  });

  // --- Podgląd (render po stronie serwera) --------------------------------------------
  function updatePreviewHead() {
    P.previewTitle.textContent = P.title.value.trim() || 'Bez tytułu';
    const S = state.post;
    if (S.cover) { P.previewCoverImg.src = S.cover; P.previewCoverImg.alt = P.coverAlt.value.trim(); show(P.previewCover); }
    else { P.previewCoverImg.removeAttribute('src'); hide(P.previewCover); }
  }
  const requestPreviewDebounced = debounce(() => doPreview(), 400);
  function requestPreview(immediate) { if (immediate) doPreview(); else requestPreviewDebounced(); }
  async function doPreview() {
    const S = state.post;
    if (state.view !== 'post') return;
    const req = ++S.previewReq;
    const content = P.content.value;
    if (!content.trim()) {
      clear(P.preview);
      P.preview.append(h('p', { class: 'preview__empty' }, 'Zacznij pisać — podgląd pojawi się tutaj.'));
      hide(P.previewToc);
      P.previewReading.textContent = '';
      P.previewState.textContent = '';
      return;
    }
    P.previewState.textContent = 'Renderuję…';
    try {
      const d = await api('/api/admin/posts/' + encodeURIComponent(S.id == null ? 'nowy' : S.id) + '/preview', { method: 'POST', body: { content: content } });
      if (req !== S.previewReq || state.view !== 'post') return;
      // HTML z własnego renderera serwera (jedyny autor = właściciel panelu).
      P.preview.innerHTML = typeof d.html === 'string' ? d.html : '';
      if (Number(d.readingMin) > 0) S.readingMin = Number(d.readingMin);
      P.previewReading.textContent = S.readingMin ? readingLabel(S.readingMin) : '';
      renderToc(Array.isArray(d.toc) ? d.toc : []);
      P.previewState.textContent = '';
    } catch (e) {
      if (req !== S.previewReq || e.status === 401) return;
      P.previewState.textContent = (e.status === 404 && S.id == null) ? 'Zapisz szkic, żeby zobaczyć podgląd.' : 'Podgląd niedostępny: ' + e.message;
    }
  }
  function renderToc(toc) {
    clear(P.previewToc);
    const items = toc.filter((t) => t && t.text);
    if (!items.length) { hide(P.previewToc); return; }
    const ol = h('ol');
    items.forEach((t) => ol.append(h('li', { class: 'preview__toc-l' + Math.min(4, Math.max(2, Number(t.level) || 2)) }, h('a', { href: '#p-preview' }, String(t.text)))));
    P.previewToc.append(h('span', { class: 'block__label' }, 'Spis treści'), ol);
    show(P.previewToc);
  }

  // --- Zapis -------------------------------------------------------------------------------
  function setPostBusy(on) {
    [els.postSaveDraft, els.postPublish].forEach((b) => { b.disabled = on; if (on) b.setAttribute('aria-busy', 'true'); else b.removeAttribute('aria-busy'); });
  }
  /** mode: 'draft' | 'publish' | 'keep'. Zwraca true po udanym zapisie. */
  async function savePost(mode) {
    const S = state.post;
    if (S.saving || els.postForm.hidden) return false;
    const data = collectPost();
    if (!data.title) { toast('Wpisz tytuł wpisu.', 'error'); P.title.focus(); return false; }
    if (mode === 'draft') data.status = 'draft';
    if (mode === 'publish') data.status = 'published';
    if (data.status === 'published' && !data.publishedAt) data.publishedAt = new Date().toISOString();
    if (!data.slug) delete data.slug; // serwer wygeneruje z tytułu
    P.status.value = data.status;
    P.publishedAt.value = toLocalInput(data.publishedAt);
    S.saving = true; setPostBusy(true); updateSaveState();
    const wasNew = S.id == null;
    const wasPublished = !!(S.item && S.item.status === 'published');
    try {
      const d = wasNew
        ? await api('/api/admin/posts', { method: 'POST', body: data })
        : await api('/api/admin/posts/' + encodeURIComponent(S.id), { method: 'PUT', body: data });
      const item = d && d.item ? d.item : Object.assign({}, S.item || {}, data, { id: S.id });
      if (state.view !== 'post') return true;
      clearLocalDraft(wasNew ? null : S.id);
      S.id = item.id != null ? String(item.id) : S.id;
      S.item = item;
      if (Number(item.readingMin) > 0) S.readingMin = Number(item.readingMin);
      fillPostForm(item);
      S.base = snapshotPost();
      S.savedAt = new Date();
      els.postH1.textContent = item.title || 'Wpis';
      if (wasNew) { state.param = S.id; history.replaceState(null, '', '#blog/' + encodeURIComponent(S.id)); }
      setDocTitle();
      updatePostButtons();
      updateSaveState();
      setupShare();
      requestPreview(true);
      hide(els.postRestore);
      toast(data.status === 'published' ? (wasPublished ? 'Zapisano.' : 'Opublikowano.') : 'Zapisano szkic.');
      return true;
    } catch (e) {
      if (e.status === 401) return false;
      if (e.status === 409) { P.slug.setAttribute('aria-invalid', 'true'); setSlugAuto(false); P.slug.focus(); }
      toast(e.message, 'error');
      return false;
    } finally {
      S.saving = false; setPostBusy(false); updateSaveState();
    }
  }
  els.postSaveDraft.addEventListener('click', () => savePost('draft'));
  els.postPublish.addEventListener('click', () => savePost('publish'));
  els.postForm.addEventListener('submit', (ev) => { ev.preventDefault(); savePost('keep'); });
  document.addEventListener('keydown', (ev) => {
    if (!state.authed || state.view !== 'post') return;
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey && String(ev.key).toLowerCase() === 's') { ev.preventDefault(); savePost('keep'); }
  });
  els.postViewLink.addEventListener('click', (ev) => { if (els.postViewLink.getAttribute('aria-disabled') === 'true') ev.preventDefault(); });

  // --- Usuwanie ------------------------------------------------------------------------------
  els.postDelete.addEventListener('click', () => {
    const S = state.post;
    if (S.id == null) return;
    confirmInline(els.postDanger, els.postDelete, 'Usunąć ten wpis? Zniknie też ze strony. Nie da się tego cofnąć.', async () => {
      const id = S.id;
      await api('/api/admin/posts/' + encodeURIComponent(id), { method: 'DELETE' });
      clearLocalDraft(id);
      S.base = null;
      const idx = state.blog.items.findIndex((x) => String(x.id) === String(id));
      if (idx >= 0) state.blog.items.splice(idx, 1);
      leaveTo('#blog');
      toast('Usunięto wpis.');
    });
  });

  // --- Strażnik niezapisanych zmian ------------------------------------------------------------
  function guardLeave(targetHash) {
    const S = state.post;
    history.replaceState(null, '', '#blog/' + encodeURIComponent(S.id == null ? 'nowy' : S.id));
    S.leaveTarget = targetHash;
    show(els.postGuard);
    window.scrollTo({ top: 0 });
    els.postGuardStay.focus();
  }
  function leaveTo(hash) {
    state.post.leaving = true;
    if (location.hash === hash) { state.post.leaving = false; const r = routeFromHash(); setView(r ? r.view : 'leads', r ? r.param : null, true); }
    else location.hash = hash;
  }
  els.postGuardStay.addEventListener('click', () => { hide(els.postGuard); state.post.leaveTarget = null; });
  els.postGuardDiscard.addEventListener('click', () => {
    const S = state.post;
    S.base = snapshotPost();
    clearLocalDraft(S.id);
    hide(els.postGuard);
    leaveTo(S.leaveTarget || '#blog');
  });
  els.postGuardSave.addEventListener('click', async () => {
    const S = state.post;
    els.postGuardSave.disabled = true;
    try {
      const ok = await savePost('keep');
      if (ok) { hide(els.postGuard); leaveTo(S.leaveTarget || '#blog'); }
    } finally { els.postGuardSave.disabled = false; }
  });
  window.addEventListener('beforeunload', (ev) => {
    if (!isPostDirty()) return;
    ev.preventDefault();
    ev.returnValue = '';
  });

  // --- Autozapis do localStorage ----------------------------------------------------------------
  function localKey(id) { return 'tsadmin.post.' + (id == null ? 'nowy' : String(id)); }
  function clearLocalDraft(id) { try { localStorage.removeItem(localKey(id)); } catch (e) { /* prywatny tryb */ } }
  function startAutosave() { stopAutosave(); state.post.autosaveTimer = setInterval(autosaveTick, 10000); }
  function stopAutosave() { if (state.post.autosaveTimer) { clearInterval(state.post.autosaveTimer); state.post.autosaveTimer = 0; } }
  function autosaveTick() {
    const S = state.post;
    if (state.view !== 'post' || S.saving || !isPostDirty()) return;
    try { localStorage.setItem(localKey(S.id), JSON.stringify({ at: new Date().toISOString(), draft: collectPost() })); } catch (e) { /* brak miejsca / prywatny tryb */ }
  }
  function checkLocalDraft(item) {
    const S = state.post;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(localKey(S.id)) || 'null'); } catch (e) { saved = null; }
    if (!saved || !isObj(saved.draft)) return;
    const localTs = toDate(saved.at), serverTs = toDate(item.updatedAt);
    if (!localTs || (serverTs && localTs.getTime() <= serverTs.getTime()) || JSON.stringify(saved.draft) === S.base) { clearLocalDraft(S.id); return; }
    els.postRestoreText.textContent = 'Jest lokalna kopia tego wpisu z ' + exactDate(saved.at) + (serverTs ? ' — nowsza niż wersja na serwerze (' + exactDate(item.updatedAt) + ').' : ' — niezapisana na serwerze.') + ' Przywrócić ją?';
    show(els.postRestore);
    els.postRestoreYes.onclick = () => {
      fillPostForm(Object.assign({}, S.item || {}, saved.draft, { id: S.id }));
      hide(els.postRestore);
      updateSaveState();
      requestPreview(true);
      toast('Przywrócono lokalną kopię. Pamiętaj, żeby zapisać.', 'info');
    };
    els.postRestoreNo.onclick = () => { clearLocalDraft(S.id); hide(els.postRestore); };
  }

  /* ---------------------------------------------------------------------------
     Blog — udostępnianie (OG + sociale)
     ------------------------------------------------------------------------- */
  function toHashtag(s) {
    const t = String(s || '').trim();
    if (!t) return '';
    const words = t.replace(/[ąćęłńóśźż]/gi, (c) => PL_MAP[c.toLowerCase()] || c).split(/[^A-Za-z0-9]+/).filter(Boolean);
    if (!words.length) return '';
    return '#' + words.map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
  }
  function hashtags(item) {
    const out = [];
    const push = (tag) => { if (tag && !out.some((x) => x.toLowerCase() === tag.toLowerCase())) out.push(tag); };
    push('#automatyzacja'); push('#AI');
    (Array.isArray(item.tags) ? item.tags : []).forEach((t) => push(toHashtag(t)));
    push(toHashtag(item.category));
    return out.slice(0, 3);
  }
  const SOCIALS = [
    {
      key: 'linkedin', label: 'LinkedIn',
      make: (it, url) => [it.title, '', it.excerpt, '', hashtags(it).join(' '), '', url].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').replace(/^\n+/, ''),
      link: (text, url) => 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(url)
    },
    {
      key: 'facebook', label: 'Facebook',
      make: (it, url) => 'Właśnie wrzuciłem nowy wpis: „' + it.title + '”. ' + (it.excerpt || 'Krótko i konkretnie, jak zawsze.') + '\n\n' + url,
      link: (text, url) => 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url)
    },
    {
      key: 'x', label: 'X',
      make: (it, url) => truncate(it.title, 200) + '\n' + url,
      link: (text, url) => 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text.replace(url, '').trim()) + '&url=' + encodeURIComponent(url)
    }
  ];
  const socialEls = {};
  SOCIALS.forEach((def) => {
    const ta = h('textarea', { id: 'social-' + def.key, rows: 7, spellcheck: 'false' });
    const copy = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, 'Kopiuj');
    const open = h('a', { class: 'btn btn--ghost btn--sm', target: '_blank', rel: 'noopener noreferrer' }, 'Otwórz ↗');
    const reset = h('button', { class: 'btn btn--link btn--sm', type: 'button', title: 'Wygeneruj tekst na nowo' }, 'Odśwież');
    ta.addEventListener('input', () => { ta.dataset.edited = '1'; open.href = def.link(ta.value, SH.url.value); });
    copy.addEventListener('click', async () => {
      try { await copyText(ta.value); toast('Skopiowano tekst na ' + def.label + '.'); }
      catch (e) { toast(e.message || 'Nie udało się skopiować.', 'error'); }
    });
    reset.addEventListener('click', () => { delete ta.dataset.edited; fillSocial(def, true); });
    socialEls[def.key] = { ta: ta, open: open };
    SH.socials.append(h('div', { class: 'social' },
      h('div', { class: 'social__head' }, h('label', { for: ta.id }, def.label), reset),
      ta,
      h('div', { class: 'share__row' }, copy, open)
    ));
  });
  function fillSocial(def, force) {
    const it = shareSource();
    if (!it) return;
    const url = postUrl(it.slug, it.lang);
    const se = socialEls[def.key];
    if (force || !se.ta.dataset.edited) { se.ta.value = def.make(it, url); delete se.ta.dataset.edited; }
    se.open.href = def.link(se.ta.value, url);
  }
  function shareSource() {
    const S = state.post;
    if (!S.item || S.id == null) return null;
    const cur = collectPost();
    return { title: cur.title || S.item.title || '', excerpt: cur.excerpt || S.item.excerpt || '', category: cur.category, tags: cur.tags, slug: S.item.slug || cur.slug, lang: S.item.lang || cur.lang, readingMin: S.readingMin || S.item.readingMin };
  }
  function setupShare() {
    const S = state.post;
    if (S.id == null || !S.item) { hide(SH.root); return; }
    show(SH.root);
    const url = postUrl(S.item.slug, S.item.lang);
    SH.url.value = url;
    SH.wa.href = 'https://wa.me/?text=' + encodeURIComponent((S.item.title || '') + ' ' + url);
    SOCIALS.forEach((def) => fillSocial(def, false));
    if (S.item.og) {
      SH.storedImg.src = String(S.item.og).split('?')[0] + '?v=' + Date.now();
      SH.storedLink.href = String(S.item.og);
      show(SH.stored);
    } else hide(SH.stored);
    SH.state.textContent = '';
    if (SH.root.open) scheduleOgDraw();
  }
  SH.root.addEventListener('toggle', () => { if (SH.root.open) { SOCIALS.forEach((def) => fillSocial(def, false)); scheduleOgDraw(); } });
  SH.copyLink.addEventListener('click', async () => {
    try { await copyText(SH.url.value); toast('Skopiowano link.'); }
    catch (e) { toast(e.message || 'Nie udało się skopiować.', 'error'); }
  });
  SH.url.addEventListener('focus', () => SH.url.select());

  // --- Obrazek OG na <canvas> --------------------------------------------------------------------
  let ogTimer = 0;
  function scheduleOgDraw() { clearTimeout(ogTimer); ogTimer = setTimeout(() => { drawOgPreview(); }, 150); }
  async function loadOgFonts(sample) {
    if (!document.fonts || typeof document.fonts.load !== 'function') return;
    const txt = (sample || '') + ' ąćęłńóśźż ĄĆĘŁŃÓŚŹŻ';
    try {
      await Promise.all([
        document.fonts.load('800 64px "Bricolage Grotesque"', txt),
        document.fonts.load('400 28px "IBM Plex Sans"', txt),
        document.fonts.load('600 24px "IBM Plex Sans"', txt),
        document.fonts.load('500 20px "IBM Plex Mono"', txt)
      ]);
    } catch (e) { /* rysujemy fontem zapasowym */ }
  }
  async function drawOgPreview() {
    const src = shareSource();
    if (!src) return;
    await loadOgFonts(src.title + ' ' + src.excerpt + ' ' + src.category);
    if (state.view !== 'post') return;
    drawOg(SH.canvas, src);
    state.post.ogBlob = null;
  }
  function rrect(ctx, x, y, w, h2, r) {
    r = Math.min(r, w / 2, h2 / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h2, r);
    ctx.arcTo(x + w, y + h2, x, y + h2, r);
    ctx.arcTo(x, y + h2, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function wrapText(ctx, text, maxW) {
    const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ');
    const lines = [];
    let line = '';
    words.forEach((w) => {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width <= maxW || !line) line = test; else { lines.push(line); line = w; }
    });
    if (line) lines.push(line);
    return lines;
  }
  function clampLines(ctx, lines, maxLines, maxW) {
    if (lines.length <= maxLines) return lines;
    const out = lines.slice(0, maxLines);
    let last = out[maxLines - 1];
    while (last && ctx.measureText(last + '…').width > maxW) {
      const sp = last.lastIndexOf(' ');
      last = sp > 0 ? last.slice(0, sp) : last.slice(0, -1);
    }
    out[maxLines - 1] = last + '…';
    return out;
  }
  function drawOg(canvas, d) {
    const W = 1200, H = 630, PAD = 72;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const DISPLAY = '"Bricolage Grotesque", "Segoe UI", system-ui, sans-serif';
    const BODY = '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif';
    const MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
    const canSpace = 'letterSpacing' in ctx;

    // Tło + poświata
    ctx.fillStyle = '#141c31';
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(1060, 60, 0, 1060, 60, 640);
    glow.addColorStop(0, 'rgba(74, 123, 255, 0.2)');
    glow.addColorStop(1, 'rgba(74, 123, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Neonowa siatka u dołu (perspektywa)
    ctx.save();
    ctx.strokeStyle = 'rgba(34, 229, 255, 0.12)';
    ctx.lineWidth = 1;
    const gridTop = 436;
    for (let i = 1; i <= 8; i++) {
      const y = Math.round(gridTop + Math.pow(i / 8, 1.75) * (H - gridTop)) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    const vpX = 600, vpY = 300;
    for (let x = -500; x <= W + 500; x += 110) {
      const xTop = vpX + (x - vpX) * ((gridTop - vpY) / (H - vpY));
      ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(xTop, gridTop); ctx.stroke();
    }
    ctx.restore();

    // Logo T
    const L = 56, lx = PAD, ly = 56;
    ctx.fillStyle = '#4a7bff';
    rrect(ctx, lx, ly, L, L, 14); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(lx + 16, ly + 17.5); ctx.lineTo(lx + 40, ly + 17.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(lx + 28, ly + 17.5); ctx.lineTo(lx + 28, ly + 38.5); ctx.stroke();
    ctx.fillStyle = '#ffbd70';
    ctx.beginPath(); ctx.arc(lx + 28, ly + 41.5, 4.2, 0, Math.PI * 2); ctx.fill();

    // Nazwa obok logo
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = '500 20px ' + MONO;
    if (canSpace) ctx.letterSpacing = '3px';
    ctx.fillStyle = '#8fb3ff';
    ctx.fillText('TSOFTWARE.ONLINE · BLOG', lx + L + 22, ly + L / 2 + 1);

    // Kategoria (pigułka) u góry po prawej
    const cat = String(d.category || '').trim().toUpperCase();
    if (cat) {
      ctx.font = '500 18px ' + MONO;
      if (canSpace) ctx.letterSpacing = '2px';
      const tw = ctx.measureText(cat).width;
      const pw = tw + 40, ph = 40, px = W - PAD - pw, py = ly + (L - ph) / 2;
      ctx.fillStyle = 'rgba(34, 229, 255, 0.08)';
      ctx.strokeStyle = '#22e5ff'; ctx.lineWidth = 1.5;
      rrect(ctx, px, py, pw, ph, 20); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#22e5ff';
      ctx.fillText(cat, px + 20, py + ph / 2 + 1);
    }
    if (canSpace) ctx.letterSpacing = '0px';

    // Tytuł (auto-zmniejszanie 72 → 48, max 3 linie) + zajawka (max 2 linie)
    const maxW = W - 2 * PAD;
    const title = String(d.title || 'Bez tytułu').trim() || 'Bez tytułu';
    let size = 72, lines = [];
    for (const s of [72, 66, 60, 54, 48]) {
      size = s;
      ctx.font = '800 ' + s + 'px ' + DISPLAY;
      lines = wrapText(ctx, title, maxW);
      if (lines.length <= 3) break;
    }
    ctx.font = '800 ' + size + 'px ' + DISPLAY;
    lines = clampLines(ctx, lines, 3, maxW);
    const titleLH = Math.round(size * 1.08);
    const titleH = lines.length * titleLH;

    const excerpt = String(d.excerpt || '').trim();
    let exLines = [];
    const exLH = 38;
    if (excerpt) {
      ctx.font = '400 28px ' + BODY;
      exLines = clampLines(ctx, wrapText(ctx, excerpt, maxW), 2, maxW);
    }
    const gap = exLines.length ? 26 : 0;
    const blockH = titleH + gap + exLines.length * exLH;
    const regionTop = 150, regionBottom = 536;
    let y = regionTop + Math.max(0, (regionBottom - regionTop - blockH) / 2);

    ctx.textBaseline = 'top';
    ctx.fillStyle = '#f1f4fc';
    ctx.font = '800 ' + size + 'px ' + DISPLAY;
    lines.forEach((line, i) => ctx.fillText(line, PAD, y + i * titleLH));
    y += titleH + gap;
    if (exLines.length) {
      ctx.font = '400 28px ' + BODY;
      ctx.fillStyle = '#b7c1da';
      exLines.forEach((line, i) => ctx.fillText(line, PAD, y + i * exLH));
    }

    // Stopka: autor + czas czytania; akcent po prawej
    ctx.textBaseline = 'middle';
    const fy = H - 58;
    ctx.font = '600 24px ' + BODY;
    ctx.fillStyle = '#f1f4fc';
    const author = 'Tomasz Stachowiak';
    ctx.fillText(author, PAD, fy);
    const aw = ctx.measureText(author).width;
    ctx.font = '400 24px ' + BODY;
    ctx.fillStyle = '#8b97b4';
    ctx.fillText('· ' + readingLabel(d.readingMin), PAD + aw + 12, fy);
    ctx.fillStyle = '#ffbd70';
    rrect(ctx, W - PAD - 84, fy - 4, 84, 8, 4); ctx.fill();
  }
  function canvasBlob(canvas) {
    return new Promise((resolve, reject) => {
      try { canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Nie udało się wygenerować PNG.')), 'image/png'); }
      catch (e) { reject(new Error('Nie udało się wygenerować PNG.')); }
    });
  }
  SH.redraw.addEventListener('click', () => { SH.state.textContent = ''; drawOgPreview(); });
  SH.generate.addEventListener('click', async () => {
    const S = state.post;
    if (S.id == null) return;
    SH.generate.disabled = true; SH.generate.setAttribute('aria-busy', 'true');
    SH.state.textContent = 'Generuję…';
    try {
      await drawOgPreview();
      const blob = await canvasBlob(SH.canvas);
      const data = await readFileBase64(blob);
      const d = await api('/api/admin/posts/' + encodeURIComponent(S.id) + '/og', { method: 'POST', body: { data: data } });
      if (state.view !== 'post') return;
      if (d && d.url) {
        S.item.og = String(d.url);
        SH.storedImg.src = String(S.item.og).split('?')[0] + '?v=' + Date.now();
        SH.storedLink.href = S.item.og;
        show(SH.stored);
      }
      SH.state.textContent = 'Zapisano ' + fmtClock.format(new Date());
      toast('Obrazek OG zapisany.');
    } catch (e) {
      SH.state.textContent = '';
      if (e.status !== 401) toast(e.message, 'error');
    } finally {
      SH.generate.disabled = false; SH.generate.removeAttribute('aria-busy');
    }
  });
  SH.download.addEventListener('click', async () => {
    const S = state.post;
    SH.download.disabled = true;
    try {
      await drawOgPreview();
      const blob = await canvasBlob(SH.canvas);
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: 'og-' + ((S.item && S.item.slug) || 'wpis') + '.png', style: 'display:none' });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      toast(e.message, 'error');
    } finally { SH.download.disabled = false; }
  });

  /* ---------------------------------------------------------------------------
     Newsletter — wspólne
     ------------------------------------------------------------------------- */
  const NL = {
    eyebrow: $('#nl-eyebrow'), h1: $('#h-newsletter'), actions: $('#nl-actions'), tabs: $('#nl-tabs'), tabSubsN: $('#nl-tab-subs-n'),
    panels: { subs: $('#nl-subs'), camps: $('#nl-camps'), editor: $('#nl-editor'), settings: $('#nl-settings') },
    tiles: $('#nl-tiles'), q: $('#nl-q'), status: $('#nl-status'), subsList: $('#nl-subs-list'), subsState: $('#nl-subs-state'), subsMore: $('#nl-subs-more'), subsCount: $('#nl-subs-count'),
    addForm: $('#nl-add-form'), addEmail: $('#nl-add-email'), addLang: $('#nl-add-lang'), addSubmit: $('#nl-add-submit'),
    importBtn: $('#nl-import'), importResult: $('#nl-import-result'),
    digestLang: $('#nl-digest-lang'), digest: $('#nl-digest'), campsList: $('#nl-camps-list'), campsState: $('#nl-camps-state')
  };
  const NLC = {
    form: $('#nlc-form'), state: $('#nlc-state'), mailwarn: $('#nlc-mailwarn'), mailwarnText: $('#nlc-mailwarn-text'),
    saveState: $('#nlc-savestate'), save: $('#nlc-save'), previewBtn: $('#nlc-preview'),
    stats: $('#nlc-stats'), progress: $('#nlc-progress'), progressLabel: $('#nlc-progress-label'), progressN: $('#nlc-progress-n'), progressFill: $('#nlc-progress-fill'),
    subject: $('#nlc-subject'), lang: $('#nlc-lang'), intro: $('#nlc-intro'),
    picks: $('#nlc-picks'), picksState: $('#nlc-picks-state'), picksCount: $('#nlc-picks-count'),
    sendcard: $('#nlc-sendcard'), testTo: $('#nlc-test-to'), test: $('#nlc-test'), senddanger: $('#nlc-senddanger'), send: $('#nlc-send'), sendHint: $('#nlc-send-hint'),
    danger: $('#nlc-danger'), del: $('#nlc-delete'),
    previewWrap: $('#nlc-preview-wrap'), widths: $('#nlc-widths'), previewState: $('#nlc-preview-state'), mailframe: $('#nlc-mailframe'), iframe: $('#nlc-iframe')
  };
  const NLS = {
    form: $('#nls-form'), state: $('#nls-state'), enabled: $('#nls-enabled'), weekday: $('#nls-weekday'), hour: $('#nls-hour'), minPosts: $('#nls-minposts'),
    last: $('#nls-last'), fromName: $('#nls-fromname'), replyTo: $('#nls-replyto'), provider: $('#nls-provider'), hint: $('#nls-hint'), save: $('#nls-save'), reset: $('#nls-reset')
  };
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const SUB_STATUS = [
    { key: 'active', label: 'Aktywni', pill: 'Aktywny', slug: 'active' },
    { key: 'pending', label: 'Oczekujący', pill: 'Oczekuje', slug: 'pending' },
    { key: 'unsubscribed', label: 'Wypisani', pill: 'Wypisany', slug: 'unsubscribed' }
  ];
  function subStatusInfo(s) {
    const key = String(s || '').toLowerCase();
    return SUB_STATUS.find((x) => x.key === key) || { key: key, label: key || 'brak', pill: key || 'brak', slug: 'inne' };
  }
  const NL_SOURCES = { home: 'Strona główna', blog: 'Blog', post: 'Wpis', magnet: 'Lead magnet', admin: 'Ręcznie' };
  function nlSourceLabel(s) { const k = String(s || '').toLowerCase(); return NL_SOURCES[k] || (s ? String(s) : '—'); }
  const CAMP_STATUS = {
    draft: { label: 'Szkic', slug: 'draft' },
    sending: { label: 'Wysyłka…', slug: 'sending' },
    sent: { label: 'Wysłana', slug: 'sent' }
  };
  function campStatusInfo(s) { const key = String(s || 'draft').toLowerCase(); return CAMP_STATUS[key] || { label: key, slug: 'draft' }; }
  function subsWord(n) { return plural(n, 'subskrybent', 'subskrybentów', 'subskrybentów'); }
  function postsWord(n) { return plural(n, 'wpis', 'wpisy', 'wpisów'); }

  function updateNlBadge(active) {
    const n = Number(active);
    if (Number.isFinite(n) && n > 0) { els.navBadgeNl.textContent = String(n); show(els.navBadgeNl); NL.tabSubsN.textContent = String(n); show(NL.tabSubsN); }
    else { hide(els.navBadgeNl); hide(NL.tabSubsN); }
  }

  /** '' → subs, 'kampanie' → camps, 'ustawienia' → settings, 'kampania/<id|nowa>' → editor. */
  function nlRoute(param) {
    const p = String(param || '');
    if (!p) return { tab: 'subs' };
    if (p === 'kampanie') return { tab: 'camps' };
    if (p === 'ustawienia') return { tab: 'settings' };
    const m = p.match(/^kampania\/(.+)$/);
    if (m) return { tab: 'editor', id: m[1] === 'nowa' ? null : m[1] };
    return { tab: 'subs', redirect: true };
  }
  function loadNewsletter(param) {
    const r = nlRoute(param);
    if (r.redirect) { state.param = null; history.replaceState(null, '', '#newsletter'); }
    stopCampPoll();
    state.newsletter.tab = r.tab;
    Object.keys(NL.panels).forEach((k) => { if (k === r.tab) show(NL.panels[k]); else hide(NL.panels[k]); });
    $$('[data-nl-panel]', NL.actions).forEach((el) => { el.hidden = el.dataset.nlPanel !== r.tab; });
    if (r.tab === 'editor') {
      hide(NL.tabs);
      clear(NL.eyebrow);
      NL.eyebrow.append(h('a', { href: '#newsletter/kampanie' }, 'Newsletter · Kampanie'));
    } else {
      show(NL.tabs);
      NL.eyebrow.textContent = 'Mailing';
      NL.h1.textContent = 'Newsletter';
      $$('a[data-tab]', NL.tabs).forEach((a) => { if (a.dataset.tab === r.tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
      setDocTitle();
    }
    if (r.tab === 'subs') loadSubs();
    else if (r.tab === 'camps') loadCamps();
    else if (r.tab === 'settings') loadNlSettings();
    else openCampaign(r.id);
  }
  function leaveNewsletter() { stopCampPoll(); }
  function newsletterReset() {
    const N = state.newsletter;
    stopCampPoll();
    N.tab = null;
    N.subs.items = []; N.subs.total = 0; N.subs.counts = {}; N.subs.q = ''; N.subs.status = 'all';
    N.camps.items = [];
    N.settings.data = null; N.settings.original = null;
    campReset();
    clear(NL.subsList); clear(NL.campsList); clear(NL.tiles);
    NL.q.value = '';
    NL.importResult.textContent = '';
    hide(NL.tabSubsN);
  }

  /* ---------------------------------------------------------------------------
     Newsletter — subskrybenci
     ------------------------------------------------------------------------- */
  function renderSubTiles() {
    const c = state.newsletter.subs.counts || {};
    const n = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
    clear(NL.tiles);
    NL.tiles.append(
      tile('Aktywni', n(c.active), 'dostają maile', 'ok'),
      tile('Oczekujący', n(c.pending), 'czekają na potwierdzenie', 'signal'),
      tile('Wypisani', n(c.unsubscribed), 'już nic nie dostają', 'dim')
    );
    updateNlBadge(c.active);
  }
  function renderSubChips() {
    const c = state.newsletter.subs.counts || {};
    const all = ['active', 'pending', 'unsubscribed'].reduce((a, k) => a + (Number(c[k]) || 0), 0);
    const chips = [{ key: 'all', label: 'Wszyscy', n: Object.keys(c).length ? all : null }].concat(SUB_STATUS.map((s) => ({ key: s.key, label: s.label, n: c[s.key] })));
    clear(NL.status);
    chips.forEach((ch) => {
      NL.status.append(h('button', {
        class: 'chip', type: 'button', 'aria-pressed': state.newsletter.subs.status === ch.key ? 'true' : 'false',
        onclick: () => { if (state.newsletter.subs.status === ch.key) return; state.newsletter.subs.status = ch.key; renderSubChips(); loadSubs(); }
      }, ch.label, ch.n != null ? h('span', { class: 'chip__n' }, String(ch.n)) : null));
    });
  }

  async function loadSubs(opts) {
    opts = opts || {};
    const append = !!opts.append;
    const S = state.newsletter.subs;
    const offset = append ? S.items.length : 0;
    const req = ++S.req;
    if (!append) {
      clear(NL.subsList);
      renderState(NL.subsState, 'loading');
      hide(NL.subsMore);
      NL.subsCount.textContent = '';
      if (!Object.keys(S.counts).length) renderSubTiles();
      renderSubChips();
    } else {
      NL.subsMore.disabled = true;
      NL.subsMore.setAttribute('aria-busy', 'true');
    }
    try {
      const data = await api('/api/admin/newsletter/subscribers' + qs({ status: S.status, q: S.q, limit: PAGE, offset: offset }));
      if (req !== S.req) return;
      const items = Array.isArray(data.items) ? data.items : [];
      S.items = append ? S.items.concat(items) : items;
      S.total = Number.isFinite(Number(data.total)) ? Number(data.total) : S.items.length;
      if (isObj(data.counts)) S.counts = data.counts;
      renderSubs(append ? items : null);
    } catch (e) {
      if (req !== S.req || e.status === 401) return;
      if (append) toast(e.message, 'error');
      else renderState(NL.subsState, 'error', 'Nie udało się pobrać subskrybentów', e.message, () => loadSubs());
    } finally {
      NL.subsMore.disabled = false;
      NL.subsMore.removeAttribute('aria-busy');
    }
  }
  function renderSubs(appended) {
    const S = state.newsletter.subs;
    renderSubTiles();
    renderSubChips();
    if (appended) appended.forEach((it) => NL.subsList.append(subRow(it)));
    else { clear(NL.subsList); S.items.forEach((it) => NL.subsList.append(subRow(it))); }
    if (!S.items.length) {
      const filtered = S.q || (S.status && S.status !== 'all');
      renderState(NL.subsState, 'empty',
        filtered ? 'Nikt nie pasuje do filtrów' : 'Lista jest jeszcze pusta.',
        filtered ? 'Spróbuj innego adresu albo wyczyść filtry.' : 'Zapisy z formularza na stronie pojawią się tutaj. Możesz też dodać kogoś ręcznie albo zaimportować z lead magnetu.');
    } else {
      hide(NL.subsState);
    }
    NL.subsCount.textContent = S.items.length ? 'Pokazano ' + S.items.length + ' z ' + S.total : '';
    if (S.items.length < S.total) show(NL.subsMore); else hide(NL.subsMore);
  }
  function subRow(item) {
    const st = subStatusInfo(item.status);
    const li = h('li', { class: 'sub sub--' + st.slug, dataset: { id: item.id } });
    const del = h('button', { class: 'btn btn--ghost btn--sm sub__del', type: 'button', 'aria-label': 'Usuń ' + (item.email || '') }, 'Usuń');
    del.addEventListener('click', () => {
      confirmInline(li, del, 'Usunąć ' + (item.email || 'ten adres') + ' z listy? Znika całkiem, bez śladu (RODO).', async () => {
        await api('/api/admin/newsletter/subscribers/' + encodeURIComponent(item.id), { method: 'DELETE' });
        removeSub(item.id);
        toast('Usunięto adres.');
      });
    });
    const when = item.status === 'unsubscribed' && item.unsubscribedAt ? item.unsubscribedAt : (item.status === 'active' && item.confirmedAt ? item.confirmedAt : item.createdAt);
    const whenTitle = ['Zapis: ' + exactDate(item.createdAt), item.confirmedAt ? 'Potwierdzenie: ' + exactDate(item.confirmedAt) : null, item.unsubscribedAt ? 'Wypis: ' + exactDate(item.unsubscribedAt) : null].filter(Boolean).join('\n');
    li.append(
      h('span', { class: 'sub__email' }, item.email ? h('a', { href: 'mailto:' + item.email }, item.email) : '—'),
      h('span', { class: 'sub__status' },
        h('span', { class: 'pill pill--' + st.slug }, st.pill),
        st.key === 'pending' ? h('span', { class: 'sub__note' }, 'czeka na potwierdzenie') : null
      ),
      h('span', { class: 'sub__meta' },
        h('span', { class: 'sub__source' }, h('span', { class: 'badge' }, nlSourceLabel(item.source))),
        h('span', { class: 'sub__lang' }, langPill(item.lang)),
        h('span', { class: 'sub__date', title: whenTitle }, relTime(when))
      ),
      del
    );
    return li;
  }
  function removeSub(id) {
    const S = state.newsletter.subs;
    const idx = S.items.findIndex((x) => String(x.id) === String(id));
    if (idx < 0) return;
    const gone = S.items.splice(idx, 1)[0];
    S.total = Math.max(0, S.total - 1);
    if (gone.status && typeof S.counts[gone.status] === 'number' && S.counts[gone.status] > 0) S.counts[gone.status]--;
    renderSubs();
  }
  NL.q.addEventListener('input', debounce(() => {
    const v = NL.q.value.trim();
    if (v === state.newsletter.subs.q) return;
    state.newsletter.subs.q = v;
    loadSubs();
  }, 300));
  NL.q.addEventListener('search', () => { const v = NL.q.value.trim(); if (v !== state.newsletter.subs.q) { state.newsletter.subs.q = v; loadSubs(); } });
  NL.subsMore.addEventListener('click', () => loadSubs({ append: true }));

  NL.addForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = NL.addEmail.value.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { toast('Wpisz poprawny adres e-mail.', 'error'); NL.addEmail.focus(); return; }
    NL.addSubmit.disabled = true; NL.addSubmit.setAttribute('aria-busy', 'true');
    try {
      const d = await api('/api/admin/newsletter/subscribers', { method: 'POST', body: { email: email, lang: postLang(NL.addLang.value) } });
      const item = d && d.item ? d.item : { id: email, email: email, status: 'active', source: 'admin', lang: postLang(NL.addLang.value), createdAt: new Date().toISOString() };
      const S = state.newsletter.subs;
      if (typeof S.counts.active === 'number') S.counts.active++; else S.counts.active = 1;
      if ((S.status === 'all' || S.status === item.status) && !S.q) { S.items.unshift(item); S.total++; }
      renderSubs();
      NL.addEmail.value = '';
      toast('Dodano ' + item.email + '.');
      NL.addEmail.focus();
    } catch (e) {
      if (e.status !== 401) toast(e.status === 409 ? (e.message || 'Ten adres już jest na liście.') : e.message, 'error');
    } finally {
      NL.addSubmit.disabled = false; NL.addSubmit.removeAttribute('aria-busy');
    }
  });

  NL.importBtn.addEventListener('click', async () => {
    NL.importBtn.disabled = true; NL.importBtn.setAttribute('aria-busy', 'true');
    NL.importResult.textContent = 'Importuję…';
    try {
      const d = await api('/api/admin/newsletter/subscribers/import-magnet', { method: 'POST', body: {} });
      const added = Number(d.added) || 0, skipped = Number(d.skipped) || 0;
      NL.importResult.textContent = added
        ? 'Dodano ' + added + ' ' + plural(added, 'adres', 'adresy', 'adresów') + (skipped ? ', pominięto ' + skipped + ' (już na liście albo bez zgody).' : '.')
        : 'Nic nowego: ' + (skipped ? skipped + ' ' + plural(skipped, 'osoba', 'osoby', 'osób') + ' już na liście albo bez zgody.' : 'brak zapisów ze zgodą marketingową.');
      if (added) { toast('Zaimportowano ' + added + ' ' + plural(added, 'adres', 'adresy', 'adresów') + '.'); loadSubs(); }
    } catch (e) {
      NL.importResult.textContent = '';
      if (e.status !== 401) toast(e.message, 'error');
    } finally {
      NL.importBtn.disabled = false; NL.importBtn.removeAttribute('aria-busy');
    }
  });

  /* ---------------------------------------------------------------------------
     Newsletter — kampanie (lista)
     ------------------------------------------------------------------------- */
  async function loadCamps() {
    const C = state.newsletter.camps;
    const req = ++C.req;
    clear(NL.campsList);
    renderState(NL.campsState, 'loading');
    try {
      const data = await api('/api/admin/newsletter/campaigns');
      if (req !== C.req) return;
      C.items = Array.isArray(data.items) ? data.items : [];
      renderCamps();
    } catch (e) {
      if (req !== C.req || e.status === 401) return;
      renderState(NL.campsState, 'error', 'Nie udało się pobrać kampanii', e.message, () => loadCamps());
    }
  }
  function renderCamps() {
    const C = state.newsletter.camps;
    clear(NL.campsList);
    C.items.forEach((it) => NL.campsList.append(campRow(it)));
    if (!C.items.length) {
      renderState(NL.campsState, 'empty', 'Jeszcze żadnej kampanii.', '„Nowa kampania” to pusty szkic do wypełnienia. „Z nowych wpisów” sam zbierze to, co opublikowałeś od ostatniej wysyłki.');
      NL.campsState.append(h('a', { class: 'btn btn--primary btn--sm', href: '#newsletter/kampania/nowa' }, 'Nowa kampania'));
    } else hide(NL.campsState);
  }
  function campStatsText(it) {
    const s = isObj(it.stats) ? it.stats : {};
    const n = (v) => Number(v) || 0;
    const wrap = h('span', { class: 'camp-row__stats' });
    if (it.status === 'draft') { wrap.append(h('span', { class: 'post__none' }, (Array.isArray(it.postIds) ? it.postIds.length : 0) + ' ' + postsWord(Array.isArray(it.postIds) ? it.postIds.length : 0) + ' · szkic')); return wrap; }
    wrap.append(
      h('span', null, 'wysłane ', h('b', null, String(n(s.sent)) + (it.status === 'sending' ? ' / ' + n(s.recipients) : ''))),
      h('span', { class: 'camp-row__sep', 'aria-hidden': 'true' }, ' · '),
      h('span', { class: n(s.failed) ? 'is-bad' : null }, 'nieudane ', h('b', null, String(n(s.failed)))),
      h('span', { class: 'camp-row__sep', 'aria-hidden': 'true' }, ' · '),
      h('span', null, 'kliknięcia ', h('b', null, String(n(s.clicks))))
    );
    return wrap;
  }
  function campRow(item) {
    const st = campStatusInfo(item.status);
    const href = '#newsletter/kampania/' + encodeURIComponent(item.id);
    const li = h('li', { class: 'camp-row camp-row--' + st.slug, dataset: { id: item.id } });
    li.addEventListener('click', (ev) => {
      if (ev.target.closest('a, button, .confirm')) return;
      location.hash = href;
    });
    const nPosts = Array.isArray(item.postIds) ? item.postIds.length : 0;
    const when = item.sentAt || item.createdAt;
    let delBtn = null;
    if (st.slug === 'draft') {
      delBtn = h('button', { class: 'btn btn--ghost btn--sm camp-row__del', type: 'button', 'aria-label': 'Usuń szkic ' + (item.subject || '') }, 'Usuń');
      delBtn.addEventListener('click', () => {
        confirmInline(li, delBtn, 'Usunąć ten szkic? Nie da się tego cofnąć.', async () => {
          await api('/api/admin/newsletter/campaigns/' + encodeURIComponent(item.id), { method: 'DELETE' });
          const idx = state.newsletter.camps.items.findIndex((x) => String(x.id) === String(item.id));
          if (idx >= 0) state.newsletter.camps.items.splice(idx, 1);
          renderCamps();
          toast('Usunięto szkic.');
        });
      });
    }
    li.append(
      h('span', { class: 'camp-row__main' },
        h('a', { class: 'camp-row__subject', href: href }, item.subject || 'Bez tematu'),
        h('span', { class: 'camp-row__sub' }, nPosts + ' ' + postsWord(nPosts) + (item.intro ? ' · ze wstępem' : ''))
      ),
      h('span', { class: 'camp-row__status' }, h('span', { class: 'pill pill--' + st.slug }, st.label)),
      h('span', { class: 'camp-row__meta' },
        h('span', { class: 'camp-row__lang' }, langPill(item.lang)),
        h('span', { class: 'camp-row__date', title: (item.sentAt ? 'Wysłana: ' : 'Utworzona: ') + exactDate(when) }, relTime(when))
      ),
      campStatsText(item),
      delBtn || h('span')
    );
    return li;
  }
  NL.digest.addEventListener('click', async () => {
    NL.digest.disabled = true; NL.digest.setAttribute('aria-busy', 'true');
    try {
      const d = await api('/api/admin/newsletter/digest', { method: 'POST', body: { lang: postLang(NL.digestLang.value) } });
      const item = d && d.item ? d.item : null;
      if (!item || item.id == null) throw new ApiError('Serwer nie zwrócił szkicu.', 0, null);
      toast('Szkic z nowych wpisów gotowy — sprawdź i wyślij.');
      location.hash = '#newsletter/kampania/' + encodeURIComponent(item.id);
    } catch (e) {
      if (e.status === 401) return;
      if (e.status === 409) toast(e.message || 'Nie ma nowych wpisów od ostatniej wysyłki.', 'info');
      else toast(e.message, 'error');
    } finally {
      NL.digest.disabled = false; NL.digest.removeAttribute('aria-busy');
    }
  });

  /* ---------------------------------------------------------------------------
     Newsletter — edytor kampanii
     ------------------------------------------------------------------------- */
  const EMPTY_CAMP = { subject: '', intro: '', postIds: [], lang: 'pl', status: 'draft', stats: { recipients: 0, sent: 0, failed: 0, clicks: 0 } };
  function campReset() {
    const C = state.newsletter.camp;
    stopCampPoll();
    C.id = null; C.item = null; C.posts = []; C.rawIds = {}; C.selected = []; C.base = null; C.saving = false; C.activeN = null; C.savedAt = null;
    C.req++; C.postsReq++;
  }
  function campStatus() { const C = state.newsletter.camp; return C.item ? String(C.item.status || 'draft') : 'draft'; }
  function campReadOnly() { return campStatus() !== 'draft'; }

  async function openCampaign(id) {
    campReset();
    const C = state.newsletter.camp;
    C.id = id == null ? null : String(id);
    hide(NLC.form); hide(NLC.mailwarn); hide(NLC.previewWrap);
    NLC.form.classList.remove('has-preview');
    NLC.iframe.removeAttribute('srcdoc');
    NL.h1.textContent = C.id ? 'Kampania' : 'Nowa kampania';
    setDocTitle();
    renderState(NLC.state, 'loading', null, C.id ? 'Pobieram kampanię…' : 'Przygotowuję…');
    const req = C.req;
    const optional = (e) => { if (e.status === 401) throw e; return null; };
    try {
      const [camp, subs, settings] = await Promise.all([
        C.id ? api('/api/admin/newsletter/campaigns/' + encodeURIComponent(C.id)) : Promise.resolve({ item: clone(EMPTY_CAMP) }),
        api('/api/admin/newsletter/subscribers' + qs({ status: 'active', limit: 1, offset: 0 })).catch(optional),
        api('/api/admin/newsletter/settings').catch(optional)
      ]);
      if (req !== C.req || state.newsletter.tab !== 'editor') return;
      const item = camp && camp.item ? camp.item : (camp && camp.id != null ? camp : null);
      if (!item) { renderState(NLC.state, 'error', 'Nie udało się pobrać kampanii', 'Serwer nie zwrócił kampanii.', () => openCampaign(C.id)); return; }
      C.activeN = subs && isObj(subs.counts) ? (Number(subs.counts.active) || 0) : null;
      if (subs && isObj(subs.counts)) updateNlBadge(subs.counts.active);
      if (settings) state.newsletter.settings.data = settings;
      finishCampLoad(item);
    } catch (e) {
      if (req !== C.req || state.newsletter.tab !== 'editor' || e.status === 401) return;
      renderState(NLC.state, 'error', e.status === 404 ? 'Nie ma takiej kampanii' : 'Nie udało się pobrać kampanii', e.message, e.status === 404 ? null : () => openCampaign(C.id));
      if (e.status === 404) NLC.state.append(h('a', { class: 'btn btn--ghost btn--sm', href: '#newsletter/kampanie' }, 'Wróć do kampanii'));
    }
  }
  function finishCampLoad(item) {
    const C = state.newsletter.camp;
    C.item = item;
    C.id = item.id != null ? String(item.id) : null;
    C.rawIds = {};
    C.selected = (Array.isArray(item.postIds) ? item.postIds : []).map((id) => { const s = String(id); C.rawIds[s] = id; return s; });
    NLC.subject.value = item.subject || '';
    NLC.lang.value = postLang(item.lang);
    NLC.intro.value = item.intro || '';
    C.base = snapshotCamp();
    hide(NLC.state);
    show(NLC.form);
    NL.h1.textContent = C.id ? (item.subject || 'Kampania') : 'Nowa kampania';
    setDocTitle();
    // Przyciski mogły zostać schowane przez confirmInline w poprzedniej kampanii — wracają na start.
    show(NLC.send); show(NLC.del);
    $$('.confirm', NLC.form).forEach((box) => box.remove());
    applyCampMode();
    renderCampStats();
    updateCampButtons();
    updateCampSaveState();
    loadCampPosts();
    const st = state.newsletter.settings.data;
    if (st && st.mailConfigured === false && !campReadOnly()) showMailWarn(null);
    if (campStatus() === 'sending') startCampPoll();
    if (!C.id) setTimeout(() => { try { if (!NLC.form.contains(document.activeElement)) NLC.subject.focus(); } catch (e) { /* noop */ } }, 30);
  }
  function collectCamp() {
    const C = state.newsletter.camp;
    return {
      subject: NLC.subject.value.trim(),
      intro: NLC.intro.value,
      postIds: C.selected.map((s) => (C.rawIds[s] !== undefined ? C.rawIds[s] : (/^\d+$/.test(s) ? Number(s) : s))),
      lang: postLang(NLC.lang.value)
    };
  }
  function snapshotCamp() { return JSON.stringify(collectCamp()); }
  function isCampDirty() { const C = state.newsletter.camp; return C.base != null && !NLC.form.hidden && snapshotCamp() !== C.base; }
  function updateCampSaveState() {
    const C = state.newsletter.camp;
    const el = NLC.saveState;
    let text = '', dirty = false;
    if (campReadOnly()) text = '';
    else if (C.saving) text = 'Zapisywanie…';
    else if (isCampDirty()) { text = 'Niezapisane zmiany'; dirty = true; }
    else if (C.savedAt) text = 'Zapisano ' + fmtClock.format(C.savedAt);
    else if (C.item && C.id && C.item.createdAt) text = 'Szkic z ' + relTime(C.item.createdAt);
    else if (C.item && !C.id) text = 'Jeszcze niezapisana';
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('is-dirty', dirty);
    el.classList.toggle('is-busy', !!C.saving);
  }
  function onCampInput() { updateCampSaveState(); }
  /** Szkic = edycja; wysyłka/wysłana = tylko do odczytu ze statystykami. */
  function applyCampMode() {
    const ro = campReadOnly();
    NLC.form.classList.toggle('is-readonly', ro);
    [NLC.subject, NLC.lang, NLC.intro].forEach((el) => { el.disabled = ro; });
    if (ro) hide(NLC.sendcard); else show(NLC.sendcard);
  }
  function updateCampButtons() {
    const C = state.newsletter.camp;
    const ro = campReadOnly();
    NLC.save.hidden = ro;
    if (C.id && !ro) show(NLC.danger); else hide(NLC.danger);
    const n = C.activeN;
    if (n == null) { NLC.send.textContent = 'Wyślij do aktywnych'; NLC.send.disabled = false; NLC.sendHint.textContent = 'Nie udało się policzyć aktywnych subskrybentów — serwer policzy ich sam przy wysyłce.'; }
    else if (n === 0) { NLC.send.textContent = 'Wyślij do 0 aktywnych'; NLC.send.disabled = true; NLC.sendHint.textContent = 'Nikogo jeszcze nie ma na liście aktywnych — nie ma do kogo wysłać.'; }
    else { NLC.send.textContent = 'Wyślij do ' + n + ' aktywnych'; NLC.send.disabled = false; NLC.sendHint.textContent = n + ' to wszyscy aktywni — mail pójdzie do tych z językiem „' + (postLang(NLC.lang.value) === 'en' ? 'English' : 'Polski') + '”, resztę serwer pominie. Tego nie da się cofnąć.'; }
  }
  function renderCampStats() {
    const C = state.newsletter.camp;
    const it = C.item || {};
    const st = campStatus();
    if (st === 'draft') { hide(NLC.stats); hide(NLC.progress); return; }
    const s = isObj(it.stats) ? it.stats : {};
    const n = (v) => Number(v) || 0;
    clear(NLC.stats);
    NLC.stats.append(
      h('p', { class: 'camp__sentline' }, st === 'sent' ? 'Wysłana ' + exactDate(it.sentAt || it.updatedAt || it.createdAt) + '. Treść jest już tylko do odczytu.' : 'Wysyłka w toku — statystyki odświeżają się same.'),
      h('div', { class: 'tiles' },
        tile('Odbiorcy', n(s.recipients), subsWord(n(s.recipients))),
        tile('Wysłane', n(s.sent), 'dostarczone do skrzynek', 'ok'),
        tile('Nieudane', n(s.failed), n(s.failed) ? 'odbite albo błąd' : 'bez problemów', n(s.failed) ? 'signal' : null),
        tile('Kliknięcia', n(s.clicks), 'w linki z maila')
      )
    );
    show(NLC.stats);
    if (st === 'sending') {
      const done = n(s.sent) + n(s.failed), total = Math.max(n(s.recipients), done, 1);
      NLC.progressLabel.textContent = 'Wysyłam…';
      NLC.progressN.textContent = done + ' / ' + n(s.recipients);
      NLC.progressFill.style.width = Math.max(2, Math.round(done / total * 100)) + '%';
      show(NLC.progress);
    } else hide(NLC.progress);
  }

  // --- Wpisy do wyboru ----------------------------------------------------------------
  async function loadCampPosts() {
    const C = state.newsletter.camp;
    const lang = postLang(NLC.lang.value);
    const req = ++C.postsReq;
    C.posts = [];
    renderPicks();
    renderState(NLC.picksState, 'loading', null, 'Pobieram opublikowane wpisy…');
    try {
      const d = await api('/api/admin/posts' + qs({ status: 'published', lang: lang, limit: 50, offset: 0 }));
      if (req !== C.postsReq) return;
      C.posts = Array.isArray(d.items) ? d.items : [];
      C.posts.forEach((p) => { C.rawIds[String(p.id)] = p.id; });
      renderPicks();
      if (!C.posts.length && !C.selected.length) renderState(NLC.picksState, 'empty', 'Brak opublikowanych wpisów ' + (lang === 'en' ? 'po angielsku' : 'po polsku') + '.', 'Mail może iść z samym wstępem, ale zwykle lepiej mieć w nim choć jeden wpis.');
      else hide(NLC.picksState);
    } catch (e) {
      if (req !== C.postsReq || e.status === 401) return;
      renderState(NLC.picksState, 'error', 'Nie udało się pobrać wpisów', e.message, () => loadCampPosts());
    }
  }
  function renderPicks(focusId) {
    const C = state.newsletter.camp;
    clear(NLC.picks);
    const known = new Set(C.posts.map((p) => String(p.id)));
    C.selected.filter((id) => !known.has(id)).forEach((id) => NLC.picks.append(pickRow({ id: id, title: 'Wpis #' + id, missing: true })));
    C.posts.forEach((p) => NLC.picks.append(pickRow(p)));
    NLC.picksCount.textContent = C.selected.length ? 'Wybrano: ' + C.selected.length : '';
    if (focusId != null) { const cb = $('#pick-' + CSS.escape(String(focusId))); if (cb) cb.focus(); }
  }
  function pickRow(p) {
    const C = state.newsletter.camp;
    const id = String(p.id);
    const idx = C.selected.indexOf(id);
    const ro = campReadOnly();
    const cb = h('input', { type: 'checkbox', class: 'pick__cb', id: 'pick-' + id, checked: idx >= 0, disabled: ro });
    cb.addEventListener('change', () => togglePick(id, cb.checked));
    const when = postDate(p);
    const meta = p.missing
      ? 'Niedostępny: nieopublikowany albo w innym języku — odznacz, jeśli nie ma iść.'
      : [when ? fmtShortYear.format(toDate(when)) : null, p.category || null, p.readingMin ? readingLabel(p.readingMin) : null].filter(Boolean).join(' · ');
    return h('li', { class: 'pick' + (idx >= 0 ? ' is-on' : '') + (ro ? ' is-off' : '') + (p.missing ? ' pick--missing' : ''), dataset: { id: id } },
      h('label', { class: 'pick__row', for: 'pick-' + id },
        cb,
        h('span', { class: 'pick__n', 'aria-hidden': 'true' }, idx >= 0 ? String(idx + 1) : ''),
        postThumb(p),
        h('span', { class: 'pick__main' },
          h('span', { class: 'pick__title' }, p.title || 'Bez tytułu'),
          h('span', { class: 'pick__meta' }, meta)
        )
      )
    );
  }
  function togglePick(id, on) {
    const C = state.newsletter.camp;
    const i = C.selected.indexOf(id);
    if (on && i < 0) C.selected.push(id);
    else if (!on && i >= 0) C.selected.splice(i, 1);
    renderPicks(id);
    onCampInput();
  }
  NLC.subject.addEventListener('input', () => { onCampInput(); });
  NLC.intro.addEventListener('input', onCampInput);
  NLC.lang.addEventListener('change', () => {
    const C = state.newsletter.camp;
    if (C.selected.length) toast('Zmiana języka czyści wybór wpisów.', 'info');
    C.selected = [];
    loadCampPosts();
    updateCampButtons();
    onCampInput();
  });

  // --- Zapis / podgląd / test / wysyłka ----------------------------------------------------
  function setCampBusy(on) {
    [NLC.save, NLC.previewBtn, NLC.test, NLC.send].forEach((b) => { if (on) { b.disabled = true; b.setAttribute('aria-busy', 'true'); } else { b.disabled = false; b.removeAttribute('aria-busy'); } });
    if (!on) updateCampButtons();
  }
  /** Zwraca true po udanym zapisie (albo gdy nie było co zapisywać). */
  async function saveCamp(opts) {
    opts = opts || {};
    const C = state.newsletter.camp;
    if (C.saving || NLC.form.hidden || campReadOnly()) return false;
    if (C.id && !isCampDirty() && !opts.force) return true;
    const data = collectCamp();
    if (!data.subject) { toast('Wpisz temat maila.', 'error'); NLC.subject.focus(); return false; }
    C.saving = true; setCampBusy(true); updateCampSaveState();
    const wasNew = !C.id;
    try {
      const d = wasNew
        ? await api('/api/admin/newsletter/campaigns', { method: 'POST', body: data })
        : await api('/api/admin/newsletter/campaigns/' + encodeURIComponent(C.id), { method: 'PUT', body: data });
      const item = d && d.item ? d.item : Object.assign({}, C.item || {}, data, { id: C.id });
      if (state.newsletter.tab !== 'editor') return true;
      C.item = item;
      C.id = item.id != null ? String(item.id) : C.id;
      C.base = snapshotCamp();
      C.savedAt = new Date();
      NL.h1.textContent = item.subject || 'Kampania';
      if (wasNew && C.id) { state.param = 'kampania/' + C.id; history.replaceState(null, '', '#newsletter/kampania/' + encodeURIComponent(C.id)); }
      setDocTitle();
      updateCampButtons();
      updateCampSaveState();
      if (!opts.quiet) toast('Zapisano szkic.');
      return true;
    } catch (e) {
      if (e.status !== 401) toast(e.message, 'error');
      return false;
    } finally {
      C.saving = false; setCampBusy(false); updateCampSaveState();
    }
  }
  /** Zapisuje przed akcją, która wymaga zapisanego szkicu. */
  async function ensureCampSaved() {
    const C = state.newsletter.camp;
    if (campReadOnly()) return !!C.id;
    if (C.id && !isCampDirty()) return true;
    return saveCamp({ quiet: true });
  }
  function showMailWarn(msg) {
    NLC.mailwarnText.textContent = (msg || 'Wysyłka maili nie jest skonfigurowana.') + ' Ustaw zmienne MAIL_* w pliku .env na serwerze (SMTP albo Brevo) i zrestartuj backend. Szkice i podgląd działają bez tego.';
    show(NLC.mailwarn);
  }
  async function previewCamp() {
    const C = state.newsletter.camp;
    if (!(await ensureCampSaved())) return;
    NLC.previewBtn.disabled = true; NLC.previewBtn.setAttribute('aria-busy', 'true');
    show(NLC.previewWrap);
    NLC.form.classList.add('has-preview');
    NLC.previewState.textContent = 'Renderuję…';
    const id = C.id;
    try {
      const d = await api('/api/admin/newsletter/campaigns/' + encodeURIComponent(id) + '/preview', { method: 'POST', body: {} });
      if (C.id !== id || state.newsletter.tab !== 'editor') return;
      // Pełny dokument maila z własnego serwera; iframe ma sandbox="" (zero skryptów, zero dostępu do panelu).
      NLC.iframe.srcdoc = typeof d.html === 'string' ? d.html : '';
      NLC.previewState.textContent = d.subject ? 'Temat: ' + d.subject : '';
      if (window.innerWidth <= 1100) { try { NLC.previewWrap.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* noop */ } }
    } catch (e) {
      if (e.status === 401) return;
      NLC.previewState.textContent = 'Podgląd niedostępny: ' + e.message;
      toast(e.message, 'error');
    } finally {
      NLC.previewBtn.disabled = false; NLC.previewBtn.removeAttribute('aria-busy');
    }
  }
  NLC.save.addEventListener('click', () => saveCamp({ force: true }));
  NLC.previewBtn.addEventListener('click', () => previewCamp());
  NLC.form.addEventListener('submit', (ev) => { ev.preventDefault(); if (!campReadOnly()) saveCamp({ force: true }); });
  NLC.widths.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-w]');
    if (!btn) return;
    const w = Number(btn.dataset.w) || 600;
    state.newsletter.camp.width = w;
    NLC.mailframe.style.setProperty('--mail-w', w + 'px');
    $$('button[data-w]', NLC.widths).forEach((b) => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
  });
  NLC.test.addEventListener('click', async () => {
    const C = state.newsletter.camp;
    const to = NLC.testTo.value.trim();
    if (!EMAIL_RE.test(to)) { toast('Wpisz adres, na który ma pójść test.', 'error'); NLC.testTo.focus(); return; }
    if (!(await ensureCampSaved())) return;
    NLC.test.disabled = true; NLC.test.setAttribute('aria-busy', 'true');
    try {
      await api('/api/admin/newsletter/campaigns/' + encodeURIComponent(C.id) + '/test', { method: 'POST', body: { to: to } });
      hide(NLC.mailwarn);
      toast('Testowy mail poszedł na ' + to + '.');
    } catch (e) {
      if (e.status === 401) return;
      if (e.status === 503) showMailWarn(e.message);
      toast(e.message, 'error');
    } finally {
      NLC.test.disabled = false; NLC.test.removeAttribute('aria-busy');
    }
  });
  NLC.send.addEventListener('click', () => {
    const C = state.newsletter.camp;
    if (campReadOnly()) return;
    const data = collectCamp();
    if (!data.subject) { toast('Wpisz temat maila.', 'error'); NLC.subject.focus(); return; }
    if (!data.postIds.length && !data.intro.trim()) { toast('Pusty mail? Dodaj wstęp albo zaznacz chociaż jeden wpis.', 'error'); return; }
    const n = C.activeN;
    const who = n == null ? 'wszystkich aktywnych subskrybentów' : n + ' ' + plural(n, 'aktywnego subskrybenta', 'aktywnych subskrybentów', 'aktywnych subskrybentów');
    confirmInline(NLC.senddanger, NLC.send, 'Wysłać „' + (data.subject || 'bez tematu') + '” do ' + who + '? Tego nie da się cofnąć.', async () => {
      if (!(await ensureCampSaved())) throw new ApiError('Najpierw zapisz szkic.', 0, null);
      let d;
      try {
        d = await api('/api/admin/newsletter/campaigns/' + encodeURIComponent(C.id) + '/send', { method: 'POST', body: {} });
      } catch (e) {
        if (e.status === 503) showMailWarn(e.message);
        throw e;
      }
      if (state.newsletter.tab !== 'editor') return;
      hide(NLC.mailwarn);
      const recipients = Number(d && d.recipients) || n || 0;
      C.item = Object.assign({}, C.item, { status: 'sending', stats: { recipients: recipients, sent: 0, failed: 0, clicks: 0 } });
      C.base = snapshotCamp();
      applyCampMode();
      renderPicks();
      renderCampStats();
      updateCampButtons();
      updateCampSaveState();
      toast('Wysyłka ruszyła do ' + recipients + ' ' + subsWord(recipients) + '.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      startCampPoll();
    }, { yes: 'Tak, wyślij', kind: 'primary' });
  });
  function startCampPoll() {
    stopCampPoll();
    const C = state.newsletter.camp;
    const id = C.id;
    if (!id) return;
    const tick = async () => {
      C.poll = 0;
      if (state.view !== 'newsletter' || state.newsletter.tab !== 'editor' || C.id !== id) return;
      try {
        const d = await api('/api/admin/newsletter/campaigns/' + encodeURIComponent(id));
        const item = d && d.item ? d.item : d;
        if (state.view !== 'newsletter' || state.newsletter.tab !== 'editor' || C.id !== id) return;
        if (item && isObj(item)) C.item = Object.assign({}, C.item, item);
        renderCampStats();
        if (campStatus() === 'sending') { C.poll = setTimeout(tick, 2000); return; }
        applyCampMode();
        renderPicks();
        updateCampButtons();
        updateCampSaveState();
        const s = isObj(C.item.stats) ? C.item.stats : {};
        const sent = Number(s.sent) || 0;
        toast('Gotowe: wysłano ' + sent + ' ' + plural(sent, 'mail', 'maile', 'maili') + (Number(s.failed) ? ', nieudanych ' + Number(s.failed) : '') + '.');
      } catch (e) {
        if (e.status === 401) return;
        if (state.newsletter.tab === 'editor' && C.id === id) C.poll = setTimeout(tick, 4000);
      }
    };
    C.poll = setTimeout(tick, 2000);
  }
  function stopCampPoll() {
    const C = state.newsletter.camp;
    if (C.poll) { clearTimeout(C.poll); C.poll = 0; }
  }
  NLC.del.addEventListener('click', () => {
    const C = state.newsletter.camp;
    if (!C.id || campReadOnly()) return;
    confirmInline(NLC.danger, NLC.del, 'Usunąć ten szkic? Nie da się tego cofnąć.', async () => {
      const id = C.id;
      await api('/api/admin/newsletter/campaigns/' + encodeURIComponent(id), { method: 'DELETE' });
      const idx = state.newsletter.camps.items.findIndex((x) => String(x.id) === String(id));
      if (idx >= 0) state.newsletter.camps.items.splice(idx, 1);
      C.base = null;
      location.hash = '#newsletter/kampanie';
      toast('Usunięto szkic.');
    });
  });

  /* ---------------------------------------------------------------------------
     Newsletter — ustawienia
     ------------------------------------------------------------------------- */
  const WEEKDAYS = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
  WEEKDAYS.forEach((d, i) => NLS.weekday.append(h('option', { value: String(i + 1) }, d)));
  for (let hr = 0; hr < 24; hr++) NLS.hour.append(h('option', { value: String(hr) }, String(hr).padStart(2, '0') + ':00'));
  const PROVIDERS = { smtp: 'SMTP', brevo: 'Brevo', outbox: 'Outbox (tryb testowy: maile lądują jako pliki .eml na serwerze)' };

  async function loadNlSettings() {
    const S = state.newsletter.settings;
    const req = ++S.req;
    hide(NLS.form);
    renderState(NLS.state, 'loading');
    try {
      const d = await api('/api/admin/newsletter/settings');
      if (req !== S.req) return;
      S.data = d;
      S.original = clone(d);
      fillNlSettings(d);
      hide(NLS.state);
      show(NLS.form);
    } catch (e) {
      if (req !== S.req || e.status === 401) return;
      renderState(NLS.state, 'error', 'Nie udało się pobrać ustawień', e.message, () => loadNlSettings());
    }
  }
  function fillNlSettings(d) {
    const a = isObj(d.auto) ? d.auto : {};
    NLS.enabled.checked = !!a.enabled;
    NLS.weekday.value = String(Math.min(7, Math.max(1, Number(a.weekday) || 1)));
    NLS.hour.value = String(Math.min(23, Math.max(0, Number(a.hour) || 0)));
    NLS.minPosts.value = String(Math.max(1, Number(a.minPosts) || 1));
    NLS.fromName.value = d.fromName || '';
    NLS.replyTo.value = d.replyTo || '';
    const prov = PROVIDERS[String(d.provider || '').toLowerCase()];
    if (d.mailConfigured && prov) { NLS.provider.textContent = prov + ' — skonfigurowana, maile wychodzą.'; NLS.provider.className = 'static is-ok'; }
    else { NLS.provider.textContent = 'Nie skonfigurowana — ustaw MAIL_* w .env na serwerze (SMTP albo Brevo) i zrestartuj backend. Do tego czasu kampanie da się tylko przygotować i podejrzeć.'; NLS.provider.className = 'static is-warn'; }
    NLS.last.textContent = d.lastDigestAt ? exactDate(d.lastDigestAt) + ' (' + relTime(d.lastDigestAt) + ')' : 'Jeszcze nie było.';
    markNlDirty();
  }
  function collectNlSettings() {
    return {
      auto: { enabled: !!NLS.enabled.checked, weekday: Number(NLS.weekday.value) || 1, hour: Number(NLS.hour.value) || 0, minPosts: Math.max(1, Math.round(Number(NLS.minPosts.value) || 1)) },
      fromName: NLS.fromName.value.trim(),
      replyTo: NLS.replyTo.value.trim()
    };
  }
  function nlSettingsBase(d) {
    d = d || {};
    const a = isObj(d.auto) ? d.auto : {};
    return { auto: { enabled: !!a.enabled, weekday: Number(a.weekday) || 1, hour: Number(a.hour) || 0, minPosts: Math.max(1, Number(a.minPosts) || 1) }, fromName: String(d.fromName || ''), replyTo: String(d.replyTo || '') };
  }
  function markNlDirty() {
    const S = state.newsletter.settings;
    const dirty = !!S.original && JSON.stringify(collectNlSettings()) !== JSON.stringify(nlSettingsBase(S.original));
    NLS.hint.textContent = dirty ? 'Niezapisane zmiany.' : 'Zmiany zapisują się dopiero po kliknięciu „Zapisz”.';
    NLS.hint.classList.toggle('is-dirty', dirty);
  }
  [NLS.enabled, NLS.weekday, NLS.hour, NLS.minPosts, NLS.fromName, NLS.replyTo].forEach((el) => { el.addEventListener('input', markNlDirty); el.addEventListener('change', markNlDirty); });
  NLS.form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const body = collectNlSettings();
    if (body.replyTo && !EMAIL_RE.test(body.replyTo)) { toast('Reply-to nie wygląda na adres e-mail.', 'error'); NLS.replyTo.focus(); return; }
    NLS.save.disabled = true; NLS.save.setAttribute('aria-busy', 'true');
    try {
      const d = await api('/api/admin/newsletter/settings', { method: 'PUT', body: body });
      const merged = isObj(d) && (d.auto || d.provider != null) ? d : Object.assign({}, state.newsletter.settings.original || {}, body);
      state.newsletter.settings.data = merged;
      state.newsletter.settings.original = clone(merged);
      fillNlSettings(merged);
      toast('Zapisano.');
    } catch (e) {
      if (e.status !== 401) toast(e.message, 'error');
    } finally {
      NLS.save.disabled = false; NLS.save.removeAttribute('aria-busy');
    }
  });
  NLS.reset.addEventListener('click', () => loadNlSettings());

  /* ---------------------------------------------------------------------------
     Start
     ------------------------------------------------------------------------- */
  window.addEventListener('error', (ev) => {
    // Nigdy nie zostawiamy pustej strony: jeśli coś wybuchnie przed renderem, pokaż login z notatką.
    if (els.boot && !els.boot.hidden) showLogin('Coś poszło nie tak przy starcie panelu: ' + (ev.message || 'nieznany błąd'));
  });
  boot();

  // Mały publiczny uchwyt do debugowania w konsoli (bez danych wrażliwych).
  window.TSAdmin = { esc: esc, slugify: slugify, reload: () => state.view && VIEWS[state.view].load(), version: '1.2.0' };
})();
