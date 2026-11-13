// The Stalker: the thing in the library. It cannot be killed and it cannot see. It hunts by sound,
// so crouching keeps you alive and firing a gun is the worst thing you can do.
import * as THREE from 'three';

const ANIM_FPS = 9;
const lam = c => new THREE.MeshLambertMaterial({ color: c });
const RADIUS = 0.45;

const SKIN = lam(0xb9b4a6), SKIN2 = lam(0xa49e90), DARK = lam(0x14110f), MOUTH = lam(0x2a0a0c), NAIL = lam(0x1b1718);

export class Stalker {
  constructor(game, x, z) {
    this.game = game;
    this.x = x; this.z = z;
    this.yaw = 0;
    this.state = 'wander';      // wander | listen | hunt | stalk
    this.target = { x, z };
    this.heard = 0;             // how sure it is about the last noise
    this.t = 0; this.animT = 0; this.phase = 0;
    this.lunge = 0;
    this.stuck = 0;
    this.speed = 1.5;
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    this._build();
    this.group.position.set(x, 0, z);
    game.scene.add(this.group);
  }

  _build() {
    const g = this.group;
    const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
    const box = (w, h, d, p = 0) => { const b = new THREE.BoxGeometry(w, h, d); if (p) b.translate(0, p * h, 0); return b; };

    // a long thin trunk, hunched forward
    const t = this.torso = add(box(0.5, 1.0, 0.34, 0.5), SKIN, 0, 1.25, 0);
    t.rotation.x = 0.38;
    add(box(0.52, 0.3, 0.36), SKIN2, 0, 1.1, 0);
    for (let i = 0; i < 4; i++) add(box(0.46, 0.04, 0.03), SKIN2, 0, 0.3 + i * 0.17, 0.17, t);   // ribs
    add(box(0.34, 0.36, 0.26), SKIN2, 0, 1.0, 0);                                                // hips

    // head: narrow, eyeless, mouth too wide
    const h = this.head = add(box(0.26, 0.42, 0.3, 0.5), SKIN, 0, 1.02, 0.02, t);
    add(box(0.2, 0.06, 0.02), DARK, 0, 0.26, 0.152, h);
    add(box(0.07, 0.1, 0.02), DARK, -0.06, 0.2, 0.151, h);
    add(box(0.07, 0.1, 0.02), DARK, 0.06, 0.2, 0.151, h);
    this.jaw = add(box(0.22, 0.22, 0.26, -0.5), SKIN, 0, 0.1, 0.04, h);
    add(box(0.19, 0.02, 0.02), MOUTH, 0, -0.1, 0.12, this.jaw);
    for (let i = 0; i < 7; i++) { add(box(0.018, 0.05, 0.02), lam(0xd8d0bc), -0.08 + i * 0.027, 0.06, 0.136, h); add(box(0.018, 0.05, 0.02), lam(0xd8d0bc), -0.08 + i * 0.027, -0.05, 0.12, this.jaw); }
    add(box(0.12, 0.3, 0.12), SKIN2, 0, 0.92, -0.02, t);   // neck

    // absurdly long arms that drag near the floor
    this.arms = [];
    for (const sx of [-1, 1]) {
      const upper = add(box(0.12, 0.72, 0.12, -0.5), SKIN, sx * 0.3, 0.92, 0.02, t);
      const lower = add(box(0.1, 0.78, 0.1, -0.5), SKIN2, 0, -0.72, 0, upper);
      const hand = add(box(0.13, 0.2, 0.09), SKIN, 0, -0.84, 0, lower);
      for (let i = 0; i < 4; i++) { const f = add(box(0.022, 0.34, 0.022, -0.5), NAIL, (i - 1.5) * 0.034, -0.08, 0.01, hand); f.rotation.x = -0.18; }
      upper.userData.lower = lower;
      this.arms.push(upper);
    }
    // long legs
    this.legs = [];
    for (const sx of [-1, 1]) {
      const upper = add(box(0.15, 0.62, 0.15, -0.5), SKIN, sx * 0.13, 1.0, 0);
      const lower = add(box(0.12, 0.6, 0.12, -0.5), SKIN2, 0, -0.62, 0, upper);
      add(box(0.16, 0.08, 0.34), SKIN, 0, -0.62, 0.08, lower);
      upper.userData.lower = lower;
      this.legs.push(upper);
    }
    g.scale.setScalar(1.08);
  }

  // Something made a noise. `loud` is roughly metres it carries.
  hear(x, z, loud) {
    const d = Math.hypot(x - this.x, z - this.z);
    if (d > loud) return;
    const sure = 1 - d / loud;
    if (sure < this.heard * 0.7 && this.state === 'hunt') return;
    this.heard = Math.max(this.heard, sure);
    this.target.x = x + (Math.random() - 0.5) * 1.5;
    this.target.z = z + (Math.random() - 0.5) * 1.5;
    if (this.state !== 'stalk') this.state = sure > 0.45 ? 'hunt' : 'listen';
  }

  update(dt, player) {
    this.t += dt;
    const g = this.game;
    // the player's own noise, unless they are hidden or crouching dead still
    if (!g.hidden && player.noise > 0.22) this.hear(player.pos.x, player.pos.z, 6 + player.noise * 13);

    this.heard = Math.max(0, this.heard - dt * 0.07);
    if (this.heard <= 0.02 && this.state !== 'wander' && this.state !== 'stalk') this.state = 'wander';

    let tx = this.target.x, tz = this.target.z;
    let speed = this.state === 'hunt' ? 2.5 : this.state === 'listen' ? 1.3 : 0.75;

    if (this.state === 'stalk') {
      // circling the thing you are hiding in
      const h = g.hidden;
      if (!h) { this.state = 'listen'; }
      else {
        const a = this.t * 0.9;
        tx = h.x + Math.cos(a) * 2.2; tz = h.z + Math.sin(a) * 2.2;
        speed = 1.1;
      }
    } else if (this.state === 'wander') {
      const d = Math.hypot(tx - this.x, tz - this.z);
      if (d < 1.4 || this.stuck > 1.2) { const s = g.world.spawns[(Math.random() * g.world.spawns.length) | 0]; if (s) { this.target.x = s.x; this.target.z = s.z; } this.stuck = 0; }
    }

    // steer, sliding along whatever it walks into
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz) || 1;
    const before = { x: this.x, z: this.z };
    const p = { x: this.x + (dx / d) * speed * dt, z: this.z + (dz / d) * speed * dt };
    g.world.collideCircle(p, RADIUS);
    this.x = p.x; this.z = p.z;
    const moved = Math.hypot(this.x - before.x, this.z - before.z);
    this.stuck = moved < speed * dt * 0.35 ? this.stuck + dt : 0;
    if (this.stuck > 0.5) {   // shoulder off a shelf and try round it
      const side = (Math.floor(this.t * 0.7) % 2 ? 1 : -1);
      const q = { x: this.x + (-dz / d) * side * speed * dt * 1.4, z: this.z + (dx / d) * side * speed * dt * 1.4 };
      g.world.collideCircle(q, RADIUS); this.x = q.x; this.z = q.z;
    }

    const want = Math.atan2(-(tx - this.x), -(tz - this.z));
    let diff = ((want - this.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    this.yaw += diff * Math.min(1, dt * 4);
    this.group.position.set(this.x, g.world.heightAt ? g.world.heightAt(this.x, this.z) : 0, this.z);
    this.group.rotation.y = this.yaw;

    // caught?
    const pd = Math.hypot(player.pos.x - this.x, player.pos.z - this.z);
    if (!g.hidden && pd < 1.5 && this.state !== 'stalk') { g.caughtByStalker(); return; }
    // it noses around a hiding spot it saw you reach
    if (g.hidden && this.state !== 'stalk' && Math.hypot(g.hidden.x - this.x, g.hidden.z - this.z) < 4.5 && this.heard > 0.25) {
      this.state = 'stalk';
      g.stalkerAtTheDoor();
    }

    this.animT += dt;
    if (this.animT >= 1 / ANIM_FPS) { this.animT = 0; this.phase += 0.9 * (speed / 1.6); this._pose(speed); }
  }

  _pose(speed) {
    const s = Math.sin(this.phase), c = Math.cos(this.phase), jit = () => (Math.random() - 0.5);
    this.legs[0].rotation.x = s * 0.6; this.legs[1].rotation.x = -s * 0.6;
    this.legs[0].userData.lower.rotation.x = Math.max(0, c) * 0.7;
    this.legs[1].userData.lower.rotation.x = Math.max(0, -c) * 0.7;
    const reach = this.state === 'hunt' ? -1.5 : -0.3;
    this.arms[0].rotation.x = reach + s * 0.35 + jit() * 0.2;
    this.arms[1].rotation.x = reach - s * 0.35 + jit() * 0.2;
    this.arms[0].rotation.z = -0.22; this.arms[1].rotation.z = 0.22;
    this.arms[0].userData.lower.rotation.x = -0.4 + jit() * 0.3;
    this.arms[1].userData.lower.rotation.x = -0.4 + jit() * 0.3;
    this.torso.rotation.x = 0.38 + Math.abs(s) * 0.07;
    this.torso.rotation.z = s * 0.05;
    // the head sweeps about, listening
    this.head.rotation.set(jit() * 0.3, Math.sin(this.t * 1.3) * 0.7 + jit() * 0.3, jit() * 0.25);
    this.jaw.rotation.x = this.state === 'hunt' ? 0.5 + Math.random() * 0.5 : Math.random() * 0.25;
  }

  dispose() { this.group.parent && this.group.parent.remove(this.group); }
}

// The face it shows you, drawn once and reused for the jumpscare.
export function stalkerFaceDataURL() {
  const c = document.createElement('canvas'); c.width = 384; c.height = 384;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0908'; g.fillRect(0, 0, 384, 384);
  g.fillStyle = '#b9b4a6';
  g.beginPath(); g.ellipse(192, 200, 96, 164, 0, 0, 6.3); g.fill();
  g.fillStyle = '#9a9488'; g.beginPath(); g.ellipse(192, 120, 72, 70, 0, 0, 6.3); g.fill();
  g.fillStyle = '#070606';
  g.beginPath(); g.ellipse(150, 150, 26, 44, 0.1, 0, 6.3); g.fill();
  g.beginPath(); g.ellipse(234, 150, 26, 44, -0.1, 0, 6.3); g.fill();
  g.fillStyle = '#1b0406';
  g.beginPath(); g.ellipse(192, 286, 62, 76, 0, 0, 6.3); g.fill();
  g.fillStyle = '#ded6c2';
  for (let i = 0; i < 9; i++) { g.fillRect(136 + i * 13, 222, 9, 36); g.fillRect(136 + i * 13, 322, 9, 34); }
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3;
  for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo(96 + i * 14, 60); g.lineTo(104 + i * 14, 120); g.stroke(); }
  return c.toDataURL();
}
