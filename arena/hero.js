/* Three.js hero: a quantum core orbited by the four agents, inside a particle nebula. */
(function (global) {
  'use strict';
  const canvas = document.getElementById('heroCanvas');
  const api = { pulse() {} };
  global.Hero = api;
  if (!global.THREE || !canvas) return;
  const T = global.THREE;
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
  catch (e) { return; }
  renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new T.Scene();
  scene.fog = new T.FogExp2(0x07050d, 0.045);
  const camera = new T.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(0, 0.6, 9);

  const root = new T.Group();
  scene.add(root);

  // glow sprite texture
  function glowTex(stops) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    stops.forEach(([o, col]) => grd.addColorStop(o, col));
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const t = new T.CanvasTexture(c); return t;
  }
  const softTex = glowTex([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]);

  /* ---------- core ---------- */
  const core = new T.Group();
  root.add(core);
  const coreMat = new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uA: { value: new T.Color('#b8ff3c') }, uB: { value: new T.Color('#9466ff') }, uC: { value: new T.Color('#ff4fd8') } },
    vertexShader: `
      uniform float uTime; varying vec3 vN; varying vec3 vP; varying float vD;
      float h(vec3 p){ return sin(p.x*3.1+uTime)*sin(p.y*2.7+uTime*1.3)*sin(p.z*3.3+uTime*.7); }
      void main(){
        vec3 p = position; float d = h(normal*1.7)*0.12; p += normal*d; vD = d;
        vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(p,1.); vP = -mv.xyz; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; varying vec3 vN; varying vec3 vP; varying float vD;
      void main(){
        float f = pow(1. - abs(dot(normalize(vN), normalize(vP))), 2.2);
        vec3 col = mix(uB, uC, smoothstep(-.1,.12,vD));
        col = mix(col, uA, smoothstep(.35,1.,f));
        gl_FragColor = vec4(col*(0.75+f*1.4), 0.7 + f*0.3); }`,
    transparent: true
  });
  const sphere = new T.Mesh(new T.IcosahedronGeometry(1.05, 5), coreMat);
  core.add(sphere);
  const shell = new T.LineSegments(new T.EdgesGeometry(new T.IcosahedronGeometry(1.6, 1)), new T.LineBasicMaterial({ color: 0x9466ff, transparent: true, opacity: 0.45 }));
  core.add(shell);
  const shell2 = new T.LineSegments(new T.EdgesGeometry(new T.OctahedronGeometry(2.05, 0)), new T.LineBasicMaterial({ color: 0x5fe0ff, transparent: true, opacity: 0.18 }));
  core.add(shell2);
  const coreGlow = new T.Sprite(new T.SpriteMaterial({ map: softTex, color: 0x9466ff, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false }));
  coreGlow.scale.set(7, 7, 1);
  core.add(coreGlow);
  // Bloch rings
  const ringMat = (c, o) => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false });
  const ring1 = new T.Mesh(new T.TorusGeometry(2.6, 0.008, 6, 160), ringMat(0xffffff, 0.35));
  ring1.rotation.x = Math.PI / 2;
  core.add(ring1);
  const ring2 = new T.Mesh(new T.TorusGeometry(2.6, 0.006, 6, 160), ringMat(0xff4fd8, 0.3));
  core.add(ring2);

  /* ---------- nebula ---------- */
  const N = 3200;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const palette = ['#b8ff3c', '#9466ff', '#ff4fd8', '#5fe0ff', '#ffb45c', '#ffffff'].map((c) => new T.Color(c));
  for (let i = 0; i < N; i++) {
    const arm = i % 3, r = 3 + Math.pow(Math.random(), 0.7) * 16;
    const a = r * 0.35 + arm * (Math.PI * 2 / 3) + (Math.random() - 0.5) * 0.9;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = (Math.random() - 0.5) * (1.2 + r * 0.18);
    pos[i * 3 + 2] = Math.sin(a) * r;
    const c = palette[(Math.random() * palette.length) | 0];
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const pg = new T.BufferGeometry();
  pg.setAttribute('position', new T.BufferAttribute(pos, 3));
  pg.setAttribute('color', new T.BufferAttribute(col, 3));
  const nebula = new T.Points(pg, new T.PointsMaterial({ size: 0.07, map: softTex, vertexColors: true, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false }));
  nebula.rotation.x = 0.35;
  root.add(nebula);

  /* ---------- agents ---------- */
  const AG = (global.Q && global.Q.AGENTS) || [];
  const orbs = AG.map((a, i) => {
    const g = new T.Group();
    const c = new T.Color(a.glow);
    const ball = new T.Mesh(new T.SphereGeometry(0.16, 24, 24), new T.MeshBasicMaterial({ color: c }));
    const halo = new T.Sprite(new T.SpriteMaterial({ map: softTex, color: c, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }));
    halo.scale.set(1.3, 1.3, 1);
    g.add(ball); g.add(halo);
    root.add(g);
    const TL = 70;
    const tp = new Float32Array(TL * 3);
    const tg = new T.BufferGeometry(); tg.setAttribute('position', new T.BufferAttribute(tp, 3));
    const trail = new T.Line(tg, new T.LineBasicMaterial({ color: c, transparent: true, opacity: 0.5, blending: T.AdditiveBlending }));
    root.add(trail);
    const beamG = new T.BufferGeometry(); beamG.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3));
    const beam = new T.Line(beamG, new T.LineBasicMaterial({ color: c, transparent: true, opacity: 0.0, blending: T.AdditiveBlending }));
    root.add(beam);
    return { g, halo, trail, tp, TL, beam, r: 3.1 + i * 0.55, speed: 0.32 - i * 0.045, tilt: (i - 1.5) * 0.42, phase: i * Math.PI / 2, kick: 0, filled: 0 };
  });

  api.pulse = (i) => { if (orbs[i]) orbs[i].kick = 1; };

  /* ---------- interaction ---------- */
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  global.addEventListener('pointermove', (e) => { mouse.tx = (e.clientX / innerWidth - 0.5) * 2; mouse.ty = (e.clientY / innerHeight - 0.5) * 2; }, { passive: true });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    root.position.x = w > 900 ? 2.9 : 0;
    root.position.y = w > 900 ? 0 : -2.3;
    root.scale.setScalar(w > 900 ? 1 : 0.7);
  }
  global.addEventListener('resize', resize);
  resize();

  let visible = true;
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(canvas);
  const reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clock = new T.Clock();
  const v = new T.Vector3();
  function frame() {
    requestAnimationFrame(frame);
    if (!visible) return;
    const t = reduce ? 4 : clock.getElapsedTime();
    mouse.x += (mouse.tx - mouse.x) * 0.04; mouse.y += (mouse.ty - mouse.y) * 0.04;
    coreMat.uniforms.uTime.value = t;
    sphere.rotation.y = t * 0.15;
    shell.rotation.set(t * 0.11, t * 0.17, 0);
    shell2.rotation.set(-t * 0.07, t * 0.05, t * 0.04);
    ring1.rotation.y = t * 0.3; ring2.rotation.x = t * 0.21; ring2.rotation.y = t * 0.13;
    coreGlow.material.opacity = 0.45 + Math.sin(t * 1.7) * 0.1;
    nebula.rotation.y = t * 0.025;
    orbs.forEach((o) => {
      const a = o.phase + t * o.speed;
      v.set(Math.cos(a) * o.r, Math.sin(a * 1.3) * 0.5, Math.sin(a) * o.r);
      v.applyAxisAngle(new T.Vector3(1, 0, 0), o.tilt);
      o.g.position.copy(v);
      o.kick *= 0.96;
      const s = 1.3 + o.kick * 2.5 + Math.sin(t * 3 + o.phase) * 0.1;
      o.halo.scale.set(s, s, 1);
      // trail
      const tp = o.tp;
      tp.copyWithin(3, 0, (o.TL - 1) * 3);
      tp[0] = v.x; tp[1] = v.y; tp[2] = v.z;
      if (o.filled < o.TL) { for (let k = o.filled; k < o.TL; k++) { tp[k * 3] = v.x; tp[k * 3 + 1] = v.y; tp[k * 3 + 2] = v.z; } o.filled = o.TL; }
      o.trail.geometry.attributes.position.needsUpdate = true;
      const bp = o.beam.geometry.attributes.position.array;
      bp[3] = v.x; bp[4] = v.y; bp[5] = v.z;
      o.beam.geometry.attributes.position.needsUpdate = true;
      o.beam.material.opacity = 0.08 + o.kick * 0.8 + Math.max(0, Math.sin(t * 0.8 + o.phase * 2)) * 0.12;
    });
    const sc = Math.min(global.scrollY / innerHeight, 1);
    camera.position.x = mouse.x * 0.8;
    camera.position.y = 0.6 - mouse.y * 0.5 + sc * 1.5;
    camera.position.z = 9 + sc * 3;
    camera.lookAt(root.position.x * 0.35, root.position.y * 0.5, 0);
    renderer.render(scene, camera);
  }
  frame();
})(window);
