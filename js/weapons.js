// Player weapon handling: view model, firing, reloading, recoil, and the knife.
import * as THREE from 'three';
import { WEAPONS, KNIFE_MODELS } from './data.js';
import { buildWeaponModel, buildHands, disposeWeaponModel, canvasTexture } from './models.js';
import { equippedSkin } from './save.js';

const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), V4 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const VM_FPS = 14;   // the view model animates in steps for a choppy, low-framerate feel

export class WeaponSystem {
  constructor(game) {
    this.game = game;
    this.slots = [];
    this.cur = 0;
    this.knife = { id: 'knife', mag: 0, reserve: 0 };
    this.knifeOut = false;
    this.fireT = 0;
    this.reloadT = 0; this.reloadDur = 1;
    this.switchT = 0;
    this.ads = 0;
    this.kick = 0;
    this.bloom = 0;
    this.meleeT = 0; this.meleeDur = 0.5; this.meleeKind = 'bash';
    this.sprintT = 0;
    this.reloadMult = 1;
    this.stepAcc = 0;
    this.forcePose = true;
    this.ray = new THREE.Raycaster();
    this.ray.far = 140;

    // The gun is drawn in its own scene on top of the world so it never clips into walls.
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
    this.vmScene.add(new THREE.AmbientLight(0xbfb4c8, 1.6));
    const key = new THREE.DirectionalLight(0xffb070, 2.6);
    key.position.set(-1.2, 2, 1.5);
    this.vmScene.add(key);
    const rim = new THREE.DirectionalLight(0x7040a0, 1.2);
    rim.position.set(2, 0.5, -1);
    this.vmScene.add(rim);
    this.holder = new THREE.Group();
    this.vmScene.add(this.holder);
    this.model = null;

    const flashTex = canvasTexture(64, 64, (g) => {
      g.fillStyle = '#ffe9a0';
      g.translate(32, 32);
      for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 4); g.fillRect(-5, -30, 10, 60); }
      g.fillStyle = '#ffffff'; g.fillRect(-10, -10, 20, 20);
    }, 4);
    this.flashMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24),
      new THREE.MeshBasicMaterial({ map: flashTex, alphaTest: 0.5, fog: false }));
    this.flashMesh.visible = false;
    this.holder.add(this.flashMesh);
    this.flashT = 0;
  }

  get slot() { return this.knifeOut ? this.knife : this.slots[this.cur]; }
  get def() { const s = this.slot; return s ? WEAPONS[s.id] : null; }
  get reloading() { return this.reloadT > 0; }
  // Name shown on the HUD: the gun's name, or whichever knife type is equipped.
  get displayName() { return this.knifeOut ? KNIFE_MODELS[this.knifeModel || 'shiv'] : this.def.name + (this.slot.up ? ' Mk II' : ''); }
  get knifeName() { const s = equippedSkin('knife'); return KNIFE_MODELS[(s && s.model) || 'shiv']; }

  reset() {
    this.slots = [];
    this.cur = 0;
    this.knifeOut = false;
    this.reloadMult = 1;
    this.fireT = this.reloadT = this.switchT = this.kick = this.bloom = this.ads = this.meleeT = this.sprintT = 0;
    this.give('pistol');
  }

  has(id) { return this.slots.some(s => s.id === id); }

  // Adds a gun (replacing the held one if both slots are full) and switches to it.
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
    for (const s of this.slots) s.reserve = WEAPONS[s.id].reserve;
  }
  // The lab's overclock station: the held gun does double damage for the rest of the run.
  overclock() {
    const s = this.slot;
    if (!s || this.knifeOut || s.up) return false;
    s.up = true;
    s.mag = WEAPONS[s.id].mag;
    s.reserve = WEAPONS[s.id].reserve;
    return true;
  }

  select(i, force = false) {
    if (!this.slots[i] || (i === this.cur && !this.knifeOut && !force && this.model)) return;
    this.cur = i;
    this.knifeOut = false;
    this._drew(0.38);
  }
  selectKnife() {
    if (this.knifeOut) return;
    this.knifeOut = true;
    this._drew(0.22);   // the knife comes out fast
    if (this.knifeModel === 'butterfly') this.switchT = this.switchDur = 0.42;   // time for the flip
  }
  // Cycle through gun 1, gun 2, knife.
  next(dir = 1) {
    const n = this.slots.length + 1;
    const at = this.knifeOut ? n - 1 : this.cur;
    const to = (at + dir + n) % n;
    if (to === n - 1) this.selectKnife(); else this.select(to);
  }
  _drew(time) {
    this.reloadT = 0;
    this.switchT = this.switchDur = time;
    this.fireT = Math.max(this.fireT, time * 0.8);
    this.meleeT = 0;
    this._swapModel();
    this.forcePose = true;
    this.game.audio.swap();
  }

  _swapModel() {
    if (this.model) { this.holder.remove(this.model); disposeWeaponModel(this.model); }
    const id = this.slot.id;
    this.model = buildWeaponModel(id, equippedSkin(id));
    this.holder.add(this.model);
    if (this.hands) { this.holder.remove(this.hands); disposeWeaponModel(this.hands); }
    this.hands = buildHands(id);
    this.holder.add(this.hands);
    const skin = equippedSkin(id);
    this.knifeModel = id === 'knife' ? ((skin && skin.model) || 'shiv') : null;
    this.flashMesh.position.copy(this.model.userData.muzzle);
    this.flashMesh.position.z -= 0.06;
    this.flashMesh.visible = false;
  }

  startReload() {
    const s = this.slot, def = this.def;
    if (!s || def.melee || this.reloadT > 0 || this.switchT > 0 || s.mag >= def.mag || s.reserve <= 0) return;
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

    const wantAds = !def.melee && input.mouse[2] && !this.reloading && this.switchT <= 0 && !game.player.sprinting;
    this.ads += ((wantAds ? 1 : 0) - this.ads) * (1 - Math.exp(-16 * dt));
    if (Math.abs(this.ads - (wantAds ? 1 : 0)) < 0.002) this.ads = wantAds ? 1 : 0;

    if (input.pressed.has('KeyR')) this.startReload();
    if (input.pressed.has('Digit1')) this.select(0);
    if (input.pressed.has('Digit2')) this.select(1);
    if (input.pressed.has('Digit3') || input.pressed.has('KeyE')) { if (this.knifeOut) this.select(this.cur, true); else this.selectKnife(); }
    if (input.pressed.has('KeyQ')) this.next();
    if (input.wheel) this.next(input.wheel > 0 ? 1 : -1);

    if (this.def.melee) {
      if (this.switchT <= 0 && this.meleeT <= 0) {
        if (input.mouse[0]) this.slash(false);
        else if (input.mousePressed[2]) this.slash(true);
      }
    } else {
      if (input.pressed.has('KeyV')) this.bash();
      const d = this.def, sl = this.slot;
      const trigger = d.auto ? input.mouse[0] : input.mousePressed[0];
      if (trigger && this.fireT <= 0 && this.switchT <= 0 && this.meleeT <= 0.15) {
        if (this.reloadT > 0) { /* wait for the reload */ }
        else if (sl.mag <= 0) {
          if (sl.reserve > 0) this.startReload();
          else if (input.mousePressed[0]) game.audio.empty();
        } else this.fire();
      }
      if (sl.mag <= 0 && sl.reserve > 0 && this.reloadT <= 0 && this.fireT <= 0 && this.switchT <= 0) this.startReload();
    }

    this.bloom *= Math.exp(-6 * dt);
    this.kick *= Math.exp(-14 * dt);
    this._animate(dt);
  }

  fire() {
    const game = this.game, s = this.slot, def = this.def, player = game.player;
    s.mag--;
    this.fireT = 60 / def.rpm;
    this.kick = 1;
    this.forcePose = true;
    game.audio.shot(def.sound);

    const cam = game.camera;
    const fwd = player.forward(V1);
    const right = V2.crossVectors(fwd, UP).normalize();
    const up = V3.crossVectors(right, fwd).normalize();
    const moving = Math.min(player.speed2d / 4, 1);
    const base = def.spread + (def.adsSpread - def.spread) * this.ads;
    const spread = base * (1 + moving * (1 - this.ads) * 0.8 + (player.onGround ? 0 : 1.5)) + this.bloom * (1 - this.ads * 0.6);
    const origin = cam.position;
    const muzzle = V4.copy(origin).addScaledVector(fwd, 0.7)
      .addScaledVector(right, 0.2 * (1 - this.ads)).addScaledVector(up, -0.13 * (1 - this.ads) - 0.03);

    const targets = game.shootTargets();
    const dir = new THREE.Vector3(), normal = new THREE.Vector3();
    for (let p = 0; p < def.pellets; p++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      dir.copy(fwd).addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      this.ray.set(origin, dir);
      const hits = this.ray.intersectObjects(targets, false);
      let end = null, pierced = 0, lastFlesh = -1;
      const struck = new Set();
      for (const h of hits) {
        const z = h.object.userData.zombie;
        if (z) {
          if (pierced >= def.pierce || struck.has(z) || z.dead) continue;
          struck.add(z);
          const gib = !!def.gibRange && h.distance < def.gibRange;
          game.onZombieHit(z, def.damage * (s.up ? 2 : 1) * Math.pow(0.7, pierced), h.object.userData.part === 'head', def.headMult, h.point, dir, { gib });
          pierced++;
          lastFlesh = h.distance;
          if (pierced >= def.pierce) end = h.point;
        } else {
          // first solid surface: stop here, and paint it if the bullet came out of someone nearby
          if (!end) { end = h.point; game.effects.burst(h.point, 3, 2.2); }
          if (lastFlesh >= 0 && h.distance - lastFlesh < 5 && h.face) {
            normal.copy(h.face.normal).transformDirection(h.object.matrixWorld);
            game.effects.wallDecal(h.point, normal, 0.6 + Math.random() * 0.9);
          }
          break;
        }
      }
      if (!end) end = dir.clone().multiplyScalar(120).add(origin);
      game.effects.tracer(muzzle, end);
    }

    game.effects.muzzle(muzzle);
    this.flashT = 0.05;
    this.flashMesh.visible = true;
    this.flashMesh.rotation.z = Math.random() * 6.28;
    this.flashMesh.scale.setScalar(def.pellets > 1 || def.damage > 300 ? 1.7 : 0.9 + Math.random() * 0.4);

    const recoil = def.recoil * (1 - this.ads * 0.35);
    player.recoilPitch += recoil;
    player.pitch += recoil * 0.25;
    player.yaw += (Math.random() - 0.5) * recoil * 0.5;
    this.bloom = Math.min(this.bloom + def.spread * 0.35, def.spread * 2.5);
  }

  // Everything in a cone in front of the player, nearest first.
  _meleeTargets(range, minDot, max) {
    const player = this.game.player, fwd = player.forward(V1), out = [];
    for (const z of this.game.zombies.zombies) {
      if (z.dead || z.state === 'rising') continue;
      const dx = z.x - player.pos.x, dz = z.z - player.pos.z, d = Math.hypot(dx, dz);
      if (d < range + z.def.radius && (dx * fwd.x + dz * fwd.z) / (d || 1) > minDot) out.push([d, z]);
    }
    out.sort((a, b) => a[0] - b[0]);
    return out.slice(0, max).map(e => e[1]);
  }

  // Knife attack: quick slash (hits a small arc) or a slow heavy stab.
  slash(heavy) {
    const game = this.game, def = this.def;
    this.meleeDur = this.meleeT = heavy ? 0.85 : 60 / def.rpm;
    this.meleeKind = heavy ? 'stab' : 'slash';
    this.forcePose = true;
    game.audio.slash();
    const fwd = game.player.forward(V1).clone();
    const targets = heavy ? this._meleeTargets(2.5, 0.75, 1) : this._meleeTargets(2.3, 0.4, 3);
    for (const z of targets) {
      const pt = new THREE.Vector3(z.x, Math.min(z.neckY, 1.5), z.z).addScaledVector(fwd, -z.def.radius);
      game.onZombieHit(z, heavy ? def.heavyDamage : def.damage, false, 1, pt, fwd, { melee: true, slice: true });
    }
    if (targets.length) game.player.shake = 0.02;
  }

  // Quick shove with the gun.
  bash() {
    if (this.meleeT > 0 || this.switchT > 0) return;
    const game = this.game;
    this.meleeDur = this.meleeT = 0.6;
    this.meleeKind = 'bash';
    this.forcePose = true;
    this.fireT = Math.max(this.fireT, 0.45);
    game.audio.melee();
    const fwd = game.player.forward(V1).clone();
    for (const z of this._meleeTargets(2.0, 0.5, 1)) {
      game.onZombieHit(z, 110, false, 1, new THREE.Vector3(z.x, Math.min(z.neckY, 1.4), z.z), fwd, { melee: true });
    }
  }

  _animate(dt) {
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flashMesh.visible = false;
    }
    const player = this.game.player;
    this.sprintT += ((player.sprinting ? 1 : 0) - this.sprintT) * (1 - Math.exp(-12 * dt));

    // Only re-pose the view model a few times a second (or right away on a shot/swing).
    this.stepAcc += dt;
    if (!this.forcePose && this.stepAcc < 1 / VM_FPS) return;
    this.stepAcc = 0;
    this.forcePose = false;

    const def = this.def, a = this.ads;
    const h = def.hip, d = def.ads;
    const bobAmt = (player.onGround ? Math.min(player.speed2d / 3, 1.8) : 0) * (1 - a * 0.9);
    let x = h[0] + (d[0] - h[0]) * a + Math.cos(player.bob) * 0.014 * bobAmt;
    let y = h[1] + (d[1] - h[1]) * a + Math.abs(Math.sin(player.bob)) * -0.018 * bobAmt;
    let z = h[2] + (d[2] - h[2]) * a;
    let rx = 0, ry = 0, rz = 0;

    if (def.melee) { rx += 0.3; ry += 0.55; rz += 0.25; }   // blade held up and angled in

    z += this.kick * 0.05 * (1 - a * 0.4);
    rx += this.kick * 0.09 * (1 - a * 0.6);

    if (this.reloadT > 0) {
      const k = Math.sin((1 - this.reloadT / this.reloadDur) * Math.PI);
      y -= k * 0.14; rx -= k * 0.7; rz += k * 0.5;
    }
    if (this.switchT > 0) {
      const k = this.switchT / this.switchDur;
      y -= k * 0.3; rx -= k * 0.8;
      if (this.knifeOut && this.knifeModel === 'butterfly') rz += k * Math.PI * 4;   // butterfly flourish on the draw
    }
    if (this.meleeT > 0) {
      const p = 1 - this.meleeT / this.meleeDur;   // 0 -> 1 through the swing
      if (this.meleeKind === 'slash') {
        const k = Math.min(1, p / 0.45);
        x += 0.12 - k * 0.42; ry += -0.9 + k * 2.1; rz += 0.6 - k * 0.4; z -= Math.sin(k * Math.PI) * 0.12;
      } else if (this.meleeKind === 'stab') {
        const k = p < 0.25 ? -p / 0.25 * 0.4 : Math.sin(Math.min(1, (p - 0.25) / 0.3) * Math.PI);
        z -= k * 0.34; x -= 0.12 * Math.abs(k); ry -= 0.5 * Math.abs(k); rx -= 0.25 * Math.abs(k);
      } else {
        const k = Math.sin(Math.min(1, p / 0.5) * Math.PI);
        z -= k * 0.25; ry += k * 0.9; x -= k * 0.12;
      }
    }
    ry += this.sprintT * (def.melee ? 0.15 : 0.35); rx -= this.sprintT * 0.12; y -= this.sprintT * 0.03;
    if (!player.onGround) y += Math.max(-0.05, Math.min(0.05, -player.vel.y * 0.006));

    this.holder.position.set(x, y, z);
    this.holder.rotation.set(rx, ry, rz);
    // hide the gun while looking through a scope
    this.holder.visible = !(def.scope && a > 0.85);
  }

  // Multiplier applied to the world camera's field of view.
  fovScale() {
    const def = this.def;
    return def ? 1 + (def.adsFov - 1) * this.ads : 1;
  }
  scoped() { const def = this.def; return !!(def && def.scope && this.ads > 0.85); }
}
