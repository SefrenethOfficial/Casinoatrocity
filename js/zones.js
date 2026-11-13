// The places the elevator can drop you. A floor's zone decides its surfaces, lighting and props.
// Every zone must supply one hideable prop (its `closet`) so the face event stays survivable.
//
// Props are built in a cell's local frame: the cell is 2m square, the piece's back sits at
// z = -1 (against the wall) and it faces +z. `foot` is its collider: [lx, lz, hw, hd].
import * as THREE from 'three';
import { tex, speckle, flat, glow, mapped, furn, wallpaperTex, ceilingTex, rugTex, boardsTex, doorTex } from './build.js';

// ---------------------------------------------------------------- the chips texture
const _chipClones = [];
let _chipsBase = null;
function chipsBase() {
  if (!_chipsBase) {
    _chipsBase = new THREE.TextureLoader().load('assets/img/chips.png', () => { for (const c of _chipClones) c.needsUpdate = true; });
    _chipsBase.colorSpace = THREE.SRGBColorSpace;
  }
  return _chipsBase;
}
// A chips map at whatever repeat and rotation you like. Deliberately mismatched on every surface.
function chips(rx = 2, ry = 2, rot = 0) {
  const t = chipsBase().clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.repeat.set(rx, ry); t.center.set(0.5, 0.5); t.rotation = rot;
  t.needsUpdate = true; _chipClones.push(t);
  return t;
}
const chipMat = (rx, ry, rot = 0) => new THREE.MeshLambertMaterial({ map: chips(rx, ry, rot) });

// ---------------------------------------------------------------- textures
const backWallTex = () => tex(128, 128, (g, w, h) => {
  g.fillStyle = '#c3ad4a'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(120,100,30,0.22)'; g.fillRect(x, 0, 2, h); }
  speckle(g, w, h, 300, ['rgba(150,125,40,0.22)', 'rgba(205,185,95,0.22)', 'rgba(90,75,20,0.16)'], 2, 8);
  for (let i = 0; i < 5; i++) {
    const cx = (i * 47) % w, cy = (i * 61) % h;
    const gr = g.createRadialGradient(cx, cy, 2, cx, cy, 24);
    gr.addColorStop(0, 'rgba(85,66,18,0.38)'); gr.addColorStop(1, 'rgba(85,66,18,0)');
    g.fillStyle = gr; g.fillRect(cx - 24, cy - 24, 48, 48);
  }
  g.fillStyle = '#a89338'; g.fillRect(0, h - 9, w, 9);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h - 11, w, 2);
});
const backCarpetTex = () => tex(64, 64, (g, w, h) => {
  g.fillStyle = '#8a7631'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 420, ['#7b6929', '#9c873e', '#695920', '#a6924c'], 2, 4);
});
const dropCeilTex = () => tex(64, 64, (g, w, h) => {
  g.fillStyle = '#d6d2c2'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#a5a195'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
  speckle(g, w, h, 140, ['rgba(0,0,0,0.06)', 'rgba(120,110,80,0.12)'], 2, 5);
});
const tileWallTex = (a, b, grout) => tex(128, 128, (g, w, h) => {
  g.fillStyle = grout; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) {
    g.fillStyle = ((x / 16 + y / 16) % 7 === 0) ? b : a;
    g.fillRect(x + 1, y + 1, 14, 14);
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x + 1, y + 1, 14, 2);
  }
  speckle(g, w, h, 90, ['rgba(0,0,0,0.10)', 'rgba(50,70,62,0.12)'], 2, 5);
});
const tileFloorTex = () => tex(64, 64, (g, w, h) => {
  g.fillStyle = '#4a504e'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) {
    g.fillStyle = (((x + y) / 32) % 2) ? '#8b928e' : '#7b827e';
    g.fillRect(x + 2, y + 2, 28, 28);
  }
  speckle(g, w, h, 130, ['rgba(0,0,0,0.18)', 'rgba(255,255,255,0.05)'], 2, 6);
});
const concreteTex = (base = '#6a6a68', n = 260) => tex(64, 64, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  speckle(g, w, h, n, ['rgba(0,0,0,0.13)', 'rgba(255,255,255,0.05)', 'rgba(35,35,35,0.14)'], 2, 7);
});
const deckTex = () => tex(64, 64, (g, w, h) => {
  g.fillStyle = '#5e5e5c'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 300, ['rgba(0,0,0,0.16)', 'rgba(255,255,255,0.04)'], 2, 8);
  g.fillStyle = 'rgba(18,14,8,0.4)'; g.beginPath(); g.arc(44, 20, 7, 0, 6.3); g.fill();
});
const officeWallTex = () => tex(64, 128, (g, w, h) => {
  g.fillStyle = '#cbc2ae'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#b5aa92'; g.fillRect(0, h - 14, w, 14);
  g.fillStyle = '#8a8070'; g.fillRect(0, h - 16, w, 2);
  speckle(g, w, h, 80, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.05)'], 2, 5);
});
const officeCarpetTex = () => tex(64, 64, (g, w, h) => {
  g.fillStyle = '#4d5055'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 420, ['#44474c', '#565a60', '#3c3f44', '#5e626a'], 2, 4);
});
const metalDoorTex = (base = '#9aa0a2', panel = '#868c8e') => tex(96, 160, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  g.fillStyle = panel; g.fillRect(8, 10, w - 16, 60); g.fillRect(8, 86, w - 16, 62);
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(8, 10, w - 16, 2); g.fillRect(8, 86, w - 16, 2);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(8, 68, w - 16, 2); g.fillRect(8, 146, w - 16, 2);
  speckle(g, w, h, 60, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.05)'], 2, 6);
});

// ---------------------------------------------------------------- light fixtures
function panelFixture(D, M, x, z, H, dead) {
  D.box(flat(0xb8bcc0), 1.4, 0.1, 0.52, x, H - 0.06, z);
  D.box(dead ? flat(0x3a3c38) : glow(0xf4f8e8), 1.26, 0.04, 0.4, x, H - 0.12, z);
}
function tubeFixture(D, M, x, z, H, dead) {
  D.box(flat(0x9aa0a4), 1.5, 0.08, 0.16, x, H - 0.05, z);
  D.cyl(dead ? flat(0x35372f) : glow(0xeaf6ff), 0.055, 0.055, 1.35, x, H - 0.14, z, 6, 0, Math.PI / 2);
}
function cageFixture(D, M, x, z, H, dead) {
  D.box(flat(0x2e2e30), 0.42, 0.12, 0.42, x, H - 0.06, z);
  D.cyl(dead ? flat(0x332e24) : glow(0xffd98a), 0.17, 0.2, 0.16, x, H - 0.2, z, 8);
  for (let k = 0; k < 4; k++) D.box(flat(0x24242a), 0.03, 0.2, 0.42, x + (k - 1.5) * 0.11, H - 0.2, z);
}
function pendantFixture(D, M, x, z, H, dead) {
  D.cyl(M.iron, 0.02, 0.02, 0.7, x, H - 0.35, z, 4);
  D.cyl(M.brass, 0.14, 0.14, 0.05, x, H - 0.02, z, 6);
  D.add(new THREE.MeshLambertMaterial({ color: 0x8a6a3a, side: THREE.DoubleSide, emissive: dead ? 0 : 0x4a3210 }),
    new THREE.ConeGeometry(0.42, 0.34, 8, 1, true), x, H - 0.8, z);
}

// ---------------------------------------------------------------- shared props
function boxStack(B) {
  const card = flat(0xa98a5a), tape = flat(0x8a7040);
  B.box(card, 0.8, 0.55, 0.6, -0.18, 0.27, -0.6, 0.12);
  B.box(tape, 0.82, 0.04, 0.1, -0.18, 0.55, -0.6, 0.12);
  B.box(card, 0.62, 0.45, 0.5, -0.1, 0.77, -0.58, -0.2);
  B.box(card, 0.7, 0.5, 0.55, 0.5, 0.25, -0.62, -0.3);
}
function chairStack(B) {
  const seat = flat(0x3f5a7a), leg = flat(0x6a6e72);
  for (let k = 0; k < 4; k++) {
    const y = 0.42 + k * 0.17;
    B.box(seat, 0.5, 0.05, 0.48, 0, y, -0.55 + k * 0.04);
    B.box(seat, 0.5, 0.42, 0.05, 0, y + 0.22, -0.78 + k * 0.04, 0, -0.12);
  }
  for (const sx of [-0.2, 0.2]) for (const dz of [-0.78, -0.34]) B.cyl(leg, 0.02, 0.02, 0.42, sx, 0.21, dz, 5);
}
function waterCooler(B) {
  const body = flat(0xd8dcd8), water = flat(0x79b6d8);
  B.box(body, 0.42, 0.95, 0.42, 0, 0.47, -0.72);
  B.cyl(water, 0.19, 0.16, 0.5, 0, 1.2, -0.72, 8);
  B.cyl(body, 0.1, 0.12, 0.1, 0, 0.98, -0.72, 7);
  B.box(flat(0x3a4046), 0.14, 0.08, 0.06, 0, 0.72, -0.5);
}
function tallCupboard(B, body = 0xb9b39a, trim = 0x7d7866) {
  const beige = flat(body), dark = flat(trim);
  B.box(beige, 1.2, 2.05, 0.55, 0, 1.02, -0.7);
  B.box(dark, 1.24, 0.06, 0.59, 0, 2.06, -0.7);
  B.box(dark, 0.02, 1.9, 0.02, 0, 1.02, -0.425);
  for (const sx of [-0.08, 0.08]) B.box(flat(0x5c584c), 0.04, 0.16, 0.04, sx, 1.05, -0.41);
  for (const y of [0.45, 1.3]) B.box(dark, 1.14, 0.015, 0.015, 0, y, -0.423);
}

// ---------------------------------------------------------------- zones
export const ZONES = [

  // ------------------------------------------------ the hotel (unchanged behaviour)
  {
    id: 'hotel', name: 'The Last Call Hotel',
    fog: { color: 0x0a0806, near: 5, far: 38 },
    ambient: [0x5a5048, 0.85], hemi: [0x6a6258, 0x1a120c, 0.5],
    lamp: { color: 0xffb86a, base: 30, dist: 17, bulb: 0xffe2a0, fixture: pendantFixture, dead: 0.18, flick: 0.3 },
    mats(floor) {
      const P = [
        { paper: '#4f5f47', paper2: '#57684e', motif: 'rgba(214,190,110,0.45)', wood: '#4a2f1b', trim: '#2a190d', fabric: 0x5c1a26, rugs: [['#5a1a22', '#2a1210'], ['#3a2a4a', '#1a1220']] },
        { paper: '#6a2e30', paper2: '#733436', motif: 'rgba(224,180,100,0.45)', wood: '#3f2816', trim: '#24150b', fabric: 0x23402e, rugs: [['#23402e', '#12180f'], ['#5a1a22', '#2a1210']] },
        { paper: '#3c4a66', paper2: '#44536f', motif: 'rgba(200,200,220,0.35)', wood: '#46301e', trim: '#26180d', fabric: 0x4a3a1a, rugs: [['#1e2c4a', '#0e1220'], ['#4a3a1a', '#1e160a']] },
        { paper: '#7a6434', paper2: '#84703c', motif: 'rgba(90,30,30,0.45)', wood: '#402a18', trim: '#22140a', fabric: 0x2a2a4a, rugs: [['#5a1a22', '#2a1210'], ['#2a2a4a', '#12121e']] },
      ][(floor - 1) % 4];
      return {
        wall: mapped(wallpaperTex(P)), floor: mapped(boardsTex()), ceil: mapped(ceilingTex()),
        door: mapped(doorTex()), rugs: P.rugs.map(c => mapped(rugTex(c[0], c[1]))), fab: flat(P.fabric),
      };
    },
    slots: ['wardrobe', 'dresser', 'bookshelf', 'bed', 'sofa', 'desk', 'armchair', 'luggage', 'clock', 'plant', 'crates'],
    closet: 'wardrobe', wide: ['bed', 'sofa'], limit: { bed: 1 },
    foot: {
      wardrobe: [0, -0.6, 0.76, 0.42], dresser: [0, -0.64, 0.76, 0.36], bookshelf: [0, -0.73, 0.82, 0.3],
      desk: [0, -0.3, 0.76, 0.74], armchair: [0, -0.5, 0.52, 0.46], clock: [0, -0.76, 0.34, 0.26],
      plant: [0, -0.5, 0.4, 0.4], luggage: [0, -0.52, 0.55, 0.4], crates: [0, -0.45, 0.55, 0.5],
      bed: [1, -0.22, 1.12, 0.78], sofa: [1, -0.5, 1.42, 0.46],
      trolley: [0, 0, 0.76, 0.42], linen: [0, 0, 0.68, 0.38],
    },
    build: {
      wardrobe: (B, M) => furn.wardrobe(B, M), dresser: (B, M) => furn.dresser(B, M), bookshelf: (B, M) => furn.bookshelf(B, M),
      bed: (B, M) => furn.bed(B, M), sofa: (B, M, K) => furn.sofa(B, M, K.fab), desk: (B, M) => furn.desk(B, M),
      armchair: (B, M, K) => furn.armchair(B, M, K.fab), luggage: (B, M) => furn.luggage(B, M), clock: (B, M) => furn.clock(B, M),
      plant: (B, M) => furn.plant(B, M), crates: (B, M) => furn.crates(B, M),
      trolley: (B, M) => furn.trolley(B, M), linen: (B, M) => furn.linen(B, M),
    },
    rug: (K, r) => K.rugs[r.id % K.rugs.length],
    walls(a) {
      const { W, r, M, K, rng, at, used, key, cellOf } = a;
      const gone = (dc, dr) => { const c = r.col + dc, rr = r.row + dr; return c < 0 || rr < 0 || c >= W.gw || rr >= W.gh || !W.rooms[rr * W.gw + c].used; };
      const outside = [gone(0, -1), gone(0, 1), gone(-1, 0), gone(1, 0)];
      for (let wall = 0; wall < 4; wall++) {
        if (!outside[wall]) continue;
        for (const i of [1, 5]) {
          if (rng() > 0.6 || used.has(key(...cellOf(wall, i)))) continue;
          used.add(key(...cellOf(wall, i)));
          at(wall, i, B => {
            B.box(M.dark, 1.34, 1.74, 0.06, 0, 1.75, -0.98); B.quad(W.winMat, 1.2, 1.6, 0, 1.75, -0.94); B.box(M.dark, 1.5, 0.08, 0.2, 0, 0.9, -0.92);
            B.box(K.fab, 0.34, 1.95, 0.08, -0.72, 1.7, -0.9); B.box(K.fab, 0.34, 1.95, 0.08, 0.72, 1.7, -0.9);
            B.cyl(M.brass, 0.025, 0.025, 1.9, 0, 2.7, -0.9, 4, Math.PI / 2);
          });
        }
      }
    },
    room(a) {
      const { W, r, S, D, M, rng, slots, used, key, cellOf, at } = a;
      for (const [dx, dz] of [[2, 2], [4, 4], [4, 2], [2, 4]]) {
        if (rng() > 0.22) continue;
        const [x, z] = W.center(r.x0 + dx, r.z0 + dz);
        W.blockedGrid[(r.z0 + dz) * W.w + r.x0 + dx] = 1;
        const ry = rng() < 0.5 ? 0 : Math.PI / 2, kind = rng() < 0.5 ? 'trolley' : 'linen';
        S.push(x, 0, z, ry); furn[kind](S, M); S.pop(); W._foot(x, z, ry, kind);
      }
      let pics = 1 + ((rng() * 3) | 0);
      for (const [wall, i] of slots) {
        if (pics <= 0) break;
        const k = key(...cellOf(wall, i));
        if (used.has(k) || i === 0 || i === 6) continue;
        used.add(k); pics--; at(wall, i, B => furn.painting(B, M, (rng() * 3) | 0));
      }
      if (r.id !== W.startRoom && rng() < 0.45) D.add(W.stainMat, new THREE.PlaneGeometry(2.6, 2.6), r.cx + (rng() - 0.5) * 5, 0.03, r.cz + (rng() - 0.5) * 5, rng() * 6.3, -Math.PI / 2);
    },
  },

  // ------------------------------------------------ the backrooms
  {
    id: 'backrooms', name: 'The Backrooms', noclip: true,
    fog: { color: 0x7a6a2c, near: 9, far: 46 },
    ambient: [0xc2b068, 1.2], hemi: [0xdccb7c, 0x6a5c28, 0.55],
    lamp: { color: 0xfff6cc, base: 24, dist: 20, bulb: 0xfffbe0, bulbY: 0.1, bulbR: 0.02, fixture: panelFixture, dead: 0.06, flick: 0.5 },
    mats: () => ({ wall: mapped(backWallTex()), floor: mapped(backCarpetTex()), ceil: mapped(dropCeilTex()), door: mapped(metalDoorTex('#b7a65a', '#a2914c')), rugs: null }),
    slots: ['cabinet', 'boxes', 'chairs', 'cooler'],
    closet: 'cabinet', density: 0.45,
    foot: { cabinet: [0, -0.68, 0.62, 0.3], boxes: [0, -0.55, 0.55, 0.42], chairs: [0, -0.5, 0.46, 0.4], cooler: [0, -0.62, 0.27, 0.27] },
    build: { cabinet: B => tallCupboard(B), boxes: B => boxStack(B), chairs: B => chairStack(B), cooler: B => waterCooler(B) },
    room(a) {
      const { W, r, D, rng } = a;
      // damp patches on the carpet
      const damp = new THREE.MeshLambertMaterial({ color: 0x5f511d, transparent: true, opacity: 0.75, depthWrite: false });
      for (let i = 0; i < 2; i++) {
        if (rng() > 0.55) continue;
        D.add(damp, new THREE.CircleGeometry(0.8 + rng() * 1.4, 8), r.cx + (rng() - 0.5) * 7, 0.025, r.cz + (rng() - 0.5) * 7, rng() * 6.3, -Math.PI / 2);
      }
    },
  },

  // ------------------------------------------------ the washrooms
  {
    id: 'bathroom', name: 'The Washrooms',
    fog: { color: 0x0e1413, near: 7, far: 40 },
    ambient: [0x8ea3a0, 0.8], hemi: [0xa8c0bc, 0x202828, 0.45],
    lamp: { color: 0xdff0ff, base: 26, dist: 18, bulb: 0xf2fbff, bulbY: 0.12, bulbR: 0.02, fixture: tubeFixture, dead: 0.12, flick: 0.4 },
    mats: () => ({ wall: mapped(tileWallTex('#cfd8d2', '#5f8d86', '#7d8a86')), floor: mapped(tileFloorTex()), ceil: mapped(dropCeilTex()), door: mapped(metalDoorTex('#b9c2c0', '#a3acaa')), rugs: null }),
    slots: ['stall', 'sinks', 'urinals', 'bin'],
    closet: 'stall', density: 0.75,
    foot: { stall: [0, -0.42, 0.78, 0.58], sinks: [0, -0.76, 0.82, 0.26], urinals: [0, -0.84, 0.74, 0.2], bin: [0, -0.7, 0.26, 0.26] },
    build: {
      // a cubicle you can step into and pull the door shut
      stall: (B) => {
        const part = flat(0x4f7d76), floorC = flat(0xd4dcd6), steel = flat(0x9aa2a4);
        B.box(part, 0.07, 2.0, 1.5, -0.76, 1.0, -0.3); B.box(part, 0.07, 2.0, 1.5, 0.76, 1.0, -0.3);
        B.box(part, 1.55, 2.0, 0.07, 0, 1.0, -1.0);
        B.box(part, 1.5, 1.6, 0.06, 0, 1.1, 0.42);            // the door
        B.box(steel, 0.07, 0.07, 0.07, 0.55, 1.05, 0.48);
        // pan and cistern
        B.box(floorC, 0.42, 0.42, 0.22, 0, 0.21, -0.86);
        B.cyl(floorC, 0.21, 0.19, 0.22, 0, 0.32, -0.6, 8);
        B.box(floorC, 0.46, 0.05, 0.36, 0, 0.44, -0.6);
        B.box(floorC, 0.44, 0.52, 0.18, 0, 0.72, -0.9);
        B.box(steel, 0.07, 0.03, 0.04, 0.14, 0.95, -0.81);
      },
      sinks: (B) => {
        const basin = flat(0xdfe6e2), steel = flat(0x9aa2a4), mirror = flat(0x6f8890);
        B.box(flat(0x7f8d88), 1.7, 0.1, 0.5, 0, 0.88, -0.76);
        for (const sx of [-0.42, 0.42]) {
          B.box(basin, 0.6, 0.16, 0.42, sx, 0.86, -0.74);
          B.box(flat(0x33403e), 0.4, 0.03, 0.26, sx, 0.9, -0.74);
          B.cyl(steel, 0.025, 0.025, 0.2, sx, 1.02, -0.92, 6);
          B.box(steel, 0.05, 0.04, 0.16, sx, 1.11, -0.85);
          B.cyl(basin, 0.06, 0.06, 0.26, sx, 0.68, -0.74, 6);
        }
        B.box(flat(0x3a4a4e), 1.7, 1.0, 0.03, 0, 1.75, -0.97);
        B.box(mirror, 1.6, 0.9, 0.02, 0, 1.75, -0.955);
      },
      urinals: (B) => {
        const porc = flat(0xdfe6e2), steel = flat(0x9aa2a4);
        for (const sx of [-0.4, 0.4]) {
          B.box(porc, 0.42, 0.72, 0.3, sx, 0.9, -0.86);
          B.box(flat(0x33403e), 0.3, 0.04, 0.2, sx, 0.78, -0.82);
          B.cyl(steel, 0.03, 0.03, 0.14, sx, 1.33, -0.94, 6);
        }
        B.box(flat(0x4f7d76), 0.05, 1.1, 0.4, 0, 1.0, -0.84);
      },
      bin: (B) => {
        const steel = flat(0x8c9496);
        B.cyl(steel, 0.25, 0.21, 0.62, 0, 0.31, -0.7, 8);
        B.cyl(flat(0x35393a), 0.26, 0.26, 0.05, 0, 0.64, -0.7, 8);
      },
    },
    room(a) {
      const { W, r, D, rng } = a;
      // floor drain + a puddle or two
      D.cyl(flat(0x6a7270), 0.12, 0.12, 0.02, r.cx, 0.025, r.cz, 8);
      const wet = new THREE.MeshLambertMaterial({ color: 0x8fb4c0, transparent: true, opacity: 0.45, depthWrite: false });
      for (let i = 0; i < 2; i++) {
        if (rng() > 0.5) continue;
        D.add(wet, new THREE.CircleGeometry(0.5 + rng() * 1.0, 8), r.cx + (rng() - 0.5) * 6, 0.03, r.cz + (rng() - 0.5) * 6, rng() * 6.3, -Math.PI / 2);
      }
    },
  },

  // ------------------------------------------------ the car park
  {
    id: 'carpark', name: 'Sublevel Car Park',
    fog: { color: 0x0b0c0e, near: 6, far: 36 },
    ambient: [0x55595e, 0.7], hemi: [0x6a7078, 0x16181a, 0.4],
    lamp: { color: 0xffd089, base: 24, dist: 19, bulb: 0xffe6b0, bulbY: 0.18, bulbR: 0.02, fixture: cageFixture, dead: 0.2, flick: 0.3 },
    mats: () => ({ wall: mapped(concreteTex('#6e6e6c')), floor: mapped(deckTex()), ceil: mapped(concreteTex('#55565a', 180)), door: mapped(metalDoorTex('#7d858a', '#6b7377')), rugs: null }),
    slots: ['locker', 'car', 'barrier', 'bin', 'cones'],
    closet: 'locker', wide: ['car'], limit: { car: 2 }, density: 0.6,
    foot: { locker: [0, -0.78, 0.52, 0.24], car: [1, -0.05, 1.95, 0.88], barrier: [0, -0.62, 0.82, 0.26], bin: [0, -0.66, 0.4, 0.33], cones: [0, -0.5, 0.5, 0.42] },
    build: {
      locker: (B) => {
        const grey = flat(0x7a8286), dark = flat(0x4e5558);
        B.box(grey, 1.0, 1.95, 0.42, 0, 0.97, -0.78);
        B.box(dark, 1.04, 0.05, 0.46, 0, 1.97, -0.78);
        B.box(dark, 0.02, 1.8, 0.02, 0, 0.97, -0.568);
        B.box(flat(0xc8b022), 0.22, 0.26, 0.02, 0.3, 1.5, -0.565);
        B.box(flat(0x3a3f42), 0.05, 0.12, 0.04, -0.1, 1.0, -0.55);
      },
      car: (B) => {
        const body = flat([0x8d2f2a, 0x24405e, 0x2f4a33, 0x5a5a5e, 0x9a8a3a][(Math.random() * 5) | 0]);
        const glass = flat(0x2b3840), tyre = flat(0x16171a), rim = flat(0x9aa0a4), lamp = flat(0xd8d2b8);
        B.box(body, 4.1, 0.6, 1.75, 1, 0.62, -0.08);          // hull
        B.box(body, 2.3, 0.52, 1.6, 0.95, 1.14, -0.08);        // cabin
        B.box(glass, 2.1, 0.4, 1.63, 0.95, 1.16, -0.08);
        B.box(body, 0.5, 0.42, 1.62, 1.95, 1.12, -0.08, 0, 0, -0.35);
        B.box(lamp, 0.1, 0.16, 0.4, -1.0, 0.72, -0.56); B.box(lamp, 0.1, 0.16, 0.4, -1.0, 0.72, 0.4);
        B.box(flat(0x6a1a18), 0.1, 0.14, 0.38, 3.0, 0.72, -0.56); B.box(flat(0x6a1a18), 0.1, 0.14, 0.38, 3.0, 0.72, 0.4);
        for (const dx of [-0.35, 2.35]) for (const dz of [-0.86, 0.7]) {
          B.cyl(tyre, 0.34, 0.34, 0.24, dx, 0.34, dz, 10, Math.PI / 2);
          B.cyl(rim, 0.17, 0.17, 0.26, dx, 0.34, dz, 8, Math.PI / 2);
        }
      },
      barrier: (B) => {
        const con = flat(0x8a8884);
        B.box(con, 1.6, 0.26, 0.5, 0, 0.13, -0.62);
        B.box(con, 1.5, 0.5, 0.3, 0, 0.5, -0.62, 0, 0, 0);
        B.box(flat(0xc8b022), 0.3, 0.3, 0.02, -0.4, 0.5, -0.46);
      },
      bin: (B) => {
        const plastic = flat(0x2f4a33);
        B.box(plastic, 0.74, 0.9, 0.62, 0, 0.5, -0.66);
        B.box(flat(0x1f3324), 0.78, 0.08, 0.66, 0, 0.97, -0.66, 0, -0.1);
        for (const sx of [-0.28, 0.28]) B.cyl(flat(0x15171a), 0.09, 0.09, 0.08, sx, 0.09, -0.4, 7, Math.PI / 2);
      },
      cones: (B) => {
        for (const [dx, dz] of [[-0.3, -0.5], [0.25, -0.7], [0.05, -0.25]]) {
          B.box(flat(0x22242a), 0.34, 0.04, 0.34, dx, 0.02, dz);
          B.cone(flat(0xd4541f), 0.17, 0.62, dx, 0.33, dz, 7);
          B.cyl(flat(0xe8e2d0), 0.1, 0.12, 0.09, dx, 0.36, dz, 7);
        }
      },
    },
    room(a) {
      const { W, r, S, D, rng } = a;
      // painted bays down the middle, and a structural pillar or two
      const paint = new THREE.MeshLambertMaterial({ color: 0xd8d0a8, transparent: true, opacity: 0.72, depthWrite: false });
      for (let i = 0; i <= 2; i++) D.add(paint, new THREE.PlaneGeometry(0.1, 4.4), r.cx - 2.4 + i * 2.4, 0.03, r.cz, 0, -Math.PI / 2);
      for (const [dx, dz] of [[2, 2], [4, 4]]) {
        if (rng() > 0.45) continue;
        const [x, z] = W.center(r.x0 + dx, r.z0 + dz);
        W.blockedGrid[(r.z0 + dz) * W.w + r.x0 + dx] = 1;
        S.box(mapped(concreteTex('#777774')), 1.0, 3.3, 1.0, x, 1.65, z);
        S.box(flat(0xc8b022), 1.04, 0.18, 1.04, x, 0.5, z);
        W._obstacle(x, z, 0, 0, 0, 0.52, 0.52);
      }
    },
  },

  // ------------------------------------------------ the offices
  {
    id: 'office', name: 'The Offices',
    fog: { color: 0x101216, near: 8, far: 40 },
    ambient: [0x8c8f96, 0.85], hemi: [0xa6aab2, 0x22242a, 0.45],
    lamp: { color: 0xeaf2ff, base: 26, dist: 19, bulb: 0xf6faff, bulbY: 0.1, bulbR: 0.02, fixture: panelFixture, dead: 0.14, flick: 0.35 },
    mats: () => ({ wall: mapped(officeWallTex()), floor: mapped(officeCarpetTex()), ceil: mapped(dropCeilTex()), door: mapped(metalDoorTex('#b2a894', '#9d9280')), rugs: null }),
    slots: ['supply', 'cubicle', 'filing', 'cooler', 'printer', 'plant'],
    closet: 'supply', density: 0.7,
    foot: { supply: [0, -0.68, 0.62, 0.3], cubicle: [0, -0.38, 0.78, 0.6], filing: [0, -0.74, 0.72, 0.28], cooler: [0, -0.62, 0.27, 0.27], printer: [0, -0.68, 0.46, 0.32], plant: [0, -0.5, 0.4, 0.4] },
    build: {
      supply: (B) => tallCupboard(B, 0xa9a596, 0x74716a),
      cubicle: (B) => {
        const part = flat(0x7d8470), desk = flat(0xb7a98c), dark = flat(0x3c4046);
        B.box(part, 1.9, 1.3, 0.07, 0, 0.65, -0.98);
        B.box(flat(0x5e6458), 1.9, 0.06, 0.1, 0, 1.31, -0.98);
        B.box(desk, 1.7, 0.05, 0.62, 0, 0.74, -0.66);
        for (const sx of [-0.78, 0.78]) B.box(dark, 0.05, 0.72, 0.58, sx, 0.37, -0.66);
        B.box(dark, 0.42, 0.06, 0.16, -0.3, 0.98, -0.86);     // monitor
        B.box(dark, 0.06, 0.2, 0.06, -0.3, 0.86, -0.86);
        B.box(dark, 0.56, 0.36, 0.04, -0.3, 1.14, -0.88, 0, 0.08);
        B.box(flat(0x1b2a3a), 0.5, 0.3, 0.02, -0.3, 1.14, -0.855, 0, 0.08);
        B.box(flat(0xd8d2c4), 0.34, 0.02, 0.16, 0.34, 0.77, -0.5, 0.2);
        B.box(dark, 0.42, 0.05, 0.4, 0.25, 0.46, -0.1);       // chair
        B.box(dark, 0.4, 0.44, 0.05, 0.25, 0.68, 0.08, 0, -0.14);
        B.cyl(dark, 0.04, 0.04, 0.44, 0.25, 0.23, -0.1, 6);
      },
      filing: (B) => {
        const grey = flat(0x8d9298), dark = flat(0x5a6064);
        for (const sx of [-0.36, 0.36]) {
          B.box(grey, 0.62, 1.3, 0.5, sx, 0.65, -0.74);
          for (let k = 0; k < 3; k++) { B.box(dark, 0.54, 0.36, 0.02, sx, 0.26 + k * 0.42, -0.49); B.box(flat(0x40464a), 0.14, 0.04, 0.03, sx, 0.26 + k * 0.42, -0.47); }
        }
        B.box(flat(0xd8d2c4), 0.3, 0.1, 0.22, 0.2, 1.35, -0.72, 0.3);
      },
      cooler: B => waterCooler(B),
      printer: (B) => {
        const grey = flat(0x9aa0a2), dark = flat(0x44484c);
        B.box(flat(0x6f7478), 0.86, 0.68, 0.56, 0, 0.34, -0.7);
        B.box(grey, 0.9, 0.5, 0.62, 0, 0.93, -0.7);
        B.box(dark, 0.84, 0.04, 0.5, 0, 1.19, -0.68);
        B.box(flat(0x2a6a3a), 0.1, 0.05, 0.03, 0.3, 1.04, -0.39);
        B.box(flat(0xe8e4d8), 0.5, 0.02, 0.3, 0, 1.21, -0.5, 0.1);
      },
      plant: (B, M) => furn.plant(B, M),
    },
    room(a) {
      const { W, r, D, rng } = a;
      const paper = flat(0xe4e0d4);
      for (let i = 0; i < 4; i++) {
        if (rng() > 0.5) continue;
        D.box(paper, 0.26, 0.01, 0.2, r.cx + (rng() - 0.5) * 7, 0.025, r.cz + (rng() - 0.5) * 7, rng() * 6.3);
      }
    },
  },

  // ------------------------------------------------ the crisp dimension
  {
    id: 'chips', name: 'The Crisp Dimension',
    fog: { color: 0xc8a63c, near: 10, far: 48 },
    ambient: [0xffeeb8, 0.95], hemi: [0xffe9a8, 0xa88a30, 0.45],
    lamp: { color: 0xfff0b0, base: 22, dist: 20, bulb: 0xfff6d0, bulbY: 0.12, bulbR: 0.02, fixture: (D, M, x, z, H, dead) => { D.box(chipMat(2, 1), 1.3, 0.14, 0.5, x, H - 0.08, z); D.box(dead ? flat(0x4a4330) : glow(0xfff0b0), 1.1, 0.04, 0.34, x, H - 0.16, z); }, dead: 0.05, flick: 0.2 },
    mats: () => ({ wall: chipMat(3, 2, 0.15), floor: chipMat(1.6, 1.6, 0.6), ceil: chipMat(2.4, 2.4, 1.1), door: chipMat(1, 1.6, 0.3), rugs: null }),
    slots: ['locker', 'pile', 'slab'],
    closet: 'locker', density: 0.6,
    foot: { locker: [0, -0.66, 0.68, 0.34], pile: [0, -0.5, 0.6, 0.46], slab: [0, -0.6, 0.5, 0.36] },
    build: {
      locker: (B) => {
        B.box(chipMat(1, 2, 0.4), 1.3, 2.05, 0.62, 0, 1.02, -0.68);
        B.box(chipMat(1, 1, 1.2), 1.34, 0.08, 0.66, 0, 2.07, -0.68);
        B.box(flat(0x6a5a2a), 0.02, 1.9, 0.02, 0, 1.02, -0.368);
        B.box(chipMat(0.5, 0.5, 2.0), 0.08, 0.2, 0.05, 0.12, 1.05, -0.35);
      },
      pile: (B) => {
        for (const [dx, dy, dz, s, rot] of [[-0.2, 0.26, -0.6, 0.55, 0.3], [0.25, 0.22, -0.7, 0.45, 1.1], [0.0, 0.62, -0.62, 0.42, 2.2], [0.3, 0.2, -0.3, 0.38, 0.7]])
          B.box(chipMat(1, 1, rot), s, s, s, dx, dy, dz, rot, rot * 0.3);
      },
      slab: (B) => {
        B.box(chipMat(1, 3, 0.9), 0.9, 2.2, 0.5, 0, 1.1, -0.68, 0.08);
        B.box(chipMat(2, 1, 0.2), 1.0, 0.12, 0.6, 0, 0.06, -0.68);
      },
    },
    room(a) {
      const { W, r, D, rng } = a;
      // chips plastered flat on the floor too, because why not
      for (let i = 0; i < 3; i++) {
        if (rng() > 0.6) continue;
        D.add(chipMat(1, 1, rng() * 6.3), new THREE.PlaneGeometry(1.4 + rng() * 1.6, 1.4 + rng() * 1.6), r.cx + (rng() - 0.5) * 7, 0.03, r.cz + (rng() - 0.5) * 7, rng() * 6.3, -Math.PI / 2);
      }
    },
  },
];

// The places come in this order, a couple of floors each. The library is always the third.
export const ORDER = [
  { zone: 'hotel', floors: 2 },
  { zone: 'carpark', floors: 2 },
  { zone: 'library', floors: 1 },
  { zone: 'backrooms', floors: 2 },
  { zone: 'bathroom', floors: 2 },
  { zone: 'office', floors: 2 },
  { zone: 'chips', floors: 2 },
];

export const zoneById = id => ZONES.find(z => z.id === id) || ZONES[0];
