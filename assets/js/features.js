/* TSoftware — features.js
   Kalkulator oszczędności, konfigurator automatu (schemat SVG + widełki),
   suwaki „przed / po”, interaktywna mapa integracji, wysyłka formularza
   (webhook albo mailto). Bez bibliotek. */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return [].slice.call((c || document).querySelectorAll(s)); };
  function safe(fn) { try { fn(); } catch (e) { if (window.console) console.warn(e); } }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  /* teksty i zapis liczb/waluty w bieżącym języku (assets/js/i18n.js) */
  var I18N = window.TS_I18N || { lang: "pl", t: function (k) { return k; }, num: function (n) { return String(Math.round(n)); }, money: function (n) { return String(Math.round(n)); }, date: function (d) { return String(d); } };
  function tr(key, vars) { return I18N.t(key, vars); }
  function fmt(n) { return I18N.num(n); }
  function money(n) { return I18N.money(n); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  /* licznik: płynnie dojeżdża do wartości */
  function counter(el, formatter) {
    var cur = 0, target = 0, raf = 0, from = 0, t0 = 0, DUR = 650;
    function tick(now) {
      var k = reduce ? 1 : clamp((now - t0) / DUR, 0, 1);
      cur = from + (target - from) * easeOut(k);
      el.textContent = formatter(cur);
      if (k < 1) raf = requestAnimationFrame(tick); else raf = 0;
    }
    return function (v) {
      target = v; from = cur; t0 = performance.now();
      if (!raf) raf = requestAnimationFrame(tick);
    };
  }

  /* ========================================================================
     Konfiguracja z panelu (GET /api/config). Bez backendu zostają wartości
     wpisane w HTML; ostatnia udana konfiguracja jest cache'owana lokalnie.
     ======================================================================== */
  var CFG = {
    configurator: { base: 1200, perSystem: 900, perAction: 700, perAI: 1500, bonus3Systems: 1200, spreadLow: 0.9, spreadHigh: 1.3 },
    features: {}, contact: {}, plans: {}, magnet: {}
  };
  function deepMerge(dst, src) {
    for (var k in src) {
      if (src[k] && typeof src[k] === "object" && !Array.isArray(src[k])) { dst[k] = deepMerge(dst[k] && typeof dst[k] === "object" ? dst[k] : {}, src[k]); }
      else if (src[k] !== undefined) dst[k] = src[k];
    }
    return dst;
  }
  function applyConfig(c) {
    deepMerge(CFG, c || {});
    var plans = CFG.plans || {};
    ["start", "firma", "opieka"].forEach(function (key) {
      var el = document.querySelector('[data-price="' + key + '"]');
      var plan = plans[key];
      if (!el || !plan || typeof plan.price !== "number") return;
      el.innerHTML = "<small>" + tr("plans.from") + "</small>" + money(plan.price) + (key === "opieka" ? "<small>" + tr("plans.perMonth") + "</small>" : "");
    });
    var ct = CFG.contact || {};
    if (ct.email) $$('[data-contact="email"]').forEach(function (a) { a.textContent = ct.email; a.href = "mailto:" + ct.email; });
    if (ct.phone) $$('[data-contact="phone"]').forEach(function (a) { a.textContent = ct.phone; a.href = "tel:" + ct.phone.replace(/[^+\d]/g, ""); });
    if (ct.hours) $$('[data-contact="hours"]').forEach(function (d) { d.textContent = ct.hours; });
    if (ct.whatsapp) {
      var wa = "https://wa.me/" + String(ct.whatsapp).replace(/\D/g, "") + "?text=" + encodeURIComponent(tr("wa.greeting"));
      $$('[data-contact="wa"], #wa-fab').forEach(function (a) { a.href = wa; });
    }
    var ft = CFG.features || {};
    var fab = document.getElementById("wa-fab"); if (fab) fab.classList.toggle("is-hidden", ft.whatsapp === false);
    var lista = document.getElementById("lista"); if (lista) lista.hidden = (ft.leadMagnet === false) || (CFG.magnet && CFG.magnet.enabled === false);
    if (CFG.magnet && CFG.magnet.title) { var mh = document.querySelector("#lista h2"); if (mh && !mh.querySelector(".w")) mh.textContent = CFG.magnet.title; }
    try { window.dispatchEvent(new CustomEvent("config:loaded", { detail: CFG })); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent("config:applied")); } catch (e) {}
  }
  safe(function () {
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem("ts-config") || "null"); } catch (e) {}
    if (cached) applyConfig(cached);
    if (!window.fetch || location.protocol === "file:") return;
    fetch("/api/config", { headers: { "Accept": "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (c) { if (!c || typeof c !== "object") return; try { localStorage.setItem("ts-config", JSON.stringify(c)); } catch (e) {} applyConfig(c); })
      .catch(function () { /* brak backendu (np. podgląd statyczny) — zostają wartości z HTML */ });
  });

  /* przekazanie treści do formularza kontaktowego */
  function handOff(topic, message, source, meta) {
    var form = document.getElementById("contact-form");
    if (!form) return;
    form.dataset.source = source || "form";
    form.dataset.meta = meta ? JSON.stringify(meta) : "";
    var topicEl = form.querySelector("#f-topic"), msgEl = form.querySelector("#f-message"), nameEl = form.querySelector("#f-name");
    if (topicEl) { [].forEach.call(topicEl.options, function (o) { if (o.textContent === topic) topicEl.value = o.value; }); }
    if (msgEl) msgEl.value = message;
    var target = document.getElementById("kontakt");
    if (target) target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    setTimeout(function () { if (nameEl) nameEl.focus({ preventScroll: true }); }, reduce ? 0 : 700);
  }

  /* ========================================================================
     Kalkulator oszczędności
     ======================================================================== */
  safe(function () {
    var form = document.getElementById("calc");
    if (!form) return;
    var ids = ["min", "times", "days", "rate"];
    var inputs = {}, outs = {};
    ids.forEach(function (k) { inputs[k] = document.getElementById("c-" + k); outs[k] = document.getElementById("c-" + k + "-out"); });
    var hoursC = counter(document.getElementById("c-hours"), function (v) { return fmt(v); });
    var moneyC = counter(document.getElementById("c-money"), function (v) { return fmt(v); });
    var yearC = counter(document.getElementById("c-year"), function (v) { return fmt(v); });
    var fteC = counter(document.getElementById("c-fte"), function (v) { return fmt(v); });
    var bar = document.getElementById("c-bar"), left = document.getElementById("c-left");
    var AUTOMATED = 0.9;
    var state = {};

    function fill(input) {
      var p = (input.value - input.min) / (input.max - input.min) * 100;
      input.style.setProperty("--fill", p.toFixed(1) + "%");
    }
    function labels() {
      outs.min.textContent = tr("calc.label.min", { n: inputs.min.value });
      outs.times.textContent = tr("calc.label.times", { n: inputs.times.value });
      outs.days.textContent = tr(inputs.days.value === "1" ? "calc.label.day" : "calc.label.days", { n: inputs.days.value });
      outs.rate.textContent = money(inputs.rate.value);
    }
    function compute() {
      var min = +inputs.min.value, times = +inputs.times.value, days = +inputs.days.value, rate = +inputs.rate.value;
      var hours = (min * times * days) / 60;
      var saved = hours * AUTOMATED;
      state = { hours: hours, saved: saved, money: saved * rate, year: saved * rate * 12, fte: (saved * 12) / 8, min: min, times: times, days: days, rate: rate };
      hoursC(hours); moneyC(state.money); yearC(state.year); fteC(state.fte);
      if (bar) bar.style.width = (100 - AUTOMATED * 100) + "%";
      if (left) left.textContent = tr("calc.left", { h: fmt(hours - saved) });
    }
    function update() { ids.forEach(function (k) { fill(inputs[k]); }); labels(); compute(); }

    ids.forEach(function (k) { inputs[k].addEventListener("input", update); });
    $$(".calc__presets .pill").forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-preset").split(",");
        ids.forEach(function (k, i) { inputs[k].value = v[i]; });
        $$(".calc__presets .pill").forEach(function (x) { x.classList.toggle("is-on", x === b); });
        update();
      });
    });
    var send = document.getElementById("c-send");
    if (send) send.addEventListener("click", function () {
      var msg = tr("calc.message", { min: state.min, times: state.times, days: state.days, rate: money(state.rate), hours: fmt(state.hours), money: money(state.money), year: money(state.year) });
      if (window.tsTrack) window.tsTrack("calc_used", { hours: Math.round(state.hours), monthly: Math.round(state.money) });
      handOff(tr("form.topic.automation"), msg, "kalkulator", { min: state.min, times: state.times, days: state.days, rate: state.rate, hours: Math.round(state.hours), monthly: Math.round(state.money), yearly: Math.round(state.year) });
    });
    update();
  });

  /* ========================================================================
     Konfigurator automatu
     ======================================================================== */
  safe(function () {
    var root = document.getElementById("cfg");
    var svg = document.getElementById("cfg-diagram");
    if (!root || !svg) return;
    var NS = "http://www.w3.org/2000/svg";
    var priceEl = document.getElementById("cfg-price"), timeEl = document.getElementById("cfg-time"), stepsEl = document.getElementById("cfg-steps");

    root.addEventListener("click", function (e) {
      var b = e.target.closest(".cfg__opt");
      if (!b) return;
      var group = b.closest(".cfg__group");
      if (group.hasAttribute("data-single")) {
        $$(".cfg__opt", group).forEach(function (x) { x.classList.toggle("is-on", x === b); x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      } else {
        var on = b.classList.toggle("is-on");
        b.setAttribute("aria-pressed", on ? "true" : "false");
      }
      render();
    });

    function picked(group) {
      return $$('.cfg__group[data-group="' + group + '"] .cfg__opt.is-on').map(function (b) {
        return { id: b.getAttribute("data-id"), icon: b.getAttribute("data-icon"), label: b.getAttribute("data-label"), ai: b.hasAttribute("data-ai") };
      });
    }
    function el(name, attrs, parent) {
      var n = document.createElementNS(NS, name);
      for (var k in attrs) { if (k === "href") n.setAttributeNS("http://www.w3.org/1999/xlink", "href", attrs[k]); n.setAttribute(k, attrs[k]); }
      if (parent) parent.appendChild(n);
      return n;
    }
    function shorten(s, n) {
      if (s.length <= n) return s;
      var cut = s.slice(0, n - 1).replace(/\s+\S*$/, "");
      if (cut.length < n * 0.6) cut = s.slice(0, n - 1);
      return cut + "…";
    }
    function node(x, y, w, kind, icon, label, title, delay) {
      var wrap = el("g", { transform: "translate(" + (x - w / 2) + " " + (y - 22) + ")" }, svg);
      var g = el("g", { "class": "dg-node dg-node--" + kind, style: "animation-delay:" + delay + "ms" }, wrap);
      el("rect", { width: w, height: 44, rx: 10 }, g);
      var ic = el("svg", { "class": "ic", x: 12, y: 13, width: 18, height: 18, viewBox: "0 0 24 24" }, g);
      el("use", { href: "#" + icon }, ic);
      var t1 = el("text", { "class": "dg-kind", x: 38, y: 17 }, g); t1.textContent = tr(kind === "trigger" ? "cfg.kind.start" : kind === "ai" ? "cfg.kind.ai" : kind === "system" ? "cfg.kind.system" : "cfg.kind.action");
      var t2 = el("text", { x: 38, y: 33 }, g); t2.textContent = shorten(label, title);
      return { x: x, y: y, w: w };
    }
    function link(a, b, ai, delay) {
      var x1 = a.x + a.w / 2, x2 = b.x - b.w / 2, mx = (x1 + x2) / 2;
      var d = "M" + x1 + " " + a.y + " C " + mx + " " + a.y + ", " + mx + " " + b.y + ", " + x2 + " " + b.y;
      el("path", { "class": "dg-link" + (ai ? " dg-link--ai" : ""), d: d, style: "animation-delay:0s," + delay + "ms" }, svg);
      if (!reduce) {
        var c = el("circle", { "class": "dg-packet", r: 3.2 }, svg);
        var m = el("animateMotion", { dur: (1.6 + Math.random() * 0.8).toFixed(2) + "s", begin: (Math.random() * 1.2).toFixed(2) + "s", repeatCount: "indefinite", path: d }, c);
        void m;
      }
    }

    function render() {
      var trig = picked("trigger")[0], systems = picked("systems"), actions = picked("actions");
      var hasAI = actions.some(function (a) { return a.ai; });
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      var W = 680, H = 330;
      if (!trig || (!systems.length && !actions.length)) {
        var t = el("text", { "class": "dg-empty", x: W / 2, y: H / 2 }, svg);
        t.textContent = tr("cfg.empty");
        priceEl.textContent = "—"; timeEl.textContent = "—"; stepsEl.textContent = "0";
        return;
      }
      /* kolumny: start | AI | systemy | akcje — systemy i akcje jedna pod drugą */
      var colTrig = hasAI ? 100 : 112, colAI = 250, colSys = hasAI ? 392 : 338, colAct = hasAI ? 572 : 560;
      function spread(n, cy) { var step = Math.min(58, (H - 60) / Math.max(1, n)); var y0 = cy - ((n - 1) * step) / 2; var ys = []; for (var i = 0; i < n; i++) ys.push(y0 + i * step); return ys; }
      var d = 0;
      var T = node(colTrig, H / 2, 150, "trigger", trig.icon, trig.label, 17, d);
      var A = null;
      if (hasAI) { d += 80; A = node(colAI, H / 2, 112, "ai", "i-ai", tr("cfg.ai.node"), 12, d); link(T, A, true, d); }
      var sysNodes = [];
      var sy = spread(systems.length, H / 2);
      systems.forEach(function (s, i) {
        d += 60;
        var n = node(colSys, sy[i], 124, "system", s.icon, s.label, 13, d);
        sysNodes.push(n);
        link(A || T, n, !!A, d);
      });
      var actNodes = [];
      var realActions = actions.filter(function (a) { return a.id !== "check"; });
      var ay = spread(realActions.length, H / 2);
      realActions.forEach(function (a, i) {
        d += 60;
        var n = node(colAct, ay[i], 164, "action", a.icon, a.label, 21, d);
        actNodes.push(n);
        var from = sysNodes.length ? sysNodes[i % sysNodes.length] : (A || T);
        link(from, n, a.ai, d);
      });

      /* widełki (parametry z panelu: CFG.configurator) */
      var P = CFG.configurator;
      var price = P.base + systems.length * P.perSystem + realActions.length * P.perAction + actions.filter(function (a) { return a.ai; }).length * P.perAI;
      if (systems.length >= 3) price += P.bonus3Systems;
      var lo = Math.round(price * P.spreadLow / 500) * 500, hi = Math.round(price * P.spreadHigh / 500) * 500;
      var steps = 1 + (hasAI ? 1 : 0) + systems.length + realActions.length;
      priceEl.textContent = tr("cfg.priceRange", { lo: fmt(lo), hi: fmt(hi) });
      timeEl.textContent = tr(steps <= 3 ? "cfg.time.1" : steps <= 6 ? "cfg.time.2" : steps <= 9 ? "cfg.time.3" : "cfg.time.4");
      stepsEl.textContent = String(steps);
      root.dataset.summary = tr("cfg.summary", {
        trigger: trig.label,
        systems: systems.map(function (s) { return s.label; }).join(", ") || tr("cfg.none"),
        actions: actions.map(function (a) { return a.label; }).join(", ") || tr("cfg.none"),
        price: priceEl.textContent, time: timeEl.textContent
      });
    }

    var send = document.getElementById("cfg-send");
    if (send) send.addEventListener("click", function () {
      if (window.tsTrack) window.tsTrack("cfg_used", { price: priceEl.textContent });
      handOff(tr("form.topic.automation"), tr("cfg.message", { summary: root.dataset.summary || "" }), "konfigurator",
        { trigger: picked("trigger").map(function (x) { return x.label; })[0] || "", systems: picked("systems").map(function (x) { return x.label; }), actions: picked("actions").map(function (x) { return x.label; }), price: priceEl.textContent, time: timeEl.textContent });
    });
    window.addEventListener("config:applied", render);
    render();
  });

  /* ========================================================================
     Suwaki przed / po
     ======================================================================== */
  $$("[data-compare]").forEach(function (box) {
    var range = $(".compare__range", box);
    function set(v) { box.style.setProperty("--pos", clamp(v, 0, 100).toFixed(1)); }
    if (range) {
      range.addEventListener("input", function () { set(+range.value); });
      box.addEventListener("pointermove", function (e) {
        if (e.pointerType === "mouse" && e.buttons === 0) return;
        var r = box.getBoundingClientRect();
        var v = ((e.clientX - r.left) / r.width) * 100;
        set(v); range.value = Math.round(v);
      });
      box.addEventListener("pointerdown", function (e) {
        var r = box.getBoundingClientRect();
        var v = ((e.clientX - r.left) / r.width) * 100;
        set(v); range.value = Math.round(v);
      });
    }
    /* delikatne „zaproszenie”: suwak przesuwa się raz, gdy wjeżdża na ekran */
    if (!reduce && "IntersectionObserver" in window) {
      var done = false;
      new IntersectionObserver(function (en) {
        if (!en[0].isIntersecting || done) return;
        done = true;
        var t0 = performance.now();
        (function anim(now) {
          var k = clamp((now - t0) / 1400, 0, 1);
          var v = 52 + Math.sin(k * Math.PI) * 18 * (1 - k);
          set(v); if (range) range.value = Math.round(v);
          if (k < 1) requestAnimationFrame(anim);
        })(t0);
      }, { threshold: 0.6 }).observe(box);
    }
  });

  /* ========================================================================
     Mapa integracji: klik w system
     ======================================================================== */
  safe(function () {
    var map = document.getElementById("map"), panel = document.getElementById("map-panel");
    if (!map || !panel) return;
    /* nazwy i opisy: słownik (map.<id>.name, map.<id>.1–3) */
    var ICONS = { shop: "i-store", erp: "i-layers", crm: "i-users", mail: "i-mail", wms: "i-box", acc: "i-receipt" };
    var DATA = {};
    for (var sysId in ICONS) {
      DATA[sysId] = { name: tr("map." + sysId + ".name"), icon: ICONS[sysId], items: [tr("map." + sysId + ".1"), tr("map." + sysId + ".2"), tr("map." + sysId + ".3")] };
    }
    var active = null;
    function show(id) {
      active = id;
      map.classList.toggle("has-active", !!id);
      $$(".map__sat", map).forEach(function (g) { g.classList.toggle("is-active", g.getAttribute("data-sys") === id); });
      $$("[data-spoke]", map).forEach(function (p) { p.classList.toggle("is-active", p.getAttribute("data-spoke") === id); });
      if (!id) {
        panel.classList.remove("is-open");
        panel.innerHTML = '<p class="map-panel__hint">' + tr("map.hint") + '</p>';
        return;
      }
      var d = DATA[id];
      panel.classList.add("is-open");
      panel.innerHTML = '<h3><svg class="ic"><use href="#' + d.icon + '"/></svg>' + tr("map.title", { name: d.name }) + '</h3><ul>' +
        d.items.map(function (t) { return "<li>" + t + "</li>"; }).join("") + '</ul><a href="#konfigurator">' + tr("map.cta") + '</a>';
    }
    $$(".map__sat", map).forEach(function (g) {
      var id = g.getAttribute("data-sys");
      g.addEventListener("click", function () { show(active === id ? null : id); });
      g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(active === id ? null : id); } });
    });
  });

  /* ========================================================================
     Z bloga: 3 najnowsze wpisy (GET /api/posts); bez backendu sekcja ukryta
     ======================================================================== */
  safe(function () {
    var sec = document.getElementById("z-bloga"), grid = document.getElementById("home-posts");
    if (!sec || !grid || !window.fetch || location.protocol === "file:") return;
    function fmtDate(iso) { return I18N.date(iso); }
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function hue(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
    fetch("/api/posts?limit=3&lang=" + encodeURIComponent(I18N.lang), { headers: { Accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (j) {
        var items = (j && j.items) || [];
        if (!items.length) return;
        items.forEach(function (p) {
          var art = el("article", "pcard"), a = el("a", "pcard__link"); a.href = "/blog/" + encodeURIComponent(p.slug) + "/";
          var media = el("div", "pcard__media");
          if (p.cover) { var img = el("img"); img.src = p.cover; img.alt = p.coverAlt || p.title; img.loading = "lazy"; img.decoding = "async"; media.appendChild(img); }
          else { var ph = el("div", "pcard__ph"); ph.style.setProperty("--h", hue(p.category || p.title || "")); ph.appendChild(el("b", null, (p.category || p.title || "T").charAt(0).toUpperCase())); ph.appendChild(el("span", null, p.category || tr("blog.category.ph"))); media.appendChild(ph); }
          var body = el("div", "pcard__body"), top = el("div", "pcard__top"); top.appendChild(el("span", "pcard__cat", p.category || tr("blog.category.default")));
          var meta = el("div", "pcard__meta"); meta.appendChild(el("time", null, fmtDate(p.publishedAt))); meta.appendChild(el("span", null, "·")); meta.appendChild(el("span", null, tr("blog.readingTime", { n: Math.max(1, Math.round(p.readingMin || 1)) })));
          body.appendChild(top); body.appendChild(el("h3", "pcard__title", p.title)); body.appendChild(el("p", "pcard__excerpt", p.excerpt || "")); body.appendChild(meta);
          a.appendChild(media); a.appendChild(body); art.appendChild(a); grid.appendChild(art);
        });
        sec.hidden = false;
        try { window.dispatchEvent(new CustomEvent("reveal:refresh")); } catch (e) {}
      })
      .catch(function () { /* brak backendu */ });
  });

  /* ========================================================================
     Lead magnet: e-mail → PDF
     ======================================================================== */
  safe(function () {
    var form = document.getElementById("magnet-form"), status = document.getElementById("magnet-status");
    if (!form) return;
    var btn = form.querySelector("button");
    function showLink(url, note) {
      status.innerHTML = note + ' <a href="' + url + '" target="_blank" rel="noopener">' + tr("magnet.download") + '</a>';
      status.classList.add("is-ok");
      try { window.open(url, "_blank", "noopener"); } catch (e) {}
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var data = new FormData(form);
      /* data-file na formularzu (np. angielski PDF) ma pierwszeństwo przed adresem z panelu */
      var fileAttr = (form.getAttribute("data-file") || "").trim();
      var url = fileAttr || (CFG.magnet && CFG.magnet.url) || "assets/dl/30-procesow-do-automatyzacji.pdf";
      if (data.get("website")) { showLink(url, tr("magnet.done")); return; }
      if (!window.fetch || location.protocol === "file:") { showLink(url, tr("magnet.here")); return; }
      btn.disabled = true; btn.textContent = tr("btn.sending");
      fetch("/api/magnet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: data.get("email"), marketing: !!data.get("marketing"), website: "" }) })
        .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
        .then(function (j) { btn.disabled = false; btn.textContent = tr("btn.sent"); form.reset(); if (window.tsTrack) window.tsTrack("magnet_signup", { source: "magnet" }); showLink(fileAttr || (j && j.url) || url, tr("magnet.thanks")); })
        .catch(function () { btn.disabled = false; btn.textContent = tr("magnet.btn"); showLink(url, tr("magnet.failed")); });
    });
  });

  /* ========================================================================
     Formularz: API na VPS (JSON) albo mailto
     ======================================================================== */
  safe(function () {
    var form = document.getElementById("contact-form");
    if (!form) return;
    var status = document.getElementById("form-status");
    var email = form.getAttribute("data-email") || "kontakt@tsoftware.online";
    var endpoint = (form.getAttribute("data-endpoint") || "").trim();
    var btn = form.querySelector('button[type="submit"]');

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var data = new FormData(form);
      if (data.get("website")) { if (status) status.textContent = tr("form.thanks"); return; } /* honeypot */
      var topic = data.get("topic") || tr("form.defaultTopic");
      var meta = null; try { meta = form.dataset.meta ? JSON.parse(form.dataset.meta) : null; } catch (err) {}
      meta = meta || {};
      try { var attr = window.tsAttribution && window.tsAttribution(); if (attr) meta.attribution = { first: attr.first, last: attr.last, landing: attr.landing, referrer: attr.referrer }; } catch (err) {}
      var payload = { name: data.get("name") || "", company: data.get("company") || "", email: data.get("email") || "", topic: topic, message: data.get("message") || "", source: form.dataset.source || "form", meta: meta, website: data.get("website") || "" };
      var track = function () { if (window.tsTrack) window.tsTrack("generate_lead", { source: payload.source, topic: topic, user_data: { email: payload.email } }); };

      if (endpoint && window.fetch && location.protocol !== "file:") {
        if (btn) { btn.disabled = true; btn.textContent = tr("btn.sending"); }
        fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
          .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r; })
          .then(function () {
            track();
            form.reset(); form.dataset.source = "form"; form.dataset.meta = "";
            if (status) status.textContent = tr("form.sent");
            if (btn) { btn.disabled = false; btn.textContent = tr("btn.sent"); setTimeout(function () { btn.textContent = tr("form.btn"); }, 4000); }
          })
          .catch(function () {
            if (btn) { btn.disabled = false; btn.textContent = tr("form.btn"); }
            if (status) status.textContent = tr("form.error", { email: email });
          });
        return;
      }
      var subject = tr("form.mailto.subject", { topic: topic });
      var body = tr("form.mailto.body", { name: payload.name, company: payload.company || "-", email: payload.email, topic: topic, message: payload.message });
      track();
      window.location.href = "mailto:" + email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
      if (status) status.textContent = tr("form.mailto.status", { email: email });
    }, true);
  });
})();
