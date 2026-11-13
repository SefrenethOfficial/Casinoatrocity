// The Library: a hand-built floor, always the third place you reach. Two wings of shelves, a
// librarian's desk holding the solution paper, and up a short staircase a locked door with a
// keypad. The Stalker is in here with you, so you crouch and keep quiet.
import * as THREE from 'three';
import { tex, speckle, flat, glow, mapped, sprite, plaqueTex } from './build.js';

export const CELL = 2;

// v down-stairwell  L locked door  ^ ramp up to the landing  . floor
// S bookshelf  D librarian desk  P spawn  # wall
const MAP = [
  '#######################',
  '###########v###########',
  '###########v###########',
  '###########L###########',
  '#########.....#########',
  '##########^^^##########',
  '#.....................#',
  '#.SSSSSS.......SSSSSS.#',
  '#.....................#',
  '#.SSSSSS.......SSSSSS.#',
  '#.....................#',
  '#.SSSSSS.......SSSSSS.#',
  '#.....................#',
  '#.SSSSSS.......SSSSSS.#',
  '#.....................#',
  '#.SSSSSS.......SSSSSS.#',
  '#.....................#',
  '#.........DDD.........#',
  '#..........P..........#',
  '#######################',
];
const OPEN = new Set(['.', 'P', '^', 'v', 'L']);
const LANDING_Y = 1.0;

export const SHAPES = ['triangle', 'square', 'circle', 'diamond', 'star'];
export const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

// ---------------------------------------------------------------- shape drawing
export function drawShape(g, kind, cx, cy, r, color) {
  g.fillStyle = color; g.strokeStyle = color; g.lineWidth = Math.max(2, r * 0.22);
  g.beginPath();
  if (kind === 'circle') { g.arc(cx, cy, r, 0, 6.3); }
  else if (kind === 'square') { g.rect(cx - r * 0.84, cy - r * 0.84, r * 1.68, r * 1.68); }
  else if (kind === 'triangle') { g.moveTo(cx, cy - r); g.lineTo(cx + r * 0.92, cy + r * 0.72); g.lineTo(cx - r * 0.92, cy + r * 0.72); g.closePath(); }
  else if (kind === 'diamond') { g.moveTo(cx, cy - r); g.lineTo(cx + r * 0.82, cy); g.lineTo(cx, cy + r); g.lineTo(cx - r * 0.82, cy); g.closePath(); }
  else { // star
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
  }
  g.fill();
}

// A small data-URL icon of a shape, for the HUD.
export function shapeIcon(kind, color = '#7fd4ff', size = 26) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  drawShape(c.getContext('2d'), kind, size / 2, size / 2, size * 0.42, color);
  return c.toDataURL();
}

// ---------------------------------------------------------------- textures
const shelfWoodTex = () => tex(64, 64, (g, w, h) => {
  g.fillStyle = '#6a4a2c'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 6) { g.fillStyle = y % 12 ? '#583c23' : 'rgba(0,0,0,0.12)'; g.fillRect(0, y, w, 1); }
  speckle(g, w, h, 40, ['rgba(0,0,0,0.22)', 'rgba(200,160,100,0.05)'], 2, 5);
});
const libCarpetTex = () => tex(64, 64, (g, w, h) => {
  g.fillStyle = '#6a3a42'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 380, ['#5c3038', '#78454e', '#50282f', '#855060'], 2, 4);
});
const libWallTex = () => tex(64, 128, (g, w, h) => {
  g.fillStyle = '#8a7050'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#6d5436'; g.fillRect(0, h - 46, w, 46);
  g.fillStyle = '#a98a5c'; g.fillRect(0, h - 50, w, 4);
  for (let x = 4; x < w; x += 20) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, h - 42, 14, 38); }
  speckle(g, w, h, 90, ['rgba(0,0,0,0.12)', 'rgba(220,180,110,0.05)'], 2, 6);
});
const libCeilTex = () => tex(64, 64, (g, w, h) => {
  g.fillStyle = '#4a3c2c'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#31271c'; g.fillRect(0, 0, w, 5); g.fillRect(0, 0, 5, h);
  speckle(g, w, h, 60, ['rgba(0,0,0,0.2)'], 2, 6);
});
const booksRowTex = (seed = 0) => tex(64, 16, (g, w, h) => {
  const cols = ['#5a1a1a', '#1c3a2a', '#2a2a4a', '#6a5a2a', '#3a2418', '#5a3a1a', '#43203a'];
  let x = 0, i = seed; while (x < w) { const bw = 3 + (i * 7) % 4; g.fillStyle = cols[i % cols.length]; g.fillRect(x, (i * 3) % 3, bw, h); g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x + bw - 1, 0, 1, h); x += bw; i++; }
}, 1);
// the solution paper: five shapes in order, numbered I..V
function paperTex(order) {
  return tex(256, 320, (g, w, h) => {
    g.fillStyle = '#e8dfc4'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 70, ['rgba(140,120,80,0.14)', 'rgba(90,70,40,0.1)'], 2, 6);
    g.fillStyle = '#6a5a3a'; g.font = 'bold 22px Georgia, serif'; g.textAlign = 'center';
    g.fillText('ORDER OF ENTRY', w / 2, 34);
    g.fillRect(40, 44, w - 80, 2);
    order.forEach((kind, i) => {
      const y = 78 + i * 48;
      g.fillStyle = '#5a4a2a'; g.font = 'bold 26px Georgia, serif'; g.textAlign = 'left';
      g.fillText(ROMAN[i], 48, y + 10);
      drawShape(g, kind, 150, y, 17, '#2a2218');
    });
  }, 1);
}

export const LIBRARY = {
  id: 'library', name: 'The Reading Room', custom: true, size: [MAP[0].length, MAP.length],
  music: 'library',
  fog: { color: 0x161013, near: 12, far: 52 },
  ambient: [0x9a8a70, 1.05], hemi: [0xa89878, 0x2e2418, 0.6],
  lamp: { color: 0xffc07a, base: 26, dist: 18, bulb: 0xffe0a8, bulbY: 0.5, bulbR: 0.06, dead: 0, flick: 0, fixture: () => {} },
  mats: () => ({
    wall: mapped(libWallTex()), floor: mapped(libCarpetTex()), ceil: mapped(libCeilTex()),
    door: mapped(shelfWoodTex()), rugs: null,
  }),
  slots: [], closet: null, foot: {}, build: {},

  // ---------------------------------------------------------------- layout
  layout(W) {
    const w = W.w, h = W.h;
    W.blockedGrid.fill(1);
    for (let cz = 0; cz < h; cz++) for (let cx = 0; cx < w; cx++) {
      const ch = MAP[cz][cx];
      W.blockedGrid[cz * w + cx] = OPEN.has(ch) ? 0 : 1;
      W.roomOf[cz * w + cx] = 1;
      if (ch === 'S' || ch === 'D') W.noWall.add(cz * w + cx);   // furniture, not a room wall
      if (ch === 'P') W.playerSpawn.set((cx + 0.5) * CELL, 0, (cz + 0.5) * CELL);
    }
    // one big room so the rest of the game (spawning, the face, the HUD) still has something to read
    W.rooms = [{ id: 1, col: 0, row: 0, x0: 0, z0: 0, cx: (w / 2) * CELL, cz: (h / 2) * CELL, used: true, side: false, hall: false, dirs: [], feature: null }];
    W.startRoom = 1; W.stairsRoom = 1; W.path = [1];
    W.doors = [];
    for (const [cx, cz] of [[3, 8], [19, 8], [3, 14], [19, 14], [11, 10], [6, 16], [16, 16]])
      W.spawns.push({ x: (cx + 0.5) * CELL, z: (cz + 0.5) * CELL, room: 1 });

    // the landing at the top of the short staircase, and the ramp up to it
    W.ramps.push({ minX: 9 * CELL, maxX: 14 * CELL, minZ: 1 * CELL, maxZ: 5 * CELL, axis: 'z', from: LANDING_Y, to: LANDING_Y });
    W.ramps.push({ minX: 10 * CELL, maxX: 13 * CELL, minZ: 5 * CELL, maxZ: 6 * CELL, axis: 'z', a0: 6 * CELL, a1: 5 * CELL, from: 0, to: LANDING_Y });

    // the puzzle: every shape gets a digit, and the paper fixes the order they go in
    const shuffled = SHAPES.slice();
    for (let i = shuffled.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    const digits = {}; for (const k of SHAPES) digits[k] = 1 + ((Math.random() * 9) | 0);
    W.puzzle = {
      order: shuffled,                                  // the order shown on the paper, I..V
      digits,                                           // shape -> digit, learned from the books
      found: {},                                        // shapes you have actually picked up
      code: shuffled.map(k => digits[k]).join(''),
      unlocked: false, seenPaper: false,
    };
  },

  // ---------------------------------------------------------------- geometry
  geometry(W, S, D, M, K) {
    const scene = W.scene, w = W.w, h = W.h;
    const wood = mapped(shelfWoodTex()), dark = flat(0x241709), brass = flat(0xb9992f);
    const shelfCells = [];

    for (let cz = 0; cz < h; cz++) for (let cx = 0; cx < w; cx++) {
      const ch = MAP[cz][cx], x = (cx + 0.5) * CELL, z = (cz + 0.5) * CELL;
      if (ch === 'S') { shelfCells.push([cx, cz, x, z]); this.shelf(S, D, wood, dark, x, z, cx + cz); }
      else if (ch === 'D') { if (MAP[cz][cx - 1] !== 'D') this.desk(W, S, D, wood, dark, brass, x, z); }
    }

    // the raised landing: floor slab, edge, and balustrade
    const lx0 = 9 * CELL, lx1 = 14 * CELL, lz0 = 3 * CELL, lz1 = 5 * CELL;
    S.plane(K.floor, lx1 - lx0, lz1 - lz0, (lx0 + lx1) / 2, LANDING_Y, (lz0 + lz1) / 2, (lx1 - lx0) / 2, (lz1 - lz0) / 2);
    S.box(dark, lx1 - lx0, LANDING_Y, 0.2, (lx0 + lx1) / 2, LANDING_Y / 2, lz1);
    for (const sx of [lx0, lx1]) S.box(dark, 0.2, LANDING_Y, lz1 - lz0, sx, LANDING_Y / 2, (lz0 + lz1) / 2);
    // the short staircase up
    const sx0 = 10 * CELL, sx1 = 13 * CELL, sz0 = 5 * CELL, sz1 = 6 * CELL, steps = 5;
    for (let i = 0; i < steps; i++) {
      const t = i / steps, zz = sz1 - (sz1 - sz0) * (t + 0.5 / steps), y = LANDING_Y * (t + 1 / steps);
      S.box(dark, sx1 - sx0, 0.12, (sz1 - sz0) / steps + 0.03, (sx0 + sx1) / 2, y - 0.06, zz);
      S.box(flat(0x1a1008), sx1 - sx0, LANDING_Y / steps, 0.05, (sx0 + sx1) / 2, y - LANDING_Y / steps / 2, zz + (sz1 - sz0) / steps * 0.5);
    }
    for (const sx of [sx0 - 0.1, sx1 + 0.1]) {
      S.box(dark, 0.2, 1.1, sz1 - sz0, sx, LANDING_Y * 0.5 + 0.2, (sz0 + sz1) / 2);
      W._obstacle(sx, (sz0 + sz1) / 2, 0, 0, 0, 0.1, (sz1 - sz0) / 2);
    }

    // the locked door at the top, with its keypad
    this.door(W, S, D, dark, brass, 11.5 * CELL, 3.5 * CELL);

    // the exit stairwell beyond it, starting from the landing
    W.buildStairwell(11.5 * CELL, 1.5 * CELL, LANDING_Y);

    // hanging lights down the nave and over each wing
    for (const [lxc, lzc] of [[11.5, 7.5], [11.5, 11.5], [11.5, 15.5], [11.5, 18], [4.5, 8.5], [4.5, 12.5], [4.5, 16], [17.5, 8.5], [17.5, 12.5], [17.5, 16], [11.5, 4.5]]) {
      const x = lxc * CELL, z = lzc * CELL;
      D.cyl(flat(0x2a2218), 0.03, 0.03, 0.8, x, 3.3 - 0.4, z, 4);
      D.add(new THREE.MeshLambertMaterial({ color: 0x2f5a3a, side: THREE.DoubleSide, emissive: 0x16331f }), new THREE.ConeGeometry(0.46, 0.3, 10, 1, true), x, 2.5, z);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), glow(0xffe0a8)); bulb.position.set(x, 2.38, z); scene.add(bulb);
      const l = new THREE.PointLight(0xffc89a, 36, 24, 1.3); l.position.set(x, 2.3, z); scene.add(l);
      l.userData.base = 36; l.userData.bulb = bulb; W.lamps.push(l);
    }
    // glowing books on the lower shelves: one per shape, spread across both wings
    const picks = shelfCells.slice();
    for (let i = picks.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [picks[i], picks[j]] = [picks[j], picks[i]]; }
    SHAPES.forEach((kind, i) => {
      const [, , x, z] = picks[i % picks.length];
      const level = [0.5, 0.95, 1.4][(Math.random() * 3) | 0];        // the lower three shelves
      const face = Math.random() < 0.5 ? 1 : -1;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.1), new THREE.MeshBasicMaterial({ color: 0x7fd4ff }));
      mesh.position.set(x, level, z + face * 0.52);
      scene.add(mesh);
      const li = new THREE.PointLight(0x5ec8ff, 5, 3.4, 2); li.position.copy(mesh.position); scene.add(li);
      const seed = i * 1.7;
      W.animated.push(t => { const p = 0.72 + 0.28 * Math.sin(t * 3 + seed); mesh.material.color.setRGB(0.35 * p, 0.78 * p, 1.0 * p); li.intensity = 5 * p; });
      W.interactables.push({ type: 'book', shape: kind, x, z: z + face * 1.1, mesh, light: li });
    });
  },

  shelf(S, D, wood, dark, x, z, seed) {
    S.box(wood, 1.9, 2.5, 0.9, x, 1.25, z);
    S.box(dark, 2.0, 0.1, 1.0, x, 2.52, z);
    for (let k = 0; k < 5; k++) {
      const y = 0.32 + k * 0.48;
      S.box(dark, 1.82, 0.05, 0.92, x, y - 0.02, z);
      for (const face of [-1, 1]) D.quad(mapped(booksRowTex(seed + k * 3 + (face > 0 ? 1 : 7))), 1.7, 0.38, x, y + 0.2, z + face * 0.47, face > 0 ? 0 : Math.PI, 2, 1);
    }
  },

  desk(W, S, D, wood, dark, brass, x, z) {
    const cx = x + CELL;   // the desk spans three cells; x is the leftmost
    S.box(wood, 5.6, 1.1, 1.5, cx, 0.55, z);
    S.box(dark, 5.9, 0.1, 1.8, cx, 1.14, z);
    S.box(dark, 5.4, 0.12, 1.4, cx, 0.06, z);
    for (const dx of [-1.9, 0, 1.9]) S.box(dark, 0.06, 0.8, 1.2, cx + dx, 0.6, z + 0.3);
    W._obstacle(cx, z, 0, 0, 0, 2.95, 0.9);
    S.cyl(brass, 0.04, 0.1, 0.4, cx - 2.2, 1.35, z - 0.3, 6);
    S.box(glow(0x4fd070), 0.34, 0.12, 0.2, cx - 2.2, 1.58, z - 0.3);
    const plate = new THREE.MeshLambertMaterial({ map: plaqueTex('LIBRARIAN') });
    D.add(plate, new THREE.PlaneGeometry(1.2, 0.28), cx, 0.85, z + 0.78);
    // the solution paper, glowing on the desktop
    const mat = new THREE.MeshBasicMaterial({ map: paperTex(W.puzzle.order), side: THREE.DoubleSide });
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.78), mat);
    paper.position.set(cx + 0.9, 1.22, z); paper.rotation.set(-Math.PI / 2, 0, 0.2);
    W.scene.add(paper);
    const li = new THREE.PointLight(0xfff0b0, 5, 3.2, 2); li.position.set(cx + 0.9, 1.5, z); W.scene.add(li);
    W.animated.push(t => { li.intensity = 4 + Math.sin(t * 2.2) * 1.2; });
    W.interactables.push({ type: 'paper', x: cx + 0.9, z: z + 0.9, paper });
  },

  door(W, S, D, dark, brass, x, z) {
    const steel = flat(0x6a6f74);
    // frame
    S.box(dark, 0.3, 2.6, 0.4, x - 1.05, LANDING_Y + 1.3, z);
    S.box(dark, 0.3, 2.6, 0.4, x + 1.05, LANDING_Y + 1.3, z);
    S.box(dark, 2.4, 0.4, 0.4, x, LANDING_Y + 2.75, z);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.85, 2.5, 0.12), steel);
    leaf.position.set(x, LANDING_Y + 1.25, z); W.scene.add(leaf);
    const hinge = new THREE.Group(); hinge.position.set(x - 0.92, 0, z); W.scene.add(hinge);
    hinge.add(leaf); leaf.position.set(0.92, LANDING_Y + 1.25, 0);
    W.exitDoor = { leaf, hinge, open: false };
    W.solids.push(leaf);
    // keypad beside the door
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.46, 0.12), flat(0x2a2e32));
    pad.position.set(x + 1.3, LANDING_Y + 1.3, z + 0.2); W.scene.add(pad);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.14), glow(0x1e4a2a));
    screen.position.set(x + 1.3, LANDING_Y + 1.46, z + 0.27); W.scene.add(screen);
    const li = new THREE.PointLight(0x4fd070, 3, 2.6, 2); li.position.set(x + 1.3, LANDING_Y + 1.4, z + 0.5); W.scene.add(li);
    W.keypadLight = { screen, li };
    W.interactables.push({ type: 'keypad', x: x + 1.3, z: z + 1.0 });
    // block the doorway until it opens
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    W.blockedGrid[cz * W.w + cx] = 1;
    if (W.wallGrid) W.wallGrid[cz * W.w + cx] = 1;
    W._doorCell = cz * W.w + cx;
  },

  // called when the right code goes in
  openExit(W) {
    if (!W.exitDoor || W.exitDoor.open) return;
    W.exitDoor.open = true;
    W.blockedGrid[W._doorCell] = 0;
    if (W.wallGrid) W.wallGrid[W._doorCell] = 0;
    const i = W.solids.indexOf(W.exitDoor.leaf); if (i >= 0) W.solids.splice(i, 1);
    W.exitDoor.swing = -Math.PI * 0.55;
    if (W.keypadLight) { W.keypadLight.screen.material = glow(0x7dffa8); W.keypadLight.li.color.setHex(0x7dffa8); }
  },

  update(W, dt) {
    const d = W.exitDoor;
    if (d && d.open && d.hinge.rotation.y !== d.swing) {
      const step = dt * 2.2, diff = d.swing - d.hinge.rotation.y;
      d.hinge.rotation.y = Math.abs(diff) <= step ? d.swing : d.hinge.rotation.y + Math.sign(diff) * step;
    }
  },
};
