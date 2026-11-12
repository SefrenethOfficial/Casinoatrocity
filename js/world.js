// The Hotel: a randomly generated floor of old wooden rooms joined by numbered (sometimes locked)
// doors. Each floor is a grid of rooms with a guaranteed path from the entry to the stairs down,
// plus extra doors that branch and loop. Owns collision, the enemy flow-field, and interactables.
import * as THREE from 'three';
import { WEAPONS } from './data.js';
import { buildWeaponModel } from './models.js';
import { Batcher, tex, speckle, flat, glow, mapped, sprite, mats, furn, wallpaperTex, ceilingTex, rugTex, numberTex, windowTex, elevatorTex, plaqueTex } from './build.js';

export const CELL = 2;
export const WALL_H = 3.3;
const ROOM = 7, PITCH = ROOM + 1, MID = 3;

// ---- small seeded RNG so a floor can be regenerated identically if needed ----
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Each floor is papered differently.
const PALETTES = [
  { paper: '#4f5f47', paper2: '#57684e', motif: 'rgba(214,190,110,0.45)', wood: '#4a2f1b', trim: '#2a190d', fabric: 0x5c1a26, rugs: [['#5a1a22', '#2a1210'], ['#3a2a4a', '#1a1220']] },
  { paper: '#6a2e30', paper2: '#733436', motif: 'rgba(224,180,100,0.45)', wood: '#3f2816', trim: '#24150b', fabric: 0x23402e, rugs: [['#23402e', '#12180f'], ['#5a1a22', '#2a1210']] },
  { paper: '#3c4a66', paper2: '#44536f', motif: 'rgba(200,200,220,0.35)', wood: '#46301e', trim: '#26180d', fabric: 0x4a3a1a, rugs: [['#1e2c4a', '#0e1220'], ['#4a3a1a', '#1e160a']] },
  { paper: '#7a6434', paper2: '#84703c', motif: 'rgba(90,30,30,0.45)', wood: '#402a18', trim: '#22140a', fabric: 0x2a2a4a, rugs: [['#5a1a22', '#2a1210'], ['#2a2a4a', '#12121e']] },
];

const stainTex = () => tex(64, 64, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) { const a = i * 2.4, d = (i * 7 % 22), r = 3 + (i * 5 % 9); g.fillStyle = i % 3 ? 'rgba(70,8,8,0.75)' : 'rgba(40,4,4,0.85)'; g.beginPath(); g.arc(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, r, 0, 6.3); g.fill(); }
}, 1);
const stairTex = () => tex(64, 64, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) { const v = 70 - i * 13; g.fillStyle = `rgb(${v},${(v * 0.68) | 0},${(v * 0.45) | 0})`; g.fillRect(4, 4 + i * 9, w - 8, 7); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(4, 10 + i * 9, w - 8, 2); }
}, 1);

export const PERKS = {
  thick: { id: 'thick', name: 'Bellhop Tonic', desc: 'double health', cost: 2500, color: 0xff3344 },
  hands: { id: 'hands', name: 'Quick Hands', desc: 'faster reloads', cost: 2000, color: 0x33ff88 },
};
export const BOX_COST = 950;
export const AMMO_COST = 400;

export class World {
  constructor(scene, floor = 1, seed = (Math.random() * 1e9) | 0) {
    this.scene = scene;
    this.floor = floor;
    this.seed = seed;
    const rng = this.rng = mulberry(seed + floor * 101);
    this.gw = Math.min(3 + Math.floor(floor / 2), 5);
    this.gh = Math.min(3 + Math.floor((floor + 1) / 2), 5);
    this.w = 1 + this.gw * PITCH;
    this.h = 1 + this.gh * PITCH;
    this.blockedGrid = new Uint8Array(this.w * this.h).fill(1);
    this.flow = new Int16Array(this.w * this.h).fill(-1);
    this.roomOf = new Int16Array(this.w * this.h).fill(0);
    this.rooms = [];           // { id, col, row, x0, z0, cx, cz, feature }
    this.doors = [];           // { id, number, a, b, cx, cz, vertical, locked, open, group, slab }
    this.spawns = [];          // { x, z, room }
    this.interactables = [];
    this.solids = [];
    this.animated = [];
    this.lamps = [];
    this.playerSpawn = new THREE.Vector3();
    this.mystery = null;
    this.time = 0;
    this._queue = new Int32Array(this.w * this.h);
    this._genLayout();
    this._build();
  }

  roomIndex(col, row) { return row * this.gw + col; }
  blocked(cx, cz) { return (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) ? true : this.blockedGrid[cz * this.w + cx] === 1; }
  blockedAt(x, z) { return this.blocked(Math.floor(x / CELL), Math.floor(z / CELL)); }
  center(cx, cz) { return [(cx + 0.5) * CELL, (cz + 0.5) * CELL]; }
  roomAt(x, z) { const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); return (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) ? 0 : this.roomOf[cz * this.w + cx]; }
  roomCenter(id) { const r = this.rooms[id - 1]; return r ? [r.cx, r.cz] : [this.w, this.h]; }
  roomSpawns(id) { return this.spawns.filter(s => s.room === id); }

  // ---- generation ----
  _genLayout() {
    const rng = this.rng, GW = this.gw, GH = this.gh, N = GW * GH;
    for (let row = 0; row < GH; row++) for (let col = 0; col < GW; col++) {
      const id = this.roomIndex(col, row) + 1;
      const x0 = 1 + col * PITCH, z0 = 1 + row * PITCH;
      for (let dz = 0; dz < ROOM; dz++) for (let dx = 0; dx < ROOM; dx++) {
        const cx = x0 + dx, cz = z0 + dz;
        this.blockedGrid[cz * this.w + cx] = 0;
        this.roomOf[cz * this.w + cx] = id;
      }
      this.rooms.push({ id, col, row, x0, z0, cx: (x0 + MID + 0.5) * CELL, cz: (z0 + MID + 0.5) * CELL, feature: null });
    }
    const idx = (c, r) => r * GW + c;
    const edgeKey = (a, b) => a < b ? a + '-' + b : b + '-' + a;
    // randomized-DFS spanning tree over the room grid (guarantees full connectivity)
    const seen = new Array(N).fill(false), tree = new Set(), adj = {};
    const start = 0, stack = [start]; seen[start] = true;
    while (stack.length) {
      const cur = stack[stack.length - 1], cc = cur % GW, cr = (cur / GW) | 0, nbrs = [];
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = cc + dc, nr = cr + dr; if (nc < 0 || nr < 0 || nc >= GW || nr >= GH) continue; const ni = idx(nc, nr); if (!seen[ni]) nbrs.push(ni); }
      if (!nbrs.length) { stack.pop(); continue; }
      const ni = nbrs[(rng() * nbrs.length) | 0];
      seen[ni] = true; tree.add(edgeKey(cur, ni)); (adj[cur] ||= []).push(ni); (adj[ni] ||= []).push(cur); stack.push(ni);
    }
    // extra loop edges for branching / alternate paths
    const extra = new Set();
    for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) for (const [dc, dr] of [[1, 0], [0, 1]]) {
      const cc2 = c + dc, rr = r + dr; if (cc2 >= GW || rr >= GH) continue;
      const a = idx(c, r), b = idx(cc2, rr), k = edgeKey(a, b);
      if (tree.has(k)) continue;
      if (rng() < 0.45) { extra.add(k); (adj[a] ||= []).push(b); (adj[b] ||= []).push(a); }
    }
    // stairs room: graph-farthest from the start
    const dist = new Array(N).fill(-1), parent = new Array(N).fill(-1); dist[start] = 0; const q = [start];
    for (let hh = 0; hh < q.length; hh++) { const u = q[hh]; for (const v of (adj[u] || [])) if (dist[v] < 0) { dist[v] = dist[u] + 1; parent[v] = u; q.push(v); } }
    let far = start; for (let i = 0; i < N; i++) if (dist[i] > dist[far]) far = i;
    this.startRoom = start + 1; this.stairsRoom = far + 1;
    const pathEdges = new Set(); let pc = far; while (parent[pc] >= 0) { pathEdges.add(edgeKey(pc, parent[pc])); pc = parent[pc]; }

    let number = 0;
    const addDoor = (a, b, locked) => {
      const ac = a % GW, ar = (a / GW) | 0, bc = b % GW, br = (b / GW) | 0;
      let cx, cz, vertical;
      if (ar === br) { vertical = true; cx = (Math.min(ac, bc) + 1) * PITCH; cz = 1 + ar * PITCH + MID; }
      else { vertical = false; cz = (Math.min(ar, br) + 1) * PITCH; cx = 1 + ac * PITCH + MID; }
      this.blockedGrid[cz * this.w + cx] = 1;   // starts closed (a wall)
      this.roomOf[cz * this.w + cx] = Math.min(a, b) + 1;
      this.doors.push({ id: this.doors.length, number: ++number, a: a + 1, b: b + 1, cx, cz, vertical, locked, open: false });
    };
    for (const k of new Set([...tree, ...extra])) {
      const [a, b] = k.split('-').map(Number);
      addDoor(a, b, !pathEdges.has(k) && extra.has(k) && rng() < 0.6);   // only optional branches can lock
    }

    const sr = this.rooms[start];
    this.playerSpawn.set((sr.x0 + MID + 0.5) * CELL, 0, (sr.z0 + MID + 0.5) * CELL);

    for (const r of this.rooms) for (const [dx, dz] of [[1, 1], [ROOM - 2, 1], [1, ROOM - 2], [ROOM - 2, ROOM - 2]])
      this.spawns.push({ x: (r.x0 + dx + 0.5) * CELL, z: (r.z0 + dz + 0.5) * CELL, room: r.id });

    // hand out features to non-start, non-stairs rooms
    const others = this.rooms.filter(r => r.id !== this.startRoom && r.id !== this.stairsRoom);
    for (let i = others.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [others[i], others[j]] = [others[j], others[i]]; }
    const pool = [{ type: 'wallbuy', weapon: 'smg' }];
    pool.push({ type: 'wallbuy', weapon: 'shotgun' });
    if (this.floor >= 2) pool.push({ type: 'wallbuy', weapon: 'ar' });
    pool.push({ type: 'box' });
    pool.push({ type: 'perk', perk: PERKS.thick });
    pool.push({ type: 'perk', perk: PERKS.hands });
    for (let k = 0; k < Math.ceil(this.rooms.length / 2); k++) pool.push({ type: 'ammo' });
    others.forEach((r, i) => { if (i < pool.length) r.feature = pool[i]; });
  }

  // ---- geometry ----
  _build() {
    const scene = this.scene, M = this.M = mats(), w = this.w;
    const S = this.S = new Batcher(), D = this.D = new Batcher();
    const pal = this.pal = PALETTES[(this.floor - 1) % PALETTES.length];
    const paper = mapped(wallpaperTex(pal));
    this.fab = flat(pal.fabric);
    this.rugs = pal.rugs.map(c => mapped(rugTex(c[0], c[1])));
    this.winMat = new THREE.MeshBasicMaterial({ map: windowTex() });
    this.stainMat = new THREE.MeshBasicMaterial({ map: stainTex(), transparent: true, depthWrite: false });
    this.animated.push(t => { const f = Math.sin(t * 0.83) * Math.sin(t * 1.37) > 0.93 && Math.sin(t * 40) > -0.2; this.winMat.color.setRGB(f ? 4 : 1, f ? 4 : 1, f ? 4.5 : 1); });

    // walls: one quad for every open cell edge that touches solid wall
    const doorAt = new Map(); for (const d of this.doors) doorAt.set(d.cz * w + d.cx, d);
    const solid = (cx, cz) => cx < 0 || cz < 0 || cx >= w || cz >= this.h || (this.blockedGrid[cz * w + cx] === 1 && !doorAt.has(cz * w + cx));
    for (let cz = 0; cz < this.h; cz++) for (let cx = 0; cx < w; cx++) {
      if (solid(cx, cz) || doorAt.has(cz * w + cx)) continue;
      const [x, z] = this.center(cx, cz);
      if (solid(cx, cz - 1)) S.quad(paper, CELL, WALL_H, x, WALL_H / 2, cz * CELL, 0);
      if (solid(cx, cz + 1)) S.quad(paper, CELL, WALL_H, x, WALL_H / 2, (cz + 1) * CELL, Math.PI);
      if (solid(cx - 1, cz)) S.quad(paper, CELL, WALL_H, cx * CELL, WALL_H / 2, z, Math.PI / 2);
      if (solid(cx + 1, cz)) S.quad(paper, CELL, WALL_H, (cx + 1) * CELL, WALL_H / 2, z, -Math.PI / 2);
    }
    const W = w * CELL, Hh = this.h * CELL;
    S.plane(M.boards, W, Hh, W / 2, 0, Hh / 2, w, this.h);
    S.plane(mapped(ceilingTex()), W, Hh, W / 2, WALL_H, Hh / 2, w, this.h, true);

    scene.add(new THREE.AmbientLight(0x5a5048, 0.85));
    scene.add(new THREE.HemisphereLight(0x6a6258, 0x1a120c, 0.5));

    for (const r of this.rooms) this._dressRoom(r);
    for (const d of this.doors) this._buildDoor(d);
    this.solids.push(...S.build(scene));
    D.build(scene);
  }

  _dressRoom(r) {
    const scene = this.scene, M = this.M, D = this.D, S = this.S, rng = this.rng, cx = r.cx, cz = r.cz, w = this.w;
    const stairs = r.id === this.stairsRoom, start = r.id === this.startRoom;

    // rug + hanging lamp
    if (!stairs) D.plane(this.rugs[r.id % this.rugs.length], 4.8, 4.8, cx, 0.02, cz);
    const dead = !stairs && !start && rng() < 0.18, flick = !dead && !start && rng() < 0.3;
    const col = stairs ? 0xd0ffdc : 0xffb86a, base = dead ? 0 : 30;
    D.cyl(M.iron, 0.02, 0.02, 0.7, cx, WALL_H - 0.35, cz, 4); D.cyl(M.brass, 0.14, 0.14, 0.05, cx, WALL_H - 0.02, cz, 6);
    D.add(new THREE.MeshLambertMaterial({ color: 0x8a6a3a, side: THREE.DoubleSide, emissive: dead ? 0 : 0x4a3210 }), new THREE.ConeGeometry(0.42, 0.34, 8, 1, true), cx, WALL_H - 0.8, cz);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), glow(dead ? 0x2a2620 : 0xffe2a0)); bulb.position.set(cx, WALL_H - 0.92, cz); scene.add(bulb);
    const lamp = new THREE.PointLight(col, base, 17, 1.4); lamp.position.set(cx, WALL_H - 1.0, cz); scene.add(lamp);
    this.lamps.push(lamp);
    if (flick) { const seed = r.id * 3.3; this.animated.push(t => { const on = Math.sin(t * 31 + seed) > -0.6 && Math.sin(t * 7 + seed) > -0.85; lamp.intensity = on ? base : base * 0.12; bulb.visible = on; }); }

    // wall slots: every perimeter cell except the four door positions
    const used = new Set(), key = (a, b) => b * w + a;
    const cellOf = (wall, i) => wall === 0 ? [r.x0 + i, r.z0] : wall === 1 ? [r.x0 + i, r.z0 + ROOM - 1] : wall === 2 ? [r.x0, r.z0 + i] : [r.x0 + ROOM - 1, r.z0 + i];
    const ROT = [0, Math.PI, Math.PI / 2, -Math.PI / 2], NEXT = [1, -1, -1, 1];
    const at = (wall, i, fn, B = D) => { const [a, b] = cellOf(wall, i), [x, z] = this.center(a, b); B.push(x, 0, z, ROT[wall]); fn(B); B.pop(); };
    const block = (a, b) => { this.blockedGrid[b * w + a] = 1; used.add(key(a, b)); };

    if (start) { used.add(key(...cellOf(0, 2))); used.add(key(...cellOf(0, 4))); this._buildArrival(r); }

    // rain-streaked windows on outside walls
    const outside = [r.row === 0, r.row === this.gh - 1, r.col === 0, r.col === this.gw - 1];
    for (let wall = 0; wall < 4; wall++) {
      if (!outside[wall]) continue;
      for (const i of [1, 5]) {
        if (rng() > 0.6 || used.has(key(...cellOf(wall, i)))) continue;
        used.add(key(...cellOf(wall, i)));
        at(wall, i, B => {
          B.box(M.dark, 1.34, 1.74, 0.06, 0, 1.75, -0.98); B.quad(this.winMat, 1.2, 1.6, 0, 1.75, -0.94); B.box(M.dark, 1.5, 0.08, 0.2, 0, 0.9, -0.92);
          B.box(this.fab, 0.34, 1.95, 0.08, -0.72, 1.7, -0.9); B.box(this.fab, 0.34, 1.95, 0.08, 0.72, 1.7, -0.9); B.cyl(M.brass, 0.025, 0.025, 1.9, 0, 2.7, -0.9, 4, 0, Math.PI / 2);
        });
      }
    }

    // furniture along the walls; each piece blocks its cell
    const slots = []; for (let wall = 0; wall < 4; wall++) for (const i of [0, 1, 2, 4, 5, 6]) slots.push([wall, i]);
    for (let i = slots.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [slots[i], slots[j]] = [slots[j], slots[i]]; }
    const kinds = ['wardrobe', 'dresser', 'bookshelf', 'bed', 'sofa', 'desk', 'armchair', 'luggage', 'clock', 'plant', 'crates', 'bed', 'armchair'];
    let want = 4 + ((rng() * 4) | 0), beds = 0;
    for (const [wall, i] of slots) {
      if (want <= 0) break;
      const [a, b] = cellOf(wall, i); if (used.has(key(a, b))) continue;
      let kind = kinds[(rng() * kinds.length) | 0];
      if (kind === 'bed' && beds) kind = 'dresser';
      if (kind === 'bed' || kind === 'sofa') {
        const j = i + NEXT[wall]; if (j < 0 || j > 6 || j === 3) continue;
        const [a2, b2] = cellOf(wall, j); if (used.has(key(a2, b2))) continue;
        block(a2, b2); if (kind === 'bed') beds++;
      }
      block(a, b); want--;
      at(wall, i, B => (kind === 'armchair' || kind === 'sofa') ? furn[kind](B, M, this.fab) : furn[kind](B, M), S);
    }
    // pictures on a couple of the bare stretches of wall
    let pics = 1 + ((rng() * 3) | 0);
    for (const [wall, i] of slots) { if (pics <= 0) break; const k = key(...cellOf(wall, i)); if (used.has(k) || i === 0 || i === 6) continue; used.add(k); pics--; at(wall, i, B => furn.painting(B, M, (rng() * 3) | 0)); }
    // old stains
    if (!start && rng() < 0.45) D.add(this.stainMat, new THREE.PlaneGeometry(2.6, 2.6), cx + (rng() - 0.5) * 5, 0.03, cz + (rng() - 0.5) * 5, rng() * 6.3, -Math.PI / 2);

    if (stairs) this._buildStairs(cx, cz);
    else if (r.feature) this._buildFeature(r);
  }

  _buildArrival(r) {
    const D = this.D, M = this.M, [x, z] = this.center(r.x0 + MID, r.z0);
    D.push(x, 0, z, 0);
    D.quad(mapped(elevatorTex()), 1.9, 2.5, 0, 1.25, -0.96);
    D.box(M.brass, 0.14, 2.64, 0.12, -1.0, 1.32, -0.95); D.box(M.brass, 0.14, 2.64, 0.12, 1.0, 1.32, -0.95); D.box(M.brass, 2.14, 0.16, 0.12, 0, 2.6, -0.95);
    D.add(new THREE.MeshLambertMaterial({ map: plaqueTex('FLOOR ' + this.floor) }), new THREE.PlaneGeometry(1.1, 0.28), 0, 2.92, -0.96);
    D.box(M.brass, 0.14, 0.26, 0.04, 1.35, 1.3, -0.97); D.box(glow(0xffb040), 0.05, 0.05, 0.03, 1.35, 1.35, -0.94);
    D.pop();
  }

  _blockCentre(x, z) { this.blockedGrid[Math.floor(z / CELL) * this.w + Math.floor(x / CELL)] = 1; }

  _buildStairs(cx, cz) {
    const scene = this.scene, D = this.D, M = this.M;
    this._blockCentre(cx, cz);
    D.plane(new THREE.MeshBasicMaterial({ map: stairTex() }), 1.9, 1.9, cx, 0.03, cz);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { D.box(M.dark, 0.12, 1.1, 0.12, cx + dx * 0.97, 0.55, cz + dz * 0.97); D.box(M.brass, 0.16, 0.06, 0.16, cx + dx * 0.97, 1.13, cz + dz * 0.97); }
    for (const y of [0.55, 1.0]) { D.box(M.dark, 0.06, 0.08, 1.94, cx - 0.97, y, cz); D.box(M.dark, 0.06, 0.08, 1.94, cx + 0.97, y, cz); D.box(M.dark, 1.94, 0.08, 0.06, cx, y, cz + 0.97); }
    const signMat = new THREE.MeshBasicMaterial({ map: plaqueTex('EXIT', '#0a3a1a', '#7dffa8'), side: THREE.DoubleSide });
    D.add(signMat, new THREE.PlaneGeometry(1.1, 0.38), cx, 2.5, cz - 0.6); D.add(signMat, new THREE.PlaneGeometry(1.1, 0.38), cx - 0.6, 2.5, cz, Math.PI / 2);
    D.cyl(M.iron, 0.015, 0.015, 0.7, cx, WALL_H - 0.35, cz - 0.6, 4);
    const label = sprite(['STAIRS', 'TO FLOOR ' + (this.floor + 1)], '#7dffa8', 1.9); label.position.set(cx, 1.8, cz); scene.add(label);
    this.interactables.push({ type: 'stairs', x: cx, z: cz });
  }

  _buildFeature(r) {
    const f = r.feature, cx = r.cx, cz = r.cz;
    this._blockCentre(cx, cz);
    if (f.type === 'wallbuy') this._buildRack(cx, cz, f.weapon);
    else if (f.type === 'box') this._buildMystery(cx, cz);
    else if (f.type === 'perk') this._buildShrine(cx, cz, f.perk);
    else if (f.type === 'ammo') this._buildAmmo(cx, cz);
  }

  _buildRack(x, z, weapon) {
    const scene = this.scene, wd = WEAPONS[weapon], M = this.M, S = this.S;
    S.box(M.wood, 1.6, 0.1, 1.0, x, 0.85, z); S.box(M.green, 1.46, 0.03, 0.86, x, 0.91, z); S.box(M.dark, 1.5, 0.16, 0.9, x, 0.74, z);
    for (const dx of [-0.7, 0.7]) for (const dz of [-0.4, 0.4]) S.box(M.dark, 0.1, 0.8, 0.1, x + dx, 0.4, z + dz);
    S.box(M.olive, 0.3, 0.14, 0.2, x + 0.5, 0.99, z + 0.25, 0.4); S.box(M.brass, 0.5, 0.02, 0.12, x - 0.4, 0.93, z - 0.3, 0.2);
    const model = buildWeaponModel(weapon); model.scale.setScalar(1.6); model.position.set(x, 1.45, z); scene.add(model);
    this.animated.push(t => { model.rotation.y = t * 0.9; });
    const label = sprite([wd.name.toUpperCase(), wd.cost + ' pts'], '#d8c38a', 1.9); label.position.set(x, 2.35, z); scene.add(label);
    this.interactables.push({ type: 'wallbuy', weapon, cost: wd.cost, x, z });
  }

  _buildMystery(x, z) {
    const scene = this.scene, M = this.M, S = this.S;
    S.box(M.wood, 1.6, 0.8, 1.0, x, 0.4, z); S.box(M.dark, 1.66, 0.26, 1.06, x, 0.96, z);
    for (const dx of [-0.6, 0, 0.6]) S.box(M.brass, 0.1, 1.12, 1.08, x + dx, 0.56, z);
    S.box(M.brass, 0.2, 0.22, 0.06, x, 0.72, z + 0.52); S.box(M.brass, 0.2, 0.22, 0.06, x, 0.72, z - 0.52);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xb44cff });
    const seam = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.05, 1.08), glowMat); seam.position.set(x, 0.82, z); scene.add(seam);
    const display = new THREE.Group(); display.position.set(x, 1.75, z); scene.add(display);
    const label = sprite(['MYSTERY BOX', BOX_COST + ' pts'], '#c77dff', 1.9); label.position.set(x, 2.7, z); scene.add(label);
    const light = new THREE.PointLight(0xb44cff, 7, 7, 1.8); light.position.set(x, 1.6, z); scene.add(light);
    this.mystery = { x, z, display, glowMat, light };
    this.animated.push(t => { glowMat.color.setHex(Math.sin(t * 5) > 0 ? 0xb44cff : 0x7a2fd0); display.rotation.y = t * 1.6; });
    this.interactables.push({ type: 'box', x, z });
  }

  _buildShrine(x, z, perk) {
    const scene = this.scene, M = this.M, S = this.S, D = this.D, g = glow(perk.color);
    S.box(M.dark, 1.0, 1.95, 0.8, x, 0.975, z); S.box(M.wood, 1.1, 0.12, 0.9, x, 2.0, z); S.box(M.wood, 1.1, 0.14, 0.9, x, 0.07, z);
    for (const s of [-1, 1]) {
      D.box(g, 0.72, 0.5, 0.02, x, 1.5, z + s * 0.41); D.box(M.black, 0.5, 0.3, 0.02, x, 0.8, z + s * 0.41);
      D.box(M.brass, 0.1, 0.16, 0.03, x + 0.3, 1.1, z + s * 0.41); D.box(M.brass, 0.8, 0.04, 0.03, x, 1.2, z + s * 0.41); D.box(M.brass, 0.8, 0.04, 0.03, x, 1.8, z + s * 0.41);
    }
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.36, 6), g); bottle.position.set(x, 2.26, z); scene.add(bottle);
    this.animated.push(t => { bottle.rotation.y = t * 1.5; bottle.position.y = 2.28 + Math.sin(t * 2 + x) * 0.04; });
    const label = sprite([perk.name.toUpperCase(), perk.cost + ' pts'], '#' + perk.color.toString(16).padStart(6, '0'), 1.9); label.position.set(x, 2.85, z); scene.add(label);
    this.interactables.push({ type: 'perk', perk, x, z });
  }

  _buildAmmo(x, z) {
    const scene = this.scene, M = this.M, S = this.S, D = this.D;
    S.box(M.olive, 1.4, 0.6, 0.9, x, 0.3, z); S.box(M.olive, 1.44, 0.12, 0.94, x, 0.66, z); S.box(M.olive, 0.6, 0.3, 0.4, x - 0.25, 0.87, z, 0.3);
    for (const dx of [-0.45, 0.45]) { D.box(M.brass, 0.1, 0.14, 0.03, x + dx, 0.56, z + 0.46); D.box(M.brass, 0.1, 0.14, 0.03, x + dx, 0.56, z - 0.46); }
    for (let k = 0; k < 5; k++) D.cyl(M.brass, 0.03, 0.035, 0.16, x + 0.3 + (k % 3) * 0.09, 0.8, z - 0.1 + ((k / 3) | 0) * 0.12, 5);
    const label = sprite(['AMMO', AMMO_COST + ' pts'], '#9fdc6a', 1.9); label.position.set(x, 1.75, z); scene.add(label);
    this.interactables.push({ type: 'ammo', x, z });
  }

  // A real door: jambs and a header fill the 2m gap, and a panelled leaf swings on its hinge.
  _buildDoor(d) {
    const M = this.M, S = this.S, D = this.D, [x, z] = this.center(d.cx, d.cz), ry = d.vertical ? Math.PI / 2 : 0;
    const LEAF_W = 1.5, LEAF_H = 2.3;
    S.push(x, 0, z, ry);
    S.box(M.wood, 0.25, LEAF_H + 0.05, 2.1, -0.875, (LEAF_H + 0.05) / 2, 0); S.box(M.wood, 0.25, LEAF_H + 0.05, 2.1, 0.875, (LEAF_H + 0.05) / 2, 0);
    S.box(M.wood, 2.0, WALL_H - LEAF_H - 0.05, 2.0, 0, (WALL_H + LEAF_H + 0.05) / 2, 0); S.box(M.dark, 2.0, 0.14, 2.12, 0, LEAF_H + 0.12, 0);
    S.pop();
    d.plateMat = new THREE.MeshLambertMaterial({ map: numberTex(d.number, d.locked), emissive: 0x2a2010 });
    D.push(x, 0, z, ry);
    D.add(d.plateMat, new THREE.PlaneGeometry(0.66, 0.38), 0, 2.84, 1.02); D.add(d.plateMat, new THREE.PlaneGeometry(0.66, 0.38), 0, 2.84, -1.02, Math.PI);
    D.pop();

    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
    const hinge = new THREE.Group(); hinge.position.set(-LEAF_W / 2, 0, 0); g.add(hinge);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(LEAF_W, LEAF_H, 0.09), M.door); leaf.position.set(LEAF_W / 2, LEAF_H / 2, 0); hinge.add(leaf);
    for (const s of [-1, 1]) { const knob = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), M.brass); knob.position.set(LEAF_W - 0.16, 1.05, s * 0.09); hinge.add(knob); }
    if (d.locked) {
      d.lockParts = new THREE.Group(); hinge.add(d.lockParts);
      for (const s of [-1, 1]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(LEAF_W + 0.1, 0.12, 0.05), M.iron); bar.position.set(LEAF_W / 2, 1.3, s * 0.08);
        const lock = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.08), flat(0x8a1c1c)); lock.position.set(LEAF_W / 2, 1.14, s * 0.11);
        d.lockParts.add(bar, lock);
      }
    }
    this.scene.add(g); g.updateMatrixWorld(true);
    d.group = g; d.hinge = hinge; d.slab = leaf; d.swing = 0;
    this.solids.push(leaf);
  }

  // Swings away from whoever opened it (px, pz = their position).
  openDoor(d, px, pz) {
    if (d.open) return false;
    d.open = true;
    this.blockedGrid[d.cz * this.w + d.cx] = 0;
    const i = this.solids.indexOf(d.slab); if (i >= 0) this.solids.splice(i, 1);
    const [x, z] = this.center(d.cx, d.cz), side = px === undefined ? -1 : (d.vertical ? px - x : pz - z);
    d.swing = side > 0 ? Math.PI * 0.52 : -Math.PI * 0.52;
    if (d.lockParts) d.lockParts.visible = false;
    if (d.locked) { d.locked = false; d.plateMat.map = numberTex(d.number, false); d.plateMat.needsUpdate = true; }
    return true;
  }

  update(time) {
    this.time = time;
    for (const fn of this.animated) fn(time);
    const dt = Math.min(Math.max(time - (this._lastT ?? time), 0), 0.2); this._lastT = time;
    for (const d of this.doors) {
      if (!d.open || d.hinge.rotation.y === d.swing) continue;
      const step = dt * 4.5, diff = d.swing - d.hinge.rotation.y;
      d.hinge.rotation.y = Math.abs(diff) <= step ? d.swing : d.hinge.rotation.y + Math.sign(diff) * step;
    }
  }

  // ---- collision + flow ----
  collideCircle(p, r) {
    for (let pass = 0; pass < 2; pass++) {
      const x0 = Math.floor((p.x - r) / CELL), x1 = Math.floor((p.x + r) / CELL);
      const z0 = Math.floor((p.z - r) / CELL), z1 = Math.floor((p.z + r) / CELL);
      for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
        if (!this.blocked(cx, cz)) continue;
        const minX = cx * CELL, maxX = minX + CELL, minZ = cz * CELL, maxZ = minZ + CELL;
        const nx = Math.max(minX, Math.min(p.x, maxX)), nz = Math.max(minZ, Math.min(p.z, maxZ));
        const dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-9) { const d = Math.sqrt(d2), push = (r - d) / d; p.x += dx * push; p.z += dz * push; }
        else { const l = p.x - minX, rr = maxX - p.x, t = p.z - minZ, b = maxZ - p.z, m = Math.min(l, rr, t, b); if (m === l) p.x = minX - r; else if (m === rr) p.x = maxX + r; else if (m === t) p.z = minZ - r; else p.z = maxZ + r; }
      }
    }
    return p;
  }
  computeFlow(px, pz) {
    const w = this.w, flow = this.flow; flow.fill(-1);
    const sx = Math.floor(px / CELL), sz = Math.floor(pz / CELL);
    if (this.blocked(sx, sz)) return;
    const q = this._queue; let head = 0, tail = 0; q[tail++] = sz * w + sx; flow[sz * w + sx] = 0;
    while (head < tail) {
      const i = q[head++], cx = i % w, cz = (i / w) | 0, d = flow[i] + 1;
      for (let k = 0; k < 4; k++) { const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0), nz = cz + (k === 2 ? 1 : k === 3 ? -1 : 0); if (this.blocked(nx, nz)) continue; const ni = nz * w + nx; if (flow[ni] !== -1) continue; flow[ni] = d; q[tail++] = ni; }
    }
  }
  flowTarget(x, z, playerX, playerZ, out) {
    const w = this.w, cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    const here = this.blocked(cx, cz) ? -1 : this.flow[cz * w + cx];
    if (here <= 1) { out.x = playerX; out.z = playerZ; return out; }
    let best = here, bx = cx, bz = cz;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue; const nx = cx + dx, nz = cz + dz; if (this.blocked(nx, nz)) continue;
      if (dx && dz && (this.blocked(cx + dx, cz) || this.blocked(cx, cz + dz))) continue;
      const dd = this.flow[nz * w + nx], score = dd - (dx && dz ? 0.01 : 0);
      if (dd >= 0 && score < best) { best = score; bx = nx; bz = nz; }
    }
    out.x = (bx + 0.5) * CELL; out.z = (bz + 0.5) * CELL; return out;
  }
  reachable(x, z) { const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); return !this.blocked(cx, cz) && this.flow[cz * this.w + cx] >= 0; }
}
