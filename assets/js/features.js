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
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u2009"); }
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
      el.innerHTML = "<small>od</small>" + fmt(plan.price) + " zł" + (key === "opieka" ? "<small>/mies.</small>" : "");
    });
    var ct = CFG.contact || {};
    if (ct.email) $$('[data-contact="email"]').forEach(function (a) { a.textContent = ct.email; a.href = "mailto:" + ct.email; });
    if (ct.phone) $$('[data-contact="phone"]').forEach(function (a) { a.textContent = ct.phone; a.href = "tel:" + ct.phone.replace(/[^+\d]/g, ""); });
    if (ct.hours) $$('[data-contact="hours"]').forEach(function (d) { d.textContent = ct.hours; });
    if (ct.whatsapp) {
      var wa = "https://wa.me/" + String(ct.whatsapp).replace(/\D/g, "") + "?text=" + encodeURIComponent("Cześć, piszę ze strony tsoftware.online. ");
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
      outs.min.textContent = inputs.min.value + " min";
      outs.times.textContent = inputs.times.value + " ×";
      outs.days.textContent = inputs.days.value + (inputs.days.value === "1" ? " dzień" : " dni");
      outs.rate.textContent = inputs.rate.value + " zł";
    }
    function compute() {
      var min = +inputs.min.value, times = +inputs.times.value, days = +inputs.days.value, rate = +inputs.rate.value;
      var hours = (min * times * days) / 60;
      var saved = hours * AUTOMATED;
      state = { hours: hours, saved: saved, money: saved * rate, year: saved * rate * 12, fte: (saved * 12) / 8, min: min, times: times, days: days, rate: rate };
      hoursC(hours); moneyC(state.money); yearC(state.year); fteC(state.fte);
      if (bar) bar.style.width = (100 - AUTOMATED * 100) + "%";
      if (left) left.textContent = "zostaje " + fmt(hours - saved) + " h";
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
      var msg = "Policzyłem w kalkulatorze: proces zajmuje " + state.min + " min, " + state.times + " razy dziennie, " + state.days + " dni w miesiącu, stawka " + state.rate + " zł/h.\n" +
        "Wychodzi ok. " + fmt(state.hours) + " h miesięcznie, czyli jakieś " + fmt(state.money) + " zł/mies. (" + fmt(state.year) + " zł rocznie).\n\nChcę to zautomatyzować. Proces wygląda tak: ";
      handOff("Automatyzacja procesów", msg, "kalkulator", { min: state.min, times: state.times, days: state.days, rate: state.rate, hours: Math.round(state.hours), monthly: Math.round(state.money), yearly: Math.round(state.year) });
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
      var t1 = el("text", { "class": "dg-kind", x: 38, y: 17 }, g); t1.textContent = kind === "trigger" ? "start" : kind === "ai" ? "AI" : kind === "system" ? "system" : "akcja";
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
        t.textContent = "wybierz start i chociaż jeden system albo akcję";
        priceEl.textContent = "—"; timeEl.textContent = "—"; stepsEl.textContent = "0";
        return;
      }
      /* kolumny: start | AI | systemy | akcje — systemy i akcje jedna pod drugą */
      var colTrig = hasAI ? 100 : 112, colAI = 250, colSys = hasAI ? 392 : 338, colAct = hasAI ? 572 : 560;
      function spread(n, cy) { var step = Math.min(58, (H - 60) / Math.max(1, n)); var y0 = cy - ((n - 1) * step) / 2; var ys = []; for (var i = 0; i < n; i++) ys.push(y0 + i * step); return ys; }
      var d = 0;
      var T = node(colTrig, H / 2, 150, "trigger", trig.icon, trig.label, 17, d);
      var A = null;
      if (hasAI) { d += 80; A = node(colAI, H / 2, 112, "ai", "i-ai", "AI sprawdza", 12, d); link(T, A, true, d); }
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
      priceEl.textContent = fmt(lo) + "–" + fmt(hi) + " zł";
      timeEl.textContent = steps <= 3 ? "3–5 dni" : steps <= 6 ? "1–2 tyg." : steps <= 9 ? "2–3 tyg." : "3–5 tyg.";
      stepsEl.textContent = String(steps);
      root.dataset.summary = "Start: " + trig.label + ". Systemy: " + (systems.map(function (s) { return s.label; }).join(", ") || "brak") + ". Akcje: " + (actions.map(function (a) { return a.label; }).join(", ") || "brak") + ". Widełki z konfiguratora: " + priceEl.textContent + ", czas " + timeEl.textContent + ".";
    }

    var send = document.getElementById("cfg-send");
    if (send) send.addEventListener("click", function () {
      handOff("Automatyzacja procesów", "Złożyłem automat w konfiguratorze.\n" + (root.dataset.summary || "") + "\n\nU mnie wygląda to tak: ", "konfigurator",
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
    var DATA = {
      shop: { name: "Sklep", icon: "i-store", items: ["Zamówienie ze sklepu od razu tworzy dokument w ERP i rezerwuje towar.", "Status wysyłki i numer paczki lecą do klienta mailem albo SMS-em.", "Opisy i zdjęcia produktów generowane z karty towaru, w kilku językach."] },
      erp: { name: "ERP", icon: "i-layers", items: ["Zamówienia z maili, sklepu i B2B trafiają do ERP bez przepisywania.", "Stany, ceny i dokumenty synchronizują się ze sklepem i magazynem.", "Raport sprzedaży i należności codziennie rano na Teams albo w mailu."] },
      crm: { name: "CRM", icon: "i-users", items: ["Nowy lead z formularza lub maila ląduje w CRM z uzupełnionymi danymi firmy.", "AI pisze pierwszą odpowiedź i proponuje termin rozmowy.", "Przypomnienia o follow-upach i wygasających ofertach bez pilnowania."] },
      mail: { name: "E-mail", icon: "i-mail", items: ["AI czyta maile, rozpoznaje zamówienia, faktury i reklamacje i kieruje je dalej.", "Odpowiedzi na powtarzalne pytania wychodzą same, trudne idą do człowieka.", "Załączniki lądują w dobrym folderze i w systemie, nie w skrzynce."] },
      wms: { name: "Magazyn", icon: "i-box", items: ["Stany zawsze zgodne między magazynem, ERP i sklepem.", "Etykiety kurierskie i listy przewozowe generują się po spakowaniu.", "Alert, gdy stan spada poniżej minimum, z gotowym zamówieniem do dostawcy."] },
      acc: { name: "Księgowość", icon: "i-receipt", items: ["Faktury kosztowe z maila i skanów odczytane przez OCR + AI, gotowe do księgowania.", "Faktury sprzedaży wystawiają się same z zamówień i wychodzą do klienta.", "Przypomnienia o płatnościach i raport należności co tydzień."] }
    };
    var active = null;
    function show(id) {
      active = id;
      map.classList.toggle("has-active", !!id);
      $$(".map__sat", map).forEach(function (g) { g.classList.toggle("is-active", g.getAttribute("data-sys") === id); });
      $$("[data-spoke]", map).forEach(function (p) { p.classList.toggle("is-active", p.getAttribute("data-spoke") === id); });
      if (!id) {
        panel.classList.remove("is-open");
        panel.innerHTML = '<p class="map-panel__hint">Kliknij system, żeby zobaczyć, co z nim zwykle robimy.</p>';
        return;
      }
      var d = DATA[id];
      panel.classList.add("is-open");
      panel.innerHTML = '<h3><svg class="ic"><use href="#' + d.icon + '"/></svg>' + d.name + ' + TSoftware</h3><ul>' +
        d.items.map(function (t) { return "<li>" + t + "</li>"; }).join("") + '</ul><a href="#konfigurator">Złóż taki automat w konfiguratorze →</a>';
    }
    $$(".map__sat", map).forEach(function (g) {
      var id = g.getAttribute("data-sys");
      g.addEventListener("click", function () { show(active === id ? null : id); });
      g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(active === id ? null : id); } });
    });
  });

  /* ========================================================================
     Lead magnet: e-mail → PDF
     ======================================================================== */
  safe(function () {
    var form = document.getElementById("magnet-form"), status = document.getElementById("magnet-status");
    if (!form) return;
    var btn = form.querySelector("button");
    function showLink(url, note) {
      status.innerHTML = note + ' <a href="' + url + '" target="_blank" rel="noopener">Pobierz PDF</a>';
      status.classList.add("is-ok");
      try { window.open(url, "_blank", "noopener"); } catch (e) {}
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var data = new FormData(form);
      var url = (CFG.magnet && CFG.magnet.url) || "assets/dl/30-procesow-do-automatyzacji.pdf";
      if (data.get("website")) { showLink(url, "Gotowe."); return; }
      if (!window.fetch || location.protocol === "file:") { showLink(url, "Jest."); return; }
      btn.disabled = true; btn.textContent = "Wysyłam…";
      fetch("/api/magnet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: data.get("email"), website: "" }) })
        .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
        .then(function (j) { btn.disabled = false; btn.textContent = "Wysłane ✓"; form.reset(); showLink((j && j.url) || url, "Dzięki! Link poszedł też na maila."); })
        .catch(function () { btn.disabled = false; btn.textContent = "Wyślij mi PDF"; showLink(url, "Zapis nie przeszedł, ale PDF i tak jest Twój:"); });
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
      if (data.get("website")) { if (status) status.textContent = "Dzięki!"; return; } /* honeypot */
      var topic = data.get("topic") || "konsultacja";
      var meta = null; try { meta = form.dataset.meta ? JSON.parse(form.dataset.meta) : null; } catch (err) {}
      var payload = { name: data.get("name") || "", company: data.get("company") || "", email: data.get("email") || "", topic: topic, message: data.get("message") || "", source: form.dataset.source || "form", meta: meta || undefined, website: data.get("website") || "" };

      if (endpoint && window.fetch && location.protocol !== "file:") {
        if (btn) { btn.disabled = true; btn.textContent = "Wysyłam…"; }
        fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
          .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r; })
          .then(function () {
            form.reset(); form.dataset.source = "form"; form.dataset.meta = "";
            if (status) status.textContent = "Poszło. Odpiszę najpóźniej następnego dnia roboczego.";
            if (btn) { btn.disabled = false; btn.textContent = "Wysłane ✓"; setTimeout(function () { btn.textContent = "Wyślij"; }, 4000); }
          })
          .catch(function () {
            if (btn) { btn.disabled = false; btn.textContent = "Wyślij"; }
            if (status) status.textContent = "Coś nie zadziałało. Napisz bezpośrednio na " + email + ".";
          });
        return;
      }
      var subject = "Zapytanie ze strony: " + topic;
      var body = ["Imię i nazwisko: " + payload.name, "Firma: " + (payload.company || "-"), "E-mail: " + payload.email, "Temat: " + topic, "", payload.message].join("\n");
      window.location.href = "mailto:" + email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
      if (status) status.textContent = "Otwieram Twój program pocztowy z gotową wiadomością. Jeśli nic się nie wydarzyło, napisz na " + email + ".";
    }, true);
  });
})();
