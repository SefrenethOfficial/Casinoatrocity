// Weapon case opening (spinning reel) and the armory where skins are equipped or sold.
import { CASES, SKINS, RARITIES, RARITY_ORDER, WEAPONS, WEAPON_ORDER, caseChances, rollCase } from './data.js';
import { save, writeSave, addSkin, sellItem, equipSkin, ownsSkin } from './save.js';
import { weaponIcon } from './models.js';

const $ = id => document.getElementById(id);
const ITEM_W = 158;   // 150px card + 8px gap
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
    this.updateOpenButton();
    $('result').classList.add('hidden');
    $('reel-idle').classList.add('hidden');

    const reel = $('reel');
    reel.innerHTML = '';
    for (let i = 0; i < REEL_LEN; i++) {
      const id = i === WIN_INDEX ? skinId : rollCase(c);
      reel.appendChild(itemCard(SKINS[id]));
    }
    const wrapW = $('reel-wrap').clientWidth;
    const offset = (Math.random() - 0.5) * 120;                 // where inside the winning card we stop
    const target = WIN_INDEX * ITEM_W + 75 + offset - wrapW / 2;
    const dur = $('fast-open').checked ? 1500 : 5600;
    const start = performance.now();
    let lastTick = -1;
    const step = now => {
      const t = Math.min((now - start) / dur, 1);
      const e = 1 - Math.pow(1 - t, 4);
      const x = target * e;
      reel.style.transform = `translateX(${-x}px)`;
      const idx = Math.floor((x + wrapW / 2) / ITEM_W);
      if (idx !== lastTick) { lastTick = idx; this.game.audio.tick(); }
      if (t < 1) requestAnimationFrame(step);
      else this.reveal(item);
    };
    requestAnimationFrame(step);
  }

  reveal(item) {
    this.spinning = false;
    this.lastItem = item;
    const skin = SKINS[item.skin], r = RARITIES[skin.rarity];
    this.game.audio.reveal(r.order);
    const copies = save.inventory.filter(it => it.skin === skin.id).length;
    const res = $('result');
    res.style.setProperty('--rc', r.color);
    res.innerHTML = `<img alt="" src="${weaponIcon(skin.weapon, skin.id)}">
      <div class="info"><div class="rar">${r.name}</div><div class="ttl">${skin.name}</div>
      <div class="sub">${WEAPONS[skin.weapon].name}${copies > 1 ? ` • duplicate (you own ${copies})` : ''}</div></div>
      <div class="btns"><button class="btn small" id="res-equip">Equip</button>
      <button class="btn small" id="res-sell">Sell for ${r.sell}</button></div>`;
    res.classList.remove('hidden');
    $('res-equip').addEventListener('click', e => {
      equipSkin(skin.weapon, skin.id);
      e.target.textContent = 'Equipped';
      e.target.disabled = true;
    });
    $('res-sell').addEventListener('click', () => {
      sellItem(item.uid);
      res.classList.add('hidden');
      this.refreshChips();
      this.renderContents();
      this.updateOpenButton();
      this.game.audio.buy();
    });
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
      <dl><dt>Damage</dt><dd>${def.damage}${def.pellets > 1 ? ' × ' + def.pellets : ''}</dd>
      <dt>Fire rate</dt><dd>${def.rpm} rpm${def.auto ? ' auto' : ''}</dd>
      <dt>Magazine</dt><dd>${def.mag} / ${def.reserve}</dd>
      <dt>Found</dt><dd>${w === 'pistol' ? 'Starting weapon' : def.boxOnly ? 'Mystery Slot only' : `Weapon rack, ${def.cost} pts`}</dd></dl></div>`;

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
