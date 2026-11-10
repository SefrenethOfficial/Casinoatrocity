// Static game data: weapons, skin rarities, skins and cases.

export const RARITIES = {
  common:    { name: 'Common',    color: '#8fa3b8', sell: 40,   order: 0 },
  uncommon:  { name: 'Uncommon',  color: '#4b8dff', sell: 90,   order: 1 },
  rare:      { name: 'Rare',      color: '#a05bff', sell: 220,  order: 2 },
  epic:      { name: 'Epic',      color: '#ff4fc3', sell: 550,  order: 3 },
  legendary: { name: 'Legendary', color: '#ffc93c', sell: 1600, order: 4 },
};
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

// rpm = rounds per minute, spread in radians, recoil in radians of camera kick per shot.
export const WEAPONS = {
  // The knife is always carried. Holding it is the only way to move fast.
  knife: {
    name: 'Shiv', melee: true, auto: true, rpm: 135, damage: 170, heavyDamage: 480, pellets: 0, headMult: 1,
    mag: 0, reserve: 0, reload: 0, spread: 0, adsSpread: 0, recoil: 0,
    hip: [0.2, -0.16, -0.34], ads: [0.2, -0.16, -0.34], adsFov: 1, sound: 'slash', pierce: 1, mobility: 1.75,
  },
  pistol: {
    name: 'M9 Dealer', auto: false, rpm: 420, damage: 34, pellets: 1, headMult: 2,
    mag: 12, reserve: 96, reload: 1.4, spread: 0.006, adsSpread: 0.001, recoil: 0.018,
    hip: [0.2, -0.17, -0.38], ads: [0, -0.068, -0.3], adsFov: 0.82, sound: 'pistol', pierce: 1, mobility: 1,
  },
  smg: {
    name: 'Vector-21', auto: true, rpm: 880, damage: 24, pellets: 1, headMult: 2,
    mag: 30, reserve: 180, reload: 1.9, spread: 0.018, adsSpread: 0.006, recoil: 0.009,
    hip: [0.2, -0.19, -0.36], ads: [0, -0.098, -0.32], adsFov: 0.8, sound: 'smg', pierce: 1, cost: 1000, mobility: 0.97,
  },
  shotgun: {
    name: 'Pump Boss', auto: false, rpm: 75, damage: 26, pellets: 8, headMult: 1.5,
    mag: 6, reserve: 42, reload: 2.6, spread: 0.06, adsSpread: 0.045, recoil: 0.06,
    hip: [0.18, -0.19, -0.4], ads: [0, -0.09, -0.3], adsFov: 0.85, sound: 'shotgun', pierce: 1, cost: 1200, mobility: 0.92, gibRange: 7,
  },
  ar: {
    name: 'AK-Ace', auto: true, rpm: 620, damage: 42, pellets: 1, headMult: 2,
    mag: 30, reserve: 180, reload: 2.3, spread: 0.014, adsSpread: 0.003, recoil: 0.014,
    hip: [0.18, -0.2, -0.4], ads: [0, -0.11, -0.3], adsFov: 0.72, sound: 'ar', pierce: 1, cost: 1800, mobility: 0.9,
  },
  sniper: {
    name: 'Long Shot', auto: false, rpm: 48, damage: 420, pellets: 1, headMult: 3,
    mag: 5, reserve: 30, reload: 3.0, spread: 0.05, adsSpread: 0, recoil: 0.07,
    hip: [0.18, -0.2, -0.36], ads: [0, -0.115, -0.12], adsFov: 0.25, scope: true, sound: 'sniper', pierce: 4, boxOnly: true, mobility: 0.84, gibRange: 99,
  },
  lmg: {
    name: 'House Edge', auto: true, rpm: 720, damage: 46, pellets: 1, headMult: 2,
    mag: 100, reserve: 300, reload: 4.2, spread: 0.022, adsSpread: 0.008, recoil: 0.011,
    hip: [0.18, -0.22, -0.38], ads: [0, -0.12, -0.26], adsFov: 0.78, sound: 'lmg', pierce: 2, boxOnly: true, mobility: 0.76,
  },
  revolver: {
    name: 'The Jackpot', auto: false, rpm: 150, damage: 900, pellets: 1, headMult: 2,
    mag: 6, reserve: 48, reload: 2.4, spread: 0.004, adsSpread: 0, recoil: 0.09,
    hip: [0.2, -0.17, -0.38], ads: [0, -0.075, -0.3], adsFov: 0.75, sound: 'revolver', pierce: 5, boxOnly: true, mobility: 0.97, gibRange: 99,
  },
};
export const WEAPON_ORDER = ['knife', 'pistol', 'smg', 'shotgun', 'ar', 'sniper', 'lmg', 'revolver'];

// Weapons the Mystery Slot can pay out.
export const BOX_POOL = ['smg', 'shotgun', 'ar', 'ar', 'sniper', 'sniper', 'lmg', 'lmg', 'revolver'];

const S = (id, weapon, name, rarity, pattern, c1, c2, accent) =>
  ({ id, weapon, name, rarity, pattern, c1, c2, accent: accent || c2 });

export const SKIN_LIST = [
  S('p_felt',  'pistol', 'Felt Green',    'common',    'solid',   '#1f6b3a', '#1f6b3a', '#2a2218'),
  S('p_chips', 'pistol', 'Chip Stack',    'uncommon',  'stripes', '#c0392b', '#f1ede4', '#1a1a1a'),
  S('p_snake', 'pistol', 'Snake Eyes',    'rare',      'dots',    '#f1ede4', '#111111', '#b3121d'),
  S('p_neon',  'pistol', 'Neon Strip',    'epic',      'neon',    '#0e0e18', '#ff2bd6', '#1b1b2a'),
  S('p_gold',  'pistol', 'Gold Bullion',  'legendary', 'gold',    '#ffcf4a', '#a8740a', '#2a1c06'),

  S('s_velvet','smg', 'Velvet Rope',      'common',    'solid',   '#6d1027', '#6d1027', '#c9a227'),
  S('s_camo',  'smg', 'Parking Garage',   'common',    'camo',    '#5c6168', '#2f3338', '#222222'),
  S('s_roul',  'smg', 'Double Zero',      'uncommon',  'checker', '#b3121d', '#141414', '#1f6b3a'),
  S('s_suits', 'smg', 'Card Shark',       'rare',      'suits',   '#f1ede4', '#b3121d', '#141414'),
  S('s_neon',  'smg', 'Vegas Nights',     'epic',      'neon',    '#0b1220', '#21e6ff', '#101828'),
  S('s_gold',  'smg', 'House Money',      'legendary', 'gold',    '#ffd65e', '#2f8f4e', '#0f3d22'),

  S('g_wood',  'shotgun', 'Bar Top',      'common',    'solid',   '#6b4423', '#6b4423', '#2b1a0c'),
  S('g_dots',  'shotgun', 'Loaded Dice',  'uncommon',  'dots',    '#b3121d', '#f1ede4', '#141414'),
  S('g_stripe','shotgun', 'Cherry Bomb',  'rare',      'stripes', '#d1123b', '#1c0a10', '#2f8f4e'),
  S('g_neon',  'shotgun', 'Last Call',    'epic',      'neon',    '#160c06', '#ff8a1f', '#22140a'),
  S('g_gold',  'shotgun', 'Big Winner',   'legendary', 'gold',    '#ffcf4a', '#b3121d', '#4a0b12'),

  S('a_sand',  'ar', 'Desert Mirage',     'common',    'camo',    '#b59a6a', '#7d6540', '#3a2f1f'),
  S('a_stripe','ar', 'Pit Boss',          'uncommon',  'stripes', '#141414', '#c9a227', '#141414'),
  S('a_check', 'ar', 'Roulette',          'rare',      'checker', '#b3121d', '#141414', '#1f6b3a'),
  S('a_suits', 'ar', 'Royal Flush',       'epic',      'suits',   '#141a3a', '#ffcf4a', '#b3121d'),
  S('a_gold',  'ar', 'All In',            'legendary', 'gold',    '#ffcf4a', '#a8740a', '#141414'),

  S('n_black', 'sniper', 'Blackjack',     'common',    'solid',   '#16161a', '#16161a', '#e8e4da'),
  S('n_camo',  'sniper', 'Eye in the Sky','uncommon',  'camo',    '#2d5f8a', '#173650', '#0d1c2b'),
  S('n_suits', 'sniper', 'Poker Face',    'rare',      'suits',   '#141414', '#e8e4da', '#b3121d'),
  S('n_neon',  'sniper', 'High Stakes',   'epic',      'neon',    '#07140c', '#3dff7a', '#0c2014'),
  S('n_gold',  'sniper', 'Lucky 7',       'legendary', 'gold',    '#ffd65e', '#b3121d', '#1a1a1a'),

  S('l_camo',  'lmg', 'Security Detail',  'common',    'camo',    '#3d4a3a', '#232b21', '#141414'),
  S('l_check', 'lmg', 'Card Counter',     'uncommon',  'checker', '#e8e4da', '#27408b', '#141414'),
  S('l_stripe','lmg', 'Bouncer',          'rare',      'stripes', '#141414', '#b3121d', '#c9a227'),
  S('l_neon',  'lmg', 'Overtime',         'epic',      'neon',    '#120a1e', '#a45bff', '#1b1030'),
  S('l_gold',  'lmg', 'The Whale',        'legendary', 'gold',    '#ffcf4a', '#27408b', '#0e1a3d'),

  S('r_ivory', 'revolver', 'Ivory Grip',        'uncommon',  'solid', '#8d8f94', '#8d8f94', '#efe6cf'),
  S('r_suits', 'revolver', "Dead Man's Hand",   'rare',      'suits', '#1a1a1a', '#e8e4da', '#3a2412'),
  S('r_neon',  'revolver', 'Slot Fever',        'epic',      'neon',  '#1a0610', '#ff3355', '#2a0a18'),
  S('r_gold',  'revolver', 'Jackpot Royale',    'legendary', 'gold',  '#ffd65e', '#a8740a', '#7a0f1c'),

  S('k_bone',  'knife', 'Bone Saw',           'rare',      'solid', '#d8ceb0', '#d8ceb0', '#3a2412'),
  S('k_blood', 'knife', 'Bloodletter',        'epic',      'camo',  '#7a0a10', '#3a0206', '#141414'),
  S('k_neon',  'knife', 'Last Rites',         'epic',      'neon',  '#0c0a14', '#ff2bd6', '#1a1026'),
  S('k_gold',  'knife', 'Gilded Fang',        'legendary', 'gold',  '#ffd65e', '#a8740a', '#4a0b12'),
];
export const SKINS = Object.fromEntries(SKIN_LIST.map(s => [s.id, s]));

const skinsFor = (weapons, rarities) => SKIN_LIST
  .filter(s => weapons.includes(s.weapon) && (!rarities || rarities.includes(s.rarity)))
  .map(s => s.id);

// odds are relative weights per rarity (they sum to 100 for readability).
export const CASES = [
  {
    id: 'low', name: 'Low Roller Case', price: 250, color: '#4b8dff',
    blurb: 'Sidearms, SMGs and shotguns.',
    skins: skinsFor(['pistol', 'smg', 'shotgun']),
    odds: { common: 58, uncommon: 27, rare: 11, epic: 3.2, legendary: 0.8 },
  },
  {
    id: 'high', name: 'High Roller Case', price: 600, color: '#a05bff',
    blurb: 'Rifles, snipers, LMGs and a revolver grip.',
    skins: [...skinsFor(['ar', 'sniper', 'lmg']), 'r_ivory'],
    odds: { common: 40, uncommon: 32, rare: 19, epic: 7, legendary: 2 },
  },
  {
    id: 'jackpot', name: 'Jackpot Case', price: 1500, color: '#ffc93c',
    blurb: 'Rare or better, every weapon. Knives live here.',
    skins: skinsFor(WEAPON_ORDER, ['rare', 'epic', 'legendary']),
    odds: { rare: 62, epic: 28, legendary: 10 },
  },
];

// Effective per-rarity chances for a case (only rarities the case actually contains).
export function caseChances(c) {
  const present = {};
  for (const id of c.skins) present[SKINS[id].rarity] = (present[SKINS[id].rarity] || 0) + 1;
  let total = 0;
  for (const r of RARITY_ORDER) if (present[r] && c.odds[r]) total += c.odds[r];
  const out = {};
  for (const r of RARITY_ORDER) if (present[r] && c.odds[r]) out[r] = c.odds[r] / total;
  return out;
}

export function rollCase(c, rng = Math.random) {
  const chances = caseChances(c);
  let x = rng(), rarity = null;
  for (const r of RARITY_ORDER) {
    if (!(r in chances)) continue;
    rarity = r;
    if (x < chances[r]) break;
    x -= chances[r];
  }
  const pool = c.skins.filter(id => SKINS[id].rarity === rarity);
  return pool[Math.floor(rng() * pool.length) % pool.length];
}
