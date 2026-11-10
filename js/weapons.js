// Player weapon handling: view model, firing, reloading, recoil and bullet effects.
import * as THREE from 'three';
import { WEAPONS } from './data.js';
import { buildWeaponModel, disposeWeaponModel, canvasTexture } from './models.js';
import { equippedSkin } from './save.js';

const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), V4 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.particles = [];
    const tGeo = new THREE.BoxGeometry(0.018, 0.018, 1);
    tGeo.translate(0, 0, 0.5);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
    const pGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.visible = false;
      scene.add(m);
      this.particles.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
    }
    this.ti = 0; this.pi = 0;
    this.flash = new THREE.PointLight(0xffc070, 0, 14, 2);
    scene.add(this.flash);
  }

  tracer(from, to) {
    const t = this.tracers[this.ti++ % this.tracers.length];
    t.mesh.position.copy(from);
    t.mesh.lookAt(to);
    t.mesh.scale.set(1, 1, from.distanceTo(to));
    t.mesh.material.opacity = 0.8;
    t.mesh.visible = true;
    t.life = 0.07;
  }

  burst(pos, color, count, speed, dirBias = null) {
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.pi++ % this.particles.length];
      p.mesh.position.copy(pos);
      p.mesh.material.color.set(color);
      p.vel.set(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      if (dirBias) p.vel.addScaledVector(dirBias, speed * 0.6);
      p.mesh.visible = true;
      p.mesh.scale.setScalar(0.6 + Math.random());
      p.life = 0.35 + Math.random() * 0.3;
    }
  }

  muzzle(pos) {
    this.flash.position.copy(pos);
    this.flash.intensity = 60;
  }

  update(dt) {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.07) * 0.8;
      if (t.life <= 0) t.mesh.visible = false;
    }
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vel.y -= 12 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.03) { p.mesh.position.y = 0.03; p.vel.set(0, 0, 0); }
      if (p.life <= 0) p.mesh.visible = false;
    }
    this.flash.intensity *= Math.exp(-40 * dt);
    if (this.flash.intensity < 0.5) this.flash.intensity = 0;
  }
}

export class WeaponSystem {
  constructor(game) {
    this.game = game;
    this.slots = [];
    this.cur = 0;
    this.fireT = 0;
    this.reloadT = 0; this.reloadDur = 1;
    this.switchT = 0;
    this.ads = 0;
    this.kick = 0;
    this.bloom = 0;
    this.meleeT = 0;
    this.sprintT = 0;
    this.reloadMult = 1;
    this.ray = new THREE.Raycaster();
    this.ray.far = 140;

    // The gun is drawn in its own scene on top of the world so it never clips into walls.
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
    this.vmScene.add(new THREE.AmbientLight(0xfff0e0, 1.25));
    const key = new THREE.DirectionalLight(0xffe6c4, 2.2);
    key.position.set(-1.2, 2, 1.5);
    this.vmScene.add(key);
    const rim = new THREE.DirectionalLight(0xff4466, 0.8);
    rim.position.set(2, 0.5, -1);
    this.vmScene.add(rim);
    this.holder = new THREE.Group();
    this.vmScene.add(this.holder);
    this.model = null;

    const flashTex = canvasTexture(64, 64, (g, w, h) => {
      const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,230,1)');
      grad.addColorStop(0.35, 'rgba(255,190,80,0.85)');
      grad.addColorStop(1, 'rgba(255,120,20,0)');
      g.fillStyle = grad;
      g.translate(32, 32);
      for (let i = 0; i < 6; i++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(0, 0); g.lineTo(-7, -31); g.lineTo(7, -31); g.fill(); }
      g.beginPath(); g.arc(0, 0, 14, 0, 6.3); g.fill();
    });
    this.flashMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22),
      new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flashMesh.visible = false;
    this.holder.add(this.flashMesh);
    this.flashT = 0;
  }

  get slot() { return this.slots[this.cur]; }
  get def() { return this.slot ? WEAPONS[this.slot.id] : null; }
  get reloading() { return this.reloadT > 0; }

  reset() {
    this.slots = [];
    this.cur = 0;
    this.reloadMult = 1;
    this.fireT = this.reloadT = this.switchT = this.kick = this.bloom = this.ads = this.meleeT = 0;
    this.give('pistol');
  }

  has(id) { return this.slots.some(s => s.id === id); }

  // Adds a weapon (replacing the held one if both slots are full) and switches to it.
  give(id) {
    const def = WEAPONS[id];
    const existing = this.slots.findIndex(s => s.id === id);
    if (existing >= 0) {
      this.slots[existing].mag = def.mag;
      this.slots[existing].reserve = def.reserve;
      this.select(existing, true);
      return;
    }
    const s = { id, mag: def.mag, reserve: def.reserve };
    if (this.slots.length < 2) { this.slots.push(s); this.select(this.slots.length - 1, true); }
    else { this.slots[this.cur] = s; this.select(this.cur, true); }
  }

  refill(id) {
    const s = this.slots.find(x => x.id === id);
    if (s) s.reserve = WEAPONS[id].reserve;
  }
  maxAmmo() {
    for (const s of this.slots) { s.reserve = WEAPONS[s.id].reserve; }
  }

  select(i, force = false) {
    if (!this.slots[i] || (i === this.cur && !force && this.model)) return;
    this.cur = i;
    this.reloadT = 0;
    this.switchT = 0.38;
    this.fireT = Math.max(this.fireT, 0.3);
    this._swapModel();
    this.game.audio.swap();
  }
  next(dir = 1) {
    if (this.slots.length < 2) return;
    this.select((this.cur + dir + this.slots.length) % this.slots.length);
  }

  _swapModel() {
    if (this.model) { this.holder.remove(this.model); disposeWeaponModel(this.model); }
    this.model = buildWeaponModel(this.slot.id, equippedSkin(this.slot.id));
    this.holder.add(this.model);
    this.flashMesh.position.copy(this.model.userData.muzzle);
    this.flashMesh.position.z -= 0.06;
  }

  startReload() {
    const s = this.slot, def = this.def;
    if (!s || this.reloadT > 0 || this.switchT > 0 || s.mag >= def.mag || s.reserve <= 0) return;
    this.reloadDur = def.reload * this.reloadMult;
    this.reloadT = this.reloadDur;
    this.game.audio.reloadStart();
  }

  update(dt, input) {
    const game = this.game, s = this.slot, def = this.def;
    if (!s) return;
    this.fireT -= dt;
    this.meleeT -= dt;
    if (this.switchT > 0) this.switchT -= dt;

    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const take = Math.min(def.mag - s.mag, s.reserve);
        s.mag += take; s.reserve -= take;
        game.audio.reloadEnd();
      }
    }

    const wantAds = input.mouse[2] && !this.reloading && this.switchT <= 0 && !game.player.sprinting;
    this.ads += ((wantAds ? 1 : 0) - this.ads) * (1 - Math.exp(-16 * dt));
    if (Math.abs(this.ads - (wantAds ? 1 : 0)) < 0.002) this.ads = wantAds ? 1 : 0;

    if (input.pressed.has('KeyR')) this.startReload();
    if (input.pressed.has('Digit1')) this.select(0);
    if (input.pressed.has('Digit2')) this.select(1);
    if (input.pressed.has('KeyQ')) this.next();
    if (input.wheel) this.next(input.wheel > 0 ? 1 : -1);
    if (input.pressed.has('KeyV')) this.melee();

    const trigger = def.auto ? input.mouse[0] : input.mousePressed[0];
    if (trigger && this.fireT <= 0 && this.switchT <= 0 && this.meleeT <= 0.15) {
      if (this.reloadT > 0) { /* wait */ }
      else if (s.mag <= 0) {
        if (s.reserve > 0) this.startReload();
        else if (input.mousePressed[0]) game.audio.empty();
      } else this.fire();
    }
    if (s.mag <= 0 && s.reserve > 0 && this.reloadT <= 0 && this.fireT <= 0 && this.switchT <= 0) this.startReload();

    this.bloom *= Math.exp(-6 * dt);
    this.kick *= Math.exp(-14 * dt);
    this._animate(dt);
  }

  fire() {
    const game = this.game, s = this.slot, def = this.def, player = game.player;
    s.mag--;
    this.fireT = 60 / def.rpm;
    this.kick = 1;
    game.audio.shot(def.sound);

    const cam = game.camera;
    const fwd = player.forward(V1);
    const right = V2.crossVectors(fwd, UP).normalize();
    const up = V3.crossVectors(right, fwd).normalize();
    const moving = Math.min(player.speed2d / 6, 1);
    const base = def.spread + (def.adsSpread - def.spread) * this.ads;
    const spread = base * (1 + moving * (1 - this.ads) * 0.8 + (player.onGround ? 0 : 1.5)) + this.bloom * (1 - this.ads * 0.6);
    const origin = cam.position;
    const muzzle = V4.copy(origin).addScaledVector(fwd, 0.7)
      .addScaledVector(right, 0.2 * (1 - this.ads)).addScaledVector(up, -0.13 * (1 - this.ads) - 0.03);

    const targets = game.shootTargets();
    const dir = new THREE.Vector3();
    for (let p = 0; p < def.pellets; p++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      dir.copy(fwd).addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      this.ray.set(origin, dir);
      const hits = this.ray.intersectObjects(targets, false);
      let end = null, pierced = 0;
      const struck = new Set();
      for (const h of hits) {
        const z = h.object.userData.zombie;
        if (z) {
          if (struck.has(z) || z.dead) continue;
          struck.add(z);
          const falloff = Math.pow(0.7, pierced);
          game.onZombieHit(z, def.damage * falloff, h.object.userData.part === 'head', def.headMult, h.point, dir);
          pierced++;
          if (pierced >= def.pierce) { end = h.point; break; }
        } else {
          end = h.point;
          game.effects.burst(h.point, 0xffd9a0, 3, 2.2);
          break;
        }
      }
      if (!end) end = dir.clone().multiplyScalar(120).add(origin);
      game.effects.tracer(muzzle, end);
    }

    game.effects.muzzle(muzzle);
    this.flashT = 0.045;
    this.flashMesh.visible = true;
    this.flashMesh.rotation.z = Math.random() * 6.28;
    this.flashMesh.scale.setScalar(def.pellets > 1 || def.damage > 300 ? 1.6 : 0.9 + Math.random() * 0.4);

    const recoil = def.recoil * (1 - this.ads * 0.35);
    player.recoilPitch += recoil;
    player.pitch += recoil * 0.25;
    player.yaw += (Math.random() - 0.5) * recoil * 0.5;
    this.bloom = Math.min(this.bloom + def.spread * 0.35, def.spread * 2.5);
  }

  melee() {
    if (this.meleeT > 0 || this.switchT > 0) return;
    const game = this.game, player = game.player;
    this.meleeT = 0.55;
    this.fireT = Math.max(this.fireT, 0.4);
    game.audio.melee();
    const fwd = player.forward(V1);
    let best = null, bestD = 2.2;
    for (const z of game.zombies.zombies) {
      if (z.dead || z.state === 'rising') continue;
      const dx = z.x - player.pos.x, dz = z.z - player.pos.z, d = Math.hypot(dx, dz);
      if (d < bestD && (dx * fwd.x + dz * fwd.z) / (d || 1) > 0.5) { best = z; bestD = d; }
    }
    if (best) {
      const pt = new THREE.Vector3(best.x, 1.3, best.z);
      game.onZombieHit(best, 150, false, 1, pt, fwd, true);
    }
  }

  _animate(dt) {
    const def = this.def, player = this.game.player, a = this.ads;
    const h = def.hip, d = def.ads;
    const bobAmt = (player.onGround ? Math.min(player.speed2d / 4.6, 1.5) : 0) * (1 - a * 0.9);
    let x = h[0] + (d[0] - h[0]) * a + Math.cos(player.bob) * 0.012 * bobAmt;
    let y = h[1] + (d[1] - h[1]) * a + Math.abs(Math.sin(player.bob)) * -0.014 * bobAmt;
    let z = h[2] + (d[2] - h[2]) * a;
    let rx = 0, ry = 0, rz = 0;

    z += this.kick * 0.05 * (1 - a * 0.4);
    rx += this.kick * 0.09 * (1 - a * 0.6);

    if (this.reloadT > 0) {
      const k = Math.sin((1 - this.reloadT / this.reloadDur) * Math.PI);
      y -= k * 0.14; rx -= k * 0.7; rz += k * 0.5;
    }
    if (this.switchT > 0) {
      const k = this.switchT / 0.38;
      y -= k * 0.3; rx -= k * 0.8;
    }
    if (this.meleeT > 0) {
      const k = Math.sin(Math.min(1, (0.55 - this.meleeT) / 0.3) * Math.PI);
      z -= k * 0.25; ry += k * 0.9; x -= k * 0.12;
    }
    this.sprintT += ((player.sprinting ? 1 : 0) - this.sprintT) * (1 - Math.exp(-12 * dt));
    ry += this.sprintT * 0.35; rx -= this.sprintT * 0.12; y -= this.sprintT * 0.03;
    if (!player.onGround) y += Math.max(-0.05, Math.min(0.05, -player.vel.y * 0.006));

    this.holder.position.set(x, y, z);
    this.holder.rotation.set(rx, ry, rz);
    // hide the gun while looking through a scope
    this.holder.visible = !(def.scope && a > 0.85);

    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flashMesh.visible = false;
    }
  }

  // Multiplier applied to the world camera's field of view.
  fovScale() {
    const def = this.def;
    return def ? 1 + (def.adsFov - 1) * this.ads : 1;
  }
  scoped() { const def = this.def; return !!(def && def.scope && this.ads > 0.85); }
}
