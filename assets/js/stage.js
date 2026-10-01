/* TSoftware — stage.js
   Scena „Jak to działa”: przewijanie strony steruje przebiegiem automatyzacji.
   Postęp (0–1) wynika z pozycji sekcji; stan sceny jest funkcją postępu,
   więc działa w obie strony i bez bibliotek. */
(function () {
  "use strict";

  var stage = document.getElementById("jak-to-dziala");
  var track = document.getElementById("stage-track");
  var viz = document.getElementById("viz");
  if (!stage || !track || !viz) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var nodes = [].slice.call(viz.querySelectorAll(".vnode"));
  var lit = [].slice.call(viz.querySelectorAll(".viz__lit"));
  var packet = document.getElementById("packet");
  var steps = [].slice.call(document.querySelectorAll("#stage-steps .stage__step"));
  var logs = [].slice.call(document.querySelectorAll("#stage-log span"));
  var hudStatus = document.getElementById("hud-status");
  var hudStep = document.getElementById("hud-step");
  var hudRing = document.getElementById("hud-ring");
  var hudPct = document.getElementById("hud-pct");
  var countHuman = document.getElementById("count-human");
  var countSaved = document.getElementById("count-saved");
  var RING = 97.4;

  if (reduce) {
    /* bez animacji: pokaż stan końcowy w zwykłym przepływie strony */
    stage.classList.add("is-static");
    viz.classList.add("is-done");
    nodes.forEach(function (n) { n.classList.add("is-on"); });
    lit.forEach(function (p) { p.style.strokeDasharray = "none"; });
    logs.forEach(function (l) { l.classList.add("is-shown"); });
    if (hudStatus) hudStatus.textContent = "zakończono";
    if (hudStep) hudStep.textContent = "05";
    if (hudPct) hudPct.textContent = "100%";
    if (hudRing) hudRing.style.strokeDashoffset = 0;
    if (countHuman) countHuman.textContent = "1";
    if (countSaved) countSaved.textContent = "25";
    return;
  }

  /* Oś czasu (udział postępu 0–1) */
  var T = {
    act: [0.08, 0.26, 0.44, 0.62, 0.80],
    seg: [[0.12, 0.24], [0.30, 0.42], [0.48, 0.60], [0.66, 0.78]],
    done: 0.86
  };
  var logAt = [0.09, 0.27, 0.45, 0.63, 0.81, 0.88];

  var lens = [];
  var stepsBox = document.getElementById("stage-steps");
  function measure() {
    lens = lit.map(function (p) {
      var L = p.getTotalLength();
      p.style.strokeDasharray = L;
      return L;
    });
    /* kontener kroków ma wysokość najwyższego z nich (kroki są pozycjonowane absolutnie) */
    if (stepsBox) {
      var max = 0;
      steps.forEach(function (s) { max = Math.max(max, s.offsetHeight); });
      if (max) stepsBox.style.minHeight = max + "px";
    }
  }
  measure();

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  var lastStep = -1, lastDone = null, lastLogN = -1;

  function render(p) {
    /* aktywny krok w readoucie */
    var stepIdx = 0;
    if (p >= T.done) stepIdx = 6;
    else for (var k = 4; k >= 0; k--) { if (p >= T.act[k]) { stepIdx = k + 1; break; } }

    if (stepIdx !== lastStep) {
      steps.forEach(function (s, i) {
        s.classList.toggle("is-active", i === stepIdx);
        s.classList.toggle("is-prev", i < stepIdx);
      });
      if (hudStep) hudStep.textContent = pad(Math.min(stepIdx, 5));
      if (hudStatus) hudStatus.textContent = stepIdx === 0 ? "oczekiwanie" : stepIdx === 6 ? "zakończono" : "w toku";
      lastStep = stepIdx;
    }

    /* węzły */
    nodes.forEach(function (n, i) {
      var on = p >= T.act[i];
      n.classList.toggle("is-on", on);
      n.classList.toggle("is-live", on && stepIdx === i + 1);
    });

    /* połączenia i pakiet danych */
    var packetVisible = false;
    lit.forEach(function (path, i) {
      var s = T.seg[i];
      var u = clamp01((p - s[0]) / (s[1] - s[0]));
      var e = easeInOut(u);
      path.style.strokeDashoffset = lens[i] * (1 - e);
      if (u > 0 && u < 1) {
        var pt = path.getPointAtLength(lens[i] * e);
        packet.style.left = pt.x + "%";
        packet.style.top = pt.y + "%";
        packetVisible = true;
      }
    });
    packet.classList.toggle("is-visible", packetVisible);

    /* HUD */
    if (hudRing) hudRing.style.strokeDashoffset = RING * (1 - p);
    if (hudPct) hudPct.textContent = Math.round(p * 100) + "%";

    /* log */
    var n = 0;
    for (var j = 0; j < logAt.length; j++) if (p >= logAt[j]) n++;
    if (n !== lastLogN) {
      logs.forEach(function (l, i) {
        l.classList.toggle("is-shown", i < n);
        l.classList.toggle("is-last", i === n - 1);
      });
      lastLogN = n;
    }

    /* wynik */
    var done = p >= T.done;
    if (done !== lastDone) { viz.classList.toggle("is-done", done); lastDone = done; }
    if (done) {
      var u2 = smooth(clamp01((p - T.done) / (1 - T.done)));
      if (countHuman) countHuman.textContent = String(Math.round(26 - 25 * u2));
      if (countSaved) countSaved.textContent = String(Math.round(25 * u2));
    } else {
      if (countHuman) countHuman.textContent = "26";
      if (countSaved) countSaved.textContent = "0";
    }
  }

  /* postęp ze scrolla + wygładzanie */
  var target = 0, current = 0, raf = 0;
  function progress() {
    var r = track.getBoundingClientRect();
    var total = r.height - window.innerHeight;
    if (total <= 0) return 0;
    return clamp01(-r.top / total);
  }
  function loop() {
    current += (target - current) * 0.16;
    if (Math.abs(target - current) < 0.0006) {
      current = target;
      render(current);
      raf = 0;
      return;
    }
    render(current);
    raf = requestAnimationFrame(loop);
  }
  function update() {
    target = progress();
    if (!raf) raf = requestAnimationFrame(loop);
  }

  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", function () { measure(); update(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(update);

  target = progress();
  current = target;
  render(current);
})();
