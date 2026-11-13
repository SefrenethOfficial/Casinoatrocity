// The Lobby: where you start. A rainy front yard outside the Last Call Hotel, and through the doors
// a warm, fire-lit hall with the display cabinets (cases, knives, armory, settings), a reception desk
// and the brass elevator that takes you down into the game. No enemies here.
import * as THREE from 'three';
import { Batcher, tex, speckle, flat, glow, mapped, sprite, mats, furn, wallpaperTex, ceilingTex, rugTex, brickTex, elevatorTex, plaqueTex } from './build.js';
import { buildWeaponModel } from './models.js';

export const CELL = 2;
export const WALL_H = 4;       // the hall is taller than the hotel floors
const FACADE_H = 12, DOOR_H = 2.8;

// x fence  g grass  c cobbles  h hedge  t tree  l lamp post  P spawn  # hotel wall  D front door
// . hall  T plant  R reception  A armchair  F fireplace  C clock  S sofa  E elevator
// 1 cases  2 knives  3 armory  4 settings
const MAP = [
  'xxxxxxxxxxxxx',
  'xtggggcggggtx',
  'xgggggPgggggx',
  'xgglggcgglggx',
  'xgggggcgggggx',
  'xhhhhgcghhhhx',
  'xgggggcgggggx',
  '######D######',
  '####T...R####',
  '####....R####',
  '####1...2####',
  '####A...C####',
  '####F...S####',
  '####A...S####',
  '####3...4####',
  '####.....####',
  '####.....####',
  '######E######',
  '#############',
];
const OPEN = new Set(['g', 'c', 'P', '.', 'D']);
const YARD_ROWS = 7;

const grassTex = () => tex(64, 64, (g, w, h) => { g.fillStyle = '#1d2b17'; g.fillRect(0, 0, w, h); speckle(g, w, h, 220, ['#26381e', '#1a2613', '#30432a', '#151e0f'], 2, 6); });
const cobbleTex = () => tex(64, 64, (g, w, h) => {
  g.fillStyle = '#15151a'; g.fillRect(0, 0, w, h);
  const sh = ['#4a4a55', '#3e3e48', '#55555f', '#44444c'];
  for (let r = 0; r < 4; r++) for (let c = -1; c < 4; c++) { g.fillStyle = sh[(r * 3 + c + 4) % 4]; g.fillRect(c * 16 + (r % 2 ? 8 : 0) + 1, r * 16 + 1, 14, 14); }
  speckle(g, w, h, 60, ['rgba(0,0,0,0.3)', 'rgba(120,140,190,0.12)'], 2, 5);
});
const leafTex = () => tex(64, 64, (g, w, h) => { g.fillStyle = '#16261a'; g.fillRect(0, 0, w, h); speckle(g, w, h, 260, ['#1f3a22', '#102014', '#2a4a2a', '#0c160e'], 3, 7); });
const stoneTex = () => brickTex('#5a5860', '#4c4a52', '#64626a', '#26252a');
const fenceTex = () => tex(64, 64, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.fillStyle = '#0c0c10';
  for (let x = 4; x < w; x += 16) { g.fillRect(x, 8, 4, h - 8); g.beginPath(); g.moveTo(x - 3, 10); g.lineTo(x + 2, 0); g.lineTo(x + 7, 10); g.fill(); }
  g.fillRect(0, 16, w, 4); g.fillRect(0, h - 10, w, 4);
}, 1);
const runnerTex = () => tex(64, 64, (g, w, h) => {
  g.fillStyle = '#5a1420'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#c9a227'; g.fillRect(4, 0, 3, h); g.fillRect(w - 7, 0, 3, h);
  g.fillStyle = '#3a0c14'; g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h);
  g.fillStyle = '#7a2230'; for (let y = 8; y < h; y += 32) { g.beginPath(); g.moveTo(32, y - 8); g.lineTo(42, y + 8); g.lineTo(32, y + 24); g.lineTo(22, y + 8); g.fill(); }
  speckle(g, w, h, 50, ['rgba(0,0,0,0.2)'], 2, 6);
});
const windowLitTex = (kind) => tex(48, 72, (g, w, h) => {
  if (kind === 0) { g.fillStyle = '#0d1018'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(120,140,190,0.18)'; g.fillRect(6, 6, 10, 24); }
  else {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffd27a'); gr.addColorStop(1, '#d88a30'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(120,40,30,0.75)'; g.fillRect(0, 0, 9, h); g.fillRect(w - 9, 0, 9, h);
    if (kind === 2) { g.fillStyle = '#0a0606'; g.beginPath(); g.arc(24, 30, 7, 0, 6.3); g.fill(); g.fillRect(15, 36, 18, 36); }
  }
  g.fillStyle = '#1a1210'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3); g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h); g.fillRect(w / 2 - 1, 0, 3, h); g.fillRect(0, h / 2 - 1, w, 3);
}, 1);
const signTex = () => tex(512, 128, (g, w, h) => {
  g.fillStyle = '#0c0606'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#5a1a1a'; g.lineWidth = 6; g.strokeRect(4, 4, w - 8, h - 8);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 64px Georgia, serif';
  g.shadowColor = '#ff2030'; g.shadowBlur = 18; g.fillStyle = '#ff5a62'; g.fillText('THE LAST CALL', w / 2, 46);
  g.font = 'bold 40px Georgia, serif'; g.shadowColor = '#ffb040'; g.fillStyle = '#ffd98a'; g.fillText('H  O  T  E  L', w / 2, 100);
}, 1);
const skyTex = () => tex(64, 64, (g, w, h) => { g.fillStyle = '#38425e'; g.fillRect(0, 0, w, h); speckle(g, w, h, 90, ['#2a3248', '#465274', '#222a3e', '#50608a'], 6, 20); }, 1);
const dialTex = () => tex(96, 56, (g, w, h) => {
  g.fillStyle = '#2a1c10'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#d8c890'; g.beginPath(); g.arc(w / 2, h - 6, 42, Math.PI, 0); g.fill();
  g.fillStyle = '#1a1206'; g.font = 'bold 11px Georgia, serif'; g.textAlign = 'center';
  ['L', '1', '2', '3', '4'].forEach((t, i) => { const a = Math.PI - (i + 0.5) * Math.PI / 5; g.fillText(t, w / 2 + Math.cos(a) * 32, h - 8 - Math.sin(a) * 30); });
}, 1);

export class Lobby {
  constructor(scene) {
    this.scene = scene;
    this.h = MAP.length; this.w = MAP[0].length;
    this.blockedGrid = new Uint8Array(this.w * this.h);
    this.obstacles = [];   // tight colliders for the hall furniture
    this.interactables = [];
    this.solids = [];
    this.animated = [];
    this.playerSpawn = new THREE.Vector3();
    this.lawnCenter = [this.w * CELL / 2, 6];
    this.skyMat = null; this.stormLight = null; this.stormBase = 34;
    this.time = 0;
    this._build();
  }

  at(cx, cz) { return (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) ? '#' : MAP[cz][cx]; }
  blocked(cx, cz) { return (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) ? true : this.blockedGrid[cz * this.w + cx] === 1; }
  center(cx, cz) { return [(cx + 0.5) * CELL, (cz + 0.5) * CELL]; }
  isOutdoor(x, z) { return z < YARD_ROWS * CELL + 0.6; }

  _build() {
    const scene = this.scene, M = mats(), B = new Batcher();
    const paper = mapped(wallpaperTex({ paper: '#5d2a2c', paper2: '#662f31', motif: 'rgba(214,170,80,0.5)', wood: '#4a2f1b', trim: '#2c1a0e' }));
    const stone = mapped(stoneTex()), brick = mapped(brickTex());
    const W = this.w * CELL, yardD = YARD_ROWS * CELL, H = WALL_H;

    for (let cz = 0; cz < this.h; cz++) for (let cx = 0; cx < this.w; cx++) {
      const ch = MAP[cz][cx];
      if (!OPEN.has(ch)) this.blockedGrid[cz * this.w + cx] = 1;
      if (ch === 'P') this.playerSpawn.set((cx + 0.5) * CELL, 0, (cz + 0.5) * CELL);
    }

    // ------------------------------------------------ the yard
    B.plane(mapped(grassTex()), W + 40, yardD + 30, W / 2, 0, yardD / 2 - 15, (W + 40) / 2, (yardD + 30) / 2);
    const cobble = mapped(cobbleTex());
    B.plane(cobble, 2.6, yardD - 2, W / 2, 0.02, yardD / 2 + 1, 1.3, (yardD - 2) / 2);
    B.plane(cobble, 7, 2.4, W / 2, 0.025, yardD - 1.2, 3.5, 1.2);
    B.box(stone, 4.6, 0.12, 1.2, W / 2, 0.06, yardD - 0.6);
    const puddle = new THREE.MeshBasicMaterial({ color: 0x232c44, transparent: true, opacity: 0.8 });
    for (const [x, z, r] of [[10.5, 9.2, 0.9], [15.6, 5.1, 0.7], [12.6, 3.4, 0.5], [17.5, 11.6, 1.1], [7.4, 12.4, 0.8]])
      B.add(puddle, new THREE.CircleGeometry(r, 7), x, 0.035, z, r * 3, -Math.PI / 2);

    // iron fence with brick piers, and the front gate
    const fence = new THREE.MeshLambertMaterial({ map: fenceTex(), alphaTest: 0.5, side: THREE.DoubleSide });
    B.quad(fence, W - 4, 2.2, W / 2, 1.1, 2, 0, (W - 4) / 2, 1);
    B.quad(fence, yardD - 2, 2.2, 2, 1.1, yardD / 2 + 1, Math.PI / 2, (yardD - 2) / 2, 1);
    B.quad(fence, yardD - 2, 2.2, W - 2, 1.1, yardD / 2 + 1, -Math.PI / 2, (yardD - 2) / 2, 1);
    const pier = (x, z, tall = 2.5) => { B.box(brick, 0.6, tall, 0.6, x, tall / 2, z); B.box(stone, 0.76, 0.14, 0.76, x, tall + 0.07, z); };
    for (const x of [2, 7, 19, W - 2]) pier(x, 2);
    for (const z of [6, 10]) { pier(2, z); pier(W - 2, z); }
    for (const x of [11.6, 14.4]) { pier(x, 2, 3.1); B.box(glow(0xffc878), 0.26, 0.34, 0.26, x, 3.42, 2); B.cone(M.iron, 0.24, 0.2, x, 3.7, 2, 4); }
    B.box(M.iron, 2.8, 0.1, 0.1, W / 2, 3.0, 2);
    // dead trees beyond the fence
    const bark = flat(0x16110e), pine = flat(0x0d1711);
    const tree = (x, z, s) => { B.cyl(bark, 0.12 * s, 0.2 * s, 2.2 * s, x, 1.1 * s, z, 5); B.cone(pine, 1.3 * s, 2.6 * s, x, 3.0 * s, z, 6); B.cone(pine, 0.95 * s, 2.2 * s, x, 4.3 * s, z, 6); B.cone(pine, 0.55 * s, 1.6 * s, x, 5.4 * s, z, 5); };
    for (const [x, z, s] of [[-2, 3, 1.3], [-4, 9, 1.6], [-1.5, 13, 1.1], [4, -2.5, 1.5], [9, -4, 1.2], [17, -3, 1.6], [22, -2, 1.2], [28, 4, 1.5], [29.5, 10, 1.2], [27.5, 13.5, 1.4], [13, -7, 1.8]]) tree(x, z, s);

    const hedge = mapped(leafTex());
    for (let cz = 0; cz < YARD_ROWS; cz++) for (let cx = 0; cx < this.w; cx++) {
      const ch = MAP[cz][cx], [x, z] = this.center(cx, cz);
      if (ch === 'h') { B.box(hedge, CELL, 1.15, 1.3, x, 0.575, z); }
      else if (ch === 't') { B.cyl(bark, 0.16, 0.26, 3.2, x, 1.6, z, 6); B.cone(hedge, 1.5, 2.4, x, 3.6, z, 6); B.cone(hedge, 1.1, 2.0, x, 4.9, z, 6); }
      else if (ch === 'l') {
        B.cyl(M.iron, 0.16, 0.2, 0.3, x, 0.15, z, 6); B.cyl(M.iron, 0.05, 0.07, 3.0, x, 1.5, z, 5); B.box(M.iron, 0.5, 0.05, 0.05, x, 2.9, z);
        B.box(glow(0xffc878), 0.3, 0.42, 0.3, x, 3.2, z); B.cone(M.iron, 0.3, 0.24, x, 3.53, z, 4); B.box(M.iron, 0.36, 0.04, 0.36, x, 2.98, z);
        const l = new THREE.PointLight(0xffc070, 16, 13, 1.6); l.position.set(x, 3.1, z); scene.add(l);
      }
    }

    // ------------------------------------------------ the facade
    const fz = yardD, back = Math.PI;
    B.quad(brick, 22, FACADE_H, 1, FACADE_H / 2, fz, back, 11, FACADE_H / 2);
    B.quad(brick, 22, FACADE_H, W - 1, FACADE_H / 2, fz, back, 11, FACADE_H / 2);
    B.quad(brick, 2, FACADE_H - DOOR_H, W / 2, (FACADE_H + DOOR_H) / 2, fz, back, 1, (FACADE_H - DOOR_H) / 2);
    B.box(stone, W + 20, 0.5, 0.7, W / 2, FACADE_H, fz - 0.1); B.box(stone, W + 20, 0.22, 0.24, W / 2, 4.2, fz - 0.1); B.box(stone, W + 20, 0.22, 0.24, W / 2, 7.5, fz - 0.1);
    B.box(stone, W + 20, 0.5, 0.2, W / 2, 0.25, fz - 0.08);
    const winMat = [0, 1, 2].map(k => new THREE.MeshBasicMaterial({ map: windowLitTex(k) }));
    const windowAt = (x, y, kind) => {
      B.quad(winMat[kind], 1.3, 1.9, x, y, fz - 0.05, back);
      B.box(stone, 1.6, 0.12, 0.26, x, y - 1.02, fz - 0.1); B.box(stone, 1.6, 0.16, 0.2, x, y + 1.03, fz - 0.08);
    };
    const lit = [1, 0, 1, 1, 0, 2, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0];
    let wi = 0;
    for (const y of [5.9, 9.3]) for (const x of [2.6, 5.8, 9, 13, 17, 20.2, 23.4]) { if (x === 13 && y < 7) continue; windowAt(x, y, lit[wi++ % lit.length]); }
    for (const x of [3.4, 7.6, 18.4, 22.6]) windowAt(x, 2.0, 1);
    // entrance: stone surround, awning on brass posts, open doors, neon sign
    for (const x of [W / 2 - 1.25, W / 2 + 1.25]) B.box(stone, 0.45, DOOR_H + 0.2, 0.35, x, (DOOR_H + 0.2) / 2, fz - 0.12);
    B.box(stone, 3.1, 0.4, 0.4, W / 2, DOOR_H + 0.25, fz - 0.14);
    const awning = flat(0x3c0a14);
    B.box(awning, 5.2, 0.1, 3.0, W / 2, 3.35, fz - 1.5, 0, 0.14); B.box(awning, 5.2, 0.4, 0.06, W / 2, 2.98, fz - 2.98);
    B.box(M.brass, 5.2, 0.05, 0.08, W / 2, 2.78, fz - 2.98);
    for (const x of [W / 2 - 2.45, W / 2 + 2.45]) { B.cyl(M.brass, 0.05, 0.05, 3.0, x, 1.5, fz - 2.9, 6); B.cyl(M.brass, 0.14, 0.16, 0.1, x, 0.05, fz - 2.9, 6); }
    for (const x of [W / 2 - 0.93, W / 2 + 0.93]) { B.box(M.door, 0.07, DOOR_H - 0.1, 0.95, x, (DOOR_H - 0.1) / 2, fz + 0.7); B.box(M.brass, 0.05, 0.3, 0.05, x + (x < W / 2 ? 0.06 : -0.06), 1.2, fz + 1.05); }
    B.plane(flat(0x2a1a14), 1.5, 0.9, W / 2, 0.03, fz + 1.2);
    const signMat = new THREE.MeshBasicMaterial({ map: signTex() });
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6), signMat); signMesh.position.set(W / 2, 5.75, fz - 0.3); signMesh.rotation.y = back; scene.add(signMesh);
    B.box(M.iron, 6.7, 1.8, 0.14, W / 2, 5.75, fz - 0.2);
    this.animated.push(t => { const on = Math.sin(t * 23) > -0.93 || Math.sin(t * 3.1) > 0.2; signMat.color.setHex(on ? 0xffffff : 0x4a3030); });
    const spill = new THREE.PointLight(0xffb060, 18, 13, 1.5); spill.position.set(W / 2, 2.5, fz - 1.6); scene.add(spill);
    const signGlow = new THREE.PointLight(0xff4a50, 8, 12, 1.6); signGlow.position.set(W / 2, 5.6, fz - 1.6); scene.add(signGlow);

    // sky + moonlight (lightning flashes both)
    this.skyMat = new THREE.MeshBasicMaterial({ map: skyTex(), color: 0x3c3c3c, fog: false });
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), this.skyMat); sky.rotation.x = Math.PI / 2; sky.position.set(W / 2, 22, 0); scene.add(sky);
    const moon = new THREE.Mesh(new THREE.CircleGeometry(1.6, 12), new THREE.MeshBasicMaterial({ color: 0xdfe6f4, fog: false })); moon.position.set(-6, 19, -26); moon.lookAt(W / 2, 1.6, 6); scene.add(moon);
    this.stormLight = new THREE.PointLight(0x9fb8e0, this.stormBase, 70, 1.0); this.stormLight.position.set(W / 2 - 4, 15, 3); scene.add(this.stormLight);
    scene.add(new THREE.AmbientLight(0x4a4654, 0.9));
    scene.add(new THREE.HemisphereLight(0x55608a, 0x2a2018, 0.6));

    // ------------------------------------------------ the hall
    const hx0 = 4 * CELL, hx1 = 9 * CELL, hz0 = 8 * CELL, hz1 = 17 * CELL, hw = hx1 - hx0, hd = hz1 - hz0, hcx = W / 2;
    for (let cz = YARD_ROWS; cz < this.h; cz++) for (let cx = 0; cx < this.w; cx++) {
      const ch = MAP[cz][cx]; if (ch === '#') continue;
      const [x, z] = this.center(cx, cz), nook = ch === 'D' || ch === 'E', m = nook ? M.dark : paper;
      if (this.at(cx, cz - 1) === '#') B.quad(m, CELL, H, x, H / 2, cz * CELL, 0);
      if (this.at(cx, cz + 1) === '#') B.quad(m, CELL, H, x, H / 2, (cz + 1) * CELL, Math.PI);
      if (this.at(cx - 1, cz) === '#') B.quad(m, CELL, H, cx * CELL, H / 2, z, Math.PI / 2);
      if (this.at(cx + 1, cz) === '#') B.quad(m, CELL, H, (cx + 1) * CELL, H / 2, z, -Math.PI / 2);
      if (nook) { B.plane(M.boards, CELL, CELL, x, 0.01, z); B.plane(M.dark, CELL, CELL, x, DOOR_H, z, 1, 1, true); }
    }
    B.box(M.dark, CELL + 0.5, H - DOOR_H, 0.24, hcx, (H + DOOR_H) / 2, hz0 + 0.1);          // over the front door
    B.box(M.dark, 0.2, DOOR_H, 0.3, hcx - 1.08, DOOR_H / 2, hz0 + 0.1); B.box(M.dark, 0.2, DOOR_H, 0.3, hcx + 1.08, DOOR_H / 2, hz0 + 0.1);
    B.plane(M.boards, hw, hd, hcx, 0.01, hz0 + hd / 2, hw / 2, hd / 2);
    B.plane(mapped(ceilingTex()), hw, hd, hcx, H, hz0 + hd / 2, hw / 2, hd / 2, true);
    for (let z = hz0 + 2; z < hz1; z += 4) B.box(M.dark, hw, 0.26, 0.32, hcx, H - 0.13, z);
    for (const x of [hx0 + 0.14, hx1 - 0.14]) B.box(M.dark, 0.28, 0.26, hd, x, H - 0.13, hz0 + hd / 2);
    B.plane(mapped(runnerTex()), 2.6, hd - 0.6, hcx, 0.03, hz0 + hd / 2, 1, (hd - 0.6) / 2.6);
    B.plane(mapped(rugTex('#5a1a22', '#2a1210')), 1.9, 3.4, hx0 + 2.65, 0.035, 25, 1, 1);

    // chandeliers
    for (const z of [20.5, 29.5]) {
      B.cyl(M.iron, 0.02, 0.02, 0.9, hcx, H - 0.45, z, 4); B.cyl(M.brass, 0.75, 0.75, 0.07, hcx, 3.0, z, 8); B.cyl(M.brass, 0.38, 0.38, 0.06, hcx, 3.2, z, 8); B.cone(M.brass, 0.2, 0.3, hcx, 2.85, z, 6, Math.PI);
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, x = hcx + Math.cos(a) * 0.72, zz = z + Math.sin(a) * 0.72; B.cyl(M.cream, 0.03, 0.03, 0.2, x, 3.14, zz, 4); B.cone(glow(0xffd070), 0.05, 0.14, x, 3.31, zz, 4); }
      const l = new THREE.PointLight(0xffd09a, 24, 22, 1.4); l.position.set(hcx, 2.8, z); scene.add(l);
      const s = z; this.animated.push(t => { l.intensity = 24 * (0.94 + 0.06 * Math.sin(t * 9 + s)); });
    }

    // furniture, by map cell. West wall pieces face +x, east wall pieces face -x.
    for (let cz = YARD_ROWS + 1; cz < this.h; cz++) for (let cx = 0; cx < this.w; cx++) {
      const ch = MAP[cz][cx], [x, z] = this.center(cx, cz), west = cx < this.w / 2, ry = west ? Math.PI / 2 : -Math.PI / 2;
      if ('TACS'.includes(ch)) {
        if (ch === 'S' && MAP[cz - 1][cx] === 'S') continue;
        B.push(x, 0, z, ry);
        if (ch === 'T') furn.plant(B, M); else if (ch === 'A') furn.armchair(B, M); else if (ch === 'C') furn.clock(B, M); else furn.sofa(B, M);
        B.pop();
        const f = { T: [0, -0.5, 0.4, 0.4], A: [0, -0.5, 0.52, 0.46], C: [0, -0.76, 0.34, 0.26], S: [1, -0.5, 1.42, 0.46] }[ch];
        this._obstacle(x, z, ry, f[0], f[1], f[2], f[3]); this._free(cx, cz); if (ch === 'S') this._free(cx, cz + 1);
      }
      else if (ch === 'F') { this._fireplace(B, M, stone, x, z); this.obstacles.push({ x: x - 0.33, z, hw: 0.68, hd: 1.15, c: 1, s: 0 }); this._free(cx, cz); }
      else if (ch === 'R' && MAP[cz - 1][cx] !== 'R') { this._reception(B, M, x, z); this.obstacles.push({ x: x - 0.45, z: z + 1, hw: 0.46, hd: 1.9, c: 1, s: 0 }); this._free(cx, cz); this._free(cx, cz + 1); }
      else if (ch === '1') { this._cabinet(B, M, x, z, ry, 'cases', 'WEAPON CASES', 0xffd65e); this._obstacle(x, z, ry, 0, -0.5, 0.78, 0.48); this._free(cx, cz); }
      else if (ch === '2') { this._cabinet(B, M, x, z, ry, 'knives', 'KNIFE CRATES', 0xb070ff); this._obstacle(x, z, ry, 0, -0.5, 0.78, 0.48); this._free(cx, cz); }
      else if (ch === '3') { this._cabinet(B, M, x, z, ry, 'armory', 'ARMORY', 0x5b9dff); this._obstacle(x, z, ry, 0, -0.5, 0.78, 0.48); this._free(cx, cz); }
      else if (ch === '4') { this._cabinet(B, M, x, z, ry, 'settings', 'SETTINGS', 0x9fdc6a); this._obstacle(x, z, ry, 0, -0.5, 0.78, 0.48); this._free(cx, cz); }
      else if (ch === 'E') this._elevator(B, M, x, z);
    }
    // wall dressing: sconces and paintings
    const onWall = (x, z, ry, fn) => { B.push(x, 0, z, ry); fn(); B.pop(); };
    for (const z of [19, 23, 27, 31.5]) onWall(hx0 + 1, z, Math.PI / 2, () => furn.sconce(B, M, 2.95));
    for (const z of [21.5, 23.5, 29.5, 32.5]) onWall(hx1 - 1, z, -Math.PI / 2, () => furn.sconce(B, M, 2.95));
    onWall(hx0 + 1, 31, Math.PI / 2, () => furn.painting(B, M, 1, 1.3, 0.9, 1.9));
    onWall(hx0 + 1, 33, Math.PI / 2, () => furn.painting(B, M, 2, 0.8, 1.0, 1.9));
    onWall(hx1 - 1, 31.5, -Math.PI / 2, () => furn.painting(B, M, 2, 1.5, 1.0, 1.9));
    onWall(10, hz0 + 1, 0, () => furn.painting(B, M, 1, 1.2, 0.85, 2.1));
    onWall(10, hz1 - 1, Math.PI, () => { furn.painting(B, M, 0, 0.8, 1.0, 2.0); furn.sconce(B, M, 2.9, 0.9); });
    onWall(16, hz1 - 1, Math.PI, () => { furn.painting(B, M, 1, 1.0, 0.75, 2.0); furn.sconce(B, M, 2.9, -0.9); });

    B.build(scene);
  }

  _fireplace(B, M, stone, x, z) {
    const scene = this.scene, x0 = x - 1, H = WALL_H;   // x0 = the wall face; the chimney breast sticks out 1m
    B.box(stone, 1.0, H, 0.45, x0 + 0.5, H / 2, z - 0.78); B.box(stone, 1.0, H, 0.45, x0 + 0.5, H / 2, z + 0.78);
    B.box(stone, 1.0, H - 1.25, 1.2, x0 + 0.5, (H + 1.25) / 2, z);
    B.box(M.black, 0.1, 1.25, 1.2, x0 + 0.1, 0.62, z); B.box(M.black, 0.9, 0.04, 1.2, x0 + 0.5, 0.02, z);
    B.box(stone, 0.8, 0.1, 2.4, x0 + 1.35, 0.05, z);
    B.box(M.dark, 1.3, 0.12, 2.4, x0 + 0.68, 1.42, z); B.box(M.dark, 1.15, 0.12, 2.2, x0 + 0.6, 1.3, z);
    B.box(M.gold, 0.05, 1.5, 1.2, x0 + 1.02, 2.55, z);
    B.add(M.paint[0], new THREE.PlaneGeometry(1.04, 1.34), x0 + 1.05, 2.55, z, Math.PI / 2);
    for (const dz of [-0.95, 0.95]) { B.cyl(M.brass, 0.03, 0.07, 0.26, x0 + 1.05, 1.61, z + dz, 5); B.cyl(M.cream, 0.025, 0.025, 0.16, x0 + 1.05, 1.82, z + dz, 4); B.cone(glow(0xffd070), 0.04, 0.12, x0 + 1.05, 1.96, z + dz, 4); }
    B.box(M.brass, 0.3, 0.2, 0.2, x0 + 1.0, 1.58, z);
    for (const dz of [-0.28, 0.05, 0.3]) B.cyl(flat(0x2a1a10), 0.09, 0.09, 0.8, x0 + 0.5 + dz * 0.3, 0.14, z + dz, 5, Math.PI / 2);
    B.box(M.iron, 0.04, 0.5, 1.2, x0 + 0.98, 0.25, z);
    const flames = [];
    for (const [dz, s, c] of [[-0.25, 0.8, 0xff7a20], [0.02, 1.15, 0xffa030], [0.28, 0.7, 0xffc850], [0.0, 0.55, 0xffe890]]) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.75, 4), glow(c)); f.position.set(x0 + 0.5, 0.2 + 0.37 * s, z + dz); scene.add(f); flames.push([f, s, dz * 7]);
    }
    const light = new THREE.PointLight(0xff8a30, 22, 16, 1.5); light.position.set(x0 + 1.5, 0.9, z); scene.add(light);
    this.animated.push(t => {
      const f = 0.8 + 0.2 * Math.sin(t * 11) + 0.12 * Math.sin(t * 27);
      light.intensity = 22 * f;
      for (const [m, s, seed] of flames) { const k = s * (0.75 + 0.35 * Math.abs(Math.sin(t * 13 + seed))); m.scale.set(s, k, s); m.position.y = 0.2 + 0.37 * k; m.rotation.y = t * 4 + seed; }
    });
  }

  _reception(B, M, x, z) {
    // two cells along the east wall: (x, z) is the northern one
    const cz = z + 1, cxn = x - 0.45;
    B.box(M.wood, 0.75, 1.05, 3.7, cxn, 0.525, cz); B.box(M.dark, 0.95, 0.07, 3.85, cxn, 1.085, cz); B.box(M.dark, 0.8, 0.14, 3.75, cxn, 0.07, cz);
    for (const dz of [-1.2, 0, 1.2]) B.box(M.dark, 0.03, 0.7, 0.9, cxn - 0.385, 0.55, cz + dz);
    const plate = new THREE.MeshLambertMaterial({ map: plaqueTex('RECEPTION') });
    B.add(plate, new THREE.PlaneGeometry(1.3, 0.32), cxn - 0.41, 0.93, cz, -Math.PI / 2);
    B.cyl(M.brass, 0.1, 0.12, 0.05, cxn, 1.14, cz - 1.2, 8); B.cone(M.brass, 0.1, 0.1, cxn, 1.21, cz - 1.2, 8);
    B.box(M.cream, 0.4, 0.04, 0.55, cxn, 1.14, cz - 0.3, 0.2); B.box(M.fabric, 0.42, 0.03, 0.3, cxn, 1.13, cz + 0.35, -0.1);
    B.cyl(M.brass, 0.03, 0.08, 0.34, cxn + 0.1, 1.29, cz + 1.3, 5); B.box(glow(0x4fd070), 0.2, 0.1, 0.38, cxn + 0.05, 1.48, cz + 1.3);
    // key rack on the wall behind
    B.box(M.dark, 0.06, 1.2, 2.2, x + 0.96, 2.1, cz);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 7; k++) { B.box(M.brass, 0.03, 0.05, 0.05, x + 0.92, 2.45 - r * 0.36, cz - 0.9 + k * 0.3); if ((r * 7 + k) % 4) B.box(M.brass, 0.02, 0.16, 0.03, x + 0.915, 2.34 - r * 0.36, cz - 0.9 + k * 0.3); }
    B.box(M.wood, 0.4, 0.5, 0.4, x + 0.5, 0.25, cz + 0.6);
  }

  _cabinet(B, M, x, z, ry, act, label, color) {
    const scene = this.scene;
    B.push(x, 0, z, ry);
    B.box(M.wood, 1.5, 0.95, 0.9, 0, 0.475, -0.52); B.box(M.dark, 1.6, 0.07, 1.0, 0, 0.98, -0.5); B.box(M.dark, 1.56, 0.12, 0.96, 0, 0.06, -0.5);
    B.box(flat(0x3a1018), 1.5, 1.4, 0.08, 0, 1.7, -0.94);
    for (const sx of [-0.72, 0.72]) B.box(M.dark, 0.08, 1.4, 0.08, sx, 1.7, -0.1);
    B.box(M.dark, 1.6, 0.12, 1.0, 0, 2.45, -0.5); B.box(glow(color), 1.3, 0.04, 0.06, 0, 2.38, -0.12);
    B.add(new THREE.MeshLambertMaterial({ map: plaqueTex(label) }), new THREE.PlaneGeometry(1.2, 0.3), 0, 0.55, -0.06);
    B.pop();
    // rotating showpiece
    const fx = Math.sin(ry), px = x - fx * 0.5;   // 0.5m back toward the wall
    let item;
    if (act === 'cases') {
      item = new THREE.Group();
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.34, 0.4), M.olive), band = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.06, 0.42), M.brass), lid = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.43), M.brass);
      item.add(crate, band, lid);
    } else if (act === 'knives') { item = buildWeaponModel('knife'); item.scale.setScalar(2.4); }
    else if (act === 'armory') { item = buildWeaponModel('ar'); item.scale.setScalar(1.25); }
    else {
      item = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.42), M.wood), disc = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 10), M.black);
      disc.position.y = 0.1;
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.5, 8, 1, true), new THREE.MeshLambertMaterial({ color: 0xb9992f, side: THREE.DoubleSide }));
      horn.position.set(0.12, 0.42, 0); horn.rotation.z = 2.2;
      item.add(base, disc, horn);
    }
    item.position.set(px, 1.5, z); scene.add(item);
    const seed = x + z;
    this.animated.push(t => { item.rotation.y = t * 1.2 + seed; item.position.y = 1.5 + Math.sin(t * 2 + seed) * 0.05; });
    const s = sprite([label], '#' + color.toString(16).padStart(6, '0'), 1.8); s.position.set(x - fx * 0.2, 2.95, z); scene.add(s);
    const l = new THREE.PointLight(color, 3, 4.5, 2); l.position.set(x + fx * 0.3, 2.0, z); scene.add(l);
    this.interactables.push({ type: act, x, z });
  }

  _elevator(B, M, x, z) {
    const scene = this.scene, zf = z - 1, H = WALL_H;   // zf = the hall's south wall plane
    B.quad(mapped(elevatorTex()), CELL, 2.55, x, 1.275, zf + 0.45, Math.PI);
    B.box(M.brass, 0.14, 2.7, 0.24, x - 0.95, 1.35, zf + 0.38); B.box(M.brass, 0.14, 2.7, 0.24, x + 0.95, 1.35, zf + 0.38); B.box(M.brass, 2.04, 0.16, 0.24, x, 2.63, zf + 0.38);
    B.box(M.dark, CELL + 0.6, H - 2.7, 0.3, x, (H + 2.7) / 2, zf + 0.1);
    B.add(new THREE.MeshBasicMaterial({ map: dialTex() }), new THREE.PlaneGeometry(1.0, 0.58), x, 3.5, zf - 0.07, Math.PI);
    B.add(new THREE.MeshLambertMaterial({ map: plaqueTex('ELEVATOR') }), new THREE.PlaneGeometry(1.3, 0.3), x, 2.93, zf - 0.07, Math.PI);
    B.box(M.brass, 0.16, 0.3, 0.05, x + 1.4, 1.3, zf - 0.03); B.box(glow(0xffb040), 0.06, 0.06, 0.03, x + 1.4, 1.36, zf - 0.06);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.02), glow(0x7a1010)); needle.geometry.translate(0, 0.2, 0);
    needle.position.set(x, 3.26, zf - 0.09); scene.add(needle);
    this.animated.push(t => { needle.rotation.z = Math.sin(t * 0.4) * 1.2; });
    const l = new THREE.PointLight(0xffe0a0, 9, 8, 1.8); l.position.set(x, 2.6, zf - 1.0); scene.add(l);
    this.interactables.push({ type: 'elevator', x, z: zf + 0.2 });
  }

  flashLightning() { if (this.stormLight) this.stormLight.intensity = 380; if (this.skyMat) this.skyMat.color.setHex(0xffffff); }

  update(time) {
    this.time = time;
    for (const fn of this.animated) fn(time);
    const dt = Math.min(Math.max(time - (this._lastT ?? time), 0), 0.2); this._lastT = time;
    const s = this.stormLight;
    if (s && s.intensity > this.stormBase) { s.intensity = Math.max(this.stormBase, s.intensity - dt * 1100); if (s.intensity <= this.stormBase + 40 && this.skyMat) this.skyMat.color.setHex(0x3c3c3c); }
  }

  _free(cx, cz) { if (cx >= 0 && cz >= 0 && cx < this.w && cz < this.h) this.blockedGrid[cz * this.w + cx] = 0; }

  // A furniture collider: (px, pz) push origin, ry rotation, (lx, lz, hw, hd) local footprint.
  _obstacle(px, pz, ry, lx, lz, hw, hd) {
    const c = Math.cos(ry), sn = Math.sin(ry);
    this.obstacles.push({ x: px + lx * c + lz * sn, z: pz - lx * sn + lz * c, hw, hd, c, s: sn });
  }

  collideCircle(p, r) {
    this._collideWalls(p, r);
    for (const o of this.obstacles) this._collideBox(p, r, o);
    this._collideWalls(p, r);
    return p;
  }

  _collideWalls(p, r) {
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
}
