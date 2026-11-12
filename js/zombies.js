// The hotel's staff and guests: bellhops shamble, maids sprint, lodgers scuttle on all fours and
// butchers soak up bullets. Also the director that queues each room's monsters.
import * as THREE from 'three';

const ANIM_FPS = 9;   // poses update at this rate on purpose: choppy, stop-motion movement
const lam = (c, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
const basic = c => new THREE.MeshBasicMaterial({ color: c });
const pick = a => a[(Math.random() * a.length) | 0];
const rnd = (a, b) => a + Math.random() * (b - a);

// Cached boxes. `p` shifts the pivot: -0.5 hangs the box from its top, 0.5 stands it on its base.
const geos = new Map();
function G(x, y, z, p = 0) {
  const k = x + ',' + y + ',' + z + ',' + p;
  let g = geos.get(k);
  if (!g) { g = new THREE.BoxGeometry(x, y, z); if (p) g.translate(0, p * y, 0); geos.set(k, g); }
  return g;
}

const MAT = {
  dead: [lam(0x9aa596, 0x1c201c), lam(0x848f8c, 0x1a1e1e), lam(0xa9a890, 0x201e18), lam(0x7d8790, 0x181c20)],
  pale: [lam(0xc9c8bc, 0x24241f), lam(0xb9bcc0, 0x202224)],
  flesh: [lam(0x9a7a6c), lam(0x8a8272), lam(0x8f7480)],
  uniform: [lam(0x7a1420), lam(0x5a1028), lam(0x1e2a4e), lam(0x1d4030)],
  pyjama: [lam(0x7f93a8), lam(0x9a8fa8), lam(0x8aa090)],
  trouser: lam(0x16161b), black: lam(0x0c0c10), white: lam(0xd9d6c8), apron: lam(0xb9b39c), shirt: lam(0x4a4a44),
  burlap: lam(0x8a7448), hair: lam(0x0a0808), gold: lam(0xc9a227), bone: lam(0xd8ceb0), gore: lam(0x6a0509),
  mouth: lam(0x2a0406), iron: lam(0x34343c), steel: lam(0x8a8f98), woodH: lam(0x4a3220), claw: lam(0x1a1416),
  eyeWhite: basic(0xfff4d8), eyeRed: basic(0xff2a1a), eyeGreen: basic(0xb6ff3a), eyeOrange: basic(0xff9a1a),
};

export const ENEMY_TYPES = {
  bellhop: { name: 'bellhop', rig: 'biped', hp: 1,   speed: 1,    dmg: 30, reach: 1.35, radius: 0.36, points: 60,  chips: 3,  hitAt: 0.38, attackDur: 0.95, centerY: 1.15, neckY: 1.55, rise: 1.1, gore: 1 },
  maid:    { name: 'maid',    rig: 'biped', hp: 0.7, speed: 1.6,  dmg: 22, reach: 1.3,  radius: 0.32, points: 80,  chips: 4,  hitAt: 0.26, attackDur: 0.7,  centerY: 1.05, neckY: 1.45, rise: 0.8, gore: 0.9 },
  lodger:  { name: 'lodger',  rig: 'crawl', hp: 0.5, speed: 1.75, dmg: 18, reach: 1.3,  radius: 0.42, points: 50,  chips: 3,  hitAt: 0.24, attackDur: 0.7,  centerY: 0.55, neckY: 0.6,  rise: 0.6, gore: 0.8 },
  butcher: { name: 'butcher', rig: 'heavy', hp: 5.5, speed: 0.62, dmg: 55, reach: 1.95, radius: 0.6,  points: 250, chips: 12, hitAt: 0.62, attackDur: 1.35, centerY: 1.15, neckY: 1.6,  rise: 1.6, gore: 2.2 },
};

const tmp = { x: 0, z: 0 };

class Zombie {
  constructor(type, x, z, hp, speed) {
    this.type = type;
    this.def = ENEMY_TYPES[type];
    this.rig = this.def.rig;
    this.x = x; this.z = z;
    this.hp = hp; this.maxHp = hp;
    this.speed = speed;
    this.state = 'rising';
    this.t = 0;
    this.animT = Math.random() / ANIM_FPS;
    this.yaw = Math.random() * 6.28;
    this.phase = Math.random() * 6.28;
    this.attackDone = false;
    this.groanT = 2 + Math.random() * 6;
    this.dead = false;
    this.gone = false;      // set when gibbed: remove with no corpse
    this.stun = 0;
    this.fallDir = Math.random() < 0.5 ? 1 : -1;
    this.scale = type === 'butcher' ? 1.45 : type === 'maid' ? rnd(1.0, 1.1) : rnd(0.94, 1.08);
    this.lean = 0.25;
    this.parts = [];
    this.legs = [];
    this.arms = [];
    const g = this.group = new THREE.Group();
    g.rotation.order = 'YXZ';
    BUILD[type](this);
    g.scale.setScalar(this.scale);
    g.position.set(x, -2.2, z);
    g.rotation.y = this.yaw;
  }

  // Adds a mesh; `kind` ('head' | 'body') makes it a bullet hitbox, null makes it decoration.
  add(geo, mat, kind, x, y, z, parent = this.group) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (kind) { m.userData.zombie = this; m.userData.part = kind; this.parts.push(m); }
    parent.add(m);
    return m;
  }

  // Two-segment arm or leg hanging from (x, y, z). The lower half is reachable as upper.userData.lower.
  limb(x, y, z, w, l1, l2, matU, matL = matU, parent = this.group) {
    const upper = this.add(G(w, l1, w, -0.5), matU, 'body', x, y, z, parent);
    upper.userData.lower = this.add(G(w * 0.88, l2, w * 0.88, -0.5), matL, 'body', 0, -l1, 0, upper);
    return upper;
  }

  get centerY() { return this.def.centerY * this.scale; }
  get neckY() { return this.def.neckY * this.scale; }
}

function fingers(z, hand, n, len, w = 0.022, spread = 0.03) {
  for (let i = 0; i < n; i++) { const f = z.add(G(w, len, w, -0.5), MAT.claw, null, (i - (n - 1) / 2) * spread, -0.04, 0.02, hand); f.rotation.x = -0.25; }
}

const BUILD = {
  // A dead bellhop still in uniform: brass buttons, pillbox hat, jaw hanging open.
  bellhop(z) {
    const coat = pick(MAT.uniform), skin = pick(MAT.dead);
    z.add(G(0.38, 0.2, 0.23), MAT.trouser, 'body', 0, 0.95, 0);
    const t = z.torso = z.add(G(0.46, 0.58, 0.26, 0.5), coat, 'body', 0, 1.02, 0);
    t.rotation.x = z.lean;
    for (let i = 0; i < 4; i++) for (const sx of [-0.07, 0.07]) z.add(G(0.045, 0.045, 0.03), MAT.gold, null, sx, 0.1 + i * 0.12, 0.135, t);
    z.add(G(0.03, 0.5, 0.02), MAT.gold, null, 0, 0.3, 0.132, t);
    for (const sx of [-1, 1]) z.add(G(0.15, 0.05, 0.22), MAT.gold, null, sx * 0.2, 0.585, 0, t);
    z.add(G(0.22, 0.07, 0.22), MAT.white, null, 0, 0.6, 0.01, t);
    if (Math.random() < 0.75) z.add(G(0.2, 0.24, 0.02), MAT.gore, null, rnd(-0.1, 0.1), rnd(0.15, 0.35), 0.137, t);
    if (Math.random() < 0.4) z.add(G(0.16, 0.12, 0.05), MAT.bone, null, rnd(-0.1, 0.1), 0.3, 0.12, t);   // ribs showing through a tear

    const h = z.head = z.add(G(0.26, 0.3, 0.27, 0.5), skin, 'head', 0, 0.64, 0.03, t);
    for (const sx of [-0.065, 0.065]) { z.add(G(0.08, 0.07, 0.02), MAT.black, null, sx, 0.2, 0.131, h); z.add(G(0.028, 0.028, 0.02), MAT.eyeWhite, null, sx, 0.2, 0.14, h); }
    z.add(G(0.17, 0.05, 0.02), MAT.mouth, null, 0, 0.085, 0.131, h);
    z.add(G(0.15, 0.025, 0.02), MAT.bone, null, 0, 0.1, 0.137, h);
    z.jaw = z.add(G(0.21, 0.08, 0.2, -0.5), skin, null, 0, 0.06, 0.04, h);
    z.add(G(0.15, 0.025, 0.02), MAT.bone, null, 0, -0.012, 0.1, z.jaw);
    if (Math.random() < 0.72) {
      const hat = z.add(G(0.25, 0.11, 0.25, 0.5), coat, null, 0.02, 0.3, 0, h); hat.rotation.z = -0.18;
      z.add(G(0.262, 0.03, 0.262), MAT.gold, null, 0, 0.03, 0, hat); z.add(G(0.02, 0.2, 0.02), MAT.black, null, 0.13, -0.08, 0.05, hat);
    } else { z.add(G(0.2, 0.05, 0.2), MAT.gore, null, 0.03, 0.31, 0, h); z.add(G(0.1, 0.05, 0.1), MAT.bone, null, 0.05, 0.33, 0.02, h); }

    for (const sx of [-1, 1]) {
      const arm = z.limb(sx * 0.3, 1.54, 0.08, 0.115, 0.32, 0.3, coat), low = arm.userData.lower;
      z.add(G(0.12, 0.045, 0.12), MAT.gold, null, 0, -0.26, 0, low);
      const hand = z.add(G(0.1, 0.1, 0.09), skin, null, 0, -0.34, 0, low); fingers(z, hand, 3, 0.16);
      z.arms.push(arm);
      const leg = z.limb(sx * 0.11, 0.9, 0, 0.155, 0.44, 0.4, MAT.trouser), shin = leg.userData.lower;
      z.add(G(0.02, 0.44, 0.16), coat, null, sx * 0.075, -0.22, 0, leg);
      z.add(G(0.16, 0.08, 0.28), MAT.black, null, 0, -0.42, 0.05, shin);
      z.legs.push(leg);
    }
    z.armL = z.arms[0]; z.armR = z.arms[1];
  },

  // Housekeeping. Thin, bent double, hair over her face, far too fast.
  maid(z) {
    const skin = pick(MAT.pale);
    z.lean = 0.5; z.style = 'maid';
    z.add(G(0.5, 0.5, 0.42), MAT.black, 'body', 0, 0.8, 0);
    z.add(G(0.52, 0.05, 0.44), MAT.white, null, 0, 0.56, 0);
    z.add(G(0.32, 0.44, 0.02), MAT.white, null, 0, 0.8, 0.215);
    z.add(G(0.2, 0.22, 0.02), MAT.gore, null, rnd(-0.05, 0.05), 0.74, 0.222);
    const t = z.torso = z.add(G(0.33, 0.5, 0.2, 0.5), MAT.black, 'body', 0, 1.02, 0);
    t.rotation.x = z.lean;
    z.add(G(0.2, 0.28, 0.02), MAT.white, null, 0, 0.18, 0.105, t);
    z.add(G(0.25, 0.05, 0.22), MAT.white, null, 0, 0.49, 0, t);
    for (const sx of [-1, 1]) z.add(G(0.04, 0.3, 0.21), MAT.white, null, sx * 0.1, 0.36, 0, t);

    const h = z.head = z.add(G(0.24, 0.28, 0.25, 0.5), skin, 'head', 0, 0.53, 0.04, t);
    h.rotation.x = -0.35;
    z.add(G(0.07, 0.13, 0.02), MAT.mouth, null, 0, 0.08, 0.122, h);
    z.add(G(0.036, 0.036, 0.02), MAT.eyeWhite, null, -0.035, 0.19, 0.124, h);
    z.jaw = z.add(G(0.16, 0.05, 0.14, -0.5), skin, null, 0, 0.03, 0.05, h);
    z.add(G(0.29, 0.07, 0.3), MAT.hair, null, 0, 0.29, 0, h);
    z.add(G(0.29, 0.56, 0.07), MAT.hair, null, 0, 0.04, -0.13, h);
    for (const [sx, len] of [[-0.085, 0.4], [0.075, 0.34], [0.0, 0.14]]) z.add(G(0.085, len, 0.03, -0.5), MAT.hair, null, sx, 0.3, 0.135, h);
    for (const sx of [-1, 1]) z.add(G(0.04, 0.4, 0.26, -0.5), MAT.hair, null, sx * 0.135, 0.3, 0, h);
    z.add(G(0.2, 0.06, 0.08), MAT.white, null, 0, 0.34, 0.06, h);

    for (const sx of [-1, 1]) {
      const arm = z.limb(sx * 0.21, 1.44, 0.12, 0.07, 0.38, 0.42, skin), low = arm.userData.lower;
      z.add(G(0.13, 0.13, 0.13), MAT.black, null, 0, -0.03, 0, arm);
      z.add(G(0.085, 0.04, 0.085), MAT.white, null, 0, -0.34, 0, low);
      const hand = z.add(G(0.075, 0.08, 0.05), skin, null, 0, -0.45, 0, low); fingers(z, hand, 4, 0.24, 0.016, 0.022);
      z.arms.push(arm);
      const leg = z.limb(sx * 0.1, 0.62, 0, 0.09, 0.3, 0.28, skin, MAT.white);
      z.add(G(0.1, 0.07, 0.2), MAT.black, null, 0, -0.3, 0.04, leg.userData.lower);
      z.legs.push(leg);
    }
    z.armL = z.arms[0]; z.armR = z.arms[1];
  },

  // A guest in striped pyjamas, bent over backwards and walking on hands and feet, head upside down.
  lodger(z) {
    const pj = pick(MAT.pyjama), skin = pick(MAT.dead);
    const t = z.torso = z.add(G(0.46, 0.24, 0.82), pj, 'body', 0, 0.64, 0);
    for (let i = 0; i < 5; i++) z.add(G(0.47, 0.25, 0.035), MAT.white, null, 0, 0, -0.32 + i * 0.16, t);
    z.add(G(0.24, 0.05, 0.3), MAT.gore, null, 0, 0.13, 0.05, t);
    for (let i = 0; i < 3; i++) z.add(G(0.3, 0.05, 0.03), MAT.bone, null, 0, 0.15, -0.04 + i * 0.09, t);

    const h = z.head = z.add(G(0.28, 0.28, 0.28), skin, 'head', 0, 0.5, 0.58);
    for (const sx of [-0.07, 0.07]) { z.add(G(0.085, 0.075, 0.02), MAT.black, null, sx, -0.05, 0.141, h); z.add(G(0.03, 0.03, 0.02), MAT.eyeGreen, null, sx, -0.05, 0.15, h); }
    z.add(G(0.22, 0.07, 0.02), MAT.mouth, null, 0, 0.07, 0.141, h);
    z.add(G(0.2, 0.03, 0.02), MAT.bone, null, 0, 0.05, 0.148, h);
    z.jaw = z.add(G(0.23, 0.07, 0.2, 0.5), skin, null, 0, 0.1, 0.05, h);
    z.add(G(0.2, 0.03, 0.02), MAT.bone, null, 0, 0.012, 0.1, z.jaw);
    z.add(G(0.3, 0.07, 0.3), MAT.hair, null, 0, -0.16, 0, h);
    z.add(G(0.24, 0.3, 0.16, -0.5), MAT.hair, null, 0, -0.17, -0.04, h);
    z.add(G(0.12, 0.14, 0.14), skin, null, 0, 0.58, 0.44);   // the neck, bent the wrong way

    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const front = sz > 0;
      const leg = z.limb(sx * 0.24, 0.66, sz * 0.33, 0.095, 0.42, 0.84, front ? pj : pj, front ? skin : pj);
      leg.rotation.z = sx * 2.1; leg.userData.splay = sx * 2.1;
      leg.userData.lower.rotation.z = -sx * 2.25;
      const end = z.add(G(0.11, 0.05, 0.2), front ? skin : MAT.pale[0], null, 0, -0.84, 0.05, leg.userData.lower);
      if (front) fingers(z, end, 3, 0.12);
      z.legs.push(leg);
    }
    z.arms = [z.legs[0], z.legs[1]];
  },

  // The kitchen's butcher: sack over the head, chef's hat, filthy apron, cleaver and meat hook.
  butcher(z) {
    const skin = pick(MAT.flesh);
    z.lean = 0.15;
    z.add(G(0.86, 0.42, 0.64), MAT.shirt, 'body', 0, 0.86, 0.05);
    z.add(G(0.66, 0.62, 0.03), MAT.apron, null, 0, 0.72, 0.385);
    z.add(G(0.4, 0.3, 0.02), MAT.gore, null, 0.08, 0.7, 0.402); z.add(G(0.16, 0.34, 0.02), MAT.gore, null, -0.2, 0.56, 0.402);
    const t = z.torso = z.add(G(0.9, 0.7, 0.52, 0.5), MAT.shirt, 'body', 0, 1.02, 0);
    t.rotation.x = z.lean;
    z.add(G(0.62, 0.52, 0.03), MAT.apron, null, 0, 0.28, 0.275, t);
    z.add(G(0.34, 0.3, 0.02), MAT.gore, null, -0.08, 0.3, 0.292, t);
    for (const sx of [-1, 1]) z.add(G(0.07, 0.3, 0.56), MAT.apron, null, sx * 0.26, 0.62, 0, t);
    z.add(G(0.94, 0.08, 0.56), MAT.black, null, 0, 0.04, 0, t);

    const h = z.head = z.add(G(0.36, 0.38, 0.36, 0.5), MAT.burlap, 'head', 0, 0.7, 0.06, t);
    z.add(G(0.4, 0.06, 0.4), MAT.woodH, null, 0, 0.03, 0, h);
    z.add(G(0.07, 0.06, 0.02), MAT.black, null, -0.085, 0.24, 0.181, h); z.add(G(0.036, 0.036, 0.02), MAT.eyeOrange, null, -0.085, 0.24, 0.19, h);
    for (const r of [0.6, -0.6]) { const x = z.add(G(0.1, 0.022, 0.02), MAT.black, null, 0.085, 0.24, 0.182, h); x.rotation.z = r; }
    z.jaw = z.add(G(0.22, 0.03, 0.02), MAT.black, null, 0, 0.11, 0.182, h);
    for (let i = 0; i < 5; i++) z.add(G(0.018, 0.08, 0.02), MAT.black, null, -0.08 + i * 0.04, 0.11, 0.184, h);
    z.add(G(0.38, 0.1, 0.38), MAT.white, null, 0, 0.42, 0, h);
    const puff = z.add(G(0.46, 0.26, 0.46), MAT.white, null, 0.03, 0.6, -0.02, h); puff.rotation.z = -0.15;
    z.add(G(0.2, 0.14, 0.02), MAT.gore, null, 0.05, 0.02, 0.235, puff);

    for (const sx of [-1, 1]) {
      const arm = z.limb(sx * 0.6, 1.6, 0.02, 0.25, 0.44, 0.42, skin), low = arm.userData.lower;
      z.add(G(0.3, 0.14, 0.3), MAT.shirt, null, 0, -0.06, 0, arm);
      const fist = z.add(G(0.3, 0.26, 0.3), skin, null, 0, -0.5, 0, low);
      if (sx > 0) {   // cleaver
        z.add(G(0.06, 0.07, 0.34), MAT.woodH, null, 0, -0.02, 0.1, fist);
        z.add(G(0.03, 0.34, 0.5), MAT.steel, null, 0, -0.12, 0.5, fist); z.add(G(0.034, 0.1, 0.5), MAT.gore, null, 0, -0.26, 0.5, fist);
      } else {        // meat hook
        z.add(G(0.05, 0.36, 0.05), MAT.iron, null, 0, -0.28, 0.06, fist); z.add(G(0.05, 0.05, 0.2), MAT.iron, null, 0, -0.46, 0.14, fist); z.add(G(0.05, 0.14, 0.05), MAT.iron, null, 0, -0.4, 0.22, fist);
      }
      z.arms.push(arm);
      const leg = z.limb(sx * 0.24, 0.8, 0, 0.29, 0.4, 0.34, MAT.trouser);
      z.add(G(0.31, 0.14, 0.42), MAT.black, null, 0, -0.33, 0.06, leg.userData.lower);
      z.legs.push(leg);
    }
    z.armL = z.arms[0]; z.armR = z.arms[1];
  },
};

// Stepped pose update. Called ~9 times a second per enemy.
function pose(z) {
  const g = z.group, rig = z.rig, s = Math.sin(z.phase), c = Math.cos(z.phase), jit = () => Math.random() - 0.5;
  const knee = (i, v) => { z.legs[i].userData.lower.rotation.x = v; };
  const elbow = (a, v) => { a.userData.lower.rotation.x = v; };
  g.rotation.y = z.yaw;

  if (z.state === 'rising') {
    const k = Math.min(z.t / z.def.rise, 1);
    g.position.y = -2.2 * z.scale * (1 - k) * (1 - k);
    if (rig !== 'crawl') for (const a of z.arms) { a.rotation.x = -2.6 + jit() * 0.5; elbow(a, -0.4 + jit() * 0.4); }   // clawing up through the floorboards
    return;
  }

  if (z.state === 'dying') {
    const k = Math.min(z.t / 0.5, 1);
    if (rig === 'crawl') { g.rotation.z = k * Math.PI; g.position.y = 0.5 * k; }
    else { g.rotation.x = -z.fallDir * k * Math.PI / 2; g.position.y = (rig === 'heavy' ? 0.3 : 0.16) * k; }
    if (z.t < 1.6) for (const l of z.legs) l.rotation.x = jit() * 0.9;   // death twitches
    if (z.t > z.corpseT) g.position.y -= (z.t - z.corpseT) * 0.5;
    return;
  }
  g.position.y = 0;

  if (z.state === 'attack') {
    const k = z.t / z.def.attackDur, hit = z.def.hitAt / z.def.attackDur;
    const sw = k < hit ? k / hit : Math.max(0, 1 - (k - hit) * 2);
    if (rig === 'biped') {
      z.armL.rotation.x = -1.2 - sw * 1.4; z.armR.rotation.x = -1.5 - sw * 1.1;
      z.armL.rotation.z = z.armR.rotation.z = 0;
      elbow(z.armL, -0.5 * (1 - sw)); elbow(z.armR, -0.5 * (1 - sw));
      z.torso.rotation.x = z.lean + sw * 0.35;
      z.jaw.rotation.x = 0.3 + sw * 0.6;
    } else if (rig === 'crawl') {
      z.head.rotation.x = -sw * 0.7; z.jaw.rotation.x = -sw * 0.9;
      z.legs[0].rotation.x = z.legs[1].rotation.x = -sw * 1.4;
    } else {
      // overhead cleaver chop: wind up, then slam
      const a = k < hit ? -3.0 * Math.min(1, k / (hit * 0.8)) : -3.0 + Math.min(1, (k - hit) * 6) * 2.4;
      z.armR.rotation.x = a; z.armL.rotation.x = a * 0.75;
      elbow(z.armR, k < hit ? -0.9 : -0.1); elbow(z.armL, -0.5);
      z.torso.rotation.x = k < hit ? -0.12 : 0.5;
    }
    return;
  }

  // walking
  if (rig === 'biped') {
    const maid = z.style === 'maid';
    z.legs[0].rotation.x = s * 0.75; z.legs[1].rotation.x = -s * 0.75;
    knee(0, Math.max(0, c) * 0.95); knee(1, Math.max(0, -c) * 0.95);
    if (maid) {
      // sprinting bent double, arms dragging out behind her
      z.armL.rotation.x = 0.9 + jit() * 0.5; z.armR.rotation.x = 0.9 + jit() * 0.5;
      z.armL.rotation.z = -0.4; z.armR.rotation.z = 0.4;
      elbow(z.armL, -0.3 + jit() * 0.3); elbow(z.armR, -0.3 + jit() * 0.3);
      z.torso.rotation.x = z.lean + Math.abs(s) * 0.12; z.torso.rotation.z = s * 0.06;
      z.head.rotation.set(-0.35 + jit() * 0.3, jit() * 0.5, jit() * 0.9);
      z.jaw.rotation.x = Math.random() * 0.9;
    } else {
      z.armL.rotation.x = -1.3 + s * 0.3; z.armR.rotation.x = -0.95 - s * 0.35;
      elbow(z.armL, -0.35 + jit() * 0.3); elbow(z.armR, -0.6 + jit() * 0.3);
      z.torso.rotation.x = z.lean + Math.abs(s) * 0.08; z.torso.rotation.z = s * 0.09;
      z.head.rotation.set(jit() * 0.25, jit() * 0.6, 0.25 + jit() * 0.4);
      z.jaw.rotation.x = 0.25 + Math.random() * 0.6;
    }
  } else if (rig === 'crawl') {
    z.legs.forEach((l, i) => { l.rotation.x = (i % 3 === 0 ? 1 : -1) * s * 0.8; l.rotation.z = l.userData.splay + jit() * 0.12; });
    z.torso.rotation.z = s * 0.1; z.torso.position.y = 0.64 + Math.abs(c) * 0.05;
    z.head.rotation.set(jit() * 0.3, jit() * 0.5, Math.random() < 0.15 ? jit() * 3 : jit() * 0.4);
    z.jaw.rotation.x = -Math.random() * 0.7;
  } else {
    z.legs[0].rotation.x = s * 0.5; z.legs[1].rotation.x = -s * 0.5;
    knee(0, Math.max(0, c) * 0.6); knee(1, Math.max(0, -c) * 0.6);
    z.armL.rotation.x = -0.25 - s * 0.45; z.armR.rotation.x = -0.25 + s * 0.45;
    z.armL.rotation.z = -0.22; z.armR.rotation.z = 0.22;
    elbow(z.armL, -0.5); elbow(z.armR, -0.7);
    z.torso.rotation.x = z.lean; z.torso.rotation.z = s * 0.08;
    z.head.rotation.set(0, jit() * 0.3, jit() * 0.12);
  }
}

export class ZombieDirector {
  constructor(game) {
    this.game = game;
    this.zombies = [];
    this.hitMeshes = [];
    this.round = 0;
    this.toSpawn = 0;
    this.spawnT = 0;
    this.phase = 'idle';      // idle | intermission | active
    this.phaseT = 0;
    this.flowT = 0;
    this.maxAlive = 16;
    this.queue = [];
    this._diff = 1;
    this._points = [];
    this.boss = null;
  }

  reset() {
    for (const z of this.zombies) this.game.scene.remove(z.group);
    this.zombies.length = 0;
    this.hitMeshes.length = 0;
    this.round = 0;
    this.toSpawn = 0;
    this.queue = [];
    this.round = 0;
    this._diff = 1;
    this.phase = 'active';
    this.boss = null;
  }

  get alive() { return this.zombies.reduce((n, z) => n + (z.dead ? 0 : 1), 0); }
  get remaining() { return this.queue.length + this.alive; }

  healthFor(d) { return Math.round(90 + 26 * d); }
  speedFor(d) { return Math.min(1.1 + 0.11 * d, 3.2); }

  // Queue a batch of monsters to rise from the given spawn points (one room's worth).
  spawnRoom(points, count, difficulty) {
    if (!points.length) return;
    this._points = points;
    this._diff = Math.max(this._diff, difficulty);
    this.round = Math.max(this.round, difficulty);
    for (let i = 0; i < count; i++) this.queue.push(points[(Math.random() * points.length) | 0]);
    this.spawnT = Math.min(this.spawnT, 0.4);
  }

  pickType(d) {
    if (d >= 6 && Math.random() < Math.min(0.08 + 0.015 * d, 0.24)) return 'butcher';
    if (d >= 3 && Math.random() < Math.min(0.1 + 0.025 * d, 0.32)) return 'lodger';
    if (d >= 2 && Math.random() < Math.min(0.1 + 0.03 * d, 0.34)) return 'maid';
    return 'bellhop';
  }

  spawn(type, s, difficulty) {
    const audio = this.game.audio, def = ENEMY_TYPES[type];
    const speed = Math.min(this.speedFor(difficulty) * def.speed * rnd(0.8, 1.15), def.rig === 'crawl' ? 5.4 : type === 'maid' ? 4.8 : 3.6);
    const z = new Zombie(type, s.x + rnd(-0.5, 0.5), s.z + rnd(-0.5, 0.5), Math.round(this.healthFor(difficulty) * def.hp), speed);
    this.zombies.push(z);
    this.hitMeshes.push(...z.parts);
    this.game.scene.add(z.group);
    if (def.rig === 'heavy') audio.roar(); else if (def.rig === 'crawl' || type === 'maid') audio.screech();
    return z;
  }

  // Returns true if the hit killed the enemy.
  damage(z, amount) {
    if (z.dead) return false;
    z.hp -= amount;
    if (z.hp > 0) {
      if (z.rig !== 'heavy') z.stun = 0.14;
      return false;
    }
    z.dead = true;
    z.state = 'dying';
    z.t = 0;
    z.animT = 1;   // pose immediately
    z.corpseT = 7 + Math.random() * 3;
    for (const p of z.parts) {
      const i = this.hitMeshes.indexOf(p);
      if (i >= 0) this.hitMeshes.splice(i, 1);
    }
    return true;
  }

  update(dt) {
    const game = this.game, { world, player } = game;

    this.spawnT -= dt;
    if (this.queue.length && this.spawnT <= 0 && this.alive < this.maxAlive) {
      const s = this.queue.shift() || this._points[(Math.random() * this._points.length) | 0];
      if (s) this.spawn(this.pickType(this._diff), s, this._diff);
      this.spawnT = Math.max(0.28, 0.9 - this._diff * 0.02);
    }

    this.flowT -= dt;
    if (this.flowT <= 0) {
      this.flowT = 0.2;
      world.computeFlow(player.pos.x, player.pos.z);
    }

    const zs = this.zombies;
    for (let i = zs.length - 1; i >= 0; i--) {
      const z = zs[i], def = z.def;
      z.t += dt;
      z.animT += dt;
      const step = z.animT >= 1 / ANIM_FPS;
      if (step) z.animT = 0;

      if (z.gone || (z.state === 'dying' && z.t > z.corpseT + 2)) {
        game.scene.remove(z.group);
        zs.splice(i, 1);
        continue;
      }
      if (z.state === 'dying') { if (step) pose(z); continue; }

      const dxp = player.pos.x - z.x, dzp = player.pos.z - z.z;
      const dist = Math.hypot(dxp, dzp);

      if (z.state === 'rising') {
        z.group.position.x = z.x; z.group.position.z = z.z;
        if (step) pose(z);
        if (z.t >= def.rise) { z.state = 'chase'; z.t = 0; z.group.position.y = 0; }
        continue;
      }

      z.groanT -= dt;
      if (z.groanT <= 0) {
        z.groanT = 4 + Math.random() * 7;
        if (dist < 22) {
          if (z.rig === 'crawl') game.audio.screech(); else game.audio.groan(Math.max(0.04, 0.22 * (1 - dist / 22)));
        }
      }

      if (z.state === 'attack') {
        if (!z.attackDone && z.t >= def.hitAt) {
          z.attackDone = true;
          game.audio.zombieSwing();
          if (dist < def.reach + 0.6 && player.jumpHeight < 1.4) game.damagePlayer(def.dmg, z);
        }
        z.yaw = Math.atan2(dxp, dzp);
        if (step) pose(z);
        if (z.t >= def.attackDur) { z.state = 'chase'; z.t = 0; }
        continue;
      }

      // chase
      if (dist < def.reach) {
        z.state = 'attack'; z.t = 0; z.attackDone = false; z.animT = 1;
        continue;
      }
      if (z.stun > 0) { z.stun -= dt; if (step) pose(z); continue; }

      world.flowTarget(z.x, z.z, player.pos.x, player.pos.z, tmp);
      let dx = tmp.x - z.x, dz = tmp.z - z.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      z.x += dx * z.speed * dt;
      z.z += dz * z.speed * dt;

      // keep enemies from stacking inside each other
      for (let j = 0; j < zs.length; j++) {
        if (j === i) continue;
        const o = zs[j];
        if (o.dead || o.state === 'rising') continue;
        const min = def.radius + o.def.radius;
        const ox = z.x - o.x, oz = z.z - o.z, d2 = ox * ox + oz * oz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (min - d) * (o.rig === 'heavy' && z.rig !== 'heavy' ? 0.9 : 0.5) / d;
          z.x += ox * push; z.z += oz * push;
        }
      }
      tmp.x = z.x; tmp.z = z.z;
      world.collideCircle(tmp, def.radius);
      z.x = tmp.x; z.z = tmp.z;

      const want = Math.atan2(dx, dz);
      let diff = want - z.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      z.yaw += diff * Math.min(1, dt * 8);
      z.group.position.x = z.x; z.group.position.z = z.z;
      z.phase += dt * z.speed * (z.rig === 'crawl' ? 4.5 : z.rig === 'heavy' ? 2.6 : z.type === 'maid' ? 2.6 : 3.4);
      if (step) pose(z);
    }
  }
}
