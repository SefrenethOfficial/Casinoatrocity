// Casinoatrocity: game bootstrap, main loop, Zombies mode rules and menu navigation.
import * as THREE from 'three';
import { WEAPONS, BOX_POOL } from './data.js';
import { save, loadSave, writeSave } from './save.js';
import { AudioSys } from './audio.js';
import { World, BOX_COST, UPGRADE_COST } from './world.js';
import { Player } from './player.js';
import { WeaponSystem } from './weapons.js';
import { Effects } from './gore.js';
import { PsxPipeline, installVertexSnap } from './psx.js';
import { ZombieDirector } from './zombies.js';
import { Hud } from './hud.js';
import { CaseUI } from './cases.js';
import { buildWeaponModel, disposeWeaponModel } from './models.js';

const $ = id => document.getElementById(id);
const SCREENS = ['menu', 'cases', 'armory', 'settings', 'pause', 'over'];
const POWERUPS = {
  max:    { name: 'MAX AMMO',      color: 0x3dff7a },
  double: { name: 'DOUBLE POINTS', color: 0xffd65e },
  insta:  { name: 'INSTA-KILL',    color: 0xff4455 },
  chips:  { name: 'CHIP BONUS',    color: 0x21e6ff },
};
const V = new THREE.Vector3();

class Game {
  constructor() {
    loadSave();
    const canvas = $('game');
    this.canvas = canvas;
    installVertexSnap();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = false;
    this.psx = new PsxPipeline(this.renderer);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050308);
    this.scene.fog = new THREE.Fog(0x050308, 5, 34);
    this.camera = new THREE.PerspectiveCamera(save.settings.fov, 1, 0.05, 120);

    this.audio = new AudioSys();
    this.audio.setVolume(save.settings.volume);
    this.world = new World(this.scene);
    this.effects = new Effects(this.scene, this.world);
    this.player = new Player(this);
    this.weapons = new WeaponSystem(this);
    this.zombies = new ZombieDirector(this);
    this.hud = new Hud();
    this.cases = new CaseUI(this);

    this.input = { keys: new Set(), pressed: new Set(), mouse: [false, false, false], mousePressed: [false, false, false], wheel: 0 };
    this.state = 'menu';
    this.screen = 'menu';
    this.settingsReturn = 'menu';
    this.locked = false;
    this.wasLocked = false;
    this.time = 0;
    this.last = performance.now();
    this.drops = [];
    this.box = { state: 'idle', t: 0, cycleT: 0, weapon: null, model: null };
    this.resetRun();

    this._bindEvents();
    this._bindMenus();
    this.resize();
    this.showScreen('menu');
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------------- run state
  resetRun() {
    this.points = 500;
    this.kills = 0;
    this.headshots = 0;
    this.sessionChips = 0;
    this.doubleT = 0;
    this.instaT = 0;
    this.perks = new Set();
    this.perkHtml = '';
    this.promptHtml = '';
    this.dropsThisRound = 0;
    for (const d of this.drops) this.scene.remove(d.mesh);
    this.drops.length = 0;
    this._setBoxModel(null);
    this.box.state = 'idle';
    this.effects.clear();
    this.world.resetDoors();
  }

  startZombies() {
    this.audio.unlock();
    this.resetRun();
    this.player.reset(this.world.playerSpawn);
    this.weapons.reset();
    this.zombies.reset();
    this.state = 'playing';
    this.wasLocked = false;
    this.showScreen(null);
    this.hud.show(true);
    this.hud.announce('ZOMBIES', 'Something is awake under the casino', 3);
    this.lockPointer();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.pausedAt = performance.now();
    writeSave();
    this._clearInput();
    this.showScreen('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.showScreen(null);
    this.lockPointer();
  }

  quitToMenu() {
    this._commitRun();
    this.state = 'menu';
    this.hud.show(false);
    this.unlockPointer();
    this.zombies.reset();
    this.zombies.phase = 'idle';
    this.resetRun();
    this.showScreen('menu');
  }

  gameOver() {
    if (this.state !== 'playing') return;
    this.state = 'over';
    this.audio.gameOver();
    this._commitRun();
    this._clearInput();
    this.unlockPointer();
    const round = Math.max(1, this.zombies.round);
    $('over-line').textContent = round >= save.bestRound && round > 1
      ? 'New personal best. The house still collected.' : 'The house collected. Your chips are safe in the cage.';
    $('over-round').textContent = round;
    $('over-kills').textContent = this.kills;
    $('over-heads').textContent = this.headshots;
    $('over-chips').textContent = '+' + this.sessionChips;
    this.showScreen('over');
  }

  _commitRun() {
    if (this.state === 'playing' || this.state === 'paused' || this.state === 'over') {
      save.bestRound = Math.max(save.bestRound, this.zombies.round);
    }
    writeSave();
  }

  addChips(n) {
    save.chips += n;
    this.sessionChips += n;
  }

  addPoints(n) {
    const amount = n * (this.doubleT > 0 ? 2 : 1);
    this.points += amount;
    this.hud.popup('+' + amount);
  }

  spend(cost) {
    if (this.points < cost) { this.audio.deny(); this.hud.popup('Not enough points', '#ff7a7a'); return false; }
    this.points -= cost;
    this.audio.buy();
    return true;
  }

  // ---------------------------------------------------------------- zombies mode callbacks
  onRoundStart(round) {
    this.dropsThisRound = 0;
    this.hud.announce('ROUND ' + round, '', 2.6);
    this.audio.roundStart();
  }

  onRoundEnd(round) {
    const bonus = 20 * round;
    this.addChips(bonus);
    save.bestRound = Math.max(save.bestRound, round);
    writeSave();
    // each cleared wave opens the next door; the ninth opens the lab
    const opened = this.world.openDoor(round);
    const sub = !opened ? `+${bonus} chips` : round === 9 ? `+${bonus} chips \u2022 the lab is open` : `+${bonus} chips \u2022 a door grinds open`;
    this.hud.announce('ROUND CLEARED', sub, 3.6);
    this.audio.roundEnd();
    if (opened) this.audio.door();
  }

  shootTargets() {
    if (!this._targets) this._targets = [];
    const t = this._targets;
    t.length = 0;
    for (const m of this.zombies.hitMeshes) t.push(m);
    for (const m of this.world.solids) t.push(m);
    return t;
  }

  onZombieHit(z, damage, head, headMult, point, dir, opts = {}) {
    const insta = this.instaT > 0;
    const amount = insta ? 1e9 : damage * (head ? headMult : 1);
    const killed = this.zombies.damage(z, amount);
    const fx = this.effects, g = z.def.gore, acid = !!z.def.acid;
    fx.blood(point, killed ? 16 : 7, 3.4, dir, acid);
    if (Math.random() < 0.6) {
      const far = 0.3 + Math.random() * 1.4;
      fx.floorDecal(point.x + dir.x * far, point.z + dir.z * far, (0.35 + Math.random() * 0.5) * g, 0, acid);
    }
    this.hud.hitmarker(killed, head);
    if (!killed) {
      this.addPoints(10);
      if (head) this.audio.headshot(); else this.audio.hit();
      return;
    }
    this.kills++;
    save.totalKills++;
    if (head) this.headshots++;
    let mode = 'normal';
    if (acid || opts.gib || (insta && !opts.melee)) mode = 'gib';
    else if (head || (opts.slice && Math.random() < 0.5)) mode = 'head';
    this._goreKill(z, mode, dir);
    this.addPoints(z.def.points + (head ? 40 : 0) + (opts.melee ? 70 : 0));
    this.addChips(z.def.chips + (head ? 2 : 0));
    this.audio.kill();
    const p = this.player.pos;
    if (Math.hypot(z.x - p.x, z.z - p.z) < 3.2) this.hud.blood(mode === 'gib' ? 3 : 1);
    this._maybeDrop(z);
  }

  // Dismemberment. 'gib' bursts the whole body, 'head' takes the head off, 'normal' may lose an arm.
  _goreKill(z, mode, dir) {
    const fx = this.effects, g = z.def.gore, rnd = (a, b) => a + Math.random() * (b - a);
    const c = new THREE.Vector3(z.x, z.centerY, z.z);
    this.audio.gore(mode === 'gib');
    if (mode === 'gib') {
      const acid = !!z.def.acid;
      z.gone = true;
      fx.gibs_(c, dir, Math.round(11 * g), 5.5, 0.26 * z.scale, acid);
      fx.blood(c, 34, 6, dir, acid);
      for (let i = 0; i < 5; i++) fx.floorDecal(z.x + rnd(-1.6, 1.6), z.z + rnd(-1.6, 1.6), rnd(0.7, 1.5) * g, 0, acid);
      fx.floorDecal(z.x, z.z, 1.2 * g, 2.4 * g, acid);
      // mutants burst: standing next to one when it dies hurts
      const p = this.player.pos;
      if (acid && Math.hypot(z.x - p.x, z.z - p.z) < 2.4) this.damagePlayer(15);
      return;
    }
    fx.floorDecal(z.x, z.z, 0.6, rnd(1.6, 2.4) * g);   // the pool spreads under the corpse
    const fling = new THREE.Vector3(dir.x * 3 + rnd(-1, 1), rnd(4, 6.5), dir.z * 3 + rnd(-1, 1));
    if (mode === 'head' && z.head.visible) {
      z.head.visible = false;
      const neck = new THREE.Vector3(z.x, z.neckY, z.z);
      fx.gib(neck, fling, 0.3 * z.scale, 1);
      fx.gibs_(neck, dir, 3, 3.5, 0.12);
      fx.fountain(neck, 1.3, 4.5);
    } else if (z.type !== 'crawler' && Math.random() < 0.55) {
      const arm = z.arms[(Math.random() * z.arms.length) | 0];
      arm.visible = false;
      const shoulder = new THREE.Vector3(z.x, z.neckY - 0.1 * z.scale, z.z);
      fx.gib(shoulder, fling, 0.22 * z.scale, 1);
      fx.fountain(shoulder, 0.8, 3);
    } else {
      fx.gibs_(c, dir, 2, 3, 0.14);
    }
  }

  damagePlayer(amount) {
    const p = this.player;
    if (this.state !== 'playing') return;
    p.health -= amount;
    p.sinceHit = 0;
    p.shake = 0.05;
    this.hud.damage();
    this.hud.blood(2);
    this.audio.hurt();
    if (p.health <= 0) { p.health = 0; this.gameOver(); }
  }

  _maybeDrop(z) {
    if (this.dropsThisRound >= 3 || Math.random() > 0.045) return;
    this.dropsThisRound++;
    const types = Object.keys(POWERUPS);
    this.spawnDrop(types[(Math.random() * types.length) | 0], z.x, z.z);
  }

  spawnDrop(type, x, z) {
    const def = POWERUPS[type];
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), new THREE.MeshBasicMaterial({ color: def.color }));
    mesh.position.set(x, 1.1, z);
    this.scene.add(mesh);
    this.drops.push({ type, mesh, x, z, life: 26 });
  }

  _updateDrops(dt) {
    const p = this.player.pos;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.life -= dt;
      d.mesh.rotation.y += dt * 2.4;
      d.mesh.position.y = 1.1 + Math.sin(this.time * 3 + i) * 0.12;
      d.mesh.visible = d.life > 6 || Math.sin(this.time * 16) > 0;   // blink before vanishing
      const got = Math.hypot(d.x - p.x, d.z - p.z) < 1.3;
      if (got) this._applyDrop(d.type);
      if (got || d.life <= 0) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose(); d.mesh.material.dispose();
        this.drops.splice(i, 1);
      }
    }
  }

  _applyDrop(type) {
    this.audio.powerup();
    let sub = '';
    if (type === 'max') this.weapons.maxAmmo();
    else if (type === 'double') this.doubleT = 30;
    else if (type === 'insta') this.instaT = 30;
    else if (type === 'chips') { this.addChips(50); sub = '+50 chips'; }
    this.hud.announce(POWERUPS[type].name, sub, 2);
  }

  // ---------------------------------------------------------------- interactables
  _nearestInteractable() {
    const p = this.player.pos, fwd = this.player.forward(V);
    let best = null, bestD = 2.9;
    for (const it of this.world.interactables) {
      const dx = it.x - p.x, dz = it.z - p.z, d = Math.hypot(dx, dz);
      if (d < bestD && (dx * fwd.x + dz * fwd.z) / (d || 1) > 0.25) { best = it; bestD = d; }
    }
    return best;
  }

  _interact() {
    const it = this._nearestInteractable();
    const key = '<kbd>F</kbd> ';
    let html = '', use = null;
    if (it && it.type === 'wallbuy') {
      const w = WEAPONS[it.weapon];
      if (this.weapons.has(it.weapon)) {
        const cost = Math.round(it.cost / 2);
        html = `${key}Buy ${w.name} ammo <b>${cost}</b>`;
        use = () => { if (this.spend(cost)) this.weapons.refill(it.weapon); };
      } else {
        html = `${key}Buy ${w.name} <b>${it.cost}</b>`;
        use = () => { if (this.spend(it.cost)) this.weapons.give(it.weapon); };
      }
    } else if (it && it.type === 'perk') {
      const pk = it.perk;
      if (this.perks.has(pk.id)) html = `${pk.name} active`;
      else {
        html = `${key}Buy ${pk.name} (${pk.desc}) <b>${pk.cost}</b>`;
        use = () => { if (this.spend(pk.cost)) this._grantPerk(pk); };
      }
    } else if (it && it.type === 'upgrade') {
      const w = this.weapons;
      if (w.knifeOut) html = 'Hold a gun to overclock it';
      else if (w.slot.up) html = `${w.displayName} is already overclocked`;
      else {
        html = `${key}Overclock ${w.def.name} (double damage) <b>${UPGRADE_COST}</b>`;
        use = () => {
          if (this.spend(UPGRADE_COST) && w.overclock()) this.hud.announce(w.displayName.toUpperCase(), 'double damage', 2.4);
        };
      }
    } else if (it && it.type === 'box') {
      const b = this.box;
      if (b.state === 'idle') {
        html = `${key}Spin the Mystery Slot <b>${BOX_COST}</b>`;
        use = () => { if (this.spend(BOX_COST)) { b.state = 'spin'; b.t = 0; b.cycleT = 0; } };
      } else if (b.state === 'spin') html = 'Spinning…';
      else {
        html = `${key}Take <b>${WEAPONS[b.weapon].name}</b>`;
        use = () => {
          this.weapons.give(b.weapon);
          this._setBoxModel(null);
          b.state = 'idle';
        };
      }
    }
    this.promptHtml = html;
    if (use && this.input.pressed.has('KeyF')) use();
  }

  _grantPerk(pk) {
    this.perks.add(pk.id);
    if (pk.id === 'thick') { this.player.maxHealth = 200; this.player.health = 200; }
    if (pk.id === 'hands') this.weapons.reloadMult = 0.5;
    const css = '#' + pk.color.toString(16).padStart(6, '0');
    this.perkHtml += `<span style="color:${css}">${pk.name.toUpperCase()}</span>`;
    this.hud.announce(pk.name.toUpperCase(), pk.desc, 2);
  }

  _setBoxModel(id) {
    const b = this.box, display = this.world.mystery && this.world.mystery.display;
    if (!display) return;
    if (b.model) { display.remove(b.model); disposeWeaponModel(b.model); b.model = null; }
    if (!id) return;
    b.model = buildWeaponModel(id);
    b.model.scale.setScalar(1.7);
    b.model.position.z = 0.45;
    display.add(b.model);
  }

  _updateBox(dt) {
    const b = this.box;
    if (b.state === 'spin') {
      b.t += dt; b.cycleT -= dt;
      if (b.cycleT <= 0) {
        b.cycleT = 0.09 + b.t * 0.06;   // slows down like a reel
        this._setBoxModel(BOX_POOL[(Math.random() * BOX_POOL.length) | 0]);
        this.audio.tick();
      }
      if (b.t >= 3.2) {
        const pool = BOX_POOL.filter(id => !this.weapons.has(id));
        b.weapon = pool[(Math.random() * pool.length) | 0];
        this._setBoxModel(b.weapon);
        b.state = 'ready'; b.t = 0;
        this.audio.reveal(b.weapon === 'revolver' ? 4 : 2);
      }
    } else if (b.state === 'ready') {
      b.t += dt;
      if (b.t > 10) { this._setBoxModel(null); b.state = 'idle'; }
    }
  }

  // ---------------------------------------------------------------- loop
  frame() {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.time += dt;

    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'menu') this._menuCamera();

    this.world.update(Math.floor(this.time * 12) / 12);   // world animation is stepped too
    this.render();
    this.input.pressed.clear();
    this.input.mousePressed[0] = this.input.mousePressed[1] = this.input.mousePressed[2] = false;
    this.input.wheel = 0;
  }

  update(dt) {
    this.doubleT = Math.max(0, this.doubleT - dt);
    this.instaT = Math.max(0, this.instaT - dt);
    this.player.update(dt, this.input, this.weapons.ads);
    this.weapons.update(dt, this.input);
    this.zombies.update(dt);
    this.effects.update(dt);
    this._updateDrops(dt);
    this._updateBox(dt);
    if (this.state !== 'playing') return;   // died this frame
    this._interact();

    const fov = save.settings.fov * this.weapons.fovScale() + (this.player.sprinting ? (this.weapons.knifeOut ? 10 : 3) : 0);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 14);
      this.camera.updateProjectionMatrix();
    }
    this.hud.update(dt, this);
    $('lock-hint').classList.toggle('hidden', this.locked);
  }

  _menuCamera() {
    const [cx, cz0] = this.world.roomCenter(5), cz = cz0 - 1, a = Math.floor(this.time * 15) / 15 * 0.07;
    this.camera.position.set(cx + Math.cos(a) * 2.2, 2.1, cz + 1 + Math.sin(a) * 2.2);
    this.camera.lookAt(cx + Math.cos(a + 2.4) * 4, 1.4, cz + 1 + Math.sin(a + 2.4) * 4);
    if (this.camera.fov !== 70) { this.camera.fov = 70; this.camera.updateProjectionMatrix(); }
  }

  render() {
    const r = this.renderer;
    this.psx.begin();
    r.render(this.scene, this.camera);
    if (this.state !== 'menu') {
      r.clearDepth();
      r.render(this.weapons.vmScene, this.weapons.vmCamera);
    }
    this.psx.end();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.psx.setSize(w, h, save.settings.res);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.weapons.vmCamera.aspect = w / h;
    this.weapons.vmCamera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- input
  lockPointer() {
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* not available */ }
  }
  unlockPointer() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
  _clearInput() {
    const i = this.input;
    i.keys.clear(); i.pressed.clear();
    i.mouse[0] = i.mouse[1] = i.mouse[2] = false;
  }

  _bindEvents() {
    const i = this.input;
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('blur', () => this._clearInput());
    window.addEventListener('beforeunload', () => { if (!this.wiping) this._commitRun(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) this.wasLocked = true;
      else if (this.state === 'playing' && this.wasLocked) this.pause();
    });

    window.addEventListener('keydown', e => {
      if (this.state === 'playing') {
        if (e.code === 'Escape' || e.code === 'KeyP') { if (!this.locked || e.code === 'KeyP') { this.unlockPointer(); this.pause(); } return; }
        if (!i.keys.has(e.code)) i.pressed.add(e.code);
        i.keys.add(e.code);
        if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'KeyF', 'KeyQ', 'KeyR', 'KeyE'].includes(e.code)) e.preventDefault();
      } else if (this.state === 'paused' && e.code === 'Escape' && this.screen === 'pause' && performance.now() - this.pausedAt > 400) {
        this.resume();
      }
    });
    window.addEventListener('keyup', e => i.keys.delete(e.code));

    this.canvas.addEventListener('mousedown', e => {
      this.audio.unlock();
      if (this.state !== 'playing') return;
      if (!this.locked) { this.lockPointer(); return; }
      if (e.button <= 2) { i.mouse[e.button] = true; i.mousePressed[e.button] = true; }
    });
    window.addEventListener('mouseup', e => { if (e.button <= 2) i.mouse[e.button] = false; });
    window.addEventListener('contextmenu', e => { if (this.state === 'playing') e.preventDefault(); });
    document.addEventListener('mousemove', e => {
      if (this.state !== 'playing' || !this.locked) return;
      const scale = 0.0022 * save.settings.sens * this.weapons.fovScale();
      this.player.look(e.movementX, e.movementY, scale);
    });
    window.addEventListener('wheel', e => { if (this.state === 'playing') i.wheel = Math.sign(e.deltaY); }, { passive: true });
  }

  // ---------------------------------------------------------------- menus
  showScreen(name) {
    this.screen = name;
    for (const s of SCREENS) $('screen-' + s).classList.toggle('hidden', s !== name);
    if (name === 'menu') {
      this.cases.refreshChips();
      $('stat-best').textContent = save.bestRound;
      $('stat-kills').textContent = save.totalKills.toLocaleString();
    } else if (name === 'cases') this.cases.showCases();
    else if (name === 'armory') this.cases.showArmory();
    else if (name === 'settings') this._syncSettings();
  }

  _syncSettings() {
    const s = save.settings;
    $('set-sens').value = s.sens; $('out-sens').textContent = Number(s.sens).toFixed(2);
    $('set-fov').value = s.fov; $('out-fov').textContent = s.fov + '°';
    $('set-res').value = String(s.res);
    $('set-vol').value = s.volume; $('out-vol').textContent = Math.round(s.volume * 100) + '%';
  }

  _bindMenus() {
    // every button gets the interface click
    document.addEventListener('click', e => { if (e.target.closest('button')) { this.audio.unlock(); this.audio.click(); } }, true);
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      this.audio.unlock();
      const act = btn.dataset.act;
      if (act === 'knives' || act === 'cases') this.cases.kind = act === 'knives' ? 'knives' : 'guns';
      if (act === 'play') this.startZombies();
      else if (act === 'resume') this.resume();
      else if (act === 'quit') this.quitToMenu();
      else if (act === 'settings') { this.settingsReturn = this.screen; this.showScreen('settings'); }
      else if (act === 'settings-back') { writeSave(); this.showScreen(this.settingsReturn); }
      else if (act === 'menu' || act === 'cases' || act === 'knives' || act === 'armory') {
        if (this.cases.spinning) return;
        if (this.state === 'over') { this.state = 'menu'; this.hud.show(false); this.zombies.reset(); this.zombies.phase = 'idle'; this.resetRun(); }
        this.showScreen(act === 'knives' ? 'cases' : act);
      }
    });
    $('set-sens').addEventListener('input', e => { save.settings.sens = parseFloat(e.target.value); this._syncSettings(); });
    $('set-fov').addEventListener('input', e => { save.settings.fov = parseInt(e.target.value, 10); this._syncSettings(); });
    $('set-res').addEventListener('change', e => { save.settings.res = parseInt(e.target.value, 10); this.resize(); });
    $('set-vol').addEventListener('input', e => {
      save.settings.volume = parseFloat(e.target.value);
      this.audio.setVolume(save.settings.volume);
      this._syncSettings();
    });
    $('reset-save').addEventListener('click', () => {
      if (!confirm('Reset all chips, skins and records? This cannot be undone.')) return;
      this.wiping = true;
      localStorage.removeItem('casinoatrocity.save.v1');
      location.reload();
    });
  }
}

function fatal(msg) {
  const el = $('fatal');
  el.textContent = msg;
  el.classList.remove('hidden');
}

try {
  window.game = new Game();
} catch (e) {
  console.error(e);
  fatal('Casinoatrocity could not start.\n\nYour browser may not support WebGL, or it is disabled.\n\n' + e.message);
}
