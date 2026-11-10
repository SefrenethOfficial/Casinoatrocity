// The dungeon's undead (ghouls, crawlers, brutes) plus the round/wave director for Zombies mode.
import * as THREE from 'three';
import { LAB_ROOM } from './world.js';

const ANIM_FPS = 9;   // poses update at this rate on purpose: choppy, stop-motion movement
const lam = c => new THREE.MeshLambertMaterial({ color: c });
const basic = c => new THREE.MeshBasicMaterial({ color: c });
const pick = a => a[(Math.random() * a.length) | 0];
const rnd = (a, b) => a + Math.random() * (b - a);
const boxGeo = (x, y, z, pivotY = 0) => { const g = new THREE.BoxGeometry(x, y, z); if (pivotY) g.translate(0, pivotY, 0); return g; };

const GEO = {
  // ghoul
  gTorso: boxGeo(0.5, 0.62, 0.27), gRibs: boxGeo(0.34, 0.3, 0.06), gHead: boxGeo(0.3, 0.3, 0.3),
  gJaw: boxGeo(0.24, 0.09, 0.22), gArm: boxGeo(0.12, 0.68, 0.12, -0.34), gClaw: boxGeo(0.15, 0.14, 0.15),
  gLeg: boxGeo(0.17, 0.82, 0.19, -0.41), eye: boxGeo(0.07, 0.05, 0.03), stain: boxGeo(0.22, 0.2, 0.04),
  // crawler
  cBody: boxGeo(0.5, 0.3, 0.95), cHead: boxGeo(0.36, 0.28, 0.36), cJaw: boxGeo(0.3, 0.08, 0.3),
  cLeg: boxGeo(0.1, 0.56, 0.1, -0.28), cSpike: boxGeo(0.08, 0.2, 0.08),
  // brute
  bTorso: boxGeo(0.86, 0.74, 0.5), bBelly: boxGeo(0.7, 0.34, 0.56), bHead: boxGeo(0.3, 0.3, 0.3),
  bHorn: boxGeo(0.07, 0.24, 0.07), bArm: boxGeo(0.24, 0.8, 0.24, -0.4), bFist: boxGeo(0.32, 0.28, 0.32),
  bLeg: boxGeo(0.28, 0.78, 0.3, -0.39), bPlate: boxGeo(0.34, 0.14, 0.4),
};
const MAT = {
  ghoulSkin: [lam(0x8a9488), lam(0x6f7f76), lam(0x9aa08a), lam(0x5f6b70), lam(0x7b6f78)],
  rags: [lam(0x3a2f28), lam(0x2c2c33), lam(0x4a1a1a), lam(0x3b3a22), lam(0x242a30)],
  pants: [lam(0x18181c), lam(0x2a2430), lam(0x2a2218)],
  crawlerSkin: [lam(0x6b3a3a), lam(0x4a3540), lam(0x5a4636)],
  bruteSkin: [lam(0x7a5a4a), lam(0x5a6a5a), lam(0x6a5a6a)],
  bone: lam(0xd8ceb0), gore: lam(0x6a0509), iron: lam(0x2a2a30), claw: lam(0x1a1416),
  eyeRed: basic(0xff2a1a), eyeGreen: basic(0xb6ff3a), eyeOrange: basic(0xff9a1a),
  mutantSkin: [lam(0xb8c8b0), lam(0xa8b8c0), lam(0xc8c0a8)], labRag: lam(0x8a9aa0), acid: basic(0x3dff7a),
};

export const ENEMY_TYPES = {
  ghoul:   { hp: 1,    speed: 1,    dmg: 30, reach: 1.35, radius: 0.36, points: 60,  chips: 3,  hitAt: 0.38, attackDur: 0.95, centerY: 1.15, neckY: 1.5,  rise: 1.1, gore: 1 },
  crawler: { hp: 0.5,  speed: 1.75, dmg: 18, reach: 1.3,  radius: 0.42, points: 50,  chips: 3,  hitAt: 0.24, attackDur: 0.7,  centerY: 0.5,  neckY: 0.6,  rise: 0.6, gore: 0.8 },
  // lab-grown: fast, bleeds acid and bursts when it dies
  mutant:  { hp: 1.25, speed: 1.45, dmg: 34, reach: 1.4,  radius: 0.36, points: 90,  chips: 5,  hitAt: 0.3,  attackDur: 0.8,  centerY: 1.15, neckY: 1.5,  rise: 0.8, gore: 1.3, acid: true },
  brute:   { hp: 5.5,  speed: 0.62, dmg: 55, reach: 1.95, radius: 0.6,  points: 250, chips: 12, hitAt: 0.62, attackDur: 1.35, centerY: 1.15, neckY: 1.55, rise: 1.6, gore: 2.2 },
  // the lab's warden: a slow, enormous tank spawned at the end of the lab
  boss:    { hp: 1,    speed: 0.6,  dmg: 55, reach: 2.6,  radius: 1.0,  points: 2500, chips: 150, hitAt: 0.7, attackDur: 1.5, centerY: 1.2, neckY: 1.6, rise: 2.0, gore: 4, boss: true },
};

const tmp = { x: 0, z: 0 };

class Zombie {
  constructor(type, x, z, hp, speed) {
    this.type = type;
    this.def = ENEMY_TYPES[type];
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
    this.scale = type === 'boss' ? 2.4 : type === 'brute' ? 1.5 : type === 'mutant' ? rnd(1.12, 1.25) : rnd(0.92, 1.1);
    this.rig = type === 'mutant' ? 'ghoul' : type === 'boss' ? 'brute' : type;   // which skeleton/animation set it uses
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

  get centerY() { return this.def.centerY * this.scale; }
  get neckY() { return this.def.neckY * this.scale; }
}

const BUILD = {
  ghoul(z) {
    const skin = pick(MAT.ghoulSkin), rag = pick(MAT.rags), pants = pick(MAT.pants);
    z.torso = z.add(GEO.gTorso, rag, 'body', 0, 1.12, 0);
    z.torso.rotation.x = 0.32;
    z.add(GEO.gRibs, MAT.bone, null, 0, 0.02, 0.15, z.torso);
    if (Math.random() < 0.7) z.add(GEO.stain, MAT.gore, null, rnd(-0.12, 0.12), rnd(-0.2, 0.15), 0.14, z.torso);
    z.head = z.add(GEO.gHead, skin, 'head', 0, 1.6, 0.16);
    z.jaw = z.add(GEO.gJaw, MAT.gore, null, 0, -0.19, 0.05, z.head);
    for (const sx of [-0.08, 0.08]) z.add(GEO.eye, MAT.eyeRed, null, sx, 0.03, 0.155, z.head);
    z.armL = z.add(GEO.gArm, skin, 'body', -0.32, 1.4, 0.1);
    z.armR = z.add(GEO.gArm, skin, 'body', 0.32, 1.4, 0.1);
    z.add(GEO.gClaw, MAT.claw, null, 0, -0.7, 0, z.armL);
    z.add(GEO.gClaw, MAT.claw, null, 0, -0.7, 0, z.armR);
    z.legs = [z.add(GEO.gLeg, pants, 'body', -0.14, 0.82, 0), z.add(GEO.gLeg, pants, 'body', 0.14, 0.82, 0)];
    z.arms = [z.armL, z.armR];
  },
  mutant(z) {
    // a ghoul's frame stretched thin, wired with glowing tubes, one arm grown into a bone blade
    const skin = pick(MAT.mutantSkin);
    z.torso = z.add(GEO.gTorso, MAT.labRag, 'body', 0, 1.12, 0);
    z.torso.rotation.x = 0.32;
    z.torso.scale.set(0.82, 1, 0.9);
    z.add(GEO.gRibs, MAT.acid, null, 0, 0.02, 0.15, z.torso);
    z.add(GEO.cSpike, MAT.acid, null, -0.12, 0.2, -0.16, z.torso);
    z.add(GEO.cSpike, MAT.acid, null, 0.12, 0.2, -0.16, z.torso);
    z.head = z.add(GEO.gHead, skin, 'head', 0, 1.6, 0.16);
    z.jaw = z.add(GEO.gJaw, MAT.gore, null, 0, -0.19, 0.05, z.head);
    for (const sx of [-0.08, 0.08]) z.add(GEO.eye, MAT.eyeGreen, null, sx, 0.03, 0.155, z.head);
    z.add(GEO.stain, MAT.acid, null, 0, 0.17, 0, z.head);
    z.armL = z.add(GEO.gArm, skin, 'body', -0.3, 1.4, 0.1);
    z.armR = z.add(GEO.gArm, skin, 'body', 0.3, 1.4, 0.1);
    z.add(GEO.gClaw, MAT.claw, null, 0, -0.7, 0, z.armL);
    const blade = z.add(GEO.gArm, MAT.bone, null, 0, -0.62, 0.02, z.armR);
    blade.scale.set(0.5, 0.9, 1.3);
    z.legs = [z.add(GEO.gLeg, MAT.pants[0], 'body', -0.13, 0.82, 0), z.add(GEO.gLeg, MAT.pants[0], 'body', 0.13, 0.82, 0)];
    z.arms = [z.armL, z.armR];
  },
  crawler(z) {
    const skin = pick(MAT.crawlerSkin);
    z.torso = z.add(GEO.cBody, skin, 'body', 0, 0.5, 0);
    for (let i = 0; i < 3; i++) z.add(GEO.cSpike, MAT.bone, null, 0, 0.22, -0.3 + i * 0.3, z.torso);
    z.head = z.add(GEO.cHead, skin, 'head', 0, 0.56, 0.62);
    z.jaw = z.add(GEO.cJaw, MAT.gore, null, 0, -0.17, 0.06, z.head);
    for (const [sx, sy] of [[-0.1, 0.06], [0.1, 0.06], [-0.05, -0.02], [0.05, -0.02]]) z.add(GEO.eye, MAT.eyeGreen, null, sx, sy, 0.185, z.head);
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const leg = z.add(GEO.cLeg, skin, 'body', sx * 0.3, 0.5, sz * 0.32);
      leg.rotation.z = sx * 0.55;
      leg.userData.splay = sx * 0.55;
      z.legs.push(leg);
    }
    z.arms = [z.legs[0], z.legs[1]];
  },
  brute(z) {
    const skin = pick(MAT.bruteSkin);
    z.torso = z.add(GEO.bTorso, skin, 'body', 0, 1.2, 0);
    z.torso.rotation.x = 0.15;
    z.add(GEO.bBelly, skin, 'body', 0, 0.82, 0.04);
    z.add(GEO.stain, MAT.gore, null, 0.1, 0.05, 0.26, z.torso);
    z.head = z.add(GEO.bHead, skin, 'head', 0, 1.7, 0.12);
    z.jaw = z.add(GEO.gJaw, MAT.gore, null, 0, -0.19, 0.05, z.head);
    for (const sx of [-0.08, 0.08]) z.add(GEO.eye, MAT.eyeOrange, null, sx, 0.03, 0.155, z.head);
    for (const sx of [-1, 1]) { const h = z.add(GEO.bHorn, MAT.bone, null, sx * 0.14, 0.22, 0, z.head); h.rotation.z = -sx * 0.5; }
    z.armL = z.add(GEO.bArm, skin, 'body', -0.58, 1.5, 0);
    z.armR = z.add(GEO.bArm, skin, 'body', 0.58, 1.5, 0);
    z.add(GEO.bFist, skin, null, 0, -0.86, 0, z.armL);
    z.add(GEO.bFist, skin, null, 0, -0.86, 0, z.armR);
    z.add(GEO.bPlate, MAT.iron, 'body', -0.52, 1.62, 0);
    z.add(GEO.bPlate, MAT.iron, 'body', 0.52, 1.62, 0);
    z.legs = [z.add(GEO.bLeg, MAT.pants[0], 'body', -0.22, 0.78, 0), z.add(GEO.bLeg, MAT.pants[0], 'body', 0.22, 0.78, 0)];
    z.arms = [z.armL, z.armR];
  },
  boss(z) {
    const hide = lam(0x3a2630), plate = MAT.iron, glow = basic(0xff2a1a), bone = MAT.bone;
    z.torso = z.add(GEO.bTorso, hide, 'body', 0, 1.2, 0); z.torso.rotation.x = 0.12; z.torso.scale.set(1.35, 1.4, 1.3);
    const belly = z.add(GEO.bBelly, hide, 'body', 0, 0.82, 0.06); belly.scale.set(1.3, 1.2, 1.25);
    z.add(GEO.stain, glow, null, 0, 0.1, 0.3, z.torso);
    const chest = z.add(GEO.bPlate, plate, 'body', 0, 0.2, 0.22, z.torso); chest.scale.set(2.2, 3.0, 1.4);
    z.head = z.add(GEO.bHead, hide, 'head', 0, 1.78, 0.12); z.head.scale.set(1.25, 1.25, 1.25);
    z.jaw = z.add(GEO.gJaw, MAT.gore, null, 0, -0.2, 0.06, z.head);
    for (const sx of [-0.08, 0.08]) z.add(GEO.eye, glow, null, sx, 0.03, 0.17, z.head);
    for (const sx of [-1, 1]) { const h = z.add(GEO.bHorn, bone, null, sx * 0.17, 0.26, 0, z.head); h.rotation.z = -sx * 0.6; h.scale.set(1.5, 1.8, 1.5); }
    z.armL = z.add(GEO.bArm, hide, 'body', -0.72, 1.55, 0); z.armL.scale.set(1.4, 1.35, 1.4);
    z.armR = z.add(GEO.bArm, hide, 'body', 0.72, 1.55, 0); z.armR.scale.set(1.4, 1.35, 1.4);
    const fl = z.add(GEO.bFist, plate, null, 0, -0.86, 0, z.armL); fl.scale.set(1.6, 1.6, 1.6);
    const fr = z.add(GEO.bFist, plate, null, 0, -0.86, 0, z.armR); fr.scale.set(1.6, 1.6, 1.6);
    z.add(GEO.bPlate, plate, 'body', -0.62, 1.72, 0); z.add(GEO.bPlate, plate, 'body', 0.62, 1.72, 0);
    z.legs = [z.add(GEO.bLeg, plate, 'body', -0.28, 0.78, 0), z.add(GEO.bLeg, plate, 'body', 0.28, 0.78, 0)];
    z.legs[0].scale.set(1.3, 1, 1.3); z.legs[1].scale.set(1.3, 1, 1.3);
    z.arms = [z.armL, z.armR];
  },
};

// Stepped pose update. Called ~9 times a second per enemy.
function pose(z) {
  const g = z.group, type = z.rig, s = Math.sin(z.phase), jit = () => Math.random() - 0.5;
  g.rotation.y = z.yaw;

  if (z.state === 'rising') {
    const k = Math.min(z.t / z.def.rise, 1);
    g.position.y = -2.2 * z.scale * (1 - k) * (1 - k);
    if (type !== 'crawler') for (const a of z.arms) a.rotation.x = -2.6 + jit() * 0.5;   // clawing out of the pit
    return;
  }

  if (z.state === 'dying') {
    const k = Math.min(z.t / 0.5, 1);
    if (type === 'crawler') { g.rotation.z = k * Math.PI; g.position.y = 0.3 * k; }
    else { g.rotation.x = -z.fallDir * k * Math.PI / 2; g.position.y = (type === 'brute' ? 0.3 : 0.16) * k; }
    if (z.t < 1.6) for (const l of z.legs) l.rotation.x = jit() * 0.9;   // death twitches
    if (z.t > z.corpseT) g.position.y -= (z.t - z.corpseT) * 0.5;
    return;
  }
  g.position.y = 0;

  if (z.state === 'attack') {
    const k = z.t / z.def.attackDur, hit = z.def.hitAt / z.def.attackDur;
    if (type === 'ghoul') {
      const sw = k < hit ? k / hit : Math.max(0, 1 - (k - hit) * 2);
      z.armL.rotation.x = -1.2 - sw * 1.4; z.armR.rotation.x = -1.5 - sw * 1.1;
      z.torso.rotation.x = 0.32 + sw * 0.35;
    } else if (type === 'crawler') {
      const sw = k < hit ? k / hit : Math.max(0, 1 - (k - hit) * 2);
      z.head.rotation.x = -sw * 0.7; z.jaw.rotation.x = sw * 0.9;
      z.legs[0].rotation.x = z.legs[1].rotation.x = -sw * 1.4;
    } else {
      // overhead double-fist smash: wind up, then slam
      const a = k < hit ? -3.0 * Math.min(1, k / (hit * 0.8)) : -3.0 + Math.min(1, (k - hit) * 6) * 2.4;
      z.armL.rotation.x = z.armR.rotation.x = a;
      z.torso.rotation.x = k < hit ? -0.1 : 0.5;
    }
    return;
  }

  // walking
  if (type === 'ghoul') {
    z.legs[0].rotation.x = s * 0.75; z.legs[1].rotation.x = -s * 0.75;
    z.armL.rotation.x = -1.3 + s * 0.3; z.armR.rotation.x = -0.95 - s * 0.35;
    z.torso.rotation.x = 0.32 + Math.abs(s) * 0.08; z.torso.rotation.z = s * 0.09;
    z.head.rotation.set(jit() * 0.25, jit() * 0.6, jit() * 0.4);
    z.jaw.rotation.x = 0.15 + Math.random() * 0.55;
  } else if (type === 'crawler') {
    z.legs.forEach((l, i) => { l.rotation.x = (i % 3 === 0 ? 1 : -1) * s * 1.0; l.rotation.z = l.userData.splay + jit() * 0.15; });
    z.torso.rotation.z = s * 0.12;
    z.head.rotation.set(jit() * 0.3, jit() * 0.7, 0);
    z.jaw.rotation.x = Math.random() * 0.7;
  } else {
    z.legs[0].rotation.x = s * 0.5; z.legs[1].rotation.x = -s * 0.5;
    z.armL.rotation.x = -0.25 - s * 0.45; z.armR.rotation.x = -0.25 + s * 0.45;
    z.armL.rotation.z = -0.22; z.armR.rotation.z = 0.22;
    z.torso.rotation.x = 0.15; z.torso.rotation.z = s * 0.08;
    z.head.rotation.set(0, jit() * 0.3, 0);
    z.jaw.rotation.x = 0.1 + Math.random() * 0.3;
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
    this.maxAlive = 10;
    this.brutesLeft = 0;
    this.boss = null;
    this.bossWave = false;
  }

  reset() {
    for (const z of this.zombies) this.game.scene.remove(z.group);
    this.zombies.length = 0;
    this.hitMeshes.length = 0;
    this.round = 0;
    this.toSpawn = 0;
    this.phase = 'intermission';
    this.phaseT = 3.5;
    this.boss = null;
    this.bossWave = false;
  }

  get alive() { return this.zombies.reduce((n, z) => n + (z.dead ? 0 : 1), 0); }
  get remaining() { return this.toSpawn + this.alive; }

  healthFor(round) {
    let hp = 120 + 60 * (Math.min(round, 10) - 1);
    for (let r = 10; r < round; r++) hp *= 1.1;
    return Math.round(hp);
  }
  // Rooms are small, so early waves are modest. Once the lab opens (round 10+) there are far more.
  countFor(round) { return Math.min(Math.round((6 + 3 * (round - 1)) * (round >= LAB_ROOM ? 1.5 : 1)), 110); }
  maxAliveFor(round) { return round >= LAB_ROOM ? 30 : Math.min(8 + 2 * round, 22); }
  // Tuned against the player: slower than a gun-sprint early on, but only the knife outruns crawlers.
  speedFor(round) { return Math.min(1.15 + 0.2 * round, 3.2); }
  bossHP(round) { return 7000 + 3000 * Math.max(0, round - LAB_ROOM); }

  startRound() {
    this.round++;
    this.toSpawn = this.countFor(this.round);
    this.maxAlive = this.maxAliveFor(this.round);
    this.brutesLeft = this.round >= 5 ? 1 + Math.floor((this.round - 5) / 3) : 0;
    this.bossWave = this.round >= LAB_ROOM && (this.round === LAB_ROOM || (this.round - LAB_ROOM) % 5 === 0);
    this.phase = 'active';
    this.spawnT = 1.2;
    this.game.onRoundStart(this.round);
    if (this.bossWave) { this.toSpawn = Math.min(this.toSpawn, 12); this.spawnBoss(); }
  }

  spawnBoss() {
    const { world, player } = this.game;
    const labs = world.spawns.filter(s => s.room === LAB_ROOM);
    const spots = (labs.length ? labs : world.spawns).slice().sort((a, b) =>
      Math.hypot(b.x - player.pos.x, b.z - player.pos.z) - Math.hypot(a.x - player.pos.x, a.z - player.pos.z));
    const s = spots[0] || { x: player.pos.x, z: player.pos.z };
    const z = new Zombie('boss', s.x, s.z, this.bossHP(this.round), Math.min(this.speedFor(this.round) * ENEMY_TYPES.boss.speed, 2.0));
    this.zombies.push(z);
    this.hitMeshes.push(...z.parts);
    this.game.scene.add(z.group);
    this.boss = z;
    this.game.audio.roar();
    this.game.onBossSpawn();
  }

  pickType() {
    const r = this.round;
    if (this.brutesLeft > 0 && Math.random() < 0.12) { this.brutesLeft--; return 'brute'; }
    if (r >= LAB_ROOM && Math.random() < 0.3) return 'mutant';
    if (r >= 3 && Math.random() < Math.min(0.1 + 0.03 * r, 0.35)) return 'crawler';
    return 'ghoul';
  }

  spawn(type = this.pickType(), at = null) {
    const { world, player, audio } = this.game;
    let spots = world.spawnPoints(player.pos.x, player.pos.z);
    if (type === 'mutant') {   // mutants come out of the lab vents when they can
      const vents = spots.filter(p => p.room === LAB_ROOM);
      if (vents.length) spots = vents;
    }
    const s = at || pick(spots);
    const def = ENEMY_TYPES[type];
    const speed = Math.min(this.speedFor(this.round) * def.speed * rnd(0.8, 1.15), type === 'crawler' ? 5.4 : type === 'mutant' ? 4.6 : 3.6);
    const z = new Zombie(type, s.x + rnd(-0.6, 0.6), s.z + rnd(-0.6, 0.6), Math.round(this.healthFor(this.round) * def.hp), speed);
    this.zombies.push(z);
    this.hitMeshes.push(...z.parts);
    this.game.scene.add(z.group);
    this.toSpawn--;
    if (type === 'brute') audio.roar();
    else if (type === 'crawler' || type === 'mutant') audio.screech();
    return z;
  }

  // After a door seals, anything left on the far side can never reach the player. Pull those
  // enemies out and put them back in the queue so the wave can still be finished.
  requeueStranded() {
    const { world, player, scene } = this.game;
    world.computeFlow(player.pos.x, player.pos.z);
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      if (z.def.boss || world.reachable(z.x, z.z)) continue;
      if (!z.dead) {
        this.toSpawn++;
        if (z.type === 'brute') this.brutesLeft++;
        for (const p of z.parts) { const k = this.hitMeshes.indexOf(p); if (k >= 0) this.hitMeshes.splice(k, 1); }
      }
      scene.remove(z.group);
      this.zombies.splice(i, 1);
    }
  }

  // Returns true if the hit killed the enemy.
  damage(z, amount) {
    if (z.dead) return false;
    z.hp -= amount;
    if (z.hp > 0) {
      if (z.type !== 'brute' && !z.def.boss) z.stun = 0.14;
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
    if (z.def.boss) this.boss = null;
    return true;
  }

  update(dt) {
    const game = this.game, { world, player } = game;

    if (this.phase === 'intermission') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.startRound();
    } else if (this.phase === 'active') {
      this.spawnT -= dt;
      if (this.toSpawn > 0 && this.spawnT <= 0 && this.alive < this.maxAlive) {
        this.spawn();
        this.spawnT = Math.max(0.4, 2.2 - this.round * 0.16);
      }
      if (this.toSpawn <= 0 && this.alive === 0) {
        this.phase = 'intermission';
        this.phaseT = 7;
        game.onRoundEnd(this.round);
      }
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
          if (z.type === 'crawler') game.audio.screech(); else game.audio.groan(Math.max(0.04, 0.22 * (1 - dist / 22)));
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
          const d = Math.sqrt(d2), push = (min - d) * (o.type === 'brute' && z.type !== 'brute' ? 0.9 : 0.5) / d;
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
      z.phase += dt * z.speed * (z.type === 'crawler' ? 4.5 : z.type === 'brute' ? 2.6 : 3.4);
      if (step) pose(z);
    }
  }
}
