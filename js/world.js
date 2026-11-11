// The Hotel: a randomly generated floor of dark wooden rooms joined by numbered (sometimes locked)
// doors. Each floor is a grid of rooms with a guaranteed path from the entry to the stairs down,
// plus extra doors that branch and loop. Owns collision, the enemy flow-field, and interactables.
import * as THREE from 'three';
import { WEAPONS } from './data.js';
import { buildWeaponModel } from './models.js';

export const CELL = 2;
export const WALL_H = 3.3;
const ROOM = 7, PITCH = ROOM + 1, MID = 3;

// ---- small seeded RNG so a floor can be regenerated identically if needed ----
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function canvasTexture(w, h, draw, shrink = 2) {
  const big = document.createElement('canvas'); big.width = w; big.height = h;
  draw(big.getContext('2d'), w, h);
  let c = big;
  if (shrink > 1) { c = document.createElement('canvas'); c.width = Math.max(8, w / shrink | 0); c.height = Math.max(8, h / shrink | 0); c.getContext('2d').drawImage(big, 0, 0, c.width, c.height); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}
function speckle(g, w, h, n, colors, min = 1, max = 4) {
  for (let i = 0; i < n; i++) { g.fillStyle = colors[i % colors.length]; const s = min + ((i * 7919) % 97) / 97 * (max - min); g.fillRect(((i * 2654435761) >>> 0) % w, ((i * 40503) >>> 0) % h, s, s); }
}
function labelSprite(lines, color = '#d8c38a', scaleX = 1.4) {
  const tex = canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = 'rgba(8,6,5,0.82)'; g.fillRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 5; g.strokeRect(4, 4, w - 8, h - 8);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color;
    g.font = 'bold 40px Georgia, serif'; g.fillText(lines[0], w / 2, lines[1] ? 44 : h / 2);
    if (lines[1]) { g.fillStyle = '#efe6cf'; g.font = 'bold 30px Georgia, serif'; g.fillText(lines[1], w / 2, 90); }
  }, 1);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(scaleX, scaleX * 0.5, 1);
  return s;
}

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
    const scene = this.scene;
    const L = (o) => new THREE.MeshLambertMaterial(o);
    const wallMat = L({ map: this._wallpaper() });
    const woodMat = L({ map: this._woodTex() });
    const darkWood = L({ color: 0x241812 });
    const ironMat = L({ color: 0x2a2a30 });
    const goldMat = L({ color: 0xb9992f, emissive: 0x241a06 });
    const fabric = L({ color: 0x4a1420 });
    this._L = L;
    this._mats = { woodMat, ironMat, goldMat, darkWood, fabric };

    const walls = [];
    for (let cz = 0; cz < this.h; cz++) for (let cx = 0; cx < this.w; cx++) {
      if (this.blockedGrid[cz * this.w + cx] !== 1) continue;
      if (this.doors.some(d => d.cx === cx && d.cz === cz)) continue;
      const [x, z] = this.center(cx, cz);
      walls.push({ x, z });
    }
    this.wallMesh = new THREE.Mesh(this._mergeCubes(walls, CELL, WALL_H), wallMat);
    scene.add(this.wallMesh); this.solids.push(this.wallMesh);

    const floorT = this._floorTex(); floorT.wrapS = floorT.wrapT = THREE.RepeatWrapping; floorT.repeat.set(this.w, this.h);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(this.w * CELL, this.h * CELL), L({ map: floorT }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(this.w * CELL / 2, 0, this.h * CELL / 2);
    scene.add(floor); this.solids.push(floor);
    const ceilT = this._ceilTex(); ceilT.wrapS = ceilT.wrapT = THREE.RepeatWrapping; ceilT.repeat.set(this.w, this.h);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(this.w * CELL, this.h * CELL), L({ map: ceilT }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(this.w * CELL / 2, WALL_H, this.h * CELL / 2);
    scene.add(ceil); this.solids.push(ceil);

    scene.add(new THREE.AmbientLight(0x161320, 0.5));
    scene.add(new THREE.HemisphereLight(0x24222f, 0x100b07, 0.3));

    for (const r of this.rooms) this._dressRoom(r);
    for (const d of this.doors) this._buildDoor(d);
  }

  _mergeCubes(list, size, height) {
    const pos = [], nor = [], uv = [];
    for (const b of list) { const g = new THREE.BoxGeometry(size, height, size).toNonIndexed(); g.translate(b.x, height / 2, b.z); pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array); g.dispose(); }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    out.computeBoundingSphere();
    return out;
  }

  _dressRoom(r) {
    const scene = this.scene, M = this._mats, L = this._L, rng = this.rng, cx = r.cx, cz = r.cz;
    const stairs = r.id === this.stairsRoom;
    const warm = stairs ? 0x9fd8ff : 0xffb86a;
    const lamp = new THREE.PointLight(warm, 10, 13, 1.7); lamp.position.set(cx, WALL_H - 0.4, cz); scene.add(lamp);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshBasicMaterial({ color: warm })); bulb.position.copy(lamp.position); scene.add(bulb);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4), M.darkWood); cord.position.set(cx, WALL_H - 0.2, cz); scene.add(cord);
    this.lamps.push(lamp);
    const flick = !stairs && rng() < 0.5, seed = r.id * 3.3;
    this.animated.push(t => { const f = flick ? (Math.sin(t * 31 + seed) > -0.7 && Math.sin(t * 7 + seed) > -0.9 ? 1 : 0.14) : (0.85 + 0.15 * Math.sin(t * 2 + seed)); lamp.intensity = 10 * f; bulb.visible = f > 0.3; });

    const prop = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m; };
    prop(new THREE.BoxGeometry(CELL * 2.4, 0.03, CELL * 2.4), M.fabric, cx, 0.02, cz);   // rug
    if (rng() < 0.6) {
      const bx = r.x0 * CELL + CELL * 1.4, bz = r.z0 * CELL + CELL * 1.4;
      prop(new THREE.BoxGeometry(1.3, 0.5, 2.1), M.darkWood, bx, 0.25, bz);
      prop(new THREE.BoxGeometry(1.3, 0.25, 2.1), L({ color: 0x6a5542 }), bx, 0.6, bz);
      prop(new THREE.BoxGeometry(1.3, 0.7, 0.2), M.darkWood, bx, 0.6, bz - 1.0);
    } else {
      prop(new THREE.BoxGeometry(1.2, 1.2, 0.7), M.woodMat, (r.x0 + ROOM - 1.6) * CELL, 0.6, (r.z0 + 1.2) * CELL);
    }
    prop(new THREE.BoxGeometry(0.9, 0.7, 0.06), M.darkWood, cx, 1.9, r.z0 * CELL + 0.12);   // picture

    if (r.id === this.startRoom) this._buildArrival(cx, cz);
    else if (stairs) this._buildStairs(cx, cz);
    else if (r.feature) this._buildFeature(r);
  }

  _buildArrival(cx, cz) {
    const scene = this.scene;
    const car = new THREE.Mesh(new THREE.BoxGeometry(2.2, WALL_H - 0.2, 0.4), this._mats.ironMat);
    car.position.set(cx, (WALL_H - 0.2) / 2, cz - CELL * 2.4); scene.add(car);
    const light = new THREE.PointLight(0xa8c8ff, 6, 8, 2); light.position.set(cx, 2.4, cz - CELL * 2.1); scene.add(light);
    const label = labelSprite(['FLOOR ' + this.floor], '#a8c8ff'); label.position.set(cx, 2.7, cz - CELL * 2.1); scene.add(label);
  }

  _buildStairs(cx, cz) {
    const scene = this.scene;
    for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(CELL * 2, 0.24, 0.5), this._mats.darkWood); s.position.set(cx, 0.12, cz + CELL + i * 0.5); scene.add(s); }
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 2, 1.6), new THREE.MeshBasicMaterial({ color: 0x000000 })); mouth.position.set(cx, 0.9, cz + CELL * 1.9); scene.add(mouth);
    const label = labelSprite(['STAIRS DOWN', 'FLOOR ' + (this.floor + 1)], '#9fd8ff'); label.position.set(cx, 2.6, cz + CELL); scene.add(label);
    this.interactables.push({ type: 'stairs', x: cx, z: cz + CELL * 1.3 });
  }

  _buildFeature(r) {
    const f = r.feature, cx = r.cx, cz = r.cz;
    if (f.type === 'wallbuy') this._buildRack(cx, cz, f.weapon);
    else if (f.type === 'box') this._buildMystery(cx, cz);
    else if (f.type === 'perk') this._buildShrine(cx, cz, f.perk);
    else if (f.type === 'ammo') this._buildAmmo(cx, cz);
  }

  _buildRack(x, z, weapon) {
    const scene = this.scene, w = WEAPONS[weapon], M = this._mats;
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.9, 0.5), M.woodMat); post.position.y = 0.95; g.add(post);
    const model = buildWeaponModel(weapon); model.scale.setScalar(1.7); model.rotation.y = Math.PI / 2; model.position.set(0, 1.25, 0); g.add(model);
    const label = labelSprite([w.name.toUpperCase(), w.cost + ' pts']); label.position.y = 2.6; g.add(label);
    const light = new THREE.PointLight(0xffd68a, 5, 6, 2); light.position.y = 2.2; g.add(light);
    scene.add(g);
    this.interactables.push({ type: 'wallbuy', weapon, cost: w.cost, x, z });
  }

  _buildMystery(x, z) {
    const scene = this.scene, M = this._mats;
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.3, 1.7), M.woodMat); body.position.y = 0.65;
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xb44cff });
    const glow = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.1, 1.76), glowMat); glow.position.y = 1.32;
    g.add(body, glow);
    const label = labelSprite(['MYSTERY BOX', BOX_COST + ' pts'], '#c77dff'); label.position.y = 2.9; g.add(label);
    const display = new THREE.Group(); display.position.y = 2.1; g.add(display);
    const light = new THREE.PointLight(0xb44cff, 12, 9, 1.8); light.position.y = 2.2; g.add(light);
    scene.add(g);
    this.mystery = { x, z, display, glowMat, light };
    this.animated.push(t => { glowMat.color.setHex(Math.sin(t * 5) > 0 ? 0xb44cff : 0x7a2fd0); display.rotation.y = t * 1.6; });
    this.interactables.push({ type: 'box', x, z });
  }

  _buildShrine(x, z, perk) {
    const scene = this.scene, M = this._mats;
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const mat = new THREE.MeshBasicMaterial({ color: perk.color });
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.3, 0.8), M.darkWood); pillar.position.y = 0.65;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.34), mat); gem.position.y = 1.6; g.add(pillar, gem);
    const label = labelSprite([perk.name.toUpperCase(), perk.cost + ' pts'], '#' + perk.color.toString(16).padStart(6, '0')); label.position.y = 2.5; g.add(label);
    const light = new THREE.PointLight(perk.color, 5, 6, 2); light.position.y = 1.8; g.add(light);
    scene.add(g);
    this.animated.push(t => { gem.rotation.y = t * 1.5; gem.position.y = 1.6 + Math.sin(t * 2 + x) * 0.08; });
    this.interactables.push({ type: 'perk', perk, x, z });
  }

  _buildAmmo(x, z) {
    const scene = this.scene;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 1.0), this._L({ color: 0x3f3a2a })); crate.position.set(x, 0.4, z); scene.add(crate);
    const label = labelSprite(['AMMO', AMMO_COST + ' pts'], '#9fdc6a'); label.position.set(x, 1.6, z); scene.add(label);
    this.interactables.push({ type: 'ammo', x, z });
  }

  _buildDoor(d) {
    const [x, z] = this.center(d.cx, d.cz);
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.96, WALL_H, CELL * 0.5), new THREE.MeshLambertMaterial({ map: this._doorTex(d) }));
    slab.position.y = WALL_H / 2;
    if (d.vertical) g.rotation.y = Math.PI / 2;
    g.add(slab);
    d.labelSprite = labelSprite([String(d.number), d.locked ? 'LOCKED' : ''], d.locked ? '#ff6a6a' : '#d8c38a', 0.9);
    d.labelSprite.position.y = WALL_H + 0.35; g.add(d.labelSprite);
    this.scene.add(g); g.updateMatrixWorld(true);
    d.group = g; d.slab = slab;
    this.solids.push(slab);
  }

  openDoor(d) {
    if (d.open) return false;
    d.open = true;
    this.blockedGrid[d.cz * this.w + d.cx] = 0;
    const i = this.solids.indexOf(d.slab); if (i >= 0) this.solids.splice(i, 1);
    return true;
  }

  update(time) {
    this.time = time;
    for (const fn of this.animated) fn(time);
    const dt = Math.min(Math.max(time - (this._lastT ?? time), 0), 0.2); this._lastT = time;
    for (const d of this.doors) {
      if (!d.open) continue;
      if (d.slab.position.y > -WALL_H / 2) d.slab.position.y -= dt * 2.4;
      d.group.visible = d.slab.position.y > -WALL_H / 2;
    }
  }

  // ---- textures ----
  _wallpaper() {
    return canvasTexture(128, 256, (g, w, h) => {
      g.fillStyle = '#2a2018'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 16) { g.fillStyle = (x / 16) % 2 ? '#352619' : '#2e2116'; g.fillRect(x, 0, 16, h); }
      g.fillStyle = 'rgba(150,120,70,0.14)';
      for (let y = 14; y < h; y += 40) for (let x = 8; x < w; x += 32) { g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.fill(); }
      g.fillStyle = '#20150d'; g.fillRect(0, h * 0.7, w, h * 0.3);
      g.fillStyle = '#3a2817'; g.fillRect(0, h * 0.69, w, 6);
      speckle(g, w, h, 160, ['rgba(0,0,0,0.3)', 'rgba(60,40,10,0.3)', 'rgba(20,30,10,0.25)'], 2, 9);
      const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, 'rgba(0,0,0,0.5)'); grad.addColorStop(0.3, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.45)');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    });
  }
  _floorTex() {
    return canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = '#3a2a1a'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#3d2c1a' : '#45321e'; g.fillRect(i * 16, 0, 15, h); }
      g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, h); g.stroke(); }
      speckle(g, w, h, 120, ['rgba(0,0,0,0.3)', 'rgba(120,20,20,0.12)'], 2, 7);
    });
  }
  _ceilTex() { return canvasTexture(64, 64, (g, w, h) => { g.fillStyle = '#17110c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#241a12'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4); speckle(g, w, h, 40, ['rgba(0,0,0,0.4)'], 2, 6); }); }
  _woodTex() { return canvasTexture(64, 64, (g, w, h) => { for (let i = 0; i < 4; i++) { g.fillStyle = ['#4a3220', '#3d2a1a', '#523926', '#38271a'][i]; g.fillRect(i * 16, 0, 16, h); } g.strokeStyle = '#241509'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4); }); }
  _doorTex(d) {
    return canvasTexture(96, 160, (g, w, h) => {
      g.fillStyle = '#3a2615'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#2e1d10'; g.fillRect(10, 12, w - 20, 60); g.fillRect(10, 86, w - 20, 60);
      g.fillStyle = d.locked ? '#7a1a1a' : '#b9992f'; g.fillRect(w - 26, h / 2 - 8, 14, 16);
      speckle(g, w, h, 60, ['rgba(0,0,0,0.3)', 'rgba(120,90,40,0.1)'], 2, 7);
    });
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
