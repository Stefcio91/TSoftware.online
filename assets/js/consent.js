/* TSoftware — consent.js
   Zgody na pliki cookie i śledzenie, zgodnie z RODO / ePrivacy / Google
   Consent Mode v2. Ładowany jako pierwszy skrypt. Domyślnie wszystko, co
   nie jest niezbędne, jest ODRZUCONE. Skrypty reklamowe (GTM, Meta Pixel)
   wczytują się dopiero po zgodzie i tylko wtedy, gdy w panelu są wpisane ID.
   Analityka bez ciasteczek (Plausible) nie potrzebuje zgody i ładuje się,
   gdy jest włączona w panelu. */
(function () {
  "use strict";

  var KEY = "ts-consent", POLICY = "2026-10", DAYS = 365;
  var CATS = ["analytics", "marketing"];
  var SIGNALS = {
    analytics: ["analytics_storage"],
    marketing: ["ad_storage", "ad_user_data", "ad_personalization"]
  };

  /* ---------- Consent Mode: domyślne wartości zanim ruszy cokolwiek ---------- */
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  var DEFAULTS = {
    ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
    analytics_storage: "denied", functionality_storage: "granted", security_storage: "granted",
    personalization_storage: "denied", wait_for_update: 500
  };
  gtag("consent", "default", DEFAULTS);
  gtag("set", "ads_data_redaction", true);
  gtag("set", "url_passthrough", false);

  /* ---------- Stan ---------- */
  var tools = { gtmId: "", metaPixelId: "", plausible: false };
  var state = load();
  var loaded = { gtm: false, meta: false, plausible: false };
  var ui = null;

  function now() { return new Date(); }
  function gpc() {
    try { return navigator.globalPrivacyControl === true || navigator.doNotTrack === "1" || window.doNotTrack === "1"; } catch (e) { return false; }
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      if (raw === "1") { localStorage.removeItem(KEY); return null; } /* stary format: tylko „rozumiem” */
      var o = JSON.parse(raw);
      if (!o || o.v !== 1 || o.policy !== POLICY || !o.selection || !o.expiresAt || new Date(o.expiresAt) < now()) { localStorage.removeItem(KEY); return null; }
      return o;
    } catch (e) { return null; }
  }
  function save(selection, source) {
    var t = now();
    var o = { v: 1, policy: POLICY, createdAt: (state && state.createdAt) || t.toISOString(), updatedAt: t.toISOString(),
      expiresAt: new Date(t.getTime() + DAYS * 864e5).toISOString(), source: source || "user_action",
      selection: { necessary: true, analytics: !!selection.analytics, marketing: !!selection.marketing } };
    state = o;
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
    return o;
  }
  function has(cat) { return cat === "necessary" ? true : !!(state && state.selection && state.selection[cat]); }
  function needsConsent() { return !!(tools.gtmId || tools.metaPixelId); }

  /* ---------- Zastosowanie zgód ---------- */
  function apply(reason) {
    var upd = {};
    CATS.forEach(function (c) { SIGNALS[c].forEach(function (s) { upd[s] = has(c) ? "granted" : "denied"; }); });
    gtag("consent", "update", upd);
    window.dataLayer.push({ event: "consent_update", consent_analytics: has("analytics"), consent_marketing: has("marketing"), consent_reason: reason || "load" });
    if (tools.gtmId && (has("analytics") || has("marketing"))) loadGtm();
    if (tools.metaPixelId) { if (has("marketing")) loadMeta(); else if (window.fbq) { try { window.fbq("consent", "revoke"); } catch (e) {} } }
    if (tools.plausible) loadPlausible();
    document.documentElement.setAttribute("data-consent", (has("analytics") ? "a" : "") + (has("marketing") ? "m" : "") || "none");
    try { window.dispatchEvent(new CustomEvent("consent:change", { detail: { analytics: has("analytics"), marketing: has("marketing") } })); } catch (e) {}
  }
  function script(src, attrs) {
    var s = document.createElement("script"); s.async = true; s.src = src;
    for (var k in attrs || {}) s.setAttribute(k, attrs[k]);
    document.head.appendChild(s);
    return s;
  }
  function loadGtm() {
    if (loaded.gtm) return; loaded.gtm = true;
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    script("https://www.googletagmanager.com/gtm.js?id=" + encodeURIComponent(tools.gtmId), { "data-gtm-loader": "1" });
  }
  function loadMeta() {
    if (loaded.meta) { try { window.fbq("consent", "grant"); } catch (e) {} return; }
    loaded.meta = true;
    /* standardowy stub Meta Pixel */
    (function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = true; n.version = "2.0"; n.queue = []; t = b.createElement(e); t.async = true; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("consent", "grant");
    window.fbq("init", tools.metaPixelId);
    window.fbq("track", "PageView");
  }
  function loadPlausible() {
    if (loaded.plausible) return; loaded.plausible = true;
    script("https://plausible.io/js/script.outbound-links.js", { defer: "", "data-domain": location.hostname });
    window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments); };
  }

  /* ---------- Zdarzenia (konwersje) ---------- */
  window.tsTrack = function (name, params) {
    var p = params || {};
    var ev = { event: name }; for (var k in p) ev[k] = p[k];
    window.dataLayer.push(ev);
    if (window.plausible) { try { window.plausible(name, { props: flat(p) }); } catch (e) {} }
    if (window.fbq && has("marketing")) {
      try {
        if (name === "generate_lead") window.fbq("track", "Lead", { content_name: p.source || "form" });
        else if (name === "magnet_signup") window.fbq("track", "CompleteRegistration", { content_name: "pdf" });
        else window.fbq("trackCustom", name, flat(p));
      } catch (e) {}
    }
  };
  function flat(o) { var r = {}; for (var k in o) { if (o[k] !== null && typeof o[k] !== "object") r[k] = o[k]; } return r; }

  /* ---------- Atrybucja (UTM, gclid, fbclid) — pierwsze dotknięcie, 30 dni ---------- */
  (function attribution() {
    var AKEY = "ts-attrib";
    try {
      var q = new URLSearchParams(location.search), got = {}, any = false;
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "msclkid", "ttclid"].forEach(function (k) { var v = q.get(k); if (v) { got[k] = v.slice(0, 200); any = true; } });
      var prev = JSON.parse(localStorage.getItem(AKEY) || "null");
      if (prev && prev.expiresAt && new Date(prev.expiresAt) < now()) prev = null;
      if (any || !prev) {
        var o = { first: (prev && prev.first) || got, last: got, landing: location.pathname + location.search.slice(0, 300), referrer: (document.referrer || "").slice(0, 300), ts: now().toISOString(), expiresAt: new Date(Date.now() + 30 * 864e5).toISOString() };
        if (!any && !prev) o.last = {};
        localStorage.setItem(AKEY, JSON.stringify(o));
      }
    } catch (e) {}
    window.tsAttribution = function () { try { return JSON.parse(localStorage.getItem(AKEY) || "null"); } catch (e) { return null; } };
  })();

  /* ---------- UI ---------- */
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    for (var k in attrs || {}) { if (k === "text") el.textContent = attrs[k]; else if (k === "html") el.innerHTML = attrs[k]; else el.setAttribute(k, attrs[k]); }
    (children || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  }
  function build() {
    if (ui) return ui;
    var consentMode = needsConsent();
    var box = h("div", { "class": "consent", id: "consent", role: "dialog", "aria-modal": "false", "aria-labelledby": "consent-title", "aria-describedby": "consent-desc" });
    var icon = h("svg", { "class": "ic", "aria-hidden": "true" }); icon.innerHTML = '<use href="#i-shield"/>';
    var title = h("p", { "class": "consent__title", id: "consent-title", text: consentMode ? "Ciasteczka i prywatność" : "Prywatność" });
    var desc = h("p", { "class": "consent__desc", id: "consent-desc" });
    if (consentMode) {
      desc.innerHTML = 'Poza tym, co niezbędne do działania strony, mogę użyć narzędzi analitycznych i reklamowych, ale tylko za Twoją zgodą. Wybór zmienisz w każdej chwili w stopce. <a href="polityka-prywatnosci.html">Polityka prywatności</a>';
    } else {
      desc.innerHTML = 'Bez ciasteczek śledzących i reklam. W przeglądarce zapisuję tylko ustawienia techniczne (motyw, intro, ten komunikat). Dane z formularzy trafiają wyłącznie do mnie. <a href="polityka-prywatnosci.html">Polityka prywatności</a>';
    }
    var prefs = h("div", { "class": "consent__prefs", id: "consent-prefs", hidden: "" });
    var toggles = {};
    [["necessary", "Niezbędne", "Działanie strony, formularze, zapamiętanie motywu i Twojego wyboru. Zawsze włączone.", true],
     ["analytics", "Analityka", "Jak używana jest strona (np. Google Analytics). Pomaga ją poprawiać.", false],
     ["marketing", "Marketing", "Mierzenie skuteczności reklam (Google Ads, Meta) i dopasowanie reklam. Bez tego reklamy i tak mogą się pojawiać, tylko mniej trafne.", false]].forEach(function (c) {
      var id = "consent-cat-" + c[0];
      var input = h("input", { type: "checkbox", id: id, "data-cat": c[0] });
      input.checked = c[3] || has(c[0]); if (c[3]) { input.disabled = true; }
      toggles[c[0]] = input;
      prefs.appendChild(h("label", { "class": "consent__row", "for": id }, [input, h("span", { "class": "consent__switch", "aria-hidden": "true" }), h("span", { "class": "consent__row-text" }, [h("b", { text: c[1] }), h("small", { text: c[2] })])]));
    });
    var actions = h("div", { "class": "consent__actions" });
    var btnAll = h("button", { type: "button", "class": "btn btn--primary", id: "consent-all", text: "Akceptuję wszystko" });
    var btnNec = h("button", { type: "button", "class": "btn btn--primary consent__btn-nec", id: "consent-necessary", text: consentMode ? "Tylko niezbędne" : "Rozumiem" });
    var btnSet = h("button", { type: "button", "class": "btn btn--ghost", id: "consent-settings", text: "Ustawienia", "aria-expanded": "false", "aria-controls": "consent-prefs" });
    var btnSave = h("button", { type: "button", "class": "btn btn--primary", id: "consent-save", text: "Zapisz wybór", hidden: "" });
    if (consentMode) { if (!gpc()) actions.appendChild(btnAll); actions.appendChild(btnNec); actions.appendChild(btnSet); actions.appendChild(btnSave); }
    else { actions.appendChild(btnNec); }
    var body = h("div", { "class": "consent__body" }, [title, desc, prefs]);
    box.appendChild(icon); box.appendChild(body); box.appendChild(actions);
    if (gpc() && consentMode) desc.appendChild(h("span", { "class": "consent__gpc", text: " Wykryłem sygnał „nie śledź” z Twojej przeglądarki, więc opcjonalne narzędzia są wyłączone." }));

    btnAll.addEventListener("click", function () { save({ analytics: true, marketing: true }); apply("accept_all"); close(); });
    btnNec.addEventListener("click", function () { save({ analytics: false, marketing: false }); apply("reject"); close(); });
    btnSet.addEventListener("click", function () {
      var open = prefs.hidden; prefs.hidden = !open; btnSave.hidden = !open; btnSet.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) toggles.analytics.focus();
    });
    btnSave.addEventListener("click", function () { save({ analytics: toggles.analytics.checked, marketing: toggles.marketing.checked }); apply("custom"); close(); });
    box.addEventListener("keydown", function (e) { if (e.key === "Escape" && state) close(); });
    ui = { box: box, toggles: toggles, prefs: prefs, btnSave: btnSave, btnSet: btnSet };
    return ui;
  }
  var lastFocus = null;
  function open(showPrefs) {
    var u = build();
    if (!u.box.parentNode) document.body.appendChild(u.box);
    u.box.hidden = false;
    CATS.forEach(function (c) { u.toggles[c].checked = has(c); });
    if (showPrefs) { u.prefs.hidden = false; u.btnSave.hidden = false; u.btnSet.setAttribute("aria-expanded", "true"); }
    lastFocus = document.activeElement;
    setTimeout(function () { var first = u.box.querySelector("button"); if (first) first.focus({ preventScroll: true }); }, 50);
  }
  function close() {
    if (!ui) return;
    ui.box.hidden = true;
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  }

  /* ---------- Start ---------- */
  function boot() {
    if (state) { apply("stored"); return; }
    if (gpc() && needsConsent()) { save({ analytics: false, marketing: false }, "gpc"); apply("gpc"); }
    var show = function () { if (!state || !needsConsent()) open(false); };
    if (document.documentElement.classList.contains("has-intro")) window.addEventListener("intro:done", function () { setTimeout(show, 1200); });
    else setTimeout(show, 1600);
  }
  /* konfiguracja narzędzi: z cache lub z /api/config (features.js wysyła config:loaded) */
  function setTools(c) {
    var t = (c && c.tracking) || {};
    tools.gtmId = String(t.gtmId || "").trim(); tools.metaPixelId = String(t.metaPixelId || "").trim(); tools.plausible = !!t.plausible;
  }
  try { setTools(JSON.parse(localStorage.getItem("ts-config") || "null")); } catch (e) {}
  window.addEventListener("config:loaded", function (e) { setTools(e.detail); if (state) apply("config"); });
  document.addEventListener("click", function (e) { var a = e.target.closest && e.target.closest("[data-consent-open]"); if (a) { e.preventDefault(); open(true); } });

  window.tsConsent = { has: has, open: function () { open(true); }, get: function () { return state; }, tools: function () { return tools; } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
