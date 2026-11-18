import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ARENA = 25; // half-extent of the square arena
const WALL_H = 4.5;
const EYE = 1.6;
const PLAYER_R = 0.45;
const BOT_R = 0.6;
const CHAR_H = 2.3;
const MAX_HP = 100;
const ROUNDS_TO_WIN = 3;

const PLAYER = {
  speed: 7,
  turnSpeed: 2.6,
  fireInterval: 0.2,
  damage: 20,
  bulletSpeed: 70,
};

const DIFFICULTY = {
  easy:   { reaction: 0.75, fireInterval: 0.85, spread: 0.08,  damage: 7,  lead: 0.2, speed: 4.0, turn: 3.0 },
  normal: { reaction: 0.45, fireInterval: 0.6,  spread: 0.045, damage: 10, lead: 0.6, speed: 5.0, turn: 4.5 },
  hard:   { reaction: 0.25, fireInterval: 0.42, spread: 0.025, damage: 12, lead: 0.9, speed: 5.8, turn: 6.5 },
};
const BOT_BULLET_SPEED = 42;

const COLORS = {
  cyan: new THREE.Color(0x2de2ff),
  magenta: new THREE.Color(0xff2a6d),
  violet: new THREE.Color(0x8b5cff),
  orange: new THREE.Color(0xff8a3d),
};

// x, z, width (x), depth (z), height
const OBSTACLE_LAYOUT = [
  [0, 0, 4, 4, 3.2],
  [-10, -8, 6, 1.2, 2.6], [10, 8, 6, 1.2, 2.6],
  [-8, 10, 1.2, 6, 2.6], [8, -10, 1.2, 6, 2.6],
  [-16, -16, 1.8, 1.8, WALL_H], [16, 16, 1.8, 1.8, WALL_H],
  [-16, 16, 1.8, 1.8, WALL_H], [16, -16, 1.8, 1.8, WALL_H],
  [0, -12, 2.2, 2.2, 2.2], [0, 12, 2.2, 2.2, 2.2],
  [-14, 0, 2.2, 2.2, 2.2], [14, 0, 2.2, 2.2, 2.2],
  [-6, 18, 3.5, 1.2, 2.2], [6, -18, 3.5, 1.2, 2.2],
  [19.5, -6, 1.2, 3.5, 2.2], [-19.5, 6, 1.2, 3.5, 2.2],
];

const SPAWNS = [
  { player: new THREE.Vector2(0, 21.5), playerYaw: 0, bot: new THREE.Vector2(0, -21.5) },
  { player: new THREE.Vector2(0, -21.5), playerYaw: Math.PI, bot: new THREE.Vector2(0, 21.5) },
];

// ---------------------------------------------------------------------------
// Renderer / scene
// ---------------------------------------------------------------------------
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070814);
scene.fog = new THREE.FogExp2(0x070814, 0.016);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 200);
camera.rotation.order = 'YXZ';
scene.add(camera);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.6, 0.4, 0.8);
composer.addPass(bloom);
composer.addPass(new OutputPass());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// Lights
scene.add(new THREE.HemisphereLight(0x8899ff, 0x140a26, 0.55));
const sun = new THREE.DirectionalLight(0xdfe4ff, 1.3);
sun.position.set(14, 30, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 80 });
sun.shadow.bias = -0.0005;
scene.add(sun);

for (const [x, z, c] of [[-22, -22, 0x2de2ff], [22, 22, 0x2de2ff], [-22, 22, 0xff2a6d], [22, -22, 0xff2a6d]]) {
  const l = new THREE.PointLight(c, 14, 26, 1.6);
  l.position.set(x, 3.5, z);
  scene.add(l);
}

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------
function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const floorTex = canvasTexture(256, (g, s) => {
  g.fillStyle = '#0c0e22';
  g.fillRect(0, 0, s, s);
  g.fillStyle = '#10132c';
  g.fillRect(4, 4, s / 2 - 8, s / 2 - 8);
  g.fillRect(s / 2 + 4, s / 2 + 4, s / 2 - 8, s / 2 - 8);
  g.strokeStyle = '#1d2450';
  g.lineWidth = 3;
  g.strokeRect(0, 0, s, s);
});
const floorGlowTex = canvasTexture(256, (g, s) => {
  g.fillStyle = '#000';
  g.fillRect(0, 0, s, s);
  g.strokeStyle = '#3b4cff';
  g.lineWidth = 2;
  g.strokeRect(1, 1, s - 2, s - 2);
});
for (const t of [floorTex, floorGlowTex]) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(ARENA, ARENA);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
}

const glowTex = canvasTexture(64, (g, s) => {
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
});

// ---------------------------------------------------------------------------
// Arena geometry + collision boxes
// ---------------------------------------------------------------------------
/** Axis-aligned boxes used for collision, line-of-sight, and bullets. */
const boxes = [];

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(ARENA * 2, ARENA * 2),
  new THREE.MeshStandardMaterial({
    map: floorTex, emissiveMap: floorGlowTex, emissive: 0xffffff, emissiveIntensity: 0.55,
    roughness: 0.55, metalness: 0.35,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const wallMat = new THREE.MeshStandardMaterial({ color: 0x151936, roughness: 0.7, metalness: 0.3 });
const obstacleMat = new THREE.MeshStandardMaterial({ color: 0x1c2146, roughness: 0.45, metalness: 0.45 });
const stripMat = (c, i = 3) => new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(i), toneMapped: false });

function addBox(x, z, w, d, h, mat, rounded) {
  const geo = rounded ? new RoundedBoxGeometry(w, h, d, 3, 0.08) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, h / 2, z);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h });
  return m;
}

// Perimeter walls with neon trim.
const T = 1;
for (const [x, z, w, d] of [
  [0, -ARENA - T / 2, ARENA * 2 + T * 2, T], [0, ARENA + T / 2, ARENA * 2 + T * 2, T],
  [-ARENA - T / 2, 0, T, ARENA * 2], [ARENA + T / 2, 0, T, ARENA * 2],
]) {
  addBox(x, z, w, d, WALL_H, wallMat, false);
  const horiz = w > d;
  const inset = horiz ? (z < 0 ? T / 2 + 0.02 : -T / 2 - 0.02) : (x < 0 ? T / 2 + 0.02 : -T / 2 - 0.02);
  for (const [y, c, th] of [[WALL_H - 0.35, COLORS.cyan, 0.08], [0.18, COLORS.magenta, 0.06], [1.9, COLORS.violet, 0.03]]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(horiz ? w - 2 : 0.02, th, horiz ? 0.02 : d), stripMat(c, 2.5));
    strip.position.set(horiz ? x : x + inset, y, horiz ? z + inset : z);
    scene.add(strip);
  }
}

// Cover obstacles with glowing edges.
OBSTACLE_LAYOUT.forEach(([x, z, w, d, h], i) => {
  const m = addBox(x, z, w, d, h, obstacleMat, true);
  const color = i % 2 === 0 ? COLORS.cyan : COLORS.magenta;
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.01, h + 0.01, d + 0.01)),
    new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(1.6), toneMapped: false }),
  );
  m.add(edges);
  const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, 0.07, d + 0.03), stripMat(color, 2));
  band.position.y = h / 2 - 0.35;
  m.add(band);
});

// Floating ambient motes for atmosphere.
{
  const n = 260;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * ARENA;
    pos[i * 3 + 1] = Math.random() * 7 + 0.5;
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * ARENA;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const motes = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.08, map: glowTex, color: 0x6a7dff, transparent: true, opacity: 0.6,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  motes.name = 'motes';
  scene.add(motes);
}

// ---------------------------------------------------------------------------
// Geometry helpers (all collision is 2D on the XZ plane; every obstacle is
// taller than bullet/eye height so height can be ignored for blocking).
// ---------------------------------------------------------------------------
function segBoxT(ax, az, bx, bz, box, inflate = 0) {
  const dx = bx - ax, dz = bz - az;
  let tmin = 0, tmax = 1;
  const mins = [box.minX - inflate, box.minZ - inflate];
  const maxs = [box.maxX + inflate, box.maxZ + inflate];
  const o = [ax, az], d = [dx, dz];
  for (let i = 0; i < 2; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mins[i] || o[i] > maxs[i]) return null;
    } else {
      let t1 = (mins[i] - o[i]) / d[i];
      let t2 = (maxs[i] - o[i]) / d[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

function segmentHitT(ax, az, bx, bz, inflate = 0) {
  let best = null;
  for (const b of boxes) {
    const t = segBoxT(ax, az, bx, bz, b, inflate);
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best;
}

const segmentBlocked = (ax, az, bx, bz, inflate = 0) => segmentHitT(ax, az, bx, bz, inflate) !== null;

function segCircleT(ax, az, bx, bz, cx, cz, r) {
  const dx = bx - ax, dz = bz - az;
  const fx = ax - cx, fz = az - cz;
  const a = dx * dx + dz * dz;
  const c = fx * fx + fz * fz - r * r;
  if (c <= 0) return 0;
  if (a < 1e-12) return null;
  const b = 2 * (fx * dx + fz * dz);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

/** Push a circle out of all boxes. Returns true if any collision happened. */
function resolveCircle(p, r) {
  let hit = false;
  for (let iter = 0; iter < 2; iter++) {
    for (const b of boxes) {
      const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(p.y, b.maxZ));
      let dx = p.x - cx, dz = p.y - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (r - d);
        p.y += (dz / d) * (r - d);
      } else {
        const pen = [p.x - b.minX, b.maxX - p.x, p.y - b.minZ, b.maxZ - p.y];
        const i = pen.indexOf(Math.min(...pen));
        if (i === 0) p.x = b.minX - r; else if (i === 1) p.x = b.maxX + r;
        else if (i === 2) p.y = b.minZ - r; else p.y = b.maxZ + r;
      }
    }
  }
  return hit;
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

// ---------------------------------------------------------------------------
// Navigation grid + A*
// ---------------------------------------------------------------------------
const CELL = 1;
const N = (ARENA * 2) / CELL;
const blocked = new Uint8Array(N * N);
const cellCenter = (i) => -ARENA + (i + 0.5) * CELL;
const toCell = (v) => Math.max(0, Math.min(N - 1, Math.floor((v + ARENA) / CELL)));
for (let iz = 0; iz < N; iz++) {
  for (let ix = 0; ix < N; ix++) {
    const x = cellCenter(ix), z = cellCenter(iz);
    const inf = BOT_R + 0.15;
    blocked[iz * N + ix] = boxes.some((b) => x > b.minX - inf && x < b.maxX + inf && z > b.minZ - inf && z < b.maxZ + inf) ? 1 : 0;
  }
}

function nearestFree(ix, iz) {
  if (!blocked[iz * N + ix]) return [ix, iz];
  for (let r = 1; r < 6; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = ix + dx, z = iz + dz;
        if (x >= 0 && z >= 0 && x < N && z < N && !blocked[z * N + x]) return [x, z];
      }
    }
  }
  return [ix, iz];
}

function findPath(sx, sz, gx, gz) {
  const [six, siz] = nearestFree(toCell(sx), toCell(sz));
  const [gix, giz] = nearestFree(toCell(gx), toCell(gz));
  const start = siz * N + six, goal = giz * N + gix;
  const g = new Float32Array(N * N).fill(Infinity);
  const came = new Int32Array(N * N).fill(-1);
  const closed = new Uint8Array(N * N);
  const heap = [];
  const push = (node, f) => {
    heap.push([f, node]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top[1];
  };
  const h = (n) => {
    const dx = Math.abs((n % N) - gix), dz = Math.abs(Math.floor(n / N) - giz);
    return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
  };
  g[start] = 0;
  push(start, h(start));
  while (heap.length) {
    const cur = pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % N, cz = Math.floor(cur / N);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const nIdx = nz * N + nx;
        if (blocked[nIdx] || closed[nIdx]) continue;
        if (dx && dz && (blocked[cz * N + nx] || blocked[nz * N + cx])) continue;
        const ng = g[cur] + (dx && dz ? 1.414 : 1);
        if (ng < g[nIdx]) {
          g[nIdx] = ng;
          came[nIdx] = cur;
          push(nIdx, ng + h(nIdx));
        }
      }
    }
  }
  if (came[goal] === -1 && goal !== start) return [];
  const path = [];
  for (let n = goal; n !== -1 && n !== start; n = came[n]) {
    path.push(new THREE.Vector2(cellCenter(n % N), cellCenter(Math.floor(n / N))));
  }
  path.reverse();
  if (path.length) path[path.length - 1].set(gx, gz);
  return path;
}

// ---------------------------------------------------------------------------
// Effects: particles, bullets, muzzle flashes
// ---------------------------------------------------------------------------
const MAX_PARTICLES = 600;
const particles = (() => {
  const pos = new Float32Array(MAX_PARTICLES * 3).fill(-999);
  const col = new Float32Array(MAX_PARTICLES * 3);
  const vel = new Float32Array(MAX_PARTICLES * 3);
  const life = new Float32Array(MAX_PARTICLES);
  const maxLife = new Float32Array(MAX_PARTICLES);
  const base = new Float32Array(MAX_PARTICLES * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.16, map: glowTex, vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  pts.frustumCulled = false;
  scene.add(pts);
  let next = 0;
  return {
    emit(p, color, count, speed = 6, lifeSec = 0.5) {
      for (let k = 0; k < count; k++) {
        const i = next;
        next = (next + 1) % MAX_PARTICLES;
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1);
        const s = speed * (0.3 + Math.random() * 0.7);
        vel[i * 3] = Math.sin(ph) * Math.cos(th) * s;
        vel[i * 3 + 1] = Math.abs(Math.cos(ph)) * s * 0.8 + 1;
        vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * s;
        life[i] = maxLife[i] = lifeSec * (0.5 + Math.random() * 0.5);
        base[i * 3] = color.r * 3; base[i * 3 + 1] = color.g * 3; base[i * 3 + 2] = color.b * 3;
      }
    },
    update(dt) {
      for (let i = 0; i < MAX_PARTICLES; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) { pos[i * 3 + 1] = -999; continue; }
        vel[i * 3 + 1] -= 14 * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] = Math.max(0.02, pos[i * 3 + 1] + vel[i * 3 + 1] * dt);
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const k = life[i] / maxLife[i];
        col[i * 3] = base[i * 3] * k; col[i * 3 + 1] = base[i * 3 + 1] * k; col[i * 3 + 2] = base[i * 3 + 2] * k;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
    clear() { life.fill(0); pos.fill(-999); geo.attributes.position.needsUpdate = true; },
  };
})();

const bulletGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6).rotateX(Math.PI / 2);
const bullets = [];
function makeBullet(color) {
  const m = new THREE.Mesh(bulletGeo, new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(4), toneMapped: false }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8,
  }));
  glow.scale.setScalar(0.55);
  m.add(glow);
  m.visible = false;
  scene.add(m);
  return m;
}

function spawnBullet(owner, origin, dir, speed, damage) {
  let b = bullets.find((x) => !x.active && x.owner === owner);
  if (!b) {
    b = { mesh: makeBullet(owner === 'player' ? COLORS.cyan : COLORS.orange), owner, pos: new THREE.Vector3(), dir: new THREE.Vector3() };
    bullets.push(b);
  }
  b.active = true;
  b.pos.copy(origin);
  b.dir.copy(dir);
  b.speed = speed;
  b.damage = damage;
  b.life = 1.6;
  b.mesh.visible = true;
  b.mesh.position.copy(origin);
  b.mesh.lookAt(origin.clone().add(dir));
}

function makeFlash(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: color.clone().multiplyScalar(3), blending: THREE.AdditiveBlending,
    depthWrite: false, transparent: true, toneMapped: false,
  }));
  s.scale.setScalar(size);
  s.visible = false;
  return s;
}

// ---------------------------------------------------------------------------
// Audio (synthesized, no assets)
// ---------------------------------------------------------------------------
const audio = {
  ctx: null,
  master: null,
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.3;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },
  tone(type, f0, f1, dur, vol, pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const p = this.ctx.createStereoPanner();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    p.pan.value = pan;
    o.connect(g).connect(p).connect(this.master);
    o.start(t);
    o.stop(t + dur);
  },
  burst(dur, vol, freq, pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    s.connect(f).connect(g).connect(p).connect(this.master);
    s.start(t);
    s.stop(t + dur);
  },
  shoot() { this.tone('square', 880, 120, 0.12, 0.18); this.burst(0.08, 0.3, 2500); },
  botShoot(pan, vol) { this.tone('sawtooth', 520, 90, 0.14, 0.12 * vol, pan); this.burst(0.08, 0.2 * vol, 1500, pan); },
  hit() { this.tone('sine', 1400, 1900, 0.07, 0.25); },
  hurt() { this.tone('triangle', 180, 60, 0.25, 0.4); this.burst(0.15, 0.3, 400); },
  impact(pan, vol) { this.burst(0.06, 0.15 * vol, 3000, pan); },
  kill() { this.tone('sine', 600, 1200, 0.35, 0.3); this.tone('square', 300, 80, 0.5, 0.15); },
  beep(high) { this.tone('sine', high ? 1320 : 660, high ? 1320 : 660, high ? 0.4 : 0.15, 0.25); },
};

// Spatial audio helpers relative to the player.
function panVol(p) {
  const dx = p.x - player.pos.x, dz = p.z - player.pos.y;
  const ang = wrapAngle(Math.atan2(-dx, -dz) - player.yaw);
  const dist = Math.hypot(dx, dz);
  return [Math.max(-1, Math.min(1, -Math.sin(ang))), Math.max(0.15, 1 - dist / 45)];
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------
const player = {
  pos: new THREE.Vector2(),
  vel: new THREE.Vector2(),
  yaw: 0,
  hp: MAX_HP,
  fireCd: 0,
  bob: 0,
  recoil: 0,
  dead: false,
  deathT: 0,
};

const gun = new THREE.Group();
{
  const body = new THREE.MeshStandardMaterial({ color: 0x232845, metalness: 0.7, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0f1122, metalness: 0.5, roughness: 0.5 });
  const main = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.13, 0.46, 3, 0.02), body);
  gun.add(main);
  const top = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.05, 0.3, 2, 0.015), dark);
  top.position.set(0, 0.085, -0.02);
  gun.add(top);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.3, 12).rotateX(Math.PI / 2), dark);
  barrel.position.set(0, 0.02, -0.36);
  gun.add(barrel);
  const grip = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.17, 0.09, 2, 0.02), dark);
  grip.position.set(0, -0.12, 0.1);
  grip.rotation.x = -0.25;
  gun.add(grip);
  for (const sx of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.34), stripMat(COLORS.cyan, 1.1));
    strip.position.set(sx * 0.057, 0.015, -0.02);
    gun.add(strip);
  }
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.06), stripMat(COLORS.cyan, 1.3));
  core.position.set(0, 0.112, 0.06);
  gun.add(core);
}
const gunMuzzle = new THREE.Object3D();
gunMuzzle.position.set(0, 0.02, -0.53);
gun.add(gunMuzzle);
const playerFlash = makeFlash(COLORS.cyan, 0.35);
gunMuzzle.add(playerFlash);
const playerLight = new THREE.PointLight(0x2de2ff, 0, 8, 2);
gunMuzzle.add(playerLight);
const GUN_REST = new THREE.Vector3(0.24, -0.24, -0.5);
gun.position.copy(GUN_REST);
camera.add(gun);
const gunFill = new THREE.PointLight(0xaab8ff, 1.2, 1.6, 2);
gunFill.position.set(0.05, 0.15, -0.15);
camera.add(gunFill);

// ---------------------------------------------------------------------------
// Bot
// ---------------------------------------------------------------------------
const RED = new THREE.Color(0xff1f3d);
const botMats = {
  armor: new THREE.MeshStandardMaterial({ color: 0x79819e, metalness: 0.5, roughness: 0.35, emissive: 0xffffff, emissiveIntensity: 0 }),
  plate: new THREE.MeshStandardMaterial({ color: 0x3a3f50, metalness: 0.45, roughness: 0.42, emissive: 0xffffff, emissiveIntensity: 0 }),
  joint: new THREE.MeshStandardMaterial({ color: 0x16171f, metalness: 0.4, roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0 }),
  gun: new THREE.MeshStandardMaterial({ color: 0x2c2e3a, metalness: 0.5, roughness: 0.35 }),
  visor: new THREE.MeshStandardMaterial({ color: 0x040406, metalness: 0.9, roughness: 0.12 }),
  accent: stripMat(RED, 2.5),
  eyes: stripMat(RED, 6),
};
const BOT_FLASH_MATS = [botMats.armor, botMats.plate, botMats.joint];
const UP = new THREE.Vector3(0, 1, 0);
const UPPER_Y = 1.1;

function buildBot() {
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const rig = new THREE.Group();
  root.add(rig);
  const add = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const rbox = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 2, r);
  // Armored capsule spanning two joints, with a plate sleeve over it.
  const limb = (parent, from, to, radius, sleeve) => {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    dir.normalize();
    const mid = from.clone().addScaledVector(dir, len / 2);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
    const c = add(parent, new THREE.CapsuleGeometry(radius, len, 4, 10), botMats.joint, mid.x, mid.y, mid.z);
    c.quaternion.copy(q);
    if (sleeve) {
      const s = add(parent, rbox(radius * 2.7, len * 0.72, radius * 2.7, 0.03), botMats.armor, mid.x, mid.y, mid.z);
      s.quaternion.copy(q);
    }
    add(parent, new THREE.SphereGeometry(radius * 1.35, 12, 10), botMats.joint, to.x, to.y, to.z);
  };

  // Legs: hip pivot -> thigh -> knee pivot -> shin -> foot.
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.19, 1.0, 0);
    rig.add(hip);
    add(hip, new THREE.SphereGeometry(0.12, 12, 10), botMats.joint, 0, 0, 0);
    add(hip, rbox(0.25, 0.46, 0.3, 0.06), botMats.armor, 0, -0.25, 0.01);
    add(hip, rbox(0.27, 0.16, 0.32, 0.04), botMats.plate, sx * 0.02, -0.06, 0.01);
    add(hip, new THREE.BoxGeometry(0.03, 0.26, 0.02), botMats.accent, 0, -0.27, 0.165);
    const knee = new THREE.Group();
    knee.position.y = -0.5;
    hip.add(knee);
    add(knee, new THREE.SphereGeometry(0.1, 12, 10), botMats.joint, 0, 0, 0);
    add(knee, rbox(0.2, 0.17, 0.12), botMats.plate, 0, 0.02, 0.12, -0.25);
    add(knee, rbox(0.21, 0.42, 0.25, 0.05), botMats.plate, 0, -0.24, 0);
    add(knee, rbox(0.17, 0.3, 0.07, 0.02), botMats.armor, 0, -0.21, 0.13, 0.08);
    add(knee, new THREE.BoxGeometry(0.1, 0.03, 0.02), botMats.accent, 0, -0.12, 0.17);
    add(knee, rbox(0.26, 0.1, 0.44, 0.03), botMats.joint, 0, -0.47, 0.06);
    add(knee, rbox(0.24, 0.07, 0.13, 0.02), botMats.armor, 0, -0.43, 0.24);
    legs.push({ hip, knee });
  }
  add(rig, rbox(0.56, 0.22, 0.34, 0.06), botMats.plate, 0, 1.04, 0);
  add(rig, rbox(0.22, 0.22, 0.06, 0.02), botMats.armor, 0, 0.96, 0.17, -0.15);

  const upper = new THREE.Group();
  upper.position.y = UPPER_Y;
  rig.add(upper);
  // Abdomen with layered segments.
  add(upper, rbox(0.44, 0.32, 0.3), botMats.joint, 0, 0.12, 0);
  for (let i = 0; i < 3; i++) add(upper, rbox(0.4 - i * 0.02, 0.06, 0.06, 0.02), botMats.plate, 0, 0.04 + i * 0.085, 0.15);
  // Chest.
  add(upper, new RoundedBoxGeometry(0.84, 0.5, 0.5, 3, 0.1), botMats.armor, 0, 0.5, 0);
  for (const sx of [-1, 1]) add(upper, rbox(0.37, 0.3, 0.08, 0.03), botMats.plate, sx * 0.2, 0.56, 0.25, 0, -sx * 0.28);
  const core = add(upper, new THREE.OctahedronGeometry(0.075), botMats.eyes, 0, 0.42, 0.3);
  add(upper, new THREE.TorusGeometry(0.095, 0.015, 6, 20), botMats.plate, 0, 0.42, 0.29);
  add(upper, new THREE.BoxGeometry(0.7, 0.025, 0.02), botMats.accent, 0, 0.27, 0.255);
  add(upper, rbox(0.5, 0.12, 0.4), botMats.plate, 0, 0.77, 0);
  add(upper, new THREE.CylinderGeometry(0.08, 0.1, 0.16, 10), botMats.joint, 0, 0.86, 0);
  // Backpack reactor with glowing vents and exhausts.
  add(upper, rbox(0.6, 0.5, 0.25, 0.05), botMats.plate, 0, 0.52, -0.33);
  for (let i = 0; i < 3; i++) add(upper, new THREE.BoxGeometry(0.4, 0.022, 0.01), botMats.accent, 0, 0.42 + i * 0.08, -0.46);
  for (const sx of [-1, 1]) {
    add(upper, new THREE.CylinderGeometry(0.055, 0.075, 0.38, 10), botMats.joint, sx * 0.2, 0.86, -0.38, -0.25);
    add(upper, new THREE.CircleGeometry(0.045, 10), botMats.accent, sx * 0.2, 1.04, -0.43, -Math.PI / 2 - 0.25);
  }
  // Spiked shoulder pauldrons.
  for (const sx of [-1, 1]) {
    add(upper, new THREE.SphereGeometry(0.13, 12, 10), botMats.joint, sx * 0.47, 0.66, 0);
    const pad = new THREE.Group();
    pad.position.set(sx * 0.5, 0.8, 0);
    pad.rotation.z = -sx * 0.38;
    upper.add(pad);
    add(pad, new RoundedBoxGeometry(0.34, 0.14, 0.46, 3, 0.05), botMats.armor, 0, 0, 0);
    add(pad, rbox(0.3, 0.1, 0.42, 0.03), botMats.plate, sx * 0.05, -0.1, 0);
    add(pad, new THREE.BoxGeometry(0.3, 0.022, 0.02), botMats.accent, 0, -0.02, 0.235);
    for (const z of [-0.12, 0.08]) add(pad, new THREE.ConeGeometry(0.04, 0.22, 6), botMats.plate, sx * 0.03, 0.16, z, 0, 0, -sx * 0.25);
  }

  // Head: helmet, dark faceplate, angry slanted eye slits, swept horns.
  const head = new THREE.Group();
  head.position.y = 1.02;
  upper.add(head);
  add(head, new RoundedBoxGeometry(0.34, 0.28, 0.36, 3, 0.07), botMats.armor, 0, 0, 0);
  add(head, rbox(0.29, 0.15, 0.05, 0.02), botMats.visor, 0, 0, 0.17);
  for (const sx of [-1, 1]) add(head, new THREE.BoxGeometry(0.095, 0.026, 0.02), botMats.eyes, sx * 0.068, 0.012, 0.2, 0, 0, sx * 0.3);
  add(head, rbox(0.33, 0.05, 0.09, 0.02), botMats.plate, 0, 0.075, 0.16, 0.35);
  add(head, rbox(0.2, 0.09, 0.07, 0.02), botMats.plate, 0, -0.105, 0.15);
  for (let i = -1; i <= 1; i++) add(head, new THREE.BoxGeometry(0.015, 0.05, 0.01), botMats.joint, i * 0.05, -0.105, 0.19);
  for (const sx of [-1, 1]) add(head, new THREE.ConeGeometry(0.035, 0.28, 6), botMats.plate, sx * 0.17, 0.1, -0.06, -1.05, 0, -sx * 0.45);
  add(head, rbox(0.03, 0.07, 0.3, 0.01), botMats.plate, 0, 0.165, -0.03);

  // Rifle held in both hands at chest height. `aim` carries arms + gun so recoil moves them together.
  const aim = new THREE.Group();
  upper.add(aim);
  const gunG = new THREE.Group();
  gunG.position.set(0.1, 0.42, 0.18);
  aim.add(gunG);
  add(gunG, rbox(0.11, 0.16, 0.55, 0.03), botMats.gun, 0, 0, 0.1);
  add(gunG, rbox(0.1, 0.11, 0.3, 0.02), botMats.plate, 0, 0.01, 0.5);
  add(gunG, new THREE.CylinderGeometry(0.026, 0.026, 0.28, 10), botMats.gun, 0, 0.01, 0.76, Math.PI / 2);
  add(gunG, new THREE.CylinderGeometry(0.042, 0.042, 0.09, 10), botMats.joint, 0, 0.01, 0.9, Math.PI / 2);
  add(gunG, rbox(0.08, 0.13, 0.26, 0.02), botMats.gun, 0, -0.02, -0.27);
  add(gunG, rbox(0.07, 0.22, 0.1, 0.015), botMats.gun, 0, -0.16, 0.16, 0.25);
  add(gunG, new THREE.CylinderGeometry(0.03, 0.03, 0.2, 10), botMats.joint, 0, 0.13, 0.05, Math.PI / 2);
  add(gunG, new THREE.CircleGeometry(0.024, 10), botMats.eyes, 0, 0.13, 0.151);
  for (const sx of [-1, 1]) add(gunG, new THREE.BoxGeometry(0.01, 0.02, 0.42), botMats.accent, sx * 0.058, 0.02, 0.18);
  add(gunG, new THREE.BoxGeometry(0.04, 0.06, 0.12), botMats.eyes, -0.07, -0.02, 0.0);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.01, 0.96);
  gunG.add(muzzle);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // Right arm -> rear grip, left arm -> foregrip.
  limb(aim, V(0.47, 0.66, 0), V(0.42, 0.32, -0.04), 0.075, true);
  limb(aim, V(0.42, 0.32, -0.04), V(0.12, 0.33, 0.17), 0.07, true);
  limb(aim, V(-0.47, 0.66, 0), V(-0.4, 0.3, 0.26), 0.075, true);
  limb(aim, V(-0.4, 0.3, 0.26), V(0.08, 0.35, 0.5), 0.07, true);
  add(aim, rbox(0.1, 0.11, 0.13, 0.03), botMats.joint, 0.12, 0.31, 0.18);
  add(aim, rbox(0.11, 0.1, 0.13, 0.03), botMats.joint, 0.09, 0.34, 0.52);

  return { root, rig, legs, upper, head, aim, core, muzzle };
}

const botModel = buildBot();
scene.add(botModel.root);
const botFlash = makeFlash(COLORS.orange, 1.1);
botModel.muzzle.add(botFlash);
const botFlashCone = new THREE.Mesh(
  new THREE.ConeGeometry(0.1, 0.5, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.2),
  new THREE.MeshBasicMaterial({ color: COLORS.orange.clone().multiplyScalar(4), toneMapped: false, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
);
botFlashCone.visible = false;
botModel.muzzle.add(botFlashCone);
const botLight = new THREE.PointLight(0xff8a3d, 0, 9, 2);
botModel.muzzle.add(botLight);
const botGlow = new THREE.PointLight(0xff1f3d, 4, 5, 1.5);
botGlow.position.set(0, 2.1, 0.9);
botModel.root.add(botGlow);
const botRing = new THREE.Mesh(
  new THREE.RingGeometry(0.66, 0.76, 40).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: RED.clone().multiplyScalar(2), toneMapped: false, transparent: true, opacity: 0.85, depthWrite: false }),
);
botRing.position.y = 0.02;
botModel.root.add(botRing);

// Floating health bar above the bot.
const botBar = new THREE.Group();
{
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.11), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
  botBar.add(bg);
  const fillGeo = new THREE.PlaneGeometry(0.9, 0.07).translate(0.45, 0, 0);
  const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: COLORS.magenta.clone().multiplyScalar(2.5), toneMapped: false, depthWrite: false }));
  fill.position.set(-0.45, 0, 0.001);
  botBar.add(fill);
  botBar.userData.fill = fill;
  scene.add(botBar);
}

const bot = {
  pos: new THREE.Vector2(),
  vel: new THREE.Vector2(),
  yaw: 0,
  hp: MAX_HP,
  fireCd: 0,
  seeTime: 0,
  lostTime: 0,
  canSee: false,
  lastKnown: new THREE.Vector2(),
  mode: 'hunt',
  modeT: 0,
  path: [],
  pathT: 0,
  pathGoal: new THREE.Vector2(9999, 9999),
  strafe: 1,
  strafeT: 0,
  alertT: 0,
  retreatCd: 0,
  flash: 0,
  walk: 0,
  recoil: 0,
  hitReact: 0,
  hitSide: 1,
  sparkT: 0,
  landed: false,
  dead: false,
  deathT: 0,
};

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const game = {
  state: 'menu', // menu | countdown | playing | roundEnd | over | paused
  prevState: null,
  difficulty: 'normal',
  round: 1,
  score: { player: 0, bot: 0 },
  timer: 0,
  countdownStep: -1,
  shake: 0,
  stats: { shots: 0, hits: 0, dealt: 0, taken: 0, time: 0 },
};
const diff = () => DIFFICULTY[game.difficulty];

// DOM
const $ = (id) => document.getElementById(id);
const ui = {
  hud: $('hud'), start: $('start-screen'), pause: $('pause-screen'), end: $('end-screen'),
  playerHp: $('player-hp'), playerHpText: $('player-hp-text'), botHp: $('bot-hp'), botHpText: $('bot-hp-text'),
  round: $('round-label'), scoreP: $('score-player'), scoreB: $('score-bot'),
  announce: $('announce'), crosshair: $('crosshair'), hitmarker: $('hitmarker'), dmg: $('dmg-indicator'),
  vignette: $('vignette'), minimap: $('minimap'),
};
const mm = ui.minimap.getContext('2d');

function announce(html, bad = false) {
  ui.announce.innerHTML = html;
  ui.announce.classList.remove('pop', 'bad');
  void ui.announce.offsetWidth;
  ui.announce.classList.add('pop');
  if (bad) ui.announce.classList.add('bad');
}
function clearAnnounce() { ui.announce.classList.remove('pop'); ui.announce.style.opacity = ''; }

function updateHud() {
  const p = Math.max(0, player.hp), b = Math.max(0, bot.hp);
  ui.playerHp.style.width = `${p}%`;
  ui.playerHpText.textContent = Math.ceil(p);
  ui.playerHp.classList.toggle('low', p <= 30);
  ui.botHp.style.width = `${b}%`;
  ui.botHpText.textContent = Math.ceil(b);
  ui.botHp.classList.toggle('low', b <= 30);
  ui.round.textContent = `ROUND ${game.round}`;
  ui.scoreP.textContent = game.score.player;
  ui.scoreB.textContent = game.score.bot;
}

function flashHitmarker(kill) {
  ui.hitmarker.classList.remove('show', 'kill');
  void ui.hitmarker.offsetWidth;
  ui.hitmarker.classList.add('show');
  if (kill) ui.hitmarker.classList.add('kill');
}

let vignetteLevel = 0;
let dmgIndicatorLevel = 0;

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------
function placeCharacters() {
  const s = SPAWNS[(game.round - 1) % 2];
  player.pos.copy(s.player);
  player.vel.set(0, 0);
  player.yaw = s.playerYaw;
  player.hp = MAX_HP;
  player.dead = false;
  player.fireCd = 0;
  bot.pos.copy(s.bot);
  bot.vel.set(0, 0);
  bot.yaw = Math.atan2(s.player.x - s.bot.x, s.player.y - s.bot.y);
  bot.hp = MAX_HP;
  bot.dead = false;
  bot.deathT = 0;
  bot.fireCd = 1;
  bot.seeTime = 0;
  bot.lostTime = 0;
  bot.mode = 'hunt';
  bot.path = [];
  bot.pathGoal.set(9999, 9999);
  bot.lastKnown.copy(s.player);
  bot.retreatCd = 0;
  bot.alertT = 0;
  bot.recoil = bot.hitReact = 0;
  bot.landed = false;
  botModel.root.rotation.set(0, bot.yaw, 0);
  botModel.root.position.set(bot.pos.x, 0, bot.pos.y);
  botModel.root.visible = true;
  for (const b of bullets) { b.active = false; b.mesh.visible = false; }
  particles.clear();
}

function startMatch() {
  audio.init();
  game.round = 1;
  game.score.player = game.score.bot = 0;
  game.stats = { shots: 0, hits: 0, dealt: 0, taken: 0, time: 0 };
  ui.start.classList.add('hidden');
  ui.end.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  startRound();
}

function startRound() {
  placeCharacters();
  updateHud();
  game.state = 'countdown';
  game.timer = 3;
  game.countdownStep = -1;
}

function endRound(winner) {
  game.state = 'roundEnd';
  game.timer = 3;
  game.score[winner]++;
  updateHud();
  const matchOver = game.score[winner] >= ROUNDS_TO_WIN;
  if (winner === 'player') {
    announce(`ROUND WON<small>${matchOver ? 'MATCH POINT SECURED' : 'BOT DESTROYED'}</small>`);
  } else {
    announce(`ELIMINATED<small>${matchOver ? 'THE BOT TAKES THE MATCH' : 'GET BACK IN THERE'}</small>`, true);
  }
}

function showEnd() {
  game.state = 'over';
  const won = game.score.player > game.score.bot;
  clearAnnounce();
  ui.hud.classList.add('hidden');
  $('end-title').textContent = won ? 'VICTORY' : 'DEFEAT';
  $('end-title').className = won ? 'win' : 'lose';
  $('end-eyebrow').textContent = won ? `${game.difficulty.toUpperCase()} BOT DEFEATED` : 'MATCH OVER';
  $('end-score').textContent = `${game.score.player} : ${game.score.bot}`;
  const s = game.stats;
  $('stat-acc').textContent = `${s.shots ? Math.round((s.hits / s.shots) * 100) : 0}%`;
  $('stat-dealt').textContent = Math.round(s.dealt);
  $('stat-taken').textContent = Math.round(s.taken);
  $('stat-time').textContent = `${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')}`;
  ui.end.classList.remove('hidden');
}

function showMenu() {
  game.state = 'menu';
  ui.end.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.hud.classList.add('hidden');
  ui.start.classList.remove('hidden');
  clearAnnounce();
}

function togglePause() {
  if (game.state === 'paused') {
    game.state = game.prevState;
    ui.pause.classList.add('hidden');
  } else if (['playing', 'countdown', 'roundEnd'].includes(game.state)) {
    game.prevState = game.state;
    game.state = 'paused';
    ui.pause.classList.remove('hidden');
    for (const k in keys) keys[k] = false;
  }
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const keys = {};
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.repeat) return;
  if (e.code === 'Enter' && (game.state === 'menu' || game.state === 'over')) startMatch();
  else if (e.code === 'KeyM' && game.state === 'over') showMenu();
  else if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  if (game.state === 'playing') togglePause();
});

document.querySelectorAll('.difficulty button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.difficulty button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    game.difficulty = btn.dataset.diff;
    btn.blur();
  });
});
$('start-btn').addEventListener('click', (e) => { e.currentTarget.blur(); startMatch(); });
$('restart-btn').addEventListener('click', (e) => { e.currentTarget.blur(); startMatch(); });
$('resume-btn').addEventListener('click', (e) => { e.currentTarget.blur(); togglePause(); });

// ---------------------------------------------------------------------------
// Player update
// ---------------------------------------------------------------------------
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

function updatePlayer(dt) {
  const turn = (keys.ArrowLeft || keys.KeyQ ? 1 : 0) - (keys.ArrowRight || keys.KeyE ? 1 : 0);
  player.yaw += turn * PLAYER.turnSpeed * dt;
  const fwd = (keys.ArrowUp || keys.KeyW ? 1 : 0) - (keys.ArrowDown || keys.KeyS ? 1 : 0);
  const str = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  let mx = -sin * fwd + cos * str;
  let mz = -cos * fwd - sin * str;
  const len = Math.hypot(mx, mz);
  if (len > 0) { mx = (mx / len) * PLAYER.speed; mz = (mz / len) * PLAYER.speed; }
  const k = 1 - Math.exp(-dt * 12);
  player.vel.x += (mx - player.vel.x) * k;
  player.vel.y += (mz - player.vel.y) * k;
  player.pos.x += player.vel.x * dt;
  player.pos.y += player.vel.y * dt;
  resolveCircle(player.pos, PLAYER_R);
  // Don't let the player walk through the bot.
  const dx = player.pos.x - bot.pos.x, dz = player.pos.y - bot.pos.y;
  const d = Math.hypot(dx, dz), minD = PLAYER_R + BOT_R;
  if (!bot.dead && d < minD && d > 1e-4) {
    player.pos.x += (dx / d) * (minD - d);
    player.pos.y += (dz / d) * (minD - d);
  }

  player.fireCd -= dt;
  if (keys.Space && player.fireCd <= 0) playerShoot();
}

function playerShoot() {
  player.fireCd = PLAYER.fireInterval;
  player.recoil = 1;
  game.stats.shots++;
  audio.shoot();
  playerFlash.visible = true;
  playerFlash.material.rotation = Math.random() * Math.PI;
  playerLight.intensity = 6;
  ui.crosshair.classList.add('firing');
  setTimeout(() => ui.crosshair.classList.remove('firing'), 70);

  camera.updateMatrixWorld();
  const origin = gunMuzzle.getWorldPosition(new THREE.Vector3());
  const fwd = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const aim = camera.position.clone().addScaledVector(fwd, 60);
  const dir = aim.sub(origin).normalize();
  // If the muzzle is poking through a wall, the shot hits the wall immediately.
  const t = segmentHitT(camera.position.x, camera.position.z, origin.x, origin.z);
  if (t !== null) {
    const p = camera.position.clone().lerp(origin, t);
    particles.emit(p, COLORS.cyan, 10, 5, 0.35);
    return;
  }
  spawnBullet('player', origin, dir, PLAYER.bulletSpeed, PLAYER.damage);
}

function damagePlayer(amount, from) {
  if (player.dead) return;
  player.hp -= amount;
  game.stats.taken += amount;
  vignetteLevel = Math.min(1, vignetteLevel + 0.55);
  game.shake = Math.min(1, game.shake + 0.5);
  audio.hurt();
  const ang = wrapAngle(Math.atan2(-(from.x - player.pos.x), -(from.y - player.pos.y)) - player.yaw);
  ui.dmg.style.transform = `rotate(${-ang}rad)`;
  dmgIndicatorLevel = 1;
  bot.alertT = 2;
  if (player.hp <= 0) {
    player.hp = 0;
    player.dead = true;
    player.deathT = 0;
    endRound('bot');
  }
  updateHud();
}

function damageBot(amount, at, dir) {
  if (bot.dead) return;
  bot.hp -= amount;
  bot.flash = 1;
  bot.hitReact = 1;
  // Which side was hit, relative to the bot's facing, decides the twist direction.
  bot.hitSide = Math.sign((at.x - bot.pos.x) * Math.cos(bot.yaw) - (at.z - bot.pos.y) * Math.sin(bot.yaw)) || 1;
  if (dir) { bot.vel.x += dir.x * 2.2; bot.vel.y += dir.z * 2.2; }
  bot.fireCd = Math.max(bot.fireCd, 0.18);
  bot.alertT = 3;
  bot.lastKnown.copy(player.pos);
  game.stats.hits++;
  game.stats.dealt += amount;
  particles.emit(at, RED, 14, 6, 0.45);
  if (bot.hp <= 0) {
    bot.hp = 0;
    bot.dead = true;
    bot.deathT = 0;
    flashHitmarker(true);
    audio.kill();
    const c = new THREE.Vector3(bot.pos.x, 1.3, bot.pos.y);
    particles.emit(c, RED, 90, 10, 1.0);
    particles.emit(c, COLORS.orange, 60, 7, 0.9);
    endRound('player');
  } else {
    flashHitmarker(false);
    audio.hit();
  }
  updateHud();
}

// ---------------------------------------------------------------------------
// Bot AI
// ---------------------------------------------------------------------------
function botSetPath(goal, force = false) {
  if (!force && bot.pathT > 0 && goal.distanceTo(bot.pathGoal) < 1.5) return;
  bot.path = findPath(bot.pos.x, bot.pos.y, goal.x, goal.y);
  bot.pathGoal.copy(goal);
  bot.pathT = 0.6;
}

function findCover() {
  let best = null, bestScore = Infinity;
  for (let i = 0; i < 80; i++) {
    const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 11;
    const x = bot.pos.x + Math.cos(a) * r, z = bot.pos.y + Math.sin(a) * r;
    if (Math.abs(x) > ARENA - 1 || Math.abs(z) > ARENA - 1) continue;
    if (blocked[toCell(z) * N + toCell(x)]) continue;
    if (!segmentBlocked(player.pos.x, player.pos.y, x, z)) continue;
    const dp = Math.hypot(x - player.pos.x, z - player.pos.y);
    if (dp < 7) continue;
    const score = r + Math.max(0, 12 - dp);
    if (score < bestScore) { bestScore = score; best = new THREE.Vector2(x, z); }
  }
  return best;
}

/** Returns the desired movement direction (unnormalized) from the path. */
function followPath() {
  while (bot.path.length && bot.pos.distanceTo(bot.path[0]) < 0.6) bot.path.shift();
  while (bot.path.length > 1 && !segmentBlocked(bot.pos.x, bot.pos.y, bot.path[1].x, bot.path[1].y, BOT_R * 0.9)) bot.path.shift();
  if (!bot.path.length) return null;
  return new THREE.Vector2(bot.path[0].x - bot.pos.x, bot.path[0].y - bot.pos.y);
}

function updateBot(dt) {
  const D = diff();
  bot.pathT -= dt;
  bot.fireCd -= dt;
  bot.alertT -= dt;
  bot.retreatCd -= dt;
  bot.modeT += dt;

  const toPx = player.pos.x - bot.pos.x, toPz = player.pos.y - bot.pos.y;
  const dist = Math.hypot(toPx, toPz);
  const yawToPlayer = Math.atan2(toPx, toPz);
  const los = !segmentBlocked(bot.pos.x, bot.pos.y, player.pos.x, player.pos.y);
  const inFov = Math.abs(wrapAngle(yawToPlayer - bot.yaw)) < 1.15;
  bot.canSee = los && (inFov || dist < 7 || bot.alertT > 0);

  if (bot.canSee) {
    bot.lastKnown.copy(player.pos);
    bot.seeTime += dt;
    bot.lostTime = 0;
  } else {
    bot.seeTime = 0;
    bot.lostTime += dt;
  }

  // Mode transitions.
  if (bot.mode !== 'retreat' && bot.hp <= 35 && bot.canSee && bot.retreatCd <= 0) {
    const cover = findCover();
    if (cover) {
      bot.mode = 'retreat';
      bot.modeT = 0;
      bot.retreatCd = 9;
      botSetPath(cover, true);
    }
  }
  if (bot.mode === 'retreat') {
    if (!bot.path.length || bot.modeT > 3.5) { bot.mode = 'hold'; bot.modeT = 0; }
  } else if (bot.mode === 'hold') {
    if (bot.modeT > 1.4 || (bot.canSee && bot.modeT > 0.5)) { bot.mode = bot.canSee ? 'engage' : 'hunt'; bot.modeT = 0; }
  } else if (bot.canSee) {
    if (bot.mode !== 'engage') { bot.mode = 'engage'; bot.modeT = 0; }
  } else if (bot.mode === 'engage') {
    bot.mode = 'hunt';
    bot.modeT = 0;
  }

  // Movement.
  let move = null;
  let speed = D.speed;
  let faceYaw = bot.yaw;
  if (bot.mode === 'engage') {
    bot.strafeT -= dt;
    if (bot.strafeT <= 0) { bot.strafe = Math.random() < 0.5 ? -1 : 1; bot.strafeT = 0.8 + Math.random() * 1.8; }
    const nx = toPx / (dist || 1), nz = toPz / (dist || 1);
    const radial = dist > 15 ? 1 : dist < 7 ? -0.8 : 0.15 * Math.sin(bot.modeT * 1.3);
    move = new THREE.Vector2(nx * radial + -nz * bot.strafe * 0.9, nz * radial + nx * bot.strafe * 0.9);
    speed *= 0.8;
    faceYaw = yawToPlayer;
  } else if (bot.mode === 'retreat') {
    move = followPath();
    speed *= 1.15;
    faceYaw = bot.canSee ? yawToPlayer : (move ? Math.atan2(move.x, move.y) : bot.yaw);
  } else if (bot.mode === 'hold') {
    faceYaw = Math.atan2(bot.lastKnown.x - bot.pos.x, bot.lastKnown.y - bot.pos.y);
  } else {
    // Hunt: go to last known position, then track the player down.
    const goal = bot.lostTime > 3.5 || bot.pos.distanceTo(bot.lastKnown) < 1.2 ? player.pos : bot.lastKnown;
    botSetPath(goal);
    move = followPath();
    faceYaw = move ? Math.atan2(move.x, move.y) : bot.yaw;
  }

  let tx = 0, tz = 0;
  if (move && move.lengthSq() > 1e-6) {
    move.normalize().multiplyScalar(speed);
    tx = move.x; tz = move.y;
  }
  const k = 1 - Math.exp(-dt * 8);
  bot.vel.x += (tx - bot.vel.x) * k;
  bot.vel.y += (tz - bot.vel.y) * k;
  const before = bot.pos.clone();
  bot.pos.x += bot.vel.x * dt;
  bot.pos.y += bot.vel.y * dt;
  const collided = resolveCircle(bot.pos, BOT_R);
  const pd = Math.hypot(bot.pos.x - player.pos.x, bot.pos.y - player.pos.y), minD = PLAYER_R + BOT_R;
  if (pd < minD && pd > 1e-4) {
    bot.pos.x += ((bot.pos.x - player.pos.x) / pd) * (minD - pd);
    bot.pos.y += ((bot.pos.y - player.pos.y) / pd) * (minD - pd);
  }
  if (bot.mode === 'engage' && collided && bot.pos.distanceTo(before) < speed * dt * 0.4) {
    bot.strafe *= -1;
    bot.strafeT = 0.6 + Math.random();
  }

  const dy = wrapAngle(faceYaw - bot.yaw);
  bot.yaw += Math.sign(dy) * Math.min(Math.abs(dy), D.turn * dt);

  // Shooting.
  if (bot.canSee && bot.seeTime > D.reaction && bot.fireCd <= 0 && Math.abs(wrapAngle(yawToPlayer - bot.yaw)) < 0.25) {
    botShoot(dist);
  }
}

function botShoot(dist) {
  const D = diff();
  bot.fireCd = D.fireInterval * (0.85 + Math.random() * 0.3);
  botModel.root.position.set(bot.pos.x, 0, bot.pos.y);
  botModel.root.rotation.y = bot.yaw;
  botModel.root.updateMatrixWorld(true);
  const origin = botModel.muzzle.getWorldPosition(new THREE.Vector3());
  if (segmentBlocked(bot.pos.x, bot.pos.y, origin.x, origin.z)) return;
  const lead = (dist / BOT_BULLET_SPEED) * D.lead;
  const target = new THREE.Vector3(player.pos.x + player.vel.x * lead, 1.3, player.pos.y + player.vel.y * lead);
  const dir = target.sub(origin).normalize();
  // Spread tightens slightly the longer the bot keeps eyes on you.
  const spread = D.spread * (bot.seeTime < 1.5 ? 1.3 : 1);
  dir.applyAxisAngle(THREE.Object3D.DEFAULT_UP, gauss() * spread);
  dir.y += gauss() * spread * 0.3;
  dir.normalize();
  spawnBullet('bot', origin, dir, BOT_BULLET_SPEED, D.damage);
  botFlash.visible = true;
  botFlash.material.rotation = Math.random() * Math.PI;
  botFlashCone.visible = true;
  botFlashCone.scale.set(1, 1, 0.8 + Math.random() * 0.5);
  botFlashCone.rotation.z = Math.random() * Math.PI;
  botLight.intensity = 8;
  bot.recoil = 1;
  const [pan, vol] = panVol(origin);
  audio.botShoot(pan, vol);
}

const easeOut = (x) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;

function animateBot(dt, time) {
  const m = botModel;
  m.root.position.set(bot.pos.x, 0, bot.pos.y);
  bot.recoil = Math.max(0, bot.recoil - dt * 8);
  bot.hitReact = Math.max(0, bot.hitReact - dt * 4);
  bot.flash = Math.max(0, bot.flash - dt * 6);
  for (const mat of BOT_FLASH_MATS) mat.emissiveIntensity = bot.flash * 0.8;
  if (bot.dead) { animateBotDeath(dt); return; }

  m.root.rotation.set(0, bot.yaw, 0);
  const sp = bot.vel.length();
  const moving = Math.min(1, sp / 3);
  const fwdSpeed = bot.vel.x * Math.sin(bot.yaw) + bot.vel.y * Math.cos(bot.yaw);
  bot.walk += dt * sp * 2.4 * (fwdSpeed < -0.5 ? -1 : 1);
  m.legs.forEach((l, i) => {
    const w = bot.walk + (i ? Math.PI : 0);
    l.hip.rotation.x = -Math.sin(w) * 0.55 * moving;
    // Knee bends while the leg swings forward.
    l.knee.rotation.x = Math.max(0, Math.cos(w)) * 0.95 * moving + 0.06;
  });
  m.rig.position.y = -Math.abs(Math.sin(bot.walk)) * 0.05 * moving;
  m.upper.position.y = UPPER_Y + Math.sin(time * 2.2) * 0.012;
  m.upper.rotation.set(
    0.08 * moving - bot.hitReact * 0.35 - bot.recoil * 0.06,
    Math.sin(bot.walk) * 0.07 * moving + bot.hitSide * bot.hitReact * 0.25,
    bot.hitSide * bot.hitReact * 0.12,
  );
  m.head.rotation.set(-bot.hitReact * 0.3, bot.canSee ? 0 : Math.sin(time * 0.9) * 0.35, 0);
  m.aim.position.set(0, 0, -bot.recoil * 0.08);
  m.aim.rotation.set(-bot.recoil * 0.12, 0, 0);
  m.core.rotation.y += dt * 3;
  const glitch = bot.hitReact > 0.5 && Math.random() < 0.5 ? 0.3 : 1;
  botMats.eyes.color.copy(RED).multiplyScalar((5 + Math.sin(time * 6) * 1.2 + bot.flash * 4) * glitch);
  botMats.accent.color.copy(RED).multiplyScalar(2.2 + Math.sin(time * 6) * 0.5);
  botGlow.intensity = 4;
  botRing.visible = true;
}

function animateBotDeath(dt) {
  const m = botModel;
  bot.deathT += dt;
  bot.vel.set(0, 0);
  const t = bot.deathT;
  // Jolt back, knees buckle, then topple forward onto the floor.
  const jolt = easeOut(t / 0.12) * (1 - easeOut((t - 0.12) / 0.3));
  const buckle = easeOut((t - 0.12) / 0.45);
  const f = Math.min(1, Math.max(0, (t - 0.5) / 0.55));
  const fall = f * f;
  m.legs.forEach((l, i) => {
    l.hip.rotation.x = -1.15 * buckle * (i ? 1 : 0.85);
    l.knee.rotation.x = 1.9 * buckle;
  });
  m.rig.position.y = -0.42 * buckle;
  m.upper.rotation.set(-0.55 * jolt + 0.45 * buckle, 0.2 * bot.hitSide * buckle, 0.2 * bot.hitSide * buckle);
  m.head.rotation.set(0.5 * buckle, 0, 0.35 * buckle);
  m.aim.position.set(0, -0.15 * buckle, 0);
  m.aim.rotation.set(0.7 * buckle, 0, 0);
  m.root.rotation.set(1.3 * fall, bot.yaw, 0);
  if (f >= 1 && !bot.landed) {
    bot.landed = true;
    game.shake = Math.min(1, game.shake + 0.25);
    particles.emit(new THREE.Vector3(bot.pos.x + Math.sin(bot.yaw) * 1.2, 0.2, bot.pos.y + Math.cos(bot.yaw) * 1.2), RED, 30, 5, 0.6);
  }
  // Short-circuit sparks while the eyes flicker out.
  bot.sparkT -= dt;
  if (t < 2.2 && bot.sparkT <= 0) {
    bot.sparkT = 0.08 + Math.random() * 0.12;
    m.core.updateMatrixWorld(true);
    particles.emit(m.core.getWorldPosition(new THREE.Vector3()), Math.random() < 0.5 ? RED : COLORS.orange, 6, 4, 0.4);
  }
  const fade = Math.max(0, 1 - t / 1.6);
  const flicker = Math.random() < 0.35 ? 0.15 : 1;
  botMats.eyes.color.copy(RED).multiplyScalar(6 * fade * flicker);
  botMats.accent.color.copy(RED).multiplyScalar(2.2 * fade * flicker);
  botGlow.intensity = 4 * fade * flicker;
  botRing.visible = false;
}

// ---------------------------------------------------------------------------
// Bullets
// ---------------------------------------------------------------------------
function updateBullets(dt) {
  for (const b of bullets) {
    if (!b.active) continue;
    b.life -= dt;
    if (b.life <= 0) { b.active = false; b.mesh.visible = false; continue; }
    const p0 = b.pos;
    const p1 = tmpV.copy(p0).addScaledVector(b.dir, b.speed * dt);
    const wallT = segmentHitT(p0.x, p0.z, p1.x, p1.z);
    let hitT = null;
    if (b.owner === 'player' && !bot.dead) {
      hitT = segCircleT(p0.x, p0.z, p1.x, p1.z, bot.pos.x, bot.pos.y, BOT_R);
    } else if (b.owner === 'bot' && !player.dead) {
      hitT = segCircleT(p0.x, p0.z, p1.x, p1.z, player.pos.x, player.pos.y, PLAYER_R);
    }
    if (hitT !== null) {
      const y = p0.y + (p1.y - p0.y) * hitT;
      if (y < 0 || y > CHAR_H) hitT = null;
    }
    if (hitT !== null && (wallT === null || hitT <= wallT)) {
      const at = tmpV2.copy(p0).lerp(p1, hitT);
      if (b.owner === 'player') damageBot(b.damage, at.clone(), b.dir);
      else damagePlayer(b.damage, bot.pos);
      b.active = false;
      b.mesh.visible = false;
      continue;
    }
    if (wallT !== null) {
      const at = tmpV2.copy(p0).lerp(p1, wallT);
      particles.emit(at, b.owner === 'player' ? COLORS.cyan : COLORS.orange, 10, 5, 0.35);
      const [pan, vol] = panVol(at);
      audio.impact(pan, vol);
      b.active = false;
      b.mesh.visible = false;
      continue;
    }
    if (p1.y < 0) {
      particles.emit(p1.setY(0.02), b.owner === 'player' ? COLORS.cyan : COLORS.orange, 6, 4, 0.3);
      b.active = false;
      b.mesh.visible = false;
      continue;
    }
    p0.copy(p1);
    b.mesh.position.copy(p0);
  }
}

// ---------------------------------------------------------------------------
// Camera, view model, minimap
// ---------------------------------------------------------------------------
function updateCamera(dt, time) {
  const sp = player.vel.length();
  player.bob += dt * sp * 1.6;
  const bobAmt = Math.min(1, sp / PLAYER.speed);
  let y = EYE + Math.sin(player.bob * 2) * 0.045 * bobAmt;
  let roll = 0;
  if (player.dead) {
    player.deathT += dt;
    const k = Math.min(1, player.deathT / 0.8);
    const e = 1 - (1 - k) ** 3;
    y = EYE - (EYE - 0.35) * e;
    roll = 0.5 * e;
  }
  game.shake = Math.max(0, game.shake - dt * 3);
  const sh = game.shake * game.shake * 0.08;
  camera.position.set(player.pos.x + (Math.random() - 0.5) * sh, y + (Math.random() - 0.5) * sh, player.pos.y);
  camera.rotation.set((Math.random() - 0.5) * sh * 0.5, player.yaw, roll);

  player.recoil = Math.max(0, player.recoil - dt * 9);
  const r = player.recoil;
  gun.visible = !player.dead;
  gun.position.set(
    GUN_REST.x + Math.cos(player.bob) * 0.012 * bobAmt,
    GUN_REST.y + Math.abs(Math.sin(player.bob)) * 0.014 * bobAmt + Math.sin(time * 1.5) * 0.003,
    GUN_REST.z + r * 0.07,
  );
  gun.rotation.set(r * 0.12, 0, 0);

  playerLight.intensity = Math.max(0, playerLight.intensity - dt * 80);
  if (playerLight.intensity < 2) playerFlash.visible = false;
  botLight.intensity = Math.max(0, botLight.intensity - dt * 90);
  if (botLight.intensity < 2) botFlash.visible = botFlashCone.visible = false;
}

function drawMinimap() {
  const S = ui.minimap.width, pad = 12, sc = (S - pad * 2) / (ARENA * 2);
  const mx = (x) => pad + (x + ARENA) * sc;
  mm.clearRect(0, 0, S, S);
  mm.strokeStyle = 'rgba(45,226,255,0.6)';
  mm.lineWidth = 1.5;
  mm.strokeRect(pad, pad, S - pad * 2, S - pad * 2);
  mm.fillStyle = 'rgba(139,150,255,0.35)';
  for (const b of boxes) {
    const x0 = Math.max(-ARENA, b.minX), x1 = Math.min(ARENA, b.maxX);
    const z0 = Math.max(-ARENA, b.minZ), z1 = Math.min(ARENA, b.maxZ);
    if (x1 > x0 && z1 > z0) mm.fillRect(mx(x0), mx(z0), (x1 - x0) * sc, (z1 - z0) * sc);
  }
  // Bot is visible on the map only while the player has line of sight.
  const seen = !segmentBlocked(player.pos.x, player.pos.y, bot.pos.x, bot.pos.y);
  if (!bot.dead && seen) {
    mm.fillStyle = '#ff2a6d';
    mm.shadowColor = '#ff2a6d';
    mm.shadowBlur = 8;
    mm.beginPath();
    mm.arc(mx(bot.pos.x), mx(bot.pos.y), 4, 0, Math.PI * 2);
    mm.fill();
  }
  mm.save();
  mm.translate(mx(player.pos.x), mx(player.pos.y));
  mm.rotate(-player.yaw);
  mm.fillStyle = 'rgba(45,226,255,0.12)';
  mm.beginPath();
  mm.moveTo(0, 0);
  mm.arc(0, 0, 30, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55);
  mm.fill();
  mm.fillStyle = '#2de2ff';
  mm.shadowColor = '#2de2ff';
  mm.shadowBlur = 8;
  mm.beginPath();
  mm.moveTo(0, -6);
  mm.lineTo(4.5, 5);
  mm.lineTo(-4.5, 5);
  mm.closePath();
  mm.fill();
  mm.restore();
  mm.shadowBlur = 0;
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
const motes = scene.getObjectByName('motes');

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  const paused = game.state === 'paused';

  if (game.state === 'menu') {
    // Slow orbit around the arena behind the start screen.
    player.pos.set(Math.sin(time * 0.08) * 17, Math.cos(time * 0.08) * 17);
    player.yaw = time * 0.08 + Math.PI;
    player.vel.set(0, 0);
  }

  if (game.state === 'countdown') {
    game.timer -= dt;
    const step = Math.ceil(game.timer);
    if (step !== game.countdownStep && game.timer > 0) {
      game.countdownStep = step;
      announce(`${step}<small>ROUND ${game.round}</small>`);
      audio.beep(false);
    }
    if (game.timer <= 0) {
      game.state = 'playing';
      announce('FIGHT!');
      audio.beep(true);
      setTimeout(() => { if (game.state === 'playing') clearAnnounce(); }, 700);
    }
  } else if (game.state === 'playing') {
    game.stats.time += dt;
    updatePlayer(dt);
    updateBot(dt);
    updateBullets(dt);
  } else if (game.state === 'roundEnd') {
    game.timer -= dt;
    updateBullets(dt);
    if (game.timer <= 0) {
      if (Math.max(game.score.player, game.score.bot) >= ROUNDS_TO_WIN) showEnd();
      else { game.round++; clearAnnounce(); startRound(); }
    }
  }

  if (!paused) {
    animateBot(game.state === 'playing' || bot.dead ? dt : 0, time);

    botBar.visible = !bot.dead && game.state !== 'menu';
    botBar.position.set(bot.pos.x, 2.55, bot.pos.y);
    botBar.quaternion.copy(camera.quaternion);
    botBar.userData.fill.scale.x = Math.max(0.001, bot.hp / MAX_HP);

    particles.update(dt);
    motes.rotation.y += dt * 0.01;

    vignetteLevel = Math.max(player.dead ? 0.8 : player.hp <= 30 && game.state === 'playing' ? 0.25 + Math.sin(time * 5) * 0.08 : 0, vignetteLevel - dt * 1.8);
    ui.vignette.style.opacity = vignetteLevel.toFixed(3);
    dmgIndicatorLevel = Math.max(0, dmgIndicatorLevel - dt * 1.2);
    ui.dmg.style.opacity = dmgIndicatorLevel.toFixed(3);
  }

  if (game.state === 'menu') {
    camera.position.set(player.pos.x, 7, player.pos.y);
    camera.rotation.set(-0.32, player.yaw, 0);
    gun.visible = false;
  } else if (!paused) {
    updateCamera(dt, time);
  }

  if (!ui.hud.classList.contains('hidden')) drawMinimap();
  composer.render();
  requestAnimationFrame(tick);
}

// Small read-only hook for automated testing / debugging from the console.
window.__arena = { game, player, bot };

placeCharacters();
tick();
