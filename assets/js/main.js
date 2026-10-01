/* TSoftware — main.js
   Menu mobilne, podświetlanie aktywnej sekcji, rok w stopce,
   formularz kontaktowy (wersja szkicowa: otwiera program pocztowy). */
(function () {
  "use strict";

  /* ---------- Menu mobilne ---------- */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");

  function closeNav() {
    if (!nav || !toggle) return;
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Otwórz menu");
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Zamknij menu" : "Otwórz menu");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) closeNav();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeNav();
    });
    window.addEventListener("resize", function () {
      if (window.innerWidth > 960) closeNav();
    });
  }

  /* ---------- Aktywna sekcja w menu ---------- */
  var links = Array.prototype.slice.call(document.querySelectorAll('.nav a[href^="#"]'));
  var sections = links
    .map(function (a) { return document.querySelector(a.getAttribute("href")); })
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = "#" + entry.target.id;
        links.forEach(function (link) {
          link.classList.toggle("is-active", link.getAttribute("href") === id);
        });
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    sections.forEach(function (s) { observer.observe(s); });
  }

  /* ---------- Rok w stopce ---------- */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  /* ---------- Formularz kontaktowy ----------
     Wersja szkicowa bez backendu: składa wiadomość i otwiera program pocztowy.
     Docelowo podłącz usługę formularzy (np. Formspree) lub własny endpoint —
     opis w README.md. */
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

      window.location.href =
        "mailto:" + email +
        "?subject=" + encodeURIComponent(subject) +
        "&body=" + encodeURIComponent(body);

      if (status) {
        status.textContent =
          "Otwieramy Twój program pocztowy z gotową wiadomością. " +
          "Jeśli nic się nie wydarzyło, napisz bezpośrednio na " + email + ".";
      }
    });
  }
})();
