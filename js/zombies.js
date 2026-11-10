// Zombie entities plus the round/wave director for the Zombies mode.
import * as THREE from 'three';

const GEO = {
  torso: new THREE.BoxGeometry(0.52, 0.66, 0.28),
  head: new THREE.BoxGeometry(0.32, 0.32, 0.32),
  arm: new THREE.BoxGeometry(0.13, 0.6, 0.13),
  leg: new THREE.BoxGeometry(0.18, 0.82, 0.2),
  eye: new THREE.BoxGeometry(0.06, 0.04, 0.02),
};
GEO.arm.translate(0, -0.3, 0);   // pivot at the shoulder
GEO.leg.translate(0, -0.41, 0);  // pivot at the hip

const lam = c => new THREE.MeshLambertMaterial({ color: c });
const SKIN_MATS = [lam(0x6f8f5e), lam(0x7d8a70), lam(0x58785a), lam(0x8a9a7a)];
const SHIRT_MATS = [lam(0x7a1420), lam(0xd8d2c4), lam(0x1c1c22), lam(0x27408b), lam(0x6a4a1a), lam(0x3b0f4a)];
const PANTS_MATS = [lam(0x18181c), lam(0x2a2430), lam(0x3a2f22)];
const EYE_MAT = new THREE.MeshBasicMaterial({ color: 0xffd23c });

const pick = a => a[(Math.random() * a.length) | 0];
const RADIUS = 0.36;
const tmp = { x: 0, z: 0 };

class Zombie {
  constructor(x, z, hp, speed) {
    this.x = x; this.z = z;
    this.hp = hp; this.maxHp = hp;
    this.speed = speed;
    this.state = 'rising';
    this.t = 0;
    this.yaw = Math.random() * 6.28;
    this.phase = Math.random() * 6.28;
    this.attackDone = false;
    this.groanT = 2 + Math.random() * 6;
    this.dead = false;

    const g = this.group = new THREE.Group();
    const skin = pick(SKIN_MATS), shirt = pick(SHIRT_MATS), pants = pick(PANTS_MATS);
    const part = (geo, mat, kind, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.userData.zombie = this;
      m.userData.part = kind;
      g.add(m);
      return m;
    };
    this.torso = part(GEO.torso, shirt, 'body', 0, 1.15, 0);
    this.head = part(GEO.head, skin, 'head', 0, 1.66, 0.02);
    this.armL = part(GEO.arm, skin, 'body', -0.33, 1.42, 0);
    this.armR = part(GEO.arm, skin, 'body', 0.33, 1.42, 0);
    this.legL = part(GEO.leg, pants, 'body', -0.14, 0.82, 0);
    this.legR = part(GEO.leg, pants, 'body', 0.14, 0.82, 0);
    this.parts = [this.torso, this.head, this.armL, this.armR, this.legL, this.legR];
    for (const sx of [-0.08, 0.08]) {
      const e = new THREE.Mesh(GEO.eye, EYE_MAT);
      e.position.set(sx, 0.03, 0.165);
      this.head.add(e);
    }
    this.torso.rotation.x = 0.18;
    g.position.set(x, -1.9, z);
    g.rotation.y = this.yaw;
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
    this.maxAlive = 24;
  }

  reset() {
    for (const z of this.zombies) this.game.scene.remove(z.group);
    this.zombies.length = 0;
    this.hitMeshes.length = 0;
    this.round = 0;
    this.toSpawn = 0;
    this.phase = 'intermission';
    this.phaseT = 3.5;
  }

  get alive() { return this.zombies.reduce((n, z) => n + (z.dead ? 0 : 1), 0); }
  get remaining() { return this.toSpawn + this.alive; }

  healthFor(round) {
    let hp = 120 + 60 * (Math.min(round, 10) - 1);
    for (let r = 10; r < round; r++) hp *= 1.1;
    return Math.round(hp);
  }
  countFor(round) { return Math.min(6 + 4 * (round - 1), 90); }
  speedFor(round) { return Math.min(1.5 + 0.28 * round, 4.9); }

  startRound() {
    this.round++;
    this.toSpawn = this.countFor(this.round);
    this.phase = 'active';
    this.spawnT = 1.2;
    this.game.onRoundStart(this.round);
  }

  spawn() {
    const { world, player } = this.game;
    const spots = world.spawns;
    const far = spots.filter(s => Math.hypot(s.x - player.pos.x, s.z - player.pos.z) > 14);
    const s = pick(far.length ? far : spots);
    const base = this.speedFor(this.round);
    const speed = Math.min(base * (0.78 + Math.random() * 0.4), 5.3);
    const z = new Zombie(s.x + (Math.random() - 0.5) * 1.2, s.z + (Math.random() - 0.5) * 1.2, this.healthFor(this.round), speed);
    this.zombies.push(z);
    this.hitMeshes.push(...z.parts);
    this.game.scene.add(z.group);
    this.toSpawn--;
    return z;
  }

  // Returns true if the hit killed the zombie.
  damage(z, amount) {
    if (z.dead) return false;
    z.hp -= amount;
    if (z.hp > 0) return false;
    z.dead = true;
    z.state = 'dying';
    z.t = 0;
    for (const p of z.parts) {
      const i = this.hitMeshes.indexOf(p);
      if (i >= 0) this.hitMeshes.splice(i, 1);
    }
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
        this.spawnT = Math.max(0.35, 2.2 - this.round * 0.18);
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
      const z = zs[i];
      z.t += dt;
      const dxp = player.pos.x - z.x, dzp = player.pos.z - z.z;
      const dist = Math.hypot(dxp, dzp);

      if (z.state === 'rising') {
        const k = Math.min(z.t / 1.1, 1);
        z.group.position.set(z.x, -1.9 * (1 - k) * (1 - k), z.z);
        if (k >= 1) { z.state = 'chase'; z.t = 0; }
        continue;
      }
      if (z.state === 'dying') {
        const k = Math.min(z.t / 0.45, 1);
        z.group.rotation.x = -k * Math.PI / 2;
        z.group.position.y = z.t > 1.2 ? -(z.t - 1.2) * 0.6 : 0.15 * k;
        if (z.t > 2.4) { game.scene.remove(z.group); zs.splice(i, 1); }
        continue;
      }

      z.groanT -= dt;
      if (z.groanT <= 0) {
        z.groanT = 4 + Math.random() * 7;
        if (dist < 22) game.audio.groan(Math.max(0.04, 0.22 * (1 - dist / 22)));
      }

      if (z.state === 'attack') {
        if (!z.attackDone && z.t >= 0.38) {
          z.attackDone = true;
          game.audio.zombieSwing();
          if (dist < 1.9 && player.jumpHeight < 1.4) game.damagePlayer(30, z);
        }
        if (z.t >= 0.95) { z.state = 'chase'; z.t = 0; }
        const swing = Math.sin(Math.min(z.t / 0.5, 1) * Math.PI);
        z.armL.rotation.x = z.armR.rotation.x = -1.5 - swing * 0.9;
        z.yaw = Math.atan2(dxp, dzp);
        z.group.rotation.y = z.yaw;
        continue;
      }

      // chase
      if (dist < 1.3) {
        z.state = 'attack'; z.t = 0; z.attackDone = false;
        continue;
      }
      world.flowTarget(z.x, z.z, player.pos.x, player.pos.z, tmp);
      let dx = tmp.x - z.x, dz = tmp.z - z.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      z.x += dx * z.speed * dt;
      z.z += dz * z.speed * dt;

      // keep zombies from stacking inside each other
      for (let j = 0; j < zs.length; j++) {
        if (j === i) continue;
        const o = zs[j];
        if (o.dead || o.state === 'rising') continue;
        const ox = z.x - o.x, oz = z.z - o.z, d2 = ox * ox + oz * oz;
        if (d2 < 0.5 && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (0.707 - d) * 0.5 / d;
          z.x += ox * push; z.z += oz * push;
        }
      }
      tmp.x = z.x; tmp.z = z.z;
      world.collideCircle(tmp, RADIUS);
      z.x = tmp.x; z.z = tmp.z;

      // turn toward travel direction
      const want = Math.atan2(dx, dz);
      let diff = want - z.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      z.yaw += diff * Math.min(1, dt * 8);
      z.group.rotation.y = z.yaw;
      z.group.position.set(z.x, 0, z.z);

      z.phase += dt * z.speed * 3.2;
      const s = Math.sin(z.phase);
      z.legL.rotation.x = s * 0.7;
      z.legR.rotation.x = -s * 0.7;
      z.armL.rotation.x = -1.45 + s * 0.18;
      z.armR.rotation.x = -1.45 - s * 0.18;
      z.torso.rotation.z = s * 0.05;
      z.head.rotation.z = Math.sin(z.phase * 0.5) * 0.12;
    }
  }
}
