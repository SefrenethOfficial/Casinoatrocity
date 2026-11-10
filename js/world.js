// The map: a branching set of areas joined by barriers you buy open with points (COD Zombies style).
// You start outdoors on a rainy lawn and fight down through the house into the lab. Also owns the
// collision grid, enemy pathing field and interactable spots.
import * as THREE from 'three';
import { WEAPONS } from './data.js';
import { canvasTexture, buildWeaponModel } from './models.js';

export const CELL = 2;
export const WALL_H = 3.6;
export const UPGRADE_COST = 5000;
export const BOX_COST = 950;
export const AMMO_COST = 400;

// Legend: . floor  g lawn grass  C pillar  T tomb  S crates  B barrels  F brazier  M mystery slot
// 1/2/3/4 weapon racks  J/Q perk shrines  A ammo cache  Z enemy spawn  P player spawn
// Lab: K specimen tank  D bench  U overclock  w ceiling light (walkable)   barrier = buyable passage
const ROOM = 7, PITCH = 8, MID = 3;

// Each area is a 7x7 room at a meta (col,row). The layout branches rather than running in a line.
const ROOMS = [
  { name: 'Rainy Lawn',   at: [1, 0] },   // 1 start, outdoors
  { name: 'Foyer',        at: [1, 1] },   // 2
  { name: 'Casino Floor', at: [0, 1] },   // 3
  { name: 'Crypt',        at: [2, 1] },   // 4
  { name: 'Boiler Room',  at: [1, 2] },   // 5
  { name: 'Armoury',      at: [0, 2] },   // 6
  { name: 'Gallery',      at: [2, 2] },   // 7
  { name: 'Vault',        at: [1, 3] },   // 8
];
export const LAB_ROOM = ROOMS.length + 1;   // the lab is the final area
export const AREA_NAMES = [...ROOMS.map(r => r.name), 'The Lab'];
const OUTDOOR = new Set([1]);

// Centre feature / secondary feature / decorative prop per room (1-based).
const FEAT = { 2: 'A', 3: 'M', 4: 'J', 5: 'A', 6: '3', 7: 'Q', 8: 'A' };
const SEC  = { 1: '1', 2: '2', 5: 'B', 6: 'A', 8: 'C' };
const PROP = { 1: 'T', 2: 'S', 3: 'S', 4: 'T', 5: 'B', 7: 'S', 8: 'C' };

function roomCells(i) {
  const g = Array.from({ length: ROOM }, () => Array(ROOM).fill(i === 1 ? 'g' : '.'));
  for (const [x, z] of [[0, 0], [ROOM - 1, 0], [0, ROOM - 1], [ROOM - 1, ROOM - 1]]) g[z][x] = 'Z';
  g[1][1] = 'F'; g[ROOM - 2][ROOM - 2] = 'F';
  if (i === 1) g[MID][MID] = 'P'; else if (FEAT[i]) g[MID][MID] = FEAT[i];
  if (SEC[i]) g[1][ROOM - 2] = SEC[i];
  if (PROP[i]) g[ROOM - 2][1] = PROP[i];
  return g.map(r => r.join(''));
}

// Barriers: which rooms connect, the cost to open, and whether it leads into the lab.
// [fromRoom (1-based index into ROOMS), toRoom, cost, lab?]
const LINKS = [
  [1, 2, 750], [2, 3, 1000], [2, 4, 1000], [2, 5, 1250],
  [5, 6, 1500], [5, 7, 1500], [5, 8, 2000],
];
function barrierCell(a, b) {
  const [c1, r1] = ROOMS[a - 1].at, [c2, r2] = ROOMS[b - 1].at;
  if (r1 === r2) return [(Math.min(c1, c2) + 1) * PITCH, 1 + r1 * PITCH + MID];
  return [1 + c1 * PITCH + MID, (Math.min(r1, r2) + 1) * PITCH];
}
const BARRIERS = LINKS.map(([a, b, cost, lab]) => { const [cx, cz] = barrierCell(a, b); return { cx, cz, cost, lab: !!lab }; });

// The lab, appended below the Vault.
const LAB = [
  'K.......K',
  '.D.....D.',
  'K.......K',
  'U...w...4',
  '.........',
  '....A....',
  '.........',
  'A...w...K',
  'K.......K',
  '.D.....D.',
  'Z...w...Z',
];
const LAB_W = LAB[0].length, LAB_H = LAB.length;
const [vaultC, vaultR] = ROOMS[7].at;                 // Vault meta position
const vaultX0 = 1 + vaultC * PITCH, vaultBottom = (vaultR + 1) * PITCH;
const LAB_X = vaultX0 + MID - 3, LAB_Z = vaultBottom + 1;
BARRIERS.push({ cx: vaultX0 + MID, cz: vaultBottom, cost: 2500, lab: true });

const GRID_W = Math.max(1 + 3 * PITCH, LAB_X + LAB_W) + 1;
const GRID_H = LAB_Z + LAB_H + 1;

function buildGrid() {
  const grid = Array.from({ length: GRID_H }, () => Array(GRID_W).fill('#'));
  const room = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(0));
  ROOMS.forEach((r, i) => {
    const x0 = 1 + r.at[0] * PITCH, z0 = 1 + r.at[1] * PITCH;
    roomCells(i + 1).forEach((row, dz) => [...row].forEach((ch, dx) => { grid[z0 + dz][x0 + dx] = ch; room[z0 + dz][x0 + dx] = i + 1; }));
  });
  LAB.forEach((row, dz) => [...row].forEach((ch, dx) => { grid[LAB_Z + dz][LAB_X + dx] = ch; room[LAB_Z + dz][LAB_X + dx] = LAB_ROOM; }));
  for (const b of BARRIERS) grid[b.cz][b.cx] = 'barrier';
  return { grid, room };
}

const OBSTACLE_H = { A: 1.0, T: 1.1, S: 1.7, B: 1.15, F: 1.25, M: 2.4, 1: 2.3, 2: 2.3, 3: 2.3, 4: 2.3, J: 2.6, Q: 2.6, K: 2.9, D: 1.5, U: 2.4 };
const RACKS = { 1: 'smg', 2: 'shotgun', 3: 'ar', 4: 'lmg' };
export const PERKS = {
  J: { id: 'thick', name: 'Thick Skin', desc: 'double health', cost: 2500, color: 0xff3344 },
  Q: { id: 'hands', name: 'Fast Hands', desc: 'faster reloads', cost: 2000, color: 0x33ff88 },
};

function mergeBoxes(list) {
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
    const { grid, room } = buildGrid();
    this.grid = grid;
    this.roomOf = room;
    this.h = GRID_H;
    this.w = GRID_W;
    this.sizeX = this.w * CELL;
    this.sizeZ = this.h * CELL;
    this.blockedGrid = new Uint8Array(this.w * this.h);
    this.flow = new Int16Array(this.w * this.h).fill(-1);
    this.spawns = [];          // { x, z, room }
    this.playerSpawn = new THREE.Vector3(CELL * 1.5, 0, CELL * 1.5);
    this.interactables = [];
    this.solids = [];
    this.animated = [];
    this.barriers = [];        // { cx, cz, x, z, cost, lab, group, slab, bought }
    this.labOpen = false;
    this.labOpenRound = 0;
    this.time = 0;
    this.mystery = null;
    this._build();
  }

  blocked(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return true;
    return this.blockedGrid[cz * this.w + cx] === 1;
  }
  blockedAt(x, z) { return this.blocked(Math.floor(x / CELL), Math.floor(z / CELL)); }
  center(cx, cz) { return [(cx + 0.5) * CELL, (cz + 0.5) * CELL]; }
  roomAt(x, z) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    return (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) ? 0 : this.roomOf[cz][cx];
  }
  isOutdoor(x, z) { return OUTDOOR.has(this.roomAt(x, z)); }
  areaName(n) { return AREA_NAMES[n - 1] || 'Area'; }
  // Name of the area on the far side of a barrier from the player (for the buy prompt).
  barrierDest(bar, px, pz) {
    const here = this.roomAt(px, pz);
    const nb = [[bar.cx - 1, bar.cz], [bar.cx + 1, bar.cz], [bar.cx, bar.cz - 1], [bar.cx, bar.cz + 1]];
    for (const [cx, cz] of nb) {
      const r = (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) ? 0 : this.roomOf[cz][cx];
      if (r && r !== here) return this.areaName(r);
    }
    return bar.lab ? 'The Lab' : 'the next area';
  }
  roomCenter(n) {
    if (n === LAB_ROOM) return [(LAB_X + LAB_W / 2) * CELL, (LAB_Z + LAB_H / 2) * CELL];
    const r = ROOMS[n - 1];
    return [(1 + r.at[0] * PITCH + MID + 0.5) * CELL, (1 + r.at[1] * PITCH + MID + 0.5) * CELL];
  }

  _build() {
    const scene = this.scene;
    const walls = [], labWalls = [], obstacles = [];
    const L = (o) => new THREE.MeshLambertMaterial(o);
    const wallMat = L({ map: this._brickTexture() });
    const labWallMat = L({ map: this._panelTexture() });
    const stoneMat = L({ map: this._stoneTexture() });
    const woodMat = L({ map: this._woodTexture() });
    const barrelMat = L({ map: this._barrelTexture() });
    const ironMat = L({ color: 0x2a2a30 });
    const steelMat = L({ color: 0x8a9098 });
    const goldMat = L({ color: 0xc9a227, emissive: 0x3a2a06 });
    const grassMat = L({ map: this._grassTexture() });
    const fireMat = new THREE.MeshBasicMaterial({ color: 0xffa030 });
    const fireCoreMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0 });
    const pitMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const dirtMat = new THREE.MeshBasicMaterial({ color: 0x241a12 });
    const tankMat = new THREE.MeshBasicMaterial({ color: 0x1fae58 });
    const tankDarkMat = new THREE.MeshBasicMaterial({ color: 0x0c5a2c });
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x39d0c0 });
    const tubeMat = new THREE.MeshBasicMaterial({ color: 0xdff8e8 });
    this._mats = { woodMat, ironMat, steelMat, goldMat, stoneMat };

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
    const ventGeo = new THREE.PlaneGeometry(1.7, 1.7);
    const tankGeo = new THREE.CylinderGeometry(0.62, 0.62, 2.0, 8);
    const tankCapGeo = new THREE.CylinderGeometry(0.75, 0.75, 0.35, 8);

    const indoorCeil = [];   // cells that get a ceiling (everything but the open-air lawn)
    for (let cz = 0; cz < this.h; cz++) {
      for (let cx = 0; cx < this.w; cx++) {
        const ch = this.grid[cz][cx];
        const [x, z] = this.center(cx, cz);
        const r = this.roomOf[cz][cx];
        const inLab = r === LAB_ROOM;
        const outdoor = OUTDOOR.has(r);
        // decide ceiling: indoor room cell, or a wall that borders one
        if (!outdoor) {
          const bordersIndoor = r !== 0 && !OUTDOOR.has(r);
          const nearIndoor = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
            const nr = (this.roomOf[cz + dz] || [])[cx + dx];
            return nr && !OUTDOOR.has(nr);
          });
          if (bordersIndoor || nearIndoor) indoorCeil.push({ sx: CELL, sy: 0.12, sz: CELL, x, y: WALL_H - 0.06, z });
        }

        if (ch === '.' || ch === 'g') continue;
        if (ch === 'Z') {
          this.spawns.push({ x, z, room: r });
          const marker = new THREE.Mesh(inLab ? ventGeo : pitGeo, outdoor ? dirtMat : (inLab ? pitMat : pitMat));
          marker.rotation.x = -Math.PI / 2; marker.position.set(x, 0.012, z);
          scene.add(marker);
          continue;
        }
        if (ch === 'P') { this.playerSpawn.set(x, 0, z); continue; }
        if (ch === 'w') {
          const tube = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.4), tubeMat);
          tube.position.set(x, WALL_H - 0.05, z);
          scene.add(tube);
          const light = new THREE.PointLight(0xc8ffe0, 24, 24, 1.5);
          light.position.set(x, WALL_H - 0.5, z);
          scene.add(light);
          const seed = cz * 2.3;
          if (cz % 3 === 1) this.animated.push(t => { const on = Math.sin(t * 31 + seed) > -0.6 && Math.sin(t * 2.3) > -0.85; light.intensity = on ? 24 : 3; tube.visible = on; });
          continue;
        }
        this.blockedGrid[cz * this.w + cx] = 1;
        if (ch === '#') { (inLab ? labWalls : walls).push({ sx: CELL, sy: WALL_H, sz: CELL, x, y: WALL_H / 2, z }); continue; }
        if (ch === 'barrier') { this._buildBarrier(cx, cz, x, z); continue; }
        if (ch === 'C') {
          obstacles.push({ sx: CELL * 0.9, sy: WALL_H, sz: CELL * 0.9, x, y: WALL_H / 2, z });
          const col = new THREE.Mesh(new THREE.BoxGeometry(1.4, WALL_H, 1.4), wallMat);
          col.position.set(x, WALL_H / 2, z);
          const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 1.8), stoneMat); base.position.set(x, 0.2, z);
          const cap = base.clone(); cap.position.y = WALL_H - 0.2;
          scene.add(col, base, cap);
          continue;
        }
        const hh = OBSTACLE_H[ch];
        obstacles.push({ sx: CELL, sy: hh, sz: CELL, x, y: hh / 2, z });
        if (ch === 'T') {
          const slab = new THREE.Mesh(slabGeo, stoneMat); slab.position.set(x, 0.45, z);
          const lid = new THREE.Mesh(lidGeo, stoneMat); lid.position.set(x, 1.0, z);
          lid.rotation.y = ((cx * 13 + cz * 7) % 5 - 2) * 0.06;
          scene.add(slab, lid);
        } else if (ch === 'S') {
          const crate = new THREE.Mesh(crateGeo, woodMat); crate.position.set(x, 0.65, z);
          crate.rotation.y = ((cx + cz) % 3 - 1) * 0.12;
          const small = new THREE.Mesh(crateSmallGeo, woodMat); small.position.set(x + 0.2, 1.65, z - 0.15);
          small.rotation.y = 0.5;
          scene.add(crate, small);
        } else if (ch === 'B') {
          [[-0.45, -0.4], [0.45, -0.3], [0.05, 0.48]].forEach(([dx, dz], i) => {
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
          const light = new THREE.PointLight(0xff9a4c, 46, 20, 1.5);
          light.position.set(x, 2.1, z);
          scene.add(light);
          const seed = cx * 3.1 + cz * 1.7;
          this.animated.push(t => {
            const f = 0.78 + 0.16 * Math.sin(t * 9 + seed) + 0.12 * Math.sin(t * 23 + seed * 2);
            light.intensity = 46 * f;
            flame.scale.set(0.85 + 0.3 * Math.sin(t * 17 + seed), 0.8 + f * 0.4, 0.85 + 0.3 * Math.cos(t * 13 + seed));
            flame.rotation.y = t * 3 + seed;
          });
        } else if (ch === 'K') {
          const base = new THREE.Mesh(tankCapGeo, steelMat); base.position.set(x, 0.175, z);
          const top = new THREE.Mesh(tankCapGeo, steelMat); top.position.set(x, 2.55, z);
          const broken = (cx * 5 + cz * 3) % 4 === 0;
          const glass = new THREE.Mesh(tankGeo, broken ? tankDarkMat : tankMat); glass.position.set(x, 1.35, z);
          scene.add(base, top, glass);
          if (!broken) {
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.1, 0.26), tankDarkMat);
            body.position.set(x, 1.3, z + (cz < LAB_Z + 5 ? 0.5 : -0.5));
            scene.add(body);
            const seed = cx + cz;
            this.animated.push(t => { body.position.y = 1.3 + Math.sin(t * 1.3 + seed) * 0.12; });
          }
        } else if (ch === 'D') {
          const desk = new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.95, 1.3), steelMat); desk.position.set(x, 0.475, z);
          const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.12), ironMat); monitor.position.set(x - 0.3, 1.25, z);
          const screen = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.38, 0.14), screenMat); screen.position.set(x - 0.3, 1.25, z);
          const flask = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 5), tankMat); flask.position.set(x + 0.5, 1.1, z + 0.2);
          scene.add(desk, monitor, screen, flask);
        } else if (ch === 'A') {
          const crate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 1.0), L({ color: 0x3f5a34 }));
          crate.position.set(x, 0.4, z);
          const band = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.16, 1.04), L({ color: 0xc9a227 }));
          band.position.set(x, 0.5, z);
          const label = labelSprite(['AMMO', AMMO_COST + ' pts'], '#9fdc6a');
          label.position.set(x, 1.9, z);
          scene.add(crate, band, label);
          this.interactables.push({ type: 'ammo', x, z });
        } else if (ch === 'U') {
          this._buildUpgrade(x, z);
        } else if (ch === 'M') {
          this._buildMystery(x, z, woodMat, ironMat, goldMat);
        } else if (RACKS[ch]) {
          this._buildRack(x, z, RACKS[ch], inLab ? steelMat : woodMat, ironMat);
        } else if (PERKS[ch]) {
          this._buildShrine(x, z, PERKS[ch], stoneMat);
        }
      }
    }

    this.wallMesh = new THREE.Mesh(mergeBoxes(walls), wallMat);
    this.labWallMesh = new THREE.Mesh(mergeBoxes(labWalls), labWallMat);
    scene.add(this.wallMesh, this.labWallMesh);
    this.obstacleMesh = new THREE.Mesh(mergeBoxes(obstacles), new THREE.MeshBasicMaterial());
    this.obstacleMesh.updateMatrixWorld(true);
    this.solids.push(this.wallMesh, this.labWallMesh, this.obstacleMesh);

    // Floor (stone everywhere; grass & tile laid over their areas below)
    const flag = this._floorTexture();
    flag.wrapS = flag.wrapT = THREE.RepeatWrapping;
    flag.repeat.set(this.sizeX / CELL, this.sizeZ / CELL);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(this.sizeX, this.sizeZ, this.w, this.h), L({ map: flag }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(this.sizeX / 2, 0, this.sizeZ / 2);
    scene.add(floor);
    this.solids.push(floor);

    // Indoor ceiling, with the lawn left open to the sky.
    this.ceilMesh = new THREE.Mesh(mergeBoxes(indoorCeil), L({ map: this._stoneTexture(), color: 0x777777 }));
    scene.add(this.ceilMesh);
    this.solids.push(this.ceilMesh);

    // Lab floor + ceiling overlay.
    const [lx, lz] = this.roomCenter(LAB_ROOM);
    const tile = this._tileTexture();
    tile.wrapS = tile.wrapT = THREE.RepeatWrapping;
    tile.repeat.set(LAB_W, LAB_H);
    const labFloor = new THREE.Mesh(new THREE.PlaneGeometry(LAB_W * CELL, LAB_H * CELL, LAB_W, LAB_H), L({ map: tile }));
    labFloor.rotation.x = -Math.PI / 2;
    labFloor.position.set(lx, 0.01, lz);
    const labCeil = new THREE.Mesh(new THREE.PlaneGeometry(LAB_W * CELL, LAB_H * CELL), L({ color: 0x5a6068 }));
    labCeil.rotation.x = Math.PI / 2;
    labCeil.position.set(lx, WALL_H - 0.14, lz);
    scene.add(labFloor, labCeil);

    // Lawn: grass underfoot and a dark storm sky overhead.
    const [gx, gz] = this.roomCenter(1);
    const grass = this._grassTexture();
    grass.wrapS = grass.wrapT = THREE.RepeatWrapping; grass.repeat.set(ROOM, ROOM);
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(ROOM * CELL + CELL, ROOM * CELL + CELL), L({ map: grass }));
    lawn.rotation.x = -Math.PI / 2; lawn.position.set(gx, 0.02, gz);
    scene.add(lawn);
    this.skyMat = new THREE.MeshBasicMaterial({ color: 0x0a0e18, fog: false });
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(ROOM * CELL + 8, ROOM * CELL + 8), this.skyMat);
    sky.rotation.x = Math.PI / 2; sky.position.set(gx, WALL_H + 7, gz);
    scene.add(sky);
    this.lawnCenter = [gx, gz];
    // cold, dim light over the lawn; a faint moon glow
    const moon = new THREE.PointLight(0x9fb8e0, 26, 34, 1.4);
    moon.position.set(gx, WALL_H + 4, gz);
    scene.add(moon);
    this.stormLight = moon;

    scene.add(new THREE.HemisphereLight(0x6a6f9a, 0x2a1a14, 0.55));
    scene.add(new THREE.AmbientLight(0x302838, 0.9));
  }

  // ---- barriers ----
  _buildBarrier(cx, cz, x, z) {
    const b = BARRIERS.find(b => b.cx === cx && b.cz === cz) || { cost: 1000, lab: false };
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(CELL, WALL_H, CELL * 0.55),
      new THREE.MeshLambertMaterial({ map: b.lab ? this._hazardTexture() : this._plankTexture() }));
    slab.position.y = WALL_H / 2;
    const vertical = this.grid[cz][cx - 1] !== '#' || this.grid[cz][cx + 1] !== '#';
    if (vertical) g.rotation.y = Math.PI / 2;
    g.add(slab);
    const label = labelSprite(['OPEN', b.cost + ' pts'], b.lab ? '#ff5a5a' : '#ffd65e');
    label.position.y = WALL_H + 0.5;
    g.add(label);
    this.scene.add(g);
    g.updateMatrixWorld(true);
    const bar = { cx, cz, x, z, cost: b.cost, lab: b.lab, group: g, slab, bought: false, y: WALL_H / 2 };
    this.barriers.push(bar);
    this.interactables.push({ type: 'barrier', barrier: bar, cost: b.cost, lab: b.lab, x, z });
    this.solids.push(slab);
  }

  buyBarrier(bar, round = 0) {
    if (bar.bought) return false;
    bar.bought = true;
    this.blockedGrid[bar.cz * this.w + bar.cx] = 0;
    const i = this.solids.indexOf(bar.slab);
    if (i >= 0) this.solids.splice(i, 1);
    if (bar.lab && !this.labOpen) { this.labOpen = true; this.labOpenRound = round; }
    return true;
  }

  resetBarriers() {
    this.labOpen = false; this.labOpenRound = 0;
    for (const bar of this.barriers) {
      bar.bought = false;
      bar.slab.position.y = WALL_H / 2;
      bar.group.visible = true;
      this.blockedGrid[bar.cz * this.w + bar.cx] = 1;
      if (!this.solids.includes(bar.slab)) this.solids.push(bar.slab);
    }
  }

  // Spawn points the director may use right now: anywhere currently reachable from the player, a
  // short walk away but not on top of them. Unbought barriers are walls, so locked areas stay quiet.
  spawnPoints(px, pz) {
    const flowAt = s => this.flow[Math.floor(s.z / CELL) * this.w + Math.floor(s.x / CELL)];
    const open = this.spawns.filter(s => flowAt(s) >= 0);
    const near = open.filter(s => flowAt(s) >= 2 && flowAt(s) <= 18 && Math.hypot(s.x - px, s.z - pz) > 4.5);
    return near.length ? near : open.length ? open : this.spawns.filter(s => s.room === this.roomAt(px, pz));
  }

  // ---- props ----
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

  _buildRack(x, z, weaponId, bodyMat, ironMat) {
    const w = WEAPONS[weaponId];
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.9, 0.5), bodyMat); post.position.y = 0.95;
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

  _buildUpgrade(x, z) {
    const { steelMat, ironMat } = this._mats;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const glow = new THREE.MeshBasicMaterial({ color: 0x3dff7a });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.6), steelMat); body.position.y = 0.55;
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 1.7), ironMat); bed.position.y = 1.15;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.07, 4, 8), glow); ring.position.y = 1.75;
    const coil = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.18), glow); coil.position.y = 1.7;
    g.add(body, bed, ring, coil);
    for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), ironMat);
      post.position.set(dx, 1.75, dz);
      g.add(post);
    }
    const label = labelSprite(['OVERCLOCK', UPGRADE_COST + ' pts'], '#3dff7a');
    label.position.y = 3.05;
    g.add(label);
    this.scene.add(g);
    this.animated.push(t => { ring.rotation.x = t * 2; ring.rotation.y = t * 1.3; coil.scale.y = 0.8 + Math.sin(t * 6) * 0.2; });
    this.interactables.push({ type: 'upgrade', x, z });
  }

  // ---- textures ----
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
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(0,0,0,0.45)'); grad.addColorStop(0.25, 'rgba(0,0,0,0)');
      grad.addColorStop(0.75, 'rgba(20,30,15,0)'); grad.addColorStop(1, 'rgba(15,25,10,0.55)');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    });
  }

  _panelTexture() {
    return canvasTexture(128, 256, (g, w, h) => {
      g.fillStyle = '#687078'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#586068'; g.fillRect(6, 6, w - 12, 110); g.fillRect(6, 124, w - 12, 86);
      g.fillStyle = '#2a2e33';
      for (const [x, y] of [[12, 12], [w - 20, 12], [12, 104], [w - 20, 104], [12, 130], [w - 20, 130], [12, 198], [w - 20, 198]]) g.fillRect(x, y, 8, 8);
      for (let x = -32; x < w; x += 32) {
        g.fillStyle = '#d6b21c'; g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 32, h - 30); g.lineTo(x + 16, h - 30); g.fill();
      }
      g.fillStyle = '#1c1c1c'; g.fillRect(0, h - 34, w, 4);
      speckle(g, w, h, 120, ['rgba(0,0,0,0.2)', 'rgba(90,20,20,0.25)', 'rgba(255,255,255,0.06)'], 2, 8);
    });
  }

  _tileTexture() {
    return canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = '#3a4044'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        g.fillStyle = (x + y) % 2 ? '#7c868a' : '#6f797d';
        g.fillRect(x * 64 + 3, y * 64 + 3, 58, 58);
      }
      speckle(g, w, h, 110, ['rgba(0,0,0,0.18)', 'rgba(70,90,40,0.2)', 'rgba(110,20,20,0.2)'], 2, 9);
    });
  }

  _plankTexture() {
    return canvasTexture(128, 256, (g, w, h) => {
      g.fillStyle = '#17120c'; g.fillRect(0, 0, w, h);
      // crossed boards nailed over an opening
      const boards = [[10, 0.2], [60, -0.15], [150, 0.1], [200, -0.25]];
      for (const [y, a] of boards) {
        g.save(); g.translate(0, y); g.rotate(a);
        g.fillStyle = '#4a3220'; g.fillRect(-20, 0, w + 40, 34);
        g.fillStyle = '#5c4028'; g.fillRect(-20, 4, w + 40, 6);
        g.fillStyle = '#2a1a0e'; for (let x = 6; x < w; x += 40) g.fillRect(x, 10, 6, 14);
        g.restore();
      }
      speckle(g, w, h, 120, ['rgba(0,0,0,0.4)', 'rgba(255,220,170,0.05)'], 2, 7);
    });
  }

  _grassTexture() {
    return canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = '#1e3318'; g.fillRect(0, 0, w, h);
      const blades = ['#27451f', '#2f5226', '#1a2c14', '#355c2a', '#20381a'];
      for (let i = 0; i < 1400; i++) {
        g.strokeStyle = blades[i % blades.length];
        const x = (i * 97) % w, y = (i * 53) % h;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + ((i % 3) - 1), y - 3 - (i % 3)); g.stroke();
      }
      speckle(g, w, h, 120, ['rgba(10,16,8,0.5)', 'rgba(60,90,40,0.3)'], 2, 5);
      // puddles catching the storm
      g.fillStyle = 'rgba(70,90,110,0.25)';
      for (const [x, y, r] of [[30, 40, 16], [90, 80, 20], [60, 110, 12]]) { g.beginPath(); g.ellipse(x, y, r, r * 0.6, 0, 0, 6.3); g.fill(); }
    });
  }

  _hazardTexture() {
    return canvasTexture(128, 256, (g, w, h) => {
      g.fillStyle = '#6e767e'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1c1c1c'; g.fillRect(0, 96, w, 64);
      for (let x = -64; x < w; x += 40) {
        g.fillStyle = '#d6b21c'; g.beginPath(); g.moveTo(x, 160); g.lineTo(x + 20, 160); g.lineTo(x + 84, 96); g.lineTo(x + 64, 96); g.fill();
      }
      g.fillStyle = '#b3121d'; g.fillRect(44, 30, 40, 40);
      g.fillStyle = '#2a2e33'; g.fillRect(8, 8, 10, 10); g.fillRect(w - 18, 8, 10, 10); g.fillRect(8, h - 18, 10, 10); g.fillRect(w - 18, h - 18, 10, 10);
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

  // Briefly brighten the storm sky (called by the game on a thunderclap).
  flashLightning() {
    if (this.stormLight) this.stormLight.intensity = 220;
    if (this.skyMat) this.skyMat.color.setHex(0x8390a8);
  }

  update(time) {
    this.time = time;
    for (const fn of this.animated) fn(time);
    const dt = Math.min(Math.max(time - (this._lastT ?? time), 0), 0.2);
    this._lastT = time;
    // bought barriers grind down out of the way
    for (const bar of this.barriers) {
      if (!bar.bought) continue;
      if (bar.slab.position.y > -WALL_H / 2 - 0.1) bar.slab.position.y -= dt * 2.2;
      bar.group.visible = bar.slab.position.y > -WALL_H / 2;
    }
    // storm light settles back after a lightning flash
    if (this.stormLight && this.stormLight.intensity > 26) {
      this.stormLight.intensity = Math.max(26, this.stormLight.intensity - dt * 900);
      if (this.stormLight.intensity <= 30 && this.skyMat) this.skyMat.color.setHex(0x0a0e18);
    }
  }

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
          const dx = p.x - nx, dz = p.z - nz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-9) {
            const d = Math.sqrt(d2), push = (r - d) / d;
            p.x += dx * push; p.z += dz * push;
          } else {
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
        if (dx && dz && (this.blocked(cx + dx, cz) || this.blocked(cx, cz + dz))) continue;
        const d = this.flow[nz * w + nx];
        const score = d - (dx && dz ? 0.01 : 0);
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
