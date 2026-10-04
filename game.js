'use strict';
// GROW OR GET EATEN — vertical slice. Single-file game logic on top of three.js (global THREE).
(() => {
// ---------------------------------------------------------------- utils
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const pick = arr => arr[(Math.random() * arr.length) | 0];
const sizeFor = m => 0.3 * Math.pow(m, 0.6);          // mass -> model scale (shared by player and creatures)
const dmgCalc = (a, b, k) => k * a * clamp(Math.pow(a / b, 0.6), 0.45, 4);
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------------------------------------------------------------- world shape
const WORLD = 122;
const POND = { x: -38, z: 48, r: 13 };
const CAVE = { x: 30, z: -88 };
const START = { x: 0, z: 92 };
const zoneOf = (x, z) => { const zz = z + Math.sin(x * 0.045) * 7; return zz > 22 ? 0 : zz > -38 ? 1 : 2; };
const ZONE_NAMES = ['🌾 SAFE GRASSLAND', '🌲 THE FOREST', '⛰️ ROCKY DEN — APEX TERRITORY'];

function heightAt(x, z) {
  const zz = z + Math.sin(x * 0.045) * 7;
  let h = Math.sin(x * 0.06) * Math.cos(z * 0.05) * 1.1 + Math.sin(x * 0.11 + z * 0.07) * 0.5;
  h += smooth(26, 4, zz) * Math.sin(x * 0.09 + 1) * Math.sin(z * 0.08) * 2.2;               // forest hills
  h += smooth(-34, -62, zz) * (6.5 + Math.abs(Math.sin(x * 0.15) * Math.cos(z * 0.13)) * 3.5); // rocky plateau
  h += 4.5 * Math.exp(-((x - 48) ** 2 + (z - 72) ** 2) / 260);                              // grassy lookout hill
  const pd = Math.hypot(x - POND.x, z - POND.z);
  if (pd < POND.r + 6) h -= 3.2 * smooth(POND.r + 6, POND.r * 0.3, pd);
  h += smooth(98, 128, Math.max(Math.abs(x), Math.abs(z))) * 20;                           // soft edge mountains
  return h;
}

// ---------------------------------------------------------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('game').appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
const SKY = 0x8fd3ff;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 90, 260);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.08, 700);

scene.add(new THREE.HemisphereLight(0xd8f0ff, 0x6a8f4a, 1.25));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 260 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

const BOX = new THREE.BoxGeometry(1, 1, 1);
const tmpC = new THREE.Color();
const V = new THREE.Vector3();

// ---------------------------------------------------------------- terrain
(function buildTerrain() {
  const S = 270, N = 110;
  let g = new THREE.PlaneGeometry(S, S, N, N);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
  g = g.toNonIndexed();
  const pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const zn = zoneOf(cx, cz + rand(-3, 3));
    const pd = Math.hypot(cx - POND.x, cz - POND.z);
    if (pd < POND.r + 2.5) tmpC.setHex(0xe8d08e);
    else if (cy > 11) tmpC.setHex(Math.random() < 0.5 ? 0x8e9a7e : 0x7f8b72);
    else if (zn === 0) tmpC.setHex(Math.random() < 0.5 ? 0x8ad85a : 0x7ccd4d);
    else if (zn === 1) tmpC.setHex(Math.random() < 0.5 ? 0x5aab44 : 0x4f9e3c);
    else tmpC.setHex(Math.random() < 0.5 ? 0xa89b84 : 0x988c78);
    tmpC.offsetHSL(0, 0, rand(-0.025, 0.025));
    for (let k = 0; k < 3; k++) cols.set([tmpC.r, tmpC.g, tmpC.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  const ground = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.receiveShadow = true;
  scene.add(ground);
})();

let waterY = 99;
for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; waterY = Math.min(waterY, heightAt(POND.x + Math.cos(a) * (POND.r + 1), POND.z + Math.sin(a) * (POND.r + 1))); }
waterY -= 0.25;
const water = new THREE.Mesh(new THREE.CircleGeometry(POND.r + 4, 28), new THREE.MeshLambertMaterial({ color: 0x47b8ff, transparent: true, opacity: 0.78 }));
water.rotation.x = -Math.PI / 2;
water.position.set(POND.x, waterY, POND.z);
scene.add(water);

// ---------------------------------------------------------------- colliders (spatial hash)
const CELL = 12, colGrid = new Map(), colliders = [];
const cellKey = (x, z) => ((Math.floor(x / CELL) + 50) * 1000) + (Math.floor(z / CELL) + 50);
function addCol(x, z, r) {
  const c = { x, z, r }; colliders.push(c);
  const k = cellKey(x, z); if (!colGrid.has(k)) colGrid.set(k, []); colGrid.get(k).push(c);
}
function collide(pos, rad, ignoreBelow) {
  const cx = Math.floor(pos.x / CELL), cz = Math.floor(pos.z / CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const list = colGrid.get((cx + i + 50) * 1000 + (cz + j + 50)); if (!list) continue;
    for (const c of list) {
      if (c.r < ignoreBelow) continue;
      const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), m = c.r + rad;
      if (d < m && d > 1e-4) { pos.x = c.x + dx / d * m; pos.z = c.z + dz / d * m; }
    }
  }
}
const freeSpot = (x, z, r) => colliders.every(c => Math.hypot(c.x - x, c.z - z) > c.r + r);

// ---------------------------------------------------------------- scenery (instanced)
const dummy = new THREE.Object3D();
function inst(geo, max, shadow = true) {
  const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ flatShading: true }), max);
  m.castShadow = shadow; m.receiveShadow = true; m.count = 0; scene.add(m); return m;
}
function addInst(m, x, y, z, sx, sy, sz, ry, color, rx = 0, rz = 0) {
  dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, rz); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
  m.setMatrixAt(m.count, dummy.matrix); m.setColorAt(m.count, tmpC.setHex(color)); m.count++;
}
const trunks = inst(BOX, 400), leaves = inst(BOX, 900), rocks = inst(new THREE.DodecahedronGeometry(1, 0), 300);
const bushes = inst(new THREE.IcosahedronGeometry(1, 0), 200), flowers = inst(BOX, 400, false);

function tree(x, z, kind) {
  const y = heightAt(x, z), s = rand(0.85, 1.45), ry = rand(0, 6.3);
  if (kind === 'round') {
    const h = rand(2.4, 3.6) * s;
    addInst(trunks, x, y + h / 2, z, 0.7 * s, h, 0.7 * s, ry, 0x8b5a2b);
    addInst(leaves, x, y + h + 1.1 * s, z, 3.4 * s, 2.6 * s, 3.4 * s, ry, pick([0x5cc94a, 0x6fd64f, 0x4fbf45]));
    addInst(leaves, x, y + h + 2.7 * s, z, 2.2 * s, 1.4 * s, 2.2 * s, ry + 0.5, pick([0x77df5a, 0x66d150]));
    if (Math.random() < 0.3) addInst(leaves, x + 1.2 * s, y + h + 1.4 * s, z, 0.4 * s, 0.4 * s, 0.4 * s, 0, 0xff5252); // apple
  } else if (kind === 'pine') {
    const h = rand(1.6, 2.6) * s;
    addInst(trunks, x, y + h / 2, z, 0.6 * s, h, 0.6 * s, ry, 0x6d4425);
    const g = pick([0x2f8f3a, 0x37993f, 0x2a7f34]);
    addInst(leaves, x, y + h + 0.8 * s, z, 3.8 * s, 1.6 * s, 3.8 * s, ry, g);
    addInst(leaves, x, y + h + 2.3 * s, z, 2.8 * s, 1.5 * s, 2.8 * s, ry + 0.4, g);
    addInst(leaves, x, y + h + 3.7 * s, z, 1.7 * s, 1.4 * s, 1.7 * s, ry + 0.8, g);
    addInst(leaves, x, y + h + 4.8 * s, z, 0.7 * s, 0.9 * s, 0.7 * s, ry, g);
  } else { // dead tree
    const h = rand(3, 5) * s;
    addInst(trunks, x, y + h / 2, z, 0.5 * s, h, 0.5 * s, ry, 0x7a6a5a);
    addInst(trunks, x + 0.6 * s, y + h * 0.7, z, 0.25 * s, 1.6 * s, 0.25 * s, ry, 0x7a6a5a, 0, -0.8);
  }
  addCol(x, z, (kind === 'dead' ? 0.3 : 0.4) * s + 0.1);
}
function rock(x, z, s, col) {
  const y = heightAt(x, z);
  addInst(rocks, x, y + s * 0.35, z, s * rand(0.9, 1.3), s * rand(0.6, 1.0), s * rand(0.9, 1.3), rand(0, 6.3), col || pick([0x9e9e9e, 0x8d8478, 0xb0a594, 0x8a8a90]), rand(-0.3, 0.3), rand(-0.3, 0.3));
  if (s > 1.1) addCol(x, z, s * 0.95);
}
function scatter(n, zone, fn, minR = 3, avoidStart = 14) {
  let placed = 0, tries = 0;
  while (placed < n && tries++ < n * 30) {
    const x = rand(-WORLD + 4, WORLD - 4), z = rand(-WORLD + 4, WORLD - 4);
    if (zone !== null && zoneOf(x, z) !== zone) continue;
    if (Math.hypot(x - START.x, z - START.z) < avoidStart) continue;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 4) continue;
    if (Math.hypot(x - CAVE.x, z - CAVE.z) < 22) continue;
    if (Math.max(Math.abs(x), Math.abs(z)) > 104 && zone !== null) continue;
    if (!freeSpot(x, z, minR)) continue;
    fn(x, z); placed++;
  }
}
// cave / den first, so scatter avoids it
(function buildDen() {
  const g = new THREE.Group(), y = heightAt(CAVE.x, CAVE.z) - 1.5;
  const mat = new THREE.MeshLambertMaterial({ color: 0x8a7f72, flatShading: true }), dark = new THREE.MeshLambertMaterial({ color: 0x241c17 });
  const part = (w, h, d, x, yy, z, m = mat, rx = 0, rz = 0) => { const b = new THREE.Mesh(BOX, m); b.scale.set(w, h, d); b.position.set(x, yy, z); b.rotation.set(rx, 0, rz); b.castShadow = b.receiveShadow = true; g.add(b); };
  part(14, 26, 30, -15, 8, -2, mat, 0, 0.08); part(14, 24, 30, 15, 7, -2, mat, 0, -0.1);
  part(40, 9, 26, 0, 19, -4, mat, 0.05, 0); part(40, 30, 8, 0, 10, -15);
  part(17, 12, 18, 0, 5, -6, dark); part(18, 0.4, 14, 0, 1.6, -2, dark);
  part(8, 7, 7, -24, 2.5, 8, mat, 0.2, 0.3); part(7, 9, 6, 24, 3.5, 6, mat, -0.1, -0.3); part(5, 4, 5, 11, 1.5, 12, mat, 0.3, 0.2);
  const bone = new THREE.MeshLambertMaterial({ color: 0xf2ecd9 });
  for (let i = 0; i < 7; i++) part(rand(0.3, 0.5), 0.3, rand(1.6, 2.6), rand(-9, 9), 1.8, rand(4, 14), bone, 0, rand(0, 3));
  g.position.set(CAVE.x, y, CAVE.z); scene.add(g);
  for (const [dx, dz, r] of [[-15, -2, 8], [15, -2, 8], [-15, -12, 8], [15, -12, 8], [0, -15, 9], [-24, 8, 4.5], [24, 6, 4]]) addCol(CAVE.x + dx, CAVE.z + dz, r);
})();
// a few dramatic rock spires in the rocky zone
for (const [x, z, s] of [[-60, -70, 7], [-25, -95, 6], [75, -60, 6.5], [-85, -45, 5], [60, -95, 5], [-5, -60, 4.5]]) rock(x, z, s);
scatter(95, 1, (x, z) => tree(x, z, Math.random() < 0.7 ? 'pine' : 'round'), 3.2);
scatter(22, 0, (x, z) => tree(x, z, 'round'), 6, 16);
scatter(12, 2, (x, z) => tree(x, z, 'dead'), 5);
scatter(55, 2, (x, z) => rock(x, z, rand(1.2, 4)), 3);
scatter(18, 0, (x, z) => rock(x, z, rand(0.5, 1.4)), 2, 8);
scatter(14, 1, (x, z) => rock(x, z, rand(0.7, 2)), 2);
for (let i = 0; i < 70; i++) { // border trees on the soft mountains
  const a = rand(0, 6.3), r = rand(106, 118), x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (Math.hypot(x - CAVE.x, z - CAVE.z) > 20) tree(clamp(x, -118, 118), clamp(z, -118, 118), z < -40 ? 'dead' : 'pine');
}
const bushIn = zone => scatter(32, zone, (x, z) => { const s = rand(0.6, 1.3); addInst(bushes, x, heightAt(x, z) + s * 0.4, z, s * 1.3, s, s * 1.3, rand(0, 6), pick(zone ? [0x3f9a3a, 0x4caf50] : [0x67c94e, 0x5abf47])); }, 1.5, 8);
bushIn(0); bushIn(1);
scatter(160, 0, (x, z) => addInst(flowers, x, heightAt(x, z) + 0.15, z, 0.3, 0.3, 0.3, rand(0, 6), pick([0xff6fae, 0xffe14d, 0xffffff, 0xb388ff])), 0, 4);
[trunks, leaves, rocks, bushes, flowers].forEach(m => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });

// clouds
const clouds = [];
for (let i = 0; i < 14; i++) {
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: false });
  for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(BOX, m); b.scale.set(rand(8, 16), rand(3, 5), rand(6, 10)); b.position.set(k * 7 - 10, rand(-1, 1.5), rand(-3, 3)); g.add(b); }
  g.position.set(rand(-160, 160), rand(70, 95), rand(-160, 160)); scene.add(g); clouds.push(g);
}

// ---------------------------------------------------------------- creature models
function buildModel(o) {
  const root = new THREE.Group(), mats = [], cache = {};
  const M = c => { if (!cache[c]) { cache[c] = new THREE.MeshLambertMaterial({ color: c, flatShading: true }); mats.push(cache[c]); } return cache[c]; };
  const B = (par, w, h, d, c, x, y, z, shadow = true) => { const m = new THREE.Mesh(BOX, M(c)); m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = shadow; par.add(m); return m; };
  const R = { root, mats, legs: [], B, M, phase: Math.random() * 6, jawOpen: 0, biteT: 0, upperY: 0, o };
  const upper = new THREE.Group(); root.add(upper); R.upper = upper;

  if (o.shape === 'bug') {
    const body = new THREE.Group(); body.position.y = 0.22; upper.add(body); R.body = body;
    B(body, 0.62, 0.3, 0.7, o.main, 0, 0, 0);
    B(body, 0.04, 0.31, 0.7, o.dark, 0, 0.01, 0, false);
    for (const [x, z] of [[-0.17, 0.12], [0.17, 0.12], [-0.15, -0.17], [0.15, -0.17]]) B(body, 0.13, 0.04, 0.13, o.dark, x, 0.16, z, false);
    const head = new THREE.Group(); head.position.set(0, 0.2, 0.4); upper.add(head); R.head = head;
    B(head, 0.34, 0.2, 0.2, o.dark, 0, 0, 0);
    for (const s of [-1, 1]) { B(head, 0.08, 0.08, 0.04, 0xffffff, s * 0.09, 0.03, 0.1, false); B(head, 0.03, 0.22, 0.03, o.dark, s * 0.1, 0.18, 0.02, false).rotation.z = -s * 0.4; }
    for (let i = 0; i < 6; i++) {
      const s = i % 2 ? 1 : -1, leg = new THREE.Group(); leg.position.set(s * 0.3, 0.2, 0.2 - Math.floor(i / 2) * 0.2); upper.add(leg);
      B(leg, 0.22, 0.04, 0.04, o.dark, s * 0.1, -0.08, 0, false).rotation.z = s * 0.7; R.legs.push(leg);
    }
    return R;
  }

  const by = o.legH + o.H / 2;
  const body = new THREE.Group(); body.position.set(0, by, 0); upper.add(body); R.body = body;
  B(body, o.W, o.H, o.L, o.main, 0, 0, 0);
  if (o.belly) B(body, o.W * 0.86, o.H * 0.38, o.L * 0.82, o.belly, 0, -o.H * 0.34, 0.02);
  if (o.mane) B(body, o.W * 0.35, o.H * 0.3, o.L * 0.85, o.mane, 0, o.H * 0.58, 0.04);
  if (o.stripes) for (let i = 0; i < 3; i++) B(body, o.W * 1.02, o.H * 0.3, o.L * 0.08, o.acc, 0, o.H * 0.2, -o.L * 0.25 + i * o.L * 0.22, false);
  if (o.spikes) {
    const n = Math.max(3, Math.round(o.L * 5));
    for (let i = 0; i < n; i++) { const sp = B(body, o.W * 0.12, o.W * 0.12, o.W * 0.12, o.acc, 0, o.H * 0.5, o.L * 0.4 - i * (o.L * 0.8 / (n - 1))); sp.rotation.z = Math.PI / 4; sp.scale.multiplyScalar(i % 2 ? 1.6 : 2.2); }
    R.spikes = body.children.slice(-n);
  }
  // head
  const [hw, hh, hd] = o.head;
  const head = new THREE.Group(); head.position.set(0, by + o.H * 0.3, o.L / 2 + hd * 0.25); upper.add(head); R.head = head;
  B(head, hw, hh, hd, o.main, 0, 0, hd * 0.2);
  const sl = o.snout;
  if (sl > 0) B(head, hw * 0.74, hh * 0.42, sl, o.snoutCol || o.main, 0, -hh * 0.12, hd * 0.68 + sl / 2 - 0.02);
  if (o.nose) B(head, hw * 0.3, hh * 0.18, 0.05, o.nose, 0, -hh * 0.02, hd * 0.7 + sl, false);
  const jaw = new THREE.Group(); jaw.position.set(0, -hh * 0.36, hd * 0.05); head.add(jaw); R.jaw = jaw;
  const jl = hd * 0.75 + sl;
  B(jaw, hw * 0.7, hh * 0.24, jl, o.belly || o.main, 0, -hh * 0.08, jl / 2);
  B(jaw, hw * 0.56, hh * 0.08, jl * 0.8, 0xc2185b, 0, hh * 0.05, jl / 2, false); // mouth inside
  if (o.teeth) {
    const tg = new THREE.Group(); head.add(tg); R.teeth = tg;
    const n = Math.max(3, Math.round((hd + sl) * 7));
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) B(tg, 0.05, hh * 0.22, 0.05, 0xffffff, s * hw * 0.32, -hh * 0.36, hd * 0.35 + i * (sl + hd * 0.4) / n, false);
  }
  if (o.tusks) for (const s of [-1, 1]) B(head, 0.07, 0.22, 0.07, 0xfffde7, s * hw * 0.33, hh * 0.02, hd * 0.68 + sl * 0.7, false).rotation.x = -0.3;
  // eyes
  const ez = hd * 0.2 + hd / 2 + 0.005, ew = hw * (o.bigEyes ? 0.3 : 0.22);
  for (const s of [-1, 1]) {
    B(head, ew, ew * 1.1, 0.03, o.sclera || 0xffffff, s * hw * 0.28, hh * 0.18, ez, false);
    B(head, ew * 0.55, ew * 0.7, 0.03, 0x111111, s * hw * 0.28 + s * ew * 0.12, hh * 0.15, ez + 0.012, false);
    if (o.brow) B(head, ew * 1.3, 0.05, 0.04, 0x222222, s * hw * 0.28, hh * 0.18 + ew * 0.7, ez + 0.01, false).rotation.z = s * 0.35;
  }
  if (o.ears === 'round') for (const s of [-1, 1]) { B(head, hw * 0.42, hw * 0.42, 0.05, o.main, s * hw * 0.42, hh * 0.62, hd * 0.05); B(head, hw * 0.26, hw * 0.26, 0.02, o.acc, s * hw * 0.42, hh * 0.62, hd * 0.05 + 0.03, false); }
  if (o.ears === 'pointy') for (const s of [-1, 1]) B(head, hw * 0.24, hh * 0.5, 0.08, o.acc || o.main, s * hw * 0.3, hh * 0.68, 0).rotation.z = -s * 0.25;
  if (o.crown) { const gold = 0xffc61a; B(head, hw * 0.7, hh * 0.25, hd * 0.5, gold, 0, hh * 0.62, hd * 0.1); for (const s of [-1, 0, 1]) B(head, hw * 0.12, hh * 0.32, hw * 0.12, gold, s * hw * 0.26, hh * 0.86, hd * 0.1); B(head, hw * 0.1, hw * 0.1, 0.03, 0xff1744, 0, hh * 0.62, hd * 0.37, false); }
  // legs
  const lx = o.W / 2 - o.legW * 0.4, lz = o.L / 2 - o.legW * 0.9;
  for (const [x, z] of [[-lx, lz], [lx, lz], [-lx, -lz], [lx, -lz]]) {
    const leg = new THREE.Group(); leg.position.set(x, o.legH, z); root.add(leg);
    B(leg, o.legW, o.legH, o.legW * 1.1, o.main, 0, -o.legH / 2, 0);
    B(leg, o.legW * 1.15, o.legH * 0.22, o.legW * 1.5, o.foot || o.acc || o.main, 0, -o.legH * 0.89, o.legW * 0.2, false);
    R.legs.push(leg);
  }
  // tail
  if (o.tailL) {
    const tail = new THREE.Group(); tail.position.set(0, by + o.H * 0.1, -o.L / 2); upper.add(tail); R.tail = tail;
    tail.rotation.x = o.tailUp || 0;
    B(tail, o.tailW, o.tailW, o.tailL * 0.58, o.main, 0, 0, -o.tailL * 0.27);
    const t2 = new THREE.Group(); t2.position.z = -o.tailL * 0.55; tail.add(t2); R.tail2 = t2;
    B(t2, o.tailW * 0.68, o.tailW * 0.68, o.tailL * 0.5, o.tailTip || o.main, 0, 0, -o.tailL * 0.24);
  }
  return R;
}

function animModel(R, dt, moveNorm, t) {
  R.phase += dt * Math.min(moveNorm, 6) * 3.2;
  const amp = Math.min(0.85, moveNorm * 0.35);
  const offs = [0, Math.PI, Math.PI, 0, 0, Math.PI];
  R.legs.forEach((l, i) => { l.rotation.x = Math.sin(R.phase + offs[i]) * amp; });
  R.upper.position.y = R.upperY + Math.abs(Math.sin(R.phase)) * 0.05 * amp;
  if (R.tail) { R.tail.rotation.y = Math.sin(t * 3.5 + R.phase * 0.5) * 0.3 * (0.4 + amp); if (R.tail2) R.tail2.rotation.y = R.tail.rotation.y * 0.8; }
  if (R.biteT > 0) { R.biteT -= dt; R.jawOpen = R.biteT > 0.09 ? 0.95 : 0; }
  if (R.jaw) R.jaw.rotation.x = lerp(R.jaw.rotation.x, R.jawOpen, 1 - Math.exp(-dt * 30));
  if (R.head) R.head.rotation.x = R.biteT > 0 ? -0.15 : Math.sin(R.phase * 2) * 0.04 * amp;
}

// ---------------------------------------------------------------- creature types
const TYPES = {
  bug: { name: 'Beetle', icon: '🐞', mass: 2, gain: 1, pred: false, walk: 1.2, run: 2.6, sense: 6, count: 18,
    zone: [-108, 108, 28, 112], model: { shape: 'bug', main: 0xe53935, dark: 0x1c1c1c } },
  mouse: { name: 'Mouse', icon: '🐭', mass: 5, gain: 2, pred: false, walk: 1.8, run: 6.2, sense: 10, count: 13,
    zone: [-108, 108, 24, 112], model: { L: 0.7, W: 0.46, H: 0.42, legH: 0.14, legW: 0.11, head: [0.42, 0.36, 0.36], snout: 0.12, nose: 0xf06292, main: 0xa1887f, belly: 0xe7dcd6, acc: 0xf48fb1, ears: 'round', tailL: 0.8, tailW: 0.05, tailTip: 0xf48fb1, bigEyes: true } },
  lizard: { name: 'Lizard', icon: '🦎', mass: 12, gain: 4, pred: true, walk: 2.2, run: 7, flee: 7.5, sense: 12, count: 9, chaseTime: 5,
    zone: [-100, 100, -2, 50], model: { L: 0.95, W: 0.44, H: 0.28, legH: 0.16, legW: 0.12, head: [0.36, 0.26, 0.38], snout: 0.22, main: 0xffa31a, belly: 0xffe0a8, acc: 0x7b3fb5, stripes: true, tailL: 1.0, tailW: 0.18, sclera: 0xfff176, brow: true } },
  boar: { name: 'Boar', icon: '🐗', mass: 25, gain: 8, pred: true, walk: 2, run: 8.8, flee: 8.5, sense: 11, count: 8, chaseTime: 5,
    zone: [-105, 105, -34, 16], model: { L: 1.0, W: 0.68, H: 0.62, legH: 0.24, legW: 0.17, head: [0.52, 0.48, 0.42], snout: 0.2, snoutCol: 0xf3a6b8, nose: 0x8d4b5c, main: 0x8d6e63, belly: 0x6d4c41, mane: 0x3e2723, tusks: true, ears: 'pointy', acc: 0x5d4037, tailL: 0.25, tailW: 0.06, brow: true } },
  wolf: { name: 'Wolf', icon: '🐺', mass: 45, gain: 15, pred: true, walk: 2.6, run: 11.2, flee: 12, sense: 22, count: 6, chaseTime: 8,
    zone: [-105, 105, -64, -6], model: { L: 1.0, W: 0.44, H: 0.44, legH: 0.52, legW: 0.13, head: [0.4, 0.38, 0.4], snout: 0.28, nose: 0x111111, main: 0x7b8a99, belly: 0xd5dde3, acc: 0x37474f, ears: 'pointy', tailL: 0.62, tailW: 0.17, tailUp: 0.45, tailTip: 0xd5dde3, sclera: 0xffe234, brow: true, teeth: true } },
  alpha: { name: 'THE ALPHA', icon: '🐊', mass: 100, gain: 40, pred: true, walk: 2, run: 10, flee: 0, sense: 26, count: 1, chaseTime: 10, alpha: true, hpMul: 1.6,
    zone: [CAVE.x - 25, CAVE.x + 25, CAVE.z + 4, CAVE.z + 30], model: { L: 1.55, W: 0.62, H: 0.36, legH: 0.18, legW: 0.19, head: [0.52, 0.32, 0.5], snout: 0.75, main: 0x2e7d32, belly: 0xc5e1a5, acc: 0x174d1a, spikes: true, teeth: true, crown: true, tailL: 1.45, tailW: 0.3, sclera: 0xff2a3d, brow: true } },
};
const TYPE_KEYS = Object.keys(TYPES);
const PLAYER_MODEL = { L: 0.74, W: 0.62, H: 0.52, legH: 0.26, legW: 0.2, head: [0.62, 0.5, 0.5], snout: 0.2, main: 0x4fd368, belly: 0xfff1a8, acc: 0xff8a3d, spikes: true, tailL: 0.75, tailW: 0.26, bigEyes: true, foot: 0x2f9a45 };

// ---------------------------------------------------------------- state
let state = 'start', time = 0, gameTime = 0, hitstop = 0, trauma = 0;
let player, creatures = [], flags, stats;
const keys = {};
const cam = { yaw: 0, pitch: 0.32, dist: 5, zoom: 1, target: new THREE.Vector3() };

const statusOf = m => { const r = m / player.mass; return r <= 0.9 ? 'prey' : r < 1.3 ? 'risky' : 'danger'; };
const STATUS_TXT = { prey: '🟢 PREY', risky: '🟡 RISKY', danger: '🔴 DANGER' };
const RANKS = [[0, 'Hatchling'], [8, 'Tiny Critter'], [15, 'Small Hunter'], [30, 'Medium Predator'], [60, 'Large Beast'], [100, 'Dominant Monster']];
const rankOf = m => RANKS.filter(r => m >= r[0]).pop()[1];

// ---------------------------------------------------------------- particles & popups
const PMAX = 600, parts = [];
const pMesh = new THREE.InstancedMesh(BOX, new THREE.MeshLambertMaterial(), PMAX);
pMesh.frustumCulled = false; pMesh.count = 0; scene.add(pMesh);
function burst(p, colors, n, spd = 4, sz = 0.15) {
  for (let i = 0; i < n && parts.length < PMAX; i++) {
    const a = rand(0, 6.28), up = rand(0.4, 1.2);
    parts.push({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * spd * rand(0.3, 1), vy: up * spd, vz: Math.sin(a) * spd * rand(0.3, 1), life: rand(0.5, 0.9), max: 0.9, s: sz * rand(0.6, 1.3), c: Array.isArray(colors) ? pick(colors) : colors, r: rand(0, 3) });
  }
}
function updateParticles(dt) {
  let n = 0;
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i]; q.life -= dt;
    if (q.life <= 0) { parts.splice(i, 1); continue; }
    q.vy -= 18 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.r += dt * 6;
    const g = heightAt(q.x, q.z); if (q.y < g) { q.y = g; q.vy *= -0.3; q.vx *= 0.6; q.vz *= 0.6; }
    const s = q.s * Math.min(1, q.life / q.max * 2);
    dummy.position.set(q.x, q.y, q.z); dummy.rotation.set(q.r, q.r * 0.7, 0); dummy.scale.set(s, s, s); dummy.updateMatrix();
    pMesh.setMatrixAt(n, dummy.matrix); pMesh.setColorAt(n, tmpC.setHex(q.c)); n++;
  }
  pMesh.count = n; pMesh.instanceMatrix.needsUpdate = true; if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
}
const pops = [];
function popup(text, wpos, cls, dur = 1.1) {
  const el = document.createElement('div'); el.className = 'pop stroke ' + cls; el.textContent = text; $('fx').appendChild(el);
  pops.push({ el, p: wpos.clone(), t: 0, dur, dx: rand(-20, 20) });
}
function project(p, out) {
  V.copy(p).project(camera);
  out.x = (V.x * 0.5 + 0.5) * innerWidth; out.y = (-V.y * 0.5 + 0.5) * innerHeight; out.vis = V.z < 1 && V.z > -1;
  return out;
}
const scr = {};
function updatePops(dt) {
  for (let i = pops.length - 1; i >= 0; i--) {
    const q = pops[i]; q.t += dt; q.p.y += dt * (0.8 + player.size * 0.6);
    if (q.t > q.dur) { q.el.remove(); pops.splice(i, 1); continue; }
    project(q.p, scr);
    const k = q.t / q.dur, sc = k < 0.15 ? 0.5 + k / 0.15 * 0.8 : 1.3 - Math.min(0.3, (k - 0.15) * 1.5);
    q.el.style.opacity = scr.vis ? (k > 0.7 ? (1 - k) / 0.3 : 1) : 0;
    q.el.style.transform = `translate(${scr.x + q.dx * k}px,${scr.y}px) translate(-50%,-50%) scale(${sc})`;
  }
}

// ---------------------------------------------------------------- audio (tiny WebAudio synth)
let AC = null, master = null, noiseBuf = null;
function initAudio() {
  if (AC) { AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.5; master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { AC = null; }
}
function osc(type, f0, f1, dur, vol, delay = 0) {
  if (!AC) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function nz(dur, vol, f0, f1, ftype = 'lowpass', delay = 0) {
  if (!AC) return;
  const t = AC.currentTime + delay, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; f.type = ftype; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
const sfx = {
  bite(s) { const k = 1 / (0.6 + s * 0.25); nz(0.07, 0.3, 5000 * k, 900, 'bandpass'); osc('square', 280 * k, 90 * k, 0.08, 0.1); },
  hit(s) { const k = 1 / (0.7 + s * 0.2); osc('triangle', 200 * k, 55, 0.14, 0.4); nz(0.09, 0.3, 2200, 400); },
  kill() { osc('square', 320, 70, 0.18, 0.12); nz(0.16, 0.3, 3000, 300); },
  eat() { osc('sine', 440, 90, 0.18, 0.4); nz(0.1, 0.3, 3200, 900, 'bandpass', 0.05); osc('sine', 320, 70, 0.15, 0.3, 0.13); [660, 880, 1320].forEach((f, i) => osc('triangle', f, f, 0.12, 0.08, 0.2 + i * 0.06)); },
  grow() { [523, 659, 784, 1046, 1318].forEach((f, i) => osc('square', f, f, 0.16, 0.06, i * 0.08)); osc('sine', 110, 220, 0.6, 0.2); },
  danger() { [880, 620, 880, 620].forEach((f, i) => osc('square', f, f, 0.12, 0.08, i * 0.14)); },
  growl(v = 1, low = 1) { osc('sawtooth', 95 * low, 45 * low, 0.9, 0.22 * v); osc('sawtooth', 66 * low, 38 * low, 0.95, 0.18 * v, 0.04); nz(0.9, 0.25 * v, 600, 120); },
  step(s) { const f = 150 / (0.5 + s * 0.35); osc('sine', f, f * 0.5, 0.11, Math.min(0.4, 0.035 + s * 0.06)); if (s > 1.8) nz(0.14, Math.min(0.3, (s - 1.8) * 0.07), 380, 60); },
  hurt() { osc('sawtooth', 320, 110, 0.25, 0.2); nz(0.2, 0.25, 1500, 300); },
  jump(s) { const k = 1 / (0.6 + s * 0.3); osc('sine', 300 * k, 650 * k, 0.13, 0.08); },
  land(s) { nz(0.25, Math.min(0.45, s * 0.08), 420, 50); osc('sine', 90, 40, 0.2, Math.min(0.4, s * 0.06)); },
  whoosh() { nz(0.12, 0.1, 1500, 400, 'bandpass'); },
  evolve() { [392, 523, 659, 784, 1046, 1318].forEach((f, i) => osc('square', f, f, 0.28, 0.07, i * 0.09)); osc('sine', 130, 520, 0.9, 0.2); },
  die() { osc('sawtooth', 420, 55, 1.1, 0.22); nz(0.7, 0.3, 1400, 100); },
  win() { [523, 659, 784, 1046, 784, 1046, 1318, 1568].forEach((f, i) => osc('square', f, f, 0.3, 0.08, i * 0.13)); },
  flip() { [784, 988, 1175, 1568].forEach((f, i) => osc('triangle', f, f, 0.18, 0.09, i * 0.07)); },
};

// ---------------------------------------------------------------- UI helpers
const bannerQ = []; let bannerT = 0;
function banner(html, cls = '', dur = 2.6, urgent = false) {
  const b = { html, cls, dur };
  if (urgent) { bannerQ.unshift(b); bannerT = 0; } else bannerQ.push(b);
}
function updateBanner(dt) {
  const el = $('banner');
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) el.className = 'stroke'; return; }
  if (!bannerQ.length) return;
  const b = bannerQ.shift(); el.innerHTML = b.html; el.className = 'stroke'; void el.offsetWidth; el.className = 'stroke show ' + b.cls; bannerT = b.dur;
}
let toastTO = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastTO); toastTO = setTimeout(() => el.classList.remove('show'), 2600); }
function shake(v) { trauma = Math.min(1, trauma + v); }

function buildChain() {
  $('chainRows').innerHTML = TYPE_KEYS.map(k => `<div class="crow" id="cr-${k}"><span class="ic">${TYPES[k].icon}</span><span class="nm stroke">${TYPES[k].name}</span><span class="ms">${TYPES[k].mass}</span><span class="st"></span></div>`).join('');
}
function updateChain() {
  for (const k of TYPE_KEYS) {
    const T = TYPES[k], st = statusOf(T.mass), row = $('cr-' + k);
    row.classList.remove('prey', 'risky', 'danger'); row.classList.add(st);
    if (st === 'danger') flags.wasDanger[k] = true;
    if (st === 'prey' && flags.wasDanger[k] && !flags.reversed[k] && state === 'play') {
      flags.reversed[k] = true;
      row.classList.remove('flip'); void row.offsetWidth; row.classList.add('flip');
      const extra = k === 'wolf' ? (flags.scoutSeen ? 'Remember the wolf that chased you? Go get it.' : 'The hunted becomes the hunter.')
        : k === 'alpha' ? 'Go claim the den.' : 'The hunted becomes the hunter.';
      banner(`${T.icon} ${T.alpha ? 'THE ALPHA IS' : T.name.toUpperCase() + 'S ARE'} NOW 🟢 PREY!<small>${extra}</small>`, 'prey', 3.4);
      setTimeout(sfx.flip, 150);
    }
  }
}
function goalInfo() {
  const m = player.mass;
  if (!player.evo) return ['🧬 Reach 30 MASS to EVOLVE', m / 30];
  if (m < 50) return ['🐺 Reach 50 MASS — wolves become prey', (m - 30) / 20];
  if (!flags.alphaDead && m < 80) return ['👑 Grow to 80+ to challenge THE ALPHA', (m - 50) / 30];
  return ['👑 Hunt THE ALPHA — rocky den, far north', 1];
}
function updateHUD() {
  const p = player;
  $('massVal').textContent = Math.floor(p.mass);
  $('rank').textContent = rankOf(p.mass) + ' · ×' + (p.size / sizeFor(4)).toFixed(1) + ' size';
  const hp = Math.max(0, p.hp);
  $('hpBar').style.width = (hp / p.maxHp * 100).toFixed(1) + '%';
  $('hpTxt').textContent = Math.ceil(hp) + ' / ' + Math.ceil(p.maxHp);
  const [g, f] = goalInfo(); $('goalTxt').textContent = g; $('goalBar').style.width = (clamp(f, 0, 1) * 100) + '%';
  $('evoBadge').textContent = p.evo ? { predator: '🦷 PREDATOR  +30% bite', runner: '🦵 RUNNER  +20% speed', tank: '🛡️ TANK  +40% health' }[p.evo] : '';
}

// ---------------------------------------------------------------- player
function newPlayer() {
  const R = buildModel(PLAYER_MODEL);
  scene.add(R.root);
  const p = { R, mass: 4, size: sizeFor(4), visSize: sizeFor(4) * 0.2, sizeVel: 0, pos: new THREE.Vector3(START.x, heightAt(START.x, START.z), START.z), vel: new THREE.Vector3(), vy: 0, yaw: Math.PI, onGround: true,
    hp: 0, maxHp: 0, alive: true, evo: null, biteCd: 0, faceT: 0, faceYaw: 0, stepDist: 0, lastHurt: 10, zone: 0, deathT: 0, key: 'player' };
  p.maxHp = p.hp = calcMaxHp(p);
  return p;
}
function calcMaxHp(p) { return (p.mass * 10 + 20) * (p.evo === 'tank' ? 1.4 : 1); }
function refreshStats() {
  const p = player, old = p.maxHp;
  p.size = sizeFor(p.mass) * (p.evo === 'tank' ? 1.06 : 1);
  p.maxHp = calcMaxHp(p);
  p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - old));
}

function applyEvo(k) {
  const R = player.R, o = PLAYER_MODEL, B = R.B;
  if (k === 'predator') {
    R.head.scale.setScalar(1.35); R.jaw.scale.set(1.15, 1.6, 1.25);
    const tg = new THREE.Group(); R.head.add(tg);
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) {
      B(tg, 0.06, 0.14, 0.06, 0xffffff, s * 0.2, -0.24, 0.32 + i * 0.09, false);
      B(R.jaw, 0.06, 0.12, 0.06, 0xffffff, s * 0.17, 0.06, 0.12 + i * 0.1, false);
    }
    for (const s of [-1, 1]) B(R.head, 0.04, 0.06, 0.32, 0xd32f2f, s * 0.315, 0.12, 0.1, false); // war paint
    R.spikes.forEach(sp => sp.material = R.M(0xd32f2f));
  } else if (k === 'runner') {
    R.legs.forEach(l => { l.scale.y = 1.8; l.position.y = o.legH * 1.8; });
    R.upperY = o.legH * 0.8;
    R.body.scale.set(0.9, 0.95, 1.1);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) B(R.body, 0.02, 0.12, 0.18, 0xffe234, s * o.W * 0.51, 0.02, 0.25 - i * 0.24, false).rotation.x = 0.5;
    if (R.tail) R.tail.scale.set(0.8, 0.8, 1.5);
  } else if (k === 'tank') {
    R.body.scale.set(1.15, 1.05, 1.05);
    R.spikes.forEach(sp => sp.visible = false);
    B(R.body, o.W * 1.1, o.H * 0.38, o.L * 1.1, 0x795548, 0, o.H * 0.58, 0);
    for (let i = 0; i < 3; i++) B(R.body, o.W * 1.12, o.H * 0.05, o.L * 0.04, 0x4e342e, 0, o.H * 0.7, -o.L * 0.3 + i * o.L * 0.3, false);
    const cone = new THREE.ConeGeometry(0.07, 0.26, 5);
    const spike = (par, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(cone, R.M(0xf5f5f5)); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = true; par.add(m); };
    for (let i = 0; i < 4; i++) for (const s of [-1, 0, 1]) spike(R.body, s * o.W * 0.32, o.H * 0.85 - Math.abs(s) * 0.04, -o.L * 0.36 + i * o.L * 0.24, 0, -s * 0.5);
    for (const s of [-1, 1]) spike(R.body, s * o.W * 0.62, o.H * 0.45, 0, 0, -s * 1.3);
    if (R.tail2) { spike(R.tail2, 0, 0.12, -0.3); spike(R.tail2, 0.1, 0, -0.35, 0, -1.3); spike(R.tail2, -0.1, 0, -0.35, 0, 1.3); }
    R.head.scale.setScalar(1.08);
  }
}

function playerBite() {
  const p = player;
  if (state !== 'play' || !p.alive || p.biteCd > 0) return;
  p.biteCd = 0.4; p.R.biteT = 0.2; sfx.bite(p.size);
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  let best = null, bs = 1e9;
  for (const c of creatures) {
    const d = dist2(p.pos, c.pos), reach = 0.7 + p.size * 1.05 + c.size * 0.6;
    if (d > reach * 1.7) continue;
    const dx = (c.pos.x - p.pos.x) / (d || 1), dz = (c.pos.z - p.pos.z) / (d || 1), ang = Math.acos(clamp(dx * fx + dz * fz, -1, 1));
    if (ang > 1.25 && d > reach * 0.55) continue;
    const s = d / reach + ang * 0.8 - (c.downed ? 0.5 : 0);
    if (s < bs) { bs = s; best = c; }
  }
  let ldx = fx, ldz = fz;
  if (best) { const d = dist2(p.pos, best.pos) || 1; ldx = (best.pos.x - p.pos.x) / d; ldz = (best.pos.z - p.pos.z) / d; }
  p.faceYaw = Math.atan2(ldx, ldz); p.faceT = 0.3;
  const lunge = 5 + p.size * 3.5; p.vel.x += ldx * lunge; p.vel.z += ldz * lunge;
  if (best && dist2(p.pos, best.pos) <= (0.7 + p.size * 1.05 + best.size * 0.6) * 1.35) playerHit(best, ldx, ldz);
  else sfx.whoosh();
}
function playerHit(c, dx, dz) {
  const p = player;
  if (c.downed) { eatCreature(c); return; }
  const dmg = dmgCalc(p.mass, c.mass, 3.5) * (p.evo === 'predator' ? 1.3 : 1);
  c.hp -= dmg; c.flash = 1; c.provokedT = 6; c.thinkT = 0;
  const kb = clamp(p.mass / c.mass, 0.2, 3) * 0.6; c.pos.x += dx * kb; c.pos.z += dz * kb; c.hop = 0.25;
  V.copy(c.pos); V.y += c.size * 1.1;
  popup('-' + Math.round(dmg), V, 'dmg' + (dmg > c.maxHp * 0.5 ? ' big' : ''), 0.8);
  burst(V, [0xffffff, 0xffe066, c.T.model.main], 7, 3 + p.size, 0.06 + p.size * 0.05);
  sfx.hit(p.size); shake(0.12 + Math.min(0.2, c.size * 0.03)); hitstop = 0.06;
  if (c.hp <= 0) killCreature(c);
}
function killCreature(c) {
  c.downed = true; c.downT = 0; c.state = 'down'; c.hp = 0; sfx.kill();
  V.copy(c.pos); V.y += c.size * 0.5; burst(V, [c.T.model.main, 0xffffff], 12, 4, 0.08 + c.size * 0.06);
  if (c.mass < player.mass * 0.35) setTimeout(() => { if (!c.dead) eatCreature(c); }, 90); // tiny snacks: instant gulp
}
function eatCreature(c) {
  if (c.dead) return;
  const p = player, gain = c.T.gain;
  removeCreature(c);
  V.copy(c.pos); V.y += c.size * 0.6;
  burst(V, [c.T.model.main, 0xd32f2f, 0xff8a80, 0xffffff], 18 + Math.round(c.size * 6), 4 + c.size, 0.08 + c.size * 0.07);
  sfx.eat(); hitstop = 0.05;
  const old = p.mass; p.mass += gain; stats.eaten++;
  refreshStats(); p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3);
  p.sizeVel += p.size * (1.6 + Math.min(3, gain * 0.2));
  V.copy(p.pos); V.y += p.visSize * 1.5;
  popup('+' + gain + ' MASS', V, 'mass', 1.3);
  const mv = $('massVal'); mv.classList.remove('bump'); void mv.offsetWidth; mv.classList.add('bump');
  shake(0.1 + gain * 0.01);
  for (const [th, name] of RANKS) if (old < th && p.mass >= th && th >= 15 && th !== 30) {
    banner(`🔼 SIZE UP!<small>You are now a ${name.toUpperCase()}</small>`, 'gold', 2.4); sfx.grow(); p.sizeVel += p.size * 3;
  }
  updateChain(); updateHUD();
  if (c.T.alpha) { flags.alphaDead = true; setTimeout(win, 900); return; }
  if (!p.evo && p.mass >= 30) setTimeout(openEvolve, 650);
}
function hurtPlayer(dmg, by) {
  const p = player; if (!p.alive || state !== 'play') return;
  p.hp -= dmg; p.lastHurt = 0;
  V.copy(p.pos); V.y += p.visSize * 1.3; popup('-' + Math.round(dmg), V, 'hurt', 0.8);
  burst(V, [0xff5252, 0xffffff], 8, 4, 0.05 + p.size * 0.05);
  sfx.hurt(); shake(0.35); $('dmgVig').style.transition = 'none'; $('dmgVig').style.opacity = 0.9;
  requestAnimationFrame(() => { $('dmgVig').style.transition = 'opacity .6s'; $('dmgVig').style.opacity = 0; });
  const dx = p.pos.x - by.pos.x, dz = p.pos.z - by.pos.z, d = Math.hypot(dx, dz) || 1, kb = clamp(by.mass / p.mass, 0.3, 4) * 3;
  p.vel.x += dx / d * kb; p.vel.z += dz / d * kb; p.vy = Math.max(p.vy, 3); p.onGround = false;
  if (p.hp <= 0) die(by);
  updateHUD();
}

function updatePlayer(dt) {
  const p = player, R = p.R;
  if (!p.alive) { // death: shrink & spin
    p.deathT += dt; R.root.scale.setScalar(Math.max(0.001, p.visSize * (1 - p.deathT * 3))); R.root.rotation.y += dt * 12; return;
  }
  p.biteCd -= dt; p.faceT -= dt; p.lastHurt += dt;
  const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const r = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
  let dx = -sy * f + cy * r, dz = -cy * f - sy * r; const dl = Math.hypot(dx, dz); if (dl > 0) { dx /= dl; dz /= dl; }
  const sprint = keys.ShiftLeft || keys.ShiftRight;
  const sp = Math.min(16, 4.5 + p.size * 2.2) * (p.evo === 'runner' ? 1.2 : 1) * (sprint ? 1.6 : 1);
  const accel = 12 / (1 + p.size * 0.18), k = 1 - Math.exp(-accel * dt * (p.onGround ? 1 : 0.35));
  p.vel.x = lerp(p.vel.x, dx * sp, k); p.vel.z = lerp(p.vel.z, dz * sp, k);
  p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt;
  p.pos.x = clamp(p.pos.x, -WORLD, WORLD); p.pos.z = clamp(p.pos.z, -WORLD, WORLD);
  collide(p.pos, p.size * 0.32, p.size * 0.22);
  // creature bumping (lighter one gets pushed)
  for (const c of creatures) {
    if (c.downed) continue;
    const ddx = c.pos.x - p.pos.x, ddz = c.pos.z - p.pos.z, d = Math.hypot(ddx, ddz), m = (p.size + c.size) * 0.33;
    if (d < m && d > 1e-3) { const push = (m - d), w = p.mass / (p.mass + c.mass); c.pos.x += ddx / d * push * w; c.pos.z += ddz / d * push * w; p.pos.x -= ddx / d * push * (1 - w); p.pos.z -= ddz / d * push * (1 - w); }
  }
  // vertical
  const g = heightAt(p.pos.x, p.pos.z), grav = 24;
  if ((keys.Space) && p.onGround) { p.vy = 6.5 + p.size * 1.3; p.onGround = false; sfx.jump(p.size); }
  p.vy -= grav * dt; p.pos.y += p.vy * dt;
  if (p.pos.y <= g || (p.onGround && p.pos.y - g < 0.4 + p.size * 0.3 && p.vy <= 0)) {
    if (!p.onGround && p.vy < -7) { sfx.land(p.size); if (p.size > 1.5) shake(Math.min(0.5, p.size * 0.07)); p.sizeVel -= p.size * 1.2; burst(p.pos, [0xb59a6a, 0x8ad85a], Math.round(4 + p.size * 3), 2 + p.size, 0.05 + p.size * 0.04); }
    p.pos.y = g; p.vy = 0; p.onGround = true;
  } else p.onGround = false;
  // facing
  const hs = Math.hypot(p.vel.x, p.vel.z);
  let want = p.yaw;
  if (p.faceT > 0) want = p.faceYaw; else if (hs > 0.6 && dl > 0) want = Math.atan2(p.vel.x, p.vel.z);
  p.yaw += angDiff(p.yaw, want) * (1 - Math.exp(-dt * (p.faceT > 0 ? 25 : 12 / (1 + p.size * 0.12))));
  // footsteps
  if (p.onGround) {
    p.stepDist += hs * dt;
    if (p.stepDist > 0.5 + p.size * 0.9) { p.stepDist = 0; sfx.step(p.size); if (p.size > 2) shake(Math.min(0.12, (p.size - 2) * 0.03)); if (p.size > 2.4 && Math.random() < 0.5) burst(p.pos, [0xb59a6a], 3, 2, 0.06 * p.size); }
  }
  // regen
  if (p.lastHurt > 3.5) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.05 * dt);
  // size spring (juicy overshoot)
  p.sizeVel += ((p.size - p.visSize) * 80 - p.sizeVel * 9) * dt;
  p.visSize += p.sizeVel * dt;
  R.root.position.copy(p.pos); R.root.rotation.y = p.yaw; R.root.scale.setScalar(Math.max(0.05, p.visSize));
  animModel(R, dt, hs / p.size, time);
  // zone changes
  const zn = zoneOf(p.pos.x, p.pos.z);
  if (zn !== p.zone) { p.zone = zn; toast(ZONE_NAMES[zn]); }
}

// ---------------------------------------------------------------- creatures
function randomZonePoint(T, minDist) {
  const [x0, x1, z0, z1] = T.zone;
  for (let i = 0; i < 25; i++) {
    const x = rand(x0, x1), z = rand(z0, z1);
    if (player && Math.hypot(x - player.pos.x, z - player.pos.z) < minDist) continue;
    if (!freeSpot(x, z, 1)) continue;
    return [x, z];
  }
  return null;
}
function spawnCreature(key, x, z) {
  const T = TYPES[key], R = buildModel(T.model), size = sizeFor(T.mass);
  const maxHp = T.mass * 10 * (T.hpMul || 1);
  const c = { key, T, R, mass: T.mass, size, hp: maxHp, maxHp, pos: new THREE.Vector3(x, heightAt(x, z), z), yaw: rand(0, 6.3), speed: 0, state: 'wander',
    tx: x, tz: z, idle: rand(0, 2), thinkT: rand(0, 0.3), atkCd: 0, chaseT: 0, boredT: 0, fullT: rand(0, 20), flash: 0, provokedT: 0, target: null,
    home: { x, z }, dead: false, downed: false, downT: 0, plate: null, plateKey: '', seed: rand(0, 100), scoutT: 0, hop: 0 };
  if (T.alpha) c.home = { x: CAVE.x, z: CAVE.z + 14 };
  R.root.scale.setScalar(size); R.root.position.copy(c.pos); scene.add(R.root);
  creatures.push(c); return c;
}
function removeCreature(c) {
  c.dead = true; scene.remove(c.R.root); c.R.mats.forEach(m => m.dispose());
  if (c.plate) c.plate.remove();
  const i = creatures.indexOf(c); if (i >= 0) creatures.splice(i, 1);
}
function pickWander(c) {
  const [x0, x1, z0, z1] = c.T.zone;
  c.tx = clamp(c.pos.x + rand(-22, 22), x0, x1); c.tz = clamp(c.pos.z + rand(-22, 22), z0, z1);
}
const valid = t => t && (t === player ? player.alive : !t.dead && !t.downed);

function think(c) {
  const T = c.T, p = player;
  if (c.scoutT > 0) { setChase(c, p); return; }
  if (c.state === 'return') return;
  if (T.alpha && Math.hypot(c.pos.x - c.home.x, c.pos.z - c.home.z) > 42) { c.state = 'return'; c.target = null; return; }
  let threat = null, td = 1e9, prey = null, pd = 1e9;
  if (p.alive && state !== 'start') {
    const d = dist2(c.pos, p.pos);
    if (!T.alpha && p.mass > c.mass * 1.15 && d < T.sense * (T.pred ? 0.85 : 1) * (0.8 + p.size * 0.1)) { threat = p; td = d; }
    else if (T.pred && c.boredT <= 0 && d < T.sense * (c.provokedT > 0 ? 1.6 : 1) && (p.mass < c.mass * 0.8 || (c.provokedT > 0 && p.mass < c.mass * 1.25))) { prey = p; pd = d; }
  }
  for (const o of creatures) {
    if (o === c || o.downed) continue;
    const d = dist2(c.pos, o.pos); if (d > T.sense) continue;
    if (!T.alpha && o.T.pred && o.mass > c.mass * 1.3 && d < td && d < T.sense * 0.7) { threat = o; td = d; }
    else if (prey !== p && T.pred && c.fullT <= 0 && c.boredT <= 0 && o.mass < c.mass * 0.7 && d < pd) { prey = o; pd = d; }
  }
  if (threat) { c.state = 'flee'; c.target = threat; }
  else if (prey) setChase(c, prey);
  else if (c.state === 'chase' || c.state === 'flee') { c.state = 'wander'; c.target = null; pickWander(c); }
}
let dangerMsgT = 0;
function setChase(c, t) {
  if (c.state === 'chase' && c.target === t) return;
  c.state = 'chase'; c.target = t; c.chaseT = 0;
  if (t === player && state === 'play') {
    const big = c.mass > player.mass * 1.8;
    sfx.growl(big ? 1 : 0.5, c.T.alpha ? 0.7 : 1);
    if (big) shake(0.25);
    if (statusOf(c.mass) === 'danger' && dangerMsgT <= 0) {
      dangerMsgT = 7; sfx.danger();
      banner(`⚠ DANGER! ${c.T.icon} ${c.T.alpha ? 'THE ALPHA' : 'A ' + c.T.name.toUpperCase()} IS HUNTING YOU<small>Mass ${c.mass} — RUN! (hold SHIFT)</small>`, 'danger', 2.6, true);
    }
  }
}
function creatureBite(c, t) {
  c.atkCd = c.T.alpha ? 1.25 : 1.0; c.R.biteT = 0.22; c.lunge = 0.15;
  const dmg = dmgCalc(c.mass, t.mass, 1.8);
  if (t === player) { hurtPlayer(dmg, c); return; }
  t.hp -= dmg; t.flash = 1; t.provokedT = 4;
  V.copy(t.pos); V.y += t.size * 0.6; burst(V, [0xffffff, t.T.model.main], 5, 3, 0.05 + t.size * 0.04);
  if (t.hp <= 0) {
    burst(V, [t.T.model.main, 0xd32f2f], 14, 4, 0.08 + t.size * 0.05);
    removeCreature(t); c.fullT = 25; c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.3); c.state = 'wander'; c.target = null;
  }
}

function updateCreature(c, dt) {
  const T = c.T, R = c.R, p = player;
  c.flash = Math.max(0, c.flash - dt * 5);
  if (c.flash > 0 || c.lastFlash > 0) { R.mats.forEach(m => m.emissive.setScalar(c.flash * 0.9)); c.lastFlash = c.flash; }
  if (c.downed) {
    c.downT += dt;
    R.root.rotation.z = lerp(R.root.rotation.z, Math.PI / 2, 1 - Math.exp(-dt * 14));
    R.root.position.y = c.pos.y + c.size * 0.2 + Math.max(0, Math.sin(c.downT * 9)) * 0.06 * c.size * Math.max(0, 1 - c.downT);
    R.legs.forEach((l, i) => l.rotation.x = Math.sin(time * 30 + i) * 0.3 * Math.max(0, 1 - c.downT));
    if (p.alive && c.downT > 0.3 && dist2(c.pos, p.pos) < (0.7 + p.size * 1.05 + c.size * 0.6) * 1.4) eatCreature(c);
    else if (c.downT > 14) removeCreature(c);
    return;
  }
  c.atkCd -= dt; c.boredT -= dt; c.fullT -= dt; c.provokedT -= dt; c.scoutT -= dt; c.thinkT -= dt;
  if (c.thinkT <= 0) { c.thinkT = 0.22 + Math.random() * 0.12; think(c); }
  let desired = null, spd = 0;
  const t = c.target;
  if (c.state === 'flee') {
    if (!valid(t)) { c.state = 'wander'; pickWander(c); }
    else { desired = Math.atan2(c.pos.x - t.pos.x, c.pos.z - t.pos.z) + Math.sin(time * 2.3 + c.seed) * 0.6; spd = T.flee || T.run; }
  } else if (c.state === 'chase') {
    if (!valid(t)) { c.state = 'wander'; c.target = null; pickWander(c); }
    else {
      c.chaseT += dt;
      const limit = c.scout ? 9 : T.chaseTime || 6;
      if (c.chaseT > limit && c.scoutT <= 0) {
        c.boredT = 6; c.target = null;
        if (c.scout) { c.scout = false; c.state = 'return'; c.home = { x: rand(-40, 40), z: -35 }; if (t === p && p.alive) { banner('😮‍💨 PHEW... YOU ESCAPED<small>Grow bigger. Come back for revenge.</small>', 'info', 3); } }
        else { c.state = 'wander'; pickWander(c); }
      } else {
        const d = dist2(c.pos, t.pos);
        desired = Math.atan2(t.pos.x - c.pos.x, t.pos.z - c.pos.z);
        spd = c.scout ? 8.4 : T.run;
        const reach = c.size * 0.75 + t.size * 0.45 + 0.3;
        if (d < reach) { spd *= 0.3; if (c.atkCd <= 0) creatureBite(c, t); }
        if (t === p && c.mass > p.mass * 1.8 && d < 25) trauma = Math.max(trauma, 0.14 * (1 - d / 25));
      }
    }
  } else if (c.state === 'return') {
    const dx = c.home.x - c.pos.x, dz = c.home.z - c.pos.z;
    if (dx * dx + dz * dz < 36) { c.state = 'wander'; pickWander(c); } else { desired = Math.atan2(dx, dz); spd = T.walk * 2.2; }
  } else { // wander
    if (c.idle > 0) c.idle -= dt;
    else {
      const dx = c.tx - c.pos.x, dz = c.tz - c.pos.z;
      if (dx * dx + dz * dz < 2) { c.idle = rand(0.5, 3.5); pickWander(c); } else { desired = Math.atan2(dx, dz); spd = T.walk; }
    }
  }
  if (desired !== null) { const turn = 7 / (1 + c.size * 0.25); c.yaw += clamp(angDiff(c.yaw, desired), -turn * dt, turn * dt); }
  c.speed = lerp(c.speed, spd, 1 - Math.exp(-dt * 6));
  c.pos.x += Math.sin(c.yaw) * c.speed * dt; c.pos.z += Math.cos(c.yaw) * c.speed * dt;
  if (Math.abs(c.pos.x) > WORLD - 6 || Math.abs(c.pos.z) > WORLD - 6) { c.pos.x = clamp(c.pos.x, -WORLD + 6, WORLD - 6); c.pos.z = clamp(c.pos.z, -WORLD + 6, WORLD - 6); c.yaw += 0.15; if (c.state === 'wander') pickWander(c); }
  collide(c.pos, c.size * 0.35, 0);
  c.hop = Math.max(0, c.hop - dt);
  c.pos.y = heightAt(c.pos.x, c.pos.z);
  R.root.position.copy(c.pos); R.root.position.y += Math.sin(c.hop * 12) * c.hop * c.size * 0.8;
  R.root.rotation.y = c.yaw;
  animModel(R, dt, c.speed / c.size, time + c.seed);
}

function updateSpawns(dt) {
  flags.spawnT -= dt; if (flags.spawnT > 0) return; flags.spawnT = 1.2;
  for (const k of TYPE_KEYS) {
    const T = TYPES[k]; if (T.alpha) continue;
    const n = creatures.filter(c => c.key === k).length;
    if (n < T.count) { const pt = randomZonePoint(T, 38); if (pt) spawnCreature(k, pt[0], pt[1]); }
  }
}
function spawnInitial() {
  for (const k of TYPE_KEYS) {
    const T = TYPES[k];
    if (T.alpha) { spawnCreature(k, CAVE.x, CAVE.z + 14); continue; }
    for (let i = 0; i < T.count; i++) { const pt = randomZonePoint(T, T.pred ? 45 : 14); if (pt) spawnCreature(k, pt[0], pt[1]); }
  }
  // guaranteed first snacks right in front of the player
  for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + rand(-0.9, 0.9), r = rand(6, 13); spawnCreature('bug', START.x + Math.cos(a) * r, START.z + Math.sin(a) * r); }
  for (let i = 0; i < 2; i++) spawnCreature('mouse', START.x + rand(-14, 14), START.z - rand(14, 22));
}

// scripted early danger: a wolf shows up and hunts the tiny player
function updateEvents(dt) {
  dangerMsgT -= dt;
  if (!flags.scoutDone && player.alive && player.mass < 22 && (gameTime > 38 || stats.eaten >= 4)) {
    flags.scoutDone = true;
    let x = player.pos.x - Math.sin(cam.yaw) * 26, z = player.pos.z - Math.cos(cam.yaw) * 26;
    x = clamp(x, -110, 110); z = clamp(z, -110, 110);
    const w = spawnCreature('wolf', x, z);
    w.scout = true; w.scoutT = 9; w.yaw = Math.atan2(player.pos.x - x, player.pos.z - z);
    flags.scoutSeen = true;
    setChase(w, player); shake(0.4); sfx.growl(1.3);
  }
}

// ---------------------------------------------------------------- nameplates & target ring
const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.05, 32), new THREE.MeshBasicMaterial({ color: 0x3ddc5a, transparent: true, opacity: 0.85, depthWrite: false }));
ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring);
const RING_COL = { prey: 0x3ddc5a, risky: 0xffd23d, danger: 0xff4040 };
function updatePlates() {
  const p = player, range = 16 + p.size * 7;
  const vis = [];
  for (const c of creatures) {
    const d = dist2(c.pos, p.pos);
    if (d < range || (c.T.alpha && d < 170)) vis.push([d, c]); else if (c.plate) c.plate.style.display = 'none';
  }
  vis.sort((a, b) => a[0] - b[0]);
  let focus = null, fs = 1e9;
  const cx = innerWidth / 2, cy = innerHeight / 2;
  vis.forEach(([d, c], i) => {
    if (i > 11 && !c.T.alpha) { if (c.plate) c.plate.style.display = 'none'; return; }
    V.copy(c.pos); V.y += c.size * (c.downed ? 0.9 : 1.35) + 0.25;
    project(V, scr);
    if (!scr.vis || state === 'evolve') { if (c.plate) c.plate.style.display = 'none'; return; }
    if (!c.plate) { c.plate = document.createElement('div'); $('plates').appendChild(c.plate); }
    const st = statusOf(c.mass);
    const key = st + (c.downed ? 'd' : '') + Math.ceil(c.hp / c.maxHp * 20);
    if (key !== c.plateKey) {
      c.plateKey = key;
      const nm = c.T.alpha ? '👑 THE ALPHA' : c.T.icon + ' ' + c.T.name.toUpperCase();
      c.plate.innerHTML = c.downed ? `<b class="stroke">${nm}</b><span class="tag">🍖 EAT!</span>`
        : `<b class="stroke">${nm}</b><span class="tag">${STATUS_TXT[st]}</span><span class="m stroke">Mass ${c.mass}</span>${c.hp < c.maxHp ? `<div class="hp"><i style="width:${c.hp / c.maxHp * 100}%"></i></div>` : ''}`;
    }
    c.plate.className = 'plate ' + st + (c.downed ? ' eat' : '') + (c.T.alpha ? ' alpha' : '');
    c.plate.style.display = '';
    const fade = c.T.alpha && d > range ? 0.85 : clamp((range - d) / 4, 0.25, 1);
    c.plate.style.opacity = fade;
    c.plate.style.transform = `translate(${scr.x}px,${scr.y}px) translate(-50%,-100%)`;
    const sd = Math.hypot(scr.x - cx, scr.y - cy);
    if (d < range && sd < innerWidth * 0.2 && sd + d * 8 < fs) { fs = sd + d * 8; focus = c; }
  });
  if (focus && state === 'play') {
    focus.plate.classList.add('focus');
    ring.visible = true; ring.position.set(focus.pos.x, focus.pos.y + 0.08, focus.pos.z);
    ring.scale.setScalar(focus.size * 0.9 * (1 + Math.sin(time * 8) * 0.06)); ring.material.color.setHex(focus.downed ? 0xffd84a : RING_COL[statusOf(focus.mass)]);
  } else ring.visible = false;
}

// ---------------------------------------------------------------- camera
function updateCamera(dt) {
  const p = player, s = p.alive ? p.visSize : p.size;
  cam.dist = lerp(cam.dist, (2.6 + p.size * 3.1) * cam.zoom, 1 - Math.exp(-dt * 3));
  const tgt = V.set(p.pos.x, p.pos.y + s * 1.0 + 0.25, p.pos.z);
  cam.target.lerp(tgt, 1 - Math.exp(-dt * 14));
  const cp = Math.cos(cam.pitch);
  let x = cam.target.x + Math.sin(cam.yaw) * cp * cam.dist, y = cam.target.y + Math.sin(cam.pitch) * cam.dist, z = cam.target.z + Math.cos(cam.yaw) * cp * cam.dist;
  y = Math.max(y, heightAt(x, z) + 0.35);
  trauma = Math.max(0, trauma - dt * 1.6);
  const sh = trauma * trauma * (0.25 + p.size * 0.12);
  const ox = rand(-1, 1) * sh, oy = rand(-1, 1) * sh, oz = rand(-1, 1) * sh;
  camera.position.set(x + ox, y + oy, z + oz);
  camera.lookAt(cam.target.x + ox, cam.target.y + oy, cam.target.z + oz);
  const sprinting = (keys.ShiftLeft || keys.ShiftRight) && Math.hypot(p.vel.x, p.vel.z) > 3 && state === 'play';
  camera.fov = lerp(camera.fov, sprinting ? 74 : 65, 1 - Math.exp(-dt * 5)); camera.updateProjectionMatrix();
  sun.position.set(p.pos.x + 40, p.pos.y + 70, p.pos.z + 25); sun.target.position.copy(p.pos);
}

// ---------------------------------------------------------------- game flow
function resetGame() {
  creatures.slice().forEach(removeCreature);
  parts.length = 0;
  if (player) scene.remove(player.R.root);
  player = newPlayer();
  flags = { scoutDone: false, scoutSeen: false, wasDanger: {}, reversed: {}, alphaDead: false, spawnT: 0 };
  stats = { eaten: 0 };
  gameTime = 0; bannerQ.length = 0; bannerT = 0; $('banner').className = 'stroke';
  cam.yaw = 0; cam.pitch = 0.32; cam.target.copy(player.pos);
  spawnInitial(); buildChain(); updateChain(); updateHUD();
}
function startPlay() {
  initAudio();
  ['start', 'death', 'win', 'paused'].forEach(id => $(id).classList.add('hidden'));
  $('hud').classList.remove('hidden');
  state = 'play'; lock();
  $('help').style.opacity = 1; setTimeout(() => { $('help').style.opacity = 0; }, 16000);
  banner('🐞 You are TINY. Eat beetles to grow!<small>Look for 🟢 PREY — avoid 🔴 DANGER</small>', 'prey', 3.6);
  toast(ZONE_NAMES[0]);
}
function die(by) {
  const p = player; p.alive = false; p.deathT = 0; state = 'dead';
  sfx.die(); shake(0.6);
  V.copy(p.pos); V.y += p.size * 0.5; burst(V, [0x4fd368, 0xd32f2f, 0xffffff], 30, 6, 0.1 + p.size * 0.06);
  if (by.R) by.R.biteT = 0.3;
  $('deathBy').innerHTML = `Eaten by ${by.T.alpha ? '👑 THE ALPHA' : 'a ' + by.T.icon + ' ' + by.T.name.toUpperCase()} (Mass ${by.mass}).<br>You reached <b>Mass ${Math.floor(p.mass)}</b> and ate ${stats.eaten} creature${stats.eaten === 1 ? '' : 's'}.`;
  unlock();
  setTimeout(() => { if (state === 'dead') $('death').classList.remove('hidden'); }, 900);
}
function win() {
  state = 'win'; sfx.win(); unlock();
  const m = Math.floor(gameTime / 60), s = Math.floor(gameTime % 60);
  $('winStats').innerHTML = `Final mass <b>${Math.floor(player.mass)}</b> · ${stats.eaten} creatures eaten · ${m}:${String(s).padStart(2, '0')}${player.evo ? ' · ' + player.evo.toUpperCase() : ''}`;
  $('win').classList.remove('hidden');
}
function openEvolve() {
  if (state !== 'play' || player.evo || !player.alive) return;
  state = 'evolve'; unlock(); sfx.grow();
  $('evolve').classList.remove('hidden');
}
function chooseEvo(k) {
  if (state !== 'evolve') return;
  player.evo = k; applyEvo(k); refreshStats(); player.hp = player.maxHp;
  $('evolve').classList.add('hidden'); state = 'play'; lock();
  sfx.evolve(); shake(0.4); player.sizeVel += player.size * 5;
  V.copy(player.pos); V.y += player.size; burst(V, [0xffd84a, 0x7dff8f, 0xffffff], 40, 7, 0.12 + player.size * 0.05);
  banner({ predator: '🦷 PREDATOR!<small>Bigger jaws. Bites hit 30% harder.</small>', runner: '🦵 RUNNER!<small>Long legs. 20% faster.</small>', tank: '🛡️ TANK!<small>Armored shell. 40% more health.</small>' }[k], 'gold', 2.6);
  updateHUD();
}

// ---------------------------------------------------------------- input
let locked = false, wasLocked = false, dragging = false;
function lock() { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
function unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked && wasLocked && state === 'play') { state = 'paused'; $('paused').classList.remove('hidden'); }
  wasLocked = locked;
});
addEventListener('mousemove', e => {
  if (!(locked || dragging) || (state !== 'play' && state !== 'dead')) return;
  cam.yaw -= e.movementX * 0.0026; cam.pitch = clamp(cam.pitch + e.movementY * 0.0026, -0.25, 1.25);
});
canvas.addEventListener('mousedown', e => {
  if (state !== 'play') return;
  if (!locked) { lock(); dragging = true; }
  if (e.button === 0) playerBite();
});
addEventListener('mouseup', () => { dragging = false; });
addEventListener('wheel', e => { cam.zoom = clamp(cam.zoom + Math.sign(e.deltaY) * 0.1, 0.6, 1.8); }, { passive: true });
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (state === 'play' && e.code === 'KeyE' && !e.repeat) playerBite();
  if (state === 'evolve' && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) chooseEvo(['predator', 'runner', 'tank'][+e.code.slice(-1) - 1]);
  if ((state === 'dead' && !$('death').classList.contains('hidden')) || state === 'win') if (e.code === 'Space' || e.code === 'Enter') { resetGame(); startPlay(); }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
$('playBtn').onclick = () => startPlay();
$('retryBtn').onclick = () => { resetGame(); startPlay(); };
$('againBtn').onclick = () => { resetGame(); startPlay(); };
$('resumeBtn').onclick = () => { $('paused').classList.add('hidden'); state = 'play'; lock(); };
document.querySelectorAll('.card').forEach(el => el.onclick = () => chooseEvo(el.dataset.evo));
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// ---------------------------------------------------------------- main loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (hitstop > 0) { hitstop -= dt; dt *= 0.08; }
  time += dt;
  const live = state === 'play' || state === 'dead' || state === 'win' || state === 'start';
  if (state === 'play') { gameTime += dt; updateEvents(dt); updateSpawns(dt); }
  if (state === 'play' || state === 'dead') updatePlayer(dt);
  if (state === 'start') { cam.yaw += dt * 0.08; player.R.root.position.copy(player.pos); player.visSize = player.size; player.R.root.scale.setScalar(player.size); animModel(player.R, dt, 0, time); }
  if (live) for (let i = creatures.length - 1; i >= 0; i--) if (creatures[i]) updateCreature(creatures[i], dt);
  // danger feedback: something much bigger is hunting us
  const hunted = state === 'play' && creatures.some(c => c.state === 'chase' && c.target === player && statusOf(c.mass) === 'danger' && dist2(c.pos, player.pos) < 30);
  $('runWarn').classList.toggle('on', hunted); $('dangerVig').style.opacity = hunted ? 0.55 + Math.sin(time * 10) * 0.2 : 0;
  if (state === 'play' && Math.floor(time * 4) !== Math.floor((time - dt) * 4)) updateHUD();
  updateBanner(dt); updateParticles(dt); updatePops(dt); updateCamera(dt); updatePlates();
  water.position.y = waterY + Math.sin(time * 1.5) * 0.05;
  clouds.forEach((c, i) => { c.position.x += dt * (1 + i % 3); if (c.position.x > 180) c.position.x = -180; });
  renderer.render(scene, camera);
}
resetGame();
requestAnimationFrame(frame);

// small debug hook for testing: window.GOE.grow(40)
window.GOE = { cam, get player() { return player; }, get creatures() { return creatures; }, get state() { return state; },
  grow(n) { player.mass += n; refreshStats(); updateChain(); updateHUD(); if (!player.evo && player.mass >= 30) openEvolve(); },
  tp(x, z) { player.pos.set(x, heightAt(x, z), z); } };
})();
