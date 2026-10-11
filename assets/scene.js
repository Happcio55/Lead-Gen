/* Ironclad reactor scene. Three.js r147 (classic build) + bloom.
 * Exposes window.IroncladScene with setAlert(level), pulse(), forge(). */
(function () {
  "use strict";
  var canvas = document.getElementById("reactor");
  var api = { setAlert: noop, pulse: noop, forge: noop, ready: false };
  window.IroncladScene = api;
  function noop() {}

  if (!window.THREE || !canvas) return fail();
  var THREE = window.THREE;
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" });
  } catch (e) { return fail(); }

  function fail() { document.documentElement.classList.add("no-webgl"); }

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var small = window.innerWidth < 760;
  var COL = {
    arc: new THREE.Color("#8ff0ff"),
    arcHot: new THREE.Color("#e6fdff"),
    gold: new THREE.Color("#f2b84b"),
    red: new THREE.Color("#b3122a"),
    amber: new THREE.Color("#ffb547"),
    crit: new THREE.Color("#ff3b4e"),
    void: new THREE.Color("#06070a"),
  };

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75));
  renderer.setClearColor(COL.void, 1);

  var scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(COL.void, 0.04);
  var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(0, 0, 8);

  if (THREE.RoomEnvironment) {
    var pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
  }

  // ---------- textures drawn at runtime ----------
  function glowTexture(inner, outer) {
    var c = document.createElement("canvas");
    c.width = c.height = 128;
    var g = c.getContext("2d");
    var grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, inner);
    grd.addColorStop(0.25, outer);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  function coinTexture() {
    var c = document.createElement("canvas");
    c.width = c.height = 256;
    var g = c.getContext("2d");
    var grd = g.createRadialGradient(100, 90, 10, 128, 128, 140);
    grd.addColorStop(0, "#fff1c4");
    grd.addColorStop(0.45, "#e9a93a");
    grd.addColorStop(1, "#6b3f0c");
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "rgba(70,35,5,.75)";
    g.lineWidth = 6;
    [118, 100].forEach(function (r) { g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.stroke(); });
    for (var i = 0; i < 48; i++) {
      var a = (i / 48) * Math.PI * 2;
      g.beginPath();
      g.moveTo(128 + Math.cos(a) * 104, 128 + Math.sin(a) * 104);
      g.lineTo(128 + Math.cos(a) * 114, 128 + Math.sin(a) * 114);
      g.lineWidth = 3;
      g.stroke();
    }
    // a shield-shaped plate glyph
    g.fillStyle = "rgba(80,40,6,.85)";
    g.beginPath();
    g.moveTo(128, 58); g.lineTo(182, 78); g.lineTo(176, 140); g.lineTo(128, 196); g.lineTo(80, 140); g.lineTo(74, 78);
    g.closePath(); g.fill();
    g.fillStyle = "#ffe6a3";
    g.fillRect(118, 86, 20, 74);
    var t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }

  // ---------- the reactor ----------
  var reactor = new THREE.Group();
  scene.add(reactor);

  var metalRed = new THREE.MeshPhysicalMaterial({ color: COL.red, metalness: 0.85, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15 });
  var metalGold = new THREE.MeshStandardMaterial({ color: COL.gold, metalness: 1, roughness: 0.25 });
  var metalDark = new THREE.MeshStandardMaterial({ color: new THREE.Color("#2a2f38"), metalness: 0.9, roughness: 0.4 });
  var copper = new THREE.MeshStandardMaterial({ color: new THREE.Color("#c27a3a"), metalness: 1, roughness: 0.32 });
  var glowMat = new THREE.MeshBasicMaterial({ color: COL.arcHot });
  var glowSoft = new THREE.MeshBasicMaterial({ color: COL.arc, transparent: true, opacity: 0.9 });

  var core = new THREE.Mesh(new THREE.SphereGeometry(0.42, 48, 48), glowMat);
  reactor.add(core);

  var halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture("rgba(230,253,255,1)", "rgba(143,240,255,.35)"), color: COL.arc, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  halo.scale.set(3.4, 3.4, 1);
  halo.material.opacity = 0.6;
  reactor.add(halo);

  // Triangle core frame
  var tri = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.045, 8, 3), glowSoft);
  tri.rotation.z = Math.PI / 2;
  reactor.add(tri);

  var innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.07, 24, 120), glowSoft);
  reactor.add(innerRing);

  var plate = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.2, 96, 1, true), metalDark);
  plate.rotation.x = Math.PI / 2;
  plate.position.z = -0.15;
  reactor.add(plate);
  var backPlate = new THREE.Mesh(new THREE.CircleGeometry(1.7, 96), metalDark);
  backPlate.position.z = -0.25;
  reactor.add(backPlate);

  // Coils: the armour plates that blow apart into an exploded view
  var coils = [];
  var COILS = 10;
  for (var i = 0; i < COILS; i++) {
    var a = (i / COILS) * Math.PI * 2;
    var unit = new THREE.Group();
    var block = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.46, 0.22), copper);
    var cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.26), metalGold);
    cap.position.y = 0.26;
    var strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.02), glowSoft);
    strip.position.set(0.2, 0, 0.12);
    unit.add(block, cap, strip);
    unit.userData = { angle: a, r: 1.35 };
    unit.rotation.z = a - Math.PI / 2;
    reactor.add(unit);
    coils.push(unit);
  }

  var housing = new THREE.Mesh(new THREE.TorusGeometry(1.86, 0.18, 32, 160), metalRed);
  reactor.add(housing);
  var bezel = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.05, 16, 160), metalGold);
  reactor.add(bezel);

  // bolts on the housing
  var boltGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.08, 12);
  var bolts = new THREE.InstancedMesh(boltGeo, metalGold, 16);
  var m4 = new THREE.Matrix4();
  var q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  for (var b = 0; b < 16; b++) {
    var ba = (b / 16) * Math.PI * 2;
    m4.compose(new THREE.Vector3(Math.cos(ba) * 1.86, Math.sin(ba) * 1.86, 0.17), q, new THREE.Vector3(1, 1, 1));
    bolts.setMatrixAt(b, m4);
  }
  housing.add(bolts);

  var coreLight = new THREE.PointLight(COL.arc, 3.2, 12, 1.6);
  reactor.add(coreLight);
  var key = new THREE.DirectionalLight(new THREE.Color("#ffd8a8"), 0.8);
  key.position.set(4, 5, 6);
  scene.add(key);
  var rim = new THREE.DirectionalLight(new THREE.Color("#6fd8ff"), 0.8);
  rim.position.set(-6, -2, -3);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0x1a2230, 0.6));

  // ---------- holographic HUD rings ----------
  var hud = new THREE.Group();
  reactor.add(hud);
  var hudMat = new THREE.LineBasicMaterial({ color: COL.arc, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  var hudGold = new THREE.LineBasicMaterial({ color: COL.gold, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });

  function ring(r, segs, from, to, mat) {
    var pts = [];
    for (var s = 0; s <= segs; s++) {
      var t = from + (to - from) * (s / segs);
      pts.push(new THREE.Vector3(Math.cos(t) * r, Math.sin(t) * r, 0));
    }
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
  }
  function ticks(r, n, len, mat, every) {
    var pts = [];
    for (var s = 0; s < n; s++) {
      var t = (s / n) * Math.PI * 2;
      var l = every && s % every === 0 ? len * 2.4 : len;
      pts.push(new THREE.Vector3(Math.cos(t) * r, Math.sin(t) * r, 0));
      pts.push(new THREE.Vector3(Math.cos(t) * (r + l), Math.sin(t) * (r + l), 0));
    }
    return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat);
  }
  var hudRings = [];
  function addHud(obj, speed, z) { obj.position.z = z || 0; obj.userData.speed = speed; hud.add(obj); hudRings.push(obj); return obj; }
  addHud(ring(2.5, 200, 0, Math.PI * 2, hudMat), 0.05);
  addHud(ticks(2.56, 120, 0.06, hudMat, 10), -0.03);
  addHud(ring(2.95, 120, 0.2, 2.4, hudGold), 0.12, 0.05);
  addHud(ring(2.95, 80, 3.4, 4.6, hudGold), 0.12, 0.05);
  addHud(ring(3.3, 240, 0, Math.PI * 2, hudMat), -0.02, -0.1);
  addHud(ticks(3.34, 360, 0.03, hudMat, 30), -0.02, -0.1);
  addHud(ring(3.9, 60, 1.0, 1.9, hudMat), 0.2, 0.1);
  addHud(ring(3.9, 60, 4.1, 5.0, hudMat), 0.2, 0.1);

  var sweep = new THREE.Mesh(
    new THREE.RingGeometry(2.0, 3.3, 64, 1, 0, 0.7),
    new THREE.MeshBasicMaterial({ color: COL.arc, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })
  );
  hud.add(sweep);

  // shockwaves fired by pulse()
  var waves = [];
  var waveGeo = new THREE.RingGeometry(0.96, 1, 96);
  function spawnWave(color) {
    var m = new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({ color: color || COL.arc, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    m.scale.setScalar(1.8);
    m.userData.life = 0;
    reactor.add(m);
    waves.push(m);
  }

  // tactical globe
  var globe = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(5.2, 2)),
    new THREE.LineBasicMaterial({ color: COL.arc, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  reactor.add(globe);

  // ---------- coins in orbit ----------
  var COINS = small ? 18 : 30;
  var coinMat = new THREE.MeshStandardMaterial({ map: coinTexture(), metalness: 1, roughness: 0.22, color: 0xffffff });
  var coinMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.34, 0.055, 48), coinMat, COINS);
  scene.add(coinMesh);
  var coinData = [];
  for (var c = 0; c < COINS; c++) {
    coinData.push({
      r: 3.4 + Math.random() * 3.6,
      a: Math.random() * Math.PI * 2,
      speed: (0.08 + Math.random() * 0.14) * (Math.random() < 0.5 ? -1 : 1),
      tilt: (Math.random() - 0.5) * 1.1,
      y: (Math.random() - 0.5) * 2.4,
      spin: 0.6 + Math.random() * 1.8,
      phase: Math.random() * 10,
    });
  }

  // ---------- embers rising from the forge ----------
  var EMBERS = small ? 500 : 1200;
  var emberPos = new Float32Array(EMBERS * 3);
  var emberCol = new Float32Array(EMBERS * 3);
  var emberVel = new Float32Array(EMBERS);
  function resetEmber(i, anywhere) {
    var r = Math.random() * 7;
    var t = Math.random() * Math.PI * 2;
    emberPos[i * 3] = Math.cos(t) * r;
    emberPos[i * 3 + 1] = anywhere ? -4 + Math.random() * 9 : -4.2;
    emberPos[i * 3 + 2] = Math.sin(t) * r - 1;
    emberVel[i] = 0.25 + Math.random() * 0.9;
    var mix = Math.random();
    var col = new THREE.Color().lerpColors(COL.gold, COL.crit, mix * 0.7);
    emberCol[i * 3] = col.r; emberCol[i * 3 + 1] = col.g; emberCol[i * 3 + 2] = col.b;
  }
  for (var e = 0; e < EMBERS; e++) resetEmber(e, true);
  var emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute("position", new THREE.BufferAttribute(emberPos, 3));
  emberGeo.setAttribute("color", new THREE.BufferAttribute(emberCol, 3));
  var embers = new THREE.Points(emberGeo, new THREE.PointsMaterial({
    size: 0.07, map: glowTexture("rgba(255,255,255,1)", "rgba(255,200,120,.5)"), vertexColors: true,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(embers);

  // distant dust
  var DUST = small ? 800 : 1800;
  var dustPos = new Float32Array(DUST * 3);
  for (var d = 0; d < DUST; d++) {
    var rr = 14 + Math.random() * 40;
    var th = Math.random() * Math.PI * 2;
    var ph = Math.acos(2 * Math.random() - 1);
    dustPos[d * 3] = rr * Math.sin(ph) * Math.cos(th);
    dustPos[d * 3 + 1] = rr * Math.cos(ph);
    dustPos[d * 3 + 2] = rr * Math.sin(ph) * Math.sin(th);
  }
  var dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  var dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.08, color: new THREE.Color("#7fb7c9"), transparent: true, opacity: 0.6, depthWrite: false }));
  scene.add(dust);

  // hangar floor
  var grid = new THREE.GridHelper(60, 60, COL.arc, COL.arc);
  grid.material.transparent = true;
  grid.material.opacity = 0.09;
  grid.material.depthWrite = false;
  grid.position.y = -4.4;
  scene.add(grid);

  // ---------- post-processing ----------
  var composer = null, bloom = null;
  if (THREE.EffectComposer && THREE.UnrealBloomPass) {
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), small ? 0.6 : 0.75, 0.5, 0.32);
    composer.addPass(bloom);
  }

  // ---------- scroll choreography ----------
  // One keyframe per [data-shot] section: where the camera sits, where the reactor sits, how exploded.
  var SHOTS = {
    hero:    { cam: [0, 0.2, 8.2],  look: [0, 0, 0], rx: 2.3, ry: 0.15, explode: 0,   rot: [0.05, -0.35, 0], coins: 1 },
    armor:   { cam: [-3.2, 1.6, 9.4], look: [0, 0, 0], rx: -2.6, ry: 0, explode: 1, rot: [0.35, 0.65, 0.1], coins: 0.6 },
    scanner: { cam: [0, 0, 8.6],    look: [0, 0, 0], rx: 3.4, ry: 1.3, explode: 0.15, rot: [0, -0.2, 0], coins: 0.3 },
    forge:   { cam: [0, 5.4, 10.8],  look: [0, -0.4, 0], rx: -3.0, ry: -0.2, explode: 0.35, rot: [-0.9, 0, 0], coins: 0 },
    chain:   { cam: [0, 1.2, 12.5], look: [0, 0, 0], rx: 0, ry: 0.6, explode: 0, rot: [0.15, 0.4, 0], coins: 1 },
  };
  var shotEls = Array.prototype.slice.call(document.querySelectorAll("[data-shot]"));
  var cur = {
    cam: new THREE.Vector3(0, 0.2, 8.2), look: new THREE.Vector3(), rx: 2.3, ry: 0.15, explode: 0,
    rot: new THREE.Vector3(0.05, -0.35, 0), coins: 1,
  };
  var target = JSON.parse(JSON.stringify(SHOTS.hero));
  var mouse = { x: 0, y: 0, tx: 0, ty: 0 };

  function lerpArr(a, b, t) { return a.map(function (v, i) { return v + (b[i] - v) * t; }); }
  function smooth(t) { return t * t * (3 - 2 * t); }

  function computeTarget() {
    if (!shotEls.length) return;
    var mid = window.innerHeight * 0.5;
    var centers = shotEls.map(function (el) { var r = el.getBoundingClientRect(); return r.top + r.height * 0.5; });
    var i = 0;
    while (i < centers.length - 1 && centers[i + 1] < mid) i++;
    var a = SHOTS[shotEls[i].dataset.shot] || SHOTS.hero;
    var bIdx = Math.min(i + 1, centers.length - 1);
    var b = SHOTS[shotEls[bIdx].dataset.shot] || a;
    var t = bIdx === i ? 0 : smooth(Math.max(0, Math.min(1, (mid - centers[i]) / (centers[bIdx] - centers[i]))));
    if (centers[0] > mid) t = 0;
    var narrow = window.innerWidth < 900;
    target = {
      cam: lerpArr(a.cam, b.cam, t),
      look: lerpArr(a.look, b.look, t),
      rx: (a.rx + (b.rx - a.rx) * t) * (narrow ? 0 : 1),
      ry: (a.ry + (b.ry - a.ry) * t) + (narrow ? 1.9 : 0),
      explode: a.explode + (b.explode - a.explode) * t,
      rot: lerpArr(a.rot, b.rot, t),
      coins: a.coins + (b.coins - a.coins) * t,
    };
    if (narrow) target.cam[2] += 4;
  }

  window.addEventListener("scroll", computeTarget, { passive: true });
  window.addEventListener("pointermove", function (ev) {
    mouse.tx = (ev.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (ev.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (composer) { composer.setSize(w, h); }
    small = w < 760;
    computeTarget();
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------- alert state (driven by scan verdicts) ----------
  var alertColor = COL.arc.clone();
  var alertTarget = COL.arc.clone();
  var alertHot = COL.arcHot.clone();
  var alertHotTarget = COL.arcHot.clone();
  var surge = 0;
  var forgeT = -1;

  api.setAlert = function (level) {
    var map = { ironclad: [COL.arc, COL.arcHot], caution: [COL.amber, new THREE.Color("#fff0d1")], danger: [COL.crit, new THREE.Color("#ffd5d9")] };
    var pick = map[level] || map.ironclad;
    alertTarget.copy(pick[0]);
    alertHotTarget.copy(pick[1]);
    spawnWave(pick[0]);
  };
  api.pulse = function () { surge = 1; spawnWave(alertTarget); };
  api.forge = function () { forgeT = 0; surge = 1.4; spawnWave(COL.gold); };

  // ---------- loop ----------
  var clock = new THREE.Clock();
  var dummy = new THREE.Object3D();
  var lookV = new THREE.Vector3();
  var speedK = reduced ? 0.2 : 1;

  function frame() {
    var dt = Math.min(clock.getDelta(), 0.05);
    var t = clock.elapsedTime;
    var k = 1 - Math.pow(0.0025, dt); // frame-rate independent damping

    mouse.x += (mouse.tx - mouse.x) * k;
    mouse.y += (mouse.ty - mouse.y) * k;
    cur.cam.lerp(lookV.set(target.cam[0] + mouse.x * 0.5, target.cam[1] - mouse.y * 0.35, target.cam[2]), k);
    cur.look.lerp(lookV.set(target.look[0], target.look[1], target.look[2]), k);
    cur.rx += (target.rx - cur.rx) * k;
    cur.ry += (target.ry - cur.ry) * k;
    cur.explode += (target.explode - cur.explode) * k;
    cur.coins += (target.coins - cur.coins) * k;
    cur.rot.lerp(lookV.set(target.rot[0], target.rot[1], target.rot[2]), k);

    camera.position.copy(cur.cam);
    camera.lookAt(cur.look);
    reactor.position.set(cur.rx, cur.ry, 0);
    reactor.rotation.set(cur.rot.x + Math.sin(t * 0.4) * 0.04, cur.rot.y + Math.sin(t * 0.3) * 0.06, cur.rot.z);

    // exploded view
    var ex = cur.explode;
    coils.forEach(function (u, i) {
      var r = u.userData.r + ex * (1.4 + (i % 2) * 0.6);
      u.position.set(Math.cos(u.userData.angle) * r, Math.sin(u.userData.angle) * r, ex * ((i % 3) - 1) * 0.9);
      u.rotation.x = ex * (i % 2 ? 0.7 : -0.7);
    });
    housing.position.z = -ex * 1.6;
    bezel.position.z = ex * 1.3;
    bezel.scale.setScalar(1 + ex * 0.35);
    plate.position.z = -0.15 - ex * 2.6;
    backPlate.position.z = -0.25 - ex * 2.7;
    tri.position.z = ex * 0.8;
    innerRing.position.z = ex * 0.4;

    // alert color + surge
    alertColor.lerp(alertTarget, k * 0.6);
    alertHot.lerp(alertHotTarget, k * 0.6);
    surge = Math.max(0, surge - dt * 0.9);
    var beat = 0.5 + 0.5 * Math.sin(t * 2.2 * speedK);
    glowMat.color.copy(alertHot);
    glowSoft.color.copy(alertColor);
    halo.material.color.copy(alertColor);
    hudMat.color.copy(alertColor);
    sweep.material.color.copy(alertColor);
    coreLight.color.copy(alertColor);
    coreLight.intensity = 1.6 + beat * 0.8 + surge * 4;
    halo.scale.setScalar(3.2 + beat * 0.4 + surge * 2.5);
    core.scale.setScalar(1 + beat * 0.05 + surge * 0.25);
    if (bloom) bloom.strength = (small ? 0.6 : 0.75) + surge * 0.8;

    tri.rotation.y = t * 0.6 * speedK;
    innerRing.rotation.z = -t * 0.3 * speedK;
    hudRings.forEach(function (r) { r.rotation.z += r.userData.speed * dt * speedK * (1 + surge * 6); });
    sweep.rotation.z -= dt * (1.1 + surge * 8) * speedK;
    sweep.material.opacity = 0.1 + surge * 0.25;
    globe.rotation.y += dt * 0.03 * speedK;
    globe.rotation.x += dt * 0.012 * speedK;

    for (var w = waves.length - 1; w >= 0; w--) {
      var wv = waves[w];
      wv.userData.life += dt;
      var L = wv.userData.life / 1.6;
      wv.scale.setScalar(1.8 + L * 6);
      wv.material.opacity = Math.max(0, 0.9 * (1 - L));
      if (L >= 1) { reactor.remove(wv); wv.material.dispose(); waves.splice(w, 1); }
    }

    // coins: orbit, or rush into the core when forging
    var f = forgeT >= 0 ? forgeT : -1;
    if (forgeT >= 0) { forgeT += dt; if (forgeT > 2.6) forgeT = -1; }
    var pull = f < 0 ? 0 : f < 1.1 ? smooth(f / 1.1) : Math.max(0, 1 - (f - 1.1) / 1.5);
    for (var c = 0; c < COINS; c++) {
      var cd = coinData[c];
      cd.a += cd.speed * dt * speedK * (1 + pull * 4);
      var spread = 0.35 + cur.coins * 0.65;
      var rr = cd.r * spread * (1 - pull * 0.85) + (f > 1.1 ? pull * 0 : 0);
      var x = Math.cos(cd.a) * rr;
      var z = Math.sin(cd.a) * rr;
      var y = cd.y * spread + z * Math.sin(cd.tilt) * 0.4 + Math.sin(t + cd.phase) * 0.15;
      dummy.position.set(x + cur.rx * 0.6, y + cur.ry, z - 1);
      dummy.rotation.set(Math.PI / 2 + Math.sin(t * 0.5 + cd.phase) * 0.6, t * cd.spin * speedK, cd.tilt);
      dummy.scale.setScalar(1 - pull * 0.4);
      dummy.updateMatrix();
      coinMesh.setMatrixAt(c, dummy.matrix);
    }
    coinMesh.instanceMatrix.needsUpdate = true;

    // embers
    if (!reduced) {
      for (var i = 0; i < EMBERS; i++) {
        emberPos[i * 3 + 1] += emberVel[i] * dt * (1 + surge * 2);
        emberPos[i * 3] += Math.sin(t * 0.7 + i) * dt * 0.08;
        if (emberPos[i * 3 + 1] > 5.5) resetEmber(i, false);
      }
      emberGeo.attributes.position.needsUpdate = true;
    }
    dust.rotation.y += dt * 0.004;

    if (composer) composer.render(dt); else renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  computeTarget();
  api.ready = true;
  document.documentElement.classList.add("webgl-ready");
  requestAnimationFrame(frame);
})();
