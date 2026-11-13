// The Hotel: a randomly generated floor of old wooden rooms joined by numbered (sometimes locked)
// doors. Each floor is a grid of rooms with a guaranteed path from the entry to the stairs down,
// plus extra doors that branch and loop. Owns collision, the enemy flow-field, and interactables.
import * as THREE from 'three';
import { WEAPONS } from './data.js';
import { buildWeaponModel } from './models.js';
import { Batcher, tex, speckle, flat, glow, mapped, sprite, mats, furn, numberTex, windowTex, elevatorTex, plaqueTex } from './build.js';
import { ZONES } from './zones.js';

export const CELL = 2;
export const WALL_H = 3.3;
const ROOM = 7, PITCH = ROOM + 1, MID = 3;

// ---- small seeded RNG so a floor can be regenerated identically if needed ----
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Tight collider footprints for furniture, in the piece's own local frame: [lx, lz, hw, hd].
// lx/lz is the box centre offset from the cell centre (pieces sit with their back at z = -1),
// hw/hd are half-width and half-depth. Two-cell pieces (bed, sofa) are offset by lx = 1.
const FOOT = {
  wardrobe: [0, -0.6, 0.76, 0.42], dresser: [0, -0.64, 0.76, 0.36], bookshelf: [0, -0.73, 0.82, 0.3],
  desk: [0, -0.3, 0.76, 0.74], armchair: [0, -0.5, 0.52, 0.46], clock: [0, -0.76, 0.34, 0.26],
  plant: [0, -0.5, 0.4, 0.4], luggage: [0, -0.52, 0.55, 0.4], crates: [0, -0.45, 0.55, 0.5],
  bed: [1, -0.22, 1.12, 0.78], sofa: [1, -0.5, 1.42, 0.46],
  trolley: [0, 0, 0.76, 0.42], linen: [0, 0, 0.68, 0.38],
};

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
  constructor(scene, floor = 1, seed = (Math.random() * 1e9) | 0, zone = ZONES[0]) {
    this.scene = scene;
    this.floor = floor;
    this.Z = this.zone = zone;
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
    this.obstacles = [];   // oriented boxes for furniture / carts / feature props
    this.wallGrid = null;  // structural walls + doors only (furniture excluded), for player collision
    this.animated = [];
    this.lamps = [];
    this.ramps = [];       // sloped / raised floor regions: { minX, maxX, minZ, maxZ, axis, from, to }
    this.floorHoles = new Set();   // cells the floor plane skips, so stairwells are open
    this.descendY = -2.4;  // walk below this on the stairwell and the next floor loads
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

  // Floor height at a point. Flat everywhere except ramps (stairs) and raised landings.
  heightAt(x, z) {
    let y = 0;
    for (const r of this.ramps) {
      if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
      if (r.from === r.to) { y = r.to; continue; }
      const a = r.axis === 'x' ? x : z, t = Math.max(0, Math.min(1, (a - r.a0) / (r.a1 - r.a0)));
      y = r.from + (r.to - r.from) * t;
    }
    return y;
  }
  wallBlocked(cx, cz) { return (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) ? true : (this.wallGrid || this.blockedGrid)[cz * this.w + cx] === 1; }

  // Register a furniture collider. (px, pz) is the push origin (cell centre); ry the piece's rotation;
  // (lx, lz, hw, hd) its local footprint. The box is placed in world space, oriented by ry.
  _obstacle(px, pz, ry, lx, lz, hw, hd) {
    const c = Math.cos(ry), sn = Math.sin(ry);
    this.obstacles.push({ x: px + lx * c + lz * sn, z: pz - lx * sn + lz * c, hw, hd, c, s: sn });
  }
  _foot(px, pz, ry, kind) { const f = FOOT[kind]; if (f) this._obstacle(px, pz, ry, f[0], f[1], f[2], f[3]); }
  roomAt(x, z) { const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); return (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) ? 0 : this.roomOf[cz * this.w + cx]; }
  roomCenter(id) { const r = this.rooms[id - 1]; return r ? [r.cx, r.cz] : [this.w, this.h]; }
  roomSpawns(id) { return this.spawns.filter(s => s.room === id); }

  // ---- generation ----
  // A floor is one long corridor of rooms from the elevator to the stairs, with the odd dead-end
  // side room (sometimes locked) hanging off it. No loops, no way to get lost.
  _genLayout() {
    const rng = this.rng, GW = this.gw, GH = this.gh, N = GW * GH;
    for (let row = 0; row < GH; row++) for (let col = 0; col < GW; col++) {
      const id = this.roomIndex(col, row) + 1, x0 = 1 + col * PITCH, z0 = 1 + row * PITCH;
      this.rooms.push({ id, col, row, x0, z0, cx: (x0 + MID + 0.5) * CELL, cz: (z0 + MID + 0.5) * CELL, feature: null, used: false, side: false });
    }
    const nbrs = i => { const c = i % GW, r = (i / GW) | 0, out = []; if (c + 1 < GW) out.push(i + 1); if (c > 0) out.push(i - 1); if (r + 1 < GH) out.push(i + GW); if (r > 0) out.push(i - GW); return out; };

    // main path: a self-avoiding walk that hugs unvisited corners so it snakes through most of the grid
    const walk = () => {
      const seen = new Array(N).fill(false), path = [0]; seen[0] = true;
      for (;;) {
        const free = nbrs(path[path.length - 1]).filter(n => !seen[n]);
        if (!free.length) break;
        const onward = n => nbrs(n).filter(m => !seen[m]).length;
        let next = free[(rng() * free.length) | 0];
        if (rng() < 0.85) { let best = 9; for (const n of free) { const o = onward(n) + rng() * 0.5; if (o < best) { best = o; next = n; } } }
        seen[next] = true; path.push(next);
      }
      return path;
    };
    let path = walk();
    for (let tries = 0; tries < 12 && path.length < N * 0.7; tries++) { const p2 = walk(); if (p2.length > path.length) path = p2; }
    path = path.slice(0, Math.min(6 + this.floor * 2, 16));   // floors get longer as you go down
    const onPath = new Set(path);
    this.startRoom = 1; this.stairsRoom = path[path.length - 1] + 1;
    this.path = path.map(i => i + 1);
    for (const i of path) this.rooms[i].used = true;

    let number = 0;
    const addDoor = (a, b, locked) => {
      const ac = a % GW, ar = (a / GW) | 0, bc = b % GW, br = (b / GW) | 0;
      let cx, cz, vertical;
      if (ar === br) { vertical = true; cx = (Math.min(ac, bc) + 1) * PITCH; cz = 1 + ar * PITCH + MID; }
      else { vertical = false; cz = (Math.min(ar, br) + 1) * PITCH; cx = 1 + ac * PITCH + MID; }
      this.doors.push({ id: this.doors.length, number: ++number, a: a + 1, b: b + 1, cx, cz, vertical, locked, open: false });
    };
    for (let i = 1; i < path.length; i++) addDoor(path[i - 1], path[i], false);

    // side rooms: leftover rooms that touch the path become dead ends off it
    const sides = [];
    for (let i = 0; i < N; i++) {
      if (onPath.has(i)) continue;
      const hosts = nbrs(i).filter(n => onPath.has(n) && n !== path[path.length - 1]);
      if (!hosts.length || sides.length >= 3 || rng() < 0.45) continue;
      const host = hosts[(rng() * hosts.length) | 0];
      this.rooms[i].used = true; this.rooms[i].side = true; sides.push(this.rooms[i]);
      addDoor(host, i, rng() < 0.45);
    }

    // some plain stretches of the path are thin service corridors instead of full rooms
    const dirOf = (from, to) => { const d = to - from; return d === 1 ? 'E' : d === -1 ? 'W' : d > 0 ? 'S' : 'N'; };
    for (const r of this.rooms) r.dirs = [];
    for (const d of this.doors) { this.rooms[d.a - 1].dirs.push(dirOf(d.a - 1, d.b - 1)); this.rooms[d.b - 1].dirs.push(dirOf(d.b - 1, d.a - 1)); }
    for (let i = 2; i < path.length - 1; i++) if (rng() < 0.4 && !this.rooms[path[i - 1]].hall) this.rooms[path[i]].hall = true;
    const lane = (r, dx, dz) => r.dirs.some(k => k === 'N' ? (dx >= 2 && dx <= 4 && dz <= 4) : k === 'S' ? (dx >= 2 && dx <= 4 && dz >= 2) : k === 'W' ? (dz >= 2 && dz <= 4 && dx <= 4) : (dz >= 2 && dz <= 4 && dx >= 2));

    // carve the rooms that exist, then close the doorways
    for (const r of this.rooms) {
      if (!r.used) continue;
      for (let dz = 0; dz < ROOM; dz++) for (let dx = 0; dx < ROOM; dx++) { const k = (r.z0 + dz) * this.w + r.x0 + dx; this.roomOf[k] = r.id; if (!r.hall || lane(r, dx, dz)) this.blockedGrid[k] = 0; }
      const pts = r.hall ? r.dirs.map(k => k === 'N' ? [3, 1] : k === 'S' ? [3, 5] : k === 'W' ? [1, 3] : [5, 3]) : [[1, 1], [ROOM - 2, 1], [1, ROOM - 2], [ROOM - 2, ROOM - 2]];
      for (const [dx, dz] of pts) this.spawns.push({ x: (r.x0 + dx + 0.5) * CELL, z: (r.z0 + dz + 0.5) * CELL, room: r.id });
    }
    for (const d of this.doors) { this.blockedGrid[d.cz * this.w + d.cx] = 1; this.roomOf[d.cz * this.w + d.cx] = Math.min(d.a, d.b); }

    const sr = this.rooms[0];
    this.playerSpawn.set((sr.x0 + MID + 0.5) * CELL, 0, (sr.z0 + MID + 0.5) * CELL);

    // the good stuff sits in the side rooms; ammo and a cheap gun are always on the main path
    const mid = path.slice(1, -1).map(i => this.rooms[i]).filter(r => !r.hall);
    const prizes = [{ type: 'box' }, { type: 'perk', perk: PERKS.thick }, { type: 'perk', perk: PERKS.hands }, { type: 'wallbuy', weapon: 'ar' }];
    for (let i = prizes.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [prizes[i], prizes[j]] = [prizes[j], prizes[i]]; }
    for (const r of sides) r.feature = prizes.shift() || { type: 'ammo' };
    if (mid.length) mid[0].feature = { type: 'wallbuy', weapon: 'smg' };
    if (mid.length > 2) mid[Math.min(mid.length - 1, 3)].feature = { type: 'wallbuy', weapon: 'shotgun' };
    for (let i = 2; i < mid.length; i += 3) if (!mid[i].feature) mid[i].feature = { type: 'ammo' };
    for (const r of mid) if (!r.feature && prizes.length && rng() < 0.5) r.feature = prizes.shift();
  }

  // ---- geometry ----
  _build() {
    const scene = this.scene, M = this.M = mats(), w = this.w;
    const S = this.S = new Batcher(), D = this.D = new Batcher();
    const Z = this.Z, K = this.kit = Z.mats(this.floor);
    const paper = K.wall;
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
    S.plane(K.ceil, W, Hh, W / 2, WALL_H, Hh / 2, w, this.h, true);

    scene.add(new THREE.AmbientLight(Z.ambient[0], Z.ambient[1]));
    scene.add(new THREE.HemisphereLight(Z.hemi[0], Z.hemi[1], Z.hemi[2]));

    this.wallGrid = this.blockedGrid.slice();   // structural only; furniture is added below as colliders
    for (const r of this.rooms) { if (r.used) this._dressRoom(r); else this.lamps.push(null); }
    for (const d of this.doors) this._buildDoor(d);
    // the floor goes down last, cell by cell, skipping anything a stairwell has opened up
    for (let cz = 0; cz < this.h; cz++) for (let cx = 0; cx < w; cx++) {
      if (this.floorHoles.has(cz * w + cx)) continue;
      S.plane(K.floor, CELL, CELL, (cx + 0.5) * CELL, 0, (cz + 0.5) * CELL);
    }
    this.solids.push(...S.build(scene));
    D.build(scene);
  }

  _dressRoom(r) {
    const scene = this.scene, M = this.M, D = this.D, S = this.S, rng = this.rng, cx = r.cx, cz = r.cz, w = this.w;
    const stairs = r.id === this.stairsRoom, start = r.id === this.startRoom;

    // rug (if the zone has them) + the zone's ceiling light
    const Z = this.Z, K = this.kit, L = Z.lamp;
    const rugMat = Z.rug ? Z.rug(K, r) : null;
    if (!stairs && rugMat) D.plane(rugMat, r.hall ? 3.4 : 4.8, r.hall ? 3.4 : 4.8, cx, 0.02, cz);
    const dead = !stairs && !start && rng() < L.dead, flick = !dead && !start && rng() < L.flick;
    const col = stairs ? 0xd0ffdc : L.color, base = dead ? 0 : L.base;
    L.fixture(D, M, cx, cz, WALL_H, dead);
    const bulbY = WALL_H - (L.bulbY ?? 0.92);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(L.bulbR ?? 0.1, 6, 4), glow(dead ? 0x2a2620 : L.bulb)); bulb.position.set(cx, bulbY, cz); scene.add(bulb);
    const lamp = new THREE.PointLight(col, base, L.dist ?? 17, 1.4); lamp.position.set(cx, WALL_H - 1.0, cz); scene.add(lamp);
    lamp.userData.base = base; lamp.userData.bulb = bulb;
    this.lamps.push(lamp);
    if (flick) { const seed = r.id * 3.3; this.animated.push(t => { const on = Math.sin(t * 31 + seed) > -0.6 && Math.sin(t * 7 + seed) > -0.85; lamp.intensity = on ? base : base * 0.12; bulb.visible = on; }); }

    if (r.hall) { this._dressHall(r); return; }

    // wall slots: every perimeter cell except the four door positions
    const used = new Set(), key = (a, b) => b * w + a;
    const cellOf = (wall, i) => wall === 0 ? [r.x0 + i, r.z0] : wall === 1 ? [r.x0 + i, r.z0 + ROOM - 1] : wall === 2 ? [r.x0, r.z0 + i] : [r.x0 + ROOM - 1, r.z0 + i];
    const ROT = [0, Math.PI, Math.PI / 2, -Math.PI / 2], NEXT = [1, -1, -1, 1];
    const at = (wall, i, fn, B = D) => { const [a, b] = cellOf(wall, i), [x, z] = this.center(a, b); B.push(x, 0, z, ROT[wall]); fn(B); B.pop(); };
    const block = (a, b) => { this.blockedGrid[b * w + a] = 1; used.add(key(a, b)); };

    if (start) { used.add(key(...cellOf(0, 2))); used.add(key(...cellOf(0, 4))); this._buildArrival(r); }

    // the slot machinery the zone hooks use
    const slots = []; for (let wall = 0; wall < 4; wall++) for (const i of [0, 1, 2, 4, 5, 6]) slots.push([wall, i]);
    for (let i = slots.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [slots[i], slots[j]] = [slots[j], slots[i]]; }
    const api = { W: this, r, S, D, M, K, rng, cellOf, ROT, NEXT, used, key, at, block, slots };
    if (Z.walls) Z.walls(api);

    // props along the walls; each one blocks its cell and gets a collider
    const kinds = Z.slots, wide = Z.wide || [], limit = Z.limit || {}, counts = {};
    let want = Math.max(2, Math.round((4 + ((rng() * 4) | 0)) * (Z.density ?? 1))), closets = 0;
    for (const [wall, i] of slots) {
      if (want <= 0) break;
      const [a, b] = cellOf(wall, i); if (used.has(key(a, b))) continue;
      let kind = closets ? kinds[(rng() * kinds.length) | 0] : Z.closet;
      if (limit[kind] && (counts[kind] || 0) >= limit[kind]) { kind = kinds.find(k => !limit[k] || (counts[k] || 0) < limit[k]); if (!kind) break; }
      if (wide.includes(kind)) {
        const j = i + NEXT[wall]; if (j < 0 || j > 6 || j === 3) continue;
        const [a2, b2] = cellOf(wall, j); if (used.has(key(a2, b2))) continue;
        block(a2, b2);
      }
      block(a, b); want--; counts[kind] = (counts[kind] || 0) + 1;
      if (kind === Z.closet) { closets++; const [x, z] = this.center(a, b); this.interactables.push({ type: 'closet', x, z, ry: ROT[wall] }); }
      at(wall, i, B => Z.build[kind](B, M, K), S);
      const f = Z.foot[kind], [fx, fz] = this.center(a, b);
      if (f) this._obstacle(fx, fz, ROT[wall], f[0], f[1], f[2], f[3]);
    }
    if (Z.room) Z.room(api);

    if (stairs) this._buildStairs(cx, cz);
    else if (r.feature) this._buildFeature(r);
  }

  // A thin corridor: carts parked along the sides to weave around, and one wardrobe to hide in.
  _dressHall(r) {
    const S = this.S, D = this.D, M = this.M, rng = this.rng, w = this.w, Z = this.Z, K = this.kit;
    const narrow = Z.slots.filter(k => !(Z.wide || []).includes(k) && k !== Z.closet);
    const pick = () => narrow.length ? narrow[(rng() * narrow.length) | 0] : Z.closet;
    const place = (x, z, ry, kind) => { S.push(x, 0, z, ry); Z.build[kind](S, M, K); S.pop(); const f = Z.foot[kind]; if (f) this._obstacle(x, z, ry, f[0], f[1], f[2], f[3]); };
    let closet = false;
    for (const k of r.dirs) {
      const ns = k === 'N' || k === 'S', outer = (k === 'N' || k === 'W') ? [0, 1] : [6, 5];
      const sideA = rng() < 0.5 ? 2 : 4, sideB = 6 - sideA, p = rng() < 0.5 ? 0 : 1;
      const put = (side, along, fn) => {
        const dx = ns ? side : along, dz = ns ? along : side, a = r.x0 + dx, b = r.z0 + dz, [x, z] = this.center(a, b);
        this.blockedGrid[b * w + a] = 1; fn(x, z, side);
      };
      put(sideA, outer[p], (x, z) => place(x, z, ns ? Math.PI / 2 : 0, pick()));
      if (!closet) {
        closet = true;
        put(sideB, outer[1 - p], (x, z, side) => {
          const ry = ns ? (side === 2 ? Math.PI / 2 : -Math.PI / 2) : (side === 2 ? 0 : Math.PI);
          place(x, z, ry, Z.closet);
          this.interactables.push({ type: 'closet', x, z, ry });
        });
      } else if (rng() < 0.5) put(sideB, outer[1 - p], (x, z, side) => place(x, z, ns ? (side === 2 ? Math.PI / 2 : -Math.PI / 2) : (side === 2 ? 0 : Math.PI), pick()));
      // sconces down the corridor walls
      for (const side of [2, 4]) { const dx = ns ? side : outer[0], dz = ns ? outer[0] : side, [x, z] = this.center(r.x0 + dx, r.z0 + dz); const ry = ns ? (side === 2 ? Math.PI / 2 : -Math.PI / 2) : (side === 2 ? 0 : Math.PI); if (Z.id === 'hotel' && !this.blockedGrid[(r.z0 + dz) * w + r.x0 + dx]) { D.push(x, 0, z, ry); furn.sconce(D, M, 2.3); D.pop(); } }
    }
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

  // A real stairwell: two cells of steps sinking into the floor, grid-aligned so the hole in the
  // floor lines up with the flight. Walk to the bottom and the next floor loads.
  buildStairwell(cx, cz) {
    const scene = this.scene, D = this.D, M = this.M, drop = 2.6;
    const a = Math.floor(cx / CELL), b = Math.floor(cz / CELL);
    const x0 = a * CELL, z0 = b * CELL, z1 = z0 + CELL * 2, mx = x0 + CELL / 2;
    this.ramps.push({ minX: x0, maxX: x0 + CELL, minZ: z0, maxZ: z1, axis: 'z', a0: z0, a1: z1, from: 0, to: -drop });
    for (const bb of [b, b + 1]) { this.floorHoles.add(bb * this.w + a); this.blockedGrid[bb * this.w + a] = 0; }

    const n = 10, run = z1 - z0;
    for (let i = 0; i < n; i++) {
      const t = i / n, zz = z0 + run * (t + 0.5 / n), y = -drop * t;
      D.box(M.dark, CELL, 0.1, run / n + 0.03, mx, y - 0.05, zz);
      D.box(M.black, CELL, drop / n + 0.04, 0.05, mx, y - drop / n / 2, zz - run / n * 0.5);
    }
    D.box(M.black, CELL, 2.2, 0.2, mx, -drop - 1.0, z1 - 0.1);       // the dark below
    D.box(M.black, CELL + 0.3, 0.3, 0.3, mx, -drop - 0.15, z1 - 0.15);
    for (const sx of [-CELL / 2 - 0.07, CELL / 2 + 0.07]) {
      D.box(M.dark, 0.16, drop + 1.2, run + 0.1, mx + sx, -drop / 2 + 0.1, z0 + run / 2);
      D.cyl(M.brass, 0.05, 0.05, run + 0.2, mx + sx * 0.8, 0.6 - drop / 2, z0 + run / 2, 6, Math.atan2(drop, run), Math.PI / 2);
    }
    const pit = new THREE.PointLight(0xffd9a0, 10, 7, 1.6); pit.position.set(mx, -drop + 0.9, z1 - 0.6); scene.add(pit);
    const signMat = new THREE.MeshBasicMaterial({ map: plaqueTex('EXIT', '#0a3a1a', '#7dffa8') });
    D.box(M.black, 1.25, 0.46, 0.08, mx, 2.55, z0 - 0.08);
    D.add(signMat, new THREE.PlaneGeometry(1.15, 0.38), mx, 2.55, z0 - 0.13);
    D.add(signMat, new THREE.PlaneGeometry(1.15, 0.38), mx, 2.55, z0 - 0.03, Math.PI);
    const label = sprite(['FLOOR ' + (this.floor + 1)], '#7dffa8', 1.25);
    label.position.set(mx, 1.95, z0 - 0.3); scene.add(label);
    this.stairwell = { x: mx, z: z0 + run / 2, top: z0 };
  }

  _buildStairs(cx, cz) { this.buildStairwell(cx, cz); }

  _buildFeature(r) {
    const f = r.feature, cx = r.cx, cz = r.cz;
    this._blockCentre(cx, cz); this._obstacle(cx, cz, 0, 0, 0, 0.84, 0.56);
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
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(LEAF_W, LEAF_H, 0.09), this.kit.door || M.door); leaf.position.set(LEAF_W / 2, LEAF_H / 2, 0); hinge.add(leaf);
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
    if (this.wallGrid) this.wallGrid[d.cz * this.w + d.cx] = 0;
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
    if (this.flicker) {   // every light in the building stutters
      for (let i = 0; i < this.lamps.length; i++) { const l = this.lamps[i]; if (!l) continue; const on = Math.sin(time * 37 + i * 1.7) * Math.sin(time * 11 + i) > 0.1; l.intensity = on ? l.userData.base : l.userData.base * 0.04; l.userData.bulb.visible = on; }
      this._wasFlicker = true;
    } else if (this._wasFlicker) { this._wasFlicker = false; for (const l of this.lamps) if (l) { l.intensity = l.userData.base; l.userData.bulb.visible = true; } }
    const dt = Math.min(Math.max(time - (this._lastT ?? time), 0), 0.2); this._lastT = time;
    for (const d of this.doors) {
      if (!d.open || d.hinge.rotation.y === d.swing) continue;
      const step = dt * 4.5, diff = d.swing - d.hinge.rotation.y;
      d.hinge.rotation.y = Math.abs(diff) <= step ? d.swing : d.hinge.rotation.y + Math.sign(diff) * step;
    }
  }

  // ---- collision + flow ----
  collideCircle(p, r) {
    this._collideWalls(p, r);
    for (const o of this.obstacles) this._collideBox(p, r, o);
    this._collideWalls(p, r);   // a second wall pass in case a box pushed us into one
    return p;
  }

  // Structural walls and closed doors only (furniture is handled by _collideBox).
  _collideWalls(p, r) {
    const x0 = Math.floor((p.x - r) / CELL), x1 = Math.floor((p.x + r) / CELL);
    const z0 = Math.floor((p.z - r) / CELL), z1 = Math.floor((p.z + r) / CELL);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      if (!this.wallBlocked(cx, cz)) continue;
      const minX = cx * CELL, maxX = minX + CELL, minZ = cz * CELL, maxZ = minZ + CELL;
      const nx = Math.max(minX, Math.min(p.x, maxX)), nz = Math.max(minZ, Math.min(p.z, maxZ));
      const dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) { const d = Math.sqrt(d2), push = (r - d) / d; p.x += dx * push; p.z += dz * push; }
      else { const l = p.x - minX, rr = maxX - p.x, t = p.z - minZ, b = maxZ - p.z, m = Math.min(l, rr, t, b); if (m === l) p.x = minX - r; else if (m === rr) p.x = maxX + r; else if (m === t) p.z = minZ - r; else p.z = maxZ + r; }
    }
  }

  // Circle vs oriented box, resolved in the box's local frame.
  _collideBox(p, r, o) {
    const dx = p.x - o.x, dz = p.z - o.z;
    const lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
    const clx = Math.max(-o.hw, Math.min(lx, o.hw)), clz = Math.max(-o.hd, Math.min(lz, o.hd));
    const ddx = lx - clx, ddz = lz - clz, d2 = ddx * ddx + ddz * ddz;
    let nlx, nlz;
    if (d2 > 1e-7) {
      if (d2 >= r * r) return;
      const d = Math.sqrt(d2), f = r / d; nlx = clx + ddx * f; nlz = clz + ddz * f;
    } else {
      const ex = o.hw - Math.abs(lx), ez = o.hd - Math.abs(lz);
      if (ex < ez) { nlx = (lx < 0 ? -o.hw - r : o.hw + r); nlz = lz; } else { nlx = lx; nlz = (lz < 0 ? -o.hd - r : o.hd + r); }
    }
    p.x = o.x + nlx * o.c + nlz * o.s;
    p.z = o.z - nlx * o.s + nlz * o.c;
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
