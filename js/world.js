// The casino level: geometry, collision grid, zombie pathing field and interactable spots.
import * as THREE from 'three';
import { WEAPONS } from './data.js';
import { canvasTexture, buildWeaponModel } from './models.js';

export const CELL = 2;
export const WALL_H = 4.2;

// # wall  . floor  T table  S slot machine  B bar  C column  M mystery slot
// 1/2/3 weapon racks  J/Q perk machines  Z zombie spawn  P player spawn
const MAP = [
  '###############################',
  '#Z....#.......Z.......#......Z#',
  '#.....#...............#.......#',
  '#..TT.#..S.S.S.S.S.S..#..BBB..#',
  '#..TT.....................B...#',
  '#.........................B...#',
  '#.....#..S.S.S.S.S.S..#..BBB..#',
  '#.1...#...............#....J..#',
  '###.###...............###..####',
  '#.........C.........C.........#',
  '#..............P..............#',
  '#..TT....TT.........TT....TT..#',
  '#..TT....TT....M....TT....TT..#',
  '#.............................#',
  '#.........C.........C.........#',
  '###.###...............####.####',
  '#.....#...............#.......#',
  '#.2...#..S.S.S.S.S.S..#..TT...#',
  '#.....#...............#..TT...#',
  '#..........................3..#',
  '#.....#..S.S.S.S.S.S..#.......#',
  '#..Q..#...............#.......#',
  '#Z....#.......Z.......#......Z#',
  '###############################',
];

const OBSTACLE_H = { T: 1.05, S: 2.15, B: 1.15, M: 2.4, 1: 2.3, 2: 2.3, 3: 2.3, J: 2.4, Q: 2.4 };
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
    g.fillStyle = 'rgba(10,6,8,0.78)';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = color; g.font = 'bold 62px Impact, Arial Black, sans-serif';
    g.fillText(lines[0], w / 2, lines[1] ? 58 : h / 2);
    if (lines[1]) { g.fillStyle = '#fff'; g.font = 'bold 42px Arial, sans-serif'; g.fillText(lines[1], w / 2, 118); }
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(1.9, 0.6, 1);
  return s;
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
  center(cx, cz) { return [(cx + 0.5) * CELL, (cz + 0.5) * CELL]; }

  _build() {
    const scene = this.scene;
    const walls = [], obstacles = [];
    const wallMat = new THREE.MeshStandardMaterial({ map: this._wallTexture(), roughness: 0.85, metalness: 0.05 });
    const feltMat = new THREE.MeshStandardMaterial({ color: 0x176b3a, roughness: 0.95 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x3b2413, roughness: 0.6 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4a437, roughness: 0.3, metalness: 0.9 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x17171c, roughness: 0.5, metalness: 0.5 });
    const slotColors = [0xff2b6a, 0x21e6ff, 0xffc93c, 0x8a5bff, 0x3dff7a];
    const screenTex = slotColors.map((c, i) => this._slotTexture('#' + c.toString(16).padStart(6, '0'), i));
    const tableGeo = new THREE.BoxGeometry(CELL, 0.12, CELL);
    const rimGeo = new THREE.BoxGeometry(CELL, 0.1, CELL);
    const legGeo = new THREE.CylinderGeometry(0.28, 0.4, 0.85, 8);
    const cabGeo = new THREE.BoxGeometry(1.25, 2.0, 1.1);
    const scrGeo = new THREE.PlaneGeometry(0.95, 0.8);
    let slotIdx = 0;

    for (let cz = 0; cz < this.h; cz++) {
      for (let cx = 0; cx < this.w; cx++) {
        const ch = MAP[cz][cx];
        const [x, z] = this.center(cx, cz);
        if (ch === '.') continue;
        if (ch === 'Z') { this.spawns.push({ x, z }); continue; }
        if (ch === 'P') { this.playerSpawn.set(x, 0, z); continue; }
        this.blockedGrid[cz * this.w + cx] = 1;
        if (ch === '#') { walls.push({ sx: CELL, sy: WALL_H, sz: CELL, x, y: WALL_H / 2, z }); continue; }
        if (ch === 'C') {
          obstacles.push({ sx: CELL * 0.9, sy: WALL_H, sz: CELL * 0.9, x, y: WALL_H / 2, z });
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, WALL_H, 16), wallMat);
          col.position.set(x, WALL_H / 2, z);
          const ring1 = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.3, 16), goldMat);
          ring1.position.set(x, 0.15, z);
          const ring2 = ring1.clone(); ring2.position.y = WALL_H - 0.15;
          scene.add(col, ring1, ring2);
          continue;
        }
        const h = OBSTACLE_H[ch];
        obstacles.push({ sx: CELL, sy: h, sz: CELL, x, y: h / 2, z });
        if (ch === 'T') {
          const top = new THREE.Mesh(tableGeo, feltMat); top.position.set(x, 0.99, z);
          const rim = new THREE.Mesh(rimGeo, woodMat); rim.position.set(x, 0.9, z); rim.scale.set(1.02, 1, 1.02);
          const leg = new THREE.Mesh(legGeo, darkMat); leg.position.set(x, 0.425, z);
          scene.add(top, rim, leg);
          // a few chip stacks so tables read as tables
          if ((cx * 7 + cz * 3) % 2 === 0) {
            const chip = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 10),
              new THREE.MeshStandardMaterial({ color: [0xc0392b, 0x2255cc, 0x111111, 0xf1ede4][(cx + cz) % 4], roughness: 0.5 }));
            chip.position.set(x + 0.4, 1.1, z - 0.3);
            scene.add(chip);
          }
        } else if (ch === 'S') {
          const color = slotColors[slotIdx % slotColors.length];
          const facing = (cz === 3 || cz === 17) ? 1 : -1; // screens face the aisle between rows
          const cab = new THREE.Mesh(cabGeo, darkMat); cab.position.set(x, 1.0, z);
          const scrMat = new THREE.MeshBasicMaterial({ map: screenTex[slotIdx % screenTex.length] });
          const scr = new THREE.Mesh(scrGeo, scrMat);
          scr.position.set(x, 1.35, z + facing * 0.56);
          if (facing < 0) scr.rotation.y = Math.PI;
          const topper = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.16, 1.1),
            new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7 }));
          topper.position.set(x, 2.08, z);
          const tray = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.3), goldMat);
          tray.position.set(x, 0.75, z + facing * 0.62);
          scene.add(cab, scr, topper, tray);
          const phase = slotIdx * 1.7;
          this.animated.push(t => { topper.material.emissiveIntensity = 0.6 + Math.sin(t * 3 + phase) * 0.35; });
          slotIdx++;
        } else if (ch === 'B') {
          const base = new THREE.Mesh(new THREE.BoxGeometry(CELL, 1.05, CELL), woodMat); base.position.set(x, 0.525, z);
          const top = new THREE.Mesh(new THREE.BoxGeometry(CELL * 1.02, 0.1, CELL * 1.02), goldMat); top.position.set(x, 1.1, z);
          scene.add(base, top);
          for (let i = 0; i < 3; i++) {
            const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.32, 8),
              new THREE.MeshStandardMaterial({ color: [0x2f8f4e, 0x8a4b12, 0x27408b][(cx + i) % 3], roughness: 0.2, metalness: 0.3 }));
            bottle.position.set(x - 0.5 + i * 0.5, 1.31, z + ((cx + cz + i) % 2 ? 0.3 : -0.35));
            scene.add(bottle);
          }
        } else if (ch === 'M') {
          this._buildMystery(x, z, goldMat, darkMat);
        } else if (RACKS[ch]) {
          this._buildRack(x, z, RACKS[ch], woodMat, goldMat);
        } else if (PERKS[ch]) {
          this._buildPerk(x, z, PERKS[ch], darkMat);
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
    const carpet = this._carpetTexture();
    carpet.wrapS = carpet.wrapT = THREE.RepeatWrapping;
    carpet.repeat.set(this.sizeX / 4, this.sizeZ / 4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(this.sizeX, this.sizeZ),
      new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(this.sizeX / 2, 0, this.sizeZ / 2);
    scene.add(floor);
    this.floor = floor;
    this.solids.push(floor);

    const ceilTex = this._ceilingTexture();
    ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping;
    ceilTex.repeat.set(this.sizeX / 4, this.sizeZ / 4);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(this.sizeX, this.sizeZ),
      new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 1 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(this.sizeX / 2, WALL_H, this.sizeZ / 2);
    scene.add(ceil);
    this.solids.push(ceil);

    // Lighting: warm chandeliers on a coarse grid plus dim fill so nothing is pitch black.
    scene.add(new THREE.HemisphereLight(0xffe2c0, 0x3a1020, 0.55));
    scene.add(new THREE.AmbientLight(0x554050, 0.6));
    const bulbGeo = new THREE.SphereGeometry(0.28, 12, 8);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe6b0 });
    const lightSpots = [[7.5, 4.5], [15.5, 4.5], [26, 4.5], [5, 11.5], [15.5, 11.5], [26, 11.5], [7.5, 19], [15.5, 19], [26, 19]];
    const tints = [0xffc27a, 0xffd9a0, 0xffb090, 0xffd9a0, 0xfff0d0, 0xffd9a0, 0xffb090, 0xffd9a0, 0xffc27a];
    lightSpots.forEach(([cx, cz], i) => {
      const l = new THREE.PointLight(tints[i], 46, 30, 1.6);
      l.position.set(cx * CELL, WALL_H - 0.7, cz * CELL);
      scene.add(l);
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.copy(l.position);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), goldMat);
      stem.position.set(l.position.x, WALL_H - 0.25, l.position.z);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 6, 20), goldMat);
      ring.rotation.x = Math.PI / 2; ring.position.copy(l.position);
      scene.add(bulb, stem, ring);
    });
  }

  _buildMystery(x, z, goldMat, darkMat) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.5, 1.7), goldMat); body.position.y = 0.75;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 1.8), darkMat); lid.position.y = 1.58;
    const glowMat = new THREE.MeshStandardMaterial({ color: 0x21e6ff, emissive: 0x21e6ff, emissiveIntensity: 0.8 });
    const glow = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.12, 1.74), glowMat); glow.position.y = 1.1;
    g.add(body, lid, glow);
    const label = labelSprite(['MYSTERY SLOT', BOX_COST + ' pts'], '#21e6ff');
    label.position.y = 3.2;
    g.add(label);
    const display = new THREE.Group();
    display.position.y = 2.25;
    g.add(display);
    const light = new THREE.PointLight(0x21e6ff, 14, 9, 2);
    light.position.y = 2.4;
    g.add(light);
    this.scene.add(g);
    this.mystery = { x, z, display, glowMat, light, label };
    this.animated.push(t => {
      glowMat.emissiveIntensity = 0.7 + Math.sin(t * 4) * 0.35;
      display.rotation.y = t * 1.6;
    });
    this.interactables.push({ type: 'box', x, z });
  }

  _buildRack(x, z, weaponId, woodMat, goldMat) {
    const w = WEAPONS[weaponId];
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.9, 0.5), woodMat); post.position.y = 0.95;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.6), goldMat); cap.position.y = 1.95;
    g.add(post, cap);
    for (const side of [1, -1]) {
      const model = buildWeaponModel(weaponId);
      model.scale.setScalar(1.7);
      model.rotation.y = Math.PI / 2;
      model.position.set(-0.45, 1.25, side * 0.32);
      g.add(model);
    }
    const label = labelSprite([w.name.toUpperCase(), w.cost + ' pts']);
    label.position.y = 2.75;
    g.add(label);
    this.scene.add(g);
    this.interactables.push({ type: 'wallbuy', weapon: weaponId, cost: w.cost, x, z });
  }

  _buildPerk(x, z, perk, darkMat) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const mat = new THREE.MeshStandardMaterial({ color: perk.color, emissive: perk.color, emissiveIntensity: 0.55 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 1.2), darkMat); body.position.y = 1.1;
    const face = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 1.26), mat); face.position.y = 1.5;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 0.3, 12), mat); top.position.y = 2.35;
    g.add(body, face, top);
    const label = labelSprite([perk.name.toUpperCase(), perk.cost + ' pts'], '#' + perk.color.toString(16).padStart(6, '0'));
    label.position.y = 3.15;
    g.add(label);
    this.scene.add(g);
    this.animated.push(t => { mat.emissiveIntensity = 0.5 + Math.sin(t * 2.2 + x) * 0.2; });
    this.interactables.push({ type: 'perk', perk, x, z });
  }

  _wallTexture() {
    const t = canvasTexture(256, 512, (g, w, h) => {
      g.fillStyle = '#5a1422'; g.fillRect(0, 0, w, h);
      // damask-ish diamonds on the upper wall
      g.fillStyle = 'rgba(255,190,120,0.07)';
      for (let y = 0; y < 8; y++) for (let x = 0; x < 5; x++) {
        const px = x * 64 + (y % 2 ? 32 : 0), py = y * 44 + 10;
        g.beginPath(); g.moveTo(px, py - 18); g.lineTo(px + 14, py); g.lineTo(px, py + 18); g.lineTo(px - 14, py); g.fill();
      }
      // wood wainscot
      const y0 = h * 0.68;
      g.fillStyle = '#2b190d'; g.fillRect(0, y0, w, h - y0);
      g.fillStyle = '#3a2413';
      g.fillRect(18, y0 + 26, w / 2 - 28, h - y0 - 52);
      g.fillRect(w / 2 + 10, y0 + 26, w / 2 - 28, h - y0 - 52);
      g.fillStyle = '#c9a227'; g.fillRect(0, y0 - 6, w, 8);
      g.fillStyle = '#c9a227'; g.fillRect(0, 18, w, 6);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h - 14, w, 14);
    });
    return t;
  }

  _carpetTexture() {
    return canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#4a0f1c'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#8a6a1c'; g.lineWidth = 5;
      for (let i = -1; i < 3; i++) for (let j = -1; j < 3; j++) {
        const cx = i * 128 + 64, cy = j * 128 + 64;
        g.beginPath(); g.moveTo(cx, cy - 64); g.lineTo(cx + 64, cy); g.lineTo(cx, cy + 64); g.lineTo(cx - 64, cy); g.closePath(); g.stroke();
      }
      g.fillStyle = '#6d1027';
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        g.beginPath(); g.arc(i * 128, j * 128, 22, 0, 6.3); g.fill();
      }
      g.fillStyle = '#c9a227';
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        g.beginPath(); g.arc(i * 128 + 64, j * 128 + 64, 7, 0, 6.3); g.fill();
      }
    });
  }

  _ceilingTexture() {
    return canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = '#1a1014'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#3a2a1a'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
      g.fillStyle = '#241519'; g.fillRect(18, 18, w - 36, h - 36);
    });
  }

  _slotTexture(color, seed) {
    return canvasTexture(256, 216, (g, w, h) => {
      g.fillStyle = '#08080c'; g.fillRect(0, 0, w, h);
      g.fillStyle = color; g.fillRect(0, 0, w, 44);
      g.fillStyle = '#08080c'; g.font = 'bold 30px Impact, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(['LUCKY 7s', 'MEGA WIN', 'GOLD RUSH', 'WILD CARD', 'HOT SPIN'][seed % 5], w / 2, 24);
      const syms = ['7', 'BAR', '7', '$', '7', 'BAR'];
      for (let i = 0; i < 3; i++) {
        g.fillStyle = '#f4efe2'; g.fillRect(14 + i * 80, 60, 68, 104);
        const s = syms[(i + seed) % syms.length];
        g.fillStyle = s === '7' ? '#c8102e' : s === '$' ? '#1f8a3d' : '#111';
        g.font = `bold ${s === 'BAR' ? 26 : 62}px Impact, Arial Black, sans-serif`;
        g.fillText(s, 48 + i * 80, 114);
      }
      g.fillStyle = color; g.fillRect(14, 178, w - 28, 22);
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

  // Breadth-first distance field from the player's cell; zombies walk downhill on it.
  computeFlow(px, pz) {
    const w = this.w, h = this.h, flow = this.flow;
    flow.fill(-1);
    let sx = Math.floor(px / CELL), sz = Math.floor(pz / CELL);
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
        // diagonals save a step, so prefer them slightly
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
