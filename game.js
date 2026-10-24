import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// ============================================================
//  Блок-Сити — город из кубиков
// ============================================================

const $ = s => document.querySelector(s);
const isTouch = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
if (isTouch) document.body.classList.add('touch');

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const lerpAng = (a, b, t) => a + angDiff(a, b) * t;
const mr = (a, b) => a + (b - a) * Math.random();
const mpick = arr => arr[Math.floor(Math.random() * arr.length)];

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry32(20261024);
const R = (a, b) => a + (b - a) * rnd();
const RI = (a, b) => Math.floor(R(a, b + 1));
const pick = arr => arr[Math.floor(rnd() * arr.length)];

// ------------------------------------------------------------
//  World constants
// ------------------------------------------------------------
const W = 192, D = 192, H = 48, G = 4;   // ground surface is at y = G
const CH = 16;                            // chunk size
const OFF = 8;                            // city offset from world edge
const NODES = 8;                          // 8x8 road intersections
const nodeX = i => OFF + 24 * i + 3.5;

// ------------------------------------------------------------
//  Blocks & texture atlas
// ------------------------------------------------------------
const B = { GRASS: 1, DIRT: 2, STONE: 3, ASPH: 4, LINEZ: 5, LINEX: 6, WALK: 7, BRICK: 8, GLASS: 9, PLANK: 10, LEAF: 11, LOG: 12, SAND: 13, WATER: 14, CONC: 15, ROOF: 16, GOLD: 17, TNT: 18, DIAM: 19, GLASSD: 20, NEON: 21 };
const BL = [null,
  { n: 'Трава', t: [0, 1, 2], c: '#5f9f35' },
  { n: 'Земля', t: [2, 2, 2], c: '#7a5532' },
  { n: 'Камень', t: [3, 3, 3], c: '#808080' },
  { n: 'Асфальт', t: [4, 4, 4], c: '#3a3a3e' },
  { n: 'Разметка', t: [5, 4, 4], c: '#45453f' },
  { n: 'Разметка', t: [6, 4, 4], c: '#45453f' },
  { n: 'Тротуар', t: [7, 7, 7], c: '#acaca6' },
  { n: 'Кирпич', t: [8, 8, 8], c: '#a5442f' },
  { n: 'Стекло', t: [9, 9, 9], c: '#8cc3e4' },
  { n: 'Доски', t: [10, 10, 10], c: '#aa8250' },
  { n: 'Листва', t: [11, 11, 11], c: '#3c7828' },
  { n: 'Бревно', t: [13, 12, 13], c: '#6b4f2f' },
  { n: 'Песок', t: [14, 14, 14], c: '#e3d29a' },
  { n: 'Вода', t: [15, 15, 15], c: '#3a78c9' },
  { n: 'Бетон', t: [16, 16, 16], c: '#cfcac0' },
  { n: 'Крыша', t: [17, 17, 17], c: '#55575c' },
  { n: 'Золото', t: [18, 18, 18], c: '#f2c531' },
  { n: 'Динамит', t: [20, 19, 20], c: '#d2402f' },
  { n: 'Алмаз', t: [21, 21, 21], c: '#5fe3dc' },
  { n: 'Тёмное стекло', t: [22, 22, 22], c: '#2f6f7f' },
  { n: 'Неон', t: [23, 23, 23], c: '#ff4fb8' },
];
const HOTBAR = [B.BRICK, B.GLASS, B.PLANK, B.STONE, B.CONC, B.NEON, B.LOG, B.TNT, B.DIAM];
const isSolid = b => b !== 0 && b !== B.WATER;

const T = 16, ACOL = 8, AR = 4;
const atlasCanvas = document.createElement('canvas');
atlasCanvas.width = T * ACOL; atlasCanvas.height = T * AR;
const actx = atlasCanvas.getContext('2d');

function drawTile(i, fn) {
  const img = actx.createImageData(T, T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const c = fn(x, y), k = (y * T + x) * 4;
    img.data[k] = clamp(c[0] | 0, 0, 255); img.data[k + 1] = clamp(c[1] | 0, 0, 255); img.data[k + 2] = clamp(c[2] | 0, 0, 255); img.data[k + 3] = 255;
  }
  actx.putImageData(img, (i % ACOL) * T, Math.floor(i / ACOL) * T);
}
const nz = (c, a) => { const v = (rnd() - 0.5) * a; return [c[0] + v, c[1] + v, c[2] + v]; };
const shade = (c, f) => [c[0] * f, c[1] * f, c[2] * f];

function buildAtlas() {
  const green = [95, 159, 53], dirt = [122, 85, 50], asph = [58, 58, 62];
  drawTile(0, () => nz(green, 40));
  const gh = []; for (let x = 0; x < T; x++) gh.push(3 + (rnd() < 0.5 ? 1 : 0));
  drawTile(1, (x, y) => y < gh[x] ? nz(green, 35) : nz(dirt, 35));
  drawTile(2, () => nz(dirt, 35));
  drawTile(3, () => rnd() < 0.12 ? nz([100, 100, 100], 20) : nz([128, 128, 128], 26));
  drawTile(4, () => rnd() < 0.04 ? nz([95, 95, 98], 10) : nz(asph, 16));
  drawTile(5, (x) => x >= 6 && x < 10 ? nz([232, 200, 60], 18) : nz(asph, 16));
  drawTile(6, (x, y) => y >= 6 && y < 10 ? nz([232, 200, 60], 18) : nz(asph, 16));
  drawTile(7, (x, y) => (x === 0 || y === 0) ? [140, 140, 134] : nz([174, 174, 168], 12));
  drawTile(8, (x, y) => {
    const row = Math.floor(y / 4);
    if (y % 4 === 3 || (x + (row % 2) * 4) % 8 === 7) return nz([200, 195, 185], 10);
    return nz([165, 68, 47], 26);
  });
  const glass = (base, frame) => (x, y) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return frame;
    if ((x + y) % 11 < 2 && x + y > 6 && x + y < 22) return [Math.min(255, base[0] + 70), Math.min(255, base[1] + 50), Math.min(255, base[2] + 30)];
    return nz(base, 8);
  };
  drawTile(9, glass([140, 195, 228], [205, 205, 210]));
  drawTile(10, (x, y) => y % 4 === 3 ? [120, 88, 52] : nz([172, 132, 82], 18));
  drawTile(11, () => rnd() < 0.18 ? nz([35, 82, 25], 15) : nz([62, 124, 42], 45));
  drawTile(12, (x) => x % 4 === 0 ? nz([80, 58, 34], 12) : nz([107, 79, 47], 20));
  drawTile(13, (x, y) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d > 6.8) return nz([107, 79, 47], 15);
    return Math.floor(d) % 3 === 0 ? nz([140, 105, 62], 10) : nz([178, 142, 90], 12);
  });
  drawTile(14, () => nz([227, 210, 154], 20));
  drawTile(15, (x, y) => (y % 4 === 0 && (x + 2 * Math.floor(y / 4)) % 8 < 3) ? [120, 175, 235] : nz([58, 120, 201], 16));
  drawTile(16, () => nz([207, 202, 192], 14));
  drawTile(17, () => nz([85, 87, 92], 16));
  drawTile(18, (x, y) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return [196, 144, 22];
    if ((x + y) % 7 === 0) return [255, 240, 160];
    return nz([242, 197, 49], 22);
  });
  // TNT side with letters
  const font = ['111 1001 111', '010 1101 010', '010 1011 010', '010 1001 010', '010 1001 010'];
  drawTile(19, (x, y) => {
    if (y >= 5 && y <= 11) {
      const fy = y - 6, fx = x - 2;
      if (fy >= 0 && fy < 5 && fx >= 0 && fx < 12 && font[fy][fx] === '1') return [20, 20, 20];
      return nz([235, 235, 230], 10);
    }
    return x % 4 === 0 ? nz([160, 40, 30], 12) : nz([210, 64, 47], 18);
  });
  drawTile(20, (x, y) => (x >= 7 && x <= 8 && y >= 7 && y <= 8) ? [40, 40, 40] : nz([190, 60, 45], 20));
  drawTile(21, (x, y) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return [40, 150, 150];
    if (rnd() < 0.08) return [250, 255, 255];
    return nz([95, 227, 220], 30);
  });
  drawTile(22, glass([47, 111, 127], [90, 90, 96]));
  drawTile(23, (x, y) => (x === 0 || y === 0 || x === 15 || y === 15) ? [255, 190, 235] : nz([255, 79, 184], 20));
}
buildAtlas();

const atlasTex = new THREE.CanvasTexture(atlasCanvas);
atlasTex.magFilter = THREE.NearestFilter;
atlasTex.minFilter = THREE.NearestFilter;
atlasTex.generateMipmaps = false;
atlasTex.colorSpace = THREE.SRGBColorSpace;

function tileUV(i) {
  const e = 0.0015;
  const u0 = (i % ACOL) / ACOL + e, u1 = (i % ACOL + 1) / ACOL - e;
  const v1 = 1 - Math.floor(i / ACOL) / AR - e, v0 = 1 - (Math.floor(i / ACOL) + 1) / AR + e;
  return [u0, v0, u1, v1];
}

// ------------------------------------------------------------
//  Voxel storage
// ------------------------------------------------------------
const world = new Uint8Array(W * H * D);
const idx = (x, y, z) => (y * D + z) * W + x;
function get(x, y, z) {
  if (x < 0 || z < 0 || x >= W || z >= D || y >= H) return 0;
  if (y < 0) return B.STONE;
  return world[idx(x, y, z)];
}
function solidAt(x, y, z) {
  if (x < 0 || z < 0 || x >= W || z >= D || y < 0) return true;
  if (y >= H) return false;
  return isSolid(world[idx(x, y, z)]);
}
const voxBodies = new Map();   // physics colliders for voxels near debris
function put(x, y, z, b) {
  if (x >= 0 && z >= 0 && x < W && z < D && y >= 0 && y < H) {
    world[idx(x, y, z)] = b;
    if (voxBodies.size) voxelChanged(x, y, z);
  }
}
function fill(x0, y0, z0, x1, y1, z1, b) { for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) put(x, y, z, b); }

// ------------------------------------------------------------
//  City generation
// ------------------------------------------------------------
const lots = [];        // {i,j,type,x0,z0}
const parkedSpots = []; // {x,z,heading,kind}
const bankLabels = [];  // {x,y,z}
const isRoadL = l => l >= 0 && l < 175 && (l % 24) < 7;

function tree(x, y, z) {
  const h = RI(4, 5);
  for (let i = 0; i < h; i++) put(x, y + i, z, B.LOG);
  const top = y + h;
  for (let dy = -2; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    const r = dy >= 0 ? 1 : 2;
    if (Math.abs(dx) > r || Math.abs(dz) > r) continue;
    if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && rnd() < 0.7) continue;
    if (dx === 0 && dz === 0 && dy < 0) continue;
    if (get(x + dx, top + dy, z + dz) === 0) put(x + dx, top + dy, z + dz, B.LEAF);
  }
}
function palm(x, y, z) {
  const h = RI(6, 8);
  for (let i = 0; i < h; i++) put(x, y + i, z, B.LOG);
  const top = y + h;
  put(x, top, z, B.LEAF);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let k = 1; k <= 3; k++) put(x + dx * k, top - (k === 3 ? 1 : 0), z + dz * k, B.LEAF);
  }
}

function building(x0, z0, w, d, h, wall, win, roof, opt = {}) {
  for (let y = G; y < G + h; y++) for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) {
    const edgeX = x === x0 || x === x0 + w - 1, edgeZ = z === z0 || z === z0 + d - 1;
    if (!edgeX && !edgeZ) { put(x, y, z, wall); continue; }
    const along = edgeX && !edgeZ ? z - z0 : x - x0;
    const corner = edgeX && edgeZ;
    const fl = (y - G) % 4;
    let b = wall;
    if (!corner && fl !== 0 && along % 3 !== 0) b = win;
    if (opt.band && y < G + 3) b = opt.band;
    if (opt.neonTop && y === G + h - 1) b = B.NEON;
    put(x, y, z, b);
  }
  fill(x0, G + h, z0, x0 + w, G + h + 1, z0 + d, roof);
  if (opt.parapet) {
    for (let x = x0; x < x0 + w; x++) { put(x, G + h + 1, z0, wall); put(x, G + h + 1, z0 + d - 1, wall); }
    for (let z = z0; z < z0 + d; z++) { put(x0, G + h + 1, z, wall); put(x0 + w - 1, G + h + 1, z, wall); }
  }
}

function generate() {
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const lx = x - OFF, lz = z - OFF;
    put(x, 0, z, B.STONE);
    for (let y = 1; y < G - 1; y++) put(x, y, z, B.DIRT);
    const inCity = lx >= -2 && lx < 177 && lz >= -2 && lz < 177;
    let top;
    if (!inCity) {
      const d = Math.max(-2 - lx, lx - 176, -2 - lz, lz - 176);
      if (d >= 6) { top = B.WATER; put(x, G - 2, z, B.WATER); put(x, G - 3, z, B.SAND); }
      else top = B.SAND;
    } else {
      const rx = isRoadL(lx), rz = isRoadL(lz);
      if (rx || rz) {
        top = B.ASPH;
        if (rx && !rz && lx % 24 === 3 && ((lz % 4) + 4) % 4 < 2) top = B.LINEZ;
        if (rz && !rx && lz % 24 === 3 && ((lx % 4) + 4) % 4 < 2) top = B.LINEX;
      } else top = B.WALK;
    }
    put(x, G - 1, z, top);
  }
  // palms on the beach
  for (let k = 0; k < 70; k++) {
    const side = RI(0, 3), t = RI(4, W - 5), o = RI(1, 4);
    let x, z;
    if (side === 0) { x = t; z = OFF - 3 - o; } else if (side === 1) { x = t; z = OFF + 177 + o - 1; }
    else if (side === 2) { z = t; x = OFF - 3 - o; } else { z = t; x = OFF + 177 + o - 1; }
    if (get(x, G - 1, z) === B.SAND && get(x, G, z) === 0) palm(x, G, z);
  }
  // lots
  const types = [];
  const add = (t, n) => { for (let i = 0; i < n; i++) types.push(t); };
  add('bank', 3); add('park', 6); add('plaza', 3); add('house', 10); add('shop', 8); add('tower', 18);
  for (let i = types.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [types[i], types[j]] = [types[j], types[i]]; }
  let n = 0;
  for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
    let type = (i === 3 && j === 3) ? 'plaza' : types[n++ % types.length];
    if (i === 3 && j === 3) n--; // keep the shuffled list intact
    const x0 = OFF + 24 * i + 9, z0 = OFF + 24 * j + 9;
    lots.push({ i, j, type, x0, z0 });
    buildLot(type, x0, z0);
  }
}

function buildLot(type, x0, z0) {
  const S = 13;
  if (type === 'park' || type === 'house') fill(x0, G - 1, z0, x0 + S, G, z0 + S, B.GRASS);
  if (type === 'tower') {
    const pal = pick([[B.CONC, B.GLASS], [B.CONC, B.GLASSD], [B.STONE, B.GLASS], [B.BRICK, B.GLASSD], [B.CONC, B.GLASSD]]);
    const h = RI(14, 34);
    building(x0 + 1, z0 + 1, 11, 11, h, pal[0], pal[1], B.ROOF, { parapet: true });
    if (rnd() < 0.5 && G + h + 10 < H - 2) {
      const h2 = RI(4, Math.min(10, H - 4 - G - h));
      for (let y = 0; y < h2; y++) for (let z = 0; z < 7; z++) for (let x = 0; x < 7; x++) {
        const edge = x === 0 || z === 0 || x === 6 || z === 6;
        put(x0 + 3 + x, G + h + 1 + y, z0 + 3 + z, edge && (y % 4 !== 0) && ((x + z) % 3 !== 0) ? pal[1] : pal[0]);
      }
      fill(x0 + 3, G + h + 1 + h2, z0 + 3, x0 + 10, G + h + 2 + h2, z0 + 10, B.ROOF);
    }
  } else if (type === 'house') {
    const w = RI(7, 9), d = RI(7, 9), h = RI(5, 9);
    const ox = x0 + RI(1, S - w - 1), oz = z0 + RI(1, S - d - 1);
    building(ox, oz, w, d, h, rnd() < 0.6 ? B.BRICK : B.PLANK, B.GLASS, B.ROOF, { parapet: rnd() < 0.5 });
    for (let k = 0; k < 3; k++) {
      const tx = x0 + RI(0, S - 1), tz = z0 + RI(0, S - 1);
      if (tx >= ox - 2 && tx <= ox + w + 1 && tz >= oz - 2 && tz <= oz + d + 1) continue;
      tree(tx, G, tz);
    }
  } else if (type === 'shop') {
    const d = RI(6, 8), h = RI(4, 6);
    const oz = z0 + RI(1, S - d - 1);
    building(x0 + 1, oz, 11, d, h, pick([B.CONC, B.BRICK, B.STONE]), B.GLASS, B.ROOF, { neonTop: true });
  } else if (type === 'park') {
    const px = x0 + RI(3, 7), pz = z0 + RI(3, 7);
    fill(px, G - 2, pz, px + 3, G, pz + 3, B.WATER);
    for (let k = 0; k < 6; k++) {
      const tx = x0 + RI(1, S - 2), tz = z0 + RI(1, S - 2);
      if (tx >= px - 2 && tx <= px + 4 && tz >= pz - 2 && tz <= pz + 4) continue;
      tree(tx, G, tz);
    }
  } else if (type === 'plaza') {
    for (const cx of [2.5, 6.5, 10.5]) parkedSpots.push({ x: x0 + cx, z: z0 + 6.5, heading: rnd() < 0.5 ? 0 : Math.PI });
    palm(x0, G, z0); palm(x0 + S - 1, G, z0 + S - 1);
  } else if (type === 'bank') {
    building(x0 + 2, z0 + 2, 9, 9, 8, B.CONC, B.GLASSD, B.ROOF, { band: B.GOLD, parapet: true });
    put(x0 + 2, G + 10, z0 + 2, B.DIAM); put(x0 + 10, G + 10, z0 + 2, B.DIAM);
    put(x0 + 2, G + 10, z0 + 10, B.DIAM); put(x0 + 10, G + 10, z0 + 10, B.DIAM);
    bankLabels.push({ x: x0 + 6.5, y: G + 13, z: z0 + 6.5 });
  }
}
generate();

// ------------------------------------------------------------
//  Renderer / scene
// ------------------------------------------------------------
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch && devicePixelRatio < 1.5, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1 : 1.5));
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene();
const SKY = new THREE.Color('#8fcbff');
scene.background = SKY;
const VIEW = isTouch ? 105 : 160;
scene.fog = new THREE.Fog('#b9e0ff', isTouch ? 45 : 70, VIEW);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, VIEW + 10);
scene.add(new THREE.HemisphereLight('#e8f4ff', '#6b5f4a', 1.6));
const sun = new THREE.DirectionalLight('#fff0d0', 1.9);
sun.position.set(70, 120, 40);
scene.add(sun);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// ------------------------------------------------------------
//  Chunk meshing (with ambient occlusion)
// ------------------------------------------------------------
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
for (const F of FACES) {
  const ax = F.n[0] ? 0 : F.n[1] ? 1 : 2;
  const [ta, tb] = [0, 1, 2].filter(a => a !== ax);
  F.ao = F.c.map(c => {
    const sa = c[ta] ? 1 : -1, sb = c[tb] ? 1 : -1;
    const o1 = [...F.n], o2 = [...F.n], o3 = [...F.n];
    o1[ta] += sa; o2[tb] += sb; o3[ta] += sa; o3[tb] += sb;
    return [o1, o2, o3];
  });
}
const AOV = [0.45, 0.65, 0.83, 1.0];
const chunkMat = new THREE.MeshLambertMaterial({ map: atlasTex, vertexColors: true });
const CX = W / CH, CZ = D / CH;
const chunkMeshes = new Array(CX * CZ).fill(null);
const dirty = new Set();

function buildChunk(cx, cz) {
  const P = [], N = [], U = [], C = [], I = [];
  let vc = 0;
  for (let y = 0; y < H; y++) for (let z = cz * CH; z < cz * CH + CH; z++) for (let x = cx * CH; x < cx * CH + CH; x++) {
    const b = world[idx(x, y, z)];
    if (!b) continue;
    const def = BL[b];
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      const nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
      if (ny < 0) continue;
      if (get(nx, ny, nz) !== 0) continue;
      const [u0, v0, u1, v1] = tileUV(f === 2 ? def.t[0] : f === 3 ? def.t[2] : def.t[1]);
      let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
      for (let k = 0; k < 4; k++) {
        const c = F.c[k];
        P.push(x + c[0], y + c[1], z + c[2]);
        N.push(F.n[0], F.n[1], F.n[2]);
        const o = F.ao[k];
        const s1 = get(x + o[0][0], y + o[0][1], z + o[0][2]) ? 1 : 0;
        const s2 = get(x + o[1][0], y + o[1][1], z + o[1][2]) ? 1 : 0;
        const s3 = get(x + o[2][0], y + o[2][1], z + o[2][2]) ? 1 : 0;
        const v = s1 && s2 ? 0 : 3 - (s1 + s2 + s3);
        if (k === 0) a0 = v; else if (k === 1) a1 = v; else if (k === 2) a2 = v; else a3 = v;
        const br = AOV[v];
        C.push(br, br, br);
      }
      U.push(u0, v0, u1, v0, u1, v1, u0, v1);
      if (a0 + a2 < a1 + a3) I.push(vc + 1, vc + 2, vc + 3, vc + 1, vc + 3, vc);
      else I.push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3);
      vc += 4;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.setIndex(I);
  geo.computeBoundingSphere();
  const k = cz * CX + cx;
  if (chunkMeshes[k]) { chunkMeshes[k].geometry.dispose(); chunkMeshes[k].geometry = geo; }
  else { const m = new THREE.Mesh(geo, chunkMat); scene.add(m); chunkMeshes[k] = m; }
}
function markDirty(x, z) {
  const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const nx = Math.floor((x + dx) / CH), nzz = Math.floor((z + dz) / CH);
    if (nx >= 0 && nzz >= 0 && nx < CX && nzz < CZ) dirty.add(nzz * CX + nx);
  }
  if (cx >= 0) dirty.add(cz * CX + cx);
}

// ------------------------------------------------------------
//  Minimap base image
// ------------------------------------------------------------
const mapCanvas = document.createElement('canvas');
mapCanvas.width = W; mapCanvas.height = D;
const mapCtx = mapCanvas.getContext('2d');
const mapColorCache = BL.map(b => b ? new THREE.Color(b.c) : null);
function mapPixel(x, z) {
  let y = H - 1;
  while (y > 0 && world[idx(x, y, z)] === 0) y--;
  const b = world[idx(x, y, z)];
  const c = mapColorCache[b] || mapColorCache[B.STONE];
  const f = 0.85 + 0.35 * clamp((y - G) / 30, 0, 1);
  mapCtx.fillStyle = `rgb(${clamp(c.r * 255 * f, 0, 255) | 0},${clamp(c.g * 255 * f, 0, 255) | 0},${clamp(c.b * 255 * f, 0, 255) | 0})`;
  mapCtx.fillRect(x, z, 1, 1);
}

// ------------------------------------------------------------
//  Shared helpers for simple box models
// ------------------------------------------------------------
const geoCache = new Map(), matCache = new Map();
const boxGeo = (w, h, d) => { const k = w + ',' + h + ',' + d; if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d)); return geoCache.get(k); };
const lam = c => { if (!matCache.has(c)) matCache.set(c, new THREE.MeshLambertMaterial({ color: c })); return matCache.get(c); };
function box(parent, w, h, d, color, x, y, z, mat) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat || lam(color));
  m.position.set(x, y, z); parent.add(m); return m;
}

// merge many coloured boxes into one geometry (one draw call)
const BOX_TPL = new THREE.BoxGeometry(1, 1, 1);
const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const colCache = new Map();
const colorOf = c => { if (!colCache.has(c)) colCache.set(c, new THREE.Color(c)); return colCache.get(c); };
function mergeBoxes(parts) {
  const P = BOX_TPL.attributes.position.array, N = BOX_TPL.attributes.normal.array, I = BOX_TPL.index.array;
  const n = parts.length, pos = new Float32Array(n * 72), nor = new Float32Array(n * 72), col = new Float32Array(n * 72), ind = new Uint16Array(n * 36);
  parts.forEach((p, k) => {
    const c = colorOf(p.color);
    for (let v = 0; v < 24; v++) {
      const o = k * 72 + v * 3;
      pos[o] = P[v * 3] * p.w + p.x; pos[o + 1] = P[v * 3 + 1] * p.h + p.y; pos[o + 2] = P[v * 3 + 2] * p.d + p.z;
      nor[o] = N[v * 3]; nor[o + 1] = N[v * 3 + 1]; nor[o + 2] = N[v * 3 + 2];
      col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
    }
    for (let i = 0; i < 36; i++) ind[k * 36 + i] = I[i] + k * 24;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(ind, 1));
  g.computeBoundingSphere();
  return g;
}
const bx = (w, h, d, color, x, y, z, extra) => Object.assign({ w, h, d, color, x, y, z }, extra);

function makeHuman(o) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const body = [bx(0.56, 0.7, 0.3, o.shirt, 0, 1.15, 0), bx(0.42, 0.42, 0.42, o.skin, 0, 1.72, 0),
    bx(0.44, 0.13, 0.44, o.hair, 0, 1.94, 0), bx(0.44, 0.2, 0.08, o.hair, 0, 1.82, -0.19)];
  if (o.glasses) body.push(bx(0.38, 0.08, 0.03, '#111111', 0, 1.76, 0.215));
  else body.push(bx(0.08, 0.07, 0.02, '#1a1a1a', -0.1, 1.76, 0.215), bx(0.08, 0.07, 0.02, '#1a1a1a', 0.1, 1.76, 0.215));
  if (o.cap) body.push(bx(0.46, 0.1, 0.46, o.cap, 0, 1.98, 0), bx(0.4, 0.05, 0.2, o.cap, 0, 1.95, 0.3));
  g.add(new THREE.Mesh(mergeBoxes(body), vcMat));
  const armGeo = mergeBoxes([bx(0.2, 0.3, 0.22, o.sleeve || o.shirt, 0, -0.1, 0), bx(0.19, 0.42, 0.21, o.skin, 0, -0.45, 0)]);
  const legGeo = mergeBoxes([bx(0.25, 0.8, 0.27, o.pants, 0, -0.4, 0)]);
  const limb = (geo, x, y) => { const m = new THREE.Mesh(geo, vcMat); m.position.set(x, y, 0); g.add(m); return m; };
  const legL = limb(legGeo, -0.13, 0.8), legR = limb(legGeo, 0.13, 0.8), armL = limb(armGeo, -0.39, 1.45), armR = limb(armGeo, 0.39, 1.45);
  scene.add(g);
  return { g, legL, legR, armL, armR, phase: Math.random() * 6 };
}
function animHuman(h, speed, dt) {
  h.phase += dt * speed * 2.2;
  const a = Math.sin(h.phase) * Math.min(1, speed / 3) * 0.8;
  h.legL.rotation.x = a; h.legR.rotation.x = -a; h.armL.rotation.x = -a; h.armR.rotation.x = a;
}

const CAR_COLORS = ['#c0392b', '#2e86de', '#27ae60', '#ecf0f1', '#8e44ad', '#e67e22', '#2c3e50', '#ff6fb5', '#16a085', '#7f8c8d'];
const lightRed = new THREE.MeshBasicMaterial({ color: '#ff2020' });
const lightBlue = new THREE.MeshBasicMaterial({ color: '#2050ff' });
const lightOff = new THREE.MeshBasicMaterial({ color: '#333333' });
function carParts(kind, color) {
  const body = kind === 'police' ? '#16181d' : color;
  const low = kind === 'sport';
  const by = low ? 0.6 : 0.66, bh = low ? 0.6 : 0.72;
  const D = { detach: true }, S = { detach: true, small: true };
  const p = [
    bx(2, bh, 3.6, body, 0, by, 0),
    bx(1.8, low ? 0.5 : 0.66, low ? 1.8 : 2.2, '#1b2833', 0, low ? 1.15 : 1.34, low ? -0.4 : -0.25),
    bx(1.84, 0.08, low ? 1.6 : 2.0, body, 0, low ? 1.42 : 1.7, low ? -0.4 : -0.25, D),
    bx(1.9, 0.08, 1.15, body, 0, by + bh / 2 + 0.04, 1.35, D),
    bx(2.04, 0.34, 0.3, '#2a2a2a', 0, 0.48, 1.95, D),
    bx(2.04, 0.34, 0.3, '#2a2a2a', 0, 0.48, -1.95, D),
    bx(0.42, 0.2, 0.05, '#fff7c0', -0.62, 0.78, 2.11, S), bx(0.42, 0.2, 0.05, '#fff7c0', 0.62, 0.78, 2.11, S),
    bx(0.42, 0.18, 0.05, '#c01010', -0.62, 0.78, -2.11, S), bx(0.42, 0.18, 0.05, '#c01010', 0.62, 0.78, -2.11, S),
  ];
  for (const sx of [-1, 1]) {
    p.push(bx(0.08, bh * 0.85, 1.3, kind === 'police' ? '#f4f4f4' : body, sx * 1.02, by, 0.05, D));
    p.push(bx(0.22, 0.14, 0.1, body, sx * 1.1, by + 0.5, 0.75, S));
    for (const sz of [-1, 1]) p.push(bx(0.3, 0.7, 0.72, '#111111', sx * 0.97, 0.35, sz * 1.35));
  }
  if (kind === 'taxi') p.push(bx(0.6, 0.2, 0.3, '#fff3a0', 0, 1.84, -0.25, D));
  return p;
}
function makeCarModel(kind, color) {
  const g = new THREE.Group();
  const parts = carParts(kind, color);
  const mesh = new THREE.Mesh(mergeBoxes(parts), vcMat);
  g.add(mesh);
  let bar = null;
  if (kind === 'police') {
    bar = [new THREE.Mesh(boxGeo(0.55, 0.16, 0.3), lightRed), new THREE.Mesh(boxGeo(0.55, 0.16, 0.3), lightBlue)];
    bar[0].position.set(-0.32, 1.82, -0.25); bar[1].position.set(0.32, 1.82, -0.25); g.add(bar[0], bar[1]);
  }
  scene.add(g);
  return { g, mesh, parts, bar };
}
function rebuildCar(car) {
  car.model.mesh.geometry.dispose();
  car.model.mesh.geometry = mergeBoxes(car.model.parts.filter(p => !p.gone));
}

function textSprite(text, color, size = 64) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.font = `bold ${size}px "Russo One", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 10; x.strokeStyle = '#000'; x.strokeText(text, 256, 64);
  x.fillStyle = color; x.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false }));
  s.scale.set(8, 2, 1); scene.add(s); return s;
}

// ------------------------------------------------------------
//  Game state
// ------------------------------------------------------------
const SPAWN = { x: OFF + 24 * 3 + 8, z: OFF + 24 * 3 + 8 };
const player = {
  pos: new THREE.Vector3(SPAWN.x, G, SPAWN.z), vel: new THREE.Vector3(), onGround: false,
  health: 100, money: 0, inCar: null, facing: 0, punchCD: 0, hurtFlash: 0,
};
const human = makeHuman({ shirt: '#f5f5f5', sleeve: '#f5f5f5', pants: '#2b4d8c', skin: '#c68a5a', hair: '#1b1209', glasses: true });
let yaw = Math.PI * 0.75, pitch = -0.25, firstPerson = false, lastMouse = -10;
let heat = 0, stars = 0, evadeTimer = 0, seen = false, bustTimer = 0;
let deadTimer = 0, gameTime = 0, started = false, paused = false, camShake = 0, selected = 0;
const placed = new Set();
const cars = [], peds = [], pickups = [], tnts = [], particles = [];
let best = 0; try { best = +localStorage.getItem('blockcity-best') || 0; } catch (e) { }

// ---------- road graph
const nodePos = (n) => ({ x: nodeX(n[0]), z: nodeX(n[1]) });
function neighbors(n) {
  const r = [];
  if (n[0] > 0) r.push([n[0] - 1, n[1]]); if (n[0] < NODES - 1) r.push([n[0] + 1, n[1]]);
  if (n[1] > 0) r.push([n[0], n[1] - 1]); if (n[1] < NODES - 1) r.push([n[0], n[1] + 1]);
  return r;
}
const nearestNode = (x, z) => [clamp(Math.round((x - OFF - 3.5) / 24), 0, 7), clamp(Math.round((z - OFF - 3.5) / 24), 0, 7)];

// ---------- cars
function addCar(kind, x, z, heading) {
  const color = kind === 'taxi' ? '#f1c40f' : kind === 'sport' ? mpick(['#e0201b', '#ff7a00', '#1e90ff', '#111111']) : mpick(CAR_COLORS);
  const m = makeCarModel(kind, color);
  const car = { kind, model: m, pos: new THREE.Vector3(x, G, z), heading, speed: 0, ai: 'parked', bump: 0, honk: 0, stuck: 0, rev: 0, wp: null, shootCD: mr(0.5, 1.5),
    hp: kind === 'police' ? 140 : kind === 'sport' ? 90 : 100, maxHp: kind === 'police' ? 140 : kind === 'sport' ? 90 : 100, smokeT: 0 };
  car.kbody = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, shape: new CANNON.Box(new CANNON.Vec3(1, 0.75, 2.15)), collisionFilterGroup: GRP_CAR, collisionFilterMask: GRP_DEBRIS });
  car.kIn = false;
  m.g.position.copy(car.pos); m.g.rotation.y = heading;
  cars.push(car); return car;
}
function removeCar(car) { scene.remove(car.model.g); if (car.kIn) phys.removeBody(car.kbody); const i = cars.indexOf(car); if (i >= 0) cars.splice(i, 1); if (player.inCar === car) exitCar(true); }
function setTrafficRoute(car, from, to) {
  car.ai = 'traffic'; car.from = from; car.to = to; car.t = 0; car.cruise = mr(6.5, 10);
}
function spawnTraffic(farFrom) {
  for (let tries = 0; tries < 30; tries++) {
    const a = [Math.floor(Math.random() * 8), Math.floor(Math.random() * 8)];
    const b = mpick(neighbors(a));
    const p = nodePos(a);
    if (farFrom && Math.hypot(p.x - farFrom.x, p.z - farFrom.z) < 45) continue;
    const kind = Math.random() < 0.15 ? 'taxi' : Math.random() < 0.12 ? 'sport' : 'sedan';
    const car = addCar(kind, p.x, p.z, 0);
    setTrafficRoute(car, a, b);
    car.t = mr(2, 18);
    const lp = trafficLogical(car); car.pos.set(lp.x, G, lp.z); car.heading = lp.h;
    return car;
  }
}
function trafficLogical(car) {
  const a = nodePos(car.from), b = nodePos(car.to);
  const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z);
  return { x: a.x + dx * car.t + (-dz) * 2, z: a.z + dz * car.t + dx * 2, h: Math.atan2(dx, dz), dx, dz };
}

function carPoints(x, z, h) {
  const s = Math.sin(h), c = Math.cos(h), pts = [];
  for (const lx of [-0.9, 0.9]) for (const lz of [-1.95, 0, 1.95]) pts.push([x + c * lx + s * lz, z - s * lx + c * lz]);
  return pts;
}
function carBlockedAt(x, z, h) {
  for (const [px, pz] of carPoints(x, z, h)) {
    const bx = Math.floor(px), bz = Math.floor(pz);
    if (solidAt(bx, G, bz) || solidAt(bx, G + 1, bz) || get(bx, G - 1, bz) === B.WATER || get(bx, G - 1, bz) === 0) return true;
  }
  return false;
}
function driveCar(car, throttle, steer, handbrake, dt) {
  const maxF = car.kind === 'police' ? 22 + stars * 1.5 : car.kind === 'sport' ? 36 : 28;
  if (throttle > 0) car.speed += (car.speed < 0 ? 30 : (car.kind === 'sport' ? 20 : 15)) * throttle * dt;
  else if (throttle < 0) car.speed += (car.speed > 0 ? 32 : 10) * throttle * dt;
  else car.speed *= Math.max(0, 1 - 0.9 * dt);
  if (handbrake) car.speed *= Math.max(0, 1 - 2.5 * dt);
  car.speed = clamp(car.speed, -9, maxF);
  const grip = clamp(Math.abs(car.speed) / 5, 0, 1) * (car.speed >= 0 ? 1 : -1);
  car.heading += steer * 2.1 * grip * (handbrake ? 1.5 : 1) * dt;
  const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
  const nzz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
  if (carBlockedAt(nx, nzz, car.heading) && !carBlockedAt(car.pos.x, car.pos.z, car.heading)) {
    const imp = Math.abs(car.speed);
    const broke = imp > 10 ? smashBlocks(car, imp) : 0;
    if (imp > 8) damageCar(car, (imp - 8) * (car.kind === 'police' ? 1 : 2.4));
    if (broke && imp > 17) { car.speed *= 0.55; return imp; }   // plough through the wall
    car.speed *= -0.25;
    return imp;
  }
  car.pos.x = nx; car.pos.z = nzz;
  return 0;
}

function updateTraffic(car, dt) {
  const lp = trafficLogical(car);
  let want = car.cruise;
  if (car.bump > 0) { car.bump -= dt; want = 0; }
  const fx = Math.sin(lp.h), fz = Math.cos(lp.h);
  const check = (px, pz, latMax, dist) => {
    const dx = px - car.pos.x, dz = pz - car.pos.z;
    const ahead = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
    if (ahead > 0.5 && ahead < dist && lat < latMax) want = Math.min(want, Math.max(0, (ahead - 4.5) * 1.5));
    return ahead > 0.5 && ahead < dist && lat < latMax;
  };
  for (const o of cars) if (o !== car) check(o.pos.x, o.pos.z, 1.9, 8);
  if (!player.inCar && check(player.pos.x, player.pos.z, 1.6, 7)) {
    car.honk -= dt; if (car.honk <= 0) { car.honk = mr(2, 5); if (Math.random() < 0.5) sfx.horn(car.pos); }
  }
  const ax = Math.floor(car.pos.x + fx * 2.8), az = Math.floor(car.pos.z + fz * 2.8);
  if (solidAt(ax, G, az)) want = 0;
  car.speed += clamp(want - car.speed, -22 * dt, 7 * dt);
  car.t += car.speed * dt;
  if (car.t >= 24) {
    car.t -= 24;
    const prev = car.from, cur = car.to;
    let opts = neighbors(cur).filter(n => !(n[0] === prev[0] && n[1] === prev[1]));
    if (!opts.length) opts = [prev];
    const straight = opts.find(n => n[0] - cur[0] === cur[0] - prev[0] && n[1] - cur[1] === cur[1] - prev[1]);
    car.from = cur; car.to = straight && Math.random() < 0.55 ? straight : mpick(opts);
  }
  const np = trafficLogical(car);
  const k = 1 - Math.exp(-7 * dt);
  car.pos.x = lerp(car.pos.x, np.x, k); car.pos.z = lerp(car.pos.z, np.z, k);
  car.heading = lerpAng(car.heading, np.h, k);
}

function updatePolice(car, dt) {
  const tp = player.inCar ? player.inCar.pos : player.pos;
  const dx = tp.x - car.pos.x, dz = tp.z - car.pos.z, dist = Math.hypot(dx, dz);
  let tx, tz;
  if (dist < 24) { tx = tp.x; tz = tp.z; car.wp = null; }
  else {
    if (!car.wp) car.wp = nearestNode(car.pos.x, car.pos.z);
    let p = nodePos(car.wp);
    if (Math.hypot(p.x - car.pos.x, p.z - car.pos.z) < 5) {
      let bestN = car.wp, bd = 1e9;
      for (const n of neighbors(car.wp)) { const q = nodePos(n); const d = Math.hypot(q.x - tp.x, q.z - tp.z); if (d < bd) { bd = d; bestN = n; } }
      car.wp = bestN; p = nodePos(car.wp);
    }
    tx = p.x; tz = p.z;
  }
  const desired = Math.atan2(tx - car.pos.x, tz - car.pos.z);
  const diff = angDiff(car.heading, desired);
  let throttle = 1, steer = clamp(diff * 2.5, -1, 1);
  const close = dist < 6 + Math.max(0, car.speed) * 0.75 && !player.inCar;
  if (close) throttle = car.speed > 1 ? -1 : 0;
  else if (Math.abs(diff) > 1.3 && car.speed > 8) throttle = -0.6;
  if (car.rev > 0) { car.rev -= dt; throttle = -1; steer = -steer; }
  const imp = driveCar(car, throttle, steer, false, dt);
  if (imp > 0 || (Math.abs(car.speed) < 0.5 && throttle > 0)) car.stuck += dt; else car.stuck = Math.max(0, car.stuck - dt);
  if (car.stuck > 0.6) { car.stuck = 0; car.rev = 0.9; }
  car.chk = (car.chk || 0) + dt;
  if (car.chk > 1.3) {
    const moved = car.lx === undefined ? 99 : Math.hypot(car.pos.x - car.lx, car.pos.z - car.lz);
    car.chk = 0; car.lx = car.pos.x; car.lz = car.pos.z;
    if (moved < 2.5 && !close && car.rev <= 0) car.rev = mr(0.8, 1.3);
  }
  // shooting
  if (stars >= 2 && dist < 18 && deadTimer <= 0) {
    car.shootCD -= dt;
    if (car.shootCD <= 0) {
      car.shootCD = mr(0.5, 1.1);
      sfx.shot(car.pos);
      if (Math.random() < 0.55) hurt((player.inCar ? 2.5 : 5) + stars);
      spawnParticles(car.pos.x, G + 1.4, car.pos.z, '#ffdd55', 3, 2);
    }
  }
}

// ---------- pedestrians
const SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#ecf0f1', '#34495e', '#ff79c6', '#d35400'];
const PANTS = ['#2c3e50', '#34495e', '#1f3a60', '#4a3b2a', '#222222', '#6d6d6d'];
const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
const HAIRS = ['#1b1209', '#3b2412', '#d9b26b', '#6b3b1a', '#111111', '#a33'];
function ringCorners(i, j) {
  const ax = OFF + 24 * i + 8, bx = OFF + 24 * i + 23, az = OFF + 24 * j + 8, bz = OFF + 24 * j + 23;
  return [[ax, az], [bx, az], [bx, bz], [ax, bz]];
}
function placePed(p, farFrom) {
  for (let t = 0; t < 20; t++) {
    p.i = Math.floor(Math.random() * 7); p.j = Math.floor(Math.random() * 7);
    const c = ringCorners(p.i, p.j)[0];
    if (!farFrom || Math.hypot(c[0] - farFrom.x, c[1] - farFrom.z) > 40) break;
  }
  p.k = Math.floor(Math.random() * 4); p.t = Math.random() * 15; p.dir = Math.random() < 0.5 ? 1 : -1;
  p.base = mr(1.2, 1.9); p.state = 'walk'; p.timer = 0; p.side = mr(-0.6, 0.6);
  p.h.g.rotation.x = 0; p.h.g.visible = true;
}
function addPed() {
  const p = { h: makeHuman({ shirt: mpick(SHIRTS), pants: mpick(PANTS), skin: mpick(SKINS), hair: mpick(HAIRS), cap: Math.random() < 0.25 ? mpick(SHIRTS) : null }), pos: new THREE.Vector3(), vel: new THREE.Vector3(), scared: 0 };
  placePed(p); peds.push(p); return p;
}
function knockPed(p, vx, vy, vz) {
  if (p.state === 'down') return;
  p.state = 'down'; p.timer = 0; p.vel.set(vx, vy, vz);
  sfx.hit();
  if (Math.random() < 0.6) addPickup(p.pos.x, p.pos.z, Math.round(mr(20, 150)));
}
function updatePed(p, dt) {
  if (p.state === 'down') {
    p.timer += dt;
    p.vel.y -= 25 * dt;
    p.pos.addScaledVector(p.vel, dt);
    if (p.pos.y <= G + 0.15) { p.pos.y = G + 0.15; p.vel.multiplyScalar(Math.max(0, 1 - 6 * dt)); p.vel.y = 0; }
    p.h.g.rotation.x = lerp(p.h.g.rotation.x, -Math.PI / 2, 1 - Math.exp(-10 * dt));
    p.h.g.position.copy(p.pos);
    if (p.timer > 9) placePed(p, player.pos);
    return;
  }
  const tp = player.inCar ? player.inCar.pos : player.pos;
  const dpl = Math.hypot(tp.x - p.pos.x, tp.z - p.pos.z);
  if ((stars > 0 && dpl < 12) || (player.inCar && player.inCar.speed > 10 && dpl < 8)) p.scared = 3;
  p.scared -= dt;
  const sp = p.scared > 0 ? 4.6 : p.base;
  if (Math.random() < 0.002) p.dir = -p.dir;
  p.t += sp * dt;
  if (p.t >= 15) { p.t -= 15; p.k = (p.k + p.dir + 4) % 4; }
  const c = ringCorners(p.i, p.j);
  const a = c[p.k], b = c[(p.k + p.dir + 4) % 4];
  const f = p.t / 15;
  const dx = Math.sign(b[0] - a[0]), dz = Math.sign(b[1] - a[1]);
  p.pos.set(lerp(a[0], b[0], f) - dz * p.side, G, lerp(a[1], b[1], f) + dx * p.side);
  p.h.g.position.copy(p.pos);
  p.h.g.rotation.y = lerpAng(p.h.g.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-10 * dt));
  animHuman(p.h, sp, dt);
}

// ---------- pickups
const cashTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'); x.fillStyle = '#2f9e44'; x.fillRect(0, 0, 32, 32);
  x.fillStyle = '#b8f5b0'; x.fillRect(2, 2, 28, 28); x.fillStyle = '#2f9e44'; x.fillRect(4, 4, 24, 24);
  x.fillStyle = '#e9ffe6'; x.font = 'bold 22px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('$', 16, 17);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const cashMat = new THREE.MeshBasicMaterial({ map: cashTex });
function addPickup(x, z, value) {
  const m = new THREE.Mesh(boxGeo(0.6, 0.6, 0.6), cashMat);
  m.position.set(x, G + 0.7, z); scene.add(m);
  pickups.push({ m, x, z, value, t: Math.random() * 6 });
}
function randomSidewalkPickup() {
  const i = Math.floor(Math.random() * 7), j = Math.floor(Math.random() * 7);
  const c = ringCorners(i, j), k = Math.floor(Math.random() * 4);
  const a = c[k], b = c[(k + 1) % 4], f = Math.random();
  addPickup(lerp(a[0], b[0], f), lerp(a[1], b[1], f), Math.round(mr(1, 5)) * 100);
}

// ---------- particles
const PMAX = isTouch ? 160 : 320;
const partIM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), new THREE.MeshLambertMaterial(), PMAX);
partIM.setColorAt(0, new THREE.Color()); partIM.count = 0; partIM.frustumCulled = false; scene.add(partIM);
const flashes = [];
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function spawnParticles(x, y, z, color, n, spd = 4, grav = 20) {
  for (let i = 0; i < n; i++) {
    let p = particles.find(p => p.life <= 0);
    if (!p) { if (particles.length >= PMAX) return; p = { pos: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, rx: 0, ry: 0, c: null }; particles.push(p); }
    p.c = colorOf(color);
    p.pos.set(x + mr(-0.3, 0.3), y + mr(-0.3, 0.3), z + mr(-0.3, 0.3));
    p.v.set(mr(-1, 1) * spd, mr(0.5, 1.5) * spd, mr(-1, 1) * spd);
    p.life = mr(0.5, 1.1); p.g = grav;
    if (grav < 0) { p.v.set(mr(-0.5, 0.5), mr(1, 2), mr(-0.5, 0.5)); p.life = mr(1, 1.8); }
  }
}
function updateParticles(dt) {
  let n = 0;
  for (const p of particles) {
    if (p.life <= 0) continue;
    p.life -= dt; p.v.y -= p.g * dt; p.pos.addScaledVector(p.v, dt);
    if (p.pos.y < G + 0.1) { p.pos.y = G + 0.1; p.v.multiplyScalar(0.5); }
    p.rx += dt * 5; p.ry += dt * 4;
    if (p.life <= 0) continue;
    _q.setFromEuler(_e.set(p.rx, p.ry, 0));
    _s.setScalar(p.g < 0 ? 1.6 + (1.8 - p.life) : 1);
    partIM.setMatrixAt(n, _m4.compose(p.pos, _q, _s));
    partIM.setColorAt(n, p.c);
    n++;
  }
  partIM.count = n;
  partIM.instanceMatrix.needsUpdate = true;
  if (partIM.instanceColor) partIM.instanceColor.needsUpdate = true;
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i]; f.life -= dt;
    f.m.scale.setScalar(1 + (0.4 - f.life) * 18); f.m.material.opacity = Math.max(0, f.life * 2);
    if (f.life <= 0) { scene.remove(f.m); f.m.material.dispose(); flashes.splice(i, 1); }
  }
}
const flashGeo = new THREE.SphereGeometry(1, 10, 6);
function addFlash(x, y, z, color) {
  const m = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  m.position.set(x, y, z); scene.add(m); flashes.push({ m, life: 0.4 });
}

// ------------------------------------------------------------
//  Audio (all synthesized with WebAudio)
// ------------------------------------------------------------
let AC = null, master = null, noiseBuf = null, radioGain = null, sirenGain = null, sirenOsc = null, radioOn = true;
function initAudio() {
  if (AC) return;
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  master = AC.createGain(); master.gain.value = 0.6; master.connect(AC.destination);
  noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  radioGain = AC.createGain(); radioGain.gain.value = 0; radioGain.connect(master);
  sirenGain = AC.createGain(); sirenGain.gain.value = 0; sirenGain.connect(master);
  sirenOsc = AC.createOscillator(); sirenOsc.type = 'sawtooth'; sirenOsc.frequency.value = 700;
  const sf = AC.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 1800;
  sirenOsc.connect(sf); sf.connect(sirenGain); sirenOsc.start();
  startRadio();
}
function distVol(pos, max = 60) {
  if (!pos) return 1;
  const tp = player.inCar ? player.inCar.pos : player.pos;
  return clamp(1 - Math.hypot(pos.x - tp.x, pos.z - tp.z) / max, 0, 1);
}
function noise(t0, dur, vol, freq, type = 'lowpass', out = master) {
  const s = AC.createBufferSource(); s.buffer = noiseBuf;
  const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(out); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
}
function tone(t0, dur, freq, vol, type = 'square', out = master, slide = 0) {
  const o = AC.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
}
const sfx = {
  brk() { if (!AC) return; const t = AC.currentTime; noise(t, 0.18, 0.5, 1400); tone(t, 0.08, 180, 0.15, 'square', master, 90); },
  place() { if (!AC) return; const t = AC.currentTime; noise(t, 0.08, 0.35, 900); },
  cash() { if (!AC) return; const t = AC.currentTime; tone(t, 0.08, 988, 0.15); tone(t + 0.08, 0.25, 1319, 0.15); },
  hit() { if (!AC) return; const t = AC.currentTime; noise(t, 0.15, 0.6, 600); tone(t, 0.12, 140, 0.3, 'sine', master, 60); },
  shot(pos) { if (!AC) return; const v = distVol(pos, 50); if (v <= 0) return; const t = AC.currentTime; noise(t, 0.12, 0.7 * v, 3000); },
  boom() { if (!AC) return; const t = AC.currentTime; noise(t, 1.4, 1.2, 500); tone(t, 0.8, 90, 0.6, 'sine', master, 30); },
  horn(pos) { if (!AC) return; const v = distVol(pos, 40); if (v <= 0) return; const t = AC.currentTime; tone(t, 0.35, 392, 0.12 * v, 'square'); tone(t, 0.35, 494, 0.1 * v, 'square'); },
  crash() { if (!AC) return; const t = AC.currentTime; noise(t, 0.4, 0.8, 900); tone(t, 0.2, 110, 0.3, 'square', master, 50); },
  star() { if (!AC) return; const t = AC.currentTime; tone(t, 0.15, 660, 0.12, 'triangle'); tone(t + 0.15, 0.3, 440, 0.12, 'triangle'); },
  fuse() { if (!AC) return; const t = AC.currentTime; noise(t, 0.6, 0.3, 4000, 'highpass'); },
};
// --- simple procedural radio station (lo-fi hip hop loop)
let radioNext = 0, radioStep = 0;
const BPM = 92, STEP = 60 / BPM / 4;
const CHORDS = [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]];
const BASS = [45, 41, 43, 40];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function startRadio() { radioNext = AC.currentTime + 0.1; radioStep = 0; }
function scheduleRadio() {
  if (!AC) return;
  while (radioNext < AC.currentTime + 0.25) {
    const s = radioStep % 64, bar = Math.floor(s / 16), t = radioNext, st = s % 16;
    if (st === 0 || st === 10) { tone(t, 0.35, 120, 0.9, 'sine', radioGain, 40); }
    if (st === 4 || st === 12) { noise(t, 0.18, 0.5, 2200, 'bandpass', radioGain); }
    if (st % 2 === 0) noise(t, 0.04, st % 4 === 2 ? 0.18 : 0.1, 8000, 'highpass', radioGain);
    if (st === 0 || st === 3 || st === 8 || st === 11 || st === 14) tone(t, STEP * 2.5, mtof(BASS[bar] - (st === 14 ? -7 : 0)), 0.35, 'triangle', radioGain);
    if (st === 0 || st === 7) for (const n of CHORDS[bar]) tone(t, STEP * 7, mtof(n), 0.05, 'sawtooth', radioGain);
    if (st === 2 || st === 6 || st === 13) { const n = CHORDS[bar][(radioStep * 7) % 4] + 12; tone(t, STEP * 2, mtof(n), 0.06, 'square', radioGain); }
    radioNext += STEP; radioStep++;
  }
}

// ------------------------------------------------------------
//  World editing
// ------------------------------------------------------------
function setBlock(x, y, z, b) {
  put(x, y, z, b);
  markDirty(x, z);
  mapPixel(x, z);
}
function raycast(o, d, maxDist) {
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
  const tdx = sx ? Math.abs(1 / d.x) : Infinity, tdy = sy ? Math.abs(1 / d.y) : Infinity, tdz = sz ? Math.abs(1 / d.z) : Infinity;
  let tx = sx > 0 ? (x + 1 - o.x) * tdx : sx < 0 ? (o.x - x) * tdx : Infinity;
  let ty = sy > 0 ? (y + 1 - o.y) * tdy : sy < 0 ? (o.y - y) * tdy : Infinity;
  let tz = sz > 0 ? (z + 1 - o.z) * tdz : sz < 0 ? (o.z - z) * tdz : Infinity;
  let n = [0, 0, 0], t = 0;
  for (let i = 0; i < 300; i++) {
    const b = get(x, y, z);
    if (b && b !== B.WATER) return { x, y, z, n, t, b };
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; n = [-sx, 0, 0]; }
    else if (ty < tz) { y += sy; t = ty; ty += tdy; n = [0, -sy, 0]; }
    else { z += sz; t = tz; tz += tdz; n = [0, 0, -sz]; }
    if (t > maxDist) return null;
  }
  return null;
}

function addHeat(v, msg) {
  const before = stars;
  heat = Math.min(60, heat + v);
  evadeTimer = 0;
  updateStars();
  if (stars > before) { sfx.star(); if (msg) toast(msg, '#ff6b6b'); }
}
function updateStars() {
  const th = [0.5, 6, 14, 25, 40];
  let s = 0; for (const t of th) if (heat >= t) s++;
  stars = s;
}

function igniteTNT(x, y, z, fuse = 2.5) {
  setBlock(x, y, z, 0);
  const m = new THREE.Mesh(boxGeo(1, 1, 1), new THREE.MeshLambertMaterial({ color: '#d2402f' }));
  m.position.set(x + 0.5, y + 0.5, z + 0.5); scene.add(m);
  tnts.push({ m, x, y, z, timer: fuse });
  sfx.fuse();
}
function explode(cx, cy, cz, r) {
  sfx.boom(); camShake = 0.8;
  addFlash(cx + 0.5, cy + 0.5, cz + 0.5, '#ffb347');
  const R2 = Math.ceil(r);
  let thrown = 0;
  blastDebris(cx + 0.5, cy + 0.5, cz + 0.5, r + 5, 30);
  for (let x = cx - R2; x <= cx + R2; x++) for (let y = Math.max(1, cy - R2); y <= cy + R2; y++) for (let z = cz - R2; z <= cz + R2; z++) {
    const d = Math.hypot(x - cx, y - cy, z - cz);
    if (d > r + Math.random() * 0.6) continue;
    const b = get(x, y, z);
    if (!b) continue;
    if (b === B.TNT) { igniteTNT(x, y, z, mr(0.3, 0.7)); continue; }
    put(x, y, z, 0); placed.delete(idx(x, y, z));
    if (y >= G - 1 && thrown < (isTouch ? 10 : 24) && Math.random() < 0.5) {
      thrown++;
      const dx = x - cx, dy = y - cy + 1.5, dz = z - cz, l = Math.hypot(dx, dy, dz) || 1, f = 14 / (0.6 + l * 0.5);
      blockDebris(x, y, z, b, 0.7, { x: dx / l * f, y: Math.abs(dy / l) * f + 4, z: dz / l * f });
    }
  }
  for (let x = cx - R2 - 1; x <= cx + R2 + 1; x += 1) for (let z = cz - R2 - 1; z <= cz + R2 + 1; z += 1) {
    if (x >= 0 && z >= 0 && x < W && z < D) { markDirty(x, z); mapPixel(x, z); }
  }
  spawnParticles(cx + 0.5, cy + 0.5, cz + 0.5, '#ff8c1a', 18, 9);
  spawnParticles(cx + 0.5, cy + 0.5, cz + 0.5, '#555555', 14, 6);
  const ex = cx + 0.5, ez = cz + 0.5;
  for (const p of peds) {
    const d = Math.hypot(p.pos.x - ex, p.pos.z - ez);
    if (d < r + 4) knockPed(p, (p.pos.x - ex) * 3, 9, (p.pos.z - ez) * 3);
  }
  for (const c of cars) {
    const d = Math.hypot(c.pos.x - ex, c.pos.z - ez);
    if (d < r + 4 && c.ai !== 'traffic') c.speed = -8;
    if (d < r + 4 && c.ai === 'traffic') c.bump = 4;
    if (d < r + 4) damageCar(c, (r + 4 - d) * 22);
  }
  const tp = player.inCar ? player.inCar.pos : player.pos;
  const pd = Math.hypot(tp.x - ex, (player.inCar ? G : player.pos.y) - cy, tp.z - ez);
  if (pd < r + 4) {
    hurt((r + 4 - pd) * (player.inCar ? 6 : 12));
    if (!player.inCar) { player.vel.x += (tp.x - ex) * 2; player.vel.y = 9; player.vel.z += (tp.z - ez) * 2; }
  }
  addHeat(5, 'БАБАХ! Полиция в пути');
}

function hurt(v) {
  if (deadTimer > 0) return;
  player.health -= v; player.hurtFlash = 0.3;
  if (player.health <= 0) { player.health = 0; die('ПОТРАЧЕНО', '#e03131'); }
}
function die(text, color) {
  deadTimer = 3.5; bigText(text, color, 3.2);
  canvas.style.filter = 'grayscale(1) brightness(.8)';
}
function respawn() {
  canvas.style.filter = '';
  if (player.inCar) exitCar(true);
  player.pos.set(SPAWN.x, G, SPAWN.z); player.vel.set(0, 0, 0);
  player.health = 100; player.money = Math.floor(player.money * 0.9);
  heat = 0; updateStars(); bustTimer = 0;
  for (const c of [...cars]) if (c.kind === 'police') removeCar(c);
  toast('Ты снова в строю. −10% денег', '#fff');
}

// ------------------------------------------------------------
//  Actions
// ------------------------------------------------------------
const aimRay = { o: new THREE.Vector3(), d: new THREE.Vector3() };
function currentAim() {
  camera.getWorldDirection(aimRay.d);
  aimRay.o.copy(camera.position);
  const head = new THREE.Vector3(player.pos.x, player.pos.y + 1.6, player.pos.z);
  const hit = raycast(aimRay.o, aimRay.d, camDist + 6.5);
  if (!hit) return null;
  const c = new THREE.Vector3(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  if (c.distanceTo(head) > 7) return null;
  return hit;
}
function actionPrimary() {
  if (player.inCar || deadTimer > 0) return;
  // punch first
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  for (const p of peds) {
    if (p.state === 'down') continue;
    const dx = p.pos.x - player.pos.x, dz = p.pos.z - player.pos.z, d = Math.hypot(dx, dz);
    if (d < 2.3 && (dx * fx + dz * fz) / (d || 1) > 0.4) {
      knockPed(p, fx * 5, 4, fz * 5); addHeat(1.2, 'Драка! Полиция заметила');
      swing = 0.25; return;
    }
  }
  const hit = currentAim();
  if (!hit) return;
  swing = 0.25;
  const { x, y, z, b } = hit;
  if (y < 1) return;
  if (b === B.TNT) { igniteTNT(x, y, z); toast('Динамит подожжён! Беги!', '#ffb347'); return; }
  const wasPlaced = placed.has(idx(x, y, z));
  setBlock(x, y, z, 0); placed.delete(idx(x, y, z));
  spawnParticles(x + 0.5, y + 0.5, z + 0.5, BL[b].c, 7, 3);
  if (b === B.LOG) fellTree(x, y, z, -Math.sin(yaw), -Math.cos(yaw), 2);
  sfx.brk();
  if (!wasPlaced && b === B.GOLD) { addMoney(250); addHeat(1.6, 'Ограбление банка!'); }
  if (!wasPlaced && b === B.DIAM) { addMoney(1000); addHeat(2.5, 'Украл алмаз!'); }
}
function actionSecondary() {
  if (player.inCar || deadTimer > 0) return;
  const hit = currentAim();
  if (!hit) return;
  const x = hit.x + hit.n[0], y = hit.y + hit.n[1], z = hit.z + hit.n[2];
  if (y < 1 || y >= H || x < 0 || z < 0 || x >= W || z >= D) return;
  const cur = get(x, y, z);
  if (cur && cur !== B.WATER) return;
  const p = player.pos, hw = 0.3;
  if (x + 1 > p.x - hw && x < p.x + hw && z + 1 > p.z - hw && z < p.z + hw && y + 1 > p.y && y < p.y + 1.8) return;
  for (const c of cars) if (Math.hypot(c.pos.x - (x + 0.5), c.pos.z - (z + 0.5)) < 2.3 && y < G + 2) return;
  const b = HOTBAR[selected];
  setBlock(x, y, z, b); placed.add(idx(x, y, z));
  sfx.place(); swing = 0.2;
}
let swing = 0;

function nearestCar(maxD) {
  let best = null, bd = maxD;
  for (const c of cars) {
    const d = Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function enterCar() {
  if (deadTimer > 0) return;
  const c = nearestCar(3.6);
  if (!c) return;
  if (c.ai === 'traffic') { addHeat(1, 'Угон! Полиция заметила'); spawnParticles(c.pos.x, G + 1, c.pos.z, '#ffffff', 4, 2); }
  else if (c.kind === 'police') addHeat(6, 'Угнал полицейскую машину!');
  else toast(c.kind === 'sport' ? 'Спорткар! Жми на газ' : 'Поехали!', '#fff');
  c.ai = 'player'; c.wp = null;
  player.inCar = c; human.g.visible = false;
  yaw = c.heading + Math.PI; lastMouse = -10;
  if (AC && radioOn) $('#radio').textContent = '📻 Блок FM — лоу-фай хип-хоп';
}
function exitCar(force) {
  const c = player.inCar; if (!c) return;
  if (!force && Math.abs(c.speed) > 6) return;
  const s = Math.sin(c.heading), co = Math.cos(c.heading);
  const opts = [[-co * 1.9, s * 1.9], [co * 1.9, -s * 1.9], [s * 3.2, co * 3.2], [-s * 3.2, -co * 3.2], [0, 0]];
  for (const [dx, dz] of opts) {
    player.pos.set(c.pos.x + dx, G, c.pos.z + dz);
    if (!boxHits(player.pos)) break;
    if (dx === 0) player.pos.y = G + 2;
  }
  c.ai = 'parked'; c.speed = 0;
  player.inCar = null; human.g.visible = !firstPerson;
  player.vel.set(0, 0, 0);
}

function addMoney(v) {
  player.money += v; sfx.cash();
  toast('+$' + v, '#6dd36a');
  if (player.money > best) { best = player.money; try { localStorage.setItem('blockcity-best', best); } catch (e) { } }
}

// ------------------------------------------------------------
//  Player physics
// ------------------------------------------------------------
const HW = 0.3, PH = 1.8;
function boxHits(p) {
  const x0 = Math.floor(p.x - HW), x1 = Math.floor(p.x + HW - 1e-4);
  const y0 = Math.floor(p.y), y1 = Math.floor(p.y + PH - 1e-4);
  const z0 = Math.floor(p.z - HW), z1 = Math.floor(p.z + HW - 1e-4);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (solidAt(x, y, z)) return true;
  return false;
}
function moveAxis(axis, d) {
  if (!d) return false;
  const p = player.pos;
  p[axis] += d;
  if (!boxHits(p)) return false;
  if (axis === 'y') {
    if (d < 0) { p.y = Math.floor(p.y) + 1; player.onGround = true; }
    else p.y = Math.floor(p.y + PH) - PH - 0.001;
    if (boxHits(p)) p.y -= d;
    player.vel.y = 0;
  } else {
    const h = axis === 'x' ? 'x' : 'z';
    if (d > 0) p[h] = Math.floor(p[h] + HW) - HW - 0.001; else p[h] = Math.floor(p[h] - HW) + 1 + HW + 0.001;
    if (boxHits(p)) p[h] -= d;
    player.vel[axis] = 0;
  }
  return true;
}
const input = { fwd: 0, side: 0, jump: false, sprint: false };
function readInput() {
  let f = 0, s = 0;
  if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1;
  if (keys.KeyD || keys.ArrowRight) s += 1; if (keys.KeyA || keys.ArrowLeft) s -= 1;
  if (joy.active) { f = -joy.y; s = joy.x; }
  input.fwd = f; input.side = s;
  input.jump = !!keys.Space || touchJump;
  input.sprint = !!keys.ShiftLeft || !!keys.ShiftRight || (joy.active && Math.hypot(joy.x, joy.y) > 0.92);
}
function updateFoot(dt) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  let mx = fx * input.fwd + rx * input.side, mz = fz * input.fwd + rz * input.side;
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  const inWater = get(Math.floor(player.pos.x), Math.floor(player.pos.y + 0.5), Math.floor(player.pos.z)) === B.WATER;
  const sp = (input.sprint ? 8.5 : 5.2) * (inWater ? 0.5 : 1);
  const k = 1 - Math.exp(-(player.onGround ? 14 : 4) * dt);
  player.vel.x = lerp(player.vel.x, mx * sp, k);
  player.vel.z = lerp(player.vel.z, mz * sp, k);
  player.vel.y -= 26 * dt;
  if (inWater) { player.vel.y = Math.max(player.vel.y, -3); if (input.jump) player.vel.y = 4; }
  else if (input.jump && player.onGround) player.vel.y = 8.4;
  player.vel.y = Math.max(player.vel.y, -40);
  player.onGround = false;
  moveAxis('x', player.vel.x * dt);
  moveAxis('z', player.vel.z * dt);
  moveAxis('y', player.vel.y * dt);
  // bump against cars
  for (const c of cars) {
    const dx = player.pos.x - c.pos.x, dz = player.pos.z - c.pos.z;
    const s = Math.sin(c.heading), co = Math.cos(c.heading);
    const lx = co * dx - s * dz, lz = s * dx + co * dz;
    if (Math.abs(lx) < 1.3 && Math.abs(lz) < 2.4 && player.pos.y < G + 1.7) {
      if (Math.abs(c.speed) > 5 && c.ai !== 'parked') {
        hurt(Math.abs(c.speed) * 1.2);
        player.vel.set(Math.sin(c.heading) * c.speed * 0.8, 7, Math.cos(c.heading) * c.speed * 0.8);
        sfx.hit();
      }
      const px = 1.3 - Math.abs(lx), pz = 2.4 - Math.abs(lz);
      let nlx = lx, nlz = lz;
      if (px < pz) nlx = Math.sign(lx || 1) * 1.31; else nlz = Math.sign(lz || 1) * 2.41;
      const nx = c.pos.x + co * nlx + s * nlz, nzz = c.pos.z - s * nlx + co * nlz;
      const old = player.pos.clone();
      player.pos.x = nx; player.pos.z = nzz;
      if (boxHits(player.pos)) player.pos.copy(old);
    }
  }
  const moving = Math.hypot(player.vel.x, player.vel.z);
  if (moving > 0.5) player.facing = lerpAng(player.facing, Math.atan2(player.vel.x, player.vel.z), 1 - Math.exp(-12 * dt));
  if (player.pos.y < -10) { player.pos.set(SPAWN.x, G + 1, SPAWN.z); player.vel.set(0, 0, 0); }
  human.g.position.copy(player.pos);
  human.g.rotation.y = player.facing;
  animHuman(human, player.onGround ? moving : 0, dt);
  if (swing > 0) { swing -= dt; human.armR.rotation.x = -1.6 + swing * 4; }
}

function updatePlayerCar(dt) {
  const c = player.inCar;
  const imp = driveCar(c, input.fwd, -input.side, !!keys.Space || touchJump, dt);
  if (imp > 9) { sfx.crash(); camShake = Math.min(0.6, imp / 40); spawnParticles(c.pos.x + Math.sin(c.heading) * 2.2, G + 0.8, c.pos.z + Math.cos(c.heading) * 2.2, '#cccccc', 5, 3); }
  player.pos.set(c.pos.x, G, c.pos.z);
  // hit pedestrians
  const s = Math.sin(c.heading), co = Math.cos(c.heading);
  for (const p of peds) {
    if (p.state === 'down') continue;
    const dx = p.pos.x - c.pos.x, dz = p.pos.z - c.pos.z;
    const lx = co * dx - s * dz, lz = s * dx + co * dz;
    if (Math.abs(lx) < 1.35 && Math.abs(lz) < 2.5 && Math.abs(c.speed) > 3) {
      knockPed(p, s * c.speed * 0.7 + dx, 6 + Math.abs(c.speed) * 0.2, co * c.speed * 0.7 + dz);
      addHeat(2, 'Сбил прохожего! Полиция заметила');
    }
  }
}

function carCollisions(dt) {
  for (let a = 0; a < cars.length; a++) {
    const A = cars[a];
    const dynA = A.ai === 'player' || A.kind === 'police';
    for (let b = a + 1; b < cars.length; b++) {
      const Bc = cars[b];
      const dynB = Bc.ai === 'player' || Bc.kind === 'police';
      if (!dynA && !dynB) continue;
      const dx = Bc.pos.x - A.pos.x, dz = Bc.pos.z - A.pos.z, d = Math.hypot(dx, dz);
      if (d > 3.3 || d < 1e-3) continue;
      const push = (3.3 - d) / d;
      const rel = Math.abs(A.speed - Bc.speed);
      if (dynA && dynB) { A.pos.x -= dx * push * 0.5; A.pos.z -= dz * push * 0.5; Bc.pos.x += dx * push * 0.5; Bc.pos.z += dz * push * 0.5; }
      else if (dynA) { A.pos.x -= dx * push; A.pos.z -= dz * push; }
      else { Bc.pos.x += dx * push; Bc.pos.z += dz * push; }
      if (rel > 6) {
        const hitDmg = (rel - 5) * 2.6;
        damageCar(A, hitDmg * (A.kind === 'police' ? 0.6 : 1)); damageCar(Bc, hitDmg * (Bc.kind === 'police' ? 0.6 : 1));
        if (A.ai === 'player' || Bc.ai === 'player') {
          sfx.crash(); camShake = 0.3;
          const other = A.ai === 'player' ? Bc : A;
          if (other.kind === 'police' && other.ai !== 'parked') addHeat(2, 'Таран полиции!');
        }
        A.speed *= 0.4; Bc.speed *= 0.4;
      }
      if (A.ai === 'traffic') A.bump = 2; if (Bc.ai === 'traffic') Bc.bump = 2;
    }
  }
}

// ------------------------------------------------------------
//  Police management
// ------------------------------------------------------------
let policeSpawnCD = 0;
function managePolice(dt) {
  const police = cars.filter(c => c.kind === 'police' && c.ai === 'police');
  const tp = player.inCar ? player.inCar.pos : player.pos;
  seen = false;
  for (const c of police) if (Math.hypot(c.pos.x - tp.x, c.pos.z - tp.z) < 38) seen = true;
  if (stars > 0) {
    if (seen) evadeTimer = 0; else evadeTimer += dt;
    if (evadeTimer > 4) { heat -= dt * 2.2; if (heat < 0) heat = 0; const s = stars; updateStars(); if (stars < s && stars === 0) toast('Ты ушёл от погони!', '#6dd36a'); }
  }
  const want = [0, 1, 2, 3, 5, 7][stars];
  policeSpawnCD -= dt;
  if (police.length < want && policeSpawnCD <= 0) {
    policeSpawnCD = 2.5;
    for (let t = 0; t < 30; t++) {
      const n = [Math.floor(Math.random() * 8), Math.floor(Math.random() * 8)];
      const p = nodePos(n), d = Math.hypot(p.x - tp.x, p.z - tp.z);
      if (d < 45 || d > 90) continue;
      const car = addCar('police', p.x, p.z, Math.atan2(tp.x - p.x, tp.z - p.z));
      car.ai = 'police'; car.wp = n;
      break;
    }
  }
  if (stars === 0) {
    for (const c of police) if (Math.hypot(c.pos.x - tp.x, c.pos.z - tp.z) > 30 || Math.random() < dt * 0.2) removeCar(c);
  } else if (police.length > want + 1) removeCar(police[0]);
  // busted
  if (!player.inCar && stars > 0 && deadTimer <= 0) {
    let near = false;
    for (const c of police) if (Math.hypot(c.pos.x - tp.x, c.pos.z - tp.z) < 7.5) near = true;
    bustTimer = near ? bustTimer + dt : Math.max(0, bustTimer - dt);
    if (near && bustTimer > 0 && bustTimer < dt * 1.5) toast('Полиция: «Стоять! Руки вверх!»', '#4dabf7');
    if (bustTimer > 2.2) { bustTimer = 0; die('АРЕСТОВАН', '#4dabf7'); }
  }
  // lights + siren
  const flash = Math.floor(gameTime * 6) % 2;
  let nearest = 1e9;
  for (const c of cars) if (c.kind === 'police' && c.model.bar) {
    const on = c.ai === 'police';
    c.model.bar[0].material = on && flash ? lightRed : on ? lightOff : lightOff;
    c.model.bar[1].material = on && !flash ? lightBlue : lightOff;
    if (on) nearest = Math.min(nearest, Math.hypot(c.pos.x - tp.x, c.pos.z - tp.z));
  }
  if (AC) {
    const v = nearest < 80 ? 0.09 * (1 - nearest / 80) : 0;
    sirenGain.gain.setTargetAtTime(v, AC.currentTime, 0.1);
    sirenOsc.frequency.setTargetAtTime(gameTime % 1.2 < 0.6 ? 950 : 650, AC.currentTime, 0.12);
  }
}

// ------------------------------------------------------------
//  Camera
// ------------------------------------------------------------
let camDist = 4.5;
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  let dist, tgt;
  if (player.inCar) {
    const c = player.inCar;
    if (gameTime - lastMouse > 1.2) { yaw = lerpAng(yaw, c.heading + Math.PI, 1 - Math.exp(-3 * dt)); pitch = lerp(pitch, -0.22, 1 - Math.exp(-3 * dt)); }
    tgt = camTarget.set(c.pos.x, G + 1.6, c.pos.z);
    dist = firstPerson ? 0 : 8.5;
  } else {
    tgt = camTarget.set(player.pos.x, player.pos.y + 1.62, player.pos.z);
    dist = firstPerson ? 0 : 4.5;
  }
  const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  if (dist > 0) {
    const back = dir.clone().negate();
    const hit = raycast(tgt, back, dist);
    if (hit) dist = Math.max(0.3, hit.t - 0.25);
  }
  camDist = lerp(camDist, dist, dist < camDist ? 1 : 1 - Math.exp(-6 * dt));
  camera.position.copy(tgt).addScaledVector(dir, -camDist);
  if (player.inCar && !firstPerson && camDist < 3.4) {
    // blocked behind the car: look from above instead of ending up inside it
    let up = 7;
    while (up > 2.5 && raycast(tgt, new THREE.Vector3(0, 1, 0), up)) up -= 1;
    camera.position.set(tgt.x - dir.x * 2.5, tgt.y + up, tgt.z - dir.z * 2.5);
    camera.lookAt(tgt.x + dir.x * 3, tgt.y - 1, tgt.z + dir.z * 3);
    human.g.visible = false;
    return;
  }
  if (camShake > 0) { camShake -= dt; camera.position.x += mr(-1, 1) * camShake * 0.4; camera.position.y += mr(-1, 1) * camShake * 0.4; }
  camera.lookAt(tgt.x + dir.x, tgt.y + dir.y, tgt.z + dir.z);
  human.g.visible = !player.inCar && camDist > 0.8;
}

// ------------------------------------------------------------
//  HUD
// ------------------------------------------------------------
let toastT = 0, bigT = 0;
function toast(t, color) { const e = $('#toast'); e.textContent = t; e.style.color = color || '#fff'; e.classList.add('show'); toastT = 2.2; }
function bigText(t, color, dur) { const e = $('#big'); e.textContent = t; e.style.color = color; e.classList.add('show'); bigT = dur; }
const starEls = [...document.querySelectorAll('#stars span')];
let lastHud = '';
function updateHud(dt) {
  if (toastT > 0 && (toastT -= dt) <= 0) $('#toast').classList.remove('show');
  if (bigT > 0 && (bigT -= dt) <= 0) $('#big').classList.remove('show');
  const cb = $('#carbar');
  cb.classList.toggle('hidden', !player.inCar);
  if (player.inCar) { const f = clamp(player.inCar.hp / player.inCar.maxHp, 0, 1); const ch = $('#carhp'); ch.style.width = f * 100 + '%'; ch.style.background = f > 0.5 ? '#4dabf7' : f > 0.25 ? '#f0b429' : '#e03131'; }
  const key = player.money + '|' + stars + '|' + Math.ceil(player.health) + '|' + seen;
  if (key !== lastHud) {
    lastHud = key;
    $('#money').textContent = '$' + String(player.money).padStart(8, '0');
    starEls.forEach((e, i) => e.classList.toggle('on', i < stars));
    $('#stars').classList.toggle('flash', stars > 0 && !seen);
    const hp = $('#hp'); hp.style.width = player.health + '%'; hp.style.background = player.health > 50 ? '#4cc24c' : player.health > 25 ? '#f0b429' : '#e03131';
  }
  // car hint
  const hint = $('#carhint');
  let h = '';
  if (!player.inCar && deadTimer <= 0) { const c = nearestCar(3.6); if (c) h = (isTouch ? '🚗' : 'F') + ' — ' + (c.kind === 'police' ? 'угнать полицейскую машину' : c.ai === 'traffic' ? 'угнать машину' : 'сесть в машину'); }
  else if (player.inCar) h = Math.abs(player.inCar.speed) > 6 ? '' : (isTouch ? '🚗' : 'F') + ' — выйти';
  if (hint.textContent !== h) hint.textContent = h;
  hint.classList.toggle('show', !!h);
  $('#radio').classList.toggle('show', !!player.inCar && radioOn && !!AC);
  $('#crosshair').style.display = player.inCar ? 'none' : '';
  $('#hotbar').style.visibility = player.inCar ? 'hidden' : '';
}
function drawMinimap() {
  const mm = $('#minimap'), ctx = mm.getContext('2d'), S = mm.width;
  const tp = player.inCar ? player.inCar.pos : player.pos;
  ctx.fillStyle = '#1d4f8f'; ctx.fillRect(0, 0, S, S);
  ctx.save();
  ctx.translate(S / 2, S / 2); ctx.rotate(yaw); const sc = 1.6; ctx.scale(sc, sc); ctx.translate(-tp.x, -tp.z);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mapCanvas, 0, 0);
  for (const p of pickups) { ctx.fillStyle = '#4cff6a'; ctx.fillRect(p.x - 1.5, p.z - 1.5, 3, 3); }
  for (const b of bankLabels) { ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(b.x, b.z, 3, 0, 7); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 0.8; ctx.stroke(); }
  const fl = Math.floor(gameTime * 6) % 2;
  for (const c of cars) if (c.kind === 'police' && c.ai === 'police') { ctx.fillStyle = fl ? '#ff3030' : '#3070ff'; ctx.fillRect(c.pos.x - 2.5, c.pos.z - 2.5, 5, 5); }
  ctx.restore();
  // player arrow
  ctx.save(); ctx.translate(S / 2, S / 2);
  const face = player.inCar ? player.inCar.heading : player.facing;
  // arrow rotation relative to map rotation: world dir (sin f, cos f) on map rotated by yaw
  ctx.rotate(yaw - face + Math.PI);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

// hotbar
function buildHotbar() {
  const hb = $('#hotbar'); hb.innerHTML = '';
  HOTBAR.forEach((b, i) => {
    const s = document.createElement('div'); s.className = 'slot' + (i === selected ? ' sel' : '');
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const t = BL[b].t[1];
    c.getContext('2d').drawImage(atlasCanvas, (t % ACOL) * T, Math.floor(t / ACOL) * T, T, T, 0, 0, 16, 16);
    const n = document.createElement('i'); n.textContent = i + 1;
    s.append(c, n); s.title = BL[b].n;
    s.addEventListener('pointerdown', e => { e.stopPropagation(); select(i); });
    hb.append(s);
  });
}
function select(i) {
  selected = (i + HOTBAR.length) % HOTBAR.length;
  document.querySelectorAll('#hotbar .slot').forEach((s, k) => s.classList.toggle('sel', k === selected));
  toast(BL[HOTBAR[selected]].n, '#fff');
}

// ------------------------------------------------------------
//  Input
// ------------------------------------------------------------
const keys = {};
addEventListener('keydown', e => {
  if (!started) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) { keys[e.code] = true; return; }
  keys[e.code] = true;
  if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); if (n >= 1 && n <= 9) select(n - 1); }
  if (e.code === 'KeyF' || e.code === 'Enter') toggleCar();
  if (e.code === 'KeyV') firstPerson = !firstPerson;
  if (e.code === 'KeyH' && player.inCar) sfx.horn(null);
  if (e.code === 'KeyM') { radioOn = !radioOn; toast(radioOn ? 'Радио включено' : 'Радио выключено'); }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
function toggleCar() { if (player.inCar) exitCar(false); else enterCar(); }

let lockFailed = false, dragging = false, dragX = 0, dragY = 0;
document.addEventListener('pointerlockerror', () => { lockFailed = true; paused = false; $('#pause').classList.add('hidden'); });
canvas.addEventListener('mousedown', e => {
  if (!started || isTouch) return;
  if (lockFailed) { dragging = true; dragX = e.clientX; dragY = e.clientY; }
  else if (document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; }
  if (e.button === 0) actionPrimary(); else if (e.button === 2) actionSecondary();
});
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mouseup', () => { dragging = false; });
addEventListener('mousemove', e => {
  if (lockFailed && dragging) {
    yaw -= (e.clientX - dragX) * 0.005; pitch = clamp(pitch - (e.clientY - dragY) * 0.005, -1.45, 1.45);
    dragX = e.clientX; dragY = e.clientY; lastMouse = gameTime; return;
  }
  if (document.pointerLockElement !== canvas) return;
  yaw -= e.movementX * 0.0024; pitch = clamp(pitch - e.movementY * 0.0024, -1.45, 1.45);
  lastMouse = gameTime;
});
addEventListener('wheel', e => { if (started && !player.inCar) select(selected + (e.deltaY > 0 ? 1 : -1)); }, { passive: true });
document.addEventListener('pointerlockchange', () => {
  if (isTouch || !started || lockFailed) return;
  paused = document.pointerLockElement !== canvas;
  $('#pause').classList.toggle('hidden', !paused);
});
$('#pause').addEventListener('click', () => canvas.requestPointerLock());

// touch controls
const joy = { active: false, id: null, x: 0, y: 0, cx: 0, cy: 0 };
let lookId = null, lookX = 0, lookY = 0, touchJump = false;
function setupTouch() {
  $('#touch').classList.remove('hidden');
  const joyEl = $('#joy'), knob = $('#joyknob');
  addEventListener('touchstart', e => {
    for (const t of e.changedTouches) {
      if (t.target.closest && (t.target.closest('.tb') || t.target.closest('#hotbar'))) continue;
      if (t.clientX < innerWidth * 0.42 && !joy.active) {
        joy.active = true; joy.id = t.identifier;
        const r = joyEl.getBoundingClientRect(); joy.cx = r.left + r.width / 2; joy.cy = r.top + r.height / 2;
        moveJoy(t);
      } else if (lookId === null) { lookId = t.identifier; lookX = t.clientX; lookY = t.clientY; }
    }
  }, { passive: true });
  addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) moveJoy(t);
      if (t.identifier === lookId) {
        yaw -= (t.clientX - lookX) * 0.006; pitch = clamp(pitch - (t.clientY - lookY) * 0.006, -1.45, 1.45);
        lookX = t.clientX; lookY = t.clientY; lastMouse = gameTime;
      }
    }
  }, { passive: true });
  const end = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) { joy.active = false; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; }
      if (t.identifier === lookId) lookId = null;
    }
  };
  addEventListener('touchend', end); addEventListener('touchcancel', end);
  function moveJoy(t) {
    let dx = (t.clientX - joy.cx) / 55, dy = (t.clientY - joy.cy) / 55;
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    joy.x = dx; joy.y = dy; knob.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
  }
  const btn = (id, down, up) => {
    const el = $(id);
    el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); down(); }, { passive: false });
    if (up) el.addEventListener('touchend', e => { e.preventDefault(); up(); }, { passive: false });
  };
  btn('#tb-jump', () => touchJump = true, () => touchJump = false);
  btn('#tb-car', toggleCar);
  btn('#tb-break', actionPrimary);
  btn('#tb-place', actionSecondary);
  btn('#tb-view', () => firstPerson = !firstPerson);
}

// ------------------------------------------------------------
//  Setup world entities
// ------------------------------------------------------------
function setupEntities() {
  for (const s of parkedSpots) addCar(Math.random() < 0.5 ? 'sport' : 'sedan', s.x, s.z, s.heading);
  for (let i = 0; i < (isTouch ? 16 : 26); i++) spawnTraffic(player.pos);
  for (let i = 0; i < (isTouch ? 26 : 44); i++) addPed();
  for (let i = 0; i < 26; i++) randomSidewalkPickup();
  for (const b of bankLabels) { const s = textSprite('БАНК', '#ffd34d'); s.position.set(b.x, b.y, b.z); }
  // clouds
  const cl = [];
  for (let i = 0; i < 28; i++) cl.push(bx(R(10, 24), 2.5, R(8, 16), '#ffffff', R(-180, 180), R(68, 78), R(-180, 180)));
  cloudMesh = new THREE.Mesh(mergeBoxes(cl), new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.88, fog: false }));
  cloudMesh.position.set(W / 2, 0, D / 2); scene.add(cloudMesh);
  // block outline
  outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.005, 1.005, 1.005)), new THREE.LineBasicMaterial({ color: '#000000', transparent: true, opacity: 0.6 }));
  scene.add(outline);
}
let cloudMesh = null, outline = null;


// ------------------------------------------------------------
//  Physics (cannon-es): flying blocks, car parts, wrecks
// ------------------------------------------------------------
const phys = new CANNON.World({ gravity: new CANNON.Vec3(0, -24, 0) });
phys.broadphase = new CANNON.SAPBroadphase(phys);
phys.allowSleep = true;
phys.solver.iterations = 6;
phys.defaultContactMaterial.friction = 0.5;
phys.defaultContactMaterial.restitution = 0.15;
const GRP_DEBRIS = 1, GRP_STATIC = 2, GRP_CAR = 4;
const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), collisionFilterGroup: GRP_STATIC, collisionFilterMask: GRP_DEBRIS });
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
groundBody.position.set(0, G, 0);
phys.addBody(groundBody);
const voxShape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
const debris = [];
const MAX_DEBRIS = isTouch ? 45 : 110;
let physFrame = 0, trafficT = 2;

// debris is drawn with instancing: one draw call per block type, one for car parts
const debrisMat = new THREE.MeshLambertMaterial({ map: atlasTex });
const blockGeoCache = new Map();
function blockGeo(b) {
  if (blockGeoCache.has(b)) return blockGeoCache.get(b);
  const g = new THREE.BoxGeometry(1, 1, 1), uv = g.attributes.uv, t = BL[b].t;
  for (let f = 0; f < 6; f++) {
    const [u0, v0, u1, v1] = tileUV(f === 2 ? t[0] : f === 3 ? t[2] : t[1]);
    for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0)); }
  }
  blockGeoCache.set(b, g); return g;
}
const blockIMs = new Map();
function blockIM(b) {
  if (blockIMs.has(b)) return blockIMs.get(b);
  const im = new THREE.InstancedMesh(blockGeo(b), debrisMat, MAX_DEBRIS);
  im.count = 0; im.frustumCulled = false; scene.add(im); blockIMs.set(b, im); return im;
}
const partsIM = new THREE.InstancedMesh(BOX_TPL, new THREE.MeshLambertMaterial(), MAX_DEBRIS);
partsIM.setColorAt(0, new THREE.Color()); partsIM.count = 0; partsIM.frustumCulled = false; scene.add(partsIM);

const voxRange = r => r;
function voxelChanged(x, y, z) {
  const k = idx(x, y, z), v = voxBodies.get(k);
  if (!v || isSolid(world[k])) return;
  phys.removeBody(v.body); voxBodies.delete(k);
  for (const d of debris) if (Math.abs(d.body.position.x - x) < 3 && Math.abs(d.body.position.z - z) < 3) d.body.wakeUp();
}
function ensureVoxelsAround(p, r) {
  // the ground is a single plane; only blocks standing above it get colliders
  const x0 = Math.max(0, Math.floor(p.x - r)), x1 = Math.min(W - 1, Math.floor(p.x + r));
  const y0 = Math.max(G, Math.floor(p.y - r)), y1 = Math.min(H - 1, Math.floor(p.y + r));
  const z0 = Math.max(0, Math.floor(p.z - r)), z1 = Math.min(D - 1, Math.floor(p.z + r));
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const k = idx(x, y, z);
    if (!isSolid(world[k])) continue;
    const v = voxBodies.get(k);
    if (v) { v.used = physFrame; continue; }
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, shape: voxShape, collisionFilterGroup: GRP_STATIC, collisionFilterMask: GRP_DEBRIS });
    body.position.set(x + 0.5, y + 0.5, z + 0.5);
    phys.addBody(body);
    voxBodies.set(k, { body, used: physFrame });
  }
}
function removeDebris(d) {
  phys.removeBody(d.body);
  const i = debris.indexOf(d); if (i >= 0) debris.splice(i, 1);
}
function addDebris(rec, pos, quat, hx, hy, hz, vel, life) {
  if (debris.length >= MAX_DEBRIS) removeDebris(debris[0]);
  const body = new CANNON.Body({
    mass: Math.max(0.4, hx * hy * hz * 16), shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)),
    linearDamping: 0.08, angularDamping: 0.2, sleepSpeedLimit: 0.5, sleepTimeLimit: 0.5,
    collisionFilterGroup: GRP_DEBRIS, collisionFilterMask: GRP_DEBRIS | GRP_STATIC | GRP_CAR,
  });
  body.position.set(pos.x, Math.max(pos.y, G + hy + 0.02), pos.z);
  body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
  body.velocity.set(vel.x, vel.y, vel.z);
  body.angularVelocity.set(mr(-7, 7), mr(-7, 7), mr(-7, 7));
  phys.addBody(body);
  rec.body = body; rec.life = life; rec.r = Math.max(hx, hy, hz) + 0.6;
  ensureVoxelsAround(body.position, rec.r);
  debris.push(rec);
}
function blockDebris(x, y, z, b, size, vel) {
  _q.setFromEuler(_e.set(mr(-0.3, 0.3), mr(0, 3), mr(-0.3, 0.3)));
  addDebris({ kind: 'block', b, size }, { x: x + 0.5 + mr(-0.15, 0.15), y: y + 0.5, z: z + 0.5 + mr(-0.15, 0.15) }, _q, size / 2, size / 2, size / 2, vel, 12);
}
function blastDebris(x, y, z, radius, power) {
  for (const d of debris) {
    const p = d.body.position, dx = p.x - x, dy = p.y - y, dz = p.z - z, l = Math.hypot(dx, dy, dz);
    if (l > radius || l < 0.01) continue;
    const f = power * (1 - l / radius) * d.body.mass;
    d.body.wakeUp();
    d.body.applyImpulse(new CANNON.Vec3(dx / l * f, (Math.abs(dy / l) + 0.6) * f, dz / l * f));
  }
}

// trees fall apart when their trunk is broken
function fellTree(x, y, z, dirX, dirZ, push) {
  const seen = new Set(), q = [[x, y + 1, z]], out = [];
  while (q.length && out.length < 90) {
    const [cx, cy, cz] = q.pop(), k = idx(cx, cy, cz);
    if (seen.has(k) || cy <= y - 1 || Math.abs(cx - x) > 4 || Math.abs(cz - z) > 4) continue;
    seen.add(k);
    const b = get(cx, cy, cz);
    if (b !== B.LOG && b !== B.LEAF) continue;
    out.push([cx, cy, cz, b]);
    q.push([cx + 1, cy, cz], [cx - 1, cy, cz], [cx, cy + 1, cz], [cx, cy - 1, cz], [cx, cy, cz + 1], [cx, cy, cz - 1]);
  }
  if (!out.length) return;
  let n = 0;
  for (const [cx, cy, cz, b] of out) {
    setBlock(cx, cy, cz, 0);
    const h = cy - y;
    if (b === B.LOG || n++ % (isTouch ? 4 : 2) === 0) blockDebris(cx, cy, cz, b, 1, { x: dirX * push * (0.4 + h * 0.35) + mr(-0.4, 0.4), y: mr(0, 1), z: dirZ * push * (0.4 + h * 0.35) + mr(-0.4, 0.4) });
    else spawnParticles(cx + 0.5, cy + 0.5, cz + 0.5, BL[b].c, 1, 2);
  }
}

// a fast car knocks blocks out of walls
function smashBlocks(car, imp) {
  const s = Math.sin(car.heading), co = Math.cos(car.heading), dir = car.speed >= 0 ? 1 : -1;
  const top = imp > 22 ? G + 3 : G + 2, maxN = imp > 22 ? 14 : 7;
  let n = 0;
  const done = new Set();
  for (const reach of [2.3, 2.9, imp > 22 ? 3.6 : 2.9]) for (const lx of [-1.3, -0.6, 0, 0.6, 1.3]) {
    const px = car.pos.x + co * lx + s * reach * dir, pz = car.pos.z - s * lx + co * reach * dir;
    const bx = Math.floor(px), bz = Math.floor(pz);
    for (let y = G; y < top; y++) {
      const k = idx(bx, y, bz), b = get(bx, y, bz);
      if (done.has(k) || !isSolid(b) || n >= maxN) continue;
      done.add(k); n++;
      setBlock(bx, y, bz, 0); placed.delete(k);
      if (b === B.TNT) { igniteTNT(bx, y, bz, 0.4); continue; }
      const v = imp * mr(0.35, 0.75);
      blockDebris(bx, y, bz, b, 0.7, { x: s * dir * v + mr(-2, 2), y: mr(1.5, 5), z: co * dir * v + mr(-2, 2) });
      spawnParticles(bx + 0.5, y + 0.5, bz + 0.5, BL[b].c, 2, 3);
      if (b === B.LOG) fellTree(bx, y, bz, s * dir, co * dir, imp * 0.15);
    }
  }
  if (n) {
    sfx.brk(); sfx.crash(); camShake = Math.max(camShake, Math.min(0.7, imp / 35));
    spawnParticles(car.pos.x + s * dir * 2.6, G + 1, car.pos.z + co * dir * 2.6, '#9a9a9a', 6, 4);
  }
  return n;
}

// ---- car damage: parts fly off, then the whole car falls apart
const _wp = new THREE.Vector3();
function detachPart(car, part, force) {
  part.gone = true;
  const s = Math.sin(car.heading), co = Math.cos(car.heading);
  _wp.set(car.pos.x + co * part.x + s * part.z, G + part.y, car.pos.z - s * part.x + co * part.z);
  if (part.small) { spawnParticles(_wp.x, _wp.y, _wp.z, part.color, 2, 3); return; }
  const out = { x: _wp.x - car.pos.x, z: _wp.z - car.pos.z }, l = Math.hypot(out.x, out.z) || 1;
  const fx = s * car.speed * 0.6, fz = co * car.speed * 0.6;
  _q.setFromEuler(_e.set(0, car.heading, 0));
  addDebris({ kind: 'part', w: part.w, h: part.h, d: part.d, c: colorOf(part.color) }, _wp, _q,
    Math.max(0.05, part.w / 2), Math.max(0.05, part.h / 2), Math.max(0.05, part.d / 2),
    { x: fx + out.x / l * mr(2, 6) * force, y: mr(2.5, 6.5) * force, z: fz + out.z / l * mr(2, 6) * force }, 16);
}
function damageCar(car, dmg) {
  if (!car || car.dead || dmg <= 0) return;
  car.hp -= dmg;
  const parts = car.model.parts.filter(p => p.detach && !p.gone);
  let n = Math.floor(dmg / 9 + Math.random() * 0.9), changed = false;
  while (n-- > 0 && parts.length) { detachPart(car, parts.splice(Math.floor(Math.random() * parts.length), 1)[0], 1); changed = true; }
  if (car.model.bar && dmg > 15 && Math.random() < 0.4) { for (const m of car.model.bar) car.model.g.remove(m); car.model.bar = null; spawnParticles(car.pos.x, G + 1.8, car.pos.z, '#ff2020', 3, 3); }
  if (changed && car.hp > 0) rebuildCar(car);
  if (dmg > 6 && AC) { const t = AC.currentTime; tone(t, 0.12, mr(500, 900), 0.08, 'square', master, 200); }
}
function destroyCar(car) {
  if (car.dead) return;
  car.dead = true;
  const wasPlayer = player.inCar === car;
  for (const part of car.model.parts) if (!part.gone) detachPart(car, part, 1.7);
  const p = { x: car.pos.x, z: car.pos.z };
  removeCar(car);
  sfx.boom(); camShake = Math.max(camShake, 0.7);
  addFlash(p.x, G + 1, p.z, '#ff9a3c');
  spawnParticles(p.x, G + 1, p.z, '#ff8c1a', 12, 8);
  for (let i = 0; i < 8; i++) spawnParticles(p.x + mr(-1, 1), G + 1.2, p.z + mr(-1, 1), mpick(['#222222', '#444444']), 1, 1, -3);
  blastDebris(p.x, G + 0.5, p.z, 8, 9);
  for (const pd of peds) { const d = Math.hypot(pd.pos.x - p.x, pd.pos.z - p.z); if (d < 5) knockPed(pd, (pd.pos.x - p.x) * 2, 7, (pd.pos.z - p.z) * 2); }
  const tp = player.inCar ? player.inCar.pos : player.pos, pdist = Math.hypot(tp.x - p.x, tp.z - p.z);
  if (wasPlayer) { hurt(30); player.vel.set(mr(-4, 4), 9, mr(-4, 4)); toast('Машина развалилась!', '#ff6b6b'); }
  else if (pdist < 5) hurt((5 - pdist) * 8);
}

function updatePhysics(dt) {
  if (!debris.length) {
    for (const im of blockIMs.values()) im.count = 0;
    partsIM.count = 0;
    if (voxBodies.size) { for (const v of voxBodies.values()) phys.removeBody(v.body); voxBodies.clear(); }
    return;
  }
  physFrame++;
  // only cars near flying pieces take part in the simulation
  for (const c of cars) {
    let near = false;
    for (const d of debris) if (Math.abs(d.body.position.x - c.pos.x) < 6 && Math.abs(d.body.position.z - c.pos.z) < 6) { near = true; break; }
    const b = c.kbody;
    if (near !== c.kIn) { if (near) phys.addBody(b); else phys.removeBody(b); c.kIn = near; }
    if (!near) continue;
    b.position.set(c.pos.x, G + 0.75, c.pos.z);
    b.quaternion.setFromEuler(0, c.heading, 0);
    b.velocity.set(Math.sin(c.heading) * c.speed, 0, Math.cos(c.heading) * c.speed);
  }
  for (const d of debris) if (d.body.sleepState !== CANNON.Body.SLEEPING) ensureVoxelsAround(d.body.position, d.r);
  phys.step(1 / 50, dt, 2);
  for (const im of blockIMs.values()) im.count = 0;
  partsIM.count = 0;
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];
    d.life -= dt;
    if (d.life <= 0 || d.body.position.y < -6) { removeDebris(d); continue; }
    const k = d.life < 1.2 ? Math.max(0.01, d.life / 1.2) : 1;
    _p.set(d.body.position.x, d.body.position.y, d.body.position.z);
    _q.set(d.body.quaternion.x, d.body.quaternion.y, d.body.quaternion.z, d.body.quaternion.w);
    if (d.kind === 'block') {
      const im = blockIM(d.b);
      im.setMatrixAt(im.count++, _m4.compose(_p, _q, _s.setScalar(d.size * k)));
    } else {
      partsIM.setMatrixAt(partsIM.count, _m4.compose(_p, _q, _s.set(d.w * k, d.h * k, d.d * k)));
      partsIM.setColorAt(partsIM.count++, d.c);
    }
  }
  for (const im of blockIMs.values()) im.instanceMatrix.needsUpdate = true;
  partsIM.instanceMatrix.needsUpdate = true; partsIM.instanceColor.needsUpdate = true;
  if (physFrame % 30 === 0) {
    for (const [k, v] of voxBodies) if (physFrame - v.used > 45) { phys.removeBody(v.body); voxBodies.delete(k); }
  }
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t0 = performance.now();
  if (started && !paused) { step(dt); perf.step = perf.step * 0.9 + (performance.now() - t0) * 0.1; }
  else if (!started) { const a = now / 9000; const cx = nodeX(3.5), cz = nodeX(3.5); camera.position.set(cx + Math.cos(a) * 70, 48, cz + Math.sin(a) * 70); camera.lookAt(cx, 14, cz); }
  let built = 0;
  for (const k of dirty) { buildChunk(k % CX, Math.floor(k / CX)); dirty.delete(k); if (++built >= 4) break; }
  renderer.render(scene, camera);
  perf.calls = renderer.info.render.calls; perf.tris = renderer.info.render.triangles;
}
const perf = { step: 0, calls: 0, tris: 0 };
window.__perf = () => ({ ...perf, bodies: phys.bodies.length, debris: debris.length });
function step(dt) {
  gameTime += dt;
  readInput();
  if (deadTimer > 0) { deadTimer -= dt; if (deadTimer <= 0) respawn(); input.fwd = input.side = 0; input.jump = false; }
  if (player.inCar) updatePlayerCar(dt); else updateFoot(dt);
  for (const c of cars) {
    if (c.ai === 'traffic') updateTraffic(c, dt);
    else if (c.ai === 'police') updatePolice(c, dt);
    else if (c.ai === 'parked') c.speed *= Math.max(0, 1 - 3 * dt), c.speed && driveCar(c, 0, 0, true, dt);
  }
  carCollisions(dt);
  const vp = player.inCar ? player.inCar.pos : player.pos, V2 = (VIEW - 10) * (VIEW - 10);
  for (const c of cars) { c.model.g.position.set(c.pos.x, G, c.pos.z); c.model.g.rotation.y = c.heading; c.model.g.visible = (c.pos.x - vp.x) ** 2 + (c.pos.z - vp.z) ** 2 < V2; }
  for (const p of peds) p.h.g.visible = (p.pos.x - vp.x) ** 2 + (p.pos.z - vp.z) ** 2 < V2;
  for (const c of [...cars]) {
    if (c.hp <= 0) { destroyCar(c); continue; }
    if (c.hp < c.maxHp * 0.4 && (c.smokeT -= dt) <= 0) {
      c.smokeT = c.hp < c.maxHp * 0.2 ? 0.05 : 0.14;
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
      spawnParticles(c.pos.x + fx * 1.5, G + 1.1, c.pos.z + fz * 1.5, c.hp < c.maxHp * 0.2 ? mpick(['#222222', '#ff7a1a', '#333333']) : '#666666', 1, 1, -3);
    }
  }
  trafficT -= dt;
  if (trafficT <= 0) { trafficT = 2; if (cars.filter(c => c.ai === 'traffic').length < (isTouch ? 16 : 26)) spawnTraffic(player.inCar ? player.inCar.pos : player.pos); }
  updatePhysics(dt);
  for (const p of peds) updatePed(p, dt);
  managePolice(dt);
  // pickups
  const tp = player.inCar ? player.inCar.pos : player.pos;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i]; p.t += dt;
    p.m.rotation.y = p.t * 2; p.m.position.y = G + 0.7 + Math.sin(p.t * 3) * 0.15;
    if (Math.hypot(p.x - tp.x, p.z - tp.z) < (player.inCar ? 2.6 : 1.3) && Math.abs(player.pos.y - G) < 2.5) {
      scene.remove(p.m); pickups.splice(i, 1); addMoney(p.value);
      if (pickups.length < 26) randomSidewalkPickup();
    }
  }
  // tnt
  for (let i = tnts.length - 1; i >= 0; i--) {
    const t = tnts[i]; t.timer -= dt;
    t.m.material.color.set(Math.floor(t.timer * 6) % 2 ? '#ffffff' : '#d2402f');
    t.m.scale.setScalar(1 + Math.max(0, 0.4 - t.timer) * 0.4);
    if (t.timer <= 0) { scene.remove(t.m); tnts.splice(i, 1); explode(t.x, t.y, t.z, 3.6); }
  }
  updateParticles(dt);
  // regen
  if (stars === 0 && deadTimer <= 0) player.health = Math.min(100, player.health + dt * 3);
  if (player.hurtFlash > 0) player.hurtFlash -= dt;
  // clouds
  if (cloudMesh) cloudMesh.rotation.y += dt * 0.004;
  updateCamera(dt);
  // outline
  const hit = !player.inCar && deadTimer <= 0 ? currentAim() : null;
  outline.visible = !!hit;
  if (hit) outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  // audio
  if (AC) {
    scheduleRadio();
    radioGain.gain.setTargetAtTime(player.inCar && radioOn ? 0.35 : 0, AC.currentTime, 0.3);
  }
  updateHud(dt);
  drawMinimap();
  sun.position.set(player.pos.x + 70, 120, player.pos.z + 40); sun.target.position.copy(player.pos); sun.target.updateMatrixWorld();
}

// ------------------------------------------------------------
//  Boot
// ------------------------------------------------------------
function boot() {
  for (let cz = 0; cz < CZ; cz++) for (let cx = 0; cx < CX; cx++) buildChunk(cx, cz);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) mapPixel(x, z);
  setupEntities();
  buildHotbar();
  human.g.position.copy(player.pos);
  updateCamera(0.016);
  // show the city behind the menu
  camera.position.set(nodeX(3) - 30, 46, nodeX(3) + 40); camera.lookAt(nodeX(4), 12, nodeX(3));
  requestAnimationFrame(frame);
  const play = $('#play'); play.disabled = false; play.textContent = 'ИГРАТЬ';
  if (best > 0) $('#best').textContent = 'Рекорд: $' + best.toLocaleString('ru-RU');
  play.addEventListener('click', () => {
    started = true;
    $('#menu').classList.add('hidden'); $('#hud').classList.remove('hidden');
    initAudio(); if (AC && AC.state === 'suspended') AC.resume();
    if (isTouch) { setupTouch(); try { document.documentElement.requestFullscreen?.(); } catch (e) { } }
    else canvas.requestPointerLock();
    toast('Добро пожаловать в Блок-Сити! Садись в машину — ' + (isTouch ? '🚗' : 'F'), '#ffd34d');
  });
}
// allow the menu to render first
setTimeout(boot, 30);
window.__gt = () => gameTime;
window.__step = dt => step(dt);
window.__cam = () => [camera.position.x.toFixed(1), camera.position.y.toFixed(1), camera.position.z.toFixed(1), yaw.toFixed(2), pitch.toFixed(2), camDist.toFixed(2)];
window.__game = { player, cars, peds, debris, damageCar, currentAim, actionPrimary, actionSecondary, select, enterCar, keys, get stars() { return stars; }, addHeat, setYaw: (y, p) => { yaw = y; pitch = p; } };
