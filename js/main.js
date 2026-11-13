// Casinoatrocity: bootstrap and main loop. You start in a rainy hotel lobby, ride the elevator down,
// and fight through a randomly generated, creepy old hotel floor by floor.
import * as THREE from 'three';
import { WEAPONS, BOX_POOL, SKIN_LIST } from './data.js';
import { save, loadSave, writeSave, ownsSkin, addSkin } from './save.js';
import { AudioSys } from './audio.js';
import { Music } from './music.js';
import { World, BOX_COST, AMMO_COST } from './world.js';
import { ZONES, ORDER, zoneById } from './zones.js';
import { LIBRARY, SHAPES, ROMAN, shapeIcon } from './library.js';
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
const SCREENS = ['cases', 'armory', 'settings', 'pause', 'death', 'admin', 'elevator', 'keypad'];
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
    this.state = 'lobby';
    this.screen = null;
    this.screenReturn = 'lobby';
    this.locked = false;
    this.time = 0;
    this.last = performance.now();
    this.drops = [];
    this.box = { state: 'idle', t: 0, cycleT: 0, weapon: null, model: null };

    // persistent-for-the-run loadout
    this.floor = 0;
    this.zonePlan = {};   // which place each 2-floor block drops you in
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
    this.music.play('lobby');   // browsers hold this until the first click
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------------- scenes
  _buildLobby() {
    this.lobbyScene = new THREE.Scene();
    this.lobbyScene.background = new THREE.Color(0x0a0d16);
    this.lobbyScene.fog = new THREE.Fog(0x0a0d16, 10, 60);
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
  // The places come in a fixed order, a couple of floors each. The library is always the third
  // place and is a single bespoke floor.
  zoneFor(floor) {
    let f = Math.max(1, floor);
    for (const step of ORDER) { if (f <= step.floors) return zoneById(step.zone); f -= step.floors; }
    return zoneById(ORDER[ORDER.length - 1].zone);   // past the end, you stay in the last place
  }

  _buildHotel() {
    const Z = this.zone = this.zoneFor(this.floor);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(Z.fog.color);
    scene.fog = new THREE.Fog(Z.fog.color, Z.fog.near, Z.fog.far);
    this.world = new World(scene, this.floor, undefined, Z);
    this.scene = scene;
    this.effects = new Effects(scene, this.world);
    this.zombies.reset();
    this.visited = new Set([this.world.startRoom]);
    this._clearFace();
    // headlamp / flashlight
    this.flashlight = new THREE.SpotLight(0xfff1d0, 0, 22, 0.6, 0.5, 1.4);
    this.flashlight.visible = true;
    scene.add(this.flashlight, this.flashlight.target);
    this.lightOn = this.hasLight;
    this.player.reset(this.world.playerSpawn);
    this.player.yaw = Math.PI;   // face into the room
    // the backrooms: you clip through and land on your side on the carpet
    this.fallIn = Z.noclip ? { t: 0 } : null;
    if (Z.music) this.music.play(Z.music); else if (this.music.cur !== 'face') this.music.stop();
    this._syncShapes();
  }

  // ---------------------------------------------------------------- the library
  _takeBook(it) {
    const p = this.world.puzzle; if (!p || p.found[it.shape]) return;
    p.found[it.shape] = p.digits[it.shape];
    this.audio.powerup();
    if (it.mesh) it.mesh.parent && it.mesh.parent.remove(it.mesh);
    if (it.light) it.light.parent && it.light.parent.remove(it.light);
    const i = this.world.interactables.indexOf(it); if (i >= 0) this.world.interactables.splice(i, 1);
    this.hud.popup('Book taken', '#7fd4ff');
    this._syncShapes();
  }

  // The shape tracker in the corner: what the paper said, and what the books told you.
  _syncShapes() {
    const p = this.world && this.world.puzzle;
    const box = $('shapes');
    if (!p) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    const found = SHAPES.filter(k => p.found[k] !== undefined)
      .map(k => `<span><img src="${shapeIcon(k)}" alt=""><b>${p.found[k]}</b></span>`).join('');
    const seq = p.seenPaper
      ? p.order.map((k, i) => `<span><i>${ROMAN[i]}</i><img src="${shapeIcon(k, '#e8dfc4')}" alt=""><b>${p.found[k] !== undefined ? p.found[k] : '?'}</b></span>`).join('')
      : '<em>Find the librarian\'s note</em>';
    box.innerHTML = `<div class="sh-row"><span class="sh-label">Books</span>${found || '<em>none yet</em>'}</div>` +
      `<div class="sh-row"><span class="sh-label">Order</span>${seq}</div>`;
  }

  _openKeypad() {
    this.state = 'keypad'; this._keyEntry = '';
    this.unlockPointer();
    $('keypad-msg').textContent = '';
    this._syncKeypad();
    this.showScreen('keypad');
  }
  _syncKeypad() { $('keypad-display').textContent = (this._keyEntry + '_____').slice(0, 5); }
  _keypadPress(d) {
    if (this._keyEntry.length >= 5) return;
    this._keyEntry += d; this.audio.tick(); this._syncKeypad();
  }
  _keypadSubmit() {
    const p = this.world.puzzle;
    if (this._keyEntry === p.code) {
      p.unlocked = true;
      LIBRARY.openExit(this.world);
      this.audio.upgrade();
      this.music.play('libraryEnd', { loop: false });   // skip to the last part of the song
      $('keypad-msg').textContent = 'The lock turns.';
      $('keypad-msg').className = 'ok';
      setTimeout(() => this._closeKeypad(), 900);
    } else {
      this.audio.gameOver();
      $('keypad-msg').textContent = 'Wrong.';
      $('keypad-msg').className = 'bad';
      this._keyEntry = ''; this._syncKeypad();
    }
  }
  _closeKeypad() {
    if (this.state !== 'keypad') return;
    this.state = 'playing'; this.screen = null;
    this._hideAllScreens(); this.hud.show(true); this.lockPointer();
  }

  // ---------------------------------------------------------------- the face
  _clearFace() {
    if (this.face && this.face.sprite) this.face.sprite.parent && this.face.sprite.parent.remove(this.face.sprite);
    if (this.face && this.music.cur === 'face') this.music.stop();
    this.face = null; this.sinceFace = 0; this.hidden = null;
    $('hide').classList.add('hidden');
    $('face-warn').classList.remove('on'); $('face-warn').style.opacity = 0;
  }

  // Lights stutter, the song kicks in, and a few seconds later it comes down the corridor.
  _startFace() {
    this.sinceFace = 0;
    this.face = { phase: 'warn', t: 0, sprite: null, route: null, seg: 0, pos: new THREE.Vector3() };
    this.world.flicker = true;
    this.music.play('face', { loop: true });
    this.music.faceVolume(0.55);
    $('face-warn').classList.add('on'); $('face-warn').style.opacity = 0;
  }

  _faceRoute() {
    const w = this.world, path = w.path, here = w.roomAt(this.player.pos.x, this.player.pos.z) || path[0];
    let i = path.indexOf(here), side = null;
    if (i < 0) { const d = w.doors.find(d => d.a === here || d.b === here); side = here; i = Math.max(0, path.indexOf(d ? (d.a === here ? d.b : d.a) : path[0])); }
    const ids = [];
    for (let k = Math.max(0, i - 4); k <= Math.min(path.length - 1, i + 2); k++) { ids.push(path[k]); if (side && k === i) ids.push(side, path[k]); }
    if (ids.length < 2) ids.push(ids[0]);
    return ids.map(id => { const [x, z] = w.roomCenter(id); return new THREE.Vector3(x, 1.7, z); });
  }

  _updateFace(dt) {
    const f = this.face; if (!f) return;
    f.t += dt;
    if (f.phase === 'warn') {
      const k = Math.min(f.t / 6, 1), pulse = 0.5 + 0.5 * Math.sin(f.t * (4 + k * 12));
      $('face-warn').style.opacity = (0.1 + k * 0.55 * (0.55 + 0.45 * pulse)).toFixed(3);
      this.music.faceVolume(0.55 + k * 0.35);
      if (f.t < 6) return;
      if (!this.faceTex) { this.faceTex = new THREE.TextureLoader().load('assets/img/face.webp'); this.faceTex.colorSpace = THREE.SRGBColorSpace; }
      f.route = this._faceRoute(); f.seg = 0; f.pos.copy(f.route[0]);
      f.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.faceTex, fog: false, transparent: true }));
      f.sprite.scale.set(3.4, 3.4, 1);
      f.light = new THREE.PointLight(0xffe060, 60, 22, 1.4); f.sprite.add(f.light);
      this.scene.add(f.sprite);
      this.audio.roar();
      f.phase = 'fly'; f.t = 0;
      return;
    }
    if (f.phase === 'fly') {
      let move = 24 * dt;
      while (move > 0 && f.seg < f.route.length - 1) {
        const to = f.route[f.seg + 1], d = f.pos.distanceTo(to);
        if (d <= move) { f.pos.copy(to); f.seg++; move -= d; } else { f.pos.addScaledVector(V.copy(to).sub(f.pos).normalize(), move); move = 0; }
      }
      f.sprite.position.set(f.pos.x, 1.7, f.pos.z);
      const pp = this.player.pos, dist = Math.hypot(pp.x - f.pos.x, pp.z - f.pos.z);
      this.music.faceVolume(Math.max(0.7, Math.min(1, 1.15 - (dist - 3) / 16)));   // louder the closer it gets
      $('face-warn').style.opacity = Math.max(0, Math.min(0.85, 1 - (dist - 2) / 15)).toFixed(3);
      // everything it passes dies
      for (const z of this.zombies.zombies) {
        if (z.dead || Math.hypot(z.x - f.pos.x, z.z - f.pos.z) > 9) continue;
        if (this.zombies.damage(z, 1e9)) this._goreKill(z, 'gib', V.set(z.x - f.pos.x, 0, z.z - f.pos.z).normalize());
      }
      const p = this.player.pos;
      if (!this.hidden && !this.admin.god && this.state === 'playing' && Math.hypot(p.x - f.pos.x, p.z - f.pos.z) < 10) {
        this.lastHit = { type: 'face' };
        this.player.health = 0; this.hud.blood(4);
        this.gameOver();
      }
      if (f.seg >= f.route.length - 1) { this.scene.remove(f.sprite); f.sprite = null; f.phase = 'out'; f.t = 0; }
      return;
    }
    if (f.t > 1.2) { this.world.flicker = false; if (this.music.cur === 'face') this.music.stop(); this.face = null; $('face-warn').classList.remove('on'); $('face-warn').style.opacity = 0; }
  }

  _hide(it) {
    this.hidden = it;
    this.audio.door();
    this._clearInput();
    $('hide').classList.remove('hidden');
  }
  _unhide() { this.hidden = null; this.audio.door(); $('hide').classList.add('hidden'); }

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
    clearTimeout(this._elevT); this._arriving = false;
    this.fallIn = null;
    const car = $('elevator-car'); if (car) car.classList.remove('boarding', 'riding', 'arriving');
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
    this._arriving = false;
    const car = $('elevator-car');
    car.classList.remove('riding', 'arriving');
    car.classList.add('boarding');            // doors open — you step in
    $('elev-floornum').textContent = 'B' + (this.floor + 1);
    this.audio.door();
    clearTimeout(this._elevT);
    this._elevT = setTimeout(() => { car.classList.remove('boarding'); car.classList.add('riding'); this.audio.door(); }, 1100);
  }

  _syncElevator() {
    $('elev-floor').textContent = 'Floor ' + (this.floor + 1);
    $('elev-dest').textContent = this.zoneFor(this.floor + 1).name;
    this.cases.refreshChips();
    const fBtn = $('buy-flash'), pBtn = $('buy-picks');
    fBtn.textContent = this.hasLight ? 'Flashlight ✓' : `Buy Flashlight — ${FLASH_COST}`;
    fBtn.disabled = this.hasLight;
    pBtn.textContent = `Buy ${PICK_QTY} Lockpicks — ${PICK_COST}`;
    $('elev-have').textContent = `${this.lockpicks} lockpick${this.lockpicks === 1 ? '' : 's'}${this.hasLight ? ' • flashlight' : ''}`;
  }

  // 'Open the doors': the ride ends — the song jumps to its final bars, the doors slide open,
  // and then you step out onto the floor.
  descend() {
    if (this._arriving) return;
    this._arriving = true;
    clearTimeout(this._elevT);
    const car = $('elevator-car');
    car.classList.remove('boarding'); car.classList.add('riding');
    this.music.stop();                // skip to the last part of the elevator tune:
    this.audio.elevatorArrive();      // a clip of its final bars, as the doors open
    this.audio.door();
    car.classList.add('arriving');    // doors part onto the floor
    this._elevT = setTimeout(() => this._enterFloor(), 1900);
  }

  _enterFloor() {
    this._arriving = false;
    const car = $('elevator-car'); if (car) car.classList.remove('boarding', 'riding', 'arriving');
    this.floor++;
    this.music.stop();
    this.audio.unlock();
    this.resetRun();
    this._buildHotel();
    this.state = 'playing';
    this.screen = null;
    this._hideAllScreens();
    this.hud.show(true);
    this.lockPointer();
  }

  nextFloor() {
    this.audio.powerup();
    const bonus = 100 * this.floor;
    this.addChips(bonus);
    this.floor++;
    this._buildHotel();
    this.hud.popup('+' + bonus + ' chips', '#ffd65e');
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
    this._clearFace();
    this._commitRun();
    this.floor = 0;
    this.zonePlan = {};   // a fresh run rolls a fresh set of places
    this.hasLight = false; this.lockpicks = 0;
    this.enterLobby();
  }

  // ---------------------------------------------------------------- death
  gameOver() {
    if (this.state !== 'playing') return;
    const report = this._deathReport();
    this.state = 'dead';
    this.deathT = 0;
    this.audio.gameOver();
    this.music.play('death', { loop: false });
    this._commitRun();
    this._clearInput();
    this.unlockPointer();
    this.hud.show(false);

    $('death-title').textContent = report.title;
    $('death-what').textContent = report.what;
    $('death-detail').textContent = report.detail;
    $('death-tip').innerHTML = report.tips.map(t => `<li>${t}</li>`).join('');
    $('death-floor').textContent = this.floor;
    $('death-rooms').textContent = this.visited.size;
    $('death-kills').textContent = this.kills;
    $('death-chips').textContent = '+' + this.sessionChips;
    this.showScreen('death');
    const el = $('screen-death'); el.classList.remove('play'); void el.offsetWidth; el.classList.add('play');
  }

  // You stay in the world while the death screen fades in: the camera drops to the floorboards.
  _deadUpdate(dt) {
    this.deathT += dt;
    this.zombies.update(dt);
    this.effects.update(dt);
    this._updateFace(dt);
    const cam = this.camera, k = Math.min(1, dt * 5);
    cam.position.y += (0.3 - cam.position.y) * k;
    cam.rotation.z += (1.2 - cam.rotation.z) * k;
    cam.rotation.x += (0.25 - cam.rotation.x) * k;
  }

  // What killed you, the state you were in when it happened, and what to do about it next time.
  _deathReport() {
    const room = this.world.roomAt ? this.world.roomAt(this.player.pos.x, this.player.pos.z) : 0;
    const INFO = {
      bellhop: { title: 'TORN APART', what: 'A bellhop dragged you down and tore you apart', tip: 'Bellhops are slow but they swarm. Keep backpedalling, never stand still in a doorway, and thin the pack before it reaches you.' },
      maid: { title: 'RUN DOWN', what: 'A maid sprinted you down and clawed you open', tip: 'Maids are fragile but very fast. When you hear the shriek, stop and face it: two or three body shots drop one before it reaches you.' },
      lodger: { title: 'DRAGGED UNDER', what: 'A lodger scuttled in low and opened your throat', tip: 'Lodgers stay below your crosshair. Aim at the floor in front of you and fire early, or draw the knife and outrun it.' },
      face: { title: 'AWESOME', what: 'The face came screaming down the corridor and you were standing in the open', tip: 'When the lights stutter and the music starts you have about six seconds. Get into a wardrobe (F) and stay there until it has gone past.' },
      butcher: { title: 'BUTCHERED', what: 'The butcher split your skull with his cleaver', tip: 'The butcher soaks up damage and one chop nearly kills you. Never trade blows up close: back away through the room and empty a magazine into the sack on his head.' },
    };
    const info = (this.lastHit && INFO[this.lastHit.type]) || { title: 'YOU DIED', what: 'You bled out', tip: 'Watch your health bar. Back off and let it regenerate before you push the next room.' };
    const what = `${info.what} on floor ${this.floor}${room ? ', room ' + room : ''}.`;
    const w = this.weapons, def = w.def, slot = w.slot, notes = [], tips = [info.tip];
    const left = this.zombies.remaining;
    if (left > 2) { notes.push(`${left} of them were still in the room`); tips.push('You were outnumbered. A fresh room wakes up a fresh pack, so finish the room you are in before you open the next door.'); }
    if (w.knifeOut) { notes.push('you only had your knife out'); tips.push('The knife is for running, not for standing your ground. Sprint to open space, then switch back to a gun.'); }
    else if (slot && def && !def.melee && slot.mag === 0) { notes.push(`your ${def.name} was empty`); tips.push('You died with an empty magazine. Reload while the room is quiet, and buy ammo before it runs out.'); }
    else if (w.reloading && def) { notes.push(`you were caught reloading your ${def.name}`); tips.push('Reloading roots you to the spot. Swap to your other gun or the knife instead of reloading with something in your face.'); }
    const lamp = this.world.lamps && this.world.lamps[room - 1];
    if (lamp && lamp.intensity < 1 && !this.lightOn) { notes.push('the room was pitch black'); tips.push('The lamp in that room was dead. A flashlight from the elevator shop lets you see what is coming.'); }
    if (this.points >= 1000) tips.push(`You died holding ${Math.floor(this.points).toLocaleString()} unspent points. Spend them on guns, tonics and ammo as you go.`);
    const detail = notes.length ? notes.join(', ').replace(/^./, c => c.toUpperCase()) + '.' : `You made it through ${this.visited.size} room${this.visited.size === 1 ? '' : 's'} and took ${this.kills} of them with you.`;
    return { title: info.title, what, detail, tips: tips.slice(0, 3) };
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
    } else if (z.rig !== 'crawl' && Math.random() < 0.55) {
      const arm = z.arms[(Math.random() * z.arms.length) | 0]; arm.visible = false;
      const shoulder = new THREE.Vector3(z.x, z.neckY - 0.1 * z.scale, z.z);
      fx.gib(shoulder, fling, 0.22 * z.scale, 1); fx.fountain(shoulder, 0.8, 3);
    } else fx.gibs_(c, dir, 2, 3, 0.14);
  }

  damagePlayer(amount, source) {
    const p = this.player;
    if (this.state !== 'playing') return;
    if (this.admin.god || this.hidden) return;
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
    this.hud.popup(POWERUPS[type].name + (sub ? ' ' + sub : ''), '#ffd65e');
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
    if (this.hidden) {
      html = `${key}Step out of the wardrobe`; use = () => this._unhide();
    } else if (it && it.type === 'closet') {
      html = `${key}Hide in the wardrobe`; use = () => this._hide(it);
    } else if (it && it.type === 'paper') {
      html = `${key}Read the librarian's note`;
      use = () => { this.world.puzzle.seenPaper = true; this.audio.click(); this.hud.popup('Order noted', '#ffd65e'); this._syncShapes(); };
    } else if (it && it.type === 'book') {
      html = `${key}Take the glowing book`;
      use = () => this._takeBook(it);
    } else if (it && it.type === 'keypad') {
      const p = this.world.puzzle;
      html = p && p.unlocked ? 'The door is open' : `${key}Use the keypad`;
      if (!p || !p.unlocked) use = () => this._openKeypad();
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
        if (this.lockpicks > 0) { html = `${key}Pick the lock — door ${door.number} <b>(${this.lockpicks} left)</b>`; use = () => { this.lockpicks--; this.world.openDoor(door, this.player.pos.x, this.player.pos.z); this.audio.door(); this.hud.popup('Lock picked', '#9fdc6a'); }; }
        else html = `Door ${door.number} is locked — need a lockpick`;
      } else { html = `${key}Open door ${door.number}`; use = () => { this.world.openDoor(door, this.player.pos.x, this.player.pos.z); this.audio.door(); }; }
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
    this.hud.popup(pk.name, css);
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
    const count = Math.min(3 + Math.floor(this.difficulty() * 0.6), 14);
    this.zombies.spawnRoom(this.world.roomSpawns(room), count, this.difficulty());
    this.dropsThisRoom = 0;
    // every few rooms there is a chance the face comes through
    this.sinceFace++;
    if (!this.face && this.sinceFace >= 3 && room !== this.world.stairsRoom && Math.random() < 0.35) this._startFace();
  }
  // One steady ramp for the whole run: every room you enter is a little harder than the last.
  difficulty() { return Math.max(this.depth, (this.floor - 1) * 6 + 1); }

  // ---------------------------------------------------------------- loop
  frame() {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now; this.time += dt;

    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'lobby') this.updateLobby(dt);
    else if (this.state === 'dead') this._deadUpdate(dt);
    if (!this._canMove) { this.hud.setPrompt(''); $('lock-hint').classList.add('hidden'); }

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
    if (this.fallIn) {
      // noclipped out of reality: drop in, land on your side, then pick yourself up
      const f = this.fallIn; f.t += dt;
      const p = this.player.pos;
      if (f.t < 0.95) {
        const k = f.t / 0.95;
        this.camera.position.set(p.x, 0.42 + (7.5 - 0.42) * (1 - k) * (1 - k), p.z);
        this.camera.rotation.set(-0.5 + k * 0.5, this.player.yaw + k * 0.5, k * 1.45);
      } else if (f.t < 1.45) {
        if (!f.thud) { f.thud = true; this.audio.gore(false); this.player.shake = 0.5; }
        this.camera.position.set(p.x, 0.42, p.z);
        this.camera.rotation.set(0, this.player.yaw + 0.5, 1.45);
      } else {
        const k = Math.min((f.t - 1.45) / 0.9, 1), e = 1 - Math.pow(1 - k, 3);
        this.camera.position.set(p.x, 0.42 + (1.62 - 0.42) * e, p.z);
        this.camera.rotation.set(0, this.player.yaw + 0.5 * (1 - e), 1.45 * (1 - e));
        if (k >= 1) this.fallIn = null;
      }
      this.zombies.update(dt);
      this.effects.update(dt);
      this.world.update(this.time);
      this.hud.update(dt, this);
      return;
    }
    if (this.hidden) {
      // shut in the wardrobe, peering out through the slats
      const h = this.hidden;
      this.camera.position.set(h.x, 1.5, h.z);
      this.camera.rotation.set(0, h.ry + Math.PI + Math.sin(this.time * 0.7) * 0.08, 0);
    } else {
      this.player.update(dt, this.input, this.weapons.ads);
      this.weapons.update(dt, this.input);
    }
    this.zombies.update(dt);
    this._updateFace(dt);
    // walked to the bottom of a stairwell
    if (!this._descending && this.world.heightAt && this.world.heightAt(this.player.pos.x, this.player.pos.z) < (this.world.descendY ?? -2.2)) {
      this._descending = true;
      this.audio.door();
      this.nextFloor();
      setTimeout(() => { this._descending = false; }, 400);
    }
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
    if ((this.state === 'playing' && !this.hidden) || this.state === 'lobby') { r.clearDepth(); r.render(this.weapons.vmScene, this.weapons.vmCamera); }
    this.psx.end();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.psx.setSize(w, h, save.settings.res, save.settings.psx !== false);
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
      if (!this.locked && (this.state === 'playing' || this.state === 'lobby')) this.pause();
    });
    window.addEventListener('keydown', e => {
      if (e.code === 'Backquote' && this.admin.unlocked) { e.preventDefault(); if (this.screen === 'admin') this._closeAdmin(); else this._openAdmin(); return; }
      if (this._canMove) {
        if (e.code === 'Escape' || e.code === 'KeyP') { this.pause(); this.unlockPointer(); return; }
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

  // Close whatever overlay is open and hand control back in the lobby.
  _toLobby() {
    this.state = 'lobby'; this.screen = null;
    this._hideAllScreens();
    this.lockPointer();
  }

  // ---------------------------------------------------------------- screens
  _hideAllScreens() { for (const s of SCREENS) $('screen-' + s).classList.add('hidden'); }
  showScreen(name) {
    this.screen = name;
    for (const s of SCREENS) $('screen-' + s).classList.toggle('hidden', s !== name);
    if (name === 'pause') { this.cases.refreshChips(); $('stat-best').textContent = save.bestRound; $('stat-kills').textContent = save.totalKills.toLocaleString(); }
    else if (name === 'cases') this.cases.showCases();
    else if (name === 'armory') this.cases.showArmory();
    else if (name === 'settings') this._syncSettings();
    else if (name === 'elevator') this._syncElevator();
  }

  _backFromScreen() { this._toLobby(); }

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
    else if (this._adminReturn && this._adminReturn !== 'admin') this.showScreen(this._adminReturn); else this._toLobby();
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
    $('set-psx').checked = s.psx !== false;
    $('row-res').classList.toggle('off', s.psx === false);
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
      else if (act === 'lobby') this.quitToLobby();
      else if (act === 'descend') this.descend();
      else if (act === 'elev-back') this.enterLobby();
      else if (act === 'settings') { this.screenReturn = this.screen === 'pause' ? 'pause' : this.screen; this._settingsReturn = this.screen; this.showScreen('settings'); }
      else if (act === 'settings-back') { writeSave(); if (this._settingsReturn === 'pause') this.showScreen('pause'); else this._backFromScreen(); }
      else if (act === 'admin-back') this._closeAdmin();
      else if (act === 'back') { if (this.cases.spinning) return; this._backFromScreen(); }
      else if (act === 'cases' || act === 'knives' || act === 'armory') {
        if (this.cases.spinning) return;
        if (act === 'cases' || act === 'knives') this.cases.kind = act === 'knives' ? 'knives' : 'guns';
        this.state = 'screen';
        this.showScreen(act === 'knives' ? 'cases' : act);
      }
    });
    $('keypad-keys').addEventListener('click', e => {
      const b = e.target.closest('[data-k]'); if (!b) return;
      const k = b.dataset.k;
      if (k === 'clear') { this._keyEntry = ''; this.audio.click(); this._syncKeypad(); }
      else if (k === 'enter') this._keypadSubmit();
      else this._keypadPress(k);
    });
    $('keypad-close').addEventListener('click', () => this._closeKeypad());
    $('buy-flash').addEventListener('click', () => { if (!this.hasLight && this.spend2(FLASH_COST)) { this.hasLight = true; this.audio.upgrade(); this._syncElevator(); } });
    $('buy-picks').addEventListener('click', () => { if (this.spend2(PICK_COST)) { this.lockpicks += PICK_QTY; this.audio.buy(); this._syncElevator(); } });
    $('set-sens').addEventListener('input', e => { save.settings.sens = parseFloat(e.target.value); this._syncSettings(); });
    $('set-fov').addEventListener('input', e => { save.settings.fov = parseInt(e.target.value, 10); this._syncSettings(); });
    $('set-psx').addEventListener('change', e => { save.settings.psx = e.target.checked; this.resize(); this._syncSettings(); });
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
