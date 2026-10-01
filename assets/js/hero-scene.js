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
    "uniform vec3 u_bg;uniform vec3 u_a;uniform vec3 u_b;uniform vec3 u_c;uniform float u_light;uniform vec2 u_focus;uniform vec3 u_neon;uniform float u_grid;",
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
    "  /* siatka perspektywiczna pod sceną (cyberpunk floor) */",
    "  float hz=(u_focus.y-0.5)-0.16;",
    "  float gy=hz-p.y;",
    "  float gridv=0.0;float horizon=0.0;",
    "  if(gy>0.0015){",
    "    float z=0.55/gy;",
    "    float fx=(u_focus.x-0.5)*(u_res.x/u_res.y);",
    "    vec2 g=vec2((p.x-fx)*z*1.1,z+u_time*0.9);",
    "    vec2 f=abs(fract(g)-0.5);",
    "    float w=z*2.2/u_res.y*1.15;",
    "    float line=1.0-smoothstep(0.0,w*1.6,min(f.x,f.y));",
    "    float fog=exp(-z*0.11)*smoothstep(0.0,0.05,gy);",
    "    gridv=line*fog;",
    "  }",
    "  horizon=exp(-abs(gy)*70.0)*smoothstep(0.0,0.4,1.0-abs(p.x-(u_focus.x-0.5)*(u_res.x/u_res.y))*0.9);",
    "  float gmask=u_grid*mix(0.35,1.0,lx);",
    "  if(u_light<0.5){",
    "    col+=u_a*smoothstep(0.30,0.72,n)*0.7;",
    "    col+=u_b*smoothstep(0.52,0.86,n)*0.45;",
    "    col+=u_c*smoothstep(0.64,0.92,warm)*0.26;",
    "    col+=u_a*halo*0.55;",
    "    col+=u_a*0.35*exp(-d*d*3.5);",
    "    col*=mix(0.55,1.0,vig);",
    "    col*=mix(0.45,1.0,lx);",
    "    col+=u_neon*gridv*0.75*gmask+u_neon*horizon*0.4*gmask;",
    "  }else{",
    "    col=mix(col,u_b,smoothstep(0.30,0.72,n)*0.45);",
    "    col=mix(col,u_a,smoothstep(0.55,0.88,n)*0.35);",
    "    col=mix(col,u_c,smoothstep(0.66,0.92,warm)*0.2);",
    "    col=mix(col,u_b,halo*0.45);",
    "    col=mix(col,u_b,0.3*exp(-d*d*3.5));",
    "    col=mix(col,u_bg,(1.0-vig)*0.5);",
    "    col=mix(col,u_bg,(1.0-lx)*0.6);",
    "    col=mix(col,u_neon,gridv*0.45*gmask);",
    "    col=mix(col,u_neon,horizon*0.25*gmask);",
    "  }",
    "  gl_FragColor=vec4(col,1.0);",
    "}"
  ].join("\n");

  /* post-process: aberracja chromatyczna, scanlines, glitch */
  var POST_FS = [
    "precision mediump float;",
    "uniform sampler2D u_tex;uniform vec2 u_res;uniform float u_time;uniform float u_aberr;uniform float u_glitch;uniform float u_scan;uniform float u_light;",
    "float hash(float n){return fract(sin(n)*43758.5453);}",
    "void main(){",
    "  vec2 uv=gl_FragCoord.xy/u_res;",
    "  vec2 c=uv-0.5;",
    "  float g=u_glitch;",
    "  if(g>0.002){",
    "    float band=floor(uv.y*(10.0+26.0*g)+u_time*19.0);",
    "    float on=step(0.62,hash(band*3.3+floor(u_time*30.0)));",
    "    float shift=(hash(band*7.1+floor(u_time*24.0))-0.5)*g*0.09*on;",
    "    uv.x+=shift;",
    "    uv.y+=(hash(band*1.7)-0.5)*g*0.004*on;",
    "  }",
    "  float ab=u_aberr*(0.5+1.8*dot(c,c))+g*0.010;",
    "  vec2 dir=normalize(c+vec2(1e-4))*ab;",
    "  float r=texture2D(u_tex,uv+dir).r;",
    "  float gg=texture2D(u_tex,uv).g;",
    "  float b=texture2D(u_tex,uv-dir).b;",
    "  vec3 col=vec3(r,gg,b);",
    "  float scan=1.0-u_scan*(0.5+0.5*sin(gl_FragCoord.y*2.6));",
    "  col*=mix(1.0,scan,u_light<0.5?1.0:0.35);",
    "  if(g>0.002){col=mix(col,vec3(col.g,col.b,col.r),g*0.35*step(0.9,hash(floor(uv.y*40.0)+floor(u_time*20.0))));}",
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
  var postProg = program(AURORA_VS, POST_FS);
  if (!auroraProg || !pointProg || !lineProg || !postProg) { hero.classList.add("hero--nogl"); return; }

  function uniforms(prog, names) {
    var o = {};
    names.forEach(function (n) { o[n] = gl.getUniformLocation(prog, n); });
    return o;
  }
  var AU = uniforms(auroraProg, ["u_res", "u_time", "u_mouse", "u_bg", "u_a", "u_b", "u_c", "u_light", "u_focus", "u_neon", "u_grid"]);
  var PO = uniforms(postProg, ["u_tex", "u_res", "u_time", "u_aberr", "u_glitch", "u_scan", "u_light"]);
  var postAttr = gl.getAttribLocation(postProg, "a");
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

  /* framebuffer do post-processingu */
  var fbo = gl.createFramebuffer(), fboTex = gl.createTexture(), fboOk = false;
  function sizeFBO(w, h) {
    gl.bindTexture(gl.TEXTURE_2D, fboTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
    fboOk = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  var fx = { aberr: 0.0014, aberrT: 0.0014, glitch: 0, scan: 0.07, nextMicro: 0 };

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
  var dustStart = nodes.length - dustIds.length;            /* pył jest na końcu list (węzły i krawędzie) */
  var dustEdgeStart = edges.length;
  for (var ei = 0; ei < edges.length; ei++) { if (nodes[edges[ei].a].kind === "dust") { dustEdgeStart = ei; break; } }

  /* pozycje „na żywo”: dom + przesunięcie sprężynowe (składanie na starcie, wybuch) */
  var N = nodes.length;
  var pos = new Float32Array(N * 3), off3 = new Float32Array(N * 3), vel3 = new Float32Array(N * 3);
  var dynamic = false, springK = 26, springD = 7.5;
  function syncPos() {
    for (var i = 0; i < N; i++) {
      var n = nodes[i];
      pos[i * 3] = n.x + off3[i * 3]; pos[i * 3 + 1] = n.y + off3[i * 3 + 1]; pos[i * 3 + 2] = n.z + off3[i * 3 + 2];
    }
  }
  function scatter(scale, randomVel) {
    for (var i = 0; i < N; i++) {
      var n = nodes[i], len = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z) || 1;
      var dirx = n.x / len, diry = n.y / len, dirz = n.z / len;
      var m = scale * (0.6 + Math.random() * 0.9);
      if (randomVel) {
        vel3[i * 3] = dirx * m + (Math.random() - 0.5) * 2; vel3[i * 3 + 1] = diry * m + (Math.random() - 0.5) * 2; vel3[i * 3 + 2] = dirz * m + (Math.random() - 0.5) * 2;
      } else {
        off3[i * 3] = dirx * m + (Math.random() - 0.5); off3[i * 3 + 1] = diry * m + (Math.random() - 0.5); off3[i * 3 + 2] = dirz * m + (Math.random() - 0.5);
        vel3[i * 3] = vel3[i * 3 + 1] = vel3[i * 3 + 2] = 0;
      }
    }
    dynamic = true;
  }
  function stepSprings(dt) {
    if (!dynamic) return;
    var energy = 0;
    for (var i = 0; i < N * 3; i++) {
      var a = -springK * off3[i] - springD * vel3[i];
      vel3[i] += a * dt;
      off3[i] += vel3[i] * dt;
      energy += off3[i] * off3[i] + vel3[i] * vel3[i];
    }
    if (energy < 0.0004) { dynamic = false; for (var k = 0; k < N * 3; k++) { off3[k] = 0; vel3[k] = 0; } }
    syncPos();
  }
  syncPos();

  /* =========================================================================
     Bufory
     ========================================================================= */
  var STRIDE = 8 * 4; /* x y z r g b a size */
  var pointData = new Float32Array(nodes.length * 8);
  var lineData = new Float32Array(edges.length * 2 * 8);
  var MAX_PULSES = 96;
  var pulseData = new Float32Array(MAX_PULSES * 8);
  var pointBuf = gl.createBuffer(), lineBuf = gl.createBuffer(), pulseBuf = gl.createBuffer();

  var palette = { bg: [0, 0, 0], a: [0, 0, 0], b: [0, 0, 0], c: [0, 0, 0], neon: [0.13, 0.9, 1], light: 0, fg: [1, 1, 1] };

  function readPalette() {
    var cs = getComputedStyle(document.documentElement);
    palette.bg = hexToRgb(cs.getPropertyValue("--shader-bg") || "#070b16");
    palette.a = hexToRgb(cs.getPropertyValue("--shader-a") || "#3f6ff5");
    palette.b = hexToRgb(cs.getPropertyValue("--shader-b") || "#78a2ff");
    palette.c = hexToRgb(cs.getPropertyValue("--shader-c") || "#ffb45c");
    palette.fg = hexToRgb(cs.getPropertyValue("--fg") || "#e9eef9");
    palette.neon = hexToRgb(cs.getPropertyValue("--neon") || "#22e5ff");
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
  function refreshPositions() {
    for (var i = 0; i < N; i++) { var o = i * 8; pointData[o] = pos[i * 3]; pointData[o + 1] = pos[i * 3 + 1]; pointData[o + 2] = pos[i * 3 + 2]; }
    for (var e = 0; e < edges.length; e++) {
      var a = edges[e].a * 3, b = edges[e].b * 3, oa = (e * 2) * 8, ob = (e * 2 + 1) * 8;
      lineData[oa] = pos[a]; lineData[oa + 1] = pos[a + 1]; lineData[oa + 2] = pos[a + 2];
      lineData[ob] = pos[b]; lineData[ob + 1] = pos[b + 1]; lineData[ob + 2] = pos[b + 2];
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, pointBuf); gl.bufferData(gl.ARRAY_BUFFER, pointData, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf); gl.bufferData(gl.ARRAY_BUFFER, lineData, gl.DYNAMIC_DRAW);
  }
  function fillBuffers() {
    nodes.forEach(function (n, i) {
      var c = nodeColor(n), o = i * 8;
      pointData[o] = pos[i * 3]; pointData[o + 1] = pos[i * 3 + 1]; pointData[o + 2] = pos[i * 3 + 2];
      pointData[o + 3] = c[0]; pointData[o + 4] = c[1]; pointData[o + 5] = c[2]; pointData[o + 6] = c[3];
      pointData[o + 7] = n.size;
    });
    var L = palette.light > 0.5;
    var lineCol = L ? mix(palette.a, palette.bg, 0.2) : mix(palette.b, palette.bg, 0.15);
    edges.forEach(function (e, i) {
      [e.a, e.b].forEach(function (idx, k) {
        var o = (i * 2 + k) * 8;
        lineData[o] = pos[idx * 3]; lineData[o + 1] = pos[idx * 3 + 1]; lineData[o + 2] = pos[idx * 3 + 2];
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
    var rnd = Math.random();
    var col = rnd < 0.25 ? palette.c : rnd < 0.45 ? palette.neon : palette.b;
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

  var labelEls = {}, metaEls = {};
  labelsRoot.querySelectorAll("[data-hub]").forEach(function (el) {
    var id = el.getAttribute("data-hub");
    labelEls[id] = el;
    metaEls[id] = el.querySelector("[data-meta]");
  });
  var coreEl = labelsRoot.querySelector("[data-core]");
  var reticleEl = document.getElementById("reticle");
  var voiceEl = document.getElementById("scene-voice"), voiceText = document.getElementById("scene-voice-text");
  var flowEl = document.getElementById("flow-hud");
  var cardEl = document.getElementById("scene-card");

  /* podziałka celownika */
  (function ticks() {
    var g = document.getElementById("ret-ticks"); if (!g) return;
    var NS = "http://www.w3.org/2000/svg";
    for (var i = 0; i < 72; i++) {
      var a = (i / 72) * Math.PI * 2, major = i % 6 === 0;
      var r1 = major ? 100 : 106, r2 = 112;
      var l = document.createElementNS(NS, "line");
      l.setAttribute("x1", (120 + Math.cos(a) * r1).toFixed(2)); l.setAttribute("y1", (120 + Math.sin(a) * r1).toFixed(2));
      l.setAttribute("x2", (120 + Math.cos(a) * r2).toFixed(2)); l.setAttribute("y2", (120 + Math.sin(a) * r2).toFixed(2));
      if (major) l.setAttribute("class", "is-major");
      g.appendChild(l);
    }
  })();

  /* głos AI: pisze komentarz do kroku */
  var voiceTimer = 0;
  function say(text) {
    if (!voiceEl || !voiceText) return;
    clearTimeout(voiceTimer);
    if (reduce) { voiceText.textContent = text; return; }
    voiceEl.classList.add("is-speaking");
    var i = 0;
    (function step() {
      i++;
      voiceText.textContent = text.slice(0, i);
      if (i < text.length) { voiceTimer = setTimeout(step, 22 + Math.random() * 26); }
      else { voiceTimer = setTimeout(function () { voiceEl.classList.remove("is-speaking"); }, 400); }
    })();
  }
  var cardTitle = cardEl && cardEl.querySelector("[data-title]");
  var cardStep = cardEl && cardEl.querySelector("[data-step]");
  var cardRows = cardEl && cardEl.querySelector("[data-rows]");
  var cardFoot = cardEl && cardEl.querySelector("[data-foot]");

  /* liczniki na kartach hubów (rosną w trakcie historii) */
  var counters = { sklep: 14, erp: 14, crm: 312, mail: 41, magazyn: 100, ksiegowosc: 14 };
  var metaFmt = {
    sklep: function (n) { return "zamówień dziś · " + n; },
    erp: function (n) { return "dokumentów · " + n; },
    crm: function (n) { return "klientów · " + n; },
    mail: function (n) { return "wysłanych · " + n; },
    magazyn: function () { return "stany ok · 100%"; },
    ksiegowosc: function (n) { return "zaksięgowane · " + n; }
  };
  function bumpMeta(id) {
    if (id !== "magazyn") counters[id]++;
    var el = metaEls[id]; if (!el) return;
    el.textContent = metaFmt[id](counters[id]);
    el.classList.remove("is-tick"); void el.offsetWidth; el.classList.add("is-tick");
  }

  /* historia jednego zamówienia: każda scena to karta z danymi; dane biegną
     od poprzedniego systemu przez AI do kolejnego */
  var ORDER = 10493;
  function SCRIPT_FOR(n) {
    return [
      { hub: 0, kind: "new", title: "Nowe zamówienie #" + n, rows: [["klient", "Nowak Sp. z o.o."], ["pozycje", "3 · 1 240 zł"], ["kanał", "sklep · webhook"]], foot: "AI sprawdza NIP, adres, duplikaty", text: "nowe zamówienie #" + n, voice: "Nowe zamówienie #" + n + ". Sprawdzam NIP, adres i duplikaty… ok." },
      { hub: 1, kind: "ok", title: "Dokument FS/" + n, rows: [["ERP", "Comarch Optima"], ["pozycje", "3 / 3 dopasowane"], ["czas", "1,2 s"]], foot: "utworzono bez przepisywania", text: "dokument FS/" + n + " gotowy", voice: "Tworzę dokument FS/" + n + " w Comarch… gotowe w 1,2 s." },
      { hub: 4, kind: "ok", title: "Rezerwacja towaru", rows: [["magazyn", "−3 szt. · A-12"], ["stan po", "27 szt."], ["minimum", "nie naruszone"]], foot: "stany sklep = ERP", text: "stan: −3 szt., zgadza się", voice: "Rezerwuję 3 sztuki w magazynie. Stany sklep i ERP się zgadzają." },
      { hub: 5, kind: "ok", title: "Faktura FV/" + n, rows: [["kwota", "1 240,00 zł brutto"], ["KSeF", "wysłano"], ["termin", "14 dni"]], foot: "zaksięgowana automatycznie", text: "faktura zaksięgowana", voice: "Wystawiam fakturę FV/" + n + " i wysyłam do KSeF… zaksięgowana." },
      { hub: 3, kind: "ai", title: "Potwierdzenie do klienta", rows: [["do", "biuro@nowak.pl"], ["załącznik", "FV/" + n + ".pdf"], ["treść", "napisało AI"]], foot: "wysłano · 0,8 s", text: "potwierdzenie poszło do klienta", voice: "Piszę potwierdzenie do klienta i dołączam fakturę… wysłane." },
      { hub: 2, kind: "ok", title: "Karta klienta", rows: [["CRM", "HubSpot"], ["zamówień", "7 · LTV 9 880 zł"], ["następny krok", "follow-up za 30 dni"]], foot: "handlowiec dostał info na Teams", text: "klient zaktualizowany w CRM", voice: "Aktualizuję CRM i daję znać handlowcowi. Całość: 4,1 s, bez człowieka." }
    ];
  }
  var SCRIPT = SCRIPT_FOR(ORDER);
  var scriptIdx = 0, card = { hub: -1, until: 0 }, prevHub = -1;
  var tickerEl = document.getElementById("hud-ticker"), tickerLog = [];
  function nextEvent(now) {
    var ev = SCRIPT[scriptIdx];
    scriptIdx = (scriptIdx + 1) % SCRIPT.length;
    if (scriptIdx === 0) { ORDER++; SCRIPT = SCRIPT_FOR(ORDER); }

    /* dane wychodzą z poprzedniego systemu, przechodzą przez rdzeń i wpadają do bieżącego */
    if (prevHub >= 0) { hubEvent(prevHub, true); setTimeout(function () { hubEvent(ev.hub, false); }, 520); }
    else { hubEvent(ev.hub, true); setTimeout(function () { hubEvent(ev.hub, false); }, 650); }
    prevHub = ev.hub;
    setTimeout(function () { bumpMeta(HUBS[ev.hub].id); }, 560);

    if (cardEl) {
      cardTitle.textContent = ev.title;
      cardStep.textContent = "krok " + (SCRIPT.indexOf(ev) + 1) + "/" + SCRIPT.length;
      cardRows.innerHTML = "";
      ev.rows.forEach(function (r) {
        var d = document.createElement("div"), a = document.createElement("span"), b = document.createElement("span");
        a.textContent = r[0]; b.textContent = r[1]; d.appendChild(a); d.appendChild(b); cardRows.appendChild(d);
      });
      cardFoot.textContent = ev.foot;
      cardEl.className = "scene-card is-on is-" + ev.kind;
      card.hub = ev.hub;
      card.until = now + 2300;
      var lab = labelEls[HUBS[ev.hub].id];
      if (lab) { lab.classList.remove("is-hit"); void lab.offsetWidth; lab.classList.add("is-hit"); }
    }
    if (tickerEl) {
      var d2 = new Date(), hh = [d2.getHours(), d2.getMinutes(), d2.getSeconds()].map(function (n) { return (n < 10 ? "0" : "") + n; }).join(":");
      tickerLog.unshift("[" + hh + "] " + HUBS[ev.hub].id + ": " + ev.text);
      if (tickerLog.length > 3) tickerLog.length = 3;
      tickerEl.textContent = tickerLog.join("   ·   ");
      tickerEl.style.animation = "none"; void tickerEl.offsetWidth; tickerEl.style.animation = "";
    }
    say(ev.voice || ev.text);
    if (reticleEl) { reticleEl.classList.remove("is-ping"); void reticleEl.offsetWidth; reticleEl.classList.add("is-ping"); }
    try { window.dispatchEvent(new CustomEvent("scene:event", { detail: { step: SCRIPT.indexOf(ev), total: SCRIPT.length, hub: ev.hub, text: ev.voice || ev.text, order: ORDER } })); } catch (e) {}
    if (!reduce && Math.random() < 0.35) { fx.glitch = Math.max(fx.glitch, 0.18); }
  }

  /* =========================================================================
     Stan sceny: rozmiar, kamera, wejście
     ========================================================================= */
  var quality = { dust: true, factor: 1, level: 0 };   /* adaptacyjna jakość */
  var W = 1, H = 1, px = 1;           /* rozmiar bufora i gęstość pikseli */
  var cssW = 1, cssH = 1;
  var off = [0, 0];                   /* przesunięcie sceny w NDC */
  var camDist = 3.4, aspect = 1;
  var focus = [0.72, 0.5];            /* środek sceny w UV (dla halo w tle) */
  var mouse = { x: 0.7, y: 0.5, tx: 0.7, ty: 0.5 };
  var BASE_TILT = 0.42;
  var orbit = { yaw: 0, tilt: 0.42, tyaw: 0, ttilt: 0.42, drag: false, lastX: 0, vel: 0 };
  var scrollK = 0;
  var sceneTop = 0;                   /* na telefonie: dół tekstu, nad nim nie kładziemy kart */

  function layout() {
    var r = hero.getBoundingClientRect();
    cssW = Math.max(1, r.width); cssH = Math.max(1, r.height);
    var dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    var factor = (cssW < 768 ? 0.62 : 0.78) * quality.factor;
    px = dpr * factor;
    W = Math.max(1, Math.round(cssW * px)); H = Math.max(1, Math.round(cssH * px));
    canvas.width = W; canvas.height = H;
    gl.viewport(0, 0, W, H);
    aspect = W / H;
    sizeFBO(W, H);

    /* gdzie jest wolne miejsce: obok tekstu (desktop) albo pod nim (telefon) */
    var c = copy ? copy.getBoundingClientRect() : r;
    sceneTop = cssW >= 960 ? 0 : (c.bottom - r.top);
    var reserve = 0;
    if (flowEl && getComputedStyle(flowEl).position !== "absolute") reserve = flowEl.offsetHeight + 24;
    var cx, cy, radiusPx;
    if (cssW >= 960) {
      cx = (c.right - r.left + cssW) / 2 - cssW * 0.02;
      cy = cssH * 0.5;
      radiusPx = Math.min(cssW - (c.right - r.left), cssH) * 0.46;
    } else {
      cx = cssW * 0.5;
      cy = (c.bottom - r.top + cssH - reserve) / 2;
      radiusPx = Math.min(cssW, cssH - reserve - (c.bottom - r.top)) * 0.5;
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
      var n3 = h.node * 3;
      var s = project(mvp, pos[n3], pos[n3 + 1], pos[n3 + 2]);
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
      var ck = clamp(camDist / c[2], 0.7, 1.3);
      coreEl.style.transform = "translate(-50%,-50%) translate(" + cx.toFixed(1) + "px," + cy.toFixed(1) + "px) scale(" + ck.toFixed(3) + ")";
      if (reticleEl) {
        var tf = "translate(" + cx.toFixed(1) + "px," + cy.toFixed(1) + "px) scale(" + ck.toFixed(3) + ")";
        reticleEl.style.setProperty("--tf", tf);
        reticleEl.style.transform = tf;
      }
      if (voiceEl) {
        var vw = voiceEl.offsetWidth || 240, half2 = vw / 2;
        var vx = clamp(cx, half2 + 8, cssW - half2 - 8);
        voiceEl.style.transform = "translate(-50%,0) translate(" + vx.toFixed(1) + "px," + (cy + 150 * ck).toFixed(1) + "px)";
      }
    }
    if (cardEl) {
      if (card.hub >= 0 && now < card.until) {
        var h2 = HUBS[card.hub];
        var half = (cardEl.offsetWidth || 240) / 2;
        var tx = clamp(h2.sx, half + 8, cssW - half - 8);
        var ty = h2.sy - 26 * h2.sk;
        if (ty - (cardEl.offsetHeight || 110) < sceneTop + 8) ty = h2.sy + 26 * h2.sk + (cardEl.offsetHeight || 110);
        cardEl.style.transform = "translate(-50%,-100%) translate(" + tx.toFixed(1) + "px," + ty.toFixed(1) + "px)";
      } else if (card.hub >= 0) {
        cardEl.classList.remove("is-on");
        card.hub = -1;
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
    gl.uniform3fv(AU.u_neon, palette.neon);
    gl.uniform1f(AU.u_grid, quality.level >= 2 ? 0.6 : 1.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function drawPost(t) {
    gl.disable(gl.BLEND);
    gl.useProgram(postProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(postAttr);
    gl.vertexAttribPointer(postAttr, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboTex);
    gl.uniform1i(PO.u_tex, 0);
    gl.uniform2f(PO.u_res, W, H);
    gl.uniform1f(PO.u_time, t);
    gl.uniform1f(PO.u_aberr, fx.aberr);
    gl.uniform1f(PO.u_glitch, fx.glitch);
    gl.uniform1f(PO.u_scan, reduce ? 0 : fx.scan);
    gl.uniform1f(PO.u_light, palette.light);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, null);
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
    gl.drawArrays(gl.LINES, 0, (quality.dust ? edges.length : dustEdgeStart) * 2);

    gl.useProgram(pointProg);
    setNetUniforms(PU);
    bindLayout(pointBuf, attrs.pPos, attrs.pCol, attrs.pSize);
    gl.drawArrays(gl.POINTS, 0, quality.dust ? nodes.length : dustStart);

    /* impulsy */
    var count = 0;
    for (var i = pulses.length - 1; i >= 0; i--) {
      var p = pulses[i];
      p.t += dt * p.speed;
      if (p.t >= 1) { pulses.splice(i, 1); continue; }
      var a3 = p.a * 3, b3 = p.b * 3, e = easeInOut(p.t), o = count * 8;
      var fade = Math.sin(p.t * Math.PI);
      pulseData[o] = pos[a3] + (pos[b3] - pos[a3]) * e; pulseData[o + 1] = pos[a3 + 1] + (pos[b3 + 1] - pos[a3 + 1]) * e; pulseData[o + 2] = pos[a3 + 2] + (pos[b3 + 2] - pos[a3 + 2]) * e;
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
      if (now - lastEvent > 3000) { nextEvent(now); lastEvent = now; }
    }

    stepSprings(dt);
    if (dynamic || wasDynamic) { refreshPositions(); }
    wasDynamic = dynamic;

    /* monitor klatek: gdy sprzęt nie wyrabia, schodzimy z jakością (tylko w dół) */
    dtEma += ((now - last0) / 1000 - dtEma) * 0.05; last0 = now;
    if (dtEma > 0.034) { slowFrames++; } else { slowFrames = Math.max(0, slowFrames - 2); }
    if (slowFrames > 120 && quality.level < 2) {
      quality.level++; slowFrames = 0; dtEma = 0.016;
      if (quality.level === 1) { quality.dust = false; quality.factor = 0.8; }
      else { quality.factor = 0.6; }
      layout();
    }

    /* efekty post: zanikanie po wybuchu, mikro-glitch co kilka sekund */
    fx.glitch *= Math.exp(-dt * 4.5);
    if (fx.glitch < 0.004) fx.glitch = 0;
    fx.aberr += (fx.aberrT - fx.aberr) * Math.min(1, dt * 3);
    if (!reduce && now > fx.nextMicro) { fx.glitch = Math.max(fx.glitch, 0.12); fx.nextMicro = now + 6000 + Math.random() * 7000; }

    updateMatrices(now);
    var usePost = fboOk && quality.level < 2;
    if (usePost) gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    drawAurora(t);
    drawNetwork(dt);
    if (usePost) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); drawPost(t); }
    placeLabels(now);
  }
  var wasDynamic = false, dtEma = 0.016, slowFrames = 0, last0 = performance.now();

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
  canvas.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { orbit.tyaw -= 0.3; e.preventDefault(); }
    else if (e.key === "ArrowRight") { orbit.tyaw += 0.3; e.preventDefault(); }
    else if (e.key === "ArrowUp") { orbit.ttilt = clamp(orbit.ttilt - 0.15, -0.6, 1.2); e.preventDefault(); }
    else if (e.key === "ArrowDown") { orbit.ttilt = clamp(orbit.ttilt + 0.15, -0.6, 1.2); e.preventDefault(); }
  });

  /* wybuch: sieć rozlatuje się i sprężyście wraca (kod Konami, klik w rdzeń) */
  var boomAt = 0;
  window.addEventListener("scene:boom", function () {
    var now = performance.now();
    if (now - boomAt < 1800) return;
    boomAt = now;
    springD = 5.2; springK = 22;
    fx.glitch = 1.0; fx.aberr = 0.03;
    scatter(5.5, true);
    for (var i = 0; i < 40; i++) ambientPulse();
    hero.classList.add("is-boom");
    setTimeout(function () { hero.classList.remove("is-boom"); }, 900);
    if (!running) play();
  });

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

  /* start: sieć składa się z pyłu (później, jeśli najpierw gra intro) */
  readPalette();
  var introSeen = true;
  try { introSeen = sessionStorage.getItem("ts-intro") === "1"; } catch (e) {}
  if (!reduce) {
    springD = 7.5; springK = 26;
    scatter(4.2, false);
    if (!introSeen) { dynamic = false; setTimeout(function () { dynamic = true; }, 1050); }
  }
  syncPos();
  fillBuffers();
  layout();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layout(); if (!running) frame(performance.now()); });
  frame(performance.now());
  canvas.classList.add("is-ready");
  labelsRoot.classList.add("is-ready");
  var hudEl = hero.querySelector(".hud"); if (hudEl) hudEl.classList.add("is-ready");
  if (flowEl) flowEl.classList.add("is-ready");
  play();
})();
