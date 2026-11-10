// DOM heads-up display. Only touches the DOM when a value actually changes.
import { WEAPONS } from './data.js';

const $ = id => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = $('hud');
    this.cache = {};
    this.hitT = 0;
    this.announceT = 0;
    this.vig = 0;
  }

  show(on) { this.el.classList.toggle('hidden', !on); }

  set(id, value, prop = 'textContent') {
    const key = id + prop;
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    $(id)[prop] = value;
  }

  style(id, prop, value) {
    const key = id + '$' + prop;
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    $(id).style[prop] = value;
  }

  hitmarker(kill, head) {
    const h = $('hitmarker');
    h.style.setProperty('--hc', kill ? '#ff3b3b' : head ? '#ffd65e' : '#ffffff');
    h.style.opacity = 1;
    h.style.transform = `scale(${kill ? 1.35 : 1})`;
    this.hitT = kill ? 0.22 : 0.12;
  }

  damage() { this.vig = 1; }

  // Blood spatter on the "lens". Fades out on its own.
  blood(count = 1) {
    const box = $('bloodscreen');
    for (let i = 0; i < count && box.childElementCount < 14; i++) {
      const el = document.createElement('i');
      const size = 90 + Math.random() * 220;
      // keep the middle of the screen mostly clear so you can still aim
      const side = Math.random() < 0.5 ? Math.random() * 28 : 72 + Math.random() * 28;
      el.style.cssText = `left:${side}%;top:${Math.random() * 100}%;width:${size}px;height:${size * (0.6 + Math.random() * 0.7)}px;transform:translate(-50%,-50%) rotate(${Math.random() * 360}deg)`;
      box.appendChild(el);
      setTimeout(() => el.remove(), 2600);
    }
  }

  announce(main, sub = '', secs = 3) {
    $('announce-main').textContent = main;
    $('announce-sub').textContent = sub;
    $('announce').classList.add('show');
    this.announceT = secs;
  }

  popup(text, color = '') {
    const box = $('popups');
    const el = document.createElement('div');
    el.className = 'popup';
    el.textContent = text;
    if (color) el.style.color = color;
    el.style.top = (box.childElementCount % 5) * 20 + 'px';
    box.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  update(dt, game) {
    const { player, weapons, zombies } = game;
    if (this.hitT > 0) {
      this.hitT -= dt;
      if (this.hitT <= 0) $('hitmarker').style.opacity = 0;
    }
    if (this.announceT > 0) {
      this.announceT -= dt;
      if (this.announceT <= 0) $('announce').classList.remove('show');
    }
    // red vignette: flash on hit plus a steady glow when badly hurt
    this.vig *= Math.exp(-3 * dt);
    const hurt = 1 - player.health / player.maxHealth;
    const v = Math.min(1, Math.max(this.vig * 0.7, hurt * 0.85));
    this.style('vignette', 'opacity', v.toFixed(2));

    const s = weapons.slot, def = weapons.def;
    if (s) {
      this.set('ammo-mag', def.melee ? '\u2014' : String(s.mag));
      this.set('ammo-res', def.melee ? '' : '/ ' + s.reserve);
      this.set('weapon-name', weapons.reloading ? 'Reloading…' : weapons.displayName);
      const low = !def.melee && s.mag <= Math.ceil(def.mag * 0.25);
      if (this.cache.low !== low) { this.cache.low = low; $('ammo').classList.toggle('low', low); }
      const slotKey = weapons.slots.map(x => x.id).join(',') + weapons.cur + weapons.knifeOut + weapons.knifeName;
      if (this.cache.slots !== slotKey) {
        this.cache.slots = slotKey;
        $('slots').innerHTML = weapons.slots.map((x, i) =>
          `<span class="${i === weapons.cur && !weapons.knifeOut ? 'on' : ''}">${i + 1} ${WEAPONS[x.id].name}</span>`).join('')
          + `<span class="${weapons.knifeOut ? 'on' : ''}">3 ${weapons.knifeName}</span>`;
      }
      // crosshair: spreads with bloom/movement, hidden while aiming
      const gap = Math.round(6 + (def.spread * 260) + weapons.bloom * 400 + Math.min(player.speed2d, 7) * 1.2);
      const ch = $('crosshair');
      if (this.cache.gap !== gap) { this.cache.gap = gap; ch.style.setProperty('--gap', gap + 'px'); }
      const chOp = weapons.ads > 0.5 ? 0 : 1;
      if (this.cache.chOp !== chOp) { this.cache.chOp = chOp; ch.style.opacity = chOp; }
      const scoped = weapons.scoped();
      if (this.cache.scoped !== scoped) { this.cache.scoped = scoped; $('scope').classList.toggle('hidden', !scoped); }
    }

    this.set('points', Math.floor(game.points).toLocaleString());
    this.set('session-chips', '+' + game.sessionChips);
    this.set('round-num', String(Math.max(1, zombies.round)));
    this.style('health-fill', 'width', Math.max(0, (player.health / player.maxHealth) * 100).toFixed(0) + '%');
    this.set('zleft', zombies.phase === 'active' ? `${zombies.remaining} LEFT` : game.doorHint ? 'THE DOOR IS OPEN \u2014 MOVE ON' : '');

    const boss = zombies.boss;
    const showBoss = !!(boss && !boss.dead);
    if (this.cache.showBoss !== showBoss) { this.cache.showBoss = showBoss; $('bossbar').classList.toggle('hidden', !showBoss); }
    if (showBoss) this.style('bossbar-fill', 'width', Math.max(0, (boss.hp / boss.maxHp) * 100).toFixed(1) + '%');

    const pu = [];
    if (game.doubleT > 0) pu.push(`<span style="color:#ffd65e">DOUBLE POINTS ${Math.ceil(game.doubleT)}</span>`);
    if (game.instaT > 0) pu.push(`<span style="color:#ff5a5a">INSTA-KILL ${Math.ceil(game.instaT)}</span>`);
    this.set('powerups', pu.join(''), 'innerHTML');
    this.set('perks', game.perkHtml, 'innerHTML');
    this.set('prompt', game.promptHtml, 'innerHTML');
  }
}
