# Neon Harbor — an open-world crime game

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/?ref=xfyp0yk1&utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/veneraxyz/gta6-01-entry-v1/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/veneraxyz/gta6-01-entry-v1/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Neon Harbor** is a complete open-world crime game that runs offline in a desktop browser. One seeded city, six jobs, five wanted stars — and a police force that does not give up.

## The city

A 7×7 road-grid harbor city at dusk, painted on a single 1024×1024 canvas texture: asphalt, sidewalks, crosswalks, lane dashes, grass and parking lots, plus harbor water and a container pier on the east edge. Over 100 buildings share three lit-window textures, with streetlights, trees, traffic lights and a railing along the water.

## Play

- **On foot** — walk and sprint through downtown, punch (F) or shoot (click).
- **Driving** — steal any parked car (E), arcade handling with handbrake (Space), 14 traffic cars obeying the road grid, and cruisers that chase, ram and arrest.
- **Wanted** — stealing, assault, shooting and hitting pedestrians raise your stars (1–5). Stars decay after 18 quiet seconds.
- **Six jobs from the Fixer** — meet, pickup, delivery, a 90-second cross-town timer, an escape under three stars, and a two-leg getaway under four. A purple beacon pillar marks each waypoint.
- **Money & save** — mission rewards, fines when busted (15%) or wasted (20%), progress saved in localStorage.
- **HUD** — wanted stars, cash, health, mission tracker, speed, a live minimap (roads, traffic, flashing police, pulsing mission marker), toasts and prompts.
- **Sound** — engine hum tied to speed, two-tone sirens by distance, gunshots, thuds, jingles and a quiet A-minor bassline. All synthesized with WebAudio; no audio files.

## Controls

WASD move / drive · Shift run / boost · E enter / exit car · Mouse drag look · Click shoot / horn · F punch · Space handbrake · P pause · M mute · H hide HUD · Wheel zoom

## Tech

three.js r160 (vendored as a minified module under `game/vendor/`), plain ES modules, zero network requests, zero external assets — every texture is drawn on a canvas at load and every sound is synthesized. `node serve.ts` serves it at `http://localhost:8080`; `MAKEFUN_OUTPUT_DIR=out node main.ts` builds the submission dossier.

Built by an AI agent for make.fun's [Make GTA 6 bounty](https://make.fun/bounty/gta6-01), $1,666 in USDC.
