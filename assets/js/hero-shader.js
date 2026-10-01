/* TSoftware — hero-shader.js
   Tło hero: shader WebGL (fbm „zorza danych” + iskry + światło pod kursorem).
   Renderuje w obniżonej rozdzielczości, zatrzymuje się poza ekranem,
   przy „ograniczonym ruchu” rysuje jedną klatkę. */
(function () {
  "use strict";

  var canvas = document.getElementById("hero-canvas");
  if (!canvas) return;
  var hero = canvas.parentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var gl = canvas.getContext("webgl", { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "high-performance" })
        || canvas.getContext("experimental-webgl");
  if (!gl) return;

  var VERT = "attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}";
  var FRAG = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH",
    "precision highp float;",
    "#else",
    "precision mediump float;",
    "#endif",
    "uniform vec2 u_res;",
    "uniform float u_time;",
    "uniform vec2 u_mouse;",
    "float hash21(vec2 p){p=fract(p*vec2(234.34,435.345));p+=dot(p,p+34.23);return fract(p.x*p.y);}",
    "float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);",
    "  float a=hash21(i),b=hash21(i+vec2(1.0,0.0)),c=hash21(i+vec2(0.0,1.0)),d=hash21(i+vec2(1.0,1.0));",
    "  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}",
    "float fbm(vec2 p){float v=0.0;float a=0.5;mat2 m=mat2(0.86,0.5,-0.5,0.86);",
    "  for(int i=0;i<4;i++){v+=a*noise(p);p=m*p*2.02+vec2(1.3,0.7);a*=0.5;}return v;}",
    "void main(){",
    "  vec2 uv=gl_FragCoord.xy/u_res;",
    "  vec2 p=(gl_FragCoord.xy-0.5*u_res)/u_res.y;",
    "  float t=u_time*0.05;",
    "  vec2 q=vec2(fbm(p*1.2+vec2(t,-t*0.7)),fbm(p*1.2+vec2(-t*0.5,t*0.9)+4.7));",
    "  float n=fbm(p*1.7+1.5*q);",
    "  vec3 bg=vec3(0.027,0.043,0.086);",
    "  vec3 cobalt=vec3(0.247,0.435,0.961);",
    "  vec3 ice=vec3(0.47,0.64,1.0);",
    "  vec3 amber=vec3(1.0,0.706,0.361);",
    "  vec3 col=bg;",
    "  col+=cobalt*smoothstep(0.30,0.72,n)*0.85;",
    "  col+=ice*smoothstep(0.52,0.86,n)*0.55;",
    "  float warm=fbm(p*2.4-q*1.3+vec2(t*1.6,-t));",
    "  col+=amber*smoothstep(0.64,0.92,warm)*0.32;",
    "  vec2 gp=p*26.0;vec2 gi=floor(gp);vec2 gf=fract(gp)-0.5;",
    "  float h=hash21(gi);",
    "  vec2 off=(vec2(hash21(gi+1.7),hash21(gi+9.1))-0.5)*0.7;",
    "  float tw=0.5+0.5*sin(u_time*(0.8+h*2.5)+h*6.2831);",
    "  float sp=smoothstep(0.09,0.0,length(gf-off))*step(0.91,h)*tw;",
    "  col+=ice*sp*0.8;",
    "  vec2 m=(u_mouse-0.5*u_res)/u_res.y;",
    "  float d=length(p-m);",
    "  col+=cobalt*0.5*exp(-d*d*3.5);",
    "  float vig=smoothstep(1.45,0.3,length(p));",
    "  col*=mix(0.6,1.0,vig);",
    "  col*=mix(0.5,1.0,smoothstep(0.05,0.6,uv.x));",
    "  gl_FragColor=vec4(col,1.0);",
    "}"
  ].join("\n");

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
  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;
  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var aLoc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(aLoc);
  gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);

  var uRes = gl.getUniformLocation(prog, "u_res");
  var uTime = gl.getUniformLocation(prog, "u_time");
  var uMouse = gl.getUniformLocation(prog, "u_mouse");

  var width = 1, height = 1;
  var mouse = { x: 0.72, y: 0.55, tx: 0.72, ty: 0.55 };

  function resize() {
    var r = hero.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var factor = r.width < 768 ? 0.5 : 0.66;
    width = Math.max(1, Math.round(r.width * dpr * factor));
    height = Math.max(1, Math.round(r.height * dpr * factor));
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
  }

  var start = performance.now();
  function draw(now) {
    var t = (now - start) / 1000;
    mouse.x += (mouse.tx - mouse.x) * 0.06;
    mouse.y += (mouse.ty - mouse.y) * 0.06;
    gl.uniform2f(uRes, width, height);
    gl.uniform1f(uTime, t);
    gl.uniform2f(uMouse, mouse.x * width, mouse.y * height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  var running = false, inView = true, raf = 0;
  function frame(now) {
    if (!running) return;
    draw(now);
    raf = requestAnimationFrame(frame);
  }
  function play() {
    if (running || reduce || !inView || document.hidden) return;
    running = true;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  window.addEventListener("pointermove", function (e) {
    var r = hero.getBoundingClientRect();
    mouse.tx = (e.clientX - r.left) / Math.max(1, r.width);
    mouse.ty = 1 - (e.clientY - r.top) / Math.max(1, r.height);
  }, { passive: true });

  var resizeRaf = 0;
  window.addEventListener("resize", function () {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(function () { resize(); if (!running) draw(performance.now()); });
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      if (inView) play(); else stop();
    }, { rootMargin: "10% 0px" }).observe(hero);
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else play();
  });

  resize();
  draw(performance.now());
  canvas.classList.add("is-ready");
  play();
})();
