// The Lobby: where you start. A rainy covered entrance outside an old hotel leads into a cozy,
// fireplace-lit hallway with podiums (cases, knives, armory, settings) and an elevator that takes
// you down into the game. No enemies here. Shares the grid-collision style of the hotel.
import * as THREE from 'three';

export const CELL = 2;
export const WALL_H = 3.3;

// # wall  g outdoor grass  . hall floor  P player spawn  F fireplace  E elevator
// 1 cases  2 knives  3 armory  4 settings
const MAP = [
  '################',
  '#gggggggggggggg#',
  '#gggggggggggggg#',
  '#ggggggPggggggg#',
  '#gggggggggggggg#',
  '#ggggg#..#ggggg#',
  '#####.#..#.#####',
  '#....1....2....#',
  '#..............#',
  '#F............F#',
  '#..............#',
  '#..............#',
  '#....3....4....#',
  '#..............#',
  '#......EE......#',
  '################',
];
const OUTDOOR = new Set();   // filled from the map

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
function sign(lines, color) {
  const tex = canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = 'rgba(10,7,6,0.9)'; g.fillRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color;
    g.font = 'bold 44px Georgia, serif'; g.fillText(lines[0], w / 2, lines[1] ? 46 : h / 2);
    if (lines[1]) { g.fillStyle = '#efe6cf'; g.font = '24px Georgia, serif'; g.fillText(lines[1], w / 2, 92); }
  }, 1);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(1.9, 0.95, 1);
  return s;
}

export class Lobby {
  constructor(scene) {
    this.scene = scene;
    this.h = MAP.length; this.w = MAP[0].length;
    this.blockedGrid = new Uint8Array(this.w * this.h);
    this.interactables = [];
    this.animated = [];
    this.playerSpawn = new THREE.Vector3();
    this.skyMat = null; this.stormLight = null;
    this.time = 0;
    this._build();
  }

  blocked(cx, cz) { return (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) ? true : this.blockedGrid[cz * this.w + cx] === 1; }
  center(cx, cz) { return [(cx + 0.5) * CELL, (cz + 0.5) * CELL]; }
  isOutdoor(x, z) { const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); return OUTDOOR.has(cz * this.w + cx); }

  _build() {
    const scene = this.scene;
    const L = (o) => new THREE.MeshLambertMaterial(o);
    const wallMat = L({ map: this._brick() });
    const woodMat = L({ map: this._wood() });
    const carpetMat = L({ color: 0x4a1420 });
    const darkWood = L({ color: 0x241812 });
    const stoneMat = L({ color: 0x4a4852 });
    OUTDOOR.clear();

    const walls = [];
    for (let cz = 0; cz < this.h; cz++) for (let cx = 0; cx < this.w; cx++) {
      const ch = MAP[cz][cx];
      const [x, z] = this.center(cx, cz);
      if (ch === '#') { this.blockedGrid[cz * this.w + cx] = 1; walls.push({ x, z }); continue; }
      if (ch === 'g') OUTDOOR.add(cz * this.w + cx);
      if (ch === 'P') this.playerSpawn.set(x, 0, z);
      else if (ch === 'F') this._fireplace(x, z, cx, darkWood);
      else if (ch === 'E') this._elevator(x, z, cx, stoneMat);
      else if (ch === '1') this._podium(x, z, 'cases', 'WEAPON CASES', '#ffd65e', woodMat);
      else if (ch === '2') this._podium(x, z, 'knives', 'KNIFE CRATES', '#a05bff', woodMat);
      else if (ch === '3') this._podium(x, z, 'armory', 'ARMORY', '#4b8dff', woodMat);
      else if (ch === '4') this._podium(x, z, 'settings', 'SETTINGS', '#9fdc6a', woodMat);
    }
    // merged walls
    const pos = [], nor = [], uv = [];
    for (const b of walls) { const g = new THREE.BoxGeometry(CELL, WALL_H, CELL).toNonIndexed(); g.translate(b.x, WALL_H / 2, b.z); pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array); g.dispose(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    scene.add(new THREE.Mesh(geo, wallMat));

    // floors: grass outdoors, carpet + boards indoors
    const grassT = this._grass(); grassT.wrapS = grassT.wrapT = THREE.RepeatWrapping; grassT.repeat.set(this.w, this.h);
    const boardT = this._wood(); boardT.wrapS = boardT.wrapT = THREE.RepeatWrapping; boardT.repeat.set(this.w, this.h);
    for (let cz = 0; cz < this.h; cz++) for (let cx = 0; cx < this.w; cx++) {
      const ch = MAP[cz][cx]; if (ch === '#') continue;
      const [x, z] = this.center(cx, cz);
      const out = ch === 'g';
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), out ? L({ map: this._grass() }) : L({ map: this._wood() }));
      tile.rotation.x = -Math.PI / 2; tile.position.set(x, 0.01, z); scene.add(tile);
    }
    // a long carpet runner down the hall
    const runner = new THREE.Mesh(new THREE.BoxGeometry(CELL * 2, 0.03, CELL * 7), carpetMat);
    runner.position.set(this.w * CELL / 2, 0.03, 11 * CELL); scene.add(runner);

    // ceiling over the indoor part only; open stormy sky over the yard
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(this.w * CELL, 10 * CELL), L({ color: 0x1a140e }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(this.w * CELL / 2, WALL_H, 11 * CELL); scene.add(ceil);
    this.skyMat = new THREE.MeshBasicMaterial({ color: 0x0a0e18, fog: false });
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(this.w * CELL + 8, 7 * CELL + 8), this.skyMat);
    sky.rotation.x = Math.PI / 2; sky.position.set(this.w * CELL / 2, WALL_H + 7, 3 * CELL); scene.add(sky);
    this.lawnCenter = [this.w * CELL / 2, 3 * CELL];

    // lighting: cold moon over the yard, warm interior glow
    const moon = new THREE.PointLight(0x9fb8e0, 22, 40, 1.3); moon.position.set(this.w * CELL / 2, WALL_H + 4, 3 * CELL); scene.add(moon);
    this.stormLight = moon;
    scene.add(new THREE.AmbientLight(0x2a2434, 0.7));
    scene.add(new THREE.HemisphereLight(0x3a3650, 0x20160e, 0.5));
    const hallGlow = new THREE.PointLight(0xffb060, 26, 26, 1.6); hallGlow.position.set(this.w * CELL / 2, WALL_H - 0.6, 11 * CELL); scene.add(hallGlow);

    // a glowing hotel sign over the entrance
    const title = sign(['THE LAST CALL', 'HOTEL'], '#ff5a5a');
    title.scale.set(5, 2.5, 1); title.position.set(this.w * CELL / 2, WALL_H + 1.5, 5.4 * CELL); scene.add(title);
  }

  _fireplace(x, z, cx, darkWood) {
    const scene = this.scene;
    const left = cx < this.w / 2;
    const hearth = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 2.0), new THREE.MeshLambertMaterial({ color: 0x3a3630 }));
    hearth.position.set(x + (left ? 0.5 : -0.5), 0.7, z); scene.add(hearth);
    const fireMat = new THREE.MeshBasicMaterial({ color: 0xffa030 });
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 5), fireMat); fire.position.set(x + (left ? 0.2 : -0.2), 0.7, z); scene.add(fire);
    const light = new THREE.PointLight(0xff8a30, 20, 14, 1.6); light.position.set(x + (left ? 0.2 : -0.2), 1.0, z); scene.add(light);
    const seed = cx * 2.1;
    this.animated.push(t => { const f = 0.8 + 0.2 * Math.sin(t * 11 + seed) + 0.1 * Math.sin(t * 27 + seed); light.intensity = 20 * f; fire.scale.set(0.8 + 0.3 * Math.sin(t * 17 + seed), 0.8 + f * 0.4, 1); fire.rotation.y = t * 3; });
  }

  _elevator(x, z, cx, stoneMat) {
    const scene = this.scene;
    if (cx > this.w / 2 - 1 && cx < this.w / 2) return;   // build once (left cell of the EE pair)
    if (MAP[14][cx - 1] === 'E') return;
    const bx = this.w * CELL / 2;   // centre of the EE pair
    const back = new THREE.Mesh(new THREE.BoxGeometry(CELL * 2 + 0.4, WALL_H - 0.1, 0.3), new THREE.MeshLambertMaterial({ color: 0x6a6a72, emissive: 0x111111 }));
    back.position.set(bx, (WALL_H - 0.1) / 2, z + CELL * 0.6); scene.add(back);
    for (const dx of [-CELL * 0.6, CELL * 0.6]) { const door = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.75, WALL_H - 0.3, 0.14), new THREE.MeshLambertMaterial({ color: 0x8a8f98 })); door.position.set(bx + dx, (WALL_H - 0.3) / 2, z + CELL * 0.45); scene.add(door); }
    const light = new THREE.PointLight(0xa8c8ff, 10, 10, 1.8); light.position.set(bx, WALL_H - 0.5, z); scene.add(light);
    const s = sign(['ELEVATOR', 'press F to descend'], '#a8c8ff'); s.position.set(bx, WALL_H + 0.4, z + CELL * 0.4); scene.add(s);
    this.interactables.push({ type: 'elevator', x: bx, z });
  }

  _podium(x, z, act, label, color, woodMat) {
    const scene = this.scene;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.0, 8), woodMat); base.position.set(x, 0.5, z); scene.add(base);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.7), new THREE.MeshLambertMaterial({ color: 0x3a2a1a })); top.position.set(x, 1.06, z); top.rotation.x = -0.3; scene.add(top);
    const glow = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color })); glow.position.set(x, 1.7, z); scene.add(glow);
    const light = new THREE.PointLight(color, 4, 5, 2); light.position.set(x, 1.7, z); scene.add(light);
    const s = sign([label], color); s.position.set(x, 2.3, z); scene.add(s);
    const seed = x;
    this.animated.push(t => { glow.rotation.y = t * 1.5; glow.position.y = 1.7 + Math.sin(t * 2 + seed) * 0.08; });
    this.interactables.push({ type: act, x, z });
  }

  flashLightning() { if (this.stormLight) this.stormLight.intensity = 200; if (this.skyMat) this.skyMat.color.setHex(0x8390a8); }

  update(time) {
    this.time = time;
    for (const fn of this.animated) fn(time);
    const dt = Math.min(Math.max(time - (this._lastT ?? time), 0), 0.2); this._lastT = time;
    if (this.stormLight && this.stormLight.intensity > 22) { this.stormLight.intensity = Math.max(22, this.stormLight.intensity - dt * 800); if (this.stormLight.intensity <= 26 && this.skyMat) this.skyMat.color.setHex(0x0a0e18); }
  }

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

  _brick() { return canvasTexture(128, 128, (g, w, h) => { g.fillStyle = '#2a1d16'; g.fillRect(0, 0, w, h); const sh = ['#4a3528', '#3d2b20', '#523c2c']; const bh = 16; for (let row = 0; row < h / bh; row++) { const off = row % 2 ? 16 : 0; for (let x = -32; x < w; x += 32) { g.fillStyle = sh[(row + x / 32) % 3 | 0] || sh[0]; g.fillRect(x + off + 2, row * bh + 2, 28, bh - 4); } } speckle(g, w, h, 120, ['rgba(0,0,0,0.3)', 'rgba(20,30,10,0.3)'], 2, 7); }); }
  _wood() { return canvasTexture(64, 64, (g, w, h) => { for (let i = 0; i < 4; i++) { g.fillStyle = ['#4a3220', '#3d2a1a', '#523926', '#38271a'][i]; g.fillRect(i * 16, 0, 16, h); } g.strokeStyle = '#241509'; g.lineWidth = 2; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, h); g.stroke(); } }); }
  _grass() { return canvasTexture(64, 64, (g, w, h) => { g.fillStyle = '#1c2a16'; g.fillRect(0, 0, w, h); speckle(g, w, h, 200, ['#24341c', '#1a2612', '#2e3f22', '#161f10'], 2, 6); }); }
}
