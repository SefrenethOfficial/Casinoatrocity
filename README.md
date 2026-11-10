# Casinoatrocity

A PSX-styled browser FPS built with [three.js](https://threejs.org/). Survive rounds of undead in the dungeon under the casino, then spend the chips you win on weapon cases.

**Play:** https://sefrenethofficial.github.io/Casinoatrocity/ (once GitHub Pages is enabled for this repo)

## What's in it

- **PSX look** — rendered at 240p (360p/480p in Settings), wobbling snapped vertices, chunky unfiltered textures, 15-bit dithered colour and stop-motion animation.
- **Zombies mode** — endless rounds in a torch-lit dungeon. Ghouls shamble, crawlers sprint at you from round 3, horned brutes arrive from round 5.
- **Gore** — heads come off, arms get severed, close shotgun blasts and big guns burst bodies into chunks, and blood pools, sprays up walls and spatters the screen.
- **Slow with a gun, fast with a knife** — you move slowly with a gun out, and heavier guns are slower still. Draw the knife to move at 175% speed; it slashes (hold fire) and stabs (aim button).
- **Seven guns** — pistol, SMG, shotgun, assault rifle, sniper, LMG and a golden revolver.
- **Weapon racks, the Mystery Slot and shrines** — spend points mid-run on guns, ammo, a random weapon, double health or faster reloads.
- **Power-up drops** — Max Ammo, Double Points, Insta-Kill and Chip Bonus.
- **Weapon cases** — three cases, a full-screen spinning reel, five rarities and 39 skins including knives. Equip skins in the Armory or sell them back for chips.
- Chips, skins, settings and your best round are saved in your browser (localStorage). Chips are in-game only.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Shift | Sprint |
| Space | Jump |
| Left mouse | Fire / knife slash |
| Right mouse | Aim / knife stab |
| R | Reload |
| 1, 2 | Guns |
| 3 or E | Knife (press again to go back to your gun) |
| Q, mouse wheel | Cycle weapons |
| V | Bash with the gun |
| F | Buy / use |
| Esc or P | Pause |

## Run it locally

There is no build step, but browsers won't load JavaScript modules from `file://`, so serve the folder:

```
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Updating the live game

After changing anything in `js/` or `css/`, bump the `BUILD` number near the top of `index.html`. It is added to every script and stylesheet address so browsers fetch the new files instead of reusing cached ones.

## Project layout

- `index.html`, `css/style.css` — page, menus and HUD
- `js/main.js` — game loop, Zombies mode rules, menus
- `js/psx.js` — low-res render target, vertex snapping and dither pass
- `js/world.js` — the dungeon map, collision and enemy pathing
- `js/player.js`, `js/weapons.js`, `js/zombies.js` — player, guns and knife, enemies
- `js/gore.js` — blood, gibs, decals and bullet effects
- `js/cases.js`, `js/data.js`, `js/save.js` — cases, skins, weapon stats, saved progress
- `js/models.js`, `js/audio.js` — procedural gun models and synthesised sound
- `lib/` — three.js (MIT licence)
