// Neon Harbor — a gta6-01 entry (Node 22, standard library only).
// The game is this directory's game/ folder: plain static files a desktop browser
// loads offline (game/index.html and its ES modules, three.js vendored under
// game/vendor/, no network request). This program hands it in: it copies game/
// and screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored make.fun
// library. The game itself is an open-world crime game — a seeded 7x7 road-grid
// city with drivable cars, traffic and police AI, pedestrians, a wanted system,
// six missions from the Fixer, combat, a HUD with minimap, and synthesized sound.
// Run it with `node serve.ts` (http://localhost:8080), and hand it in with
// MAKEFUN_OUTPUT_DIR=out node main.ts outside the grader's container.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const here = fileURLToPath(new URL('.', import.meta.url));

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps: only text_max_bytes shapes the dossier bytes; the rest
// refuse an entry the scorer would refuse (more than 4 screenshots or one over
// 256 KiB; more than 993 files in game/ or 48 MiB of game files in all; a path
// under game/ over 1000 bytes).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163_840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
