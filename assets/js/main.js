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
    toggle.setAttribute("aria-label", "Otwórz menu");
  }
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      navOpen = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", navOpen ? "true" : "false");
      toggle.setAttribute("aria-label", navOpen ? "Zamknij menu" : "Otwórz menu");
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
    var card = $(".hero__card");
    if (card) setTimeout(function () { card.classList.add("is-in"); }, 250);

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

    /* karta 3D pod kursorem */
    var hero = $(".hero");
    var tilt = $("[data-tilt]");
    if (hero && tilt && finePointer && !reduce) {
      hero.addEventListener("pointermove", function (e) {
        var r = hero.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;
        tilt.style.setProperty("--ry", (x * 7).toFixed(2) + "deg");
        tilt.style.setProperty("--rx", (-y * 7).toFixed(2) + "deg");
      });
      hero.addEventListener("pointerleave", function () {
        tilt.style.setProperty("--rx", "0deg");
        tilt.style.setProperty("--ry", "0deg");
      });
    }

    /* log w karcie: maszyna do pisania */
    var log = document.getElementById("pipeline-log");
    if (log && !reduce) {
      var lines = $$("span", log).map(function (s) { return { el: s, html: s.innerHTML, text: s.textContent }; });
      var visible = true;
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(log);
      }
      var li = 0, ci = 0;
      function typeNext() {
        if (!visible || document.hidden) { setTimeout(typeNext, 400); return; }
        var line = lines[li];
        if (ci === 0) { line.el.classList.add("caret"); }
        ci++;
        line.el.textContent = line.text.slice(0, ci);
        if (ci < line.text.length) { setTimeout(typeNext, 18 + Math.random() * 30); return; }
        line.el.innerHTML = line.html;
        line.el.classList.remove("caret");
        li++; ci = 0;
        if (li < lines.length) { setTimeout(typeNext, 420); return; }
        setTimeout(function () {
          lines.forEach(function (l) { l.el.textContent = ""; });
          li = 0;
          setTimeout(typeNext, 500);
        }, 3200);
      }
      setTimeout(function () {
        lines.forEach(function (l) { l.el.textContent = ""; });
        typeNext();
      }, 900);
    }
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

  /* ---------- Przełącznik motywów (wersja szkicowa) ---------- */
  safe(function () {
    var sw = $(".theme-switch");
    if (!sw) return;
    var root = document.documentElement;
    function apply(name, persist) {
      if (name === "dark") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", name);
      $$("button", sw).forEach(function (b) { b.classList.toggle("is-on", b.getAttribute("data-theme-set") === name); });
      if (persist) { try { localStorage.setItem("ts-theme", name); } catch (e) {} }
      try { window.dispatchEvent(new CustomEvent("themechange", { detail: name })); } catch (e) {}
    }
    var saved = null;
    try { saved = localStorage.getItem("ts-theme"); } catch (e) {}
    apply(saved || "dark", false);
    sw.addEventListener("click", function (e) {
      var b = e.target.closest("[data-theme-set]");
      if (b) apply(b.getAttribute("data-theme-set"), true);
    });
  });

  /* ---------- Rok w stopce ---------- */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  /* ---------- Formularz (szkic: otwiera program pocztowy) ----------
     Docelowo podłącz usługę formularzy albo własny endpoint — opis w README.md. */
  var form = document.getElementById("contact-form");
  if (form) {
    var status = document.getElementById("form-status");
    var email = form.getAttribute("data-email") || "kontakt@tsoftware.online";
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var data = new FormData(form);
      var topic = data.get("topic") || "konsultacja";
      var subject = "Zapytanie ze strony: " + topic;
      var body = [
        "Imię i nazwisko: " + (data.get("name") || ""),
        "Firma: " + (data.get("company") || "-"),
        "E-mail: " + (data.get("email") || ""),
        "Temat: " + topic,
        "",
        data.get("message") || ""
      ].join("\n");
      window.location.href = "mailto:" + email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
      if (status) status.textContent = "Otwieramy Twój program pocztowy z gotową wiadomością. Jeśli nic się nie wydarzyło, napisz bezpośrednio na " + email + ".";
    });
  }
})();
