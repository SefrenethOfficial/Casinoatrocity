// Persistent profile (chips, skins, settings) stored in localStorage.
import { SKINS, RARITIES } from './data.js';

const KEY = 'casinoatrocity.save.v1';

function defaults() {
  return {
    chips: 600,
    inventory: [],        // [{ uid, skin }]
    equipped: {},         // weaponId -> skinId
    nextUid: 1,
    bestRound: 0,
    totalKills: 0,
    casesOpened: 0,
    settings: { sens: 1, volume: 0.7, fov: 78, res: 240 },
  };
}

export const save = defaults();

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    const d = defaults();
    Object.assign(save, d, data);
    save.settings = Object.assign(d.settings, data.settings || {});
    save.inventory = (data.inventory || []).filter(it => SKINS[it.skin]);
    for (const w of Object.keys(save.equipped)) {
      if (!ownsSkin(save.equipped[w])) delete save.equipped[w];
    }
  } catch (e) {
    console.warn('Could not load save', e);
  }
}

export function writeSave() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* storage unavailable */ }
}

export function ownsSkin(skinId) {
  return save.inventory.some(it => it.skin === skinId);
}

export function addSkin(skinId) {
  const item = { uid: save.nextUid++, skin: skinId };
  save.inventory.push(item);
  return item;
}

export function sellItem(uid) {
  const i = save.inventory.findIndex(it => it.uid === uid);
  if (i < 0) return 0;
  const [item] = save.inventory.splice(i, 1);
  const skin = SKINS[item.skin];
  const value = RARITIES[skin.rarity].sell;
  save.chips += value;
  if (save.equipped[skin.weapon] === skin.id && !ownsSkin(skin.id)) delete save.equipped[skin.weapon];
  writeSave();
  return value;
}

export function equipSkin(weaponId, skinId) {
  if (skinId && ownsSkin(skinId)) save.equipped[weaponId] = skinId;
  else delete save.equipped[weaponId];
  writeSave();
}

export function equippedSkin(weaponId) {
  const id = save.equipped[weaponId];
  return id ? SKINS[id] : null;
}
