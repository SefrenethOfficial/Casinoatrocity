// Weapon case opening (spinning reel) and the armory where skins are equipped or sold.
import { CASES, SKINS, RARITIES, RARITY_ORDER, WEAPONS, WEAPON_ORDER, caseChances, rollCase } from './data.js';
import { save, writeSave, addSkin, sellItem, equipSkin, ownsSkin } from './save.js';
import { weaponIcon } from './models.js';

const $ = id => document.getElementById(id);
const WIN_INDEX = 46;
const REEL_LEN = 54;

function itemCard(skin, extra = '') {
  const r = RARITIES[skin.rarity];
  const el = document.createElement('div');
  el.className = 'item';
  el.style.setProperty('--rc', r.color);
  el.innerHTML = `<span class="rr">${r.name}</span><img alt="" src="${weaponIcon(skin.weapon, skin.id)}">
    <span class="wn">${WEAPONS[skin.weapon].name}</span><span class="sn">${skin.name}</span>${extra}`;
  return el;
}

export class CaseUI {
  constructor(game) {
    this.game = game;
    this.selected = CASES[0];
    this.spinning = false;
    this.armoryWeapon = 'pistol';
    this.lastItem = null;
    $('open-case').addEventListener('click', () => this.open());
    $('roll').addEventListener('click', e => { if (this.spinning && !e.target.closest('button')) this.skip = true; });
    window.addEventListener('keydown', e => {
      if ($('roll').classList.contains('hidden')) return;
      if (this.spinning) { if (e.code === 'Space' || e.code === 'Enter') this.skip = true; }
      else if (e.code === 'Escape') this.closeRoll();
    });
  }

  refreshChips() {
    document.querySelectorAll('[data-chips]').forEach(el => { el.textContent = Math.floor(save.chips).toLocaleString(); });
  }

  // ---- Cases screen ----
  showCases() {
    this.refreshChips();
    const list = $('case-list');
    list.innerHTML = '';
    for (const c of CASES) {
      const ch = caseChances(c);
      const b = document.createElement('button');
      b.className = 'case-card' + (c === this.selected ? ' sel' : '');
      b.style.setProperty('--c', c.color);
      b.innerHTML = `<span class="nm">${c.name}</span><span class="bl">${c.blurb}</span>
        <span class="pr"><span class="chip-ico"></span> ${c.price}</span>
        <span class="odds">${RARITY_ORDER.filter(r => ch[r]).map(r =>
          `<i style="width:${ch[r] * 100}%;background:${RARITIES[r].color}" title="${RARITIES[r].name} ${(ch[r] * 100).toFixed(1)}%"></i>`).join('')}</span>`;
      b.addEventListener('click', () => { if (!this.spinning) { this.selected = c; this.showCases(); } });
      list.appendChild(b);
    }
    this.renderContents();
    this.updateOpenButton();
  }

  renderContents() {
    const c = this.selected, ch = caseChances(c);
    const grid = $('case-contents');
    grid.innerHTML = '';
    const skins = c.skins.map(id => SKINS[id]).sort((a, b) => RARITIES[b.rarity].order - RARITIES[a.rarity].order);
    for (const s of skins) {
      const n = c.skins.filter(id => SKINS[id].rarity === s.rarity).length;
      const pct = (ch[s.rarity] / n) * 100;
      grid.appendChild(itemCard(s, `<span class="tag">${pct < 1 ? pct.toFixed(2) : pct.toFixed(1)}%${ownsSkin(s.id) ? ' ✓' : ''}</span>`));
    }
  }

  updateOpenButton() {
    const btn = $('open-case'), c = this.selected;
    btn.textContent = `Open ${c.name} — ${c.price}`;
    btn.disabled = this.spinning || save.chips < c.price;
    $('case-msg').textContent = (!this.spinning && save.chips < c.price)
      ? `You need ${c.price - Math.floor(save.chips)} more chips. Go clear some rounds.` : '';
  }

  // Opening takes over the whole screen: a big reel, then a full-screen reveal.
  open() {
    const c = this.selected;
    if (this.spinning || save.chips < c.price) { this.game.audio.deny(); return; }
    this.game.audio.unlock();
    // Decide and save the result first so a refresh mid-spin can't lose the item.
    save.chips -= c.price;
    save.casesOpened++;
    const skinId = rollCase(c);
    const item = addSkin(skinId);
    writeSave();
    this.refreshChips();
    this.spinning = true;
    this.skip = false;
    this.updateOpenButton();

    const overlay = $('roll');
    overlay.classList.remove('hidden', 'revealed');
    overlay.style.setProperty('--rc', c.color);
    $('roll-title').textContent = c.name;
    $('roll-hint').textContent = 'Click to skip';
    $('result').classList.add('hidden');
    $('reel-wrap').classList.remove('hidden');

    const reel = $('reel');
    reel.innerHTML = '';
    reel.style.transform = 'translateX(0)';
    for (let i = 0; i < REEL_LEN; i++) {
      const id = i === WIN_INDEX ? skinId : rollCase(c);
      reel.appendChild(itemCard(SKINS[id]));
    }
    // Card size depends on the window, so measure instead of assuming.
    const cardW = reel.children[0].offsetWidth;
    const pitch = reel.children[1].offsetLeft - reel.children[0].offsetLeft;
    const wrapW = $('reel-wrap').clientWidth;
    const offset = (Math.random() - 0.5) * cardW * 0.8;          // where inside the winning card we stop
    const target = WIN_INDEX * pitch + cardW / 2 + offset - wrapW / 2;
    const dur = $('fast-open').checked ? 1600 : 6000;
    const start = performance.now();
    let lastTick = -1;
    const step = now => {
      const t = this.skip ? 1 : Math.min((now - start) / dur, 1);
      const e = 1 - Math.pow(1 - t, 4);
      const x = target * e;
      reel.style.transform = `translateX(${-x}px)`;
      const idx = Math.floor((x + wrapW / 2) / pitch);
      if (idx !== lastTick) { lastTick = idx; this.game.audio.tick(); }
      if (t < 1) requestAnimationFrame(step);
      else setTimeout(() => this.reveal(item), this.skip ? 0 : 450);
    };
    requestAnimationFrame(step);
  }

  reveal(item) {
    this.spinning = false;
    this.lastItem = item;
    const c = this.selected;
    const skin = SKINS[item.skin], r = RARITIES[skin.rarity];
    this.game.audio.reveal(r.order);
    const copies = save.inventory.filter(it => it.skin === skin.id).length;
    const overlay = $('roll');
    overlay.style.setProperty('--rc', r.color);
    overlay.classList.add('revealed');
    $('reel-wrap').classList.add('hidden');
    $('roll-title').textContent = r.name;
    $('roll-hint').textContent = '';
    const res = $('result');
    res.innerHTML = `<img alt="" src="${weaponIcon(skin.weapon, skin.id)}">
      <div class="ttl">${skin.name}</div>
      <div class="sub">${WEAPONS[skin.weapon].name}${copies > 1 ? ` • duplicate (you own ${copies})` : ''}</div>
      <div class="btns"><button class="btn small" id="res-equip">Equip</button>
      <button class="btn small" id="res-sell">Sell for ${r.sell}</button>
      <button class="btn small primary" id="res-again">Open another — ${c.price}</button>
      <button class="btn small" id="res-done">Done</button></div>`;
    res.classList.remove('hidden');
    $('res-again').disabled = save.chips < c.price;
    $('res-equip').addEventListener('click', e => {
      equipSkin(skin.weapon, skin.id);
      e.target.textContent = 'Equipped';
      e.target.disabled = true;
    });
    $('res-sell').addEventListener('click', e => {
      sellItem(item.uid);
      this.game.audio.buy();
      this.refreshChips();
      e.target.textContent = 'Sold';
      e.target.disabled = true;
      $('res-equip').disabled = true;
      $('res-again').disabled = save.chips < c.price;
    });
    $('res-again').addEventListener('click', () => this.open());
    $('res-done').addEventListener('click', () => this.closeRoll());
  }

  closeRoll() {
    if (this.spinning) return;
    $('roll').classList.add('hidden');
    this.refreshChips();
    this.renderContents();
    this.updateOpenButton();
  }

  // ---- Armory screen ----
  showArmory() {
    this.refreshChips();
    const tabs = $('armory-tabs');
    tabs.innerHTML = '';
    for (const w of WEAPON_ORDER) {
      const n = save.inventory.filter(it => SKINS[it.skin].weapon === w).length;
      const b = document.createElement('button');
      b.className = 'tab' + (w === this.armoryWeapon ? ' sel' : '');
      b.innerHTML = `<span class="nm">${WEAPONS[w].name}</span><span class="ct">${n} skin${n === 1 ? '' : 's'}</span>`;
      b.addEventListener('click', () => { this.armoryWeapon = w; this.showArmory(); });
      tabs.appendChild(b);
    }
    const w = this.armoryWeapon, def = WEAPONS[w], eq = save.equipped[w] || null;
    const eqSkin = eq ? SKINS[eq] : null;
    $('armory-preview').innerHTML = `<img alt="" src="${weaponIcon(w, eq)}">
      <div><div class="ttl">${def.name}</div>
      <div class="sub">${eqSkin ? `${eqSkin.name} • ${RARITIES[eqSkin.rarity].name}` : 'Factory finish'}</div>
      <dl><dt>Damage</dt><dd>${def.melee ? `${def.damage} slash / ${def.heavyDamage} stab` : def.damage + (def.pellets > 1 ? ' × ' + def.pellets : '')}</dd>
      ${def.melee ? '' : `<dt>Fire rate</dt><dd>${def.rpm} rpm${def.auto ? ' auto' : ''}</dd><dt>Magazine</dt><dd>${def.mag} / ${def.reserve}</dd>`}
      <dt>Move speed</dt><dd>${Math.round(def.mobility * 100)}%</dd>
      <dt>Found</dt><dd>${def.melee ? 'Always carried' : w === 'pistol' ? 'Starting weapon' : def.boxOnly ? 'Mystery Slot only' : `Weapon rack, ${def.cost} pts`}</dd></dl></div>`;

    const grid = $('armory-grid');
    grid.innerHTML = '';
    const def0 = document.createElement('div');
    def0.className = 'item own' + (eq ? '' : ' eq');
    def0.style.setProperty('--rc', '#666');
    def0.innerHTML = `<span class="rr">Default</span><img alt="" src="${weaponIcon(w, null)}">
      <span class="wn">${def.name}</span><span class="sn">Factory finish</span>`;
    def0.addEventListener('click', () => { equipSkin(w, null); this.showArmory(); });
    grid.appendChild(def0);

    const items = save.inventory.filter(it => SKINS[it.skin].weapon === w)
      .sort((a, b) => RARITIES[SKINS[b.skin].rarity].order - RARITIES[SKINS[a.skin].rarity].order);
    for (const it of items) {
      const skin = SKINS[it.skin];
      const el = itemCard(skin, `<button class="sell" title="Sell this skin">Sell ${RARITIES[skin.rarity].sell}</button>`);
      el.classList.add('own');
      if (eq === skin.id) el.classList.add('eq');
      el.addEventListener('click', () => { equipSkin(w, skin.id); this.showArmory(); });
      el.querySelector('.sell').addEventListener('click', e => {
        e.stopPropagation();
        sellItem(it.uid);
        this.game.audio.buy();
        this.showArmory();
      });
      grid.appendChild(el);
    }
    if (!items.length) {
      const note = document.createElement('div');
      note.className = 'empty-note';
      note.textContent = 'No skins for this weapon yet. Open weapon cases to find some.';
      grid.appendChild(note);
    }
  }
}
