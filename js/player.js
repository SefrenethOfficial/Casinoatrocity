// First-person controller: mouse look, walking, sprinting, jumping and health.
import * as THREE from 'three';

const EYE = 1.66, CROUCH_EYE = 0.95;
const RADIUS = 0.38;
// Deliberately slow. The weapon's mobility scales these; only the knife (1.75x) makes you quick.
const WALK = 3.0, SPRINT = 4.3, ADS_WALK = 1.8, CROUCH_WALK = 1.35;
const GRAVITY = 21, JUMP_V = 6.6;

export class Player {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;
    this.camera.rotation.order = 'YXZ';
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.recoilPitch = 0;
    this.jumpHeight = 0;
    this.onGround = true;
    this.maxHealth = 100;
    this.health = 100;
    this.sinceHit = 99;
    this.bob = 0;
    this.stepT = 0;
    this.sprinting = false;
    this.speed2d = 0;
    this.shake = 0;
    this.ground = 0;        // floor height under you (stairs, raised landings)
    this.crouch = 0;        // 0 standing, 1 fully crouched
    this.crouching = false;
    this.noise = 0;         // how loud the last moment was, for things that hunt by sound
    this._p = { x: 0, z: 0 };
  }

  reset(spawn) {
    this.pos.copy(spawn);
    this.vel.set(0, 0, 0);
    this.yaw = -Math.PI / 2; this.pitch = 0; this.recoilPitch = 0;   // face the first door
    this.jumpHeight = 0; this.onGround = true;
    this.crouch = 0; this.crouching = false; this.noise = 0;
    this.ground = this.game.world && this.game.world.heightAt ? this.game.world.heightAt(spawn.x, spawn.z) : 0;
    this.maxHealth = 100; this.health = 100; this.sinceHit = 99;
    this.shake = 0;
  }

  look(dx, dy, scale) {
    this.yaw -= dx * scale;
    this.pitch -= dy * scale;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
  }

  forward(out) {
    const cp = Math.cos(this.pitch + this.recoilPitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch + this.recoilPitch), -Math.cos(this.yaw) * cp);
  }

  update(dt, input, adsAmount) {
    const k = input.keys;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = -sin * f + cos * s, wz = -cos * f - sin * s;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }

    this.crouching = k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyC');
    this.crouch += ((this.crouching ? 1 : 0) - this.crouch) * Math.min(1, dt * 11);
    this.sprinting = (k.has('ShiftLeft') || k.has('ShiftRight')) && f > 0 && adsAmount < 0.3 && this.onGround && !this.crouching;
    const def = this.game.weapons.def;
    const mob = def ? def.mobility : 1;
    let max = (adsAmount > 0.5 ? ADS_WALK : this.sprinting ? SPRINT : WALK) * mob;
    if (this.crouching) max = Math.min(max, CROUCH_WALK * mob);
    const accel = this.onGround ? 14 : 3;
    const blend = 1 - Math.exp(-accel * dt);
    this.vel.x += (wx * max - this.vel.x) * blend;
    this.vel.z += (wz * max - this.vel.z) * blend;

    if (this.onGround && input.pressed.has('Space')) {
      this.vel.y = JUMP_V;
      this.onGround = false;
      this.game.audio.jump();
    }
    if (!this.onGround) {
      this.vel.y -= GRAVITY * dt;
      this.jumpHeight += this.vel.y * dt;
      if (this.jumpHeight <= 0) { this.jumpHeight = 0; this.vel.y = 0; this.onGround = true; this.game.audio.step(); }
    }

    const p = this._p;
    p.x = this.pos.x + this.vel.x * dt;
    p.z = this.pos.z + this.vel.z * dt;
    this.game.world.collideCircle(p, RADIUS);
    // velocity follows what actually happened so we don't "store" speed against walls
    if (dt > 0) {
      this.vel.x = (p.x - this.pos.x) / dt;
      this.vel.z = (p.z - this.pos.z) / dt;
    }
    this.pos.x = p.x; this.pos.z = p.z;
    this.speed2d = Math.hypot(this.vel.x, this.vel.z);
    // follow the floor under us, smoothed so steps don't jolt the camera
    const w = this.game.world;
    const g = w && w.heightAt ? w.heightAt(this.pos.x, this.pos.z) : 0;
    this.ground += (g - this.ground) * Math.min(1, dt * 13);

    if (this.onGround && this.speed2d > 0.6) {
      this.bob += dt * (2.2 + this.speed2d) * 1.5;
      this.stepT -= dt * this.speed2d * (this.crouching ? 0.6 : 1);
      if (this.stepT <= 0) { this.stepT = 2.6; if (!this.crouching) this.game.audio.step(); }
    }
    // how much noise we are making this instant: crouching is near silent, sprinting is loud
    const moving = this.onGround ? Math.min(this.speed2d / WALK, 1.5) : 0.5;
    this.noise = moving * (this.crouching ? 0.12 : this.sprinting ? 1.5 : 1);

    // health regen
    this.sinceHit += dt;
    if (this.sinceHit > 4.5 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + dt * this.maxHealth * 0.35);
    }

    this.recoilPitch *= Math.exp(-9 * dt);
    this.shake *= Math.exp(-7 * dt);
    this.applyCamera();
  }

  get eyeHeight() { return EYE + (CROUCH_EYE - EYE) * this.crouch; }

  applyCamera() {
    const bobAmt = this.onGround ? Math.min(this.speed2d / WALK, 1.6) : 0;
    const by = Math.sin(this.bob * 2) * 0.045 * bobAmt;
    this.camera.position.set(this.pos.x, this.ground + this.eyeHeight + this.jumpHeight + by, this.pos.z);
    this.camera.rotation.set(
      this.pitch + this.recoilPitch + (Math.random() - 0.5) * this.shake,
      this.yaw + (Math.random() - 0.5) * this.shake,
      Math.sin(this.bob) * 0.012 * bobAmt,
    );
  }
}
