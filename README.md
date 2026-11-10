# Casinoatrocity

A browser FPS built with [three.js](https://threejs.org/). Survive rounds of zombies on a casino floor, then spend the chips you win on weapon cases.

**Play:** https://sefrenethofficial.github.io/Casinoatrocity/ (once GitHub Pages is enabled for this repo)

## What's in it

- **Zombies mode** — endless rounds that get bigger, tougher and faster. Earn points for hits and kills.
- **Seven weapons** — pistol, SMG, shotgun, assault rifle, sniper, LMG and a golden revolver, with aim-down-sights, recoil, reloads and melee.
- **Weapon racks, the Mystery Slot and perk machines** — spend points mid-run on guns, ammo, a random weapon, double health or faster reloads.
- **Power-up drops** — Max Ammo, Double Points, Insta-Kill and Chip Bonus.
- **Weapon cases** — three cases with a spinning reel, five rarities and 35 skins. Equip skins in the Armory or sell them back for chips.
- Chips, skins, settings and your best round are saved in your browser (localStorage). Chips are in-game only.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Shift | Sprint |
| Space | Jump |
| Left mouse | Fire |
| Right mouse | Aim |
| R | Reload |
| Q, 1, 2, mouse wheel | Swap weapon |
| V | Melee |
| F | Buy / use |
| Esc or P | Pause |

## Run it locally

There is no build step, but browsers won't load JavaScript modules from `file://`, so serve the folder:

```
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Project layout

- `index.html`, `css/style.css` — page, menus and HUD
- `js/main.js` — game loop, Zombies mode rules, menus
- `js/world.js` — the casino map, collision and zombie pathing
- `js/player.js`, `js/weapons.js`, `js/zombies.js` — player, guns, enemies
- `js/cases.js`, `js/data.js`, `js/save.js` — cases, skins, weapon stats, saved progress
- `js/models.js`, `js/audio.js` — procedural gun models and synthesised sound
- `lib/` — three.js (MIT licence)
