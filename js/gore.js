// Bullet effects and gore: tracers, sparks, blood spray, flying gibs, blood decals and pools.
import * as THREE from 'three';
import { canvasTexture } from './models.js';
import { WALL_H } from './world.js';

const BLOOD = [0x8a0a12, 0x6a0509, 0xa0141a, 0x52040a];
const FLESH = [0x8a0a12, 0x9a3a3a, 0x6a0509, 0xd8ceb0, 0x7a2a2a];
const GRAV = 14;
const tmpN = new THREE.Vector3();

function splatTexture(seed) {
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 233280 + 12345) % 2147483647; return (s % 10000) / 10000; };
  return canvasTexture(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(64, 64, 26 + rnd() * 10, 0, 6.3); g.fill();
    for (let i = 0; i < 16; i++) {
      const a = rnd() * 6.28, d = 18 + rnd() * 34, r = 4 + rnd() * 12;
      g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, 6.3); g.fill();
    }
    for (let i = 0; i < 6; i++) {   // long streaks
      const a = rnd() * 6.28;
      g.save(); g.translate(64, 64); g.rotate(a); g.fillRect(20, -3, 26 + rnd() * 16, 5 + rnd() * 4); g.restore();
    }
  }, 4);
}

export class Effects {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.tracers = [];
    this.particles = [];
    this.decals = [];
    this.gibs = [];
    this.fountains = [];
    this.growing = [];
    this.ti = this.pi = this.di = this.gi = 0;

    const tGeo = new THREE.BoxGeometry(0.03, 0.03, 1);
    tGeo.translate(0, 0, 0.5);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
      m.visible = false;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }

    // Particles share a handful of materials so the pool stays cheap.
    this.pGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    this.bloodMats = BLOOD.map(c => new THREE.MeshBasicMaterial({ color: c }));
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    this.dustMat = new THREE.MeshBasicMaterial({ color: 0x6a6570 });
    for (let i = 0; i < 220; i++) {
      const m = new THREE.Mesh(this.pGeo, this.sparkMat);
      m.visible = false;
      scene.add(m);
      this.particles.push({ mesh: m, vel: new THREE.Vector3(), life: 0, blood: false });
    }

    // Decals: alpha-tested quads (no blending, very PSX) recycled oldest-first.
    const texes = [splatTexture(1), splatTexture(2), splatTexture(3)];
    this.decalMats = [];
    for (const tex of texes) for (const c of [0x6a0a0e, 0x4a0407, 0x7a0e12]) {
      this.decalMats.push(new THREE.MeshLambertMaterial({
        map: tex, color: c, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
    }
    const dGeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 130; i++) {
      const m = new THREE.Mesh(dGeo, this.decalMats[i % this.decalMats.length]);
      m.visible = false;
      scene.add(m);
      this.decals.push(m);
    }

    this.gibMats = FLESH.map(c => new THREE.MeshLambertMaterial({ color: c }));
    const gGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 44; i++) {
      const m = new THREE.Mesh(gGeo, this.gibMats[i % this.gibMats.length]);
      m.visible = false;
      scene.add(m);
      this.gibs.push({ mesh: m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, landed: false, size: 0.2, dripT: 0 });
    }

    this.flash = new THREE.PointLight(0xffc070, 0, 14, 2);
    scene.add(this.flash);
  }

  clear() {
    for (const d of this.decals) d.visible = false;
    for (const g of this.gibs) { g.mesh.visible = false; g.life = 0; }
    for (const p of this.particles) { p.mesh.visible = false; p.life = 0; }
    this.fountains.length = 0;
    this.growing.length = 0;
  }

  tracer(from, to) {
    const t = this.tracers[this.ti++ % this.tracers.length];
    t.mesh.position.copy(from);
    t.mesh.lookAt(to);
    t.mesh.scale.set(1, 1, from.distanceTo(to));
    t.mesh.visible = true;
    t.life = 0.06;
  }

  _particle(pos, mat, speed, dirBias, blood, up = 0.2) {
    const p = this.particles[this.pi++ % this.particles.length];
    p.mesh.position.copy(pos);
    p.mesh.material = mat;
    p.vel.set(Math.random() - 0.5, Math.random() - 0.5 + up, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.35 + Math.random()));
    if (dirBias) p.vel.addScaledVector(dirBias, speed * 0.7);
    p.mesh.visible = true;
    p.mesh.scale.setScalar(0.5 + Math.random() * 1.1);
    p.life = 0.5 + Math.random() * 0.5;
    p.blood = blood;
  }

  // Sparks/dust where a bullet hits stone.
  burst(pos, count = 3, speed = 2.2) {
    for (let i = 0; i < count; i++) this._particle(pos, i % 2 ? this.sparkMat : this.dustMat, speed, null, false);
  }

  blood(pos, count, speed, dirBias = null) {
    for (let i = 0; i < count; i++) this._particle(pos, this.bloodMats[(Math.random() * 4) | 0], speed, dirBias, true, 0.5);
  }

  muzzle(pos) {
    this.flash.position.copy(pos);
    this.flash.intensity = 70;
  }

  _decal() {
    const m = this.decals[this.di++ % this.decals.length];
    m.material = this.decalMats[(Math.random() * this.decalMats.length) | 0];
    m.visible = true;
    const gi = this.growing.findIndex(g => g.mesh === m);
    if (gi >= 0) this.growing.splice(gi, 1);
    return m;
  }

  floorDecal(x, z, size, growTo = 0) {
    if (this.world.blockedAt(x, z)) return;
    const m = this._decal();
    m.rotation.set(-Math.PI / 2, 0, Math.random() * 6.28);
    // tiny per-decal height offset stops overlapping splats z-fighting
    m.position.set(x, 0.015 + (this.di % 40) * 0.0006, z);
    m.scale.set(size, size, 1);
    if (growTo > size) this.growing.push({ mesh: m, target: growTo });
  }

  wallDecal(point, normal, size) {
    const m = this._decal();
    m.position.copy(point).addScaledVector(normal, 0.03);
    m.lookAt(tmpN.copy(point).add(normal));
    m.rotateZ(Math.random() * 6.28);
    m.scale.set(size, size, 1);
  }

  gib(pos, vel, size, matIndex = -1) {
    const g = this.gibs[this.gi++ % this.gibs.length];
    g.mesh.position.copy(pos);
    g.mesh.material = this.gibMats[matIndex >= 0 ? matIndex : (Math.random() * this.gibMats.length) | 0];
    g.mesh.scale.set(size * (0.7 + Math.random() * 0.6), size * (0.7 + Math.random() * 0.6), size * (0.7 + Math.random() * 0.6));
    g.mesh.visible = true;
    g.vel.copy(vel);
    g.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(18);
    g.life = 7 + Math.random() * 3;
    g.landed = false;
    g.size = size;
    g.dripT = 0;
  }

  // Burst of chunks in every direction, biased along `dir`.
  gibs_(pos, dir, count, speed, size) {
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random()));
      if (dir) v.addScaledVector(dir, speed * 0.5);
      this.gib(pos, v, size * (0.6 + Math.random() * 0.8));
    }
  }

  // Arterial spray from a point for `dur` seconds.
  fountain(pos, dur, strength = 4) {
    this.fountains.push({ pos: pos.clone(), t: dur, acc: 0, strength });
  }

  update(dt) {
    const world = this.world;
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.mesh.visible = false;
    }

    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vel.y -= GRAV * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const pos = p.mesh.position;
      if (pos.y < 0.04) {
        if (p.blood && Math.random() < 0.3) this.floorDecal(pos.x, pos.z, 0.25 + Math.random() * 0.45);
        p.life = 0;
      }
      if (p.life <= 0) p.mesh.visible = false;
    }

    for (const g of this.gibs) {
      if (g.life <= 0) continue;
      g.life -= dt;
      const pos = g.mesh.position;
      if (!g.landed || g.vel.lengthSq() > 0.05) {
        g.vel.y -= GRAV * dt;
        const px = pos.x, pz = pos.z;
        pos.addScaledVector(g.vel, dt);
        if (pos.y < WALL_H && world.blockedAt(pos.x, pos.z) && !world.blockedAt(px, pz)) {
          // bounce off walls and leave a smear where it hit
          tmpN.set(px - pos.x, 0, pz - pos.z).normalize();
          if (pos.y > 0.3 && Math.random() < 0.6) this.wallDecal(new THREE.Vector3(px, pos.y, pz), tmpN, 0.5 + Math.random() * 0.6);
          pos.x = px; pos.z = pz;
          g.vel.x *= -0.35; g.vel.z *= -0.35;
        }
        if (pos.y > WALL_H - 0.1) { pos.y = WALL_H - 0.1; g.vel.y = -Math.abs(g.vel.y) * 0.3; }
        g.mesh.rotation.x += g.spin.x * dt; g.mesh.rotation.y += g.spin.y * dt; g.mesh.rotation.z += g.spin.z * dt;
        const half = g.size * 0.5;
        if (pos.y < half) {
          pos.y = half;
          if (!g.landed || Math.abs(g.vel.y) > 2) this.floorDecal(pos.x, pos.z, 0.5 + Math.random() * 0.7);
          g.landed = true;
          g.vel.y *= -0.32; g.vel.x *= 0.55; g.vel.z *= 0.55;
          g.spin.multiplyScalar(0.4);
          if (Math.abs(g.vel.y) < 0.6) g.vel.y = 0;
        }
        g.dripT -= dt;
        if (g.dripT <= 0 && !g.landed) { g.dripT = 0.07; this._particle(pos, this.bloodMats[0], 0.8, null, true, 0); }
      }
      if (g.life < 1.5) g.mesh.visible = Math.sin(g.life * 30) > 0;   // blink out
      if (g.life <= 0) g.mesh.visible = false;
    }

    for (let i = this.fountains.length - 1; i >= 0; i--) {
      const f = this.fountains[i];
      f.t -= dt; f.acc += dt;
      while (f.acc > 0.03) {
        f.acc -= 0.03;
        this._particle(f.pos, this.bloodMats[(Math.random() * 4) | 0], f.strength * Math.min(1, f.t + 0.3), null, true, 1.6);
      }
      if (f.t <= 0) this.fountains.splice(i, 1);
    }

    for (let i = this.growing.length - 1; i >= 0; i--) {
      const g = this.growing[i];
      const s = g.mesh.scale.x + dt * 0.7;
      g.mesh.scale.set(s, s, 1);
      if (s >= g.target) this.growing.splice(i, 1);
    }

    this.flash.intensity *= Math.exp(-40 * dt);
    if (this.flash.intensity < 0.5) this.flash.intensity = 0;
  }
}
