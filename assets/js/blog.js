/* TSoftware — blog.js: udostępnianie, aktywny punkt spisu treści, licznik. */
(function () {
  "use strict";
  var $$ = function (s, c) { return [].slice.call((c || document).querySelectorAll(s)); };

  /* udostępnianie */
  $$("[data-share]").forEach(function (box) {
    var url = box.getAttribute("data-url"), title = box.getAttribute("data-title");
    var done = box.querySelector(".share__done");
    var copy = box.querySelector("[data-copy]"), nat = box.querySelector("[data-native]");
    function say(t) { if (!done) return; done.textContent = t; setTimeout(function () { done.textContent = ""; }, 2200); }
    if (copy) copy.addEventListener("click", function () {
      var ok = function () { say("Link skopiowany"); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, function () { fallback(); });
      else fallback();
      function fallback() { var i = document.createElement("input"); i.value = url; document.body.appendChild(i); i.select(); try { document.execCommand("copy"); ok(); } catch (e) { say(url); } document.body.removeChild(i); }
      if (window.tsTrack) window.tsTrack("share", { method: "copy", content_id: url });
    });
    if (nat && navigator.share) {
      nat.hidden = false;
      nat.addEventListener("click", function () { navigator.share({ title: title, url: url }).catch(function () {}); if (window.tsTrack) window.tsTrack("share", { method: "native", content_id: url }); });
    }
    $$("a[data-net]", box).forEach(function (a) { a.addEventListener("click", function () { if (window.tsTrack) window.tsTrack("share", { method: a.getAttribute("data-net"), content_id: url }); }); });
  });

  /* spis treści: podświetlenie bieżącej sekcji */
  var links = $$(".toc a[href^='#']");
  if (links.length && "IntersectionObserver" in window) {
    var map = {}, heads = [];
    links.forEach(function (a) { var el = document.getElementById(decodeURIComponent(a.getAttribute("href").slice(1))); if (el) { map[el.id] = a; heads.push(el); } });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { links.forEach(function (l) { l.classList.remove("is-active"); }); map[en.target.id].classList.add("is-active"); } });
    }, { rootMargin: "-20% 0px -70% 0px" });
    heads.forEach(function (h) { io.observe(h); });
  }

  /* zdarzenie: przeczytano wpis (90% przewinięcia) */
  var body = document.getElementById("tresc");
  if (body && window.tsTrack) {
    var sent = false;
    window.addEventListener("scroll", function () {
      if (sent) return;
      var r = body.getBoundingClientRect();
      if (r.bottom - window.innerHeight < r.height * 0.1) { sent = true; window.tsTrack("post_read", { content_id: location.pathname }); }
    }, { passive: true });
  }
})();
