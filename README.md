# Casinoatrocity

A PSX-styled browser FPS built with [three.js](https://threejs.org/). Check in to the Last Call Hotel, ride the elevator down, and survive a randomly generated, creepy old hotel — one dark floor at a time.

**Play:** https://sefrenethofficial.github.io/Casinoatrocity/ (once GitHub Pages is enabled for this repo)

## What's in it

- **The lobby** — you start outside the hotel in the rain, then walk into a cozy, fireplace-lit hallway. Podiums open the Weapon Cases, Knife Crates, Armory and Settings; an elevator takes you down into the game.
- **The elevator** — a ride-down intermission (with its own music) where you can buy a **Flashlight** and **Lockpicks** with chips before the doors open.
- **A randomly generated hotel** — every floor is a fresh maze of dark wooden rooms joined by **numbered doors**, some **locked** (pick them with a lockpick). Each room spawns its own monsters when you step in. Rooms are dark — bring a light. Find the **stairs down** to descend to a bigger, tougher floor.
- **Enemies** — bellhops shamble, maids sprint, lodgers scuttle in on all fours and the butcher soaks damage and hits hard. Gore, dismemberment and blood included.
- **The face** — every few rooms the lights may stutter and a song kicks in: a few seconds later something flies down the corridor and kills everything in its path. Hide in a wardrobe (F) until it passes.
- **A proper death screen** — when you die it tells you exactly what got you, where, and how to avoid it next time.
- **PSX look** — rendered at 240p (360p/480p in Settings) with vertex wobble, chunky textures, dithering and choppy animation.
- **Weapons & cosmetics** — pistol, SMG, shotgun, AR, sniper, LMG, revolver and a knife, plus weapon cases and knife crates with dozens of skins. Chips, skins, settings and your deepest floor are saved in your browser.
- **Music** — Dawn of the Doors (lobby), Elevator Jam (elevator) and Guiding Light (death).

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
| 3 or E | Knife (you move fast with it out) |
| Q, wheel | Cycle weapons |
| V | Bash with the gun |
| F | Open door / use |
| L | Toggle flashlight |
| Esc | Pause |

## Run it locally

No build step, but serve the folder (modules won't load from `file://`):

```
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Project layout

- `index.html`, `css/style.css` — page, menus, HUD, death and elevator screens
- `js/main.js` — game loop, state flow (lobby → elevator → hotel → death)
- `js/lobby.js` — the rainy exterior and cozy hall
- `js/build.js` — shared art kit: textures, furniture, and the geometry batcher used by the lobby and hotel
- `js/world.js` — the procedural hotel generator, collision and enemy pathing
- `js/player.js`, `js/weapons.js`, `js/zombies.js` — player, guns/knife, enemies
- `js/gore.js`, `js/psx.js` — blood/gibs and the PSX render pass
- `js/cases.js`, `js/data.js`, `js/save.js` — cases, skins, weapon stats, saved progress
- `js/models.js`, `js/audio.js`, `js/music.js` — procedural models, synth SFX, music
- `assets/` — the music tracks and recorded SFX; `lib/` — three.js (MIT)

## Updating the live game

After changing anything in `js/` or `css/`, bump the `BUILD` number near the top of `index.html` so browsers fetch the new files instead of cached ones.
