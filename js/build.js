// Shared level-building kit for the lobby and the hotel floors: chunky canvas textures, cached
// materials, and a Batcher that merges hundreds of static boxes into a few draw calls.
import * as THREE from 'three';

export function tex(w, h, draw, shrink = 2) {
  const big = document.createElement('canvas'); big.width = w; big.height = h;
  draw(big.getContext('2d'), w, h);
  let c = big;
  if (shrink > 1) {
    c = document.createElement('canvas'); c.width = Math.max(8, (w / shrink) | 0); c.height = Math.max(8, (h / shrink) | 0);
    c.getContext('2d').drawImage(big, 0, 0, c.width, c.height);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function speckle(g, w, h, n, colors, min = 1, max = 4) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[i % colors.length];
    const s = min + ((i * 7919) % 97) / 97 * (max - min);
    g.fillRect(((i * 2654435761) >>> 0) % w, ((i * 40503) >>> 0) % h, s, s);
  }
}

const flatCache = new Map(), glowCache = new Map();
export function flat(hex) { let m = flatCache.get(hex); if (!m) { m = new THREE.MeshLambertMaterial({ color: hex }); flatCache.set(hex, m); } return m; }
export function glow(hex) { let m = glowCache.get(hex); if (!m) { m = new THREE.MeshBasicMaterial({ color: hex }); glowCache.set(hex, m); } return m; }
export const mapped = (map, extra = {}) => new THREE.MeshLambertMaterial({ map, ...extra });

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

// Collects transformed geometry per material and merges it into one mesh each.
export class Batcher {
  constructor() { this.items = new Map(); this.base = new THREE.Matrix4(); this.stack = []; }
  push(x, y, z, ry = 0) {
    this.stack.push(this.base.clone());
    _m.makeRotationY(ry); _m.setPosition(x, y, z);
    this.base.multiply(_m);
  }
  pop() { this.base = this.stack.pop(); }
  add(mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _p.set(x, y, z);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(this.base, _m));
    let arr = this.items.get(mat); if (!arr) { arr = []; this.items.set(mat, arr); }
    arr.push(g);
  }
  box(mat, w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) { this.add(mat, new THREE.BoxGeometry(w, h, d), x, y, z, ry, rx, rz); }
  cyl(mat, rt, rb, h, x, y, z, seg = 6, rx = 0, rz = 0) { this.add(mat, new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z, 0, rx, rz); }
  cone(mat, r, h, x, y, z, seg = 5, rx = 0) { this.add(mat, new THREE.ConeGeometry(r, h, seg), x, y, z, 0, rx); }
  // Horizontal quad facing up (or down), with the texture tiled ur x vr times.
  plane(mat, w, d, x, y, z, ur = 1, vr = 1, down = false) {
    const g = new THREE.PlaneGeometry(w, d);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ur, uv.getY(i) * vr);
    this.add(mat, g, x, y, z, 0, down ? Math.PI / 2 : -Math.PI / 2);
  }
  // Vertical quad facing local +z.
  quad(mat, w, h, x, y, z, ry = 0, ur = 1, vr = 1) {
    const g = new THREE.PlaneGeometry(w, h);
    if (ur !== 1 || vr !== 1) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ur, uv.getY(i) * vr); }
    this.add(mat, g, x, y, z, ry);
  }
  build(scene) {
    const out = [];
    for (const [mat, geos] of this.items) {
      let n = 0; for (const g of geos) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      let o = 0;
      for (const g of geos) {
        pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
        o += g.attributes.position.count; g.dispose();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh); out.push(mesh);
    }
    this.items.clear();
    return out;
  }
}

// A floating brass-plaque style label that always faces the player.
export function sprite(lines, color = '#d8c38a', scale = 1.5) {
  const t = tex(256, 128, (g, w, h) => {
    g.fillStyle = 'rgba(14,9,6,0.92)'; g.fillRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
    g.lineWidth = 2; g.strokeRect(13, 13, w - 26, h - 26);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color;
    let size = 46; g.font = `bold ${size}px Arial, sans-serif`;
    while (g.measureText(lines[0]).width > w - 36 && size > 16) { size -= 2; g.font = `bold ${size}px Arial, sans-serif`; }
    g.fillText(lines[0], w / 2, lines[1] ? 46 : h / 2 + 2);
    if (lines[1]) { g.fillStyle = '#efe6cf'; g.font = 'bold 34px Arial, sans-serif'; g.fillText(lines[1], w / 2, 92); }
  }, 2);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(scale, scale * 0.5, 1);
  return s;
}

// ---------------------------------------------------------------- textures
// Hotel wall: crown moulding, patterned paper, chair rail, panelled wainscot, skirting board.
export function wallpaperTex(p) {
  return tex(128, 256, (g, w, h) => {
    g.fillStyle = p.paper; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) { g.fillStyle = p.paper2; g.fillRect(x, 0, 16, h); }
    g.fillStyle = p.motif;
    for (let y = 30; y < 150; y += 32) for (let x = 8; x < w; x += 32) {
      const ox = ((y / 32) | 0) % 2 ? 16 : 0;
      g.beginPath(); g.moveTo(x + ox, y - 9); g.lineTo(x + ox + 6, y); g.lineTo(x + ox, y + 9); g.lineTo(x + ox - 6, y); g.fill();
      g.fillRect(x + ox - 1, y - 14, 2, 4); g.fillRect(x + ox - 1, y + 10, 2, 4);
    }
    speckle(g, w, 150, 90, ['rgba(0,0,0,0.16)', 'rgba(70,50,20,0.16)', 'rgba(255,255,255,0.03)'], 2, 9);
    // water stain running down from the ceiling
    const st = g.createLinearGradient(0, 14, 0, 110); st.addColorStop(0, 'rgba(20,14,6,0.5)'); st.addColorStop(1, 'rgba(20,14,6,0)');
    g.fillStyle = st; g.fillRect(70, 14, 26, 96);
    // crown moulding
    g.fillStyle = p.trim; g.fillRect(0, 0, w, 16);
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(0, 3, w, 2); g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(0, 13, w, 3);
    // chair rail + wainscot + skirting
    g.fillStyle = p.wood; g.fillRect(0, 150, w, 106);
    g.fillStyle = p.trim; g.fillRect(0, 148, w, 10);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 149, w, 2);
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(0, 157, w, 3);
    for (const x of [8, 72]) {
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, 168, 48, 62);
      g.fillStyle = p.wood; g.fillRect(x + 3, 171, 42, 56);
      g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x + 3, 171, 42, 3);
    }
    g.fillStyle = p.trim; g.fillRect(0, 238, w, 18);
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 250, w, 6);
    speckle(g, w, h, 60, ['rgba(0,0,0,0.2)'], 2, 6);
  });
}

export function boardsTex() {
  return tex(128, 128, (g, w, h) => {
    const sh = ['#4a3421', '#43301e', '#513a25', '#3d2b1b'];
    for (let i = 0; i < 8; i++) { g.fillStyle = sh[(i * 3) % 4]; g.fillRect(i * 16, 0, 16, h); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(i * 16, 0, 1, h); g.fillRect(i * 16, (i * 37) % h, 16, 1); }
    speckle(g, w, h, 100, ['rgba(0,0,0,0.22)', 'rgba(255,220,170,0.05)'], 2, 7);
  });
}

export function woodTex(a = '#4a3220', b = '#3a2717') {
  return tex(64, 64, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 5) { g.fillStyle = y % 10 ? b : 'rgba(0,0,0,0.12)'; g.fillRect(0, y, w, 1); }
    speckle(g, w, h, 30, ['rgba(0,0,0,0.2)', 'rgba(255,220,170,0.06)'], 2, 5);
  });
}

export function rugTex(c1, c2, c3 = '#c9a227') {
  return tex(128, 128, (g, w, h) => {
    g.fillStyle = c2; g.fillRect(0, 0, w, h);
    g.fillStyle = c3; g.fillRect(6, 6, w - 12, h - 12);
    g.fillStyle = c1; g.fillRect(10, 10, w - 20, h - 20);
    g.strokeStyle = c3; g.lineWidth = 2; g.strokeRect(20, 20, w - 40, h - 40);
    g.fillStyle = c2;
    for (let y = 32; y < h - 24; y += 16) for (let x = 32; x < w - 24; x += 16) { g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y); g.fill(); }
    g.fillStyle = c3; g.beginPath(); g.arc(w / 2, h / 2, 14, 0, 6.3); g.fill();
    g.fillStyle = c1; g.beginPath(); g.arc(w / 2, h / 2, 9, 0, 6.3); g.fill();
    speckle(g, w, h, 70, ['rgba(0,0,0,0.25)', 'rgba(40,10,10,0.3)'], 2, 8);
  });
}

export function ceilingTex() {
  return tex(64, 64, (g, w, h) => {
    g.fillStyle = '#3a332b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a211a'; g.fillRect(0, 0, w, 5); g.fillRect(0, 0, 5, h);
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(5, 5, w - 5, 2);
    speckle(g, w, h, 40, ['rgba(0,0,0,0.25)', 'rgba(60,40,10,0.2)'], 2, 7);
  });
}

export function doorTex() {
  return tex(96, 160, (g, w, h) => {
    g.fillStyle = '#4a2f19'; g.fillRect(0, 0, w, h);
    for (const [x, y, pw, ph] of [[10, 10, 32, 60], [54, 10, 32, 60], [10, 84, 32, 66], [54, 84, 32, 66]]) {
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x, y, pw, ph);
      g.fillStyle = '#3d2614'; g.fillRect(x + 3, y + 3, pw - 6, ph - 6);
      g.fillStyle = 'rgba(255,220,170,0.07)'; g.fillRect(x + 3, y + 3, pw - 6, 2);
    }
    speckle(g, w, h, 50, ['rgba(0,0,0,0.25)', 'rgba(120,90,40,0.08)'], 2, 6);
  });
}

export function numberTex(n, locked) {
  return tex(96, 56, (g, w, h) => {
    g.fillStyle = locked ? '#5a1414' : '#8a6a1c'; g.fillRect(0, 0, w, h);
    g.fillStyle = locked ? '#7a1c1c' : '#c9a227'; g.fillRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#1a1206'; g.font = 'bold 40px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(n), w / 2, h / 2 + 2);
  }, 1);
}

export function paintingTex(kind) {
  return tex(64, 48, (g, w, h) => {
    if (kind === 0) {   // portrait, face scratched out
      g.fillStyle = '#231a14'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#3a2a22'; g.fillRect(20, 26, 24, 22);
      g.fillStyle = '#9a8a72'; g.beginPath(); g.arc(32, 18, 9, 0, 6.3); g.fill();
      g.strokeStyle = '#120a08'; g.lineWidth = 2; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(24 + i * 3, 10); g.lineTo(30 + i * 3, 26); g.stroke(); }
    } else if (kind === 1) {   // bleak landscape
      g.fillStyle = '#2a3238'; g.fillRect(0, 0, w, 26); g.fillStyle = '#1c241c'; g.fillRect(0, 26, w, 22);
      g.fillStyle = '#c8c0a0'; g.beginPath(); g.arc(46, 12, 5, 0, 6.3); g.fill();
      g.fillStyle = '#0e120e'; g.fillRect(12, 14, 3, 16); g.fillRect(8, 12, 11, 5);
    } else {   // the hotel itself
      g.fillStyle = '#1a1620'; g.fillRect(0, 0, w, h); g.fillStyle = '#2e2420'; g.fillRect(14, 10, 36, 38);
      g.fillStyle = '#e0b050'; for (let y = 14; y < 44; y += 8) for (let x = 18; x < 46; x += 8) if ((x + y) % 3) g.fillRect(x, y, 4, 5);
    }
    speckle(g, w, h, 20, ['rgba(0,0,0,0.3)'], 2, 5);
  }, 1);
}

export function windowTex() {
  return tex(64, 80, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, '#1a2440'); grad.addColorStop(1, '#0c1222');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(190,210,255,0.5)'; g.lineWidth = 1;
    for (let i = 0; i < 26; i++) { const x = (i * 37) % w, y = (i * 53) % h; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2, y + 8); g.stroke(); }
    g.fillStyle = '#0a0806'; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4); g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h);
    g.fillRect(w / 2 - 2, 0, 4, h); g.fillRect(0, h / 2 - 2, w, 4);
  }, 1);
}

export function brickTex(a = '#4a3528', b = '#3d2b20', c = '#523c2c', mortar = '#201610') {
  return tex(128, 128, (g, w, h) => {
    g.fillStyle = mortar; g.fillRect(0, 0, w, h);
    const sh = [a, b, c];
    for (let row = 0; row < 8; row++) { const off = row % 2 ? 16 : 0; for (let x = -32; x < w; x += 32) { g.fillStyle = sh[(row * 2 + (x + 32) / 32) % 3 | 0]; g.fillRect(x + off + 2, row * 16 + 2, 28, 12); } }
    speckle(g, w, h, 120, ['rgba(0,0,0,0.3)', 'rgba(20,30,10,0.25)'], 2, 7);
  });
}

export function booksTex() {
  return tex(64, 16, (g, w, h) => {
    const cols = ['#5a1a1a', '#1c3a2a', '#2a2a4a', '#6a5a2a', '#3a2418', '#5a3a1a'];
    let x = 0, i = 0; while (x < w) { const bw = 3 + (i * 5) % 4; g.fillStyle = cols[i % cols.length]; g.fillRect(x, (i * 3) % 4, bw, h); g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x + bw - 1, 0, 1, h); x += bw; i++; }
  }, 1);
}

export function elevatorTex() {
  return tex(128, 160, (g, w, h) => {
    g.fillStyle = '#8a7436'; g.fillRect(0, 0, w, h);
    for (const x0 of [0, 64]) {
      g.fillStyle = '#a58a3c'; g.fillRect(x0 + 3, 3, 58, h - 6);
      g.fillStyle = '#6e5a26'; g.fillRect(x0 + 10, 12, 44, 58); g.fillRect(x0 + 10, 84, 44, 64);
      g.fillStyle = '#b89a44'; g.fillRect(x0 + 14, 16, 36, 50); g.fillRect(x0 + 14, 88, 36, 56);
      g.strokeStyle = '#6e5a26'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x0 + 32, 20); g.lineTo(x0 + 46, 41); g.lineTo(x0 + 32, 62); g.lineTo(x0 + 18, 41); g.closePath(); g.stroke();
      g.fillStyle = 'rgba(255,240,190,0.16)'; g.fillRect(x0 + 5, 3, 4, h - 6);
    }
    g.fillStyle = '#1a1206'; g.fillRect(62, 0, 4, h);
    speckle(g, w, h, 60, ['rgba(0,0,0,0.22)', 'rgba(40,60,30,0.14)'], 2, 6);
  });
}

// Engraved brass plate with dark lettering.
export function plaqueTex(text, bg = '#c9a227', fg = '#1a1206') {
  return tex(256, 64, (g, w, h) => {
    g.fillStyle = '#6e5a26'; g.fillRect(0, 0, w, h);
    g.fillStyle = bg; g.fillRect(4, 4, w - 8, h - 8);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 42; g.font = `bold ${size}px Arial, sans-serif`;
    while (g.measureText(text).width > w - 28 && size > 14) { size -= 2; g.font = `bold ${size}px Arial, sans-serif`; }
    g.fillText(text, w / 2, h / 2 + 2);
  }, 1);
}

// ---------------------------------------------------------------- shared materials + furniture
let _mats = null;
export function mats() {
  if (_mats) return _mats;
  _mats = {
    wood: mapped(woodTex()), dark: mapped(woodTex('#2e1f14', '#22160d')), boards: mapped(boardsTex()), door: mapped(doorTex()),
    brass: flat(0xb9992f), iron: flat(0x26262c), fabric: flat(0x5c1a26), fabric2: flat(0x7a2a34), green: flat(0x23402e),
    cream: flat(0xd8d0b8), leaf: flat(0x2c4a28), terracotta: flat(0x7a4630), sheet: flat(0xb8b0a0), olive: flat(0x4a4a30),
    glass: flat(0x7f9098), gore: flat(0x5a0a0c), books: mapped(booksTex()), black: glow(0x050403), gold: flat(0xa8842a),
    paint: [0, 1, 2].map(k => mapped(paintingTex(k))),
  };
  return _mats;
}

// Every piece is built in a local frame: one 2m cell, its back against the wall at z = -1, facing +z.
export const furn = {
  armchair(B, M, fab = M.fabric) {
    B.box(fab, 1.0, 0.5, 0.85, 0, 0.27, -0.5); B.box(fab, 1.0, 0.8, 0.22, 0, 0.9, -0.82);
    B.box(fab, 0.2, 0.3, 0.85, -0.5, 0.64, -0.5); B.box(fab, 0.2, 0.3, 0.85, 0.5, 0.64, -0.5);
    B.box(M.fabric2, 0.62, 0.1, 0.56, 0, 0.56, -0.42);
    for (const x of [-0.42, 0.42]) for (const z of [-0.85, -0.14]) B.box(M.dark, 0.1, 0.1, 0.1, x, 0.03, z);
  },
  sofa(B, M, fab = M.green) {   // two cells: this one and the next along local +x
    B.box(fab, 2.8, 0.5, 0.85, 1, 0.27, -0.5); B.box(fab, 2.8, 0.8, 0.22, 1, 0.9, -0.82);
    B.box(fab, 0.22, 0.32, 0.85, -0.4, 0.65, -0.5); B.box(fab, 0.22, 0.32, 0.85, 2.4, 0.65, -0.5);
    for (const x of [0.1, 1, 1.9]) B.box(M.sheet, 0.8, 0.1, 0.56, x, 0.56, -0.42);
    B.box(M.dark, 2.7, 0.06, 0.8, 1, 0.03, -0.5);
  },
  clock(B, M) {
    B.box(M.dark, 0.62, 2.3, 0.42, 0, 1.15, -0.78); B.box(M.wood, 0.74, 0.12, 0.5, 0, 2.34, -0.76); B.box(M.wood, 0.74, 0.14, 0.5, 0, 0.07, -0.76);
    B.cyl(M.cream, 0.21, 0.21, 0.03, 0, 1.9, -0.56, 10, Math.PI / 2);
    B.box(M.black, 0.03, 0.17, 0.01, 0, 1.97, -0.54); B.box(M.black, 0.12, 0.03, 0.01, 0.05, 1.9, -0.54);
    B.box(M.black, 0.3, 0.9, 0.02, 0, 1.0, -0.565);
    B.box(M.brass, 0.03, 0.6, 0.02, 0.04, 1.1, -0.55); B.cyl(M.brass, 0.09, 0.09, 0.03, 0.06, 0.78, -0.55, 8, Math.PI / 2);
  },
  plant(B, M) {
    B.cyl(M.terracotta, 0.32, 0.22, 0.5, 0, 0.25, -0.5, 7);
    B.cone(M.leaf, 0.3, 1.2, 0, 1.05, -0.5, 5);
    for (const [x, z, rx, rz] of [[0.25, -0.5, 0, -0.6], [-0.25, -0.5, 0, 0.6], [0, -0.28, 0.6, 0], [0, -0.72, -0.6, 0]])
      B.add(M.leaf, new THREE.ConeGeometry(0.16, 1.0, 4), x, 0.85, z, 0, rx, rz);
  },
  wardrobe(B, M) {
    B.box(M.wood, 1.5, 2.3, 0.7, 0, 1.15, -0.63); B.box(M.dark, 1.62, 0.12, 0.78, 0, 2.34, -0.6); B.box(M.dark, 1.56, 0.12, 0.74, 0, 0.06, -0.62);
    B.box(M.black, 0.03, 2.0, 0.02, 0, 1.15, -0.275);
    for (const x of [-0.37, 0.37]) { B.box(M.dark, 0.56, 0.8, 0.02, x, 1.65, -0.275); B.box(M.dark, 0.56, 0.9, 0.02, x, 0.7, -0.275); }
    B.box(M.brass, 0.05, 0.14, 0.05, -0.08, 1.2, -0.26); B.box(M.brass, 0.05, 0.14, 0.05, 0.08, 1.2, -0.26);
  },
  dresser(B, M) {
    B.box(M.wood, 1.5, 0.9, 0.6, 0, 0.45, -0.68); B.box(M.dark, 1.6, 0.06, 0.68, 0, 0.93, -0.66);
    for (const y of [0.2, 0.47, 0.74]) { B.box(M.dark, 1.36, 0.2, 0.02, 0, y, -0.375); B.box(M.brass, 0.06, 0.05, 0.04, -0.35, y, -0.36); B.box(M.brass, 0.06, 0.05, 0.04, 0.35, y, -0.36); }
    B.box(M.gold, 0.9, 1.15, 0.05, 0, 1.75, -0.95); B.box(M.glass, 0.76, 1.0, 0.02, 0, 1.75, -0.92);
    B.cyl(M.cream, 0.04, 0.04, 0.22, 0.55, 1.07, -0.7, 5); B.cone(glow(0xffc060), 0.035, 0.1, 0.55, 1.23, -0.7, 4);
  },
  bookshelf(B, M) {
    B.box(M.dark, 1.6, 2.2, 0.45, 0, 1.1, -0.76);
    for (let k = 0; k < 4; k++) { B.box(M.black, 1.42, 0.42, 0.02, 0, 0.36 + k * 0.5, -0.53); B.quad(M.books, 1.4, 0.34, 0, 0.32 + k * 0.5, -0.515, 0, 1.5 + (k % 2), 1); }
  },
  bed(B, M) {   // two cells, long side against the wall
    B.box(M.dark, 2.2, 0.35, 1.5, 1, 0.3, -0.22); B.box(M.dark, 0.12, 1.15, 1.5, -0.12, 0.58, -0.22); B.box(M.dark, 0.1, 0.6, 1.5, 2.12, 0.3, -0.22);
    B.box(M.sheet, 2.1, 0.2, 1.4, 1, 0.56, -0.22); B.box(M.fabric, 1.35, 0.23, 1.44, 1.38, 0.57, -0.22);
    B.box(M.cream, 0.42, 0.12, 0.9, 0.22, 0.72, -0.22);
  },
  desk(B, M) {
    B.box(M.wood, 1.5, 0.08, 0.7, 0, 0.78, -0.62);
    for (const x of [-0.68, 0.68]) for (const z of [-0.92, -0.32]) B.box(M.dark, 0.08, 0.76, 0.08, x, 0.38, z);
    B.box(M.dark, 1.3, 0.16, 0.04, 0, 0.66, -0.3);
    B.cyl(M.brass, 0.03, 0.08, 0.3, -0.5, 0.97, -0.75, 5); B.box(glow(0x4fd070), 0.34, 0.1, 0.16, -0.5, 1.14, -0.72);
    B.box(M.cream, 0.34, 0.01, 0.26, 0.2, 0.83, -0.58, 0.3);
    B.box(M.wood, 0.46, 0.06, 0.46, 0.15, 0.48, 0.25); B.box(M.wood, 0.46, 0.62, 0.06, 0.15, 0.8, 0.46);
    for (const x of [-0.05, 0.35]) for (const z of [0.05, 0.45]) B.box(M.dark, 0.05, 0.46, 0.05, x, 0.23, z);
  },
  luggage(B, M) {
    B.box(M.terracotta, 1.0, 0.36, 0.62, -0.1, 0.18, -0.55, 0.15); B.box(M.olive, 0.8, 0.3, 0.55, -0.05, 0.51, -0.55, -0.1);
    B.box(M.wood, 0.55, 0.26, 0.4, 0, 0.79, -0.55, 0.3); B.box(M.dark, 0.28, 0.6, 0.5, 0.65, 0.3, -0.5, -0.2);
    for (const [x, y] of [[-0.1, 0.18], [-0.05, 0.51]]) B.box(M.brass, 0.1, 0.08, 0.02, x, y, -0.22);
  },
  crates(B, M) {
    B.box(M.wood, 0.9, 0.9, 0.9, -0.2, 0.45, -0.5, 0.1); B.box(M.wood, 0.7, 0.7, 0.7, 0.45, 0.35, -0.1, -0.3); B.box(M.dark, 0.6, 0.6, 0.6, -0.15, 1.2, -0.5, 0.5);
  },
  // Free-standing obstacles, centred on their cell.
  trolley(B, M) {   // brass bellhop luggage cart
    B.box(M.dark, 1.5, 0.1, 0.8, 0, 0.3, 0); B.box(M.fabric, 1.4, 0.03, 0.7, 0, 0.365, 0);
    for (const x of [-0.6, 0.6]) for (const z of [-0.3, 0.3]) B.cyl(M.black, 0.1, 0.1, 0.08, x, 0.1, z, 6, 0, Math.PI / 2);
    for (const x of [-0.7, 0.7]) { for (const z of [-0.36, 0.36]) B.cyl(M.brass, 0.03, 0.03, 1.5, x, 1.1, z, 5); B.box(M.brass, 0.06, 0.06, 0.78, x, 1.86, 0); }
    B.box(M.brass, 1.46, 0.06, 0.06, 0, 1.86, 0);
    B.box(M.terracotta, 0.9, 0.34, 0.56, -0.15, 0.55, 0, 0.1); B.box(M.olive, 0.7, 0.28, 0.5, -0.1, 0.86, 0, -0.15); B.box(M.wood, 0.36, 0.5, 0.5, 0.45, 0.63, 0.02);
    B.box(M.brass, 0.1, 0.07, 0.02, -0.15, 0.55, 0.29); B.box(M.brass, 0.1, 0.07, 0.02, -0.1, 0.86, 0.26);
  },
  linen(B, M) {     // housekeeping cart
    B.box(M.sheet, 1.3, 0.06, 0.7, 0, 0.22, 0); B.box(M.sheet, 1.3, 0.06, 0.7, 0, 0.62, 0); B.box(M.sheet, 1.3, 0.06, 0.7, 0, 1.02, 0);
    for (const x of [-0.62, 0.62]) for (const z of [-0.32, 0.32]) { B.box(M.iron, 0.05, 1.0, 0.05, x, 0.55, z); B.cyl(M.black, 0.08, 0.08, 0.06, x, 0.08, z, 6, 0, Math.PI / 2); }
    B.box(M.cream, 0.5, 0.2, 0.5, -0.3, 1.15, 0); B.box(M.cream, 0.44, 0.14, 0.44, -0.3, 1.32, 0, 0.2); B.box(M.cream, 0.5, 0.26, 0.5, 0.25, 0.78, 0);
    B.box(M.olive, 0.5, 0.9, 0.62, 0.92, 0.6, 0); B.box(M.iron, 0.04, 0.04, 0.7, 0.66, 1.1, 0);
    B.cyl(flat(0x3a5a7a), 0.16, 0.13, 0.3, 0.3, 1.2, 0.1, 7); B.box(M.wood, 0.04, 1.3, 0.04, 0.3, 1.5, 0.1, 0, 0.12);
    B.box(M.gore, 0.3, 0.02, 0.3, -0.2, 0.26, 0.1);
  },
  painting(B, M, kind = 0, w = 0.95, h = 0.72, y = 2.0, x = 0) {
    B.box(M.gold, w + 0.14, h + 0.14, 0.04, x, y, -0.975); B.quad(M.paint[kind % 3], w, h, x, y, -0.92);
  },
  sconce(B, M, y = 2.5, x = 0) {
    B.box(M.brass, 0.1, 0.3, 0.08, x, y - 0.1, -0.95); B.box(M.brass, 0.06, 0.05, 0.2, x, y - 0.2, -0.86);
    B.cyl(M.cream, 0.035, 0.035, 0.2, x, y - 0.08, -0.78, 5); B.cone(glow(0xffc870), 0.05, 0.14, x, y + 0.1, -0.78, 4);
  },
};
