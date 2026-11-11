// Casinoatrocity: bootstrap and main loop. You start in a rainy hotel lobby, ride the elevator down,
// and fight through a randomly generated, creepy old hotel floor by floor.
import * as THREE from 'three';
import { WEAPONS, BOX_POOL, SKIN_LIST } from './data.js';
import { save, loadSave, writeSave, ownsSkin, addSkin } from './save.js';
import { AudioSys } from './audio.js';
import { Music } from './music.js';
import { World, BOX_COST, AMMO_COST } from './world.js';
import { Lobby } from './lobby.js';
import { Player } from './player.js';
import { WeaponSystem } from './weapons.js';
import { Effects } from './gore.js';
import { PsxPipeline, installVertexSnap } from './psx.js';
import { ZombieDirector } from './zombies.js';
import { Hud } from './hud.js';
import { CaseUI } from './cases.js';
import { buildWeaponModel, disposeWeaponModel } from './models.js';

const $ = id => document.getElementById(id);
const SCREENS = ['splash', 'cases', 'armory', 'settings', 'pause', 'death', 'admin', 'elevator'];
const POWERUPS = {
  max:    { name: 'MAX AMMO',      color: 0x3dff7a },
  double: { name: 'DOUBLE POINTS', color: 0xffd65e },
  insta:  { name: 'INSTA-KILL',    color: 0xff4455 },
  chips:  { name: 'CHIP BONUS',    color: 0x21e6ff },
};
const FLASH_COST = 300, PICK_COST = 150, PICK_QTY = 3;
const V = new THREE.Vector3();

// Falling rain streaks that follow the camera and recycle (used outside, in the lobby).
class Rain {
  constructor(scene) {
    this.N = 520; this.area = 28; this.top = 11; this.bottom = -3;
    this.pos = new Float32Array(this.N * 6); this.vel = new Float32Array(this.N);
    for (let i = 0; i < this.N; i++) this._seed(i, Math.random() * (this.top - this.bottom) + this.bottom);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mesh = new THREE.LineSegments(this.geo, new THREE.LineBasicMaterial({ color: 0xa6b8d8, transparent: true, opacity: 0.45 }));
    this.mesh.frustumCulled = false; this.mesh.visible = false; scene.add(this.mesh);
  }
  _seed(i, y) { const o = i * 6, x = (Math.random() - 0.5) * this.area, z = (Math.random() - 0.5) * this.area, len = 0.6 + Math.random() * 0.7; this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z; this.pos[o + 3] = x + 0.05; this.pos[o + 4] = y - len; this.pos[o + 5] = z; this.vel[i] = 26 + Math.random() * 18; }
  reset() { this.mesh.visible = false; }
  update(dt, cam, on) {
    this.mesh.visible = on; if (!on) return;
    this.mesh.position.set(cam.x, cam.y, cam.z);
    const p = this.pos, span = this.top - this.bottom;
    for (let i = 0; i < this.N; i++) { const o = i * 6, d = this.vel[i] * dt; p[o + 1] -= d; p[o + 4] -= d; if (p[o + 1] < this.bottom) { p[o + 1] += span; p[o + 4] += span; } }
    this.geo.attributes.position.needsUpdate = true;
  }
}

class Game {
  constructor() {
    loadSave();
    this.canvas = $('game');
    installVertexSnap();
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = false;
    this.psx = new PsxPipeline(this.renderer);
    this.camera = new THREE.PerspectiveCamera(save.settings.fov, 1, 0.05, 120);

    this.audio = new AudioSys();
    this.audio.setVolume(save.settings.volume);
    this.music = new Music();
    this.music.setVolume(Math.min(1, save.settings.volume * 0.8));

    this.player = new Player(this);
    this.weapons = new WeaponSystem(this);
    this.zombies = new ZombieDirector(this);
    this.hud = new Hud();
    this.cases = new CaseUI(this);
    this.effects = null;               // built per hotel floor
    this.flashlight = null;

    this.input = { keys: new Set(), pressed: new Set(), mouse: [false, false, false], mousePressed: [false, false, false], wheel: 0 };
    this.state = 'splash';
    this.screen = 'splash';
    this.screenReturn = 'splash';
    this.locked = false;
    this.time = 0;
    this.last = performance.now();
    this.drops = [];
    this.box = { state: 'idle', t: 0, cycleT: 0, weapon: null, model: null };

    // persistent-for-the-run loadout
    this.floor = 0;
    this.hasLight = false;
    this.lockpicks = 0;
    this.visited = new Set();
    this.depth = 0;
    this.lastHit = null;

    this.admin = { god: false, infAmmo: false, infPoints: false, oneShot: false, unlocked: false };
    try { this.admin.unlocked = localStorage.getItem('casinoatrocity.admin') === '1'; } catch (e) { /* storage off */ }

    this._buildLobby();
    this.resetRun();
    this._bindEvents();
    this._bindMenus();
    this.resize();
    this.showScreen('splash');
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------------- scenes
  _buildLobby() {
    this.lobbyScene = new THREE.Scene();
    this.lobbyScene.background = new THREE.Color(0x05060b);
    this.lobbyScene.fog = new THREE.Fog(0x05060b, 6, 40);
    this.lobby = new Lobby(this.lobbyScene);
    this.rain = new Rain(this.lobbyScene);
    this.stormT = 2 + Math.random() * 4;
    this.scene = this.lobbyScene;
    this.world = this.lobby;
    this.player.reset(this.lobby.playerSpawn);
    this.player.yaw = Math.PI;
    this.weapons.reset();
    this.weapons.selectKnife();
  }

  // Generate a fresh hotel floor and swap into it.
  _buildHotel() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030204);
    scene.fog = new THREE.Fog(0x030204, 3, 26);
    this.world = new World(scene, this.floor);
    this.scene = scene;
    this.effects = new Effects(scene, this.world);
    this.zombies.reset();
    this.visited = new Set([this.world.startRoom]);
    // headlamp / flashlight
    this.flashlight = new THREE.SpotLight(0xfff1d0, 0, 22, 0.6, 0.5, 1.4);
    this.flashlight.visible = true;
    scene.add(this.flashlight, this.flashlight.target);
    this.lightOn = this.hasLight;
    this.player.reset(this.world.playerSpawn);
    this.player.yaw = Math.PI;   // face into the room
  }

  resetRun() {
    this.points = 500;
    this.kills = 0;
    this.headshots = 0;
    this.sessionChips = 0;
    this.doubleT = 0;
    this.instaT = 0;
    this.depth = 0;
    this.perks = new Set();
    this.perkHtml = '';
    this.promptHtml = '';
    this.dropsThisRoom = 0;
    for (const d of this.drops) this.scene.remove(d.mesh);
    this.drops.length = 0;
    this.box.state = 'idle'; this.box.model = null;
    this.lastHit = null;
  }

  // ---------------------------------------------------------------- flow
  enterLobby() {
    this.audio.unlock();
    this.music.play('lobby');
    if (this.scene !== this.lobbyScene) { this.scene = this.lobbyScene; this.world = this.lobby; }
    this.weapons.reset();
    this.player.reset(this.lobby.playerSpawn);
    this.player.yaw = Math.PI;
    this.weapons.selectKnife();
    this.state = 'lobby';
    this.screen = null;
    this.hud.show(false);
    this._hideAllScreens();
    this.lockPointer();
  }

  openElevator() {
    this.state = 'elevator';
    this.audio.unlock();
    this.music.play('elevator');
    this.unlockPointer();
    this._syncElevator();
    this.showScreen('elevator');
  }

  _syncElevator() {
    $('elev-floor').textContent = 'Floor ' + (this.floor + 1);
    this.cases.refreshChips();
    const fBtn = $('buy-flash'), pBtn = $('buy-picks');
    fBtn.textContent = this.hasLight ? 'Flashlight ✓' : `Buy Flashlight — ${FLASH_COST}`;
    fBtn.disabled = this.hasLight;
    pBtn.textContent = `Buy ${PICK_QTY} Lockpicks — ${PICK_COST}`;
    $('elev-have').textContent = `${this.lockpicks} lockpick${this.lockpicks === 1 ? '' : 's'}${this.hasLight ? ' • flashlight' : ''}`;
  }

  descend() {
    this.floor++;
    this.music.stop();
    this.audio.unlock();
    this.resetRun();
    this._buildHotel();
    this.state = 'playing';
    this.screen = null;
    this._hideAllScreens();
    this.hud.show(true);
    this.hud.announce('FLOOR ' + this.floor, 'Find the stairs down', 3);
    this.lockPointer();
  }

  nextFloor() {
    this.audio.powerup();
    const bonus = 100 * this.floor;
    this.addChips(bonus);
    this.floor++;
    this._buildHotel();
    this.hud.announce('FLOOR ' + this.floor, `+${bonus} chips • deeper into the hotel`, 3);
  }

  pause() {
    if (this.state !== 'playing' && this.state !== 'lobby') return;
    this._prePause = this.state;
    this.state = 'paused';
    this.pausedAt = performance.now();
    writeSave();
    this._clearInput();
    this.showScreen('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = this._prePause === 'lobby' ? 'lobby' : 'playing';
    this.screen = null;
    this._hideAllScreens();
    this.lockPointer();
  }

  quitToLobby() {
    this._commitRun();
    this.floor = 0;
    this.hasLight = false; this.lockpicks = 0;
    this.enterLobby();
  }

  // ---------------------------------------------------------------- death
  gameOver() {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.audio.gameOver();
    this.music.play('death', { loop: false });
    this._commitRun();
    this._clearInput();
    this.unlockPointer();
    this.hud.show(false);

    const { title, what, tip } = this._deathReport();
    $('death-what').textContent = what;
    $('death-tip').textContent = tip;
    $('death-floor').textContent = this.floor;
    $('death-rooms').textContent = this.visited.size;
    $('death-kills').textContent = this.kills;
    $('death-chips').textContent = '+' + this.sessionChips;
    $('death-title').textContent = title;
    this.showScreen('death');
  }

  _deathReport() {
    const room = this.world.roomAt ? this.world.roomAt(this.player.pos.x, this.player.pos.z) : 0;
    const h = this.lastHit;
    const TIPS = {
      ghoul: 'Ghouls are slow but they swarm. Keep backpedalling, never stop in a doorway, and open a new room to break line of sight.',
      crawler: 'Crawlers are fast and stay low, so they close the gap quickly. Hear the screech, turn, and fire early — or draw the knife and keep running.',
      brute: 'Brutes soak damage and hit like a truck. Don’t trade blows up close: back through a door, pour a magazine into the head, and save a heavy knife stab for when it lunges.',
    };
    if (!h || !h.type) {
      return { title: 'GUEST DECEASED', what: `You bled out on floor ${this.floor}.`, tip: 'Watch your health bar — back off and let it regenerate before pushing the next room.' };
    }
    const names = { ghoul: 'a ghoul', crawler: 'a crawler', brute: 'a brute' };
    return {
      title: 'GUEST DECEASED',
      what: `${(names[h.type] || 'something')[0].toUpperCase()}${(names[h.type] || 'something').slice(1)} tore you apart on floor ${this.floor}${room ? ', room ' + room : ''}, after ${this.kills} kill${this.kills === 1 ? '' : 's'}.`,
      tip: TIPS[h.type] || 'Keep moving, keep a wall at your back, and buy a better gun before you go deeper.',
    };
  }

  _commitRun() {
    save.bestRound = Math.max(save.bestRound, this.floor);
    writeSave();
  }

  addChips(n) { save.chips += n; this.sessionChips += n; }
  addPoints(n) { const amount = n * (this.doubleT > 0 ? 2 : 1); this.points += amount; this.hud.popup('+' + amount); }
  spend(cost) {
    if (this.admin.infPoints) { this.audio.buy(); return true; }
    if (this.points < cost) { this.audio.deny(); this.hud.popup('Not enough points', '#ff7a7a'); return false; }
    this.points -= cost; this.audio.buy(); return true;
  }

  // ---------------------------------------------------------------- combat
  shootTargets() {
    if (!this._targets) this._targets = [];
    const t = this._targets; t.length = 0;
    for (const m of this.zombies.hitMeshes) t.push(m);
    for (const m of this.world.solids) t.push(m);
    return t;
  }

  onZombieHit(z, damage, head, headMult, point, dir, opts = {}) {
    const insta = this.instaT > 0 || this.admin.oneShot;
    const amount = insta ? 1e9 : damage * (head ? headMult : 1);
    const killed = this.zombies.damage(z, amount);
    const fx = this.effects, g = z.def.gore;
    fx.blood(point, killed ? 16 : 7, 3.4, dir);
    if (Math.random() < 0.6) { const far = 0.3 + Math.random() * 1.4; fx.floorDecal(point.x + dir.x * far, point.z + dir.z * far, (0.35 + Math.random() * 0.5) * g); }
    this.hud.hitmarker(killed, head);
    if (!killed) { this.addPoints(10); if (head) this.audio.headshot(); else this.audio.hit(); return; }
    this.kills++;
    save.totalKills++;
    if (head) this.headshots++;
    let mode = 'normal';
    if (opts.gib || (insta && !opts.melee)) mode = 'gib';
    else if (head || (opts.slice && Math.random() < 0.5)) mode = 'head';
    this._goreKill(z, mode, dir);
    this.addPoints(z.def.points + (head ? 40 : 0) + (opts.melee ? 70 : 0));
    this.addChips(z.def.chips + (head ? 2 : 0));
    this.audio.kill();
    const p = this.player.pos;
    if (Math.hypot(z.x - p.x, z.z - p.z) < 3.2) this.hud.blood(mode === 'gib' ? 3 : 1);
    this._maybeDrop(z);
  }

  _goreKill(z, mode, dir) {
    const fx = this.effects, g = z.def.gore, rnd = (a, b) => a + Math.random() * (b - a);
    const c = new THREE.Vector3(z.x, z.centerY, z.z);
    this.audio.gore(mode === 'gib');
    if (mode === 'gib') {
      z.gone = true;
      fx.gibs_(c, dir, Math.round(11 * g), 5.5, 0.26 * z.scale);
      fx.blood(c, 34, 6, dir);
      for (let i = 0; i < 5; i++) fx.floorDecal(z.x + rnd(-1.6, 1.6), z.z + rnd(-1.6, 1.6), rnd(0.7, 1.5) * g);
      fx.floorDecal(z.x, z.z, 1.2 * g, 2.4 * g);
      return;
    }
    fx.floorDecal(z.x, z.z, 0.6, rnd(1.6, 2.4) * g);
    const fling = new THREE.Vector3(dir.x * 3 + rnd(-1, 1), rnd(4, 6.5), dir.z * 3 + rnd(-1, 1));
    if (mode === 'head' && z.head.visible) {
      z.head.visible = false;
      const neck = new THREE.Vector3(z.x, z.neckY, z.z);
      fx.gib(neck, fling, 0.3 * z.scale, 1); fx.gibs_(neck, dir, 3, 3.5, 0.12); fx.fountain(neck, 1.3, 4.5);
    } else if (z.type !== 'crawler' && Math.random() < 0.55) {
      const arm = z.arms[(Math.random() * z.arms.length) | 0]; arm.visible = false;
      const shoulder = new THREE.Vector3(z.x, z.neckY - 0.1 * z.scale, z.z);
      fx.gib(shoulder, fling, 0.22 * z.scale, 1); fx.fountain(shoulder, 0.8, 3);
    } else fx.gibs_(c, dir, 2, 3, 0.14);
  }

  damagePlayer(amount, source) {
    const p = this.player;
    if (this.state !== 'playing') return;
    if (this.admin.god) return;
    if (source && source.type) this.lastHit = { type: source.type };
    p.health -= amount;
    p.sinceHit = 0; p.shake = 0.05;
    this.hud.damage(); this.hud.blood(2); this.audio.hurt();
    if (p.health <= 0) { p.health = 0; this.gameOver(); }
  }

  _maybeDrop(z) {
    if (this.dropsThisRoom >= 2 || Math.random() > 0.05) return;
    this.dropsThisRoom++;
    const types = Object.keys(POWERUPS);
    this.spawnDrop(types[(Math.random() * types.length) | 0], z.x, z.z);
  }
  spawnDrop(type, x, z) {
    const def = POWERUPS[type];
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), new THREE.MeshBasicMaterial({ color: def.color }));
    mesh.position.set(x, 1.1, z); this.scene.add(mesh);
    this.drops.push({ type, mesh, x, z, life: 26 });
  }
  _updateDrops(dt) {
    const p = this.player.pos;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.life -= dt; d.mesh.rotation.y += dt * 2.4; d.mesh.position.y = 1.1 + Math.sin(this.time * 3 + i) * 0.12;
      d.mesh.visible = d.life > 6 || Math.sin(this.time * 16) > 0;
      const got = Math.hypot(d.x - p.x, d.z - p.z) < 1.3;
      if (got) this._applyDrop(d.type);
      if (got || d.life <= 0) { this.scene.remove(d.mesh); d.mesh.geometry.dispose(); d.mesh.material.dispose(); this.drops.splice(i, 1); }
    }
  }
  _applyDrop(type) {
    this.audio.upgrade();
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
  _nearestDoor() {
    if (!this.world.doors) return null;
    const p = this.player.pos, fwd = this.player.forward(V);
    let best = null, bestD = 2.4;
    for (const d of this.world.doors) {
      if (d.open) continue;
      const [x, z] = this.world.center(d.cx, d.cz);
      const dx = x - p.x, dz = z - p.z, dist = Math.hypot(dx, dz);
      if (dist < bestD && (dx * fwd.x + dz * fwd.z) / (dist || 1) > 0.2) { best = d; bestD = dist; }
    }
    return best;
  }

  _interactLobby() {
    const it = this._nearestInteractable();
    const key = '<kbd>F</kbd> ';
    let html = '', use = null;
    if (it) {
      if (it.type === 'elevator') { html = `${key}Take the elevator down`; use = () => this.openElevator(); }
      else if (it.type === 'cases') { html = `${key}Weapon Cases`; use = () => this._openLobbyScreen('cases'); }
      else if (it.type === 'knives') { html = `${key}Knife Crates`; use = () => this._openLobbyScreen('cases', 'knives'); }
      else if (it.type === 'armory') { html = `${key}Armory`; use = () => this._openLobbyScreen('armory'); }
      else if (it.type === 'settings') { html = `${key}Settings`; use = () => this._openLobbyScreen('settings'); }
    }
    this.promptHtml = html;
    if (use && this.input.pressed.has('KeyF')) use();
  }

  _openLobbyScreen(name, kind) {
    if (kind) this.cases.kind = kind; else if (name === 'cases') this.cases.kind = 'guns';
    this.screenReturn = 'lobby';
    this.state = 'screen';
    this.unlockPointer();
    this.showScreen(name);
  }

  _interact() {
    const it = this._nearestInteractable();
    const key = '<kbd>F</kbd> ';
    let html = '', use = null;
    const door = this._nearestDoor();
    if (it && it.type === 'stairs') {
      html = `${key}Descend the stairs <b>(Floor ${this.floor + 1})</b>`;
      use = () => this.nextFloor();
    } else if (it && it.type === 'wallbuy') {
      const w = WEAPONS[it.weapon];
      if (this.weapons.has(it.weapon)) { const cost = Math.round(it.cost / 2); html = `${key}Buy ${w.name} ammo <b>${cost}</b>`; use = () => { if (this.spend(cost)) this.weapons.refill(it.weapon); }; }
      else { html = `${key}Buy ${w.name} <b>${it.cost}</b>`; use = () => { if (this.spend(it.cost)) this.weapons.give(it.weapon); }; }
    } else if (it && it.type === 'perk') {
      const pk = it.perk;
      if (this.perks.has(pk.id)) html = `${pk.name} active`;
      else { html = `${key}Buy ${pk.name} (${pk.desc}) <b>${pk.cost}</b>`; use = () => { if (this.spend(pk.cost)) this._grantPerk(pk); }; }
    } else if (it && it.type === 'ammo') {
      const guns = this.weapons.slots;
      if (guns.every(g => g.reserve >= WEAPONS[g.id].reserve)) html = 'Ammo is full';
      else { html = `${key}Refill all ammo <b>${AMMO_COST}</b>`; use = () => { if (this.spend(AMMO_COST)) this.weapons.maxAmmo(); }; }
    } else if (it && it.type === 'box') {
      const b = this.box;
      if (b.state === 'idle') { html = `${key}Spin the Mystery Box <b>${BOX_COST}</b>`; use = () => { if (this.spend(BOX_COST)) { b.state = 'spin'; b.t = 0; b.cycleT = 0; } }; }
      else if (b.state === 'spin') html = 'Spinning…';
      else { html = `${key}Take <b>${WEAPONS[b.weapon].name}</b>`; use = () => { this.weapons.give(b.weapon); this._setBoxModel(null); b.state = 'idle'; }; }
    } else if (door) {
      if (door.locked) {
        if (this.lockpicks > 0) { html = `${key}Pick the lock — door ${door.number} <b>(${this.lockpicks} left)</b>`; use = () => { this.lockpicks--; this.world.openDoor(door); this.audio.door(); this.hud.popup('Lock picked', '#9fdc6a'); }; }
        else html = `Door ${door.number} is locked — need a lockpick`;
      } else { html = `${key}Open door ${door.number}`; use = () => { this.world.openDoor(door); this.audio.door(); }; }
    }
    this.promptHtml = html;
    if (use && this.input.pressed.has('KeyF')) use();
  }

  _grantPerk(pk) {
    this.audio.upgrade();
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
    b.model = buildWeaponModel(id); b.model.scale.setScalar(1.7); b.model.position.z = 0.45; display.add(b.model);
  }
  _updateBox(dt) {
    const b = this.box;
    if (b.state === 'spin') {
      b.t += dt; b.cycleT -= dt;
      if (b.cycleT <= 0) { b.cycleT = 0.09 + b.t * 0.06; this._setBoxModel(BOX_POOL[(Math.random() * BOX_POOL.length) | 0]); this.audio.tick(); }
      if (b.t >= 3.2) { const pool = BOX_POOL.filter(id => !this.weapons.has(id)); b.weapon = pool[(Math.random() * pool.length) | 0] || BOX_POOL[0]; this._setBoxModel(b.weapon); b.state = 'ready'; b.t = 0; this.audio.reveal(b.weapon === 'revolver' ? 4 : 2); }
    } else if (b.state === 'ready') { b.t += dt; if (b.t > 10) { this._setBoxModel(null); b.state = 'idle'; } }
  }

  // Spawn this room's monsters the first time the player steps into it.
  _roomSpawns() {
    const room = this.world.roomAt(this.player.pos.x, this.player.pos.z);
    if (!room || this.visited.has(room)) return;
    this.visited.add(room);
    this.depth++;
    const count = Math.min(4 + this.depth + this.floor * 2, 16);
    this.zombies.spawnRoom(this.world.roomSpawns(room), count, this.difficulty());
    this.dropsThisRoom = 0;
  }
  difficulty() { return this.floor * 3 + this.depth; }

  // ---------------------------------------------------------------- loop
  frame() {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now; this.time += dt;

    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'lobby') this.updateLobby(dt);
    else if (this.state === 'splash') this._menuCamera();

    this.world.update(Math.floor(this.time * 12) / 12);
    this._storm(dt);
    this.render();
    this.input.pressed.clear();
    this.input.mousePressed[0] = this.input.mousePressed[1] = this.input.mousePressed[2] = false;
    this.input.wheel = 0;
  }

  updateLobby(dt) {
    this.player.update(dt, this.input, 0);
    this.weapons.update(dt, this.input);
    this._interactLobby();
    const fov = save.settings.fov + (this.player.sprinting ? 8 : 0);
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 14); this.camera.updateProjectionMatrix(); }
    this.hud.setPrompt(this.promptHtml);
    $('lock-hint').classList.toggle('hidden', this.locked);
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
    this._roomSpawns();
    this._interact();
    if (this.input.pressed.has('KeyL') && this.hasLight) { this.lightOn = !this.lightOn; this.audio.swap(); }
    this._updateFlashlight();

    const fov = save.settings.fov * this.weapons.fovScale() + (this.player.sprinting ? (this.weapons.knifeOut ? 10 : 3) : 0);
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 14); this.camera.updateProjectionMatrix(); }
    this.hud.update(dt, this);
    $('lock-hint').classList.toggle('hidden', this.locked);
  }

  _updateFlashlight() {
    if (!this.flashlight) return;
    const base = this.lightOn ? (this.hasLight ? 60 : 18) : 0;
    this.flashlight.intensity = base;
    const cam = this.camera;
    this.flashlight.position.copy(cam.position);
    const fwd = this.player.forward(V);
    this.flashlight.target.position.copy(cam.position).addScaledVector(fwd, 6);
    this.flashlight.target.updateMatrixWorld();
  }

  _menuCamera() {
    const [cx, cz] = this.lobby.lawnCenter, a = Math.floor(this.time * 15) / 15 * 0.06;
    this.camera.position.set(cx + Math.cos(a) * 3, 2.0, cz + 2 + Math.sin(a) * 2);
    this.camera.lookAt(cx + Math.cos(a + 2.2) * 4, 1.3, cz + 4 + Math.sin(a + 2.2) * 4);
    if (this.camera.fov !== 70) { this.camera.fov = 70; this.camera.updateProjectionMatrix(); }
  }

  _storm(dt) {
    const outside = (this.world === this.lobby) && this.lobby.isOutdoor(this.camera.position.x, this.camera.position.z);
    this.rain.update(dt, this.camera.position, outside);
    if (!outside) { this.stormT = 2 + Math.random() * 4; return; }
    this.stormT -= dt;
    if (this.stormT <= 0) { this.stormT = 5 + Math.random() * 9; this.lobby.flashLightning(); if (this.audio.ok) this.audio.thunder(); }
  }

  render() {
    const r = this.renderer;
    this.psx.begin();
    r.render(this.scene, this.camera);
    if (this.state === 'playing' || this.state === 'lobby') { r.clearDepth(); r.render(this.weapons.vmScene, this.weapons.vmCamera); }
    this.psx.end();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.psx.setSize(w, h, save.settings.res);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.weapons.vmCamera.aspect = w / h; this.weapons.vmCamera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- input
  lockPointer() { try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* unavailable */ } }
  unlockPointer() { if (document.pointerLockElement) document.exitPointerLock(); }
  _clearInput() { const i = this.input; i.keys.clear(); i.pressed.clear(); i.mouse[0] = i.mouse[1] = i.mouse[2] = false; }
  get _canMove() { return this.state === 'playing' || this.state === 'lobby'; }

  _bindEvents() {
    const i = this.input;
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('blur', () => this._clearInput());
    window.addEventListener('beforeunload', () => { if (!this.wiping) this._commitRun(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked && this.state === 'playing') this.pause();
    });
    window.addEventListener('keydown', e => {
      if (e.code === 'Backquote' && this.admin.unlocked) { e.preventDefault(); if (this.screen === 'admin') this._closeAdmin(); else this._openAdmin(); return; }
      if (this._canMove) {
        if (e.code === 'Escape' || e.code === 'KeyP') { this.unlockPointer(); if (this.state === 'lobby') this._toSplash(); else this.pause(); return; }
        if (!i.keys.has(e.code)) i.pressed.add(e.code);
        i.keys.add(e.code);
        if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'KeyF', 'KeyQ', 'KeyR', 'KeyE', 'KeyL'].includes(e.code)) e.preventDefault();
      } else if (this.state === 'paused' && e.code === 'Escape' && this.screen === 'pause' && performance.now() - this.pausedAt > 400) {
        this.resume();
      }
    });
    window.addEventListener('keyup', e => i.keys.delete(e.code));
    this.canvas.addEventListener('mousedown', e => {
      this.audio.unlock(); this.music.resume();
      if (!this._canMove) return;
      if (!this.locked) { this.lockPointer(); return; }
      if (e.button <= 2) { i.mouse[e.button] = true; i.mousePressed[e.button] = true; }
    });
    window.addEventListener('mouseup', e => { if (e.button <= 2) i.mouse[e.button] = false; });
    window.addEventListener('contextmenu', e => { if (this._canMove) e.preventDefault(); });
    document.addEventListener('mousemove', e => {
      if (!this._canMove || !this.locked) return;
      const scale = 0.0022 * save.settings.sens * this.weapons.fovScale();
      this.player.look(e.movementX, e.movementY, scale);
    });
    window.addEventListener('wheel', e => { if (this._canMove) i.wheel = Math.sign(e.deltaY); }, { passive: true });
  }

  _toSplash() {
    this.state = 'splash'; this.screen = 'splash';
    this.hud.show(false);
    this.showScreen('splash');
  }

  // ---------------------------------------------------------------- screens
  _hideAllScreens() { for (const s of SCREENS) $('screen-' + s).classList.add('hidden'); }
  showScreen(name) {
    this.screen = name;
    for (const s of SCREENS) $('screen-' + s).classList.toggle('hidden', s !== name);
    if (name === 'splash') { this.cases.refreshChips(); $('stat-best').textContent = save.bestRound; $('stat-kills').textContent = save.totalKills.toLocaleString(); }
    else if (name === 'cases') this.cases.showCases();
    else if (name === 'armory') this.cases.showArmory();
    else if (name === 'settings') this._syncSettings();
    else if (name === 'elevator') this._syncElevator();
  }

  _backFromScreen() {
    // close a cases/armory/settings overlay opened from the lobby or splash
    const ret = this.screenReturn;
    if (ret === 'lobby') { this.state = 'lobby'; this.screen = null; this._hideAllScreens(); this.lockPointer(); }
    else this._toSplash();
  }

  // ---------------------------------------------------------------- admin
  _bindAdmin() {
    const seq = [];
    document.querySelectorAll('.logo .ll').forEach(el => el.addEventListener('click', () => {
      seq.push(el.dataset.ch); if (seq.length > 3) seq.shift();
      if (seq.join('') === 'OCI') { seq.length = 0; this._unlockAdmin(); this._openAdmin(); }
    }));
    const toggle = (k, btn) => { this.admin[k] = !this.admin[k]; btn.classList.toggle('on', this.admin[k]); };
    document.querySelectorAll('#screen-admin .adm-toggle').forEach(btn => btn.addEventListener('click', () => toggle(btn.dataset.admin, btn)));
    document.querySelectorAll('#screen-admin [data-admin-act]').forEach(btn => btn.addEventListener('click', () => this._adminAct(btn.dataset.adminAct)));
  }
  _openAdmin() {
    for (const btn of document.querySelectorAll('#screen-admin .adm-toggle')) btn.classList.toggle('on', !!this.admin[btn.dataset.admin]);
    $('adm-msg').textContent = '';
    if (this.state === 'playing' || this.state === 'lobby') { this._adminReturnState = this.state; this.state = 'paused'; this.pausedAt = performance.now(); this._clearInput(); this.unlockPointer(); this._adminReturn = 'resume'; }
    else this._adminReturn = this.screen;
    this.showScreen('admin');
  }
  _unlockAdmin() { this.admin.unlocked = true; try { localStorage.setItem('casinoatrocity.admin', '1'); } catch (e) { /* off */ } }
  _closeAdmin() {
    if (this._adminReturn === 'resume') { this._adminReturn = null; this.state = 'paused'; this._prePause = this._adminReturnState; this.resume(); }
    else this.showScreen(this._adminReturn && this._adminReturn !== 'admin' ? this._adminReturn : 'splash');
  }
  _adminMsg(t) { $('adm-msg').textContent = t; }
  _adminAct(act) {
    const playing = this.state === 'paused' && this._adminReturnState === 'playing';
    switch (act) {
      case 'floor': this.floor = Math.max(0, Math.min(99, parseInt($('adm-round').value, 10) || 1) - 1); this._buildHotel(); this.state = 'playing'; this.screen = null; this._hideAllScreens(); this.hud.show(true); this.lockPointer(); this._adminMsg('Jumped.'); break;
      case 'points': this.points += 100000; this._adminMsg('+100,000 points'); break;
      case 'maxammo': this.weapons.maxAmmo(); this._adminMsg('Ammo refilled.'); break;
      case 'doors': if (this.world.doors) { for (const d of this.world.doors) this.world.openDoor(d); this._adminMsg('All doors open.'); } break;
      case 'revolver': case 'sniper': case 'lmg': this.weapons.give(act); this._adminMsg('Gave ' + WEAPONS[act].name + '.'); break;
      case 'light': this.hasLight = true; this.lightOn = true; this.lockpicks += 10; this._adminMsg('Flashlight + 10 picks.'); break;
      case 'chips': save.chips += 10000; writeSave(); this.cases.refreshChips(); this._syncElevator(); this._adminMsg('+10,000 chips'); break;
      case 'skins': { let n = 0; for (const sk of SKIN_LIST) if (!ownsSkin(sk.id)) { addSkin(sk.id); n++; } writeSave(); this.cases.refreshChips(); this._adminMsg(n ? 'Unlocked ' + n + ' skins.' : 'All owned.'); break; }
      case 'wipe': if (confirm('Reset all chips, skins and records?')) { this.wiping = true; localStorage.removeItem('casinoatrocity.save.v1'); location.reload(); } break;
    }
  }

  _syncSettings() {
    const s = save.settings;
    $('set-sens').value = s.sens; $('out-sens').textContent = Number(s.sens).toFixed(2);
    $('set-fov').value = s.fov; $('out-fov').textContent = s.fov + '°';
    $('set-res').value = String(s.res);
    $('set-vol').value = s.volume; $('out-vol').textContent = Math.round(s.volume * 100) + '%';
  }

  _bindMenus() {
    this._bindAdmin();
    document.addEventListener('click', e => { if (e.target.closest('button')) { this.audio.unlock(); this.audio.click(); this.music.resume(); } }, true);
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'enter') this.enterLobby();
      else if (act === 'resume') this.resume();
      else if (act === 'quit') this.quitToLobby();
      else if (act === 'lobby') this.enterLobby();
      else if (act === 'descend') this.descend();
      else if (act === 'elev-back') this.enterLobby();
      else if (act === 'settings') { this.screenReturn = this.screen === 'pause' ? 'pause' : this.screen; this._settingsReturn = this.screen; this.showScreen('settings'); }
      else if (act === 'settings-back') { writeSave(); if (this._settingsReturn === 'pause') this.showScreen('pause'); else this._backFromScreen(); }
      else if (act === 'admin-back') this._closeAdmin();
      else if (act === 'back') { if (this.cases.spinning) return; this._backFromScreen(); }
      else if (act === 'cases' || act === 'knives' || act === 'armory') {
        if (this.cases.spinning) return;
        if (act === 'cases' || act === 'knives') this.cases.kind = act === 'knives' ? 'knives' : 'guns';
        if (this.screen === 'splash') this.screenReturn = 'splash';
        this.state = 'screen';
        this.showScreen(act === 'knives' ? 'cases' : act);
      }
    });
    $('buy-flash').addEventListener('click', () => { if (!this.hasLight && this.spend2(FLASH_COST)) { this.hasLight = true; this.audio.upgrade(); this._syncElevator(); } });
    $('buy-picks').addEventListener('click', () => { if (this.spend2(PICK_COST)) { this.lockpicks += PICK_QTY; this.audio.buy(); this._syncElevator(); } });
    $('set-sens').addEventListener('input', e => { save.settings.sens = parseFloat(e.target.value); this._syncSettings(); });
    $('set-fov').addEventListener('input', e => { save.settings.fov = parseInt(e.target.value, 10); this._syncSettings(); });
    $('set-res').addEventListener('change', e => { save.settings.res = parseInt(e.target.value, 10); this.resize(); });
    $('set-vol').addEventListener('input', e => { save.settings.volume = parseFloat(e.target.value); this.audio.setVolume(save.settings.volume); this.music.setVolume(Math.min(1, save.settings.volume * 0.8)); this._syncSettings(); });
    $('reset-save').addEventListener('click', () => { if (!confirm('Reset all chips, skins and records?')) return; this.wiping = true; localStorage.removeItem('casinoatrocity.save.v1'); location.reload(); });
  }

  // chips spend (for the elevator shop); points are spent with spend()
  spend2(cost) {
    if (save.chips < cost) { this.audio.deny(); return false; }
    save.chips -= cost; writeSave(); this.cases.refreshChips(); return true;
  }
}

function fatal(msg) { const el = $('fatal'); el.textContent = msg; el.classList.remove('hidden'); }

try { window.game = new Game(); }
catch (e) { console.error(e); fatal('Casinoatrocity could not start.\n\nYour browser may not support WebGL, or it is disabled.\n\n' + e.message); }
