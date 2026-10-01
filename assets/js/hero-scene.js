/* TSoftware — hero-scene.js
   Scena w hero. Jeden canvas WebGL, dwa przebiegi:
     1. tło: zorza (fbm) w kolorach motywu,
     2. sieć 3D: systemy klienta (huby) wokół rdzenia AI, połączenia, impulsy.
   Etykiety hubów, rdzeń i „zdarzenia” to elementy HTML rzutowane na ekran
   tą samą macierzą, więc trzymają się węzłów przy obrocie i zmianie rozmiaru.
   Bez bibliotek. Renderuje w obniżonej rozdzielczości, zatrzymuje się poza
   ekranem i w ukrytej karcie; przy „ograniczonym ruchu” rysuje jedną klatkę. */
(function () {
  "use strict";

  var canvas = document.getElementById("hero-canvas");
  var hero = document.querySelector(".hero");
  var copy = hero && hero.querySelector(".hero__copy");
  var labelsRoot = document.getElementById("scene-labels");
  if (!canvas || !hero || !labelsRoot) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  var gl = canvas.getContext("webgl", {
    antialias: true, alpha: false, depth: false, stencil: false,
    premultipliedAlpha: false, powerPreference: "high-performance"
  }) || canvas.getContext("experimental-webgl");
  if (!gl) { hero.classList.add("hero--nogl"); return; }

  /* =========================================================================
     Narzędzia
     ========================================================================= */
  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      if (window.console) console.warn("shader:", gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }
  function program(vsSrc, fsSrc) {
    var vs = compile(gl.VERTEX_SHADER, vsSrc);
    var fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    var p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
  }
  function hexToRgb(hex) {
    hex = (hex || "").trim().replace("#", "");
    if (hex.length === 3) hex = hex.replace(/(.)/g, "$1$1");
    var n = parseInt(hex, 16);
    if (isNaN(n)) return [0, 0, 0];
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  /* deterministyczny generator: scena wygląda tak samo przy każdym wejściu */
  function mulberry32(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* macierze 4x4, kolumnowo (jak w WebGL) */
  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  function mul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  function rotX(t) { var c = Math.cos(t), s = Math.sin(t); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); }
  function rotY(t) { var c = Math.cos(t), s = Math.sin(t); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); }
  function translate(x, y, z) { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]); }
  function project(m, x, y, z) {
    var cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    var cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    var cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    return [cx / cw, cy / cw, cw];
  }

  /* =========================================================================
     Shadery
     ========================================================================= */
  var AURORA_VS = "attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}";
  var AURORA_FS = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH", "precision highp float;", "#else", "precision mediump float;", "#endif",
    "uniform vec2 u_res;uniform float u_time;uniform vec2 u_mouse;",
    "uniform vec3 u_bg;uniform vec3 u_a;uniform vec3 u_b;uniform vec3 u_c;uniform float u_light;uniform vec2 u_focus;",
    "float hash21(vec2 p){p=fract(p*vec2(234.34,435.345));p+=dot(p,p+34.23);return fract(p.x*p.y);}",
    "float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);",
    "  float a=hash21(i),b=hash21(i+vec2(1.0,0.0)),c=hash21(i+vec2(0.0,1.0)),d=hash21(i+vec2(1.0,1.0));",
    "  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}",
    "float fbm(vec2 p){float v=0.0;float a=0.5;mat2 m=mat2(0.86,0.5,-0.5,0.86);",
    "  for(int i=0;i<4;i++){v+=a*noise(p);p=m*p*2.02+vec2(1.3,0.7);a*=0.5;}return v;}",
    "void main(){",
    "  vec2 uv=gl_FragCoord.xy/u_res;",
    "  vec2 p=(gl_FragCoord.xy-0.5*u_res)/u_res.y;",
    "  vec2 pf=(gl_FragCoord.xy-u_focus*u_res)/u_res.y;",
    "  float t=u_time*0.05;",
    "  vec2 q=vec2(fbm(p*1.2+vec2(t,-t*0.7)),fbm(p*1.2+vec2(-t*0.5,t*0.9)+4.7));",
    "  float n=fbm(p*1.7+1.5*q);",
    "  float warm=fbm(p*2.4-q*1.3+vec2(t*1.6,-t));",
    "  vec2 m=(u_mouse-0.5*u_res)/u_res.y;",
    "  float d=length(p-m);",
    "  float halo=exp(-dot(pf,pf)*2.2);",
    "  float vig=smoothstep(1.6,0.3,length(p));",
    "  float lx=smoothstep(0.0,0.55,uv.x);",
    "  vec3 col=u_bg;",
    "  if(u_light<0.5){",
    "    col+=u_a*smoothstep(0.30,0.72,n)*0.7;",
    "    col+=u_b*smoothstep(0.52,0.86,n)*0.45;",
    "    col+=u_c*smoothstep(0.64,0.92,warm)*0.26;",
    "    col+=u_a*halo*0.55;",
    "    col+=u_a*0.35*exp(-d*d*3.5);",
    "    col*=mix(0.55,1.0,vig);",
    "    col*=mix(0.45,1.0,lx);",
    "  }else{",
    "    col=mix(col,u_b,smoothstep(0.30,0.72,n)*0.45);",
    "    col=mix(col,u_a,smoothstep(0.55,0.88,n)*0.35);",
    "    col=mix(col,u_c,smoothstep(0.66,0.92,warm)*0.2);",
    "    col=mix(col,u_b,halo*0.45);",
    "    col=mix(col,u_b,0.3*exp(-d*d*3.5));",
    "    col=mix(col,u_bg,(1.0-vig)*0.5);",
    "    col=mix(col,u_bg,(1.0-lx)*0.6);",
    "  }",
    "  gl_FragColor=vec4(col,1.0);",
    "}"
  ].join("\n");

  var NET_VS = [
    "attribute vec3 a_pos;attribute vec4 a_col;attribute float a_size;",
    "uniform mat4 u_mvp;uniform vec2 u_off;uniform float u_px;",
    "varying vec4 v_col;varying float v_depth;",
    "void main(){",
    "  vec4 clip=u_mvp*vec4(a_pos,1.0);",
    "  clip.xy+=u_off*clip.w;",
    "  gl_Position=clip;",
    "  v_depth=clip.w;",
    "  gl_PointSize=a_size*u_px*(7.2/max(clip.w,0.4));",
    "  v_col=a_col;",
    "}"
  ].join("\n");
  var POINT_FS = [
    "precision mediump float;varying vec4 v_col;varying float v_depth;uniform float u_light;uniform float u_near;uniform float u_far;",
    "void main(){",
    "  vec2 c=gl_PointCoord-0.5;float d=length(c)*2.0;",
    "  float core=smoothstep(0.5,0.0,d);",
    "  float halo=smoothstep(1.0,0.15,d)*0.32;",
    "  float fog=smoothstep(u_far,u_near,v_depth);",
    "  float a=(core+halo)*v_col.a*fog;",
    "  if(a<0.004)discard;",
    "  if(u_light>0.5){gl_FragColor=vec4(v_col.rgb,a);}else{gl_FragColor=vec4(v_col.rgb*a,a);}",
    "}"
  ].join("\n");
  var LINE_FS = [
    "precision mediump float;varying vec4 v_col;varying float v_depth;uniform float u_light;uniform float u_near;uniform float u_far;",
    "void main(){",
    "  float fog=smoothstep(u_far,u_near,v_depth);",
    "  float a=v_col.a*fog;",
    "  if(u_light>0.5){gl_FragColor=vec4(v_col.rgb,a);}else{gl_FragColor=vec4(v_col.rgb*a,a);}",
    "}"
  ].join("\n");

  var auroraProg = program(AURORA_VS, AURORA_FS);
  var pointProg = program(NET_VS, POINT_FS);
  var lineProg = program(NET_VS, LINE_FS);
  if (!auroraProg || !pointProg || !lineProg) { hero.classList.add("hero--nogl"); return; }

  function uniforms(prog, names) {
    var o = {};
    names.forEach(function (n) { o[n] = gl.getUniformLocation(prog, n); });
    return o;
  }
  var AU = uniforms(auroraProg, ["u_res", "u_time", "u_mouse", "u_bg", "u_a", "u_b", "u_c", "u_light", "u_focus"]);
  var PU = uniforms(pointProg, ["u_mvp", "u_off", "u_px", "u_light", "u_near", "u_far"]);
  var LU = uniforms(lineProg, ["u_mvp", "u_off", "u_px", "u_light", "u_near", "u_far"]);
  var attrs = {
    quad: gl.getAttribLocation(auroraProg, "a"),
    pPos: gl.getAttribLocation(pointProg, "a_pos"), pCol: gl.getAttribLocation(pointProg, "a_col"), pSize: gl.getAttribLocation(pointProg, "a_size"),
    lPos: gl.getAttribLocation(lineProg, "a_pos"), lCol: gl.getAttribLocation(lineProg, "a_col"), lSize: gl.getAttribLocation(lineProg, "a_size")
  };

  var quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  /* =========================================================================
     Geometria sieci: rdzeń AI, 6 hubów (systemy), ich dane i pył w tle
     ========================================================================= */
  var rand = mulberry32(20240917);
  var HUBS = [
    { id: "sklep" }, { id: "erp" }, { id: "crm" }, { id: "mail" }, { id: "magazyn" }, { id: "ksiegowosc" }
  ];
  var nodes = [];      /* {x,y,z,size,kind,hub} */
  var edges = [];      /* {a,b,alpha,flow} */

  function addNode(x, y, z, size, kind, hub) { nodes.push({ x: x, y: y, z: z, size: size, kind: kind, hub: hub }); return nodes.length - 1; }
  function randomInSphere(r, bias) {
    var u = Math.pow(rand(), bias || 1), th = rand() * Math.PI * 2, ph = Math.acos(2 * rand() - 1);
    return [r * u * Math.sin(ph) * Math.cos(th), r * u * Math.sin(ph) * Math.sin(th), r * u * Math.cos(ph)];
  }
  function dist2(i, j) { var a = nodes[i], b = nodes[j]; return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) + (a.z - b.z) * (a.z - b.z); }
  function nearest(i, pool, k) {
    return pool.filter(function (j) { return j !== i; })
      .sort(function (p, q) { return dist2(i, p) - dist2(i, q); })
      .slice(0, k);
  }
  function addEdge(a, b, alpha, flow) {
    if (a === b) return;
    for (var i = 0; i < edges.length; i++) if ((edges[i].a === a && edges[i].b === b) || (edges[i].a === b && edges[i].b === a)) return;
    edges.push({ a: a, b: b, alpha: alpha, flow: !!flow });
  }

  /* rdzeń */
  var coreIds = [];
  for (var i = 0; i < 36; i++) { var p = randomInSphere(0.24, 0.55); coreIds.push(addNode(p[0], p[1], p[2], 2.0 + rand() * 1.4, "core", -1)); }
  coreIds.forEach(function (id) { nearest(id, coreIds, 2).forEach(function (j) { addEdge(id, j, 0.6, true); }); });

  /* huby na lekko pofalowanym pierścieniu */
  var RING = 1.08;
  HUBS.forEach(function (h, k) {
    var ang = (k / HUBS.length) * Math.PI * 2 + 0.55;
    var y = 0.16 * Math.sin(ang * 2 + 0.8);
    h.node = addNode(RING * Math.cos(ang), y, RING * Math.sin(ang), 5.2, "hub", k);
    h.cluster = [h.node];
    for (var s = 0; s < 13; s++) {
      var q = randomInSphere(0.34, 0.8);
      h.cluster.push(addNode(nodes[h.node].x + q[0], nodes[h.node].y + q[1] * 0.7, nodes[h.node].z + q[2], 1.5 + rand() * 1.1, "sat", k));
    }
    h.cluster.slice(1).forEach(function (id) { nearest(id, h.cluster, 2).forEach(function (j) { addEdge(id, j, 0.42, false); }); });
    nearest(h.node, coreIds, 3).forEach(function (j) { addEdge(h.node, j, 0.9, true); });
  });
  HUBS.forEach(function (h, k) { addEdge(h.node, HUBS[(k + 1) % HUBS.length].node, 0.3, true); });

  /* pył: głębia i skala */
  var dustIds = [];
  for (var d = 0; d < 150; d++) {
    var v = randomInSphere(2.1, 0.5);
    var len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (len < 0.75) continue;
    dustIds.push(addNode(v[0], v[1] * 0.75, v[2], 1.0 + rand() * 0.9, "dust", -1));
  }
  dustIds.forEach(function (id) {
    var n = nearest(id, dustIds, 1)[0];
    if (n !== undefined && dist2(id, n) < 0.3) addEdge(id, n, 0.18, false);
  });

  var flowEdges = edges.filter(function (e) { return e.flow; });

  /* =========================================================================
     Bufory
     ========================================================================= */
  var STRIDE = 8 * 4; /* x y z r g b a size */
  var pointData = new Float32Array(nodes.length * 8);
  var lineData = new Float32Array(edges.length * 2 * 8);
  var MAX_PULSES = 96;
  var pulseData = new Float32Array(MAX_PULSES * 8);
  var pointBuf = gl.createBuffer(), lineBuf = gl.createBuffer(), pulseBuf = gl.createBuffer();

  var palette = { bg: [0, 0, 0], a: [0, 0, 0], b: [0, 0, 0], c: [0, 0, 0], light: 0, fg: [1, 1, 1] };

  function readPalette() {
    var cs = getComputedStyle(document.documentElement);
    palette.bg = hexToRgb(cs.getPropertyValue("--shader-bg") || "#070b16");
    palette.a = hexToRgb(cs.getPropertyValue("--shader-a") || "#3f6ff5");
    palette.b = hexToRgb(cs.getPropertyValue("--shader-b") || "#78a2ff");
    palette.c = hexToRgb(cs.getPropertyValue("--shader-c") || "#ffb45c");
    palette.fg = hexToRgb(cs.getPropertyValue("--fg") || "#e9eef9");
    palette.light = parseFloat(cs.getPropertyValue("--shader-light")) || 0;
  }

  function nodeColor(n) {
    var L = palette.light > 0.5;
    switch (n.kind) {
      case "core": return L ? palette.a.concat(0.9) : mix(palette.b, [1, 1, 1], 0.35).concat(0.95);
      case "hub": return L ? mix(palette.a, [0, 0, 0], 0.15).concat(1) : [1, 1, 1, 1];
      case "sat": return L ? mix(palette.a, palette.b, 0.4).concat(0.75) : mix(palette.a, palette.b, 0.6).concat(0.8);
      default: return L ? mix(palette.a, palette.bg, 0.55).concat(0.55) : mix(palette.b, palette.bg, 0.45).concat(0.5);
    }
  }
  function fillBuffers() {
    nodes.forEach(function (n, i) {
      var c = nodeColor(n), o = i * 8;
      pointData[o] = n.x; pointData[o + 1] = n.y; pointData[o + 2] = n.z;
      pointData[o + 3] = c[0]; pointData[o + 4] = c[1]; pointData[o + 5] = c[2]; pointData[o + 6] = c[3];
      pointData[o + 7] = n.size;
    });
    var L = palette.light > 0.5;
    var lineCol = L ? mix(palette.a, palette.bg, 0.2) : mix(palette.b, palette.bg, 0.15);
    edges.forEach(function (e, i) {
      [nodes[e.a], nodes[e.b]].forEach(function (n, k) {
        var o = (i * 2 + k) * 8;
        lineData[o] = n.x; lineData[o + 1] = n.y; lineData[o + 2] = n.z;
        lineData[o + 3] = lineCol[0]; lineData[o + 4] = lineCol[1]; lineData[o + 5] = lineCol[2];
        lineData[o + 6] = e.alpha * (L ? 0.9 : 1);
        lineData[o + 7] = 1;
      });
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, pointBuf); gl.bufferData(gl.ARRAY_BUFFER, pointData, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf); gl.bufferData(gl.ARRAY_BUFFER, lineData, gl.STATIC_DRAW);
  }
  function bindLayout(buf, pos, col, size) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 3, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(col); gl.vertexAttribPointer(col, 4, gl.FLOAT, false, STRIDE, 12);
    gl.enableVertexAttribArray(size); gl.vertexAttribPointer(size, 1, gl.FLOAT, false, STRIDE, 28);
  }

  /* =========================================================================
     Impulsy (dane w ruchu) i zdarzenia przy hubach
     ========================================================================= */
  var pulses = [];
  function spawnPulse(a, b, color, size, speed) {
    if (pulses.length >= MAX_PULSES) pulses.shift();
    pulses.push({ a: a, b: b, t: 0, speed: speed || 0.9, color: color, size: size || 2.6 });
  }
  function ambientPulse() {
    var e = flowEdges[Math.floor(Math.random() * flowEdges.length)];
    var fwd = Math.random() < 0.5;
    var col = Math.random() < 0.3 ? palette.c : palette.b;
    spawnPulse(fwd ? e.a : e.b, fwd ? e.b : e.a, col, 2.2, 0.6 + Math.random() * 0.6);
  }
  function hubEvent(hub, inbound) {
    var h = HUBS[hub];
    var links = edges.filter(function (e) { return e.flow && (e.a === h.node || e.b === h.node) && (nodes[e.a].kind === "core" || nodes[e.b].kind === "core"); });
    links.forEach(function (e) {
      var hubEnd = e.a === h.node ? e.a : e.b, coreEnd = e.a === h.node ? e.b : e.a;
      spawnPulse(inbound ? hubEnd : coreEnd, inbound ? coreEnd : hubEnd, inbound ? palette.c : palette.b, 3.2, 1.1);
    });
  }

  var labelEls = {};
  labelsRoot.querySelectorAll("[data-hub]").forEach(function (el) { labelEls[el.getAttribute("data-hub")] = el; });
  var coreEl = labelsRoot.querySelector("[data-core]");
  var toastEl = document.getElementById("scene-toast");
  var toastText = toastEl && toastEl.querySelector("span");

  /* historia jednego zamówienia, w kółko */
  var SCRIPT = [
    { hub: 0, text: "nowe zamówienie #10493", inbound: true },
    { hub: 1, text: "dokument FS/10493 gotowy", inbound: false },
    { hub: 4, text: "stan: −3 szt., zgadza się", inbound: true },
    { hub: 5, text: "faktura zaksięgowana", inbound: false },
    { hub: 3, text: "potwierdzenie poszło do klienta", inbound: false },
    { hub: 2, text: "klient zaktualizowany w CRM", inbound: false }
  ];
  var scriptIdx = 0, toast = { hub: -1, until: 0 };
  function nextEvent(now) {
    var ev = SCRIPT[scriptIdx];
    scriptIdx = (scriptIdx + 1) % SCRIPT.length;
    hubEvent(ev.hub, ev.inbound);
    if (ev.inbound) setTimeout(function () { hubEvent(ev.hub, false); }, 650);
    if (toastEl && toastText) {
      toastText.textContent = ev.text;
      toastEl.classList.add("is-on");
      toast.hub = ev.hub;
      toast.until = now + 2100;
      var lab = labelEls[HUBS[ev.hub].id];
      if (lab) { lab.classList.remove("is-hit"); void lab.offsetWidth; lab.classList.add("is-hit"); }
    }
  }

  /* =========================================================================
     Stan sceny: rozmiar, kamera, wejście
     ========================================================================= */
  var W = 1, H = 1, px = 1;           /* rozmiar bufora i gęstość pikseli */
  var cssW = 1, cssH = 1;
  var off = [0, 0];                   /* przesunięcie sceny w NDC */
  var camDist = 3.4, aspect = 1;
  var focus = [0.72, 0.5];            /* środek sceny w UV (dla halo w tle) */
  var mouse = { x: 0.7, y: 0.5, tx: 0.7, ty: 0.5 };
  var BASE_TILT = 0.42;
  var orbit = { yaw: 0, tilt: 0.42, tyaw: 0, ttilt: 0.42, drag: false, lastX: 0, vel: 0 };
  var scrollK = 0;

  function layout() {
    var r = hero.getBoundingClientRect();
    cssW = Math.max(1, r.width); cssH = Math.max(1, r.height);
    var dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    var factor = cssW < 768 ? 0.62 : 0.78;
    px = dpr * factor;
    W = Math.max(1, Math.round(cssW * px)); H = Math.max(1, Math.round(cssH * px));
    canvas.width = W; canvas.height = H;
    gl.viewport(0, 0, W, H);
    aspect = W / H;

    /* gdzie jest wolne miejsce: obok tekstu (desktop) albo pod nim (telefon) */
    var c = copy ? copy.getBoundingClientRect() : r;
    var cx, cy, radiusPx;
    if (cssW >= 960) {
      cx = (c.right - r.left + cssW) / 2 - cssW * 0.02;
      cy = cssH * 0.5;
      radiusPx = Math.min(cssW - (c.right - r.left), cssH) * 0.46;
    } else {
      cx = cssW * 0.5;
      cy = (c.bottom - r.top + cssH) / 2;
      radiusPx = Math.min(cssW, cssH - (c.bottom - r.top)) * 0.5;
    }
    BASE_TILT = cssW >= 960 ? 0.42 : 0.72;
    orbit.ttilt = BASE_TILT;
    off = [(cx / cssW) * 2 - 1, -((cy / cssH) * 2 - 1)];
    focus = [cx / cssW, 1 - cy / cssH];
    /* odległość kamery tak, by promień sceny (~1.5) miał radiusPx na ekranie */
    var tanHalf = Math.tan(0.66 / 2);
    camDist = clamp((1.35 * cssH) / (2 * tanHalf * Math.max(40, radiusPx)), 2.4, 12);
  }

  var proj, mvp;
  function updateMatrices(now) {
    var yaw = orbit.yaw + scrollK * 0.6, tilt = orbit.tilt + scrollK * 0.25;
    var model = mul(rotY(yaw), rotX(tilt));
    var view = translate(0, 0, -camDist);
    proj = perspective(0.66, aspect, 0.1, 30);
    mvp = mul(proj, mul(view, model));
  }

  function placeLabels(now) {
    var fogNear = camDist - 1.2, fogFar = camDist + 2.0;
    HUBS.forEach(function (h) {
      var el = labelEls[h.id]; if (!el) return;
      var n = nodes[h.node];
      var s = project(mvp, n.x, n.y, n.z);
      var x = ((s[0] + off[0]) * 0.5 + 0.5) * cssW, y = (1 - ((s[1] + off[1]) * 0.5 + 0.5)) * cssH;
      var depth = s[2];
      var k = clamp(camDist / depth, 0.55, 1.4);
      var fog = clamp((fogFar - depth) / (fogFar - fogNear), 0.25, 1);
      el.style.transform = "translate(-50%,-50%) translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) scale(" + (0.78 + 0.3 * k).toFixed(3) + ")";
      el.style.opacity = fog.toFixed(3);
      el.style.zIndex = String(Math.round(100 - depth * 10));
      h.sx = x; h.sy = y; h.sk = k;
    });
    if (coreEl) {
      var c = project(mvp, 0, 0, 0);
      var cx = ((c[0] + off[0]) * 0.5 + 0.5) * cssW, cy = (1 - ((c[1] + off[1]) * 0.5 + 0.5)) * cssH;
      coreEl.style.transform = "translate(-50%,-50%) translate(" + cx.toFixed(1) + "px," + cy.toFixed(1) + "px) scale(" + clamp(camDist / c[2], 0.7, 1.3).toFixed(3) + ")";
    }
    if (toastEl) {
      if (toast.hub >= 0 && now < toast.until) {
        var h2 = HUBS[toast.hub];
        var half = (toastEl.offsetWidth || 160) / 2;
        var tx = clamp(h2.sx, half + 8, cssW - half - 8);
        toastEl.style.transform = "translate(-50%,-100%) translate(" + tx.toFixed(1) + "px," + (h2.sy - 22 * h2.sk).toFixed(1) + "px)";
      } else if (toast.hub >= 0) {
        toastEl.classList.remove("is-on");
        toast.hub = -1;
      }
    }
  }

  /* =========================================================================
     Rysowanie
     ========================================================================= */
  function drawAurora(t) {
    gl.disable(gl.BLEND);
    gl.useProgram(auroraProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(attrs.quad);
    gl.vertexAttribPointer(attrs.quad, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(AU.u_res, W, H);
    gl.uniform1f(AU.u_time, t);
    gl.uniform2f(AU.u_mouse, mouse.x * W, mouse.y * H);
    gl.uniform3fv(AU.u_bg, palette.bg); gl.uniform3fv(AU.u_a, palette.a); gl.uniform3fv(AU.u_b, palette.b); gl.uniform3fv(AU.u_c, palette.c);
    gl.uniform1f(AU.u_light, palette.light);
    gl.uniform2f(AU.u_focus, focus[0], focus[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function setNetUniforms(U) {
    gl.uniformMatrix4fv(U.u_mvp, false, mvp);
    gl.uniform2f(U.u_off, off[0], off[1]);
    gl.uniform1f(U.u_px, px);
    gl.uniform1f(U.u_light, palette.light);
    gl.uniform1f(U.u_near, camDist - 1.3);
    gl.uniform1f(U.u_far, camDist + 2.1);
  }
  function drawNetwork(dt) {
    gl.enable(gl.BLEND);
    if (palette.light > 0.5) gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); else gl.blendFunc(gl.ONE, gl.ONE);

    gl.useProgram(lineProg);
    setNetUniforms(LU);
    bindLayout(lineBuf, attrs.lPos, attrs.lCol, attrs.lSize);
    gl.drawArrays(gl.LINES, 0, edges.length * 2);

    gl.useProgram(pointProg);
    setNetUniforms(PU);
    bindLayout(pointBuf, attrs.pPos, attrs.pCol, attrs.pSize);
    gl.drawArrays(gl.POINTS, 0, nodes.length);

    /* impulsy */
    var count = 0;
    for (var i = pulses.length - 1; i >= 0; i--) {
      var p = pulses[i];
      p.t += dt * p.speed;
      if (p.t >= 1) { pulses.splice(i, 1); continue; }
      var a = nodes[p.a], b = nodes[p.b], e = easeInOut(p.t), o = count * 8;
      var fade = Math.sin(p.t * Math.PI);
      pulseData[o] = a.x + (b.x - a.x) * e; pulseData[o + 1] = a.y + (b.y - a.y) * e; pulseData[o + 2] = a.z + (b.z - a.z) * e;
      pulseData[o + 3] = p.color[0]; pulseData[o + 4] = p.color[1]; pulseData[o + 5] = p.color[2]; pulseData[o + 6] = 0.35 + 0.65 * fade;
      pulseData[o + 7] = p.size;
      count++;
    }
    if (count) {
      gl.bindBuffer(gl.ARRAY_BUFFER, pulseBuf);
      gl.bufferData(gl.ARRAY_BUFFER, pulseData.subarray(0, count * 8), gl.DYNAMIC_DRAW);
      bindLayout(pulseBuf, attrs.pPos, attrs.pCol, attrs.pSize);
      gl.drawArrays(gl.POINTS, 0, count);
    }
  }

  var start = performance.now(), last = start, lastAmbient = 0, lastEvent = 0;
  function frame(now) {
    var t = (now - start) / 1000;
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    /* obrót: powoli sam z siebie, plus mysz/przeciąganie */
    if (!orbit.drag) {
      orbit.tyaw += dt * 0.07 + orbit.vel * dt;
      orbit.vel *= 0.94;
    }
    orbit.yaw += (orbit.tyaw - orbit.yaw) * 0.08;
    orbit.tilt += (orbit.ttilt - orbit.tilt) * 0.06;
    mouse.x += (mouse.tx - mouse.x) * 0.06;
    mouse.y += (mouse.ty - mouse.y) * 0.06;

    if (!reduce) {
      if (now - lastAmbient > 240) { ambientPulse(); lastAmbient = now; }
      if (now - lastEvent > 2500) { nextEvent(now); lastEvent = now; }
    }

    updateMatrices(now);
    drawAurora(t);
    drawNetwork(dt);
    placeLabels(now);
  }

  /* =========================================================================
     Pętla, widoczność, zdarzenia
     ========================================================================= */
  var running = false, inView = true, raf = 0;
  function loop(now) { if (!running) return; frame(now); raf = requestAnimationFrame(loop); }
  function play() { if (running || reduce || !inView || document.hidden) return; running = true; last = performance.now(); raf = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  hero.addEventListener("pointermove", function (e) {
    var r = hero.getBoundingClientRect();
    var nx = (e.clientX - r.left) / cssW, ny = (e.clientY - r.top) / cssH;
    mouse.tx = nx; mouse.ty = 1 - ny;
    if (orbit.drag) {
      var dx = e.clientX - orbit.lastX;
      orbit.lastX = e.clientX;
      orbit.tyaw += dx * 0.006;
      orbit.vel = dx * 0.25;
    } else if (finePointer) {
      orbit.ttilt = BASE_TILT + (ny - 0.5) * -0.35;
    }
  }, { passive: true });
  canvas.addEventListener("pointerdown", function (e) {
    orbit.drag = true; orbit.lastX = e.clientX; orbit.vel = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  });
  function endDrag() { orbit.drag = false; }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  hero.addEventListener("pointerleave", function () { orbit.ttilt = BASE_TILT; });

  window.addEventListener("scroll", function () {
    var y = window.scrollY || 0;
    scrollK = clamp(y / Math.max(1, cssH), 0, 1);
  }, { passive: true });

  var resizeRaf = 0;
  window.addEventListener("resize", function () {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(function () { layout(); if (!running) frame(performance.now()); });
  });
  window.addEventListener("themechange", function () {
    readPalette(); fillBuffers();
    if (!running) frame(performance.now());
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      if (inView) play(); else stop();
    }, { rootMargin: "10% 0px" }).observe(hero);
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else play(); });
  canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); stop(); hero.classList.add("hero--nogl"); });
  canvas.addEventListener("webglcontextrestored", function () { hero.classList.remove("hero--nogl"); readPalette(); fillBuffers(); layout(); play(); });

  window.__heroSceneLayout = function () { return { cssW: cssW, cssH: cssH, off: off, camDist: camDist }; };

  /* start */
  readPalette();
  fillBuffers();
  layout();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layout(); if (!running) frame(performance.now()); });
  frame(performance.now());
  canvas.classList.add("is-ready");
  labelsRoot.classList.add("is-ready");
  play();
})();
