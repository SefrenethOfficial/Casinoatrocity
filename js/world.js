// The dungeon under the casino: geometry, collision grid, enemy pathing field and interactable spots.
import * as THREE from 'three';
import { WEAPONS } from './data.js';
import { canvasTexture, buildWeaponModel } from './models.js';

export const CELL = 2;
export const WALL_H = 3.6;

// # wall  . floor  C pillar  T tomb slab  S crates  B barrels  F brazier (light)  M mystery slot
// 1/2/3 weapon racks  J/Q shrines (perks)  Z enemy spawn pit  P player spawn
const MAP = [
  '###############################',
  '#Z....#.........Z.....#......Z#',
  '#.....#...............#.......#',
  '#..TT.#..C....F....C..#..BB...#',
  '#..TT.................#..B....#',
  '#.....#...............#.......#',
  '#F....#..C.........C.....S.J..#',
  '#.1...#...............#.......#',
  '###.#####.....#.....#####..####',
  '#...#...#.....#.....#.........#',
  '#...#.F.......#.............F.#',
  '#...#...#..TT...TT..#..S......#',
  '#.......#..TT.P.TT..#.....SS..#',
  '#...#...#...........#.........#',
  '#.F.#...#.....M.....#..C...C..#',
  '###.#####..F.....F..####.######',
  '#.....#...............#.......#',
  '#.2...#..C.........C..#..TT...#',
  '#.............S.......#..TT...#',
  '#.....#.......S..........F.3..#',
  '#..B..#..C.........C..#.......#',
  '#..Q..#.......F.......#.......#',
  '#Z....#.........Z.....#......Z#',
  '###############################',
];

const OBSTACLE_H = { T: 1.1, S: 1.7, B: 1.15, F: 1.25, M: 2.4, 1: 2.3, 2: 2.3, 3: 2.3, J: 2.6, Q: 2.6 };
const RACKS = { 1: 'smg', 2: 'shotgun', 3: 'ar' };
export const PERKS = {
  J: { id: 'thick', name: 'Thick Skin', desc: 'double health', cost: 2500, color: 0xff3344 },
  Q: { id: 'hands', name: 'Fast Hands', desc: 'faster reloads', cost: 2000, color: 0x33ff88 },
};
export const BOX_COST = 950;

function mergeBoxes(list) {
  // list: [{sx,sy,sz,x,y,z}] -> one non-indexed BufferGeometry in world space.
  const pos = [], nor = [], uv = [];
  for (const b of list) {
    const g = new THREE.BoxGeometry(b.sx, b.sy, b.sz).toNonIndexed();
    g.translate(b.x, b.y, b.z);
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    uv.push(...g.attributes.uv.array);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

function labelSprite(lines, color = '#ffd65e') {
  const tex = canvasTexture(512, 160, (g, w, h) => {
    g.fillStyle = 'rgba(6,4,6,0.85)';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = color; g.font = 'bold 64px Impact, Arial Black, sans-serif';
    g.fillText(lines[0], w / 2, lines[1] ? 56 : h / 2);
    if (lines[1]) { g.fillStyle = '#fff'; g.font = 'bold 46px Arial, sans-serif'; g.fillText(lines[1], w / 2, 118); }
  }, 2);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(2.7, 0.85, 1);
  return s;
}

// Cheap repeatable noise for texture grime.
function speckle(g, w, h, n, colors, min = 1, max = 4) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[i % colors.length];
    const s = min + ((i * 7919) % 97) / 97 * (max - min);
    g.fillRect(((i * 2654435761) >>> 0) % w, ((i * 40503) >>> 0) % h, s, s);
  }
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.h = MAP.length;
    this.w = MAP[0].length;
    for (const row of MAP) if (row.length !== this.w) throw new Error('Map rows must be the same width');
    this.sizeX = this.w * CELL;
    this.sizeZ = this.h * CELL;
    this.blockedGrid = new Uint8Array(this.w * this.h);
    this.flow = new Int16Array(this.w * this.h).fill(-1);
    this.spawns = [];
    this.playerSpawn = new THREE.Vector3(CELL * 1.5, 0, CELL * 1.5);
    this.interactables = [];   // { type, x, z, ... }
    this.solids = [];          // meshes bullets collide with
    this.animated = [];        // fns(time)
    this.mystery = null;
    this._build();
  }

  cellAt(cx, cz) { return (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) ? '#' : MAP[cz][cx]; }
  blocked(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return true;
    return this.blockedGrid[cz * this.w + cx] === 1;
  }
  blockedAt(x, z) { return this.blocked(Math.floor(x / CELL), Math.floor(z / CELL)); }
  center(cx, cz) { return [(cx + 0.5) * CELL, (cz + 0.5) * CELL]; }

  _build() {
    const scene = this.scene;
    const walls = [], obstacles = [];
    const L = (o) => new THREE.MeshLambertMaterial(o);
    const wallMat = L({ map: this._brickTexture() });
    const stoneMat = L({ map: this._stoneTexture() });
    const woodMat = L({ map: this._woodTexture() });
    const barrelMat = L({ map: this._barrelTexture() });
    const ironMat = L({ color: 0x2a2a30 });
    const goldMat = L({ color: 0xc9a227, emissive: 0x3a2a06 });
    const fireMat = new THREE.MeshBasicMaterial({ color: 0xffa030 });
    const fireCoreMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0 });
    const pitMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

    const slabGeo = new THREE.BoxGeometry(CELL, 0.9, CELL);
    const lidGeo = new THREE.BoxGeometry(1.5, 0.22, 1.7);
    const crateGeo = new THREE.BoxGeometry(1.6, 1.3, 1.6);
    const crateSmallGeo = new THREE.BoxGeometry(0.8, 0.7, 0.8);
    const barrelGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.1, 8);
    const plinthGeo = new THREE.BoxGeometry(1.1, 0.7, 1.1);
    const bowlGeo = new THREE.CylinderGeometry(0.55, 0.3, 0.35, 6);
    const flameGeo = new THREE.ConeGeometry(0.34, 0.9, 4);
    const flameCoreGeo = new THREE.ConeGeometry(0.16, 0.5, 4);
    const pitGeo = new THREE.CircleGeometry(0.95, 8);

    for (let cz = 0; cz < this.h; cz++) {
      for (let cx = 0; cx < this.w; cx++) {
        const ch = MAP[cz][cx];
        const [x, z] = this.center(cx, cz);
        if (ch === '.') continue;
        if (ch === 'Z') {
          this.spawns.push({ x, z });
          const pit = new THREE.Mesh(pitGeo, pitMat);
          pit.rotation.x = -Math.PI / 2; pit.position.set(x, 0.012, z);
          scene.add(pit);
          continue;
        }
        if (ch === 'P') { this.playerSpawn.set(x, 0, z); continue; }
        this.blockedGrid[cz * this.w + cx] = 1;
        if (ch === '#') { walls.push({ sx: CELL, sy: WALL_H, sz: CELL, x, y: WALL_H / 2, z }); continue; }
        if (ch === 'C') {
          obstacles.push({ sx: CELL * 0.9, sy: WALL_H, sz: CELL * 0.9, x, y: WALL_H / 2, z });
          const col = new THREE.Mesh(new THREE.BoxGeometry(1.4, WALL_H, 1.4), wallMat);
          col.position.set(x, WALL_H / 2, z);
          const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 1.8), stoneMat); base.position.set(x, 0.2, z);
          const cap = base.clone(); cap.position.y = WALL_H - 0.2;
          scene.add(col, base, cap);
          continue;
        }
        const h = OBSTACLE_H[ch];
        obstacles.push({ sx: CELL, sy: h, sz: CELL, x, y: h / 2, z });
        if (ch === 'T') {
          const slab = new THREE.Mesh(slabGeo, stoneMat); slab.position.set(x, 0.45, z);
          const lid = new THREE.Mesh(lidGeo, stoneMat); lid.position.set(x, 1.0, z);
          lid.rotation.y = ((cx * 13 + cz * 7) % 5 - 2) * 0.06;   // lids knocked slightly askew
          scene.add(slab, lid);
        } else if (ch === 'S') {
          const crate = new THREE.Mesh(crateGeo, woodMat); crate.position.set(x, 0.65, z);
          crate.rotation.y = ((cx + cz) % 3 - 1) * 0.12;
          const small = new THREE.Mesh(crateSmallGeo, woodMat); small.position.set(x + 0.2, 1.65, z - 0.15);
          small.rotation.y = 0.5;
          scene.add(crate, small);
        } else if (ch === 'B') {
          const spots = [[-0.45, -0.4], [0.45, -0.3], [0.05, 0.48]];
          spots.forEach(([dx, dz], i) => {
            const b = new THREE.Mesh(barrelGeo, barrelMat);
            b.position.set(x + dx, 0.55, z + dz);
            b.rotation.y = i * 1.3;
            scene.add(b);
          });
        } else if (ch === 'F') {
          const plinth = new THREE.Mesh(plinthGeo, stoneMat); plinth.position.set(x, 0.35, z);
          const bowl = new THREE.Mesh(bowlGeo, ironMat); bowl.position.set(x, 0.88, z);
          const flame = new THREE.Mesh(flameGeo, fireMat); flame.position.set(x, 1.45, z);
          const core = new THREE.Mesh(flameCoreGeo, fireCoreMat); core.position.set(x, 1.3, z);
          scene.add(plinth, bowl, flame, core);
          const light = new THREE.PointLight(0xff9a4c, 52, 24, 1.5);
          light.position.set(x, 2.1, z);
          scene.add(light);
          const seed = cx * 3.1 + cz * 1.7;
          this.animated.push(t => {
            const f = 0.78 + 0.16 * Math.sin(t * 9 + seed) + 0.12 * Math.sin(t * 23 + seed * 2);
            light.intensity = 52 * f;
            flame.scale.set(0.85 + 0.3 * Math.sin(t * 17 + seed), 0.8 + f * 0.4, 0.85 + 0.3 * Math.cos(t * 13 + seed));
            flame.rotation.y = t * 3 + seed;
          });
        } else if (ch === 'M') {
          this._buildMystery(x, z, woodMat, ironMat, goldMat);
        } else if (RACKS[ch]) {
          this._buildRack(x, z, RACKS[ch], woodMat, ironMat);
        } else if (PERKS[ch]) {
          this._buildShrine(x, z, PERKS[ch], stoneMat);
        }
      }
    }

    // Walls: one merged mesh (one draw call, also used for bullet collision).
    this.wallMesh = new THREE.Mesh(mergeBoxes(walls), wallMat);
    scene.add(this.wallMesh);
    // Obstacles collide with bullets through an invisible merged mesh that is never rendered.
    this.obstacleMesh = new THREE.Mesh(mergeBoxes(obstacles), new THREE.MeshBasicMaterial());
    this.obstacleMesh.updateMatrixWorld(true);
    this.solids.push(this.wallMesh, this.obstacleMesh);

    // Floor + ceiling
    const flag = this._floorTexture();
    flag.wrapS = flag.wrapT = THREE.RepeatWrapping;
    flag.repeat.set(this.sizeX / CELL, this.sizeZ / CELL);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(this.sizeX, this.sizeZ, this.w, this.h), L({ map: flag }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(this.sizeX / 2, 0, this.sizeZ / 2);
    scene.add(floor);
    this.floor = floor;
    this.solids.push(floor);

    const ceilTex = this._stoneTexture();
    ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping;
    ceilTex.repeat.set(this.sizeX / 4, this.sizeZ / 4);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(this.sizeX, this.sizeZ, this.w, this.h), L({ map: ceilTex, color: 0x777777 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(this.sizeX / 2, WALL_H, this.sizeZ / 2);
    scene.add(ceil);
    this.solids.push(ceil);

    // Braziers do the real lighting; this is just enough fill to see silhouettes in the dark.
    scene.add(new THREE.HemisphereLight(0x6a6f9a, 0x2a1a14, 0.55));
    scene.add(new THREE.AmbientLight(0x302838, 0.9));
  }

  _buildMystery(x, z, woodMat, ironMat, goldMat) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.3, 1.7), woodMat); body.position.y = 0.65;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.2, 1.8), ironMat); lid.position.y = 1.5;
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xb44cff });
    const glow = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.12, 1.76), glowMat); glow.position.y = 1.35;
    g.add(body, lid, glow);
    for (const [dx, dz] of [[-0.86, -0.86], [0.86, -0.86], [-0.86, 0.86], [0.86, 0.86]]) {
      const corner = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.62, 0.14), goldMat);
      corner.position.set(dx, 0.8, dz);
      g.add(corner);
    }
    const label = labelSprite(['MYSTERY SLOT', BOX_COST + ' pts'], '#c77dff');
    label.position.y = 3.0;
    g.add(label);
    const display = new THREE.Group();
    display.position.y = 2.2;
    g.add(display);
    const light = new THREE.PointLight(0xb44cff, 16, 10, 1.6);
    light.position.y = 2.3;
    g.add(light);
    this.scene.add(g);
    this.mystery = { x, z, display, glowMat, light, label };
    this.animated.push(t => {
      glowMat.color.setHex(Math.sin(t * 5) > 0 ? 0xb44cff : 0x7a2fd0);
      display.rotation.y = t * 1.6;
    });
    this.interactables.push({ type: 'box', x, z });
  }

  _buildRack(x, z, weaponId, woodMat, ironMat) {
    const w = WEAPONS[weaponId];
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.9, 0.5), woodMat); post.position.y = 0.95;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.6), ironMat); cap.position.y = 1.95;
    g.add(post, cap);
    for (const side of [1, -1]) {
      const model = buildWeaponModel(weaponId);
      model.scale.setScalar(1.7);
      model.rotation.y = Math.PI / 2;
      model.position.set(-0.45, 1.25, side * 0.32);
      g.add(model);
    }
    const label = labelSprite([w.name.toUpperCase(), w.cost + ' pts']);
    label.position.y = 2.7;
    g.add(label);
    this.scene.add(g);
    this.interactables.push({ type: 'wallbuy', weapon: weaponId, cost: w.cost, x, z });
  }

  _buildShrine(x, z, perk, stoneMat) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const mat = new THREE.MeshBasicMaterial({ color: perk.color });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.5), stoneMat); base.position.y = 0.25;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.8), stoneMat); pillar.position.y = 1.0;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), mat); gem.position.y = 2.1;
    g.add(base, pillar, gem);
    const label = labelSprite([perk.name.toUpperCase(), perk.cost + ' pts'], '#' + perk.color.toString(16).padStart(6, '0'));
    label.position.y = 3.05;
    g.add(label);
    this.scene.add(g);
    this.animated.push(t => { gem.rotation.y = t * 1.5; gem.position.y = 2.1 + Math.sin(t * 2 + x) * 0.1; });
    this.interactables.push({ type: 'perk', perk, x, z });
  }

  _brickTexture() {
    return canvasTexture(128, 256, (g, w, h) => {
      g.fillStyle = '#1c1a1d'; g.fillRect(0, 0, w, h);
      const shades = ['#5a5560', '#4b4852', '#655f66', '#524c50', '#48454f'];
      const bh = 32;
      for (let row = 0; row < h / bh; row++) {
        const off = row % 2 ? 32 : 0;
        for (let x = -64; x < w; x += 64) {
          g.fillStyle = shades[(row * 3 + ((x + 64) / 64) * 5) % shades.length | 0];
          g.fillRect(x + off + 3, row * bh + 3, 58, bh - 6);
        }
      }
      speckle(g, w, h, 260, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.05)', 'rgba(40,60,30,0.3)'], 2, 7);
      // damp and grime creeping up from the floor, soot near the ceiling
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(0,0,0,0.45)'); grad.addColorStop(0.25, 'rgba(0,0,0,0)');
      grad.addColorStop(0.75, 'rgba(20,30,15,0)'); grad.addColorStop(1, 'rgba(15,25,10,0.55)');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    });
  }

  _stoneTexture() {
    return canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = '#56525a'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 220, ['rgba(0,0,0,0.22)', 'rgba(255,255,255,0.07)', 'rgba(0,0,0,0.12)'], 3, 10);
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(20, 0); g.lineTo(44, 50); g.lineTo(30, 90); g.lineTo(60, 128); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 6; g.strokeRect(0, 0, w, h);
    });
  }

  _floorTexture() {
    return canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = '#121013'; g.fillRect(0, 0, w, h);
      const tiles = [[2, 2, 60, 60, '#3d3a40'], [66, 2, 60, 38, '#35323a'], [66, 44, 60, 82, '#403c3f'], [2, 66, 60, 60, '#36343b']];
      for (const [x, y, tw, th, c] of tiles) { g.fillStyle = c; g.fillRect(x, y, tw, th); }
      speckle(g, w, h, 200, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.05)', 'rgba(60,20,20,0.18)'], 2, 8);
    });
  }

  _woodTexture() {
    return canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = '#4a3220'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 4; i++) {
        g.fillStyle = ['#553a24', '#46301d', '#5c4028', '#40291a'][i];
        g.fillRect(i * 32 + 2, 0, 28, h);
      }
      g.strokeStyle = '#2a1a0e'; g.lineWidth = 12;
      g.strokeRect(6, 6, w - 12, h - 12);
      g.beginPath(); g.moveTo(8, 8); g.lineTo(w - 8, h - 8); g.stroke();
      speckle(g, w, h, 90, ['rgba(0,0,0,0.25)', 'rgba(255,220,170,0.06)'], 2, 6);
    });
  }

  _barrelTexture() {
    return canvasTexture(128, 128, (g, w, h) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#5a3c22' : '#4c321c';
        g.fillRect(i * 16, 0, 16, h);
      }
      g.fillStyle = '#26262b';
      g.fillRect(0, 16, w, 12); g.fillRect(0, h - 28, w, 12);
      speckle(g, w, h, 60, ['rgba(0,0,0,0.25)'], 2, 6);
    });
  }

  update(time) {
    for (const fn of this.animated) fn(time);
  }

  // Pushes a circle out of blocked cells. Mutates and returns `p` ({x, z}).
  collideCircle(p, r) {
    for (let pass = 0; pass < 2; pass++) {
      const x0 = Math.floor((p.x - r) / CELL), x1 = Math.floor((p.x + r) / CELL);
      const z0 = Math.floor((p.z - r) / CELL), z1 = Math.floor((p.z + r) / CELL);
      for (let cz = z0; cz <= z1; cz++) {
        for (let cx = x0; cx <= x1; cx++) {
          if (!this.blocked(cx, cz)) continue;
          const minX = cx * CELL, maxX = minX + CELL, minZ = cz * CELL, maxZ = minZ + CELL;
          const nx = Math.max(minX, Math.min(p.x, maxX));
          const nz = Math.max(minZ, Math.min(p.z, maxZ));
          let dx = p.x - nx, dz = p.z - nz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-9) {
            const d = Math.sqrt(d2), push = (r - d) / d;
            p.x += dx * push; p.z += dz * push;
          } else {
            // centre is inside the cell: leave through the nearest face
            const l = p.x - minX, rr = maxX - p.x, t = p.z - minZ, b = maxZ - p.z;
            const m = Math.min(l, rr, t, b);
            if (m === l) p.x = minX - r; else if (m === rr) p.x = maxX + r;
            else if (m === t) p.z = minZ - r; else p.z = maxZ + r;
          }
        }
      }
    }
    return p;
  }

  // Breadth-first distance field from the player's cell; enemies walk downhill on it.
  computeFlow(px, pz) {
    const w = this.w, h = this.h, flow = this.flow;
    flow.fill(-1);
    const sx = Math.floor(px / CELL), sz = Math.floor(pz / CELL);
    if (this.blocked(sx, sz)) return;
    const queue = this._queue || (this._queue = new Int32Array(w * h));
    let head = 0, tail = 0;
    queue[tail++] = sz * w + sx;
    flow[sz * w + sx] = 0;
    while (head < tail) {
      const i = queue[head++], cx = i % w, cz = (i / w) | 0, d = flow[i] + 1;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0), nz = cz + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (this.blocked(nx, nz)) continue;
        const ni = nz * w + nx;
        if (flow[ni] !== -1) continue;
        flow[ni] = d;
        queue[tail++] = ni;
      }
    }
  }

  // Where should something at (x,z) head next to reach the player? Writes into `out`.
  flowTarget(x, z, playerX, playerZ, out) {
    const w = this.w, cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    const here = this.blocked(cx, cz) ? -1 : this.flow[cz * w + cx];
    if (here <= 1) { out.x = playerX; out.z = playerZ; return out; }
    let best = here, bx = cx, bz = cz;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (this.blocked(nx, nz)) continue;
        if (dx && dz && (this.blocked(cx + dx, cz) || this.blocked(cx, cz + dz))) continue; // no corner cutting
        const d = this.flow[nz * w + nx];
        const score = d - (dx && dz ? 0.01 : 0);   // diagonals save a step, so prefer them slightly
        if (d >= 0 && score < best) { best = score; bx = nx; bz = nz; }
      }
    }
    out.x = (bx + 0.5) * CELL; out.z = (bz + 0.5) * CELL;
    return out;
  }

  reachable(x, z) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    return !this.blocked(cx, cz) && this.flow[cz * this.w + cx] >= 0;
  }
}
