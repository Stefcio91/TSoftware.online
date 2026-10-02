/* TSoftware — main.js
   Nawigacja, nagłówek i pasek postępu, kursor, przyciski „magnetyczne”,
   wejście hero (słowa, dekodowanie etykiety, karta 3D, log), ujawnianie
   sekcji na scroll, karty „spotlight”, linia kroków, formularz. */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return [].slice.call((c || document).querySelectorAll(s)); };
  function safe(fn) { try { fn(); } catch (e) { if (window.console) console.warn(e); } }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  /* teksty interfejsu w bieżącym języku (assets/js/i18n.js) */
  var I18N = window.TS_I18N || { lang: "pl", t: function (k) { return k; }, num: function (n) { return String(Math.round(n)); }, money: function (n) { return String(Math.round(n)); }, date: function (d) { return String(d); } };
  function tr(key, vars) { return I18N.t(key, vars); }

  /* ---------- Natywne animacje sterowane scrollem (gdy przeglądarka umie) ---------- */
  if (!reduce && window.CSS && CSS.supports && CSS.supports("animation-timeline: view()")) {
    document.documentElement.classList.add("sda");
  }

  /* ---------- Intro: boot raz na sesję ---------- */
  safe(function () {
    var intro = document.getElementById("intro");
    if (!intro) return;
    var seen = false, disabled = false;
    try { seen = sessionStorage.getItem("ts-intro") === "1"; } catch (e) {}
    try { var cfg = JSON.parse(localStorage.getItem("ts-config") || "null"); disabled = !!(cfg && cfg.features && cfg.features.intro === false); } catch (e) {}
    if (seen || disabled || reduce) { intro.remove(); return; }
    intro.classList.add("is-on");
    document.documentElement.classList.add("has-intro");
    var boot = document.getElementById("intro-boot");
    var lines = [
      [tr("intro.line1"), "boot"],
      [tr("intro.line2"), "ok"],
      [tr("intro.line3"), "ok"],
      [tr("intro.line4"), "ok"],
      [tr("intro.line5"), ""]
    ];
    var li = 0;
    (function next() {
      if (!boot || li >= lines.length) return;
      var l = lines[li++];
      boot.innerHTML += l[0] + (l[1] === "ok" ? "  <b>" + tr("intro.ok") + "</b>" : "") + "\n";
      setTimeout(next, 110 + Math.random() * 90);
    })();
    var text = document.getElementById("intro-text");
    var finalText = "TSoftware", glyphs = "01<>/|#&%$_-=+*", frames = 0, total = 22;
    setTimeout(function step() {
      frames++;
      var reveal = Math.floor(finalText.length * frames / total), out = "";
      for (var i = 0; i < finalText.length; i++) out += i < reveal ? finalText[i] : glyphs[(Math.random() * glyphs.length) | 0];
      if (text) text.textContent = frames < total ? out : finalText;
      if (frames < total) setTimeout(step, 40);
    }, 500);
    setTimeout(function () {
      intro.classList.add("is-out");
      document.documentElement.classList.remove("has-intro");
      try { sessionStorage.setItem("ts-intro", "1"); } catch (e) {}
      window.dispatchEvent(new CustomEvent("intro:done"));
      setTimeout(function () { intro.remove(); }, 800);
    }, 2100);
  });

  /* ---------- Ziarno (tekstura w CSS var) ---------- */
  safe(function () {
    var c = document.createElement("canvas");
    c.width = c.height = 180;
    var ctx = c.getContext("2d");
    var img = ctx.createImageData(180, 180);
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var v = (Math.random() * 255) | 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    document.documentElement.style.setProperty("--grain", "url(" + c.toDataURL("image/png") + ")");
  });

  /* ---------- Menu mobilne ---------- */
  var toggle = $(".nav-toggle");
  var nav = document.getElementById("site-nav");
  var navOpen = false;
  function closeNav() {
    if (!nav || !toggle) return;
    navOpen = false;
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", tr("nav.open"));
  }
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      navOpen = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", navOpen ? "true" : "false");
      toggle.setAttribute("aria-label", tr(navOpen ? "nav.close" : "nav.open"));
    });
    nav.addEventListener("click", function (e) { if (e.target.closest("a")) closeNav(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeNav(); });
    window.addEventListener("resize", function () { if (window.innerWidth > 960) closeNav(); });
  }

  /* ---------- Nagłówek: chowanie + pasek postępu; linia kroków ---------- */
  var header = document.getElementById("site-header");
  var progressBar = $(".scroll-progress");
  var stepsWrap = document.getElementById("steps-wrap");
  var stepsFill = document.getElementById("steps-fill");
  var stepEls = stepsWrap ? $$(".step", stepsWrap) : [];
  var lastY = window.scrollY || 0;
  var scrollRaf = 0;

  function onScrollFrame() {
    scrollRaf = 0;
    var y = window.scrollY || 0;
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    if (progressBar) progressBar.style.setProperty("--p", max > 0 ? (y / max).toFixed(4) : "0");
    if (header) {
      if (y > lastY + 6 && y > 200 && !navOpen) header.classList.add("is-hidden");
      else if (y < lastY - 6 || y < 80) header.classList.remove("is-hidden");
    }
    lastY = y;
    if (stepsWrap && stepsFill) {
      var r = stepsWrap.getBoundingClientRect();
      var p = clamp01((window.innerHeight * 0.85 - r.top) / Math.max(1, r.height));
      stepsFill.style.setProperty("--p", p.toFixed(3));
      stepEls.forEach(function (s, i) { s.classList.toggle("is-lit", p >= i / 4 + 0.1); });
    }
  }
  function onScroll() { if (!scrollRaf) scrollRaf = requestAnimationFrame(onScrollFrame); }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScrollFrame();

  /* ---------- Kursor (desktop) ---------- */
  if (finePointer && !reduce) safe(function () {
    var glow = $(".cursor-glow");
    if (!glow) return;
    var gx = window.innerWidth / 2, gy = window.innerHeight / 2, tx = gx, ty = gy, raf = 0;
    function tick() {
      gx += (tx - gx) * 0.14;
      gy += (ty - gy) * 0.14;
      glow.style.transform = "translate3d(" + gx.toFixed(1) + "px," + gy.toFixed(1) + "px,0)";
      if (Math.abs(tx - gx) + Math.abs(ty - gy) > 0.4) raf = requestAnimationFrame(tick); else raf = 0;
    }
    window.addEventListener("pointermove", function (e) {
      tx = e.clientX; ty = e.clientY;
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
  });

  /* ---------- Kursor: kropka + pierścień (desktop) ---------- */
  if (finePointer && !reduce) safe(function () {
    var ring = $(".cursor-ring"), dot = $(".cursor-dot");
    if (!ring || !dot) return;
    var rx = -100, ry = -100, tx = -100, ty = -100, raf = 0, shown = false;
    function tick() {
      rx += (tx - rx) * 0.22; ry += (ty - ry) * 0.22;
      ring.style.transform = "translate3d(" + rx.toFixed(1) + "px," + ry.toFixed(1) + "px,0)";
      if (Math.abs(tx - rx) + Math.abs(ty - ry) > 0.3) raf = requestAnimationFrame(tick); else raf = 0;
    }
    window.addEventListener("pointermove", function (e) {
      tx = e.clientX; ty = e.clientY;
      dot.style.transform = "translate3d(" + tx + "px," + ty + "px,0)";
      if (!shown) { shown = true; ring.classList.remove("is-hidden"); dot.classList.remove("is-hidden"); }
      var t = e.target;
      var link = t.closest && t.closest("a, button, summary, [data-spotlight], label, select");
      var drag = t.closest && t.closest(".hero__canvas");
      ring.classList.toggle("is-link", !!link);
      ring.classList.toggle("is-drag", !!drag && !link);
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
    document.addEventListener("pointerleave", function () { ring.classList.add("is-hidden"); dot.classList.add("is-hidden"); shown = false; });
    document.addEventListener("pointerenter", function () { ring.classList.remove("is-hidden"); dot.classList.remove("is-hidden"); shown = true; });
  });

  /* ---------- Przyciski „magnetyczne” ---------- */
  if (finePointer && !reduce) $$("[data-magnetic]").forEach(function (el) {
    el.addEventListener("pointermove", function (e) {
      var r = el.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2);
      var dy = e.clientY - (r.top + r.height / 2);
      el.style.transform = "translate(" + (dx * 0.16).toFixed(1) + "px," + (dy * 0.22).toFixed(1) + "px)";
    });
    el.addEventListener("pointerleave", function () { el.style.transform = ""; });
  });

  /* ---------- Dzielenie nagłówków na słowa ---------- */
  function splitWords(el, step) {
    var accent = (el.getAttribute("data-accent") || "").split(/\s+/).filter(Boolean);
    var text = el.textContent.replace(/\s+/g, " ").trim();
    var words = text.split(" ");
    el.textContent = "";
    var frag = document.createDocumentFragment();
    words.forEach(function (w, i) {
      var outer = document.createElement("span");
      outer.className = "w";
      var inner = document.createElement("span");
      inner.className = "w__i" + (accent.indexOf(w.replace(/[.,]/g, "")) > -1 ? " w--accent" : "");
      inner.textContent = w;
      inner.style.setProperty("--d", (i * step).toFixed(3) + "s");
      outer.appendChild(inner);
      frag.appendChild(outer);
      if (i < words.length - 1) frag.appendChild(document.createTextNode(" "));
    });
    el.appendChild(frag);
  }

  /* ---------- Hero: wejście ---------- */
  safe(function () {
    var title = $("[data-words]");
    if (title) {
      splitWords(title, 0.05);
      requestAnimationFrame(function () { requestAnimationFrame(function () { title.classList.add("is-in"); }); });
    }
    $$("[data-rise]").forEach(function (el) {
      requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add("is-in"); }); });
    });
    /* kinetyczna typografia: grubość liter podąża za kursorem */
    if (title && finePointer && !reduce) {
      var words = $$(".w__i", title), centers = [], raf = 0, mx = -1, my = -1;
      function measure() { centers = words.map(function (w) { var r = w.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }); }
      function apply() {
        raf = 0;
        words.forEach(function (w, i) {
          var dx = centers[i][0] - mx, dy = centers[i][1] - my;
          var d = Math.sqrt(dx * dx + dy * dy);
          var k = 1 - clamp01(d / 320);
          w.style.setProperty("--wg", (640 + 160 * k * k).toFixed(0));
        });
      }
      measure();
      window.addEventListener("resize", measure);
      title.addEventListener("pointerenter", measure);
      window.addEventListener("pointermove", function (e) { mx = e.clientX; my = e.clientY; if (!raf) raf = requestAnimationFrame(apply); }, { passive: true });
    }

    /* dekodowanie etykiety */
    var eyebrow = $("[data-scramble]");
    if (eyebrow && !reduce) {
      var finalText = eyebrow.textContent;
      var glyphs = "01<>/|#&%$_-=+*";
      var frames = 0, total = 26;
      eyebrow.setAttribute("aria-label", finalText);
      (function step() {
        frames++;
        var reveal = Math.floor(finalText.length * frames / total);
        var out = "";
        for (var i = 0; i < finalText.length; i++) {
          var ch = finalText[i];
          out += (i < reveal || ch === " " || ch === "·") ? ch : glyphs[(Math.random() * glyphs.length) | 0];
        }
        eyebrow.textContent = frames < total ? out : finalText;
        if (frames < total) setTimeout(step, 36);
      })();
    }

    /* parallax tekstu w hero przy przewijaniu */
    var heroCopy = $(".hero__copy");
    if (heroCopy && !reduce) {
      var pRaf = 0;
      window.addEventListener("scroll", function () {
        if (pRaf) return;
        pRaf = requestAnimationFrame(function () {
          pRaf = 0;
          var y = window.scrollY || 0;
          var h = window.innerHeight || 1;
          var k = Math.min(1, y / h);
          heroCopy.style.transform = "translateY(" + (y * 0.18).toFixed(1) + "px)";
          heroCopy.style.opacity = (1 - k * 1.1).toFixed(3);
        });
      }, { passive: true });
    }
  });

  /* ---------- Hero: glitch tytułu, zegar i licznik HUD ---------- */
  safe(function () {
    var title = $(".hero__title");
    if (title && !reduce) {
      function glitch() {
        title.classList.remove("is-glitch"); void title.offsetWidth; title.classList.add("is-glitch");
        setTimeout(function () { title.classList.remove("is-glitch"); }, 700);
      }
      var introOn = document.documentElement.classList.contains("has-intro");
      if (introOn) window.addEventListener("intro:done", function () { setTimeout(glitch, 900); }); else setTimeout(glitch, 1300);
      (function loop() { setTimeout(function () { if (!document.hidden) glitch(); loop(); }, 9000 + Math.random() * 6000); })();
      window.addEventListener("scene:boom", glitch);
    }
    var clock = document.getElementById("hud-clock"), today = document.getElementById("hud-today");
    if (clock) {
      function tick() { var d = new Date(); clock.textContent = [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (n) { return (n < 10 ? "0" : "") + n; }).join(":"); }
      tick(); setInterval(tick, 1000);
    }
    if (today) {
      var base = 0;
      try { base = parseInt(sessionStorage.getItem("ts-today") || "0", 10) || 0; } catch (e) {}
      if (!base) { var d0 = new Date(); base = 120 + Math.round((d0.getHours() * 60 + d0.getMinutes()) * 0.9); }
      var n = base;
      today.textContent = tr("hud.tasks", { n: n });
      window.addEventListener("scene:event", function () {
        n++; today.textContent = tr("hud.tasks", { n: n });
        try { sessionStorage.setItem("ts-today", String(n)); } catch (e) {}
      });
    }
  });

  /* ---------- Przebieg procesu (synchronizacja ze sceną) + wskaźniki ---------- */
  safe(function () {
    var flow = document.getElementById("flow-hud");
    if (flow) {
      var steps = $$(".flow-step", flow), fill = document.getElementById("flow-fill"), now = document.getElementById("flow-now");
      var N = steps.length;
      function setActive(idx) {
        steps.forEach(function (s, i) { s.classList.toggle("is-done", i < idx); s.classList.toggle("is-active", i === idx); });
        if (fill) fill.style.width = (idx / (N - 1) * 100).toFixed(1) + "%";
        flow.classList.toggle("is-complete", idx === N - 1);
      }
      window.addEventListener("scene:event", function (e) {
        var d = e.detail || {};
        var step = d.step || 0;
        if (now && d.text) now.textContent = d.text;
        if (step === 0) {
          flow.classList.remove("is-complete");
          setActive(0);
          setTimeout(function () { setActive(1); }, 650);
        } else {
          setActive(step + 1);
        }
      });
      setActive(0);
    }
    var gLoad = document.getElementById("g-load"), gLoadV = document.getElementById("g-load-v"), gSaved = document.getElementById("g-saved"), gSavedV = document.getElementById("g-saved-v"), gAuto = document.getElementById("g-auto");
    var C = 94.2;
    function ring(el, p) { if (el) el.style.strokeDashoffset = (C * (1 - clamp01(p))).toFixed(1); }
    if (gAuto) ring(gAuto, 1);
    var load = 0.37, loadT = 0.37, burst = 0;
    window.addEventListener("scene:event", function () { burst = 0.35 + Math.random() * 0.3; });
    function tasksNow() { var t = document.getElementById("hud-today"); return t ? parseInt(t.textContent, 10) || 0 : 0; }
    (function tickGauges() {
      if (!reduce) { loadT += (Math.random() - 0.5) * 0.08; loadT = clamp01(Math.min(0.72, Math.max(0.18, loadT))); }
      burst *= 0.6;
      load += (loadT + burst - load) * 0.35;
      ring(gLoad, load); if (gLoadV) gLoadV.textContent = Math.round(load * 100) + "%";
      var saved = tasksNow() * 0.4 / 60;
      ring(gSaved, saved / 16); if (gSavedV) gSavedV.textContent = tr("hud.hours", { n: I18N.num(saved, { min: 1, max: 1 }) });
      setTimeout(tickGauges, 900);
    })();
  });

  /* ---------- Ujawnianie na scroll ---------- */
  safe(function () {
    $$("[data-reveal-group]").forEach(function (g) {
      [].forEach.call(g.children, function (c, i) { c.style.setProperty("--i", i); });
    });
    $$("[data-words-scroll]").forEach(function (el) { splitWords(el, 0.045); });
    var targets = $$("[data-reveal], [data-words-scroll]");
    if (!("IntersectionObserver" in window) || reduce) {
      targets.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add("is-in");
        io.unobserve(en.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    targets.forEach(function (el) { io.observe(el); });
    window.addEventListener("reveal:refresh", function () {
      $$("[data-reveal], [data-words-scroll]").forEach(function (el) {
        if (el.classList.contains("is-in") || targets.indexOf(el) > -1) return;
        if (el.hasAttribute("data-words-scroll") && !el.querySelector(".w")) splitWords(el, 0.045);
        targets.push(el); io.observe(el);
      });
    });
  });

  /* ---------- Karty „spotlight” ---------- */
  if (finePointer) $$("[data-spotlight]").forEach(function (el) {
    el.addEventListener("pointermove", function (e) {
      var r = el.getBoundingClientRect();
      el.style.setProperty("--mx", (e.clientX - r.left).toFixed(0) + "px");
      el.style.setProperty("--my", (e.clientY - r.top).toFixed(0) + "px");
    });
  });

  /* ---------- Aktywna sekcja w menu ---------- */
  safe(function () {
    var links = $$('.nav a[href^="#"]');
    var sections = links.map(function (a) { return document.querySelector(a.getAttribute("href")); }).filter(Boolean);
    if (!("IntersectionObserver" in window) || !sections.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = "#" + entry.target.id;
        links.forEach(function (l) { l.classList.toggle("is-active", l.getAttribute("href") === id); });
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    sections.forEach(function (s) { io.observe(s); });
  });

  /* ---------- Motyw: menu w nagłówku (domyślnie Granat) ---------- */
  safe(function () {
    var wrap = document.getElementById("theme"), btn = document.getElementById("theme-btn"), menu = document.getElementById("theme-menu");
    if (!wrap || !btn || !menu) return;
    var root = document.documentElement;
    var DEFAULT = "slate";
    try { var cfg = JSON.parse(localStorage.getItem("ts-config") || "null"); if (cfg && cfg.theme && cfg.theme["default"]) DEFAULT = cfg.theme["default"]; } catch (e) {}
    function setTheme(name) {
      if (name === "dark") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", name);
      $$("[data-theme-set]", menu).forEach(function (b) { b.setAttribute("aria-checked", b.getAttribute("data-theme-set") === name ? "true" : "false"); });
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", getComputedStyle(root).getPropertyValue("--bg").trim() || "#141c31");
      try { window.dispatchEvent(new CustomEvent("themechange", { detail: name })); } catch (e) {}
    }
    function apply(name, persist, origin) {
      if (persist) { try { localStorage.setItem("ts-theme", name); } catch (e) {} }
      if (origin && !reduce && document.startViewTransition) {
        var x = origin.x, y = origin.y;
        var r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        var vt = document.startViewTransition(function () { setTheme(name); });
        vt.ready.then(function () {
          root.animate(
            { clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + r + "px at " + x + "px " + y + "px)"] },
            { duration: 700, easing: "cubic-bezier(0.4, 0, 0.2, 1)", pseudoElement: "::view-transition-new(root)" }
          );
        }).catch(function () {});
        return;
      }
      setTheme(name);
    }
    var saved = null;
    try { saved = localStorage.getItem("ts-theme"); } catch (e) {}
    setTheme(saved || DEFAULT);

    function open() { menu.hidden = false; btn.setAttribute("aria-expanded", "true"); }
    function close() { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); }
    btn.addEventListener("click", function () { if (menu.hidden) open(); else close(); });
    menu.addEventListener("click", function (e) {
      var b = e.target.closest("[data-theme-set]");
      if (!b) return;
      var r = b.getBoundingClientRect();
      apply(b.getAttribute("data-theme-set"), true, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      close();
    });
    document.addEventListener("click", function (e) { if (!wrap.contains(e.target)) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    window.addEventListener("config:loaded", function (e) {
      var c = e.detail || {};
      if (c.features && c.features.themeSwitch === false) wrap.hidden = true;
      if (!saved && c.theme && c.theme["default"] && c.theme["default"] !== (root.getAttribute("data-theme") || "dark")) setTheme(c.theme["default"]);
    });
  });

  /* ---------- Easter egg: kod Konami albo klik w rdzeń AI ---------- */
  safe(function () {
    var seq = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"], pos = 0;
    document.addEventListener("keydown", function (e) {
      pos = e.key === seq[pos] ? pos + 1 : (e.key === seq[0] ? 1 : 0);
      if (pos === seq.length) { pos = 0; window.dispatchEvent(new CustomEvent("scene:boom")); }
    });
    var core = $("[data-core]");
    if (core) core.addEventListener("click", function () { window.dispatchEvent(new CustomEvent("scene:boom")); });
  });

  /* ---------- Zdarzenia dla reklam i analityki (dataLayer) ---------- */
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a, button");
    if (!a || !window.tsTrack) return;
    var href = a.getAttribute("href") || "";
    if (a.id === "wa-fab" || /wa\.me/.test(href)) window.tsTrack("contact_click", { method: "whatsapp" });
    else if (href.indexOf("tel:") === 0) window.tsTrack("contact_click", { method: "phone" });
    else if (href.indexOf("mailto:") === 0) window.tsTrack("contact_click", { method: "email" });
    else if (href === "#kontakt") window.tsTrack("cta_click", { label: (a.textContent || "").trim().slice(0, 60) });
  });

  /* ---------- Rok w stopce ---------- */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

})();
