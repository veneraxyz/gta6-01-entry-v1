# Neon Harbor — strategy & design notes

## What the game is
A complete open-world crime game in one seeded city. The player starts with $50
and a phone call from the Fixer; six jobs pay $150–$500, the police escalate from
one cruiser to five, and the harbor is always one bad decision away.

## Systems
- **City** (`src/city.js`): 7×7 road grid on a 1024×1024 painted ground texture
  (asphalt, sidewalks, crosswalks, lane dashes, grass/parking blocks, harbor water
  + pier). ~105 instanced buildings from three lit-window textures, instanced trees,
  streetlights, cycling traffic lights at nine major intersections, container yard
  and pier. All buildings/trees/containers are collision AABBs.
- **Driving** (`src/vehicles.js`): arcade physics — accel, brake/reverse,
  speed-sensitive steering, handbrake. Box-built cars with spinning wheels,
  headlights/taillights, blob shadows. Car-vs-building (circle vs AABB) and
  car-vs-car push-out.
- **Traffic AI**: 14 cars in right-hand lanes, one turn decision per intersection,
  a waypoint through the intersection center, lane-keeping after the turn, braking
  for the car ahead, U-turns at the city ends.
- **Police AI**: cruiser count matches the wanted level. Pursuit steering with a
  limited turn rate, reverse-out when blocked, rams on contact (damage + shake),
  arrests a slow player on foot after 1.2 s of contact.
- **Pedestrians** (`src/people.js`): 24 walkers on the sidewalks; they flee
  gunshots, sirens and speeding cars, and fall down when hit by a car, a punch
  or a bullet.
- **Wanted** (`src/missions.js`): stealing +1, punch +1, shooting +1, hitting a
  pedestrian +2; stars decay after 18 s with no police within 45 units.
- **Missions**: six jobs (meet, pickup, deliver, 90-second cross-town timer,
  escape at 3 stars, two-leg getaway at 4 stars). Purple beacon pillar + pulsing
  ring mark the waypoint; the HUD tracker shows objective and distance.
- **Economy + save**: rewards, 15% busted / 20% wasted fines, localStorage save
  (cash + mission index), Continue on the menu.
- **HUD** (`src/hud.js`): stars, money, health bar, mission tracker, speed, canvas
  minimap (roads, player arrow, traffic dots, flashing police, pulsing mission
  marker), context prompts, toasts, crosshair.
- **Sound** (`src/audio.js`): WebAudio synth — engine hum by speed, two-tone
  sirens by police distance, gunshots, thuds, jingles, A-minor bassline loop.
- **Camera**: third-person orbit with mouse drag; gentle auto-follow toward the
  heading while moving (almost none while sprinting, so it never fights a hard
  mouse orbit); car camera follows the car with a decaying mouse offset.

## Controls
WASD move/drive, Shift run/boost, E enter/exit car, mouse drag look, click
shoot (on foot) / horn (in car), F punch, Space handbrake, P pause, M mute,
H hide HUD, wheel zoom.

## Screenshots (all real renders, `?shot=` + fixed seed)
1. `1-drive.jpg` — driving east down the main drag, HUD + minimap live, docks beacon ahead.
2. `2-foot.jpg` — on foot at a downtown intersection, pedestrians around.
3. `3-chase.jpg` — wanted 3 stars, three cruisers on your tail.
4. `4-mission.jpg` — mission in progress, driving to the docks with the beacon ahead.

## Honest rough notes
- Traffic AI can still clip a building corner when two cars jam an intersection;
  the center-waypoint turns + lane-keeping make it rare, not impossible.
- Police cut corners across sidewalks when the player does — by design they take
  the shortest path, so a chase through a block looks messy on purpose.
- The on-foot camera auto-follows the heading and can fight a hard mouse orbit
  while sprinting; the follow strength drops to 0.15× while Shift is held.
- No jump, no interiors, no radio stations: the scope is streets, cars, cops
  and jobs. That is the whole game, and it is all playable.
