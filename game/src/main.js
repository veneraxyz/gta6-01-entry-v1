// Neon Harbor — main game: state machine, loop, camera, on-foot player, combat,
// car enter/exit, wanted sync, missions, save/load, and the ?shot= presets.
import * as THREE from 'three';
import { makeRng, clamp, angleDiff, dist2 } from './rng.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { buildCity, resolveCircle, nearestRoad, laneOffset } from './city.js';
import { makeCarMesh, Car, drivePlayer, Traffic, Police } from './vehicles.js';
import { Pedestrians } from './people.js';
import { MissionManager, Wanted, MISSIONS } from './missions.js';
import { HUD } from './hud.js';

const SAVE_KEY = 'neon-harbor-save-v1';
const SPAWN = { x: -40, z: -240 };
const CAR_COLORS = [0xc0392b, 0x2980b9, 0xf39c12, 0x7f8c8d, 0x8e44ad, 0x16a085, 0xd35400, 0x2c3e50];

function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s && typeof s.cash === 'number') return s;
  } catch (_) { /* corrupted save: start fresh */ }
  return null;
}

export class Game {
  constructor() {
    const params = new URLSearchParams(location.search);
    this.seed = parseInt(params.get('seed') || '1', 10) || 1;
    this.shot = params.get('shot') || null;
    this.rng = makeRng(this.seed + 500);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.domElement.className = 'webgl';
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x141a2e);
    this.scene.fog = new THREE.Fog(0x141a2e, 130, 460);
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);

    // Dusk lighting: warm sun low in the west, cool purple ambient.
    const hemi = new THREE.HemisphereLight(0x8a7fd8, 0x1a1410, 1.05);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffb070, 1.35);
    sun.position.set(-200, 160, -80);
    this.scene.add(sun);

    this.city = buildCity(this.scene, this.seed);
    this.input = new Input(this.renderer.domElement);
    this.audio = new AudioEngine();
    this.hud = new HUD();
    this.traffic = new Traffic(this.scene, this.seed, this.city.colliders);
    this.police = new Police(this.scene, this.seed);
    this.peds = new Pedestrians(this.scene, this.seed, this.city.colliders);
    this.missions = new MissionManager(this.scene);
    this.wanted = new Wanted();

    this.state = 'menu'; // menu | playing | paused | wasted | busted
    this.time = 0;
    this.cash = 50;
    this.health = 100;
    this.lastDamageAt = -10;
    this.stumbleT = 0;
    this.punchT = 0;
    this.shootT = 0;
    this.lastShotCrime = -10;
    this.lastRamAt = -10;
    this.shakeT = 0;
    this.saveT = 0;
    this.endT = 0;

    // Player on foot.
    this.player = this.makePlayerMesh();
    this.px = SPAWN.x; this.pz = SPAWN.z; this.pHeading = Math.PI / 2;
    this.pSpeed = 0; this.walkPhase = 0;
    this.playerCar = null; // Car the player is driving
    this.parked = [];
    this.spawnParkedCars();

    // Camera.
    this.camYaw = -0.4; this.camPitch = 0; this.camDist = 1; this.mouseOffset = 0;
    this.camPos = new THREE.Vector3(-60, 40, -60);

    // Tracer pool for gunshots.
    this.tracers = [];
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 }));
      line.frustumCulled = false;
      this.scene.add(line);
      this.tracers.push({ line, t: 0 });
    }
    this.muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 }));
    this.scene.add(this.muzzle);
    this.muzzleT = 0;

    this._errors = [];
    window.addEventListener('error', (e) => this._errors.push(String(e.message || e.error)));
    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    // Menu wiring.
    const save = loadSave();
    const btnContinue = document.getElementById('btnContinue');
    if (save) {
      document.getElementById('saveInfo').textContent = `JOB ${Math.min(save.missionIndex + 1, 6)} — $${save.cash}`;
      btnContinue.classList.remove('hidden');
    }
    document.getElementById('btnPlay').addEventListener('click', () => { this.audio.ensure(); this.newGame(); });
    btnContinue.addEventListener('click', () => { this.audio.ensure(); this.continueGame(save); });
    document.getElementById('btnResume').addEventListener('click', () => this.setPaused(false));
    document.getElementById('btnQuit').addEventListener('click', () => { this.save(); this.toMenu(); });

    // Debug / test hook.
    window.__game = {
      errors: this._errors,
      get state() { return game.state; },
      get fps() { return game._fps; },
      get player() { return { x: game.px, z: game.pz, inCar: !!game.playerCar, cash: game.cash, stars: game.wanted.stars, mission: game.missions.index }; },
    };
    const game = this;

    if (this.shot) this.setupShot();
    this.last = performance.now();
    this._fps = 60; this._fpsN = 0; this._fpsT = 0;
    const loop = (now) => {
      requestAnimationFrame(loop);
      const dt = clamp((now - this.last) / 1000, 0, 0.05);
      this.last = now;
      this._fpsN++; this._fpsT += dt;
      if (this._fpsT >= 1) { this._fps = this._fpsN / this._fpsT; this._fpsN = 0; this._fpsT = 0; }
      // endFrame in a finally: a throw inside frame() must never leave a stale
      // key press behind (it would re-fire next frame as a phantom press).
      try { this.frame(dt, now / 1000); } finally { this.input.endFrame(); }
    };
    requestAnimationFrame(loop);
  }

  makePlayerMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.66, 1.0, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xd81e3c }));
    body.position.y = 1.05;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44),
      new THREE.MeshLambertMaterial({ color: 0xd9a066 }));
    head.position.y = 1.8;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x1a1a22 }));
    cap.position.y = 2.05;
    const legMat = new THREE.MeshLambertMaterial({ color: 0x22303e });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.62, 0.26), legMat);
    legL.position.set(0, 0.31, 0.15);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.62, 0.26), legMat);
    legR.position.set(0, 0.31, -0.15);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x111111 }));
    gun.position.set(0.42, 1.15, 0.1);
    g.add(body, head, cap, legL, legR, gun);
    g.userData = { legL, legR };
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.7, 14),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.scene.add(shadow);
    g.userData.shadow = shadow;
    this.scene.add(g);
    return g;
  }

  spawnParkedCars() {
    const r = this.rng;
    for (let i = 0; i < 8; i++) {
      const axis = r.chance(0.5) ? 'x' : 'z';
      const road = r.pick([-160, -80, 0, 80, 160]);
      const dir = r.chance(0.5) ? 1 : -1;
      const along = r.range(-220, 220);
      const side = r.chance(0.5) ? 1 : -1;
      const mesh = makeCarMesh(this.scene, CAR_COLORS[i % CAR_COLORS.length], false);
      const car = new Car(mesh, 0, 0, 0);
      if (axis === 'x') { car.x = along; car.z = road + side * 9.5; car.heading = dir === 1 ? 0 : Math.PI; }
      else { car.x = road + side * 9.5; car.z = along; car.heading = dir === 1 ? Math.PI / 2 : -Math.PI / 2; }
      car.speed = 0;
      car.owned = false;
      car.syncMesh();
      this.parked.push(car);
    }
  }

  newGame() {
    try { localStorage.removeItem(SAVE_KEY); } catch (_) { /* private mode */ }
    this.cash = 50;
    this.startGame(0);
  }

  continueGame(save) {
    this.cash = save.cash || 50;
    this.startGame(save.missionIndex || 0);
  }

  startGame(missionIndex) {
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('pause').classList.add('hidden');
    this.hud.show(true);
    this.missions.start(missionIndex);
    this.state = 'playing';
    this.hud.setMoney(this.cash);
    this.hud.setHealth(this.health);
    this.toastMission();
  }

  toMenu() {
    this.state = 'menu';
    document.getElementById('menu').classList.remove('hidden');
    document.getElementById('pause').classList.add('hidden');
    this.hud.show(false);
  }

  setPaused(p) {
    if (this.state === 'playing' && p) {
      this.state = 'paused';
      document.getElementById('pause').classList.remove('hidden');
    } else if (this.state === 'paused' && !p) {
      this.state = 'playing';
      document.getElementById('pause').classList.add('hidden');
    }
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: Math.floor(this.cash),
        missionIndex: this.missions.index,
        completed: this.missions.done,
      }));
    } catch (_) { /* private mode */ }
  }

  toastMission() {
    const m = this.missions.current;
    if (m) this.hud.toast(`${m.name}: ${m.text}`, 3600);
  }

  damagePlayer(n) {
    if (this.state !== 'playing') return;
    this.health -= n;
    this.lastDamageAt = this.time;
    this.shakeT = Math.min(0.5, this.shakeT + 0.25);
    this.audio.thud();
    if (this.health <= 0) this.wasted();
  }

  wasted() {
    if (this.state !== 'playing') return;
    const fine = Math.floor(this.cash * 0.2);
    this.cash -= fine;
    this.state = 'wasted';
    this.endT = this.time + 2.2;
    this.hud.showWasted(true);
    this.hud.toast(`WASTED — hospital bill $${fine}`, 3000);
    this.save();
  }

  busted() {
    if (this.state !== 'playing') return;
    const fine = Math.floor(this.cash * 0.15);
    this.cash -= fine;
    this.state = 'busted';
    this.endT = this.time + 2.2;
    this.hud.showBusted(true);
    this.hud.toast(`BUSTED — bail $${fine}`, 3000);
    this.save();
  }

  respawn() {
    if (this.playerCar) {
      this.playerCar.owned = true;
      this.playerCar.speed = 0;
      this.parked.push(this.playerCar);
      this.playerCar = null;
    }
    this.px = SPAWN.x; this.pz = SPAWN.z;
    this.pHeading = Math.PI / 2;
    this.health = 100;
    this.wanted.stars = 0;
    this.wanted.quietT = 0;
    this.police.setCount(0, this.px, this.pz);
    this.hud.showWasted(false);
    this.hud.showBusted(false);
    this.state = 'playing';
    this.hud.setHealth(this.health);
    this.hud.setMoney(this.cash);
  }

  nearestCar(maxD) {
    let best = null, bd = maxD;
    const all = [...this.parked, ...this.traffic.cars, ...this.police.cars];
    for (const c of all) {
      const d = Math.hypot(c.x - this.px, c.z - this.pz);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  enterCar(car) {
    // Remove from whichever list it lives in.
    const pull = (arr) => { const i = arr.indexOf(car); if (i >= 0) arr.splice(i, 1); };
    pull(this.parked); pull(this.traffic.cars); pull(this.police.cars);
    const wasPolice = car.mesh.barRed !== null;
    this.playerCar = car;
    this.player.visible = false;
    this.player.userData.shadow.visible = false;
    if (!car.owned) {
      this.wanted.crime(wasPolice ? 2 : 1);
      this.hud.toast(wasPolice ? 'You stole a cruiser! ★★' : 'Car stolen! ★');
    }
    car.owned = true;
  }

  exitCar() {
    const car = this.playerCar;
    if (!car) return;
    const rx = -Math.sin(car.heading), rz = Math.cos(car.heading);
    this.px = car.x + rx * 3.2;
    this.pz = car.z + rz * 3.2;
    this.pHeading = car.heading;
    car.speed = 0;
    car.owned = true;
    this.parked.push(car);
    this.playerCar = null;
    this.player.visible = true;
    this.player.userData.shadow.visible = true;
  }

  punch() {
    if (this.punchT > 0 || this.playerCar) return;
    this.punchT = 0.45;
    this.audio.punch();
    const fx = Math.cos(this.pHeading), fz = Math.sin(this.pHeading);
    for (const p of this.peds.list) {
      if (p.state === 'fall') continue;
      const dx = p.x - this.px, dz = p.z - this.pz;
      const d = Math.hypot(dx, dz);
      if (d < 2.4 && (dx * fx + dz * fz) / (d || 1) > 0.4) {
        this.peds.knockDown(p);
        this.peds.scare(this.px, this.pz, 16);
        this.wanted.crime(1);
        this.hud.toast('Assault! ★');
        break;
      }
    }
  }

  shoot() {
    if (this.shootT > 0 || this.playerCar) return;
    this.shootT = 0.28;
    this.audio.gunshot();
    const dx = Math.cos(this.camYaw), dz = Math.sin(this.camYaw);
    const ox = this.px + dx * 1.2, oz = this.pz + dz * 1.2;
    const hit = this.peds.shootTest(ox, oz, dx, dz);
    const endD = hit ? Math.hypot(hit.x - ox, hit.z - oz) : 60;
    // Tracer + muzzle flash.
    const tr = this.tracers.find((t) => t.t <= 0) || this.tracers[0];
    const pos = tr.line.geometry.attributes.position;
    pos.setXYZ(0, ox, 1.4, oz);
    pos.setXYZ(1, ox + dx * endD, 1.4, oz + dz * endD);
    pos.needsUpdate = true;
    tr.line.material.opacity = 0.9;
    tr.t = 0.09;
    this.muzzle.position.set(ox, 1.4, oz);
    this.muzzle.material.opacity = 1;
    this.muzzleT = 0.05;
    if (hit) this.wanted.crime(1);
    else if (this.time - this.lastShotCrime > 2) { this.wanted.crime(1); this.lastShotCrime = this.time; }
    this.peds.scare(this.px, this.pz, 22);
  }

  // ---- ?shot= presets (reproducible states for the screenshots) ----
  setupShot() {
    this.state = 'playing';
    document.getElementById('menu').classList.add('hidden');
    this.hud.show(true);
    const r = this.rng;
    const putInCar = (x, z, heading, speed) => {
      const mesh = makeCarMesh(this.scene, 0xc0392b, false);
      const car = new Car(mesh, x, z, heading);
      car.speed = speed;
      car.owned = true;
      car.syncMesh();
      this.playerCar = car;
      this.player.visible = false;
      this.player.userData.shadow.visible = false;
      return car;
    };
    if (this.shot === 'drive') {
      this.missions.start(3); // cross-town: beacon at the docks, dead ahead east
      putInCar(-200, 4, 0, 20);
      this.camYaw = 0; this.mouseOffset = 0;
      this.shotTarget = { x: 240, z: 0 };
    } else if (this.shot === 'foot') {
      this.missions.start(0);
      // On the sidewalk west of the intersection, looking east down the road —
      // no streetlight pole in the sightline, player visible bottom-center.
      this.px = -24; this.pz = -11; this.pHeading = 0;
      this.camYaw = 0; this.camPitch = -1.0;
      // Cluster a few pedestrians around the intersection for the shot.
      this.peds.list.slice(0, 6).forEach((p, i) => {
        p.x = -18 + i * 7; p.z = -16 + (i % 3) * 12; p.state = 'walk';
      });
      this.shotTarget = null;
    } else if (this.shot === 'chase') {
      this.missions.start(4);
      this.wanted.stars = 3;
      putInCar(0, 84, -Math.PI / 2, 24);
      this.camYaw = -Math.PI / 2; this.mouseOffset = 0;
      // Front-side camera: the fleeing car faces the lens, the cruisers on its
      // tail stay in frame behind it.
      this.shotCamOffset = { x: -12, y: 6, z: -20 };
      // Three cruisers closing in from behind, staggered across the lanes.
      const spots = [[-4, 100], [4, 106], [-8, 94]];
      for (let i = 0; i < 3; i++) {
        const mesh = makeCarMesh(this.scene, 0x11151c, true);
        const car = new Car(mesh, spots[i][0], spots[i][1], -Math.PI / 2);
        car.speed = 27;
        car.syncMesh();
        this.police.cars.push(car);
      }
      this.shotTarget = { x: 0, z: -240 };
    } else if (this.shot === 'mission') {
      // Closer to the docks so the beacon pillar + container yard read in frame.
      this.missions.start(3);
      putInCar(80, 4, 0, 22);
      this.camYaw = 0; this.mouseOffset = 0;
      this.shotTarget = { x: 240, z: 0 };
    } else {
      this.missions.start(0);
      this.shotTarget = null;
    }
    this.hud.setMoney(this.cash);
    this.hud.setHealth(this.health);
  }

  // Autopilot for shot mode: steer the player car toward a target point.
  autoDrive(dt) {
    const car = this.playerCar;
    if (!car || !this.shotTarget) return;
    const desired = Math.atan2(this.shotTarget.z - car.z, this.shotTarget.x - car.x);
    const steer = clamp(angleDiff(car.heading, desired) * 2.2, -1, 1);
    const fake = { axis: () => ({ x: -steer, y: 1 }), held: () => false };
    drivePlayer(car, fake, dt, this.city.colliders,
      [...this.traffic.cars, ...this.police.cars, ...this.parked], null);
  }

  frame(dt, now) {
    this.time = now;
    if (this.state === 'menu') {
      // Cinematic orbit behind the menu + ambient traffic.
      const a = now * 0.03;
      this.camera.position.set(Math.cos(a) * 210, 110, Math.sin(a) * 210);
      this.camera.lookAt(0, 0, 0);
      this.traffic.update(dt, { x: 0, z: 0, speed: 0 }, []);
      this.peds.update(dt, { px: 0, pz: 0, cx: 0, cz: 0, carSpeed: 0 });
      this.city.update(dt, now);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.state === 'paused') { this.renderer.render(this.scene, this.camera); return; }
    if (this.state === 'wasted' || this.state === 'busted') {
      if (this.time >= this.endT) this.respawn();
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.state !== 'playing') { this.renderer.render(this.scene, this.camera); return; }

    // --- Global keys ---
    const input = this.input;
    if (input.pressed('KeyP')) this.setPaused(true);
    if (input.pressed('KeyM')) { this.audio.setMuted(!this.audio.muted); this.hud.toast(this.audio.muted ? 'Muted' : 'Sound on'); }
    if (input.pressed('KeyH')) this.hud.setHidden(!this.hud.el.hud.classList.contains('hidden'));
    const wheel = input.consumeWheel();
    if (wheel) this.camDist = clamp(this.camDist + wheel * 0.0006, 0.7, 1.7);

    // --- Camera orbit input ---
    const drag = input.consumeDrag();
    if (drag.dx || drag.dy) {
      if (this.playerCar) this.mouseOffset -= drag.dx * 0.004;
      else this.camYaw -= drag.dx * 0.005;
      this.camPitch = clamp(this.camPitch + drag.dy * 0.002, -1.2, 2.2);
    }
    if (this.playerCar) {
      if (!drag.dx) this.mouseOffset *= Math.max(0, 1 - dt * 1.2);
      this.mouseOffset = clamp(this.mouseOffset, -1.2, 1.2);
    }

    // --- Player ---
    if (input.pressed('KeyE')) {
      if (this.playerCar) this.exitCar();
      else {
        const car = this.nearestCar(4.5);
        if (car) this.enterCar(car);
      }
    }
    if (input.pressed('KeyF')) this.punch();
    if (input.consumeClick()) {
      if (this.playerCar) this.audio.horn();
      else this.shoot();
    }
    // Recomputed AFTER the E check: the stale value would dereference a car
    // the player just exited (the E-exit null crash + phantom re-enter bug).
    const inCar = !!this.playerCar;
    if (inCar) {
      const car = this.playerCar;
      if (this.shot) this.autoDrive(dt);
      else {
        drivePlayer(car, input, dt, this.city.colliders,
          [...this.traffic.cars, ...this.police.cars, ...this.parked],
          () => this.audio.thud());
      }
      // Running over pedestrians.
      for (const p of this.peds.list) {
        if (p.state === 'fall') continue;
        if (dist2(car.x, car.z, p.x, p.z) < 2.6 * 2.6 && Math.abs(car.speed) > 3) {
          if (this.peds.knockDown(p)) {
            this.wanted.crime(2);
            this.audio.thud();
            this.peds.scare(car.x, car.z, 20);
            this.hud.toast('Pedestrian hit! ★★');
          }
        }
      }
      this.px = car.x; this.pz = car.z;
    } else {
      // On foot movement, relative to the camera.
      const ax = input.axis();
      const sprint = input.held('ShiftLeft') || input.held('ShiftRight');
      const fx = Math.cos(this.camYaw), fz = Math.sin(this.camYaw);
      const rx = -Math.sin(this.camYaw), rz = Math.cos(this.camYaw);
      let mx = fx * ax.y + rx * ax.x;
      let mz = fz * ax.y + rz * ax.x;
      const ml = Math.hypot(mx, mz);
      if (ml > 0.01) { mx /= ml; mz /= ml; }
      const targetSpeed = this.stumbleT > 0 ? 0 : (ml > 0.01 ? (sprint ? 8.5 : 5) : 0);
      this.pSpeed += (targetSpeed - this.pSpeed) * Math.min(1, dt * 10);
      if (ml > 0.01) {
        const targetHeading = Math.atan2(mz, mx);
        this.pHeading += angleDiff(this.pHeading, targetHeading) * Math.min(1, dt * 10);
        this.walkPhase += dt * this.pSpeed * 1.6;
      }
      this.px += Math.cos(this.pHeading) * this.pSpeed * dt;
      this.pz += Math.sin(this.pHeading) * this.pSpeed * dt;
      this.px = clamp(this.px, -278, 248);
      this.pz = clamp(this.pz, -278, 278);
      const pos = { x: this.px, z: this.pz };
      resolveCircle(pos, 0.6, this.city.colliders);
      this.px = pos.x; this.pz = pos.z;
      // Walk-cycle legs.
      const swing = Math.sin(this.walkPhase) * 0.45 * Math.min(1, this.pSpeed / 5);
      this.player.userData.legL.rotation.x = swing;
      this.player.userData.legR.rotation.x = -swing;
      // Camera auto-follow: ease toward the heading while moving, but never
      // fight a hard mouse orbit — and barely follow while sprinting.
      const sinceMouse = now - this.input.lastMouseAt;
      if (ml > 0.01 && sinceMouse > 0.6) {
        const strength = sprint ? 0.15 : 1.0;
        this.camYaw += angleDiff(this.camYaw, this.pHeading) * Math.min(1, dt * strength);
      }
      // Cars hitting the player on foot.
      const allCars = [...this.traffic.cars, ...this.police.cars];
      for (const c of allCars) {
        if (dist2(c.x, c.z, this.px, this.pz) < 1.9 * 1.9 && Math.abs(c.speed) > 5 && this.stumbleT <= 0) {
          this.stumbleT = 0.6;
          this.damagePlayer(25);
          this.px += (this.px - c.x) * 0.4;
          this.pz += (this.pz - c.z) * 0.4;
        }
      }
    }
    this.stumbleT = Math.max(0, this.stumbleT - dt);
    this.punchT = Math.max(0, this.punchT - dt);
    this.shootT = Math.max(0, this.shootT - dt);
    this.shakeT = Math.max(0, this.shakeT - dt);

    // Sync the player mesh.
    this.player.position.set(this.px, 0, this.pz);
    this.player.rotation.y = -this.pHeading;
    this.player.userData.shadow.position.set(this.px, 0.02, this.pz);

    // --- World ---
    this.traffic.update(dt, this.playerCar || { x: this.px, z: this.pz, speed: this.pSpeed }, this.police.cars);
    this.peds.update(dt, {
      px: this.px, pz: this.pz,
      cx: inCar ? this.playerCar.x : this.px,
      cz: inCar ? this.playerCar.z : this.pz,
      carSpeed: inCar ? Math.abs(this.playerCar.speed) : 0,
    });
    this.city.update(dt, now);

    // --- Wanted + police ---
    const nearestPolice = this.police.nearestDist(this.px, this.pz);
    this.wanted.update(dt, nearestPolice);
    this.police.setCount(this.wanted.stars, this.px, this.pz);
    this.police.update(dt, now, { x: this.px, z: this.pz }, inCar,
      (car) => {
        if (this.time - this.lastRamAt < 0.5 || !this.playerCar) return;
        this.lastRamAt = this.time;
        this.playerCar.speed *= 0.88;
        this.playerCar.x += Math.cos(car.heading) * 1.2;
        this.playerCar.z += Math.sin(car.heading) * 1.2;
        this.damagePlayer(6);
      },
      () => this.busted());
    // Sirens + engine + bassline.
    this.audio.siren(nearestPolice === Infinity ? 0 : clamp(1 - nearestPolice / 70, 0, 1));
    this.audio.engine(inCar ? Math.abs(this.playerCar.speed) / 40 : 0, inCar);
    this.audio.bassline(now);

    // --- Missions ---
    const mres = this.missions.update(dt, this.px, this.pz);
    if (mres === 'complete') {
      const m = this.missions.current;
      this.cash += m.reward;
      this.audio.jingle();
      if (m.reward > 0) this.hud.toast(`JOB COMPLETE — +$${m.reward}`);
      const allDone = this.missions.complete();
      if (allDone) {
        this.cash += 500;
        this.hud.toast('ALL JOBS DONE — the city is yours. +$500', 5000);
      } else this.toastMission();
      this.save();
    } else if (mres === 'failed') {
      this.hud.toast('TOO SLOW — the Fixer is not happy. Job restarted.', 3600);
      this.missions.fail();
      this.toastMission();
    }
    this.missions.updateBeacon(now);

    // Health regen after 4 s out of trouble.
    if (this.health < 100 && this.time - this.lastDamageAt > 4) {
      this.health = Math.min(100, this.health + 10 * dt);
    }

    // --- Camera ---
    const camTarget = inCar ? this.playerCar : null;
    let desiredPos, lookAt;
    if (this.shotCamOffset && camTarget) {
      // Shot preset: fixed world offset so the action stays composed.
      desiredPos = new THREE.Vector3(
        camTarget.x + this.shotCamOffset.x,
        this.shotCamOffset.y,
        camTarget.z + this.shotCamOffset.z,
      );
      lookAt = new THREE.Vector3(
        camTarget.x + Math.cos(camTarget.heading) * 6,
        1.6,
        camTarget.z + Math.sin(camTarget.heading) * 6,
      );
    } else if (camTarget) {
      const yaw = camTarget.heading + this.mouseOffset;
      const d = 13 * this.camDist, h = 5.5 + this.camPitch;
      desiredPos = new THREE.Vector3(
        camTarget.x - Math.cos(yaw) * d,
        h,
        camTarget.z - Math.sin(yaw) * d,
      );
      lookAt = new THREE.Vector3(
        camTarget.x + Math.cos(camTarget.heading) * 6,
        1.6,
        camTarget.z + Math.sin(camTarget.heading) * 6,
      );
    } else {
      const d = 9 * this.camDist, h = 4.5 + this.camPitch;
      desiredPos = new THREE.Vector3(
        this.px - Math.cos(this.camYaw) * d,
        h,
        this.pz - Math.sin(this.camYaw) * d,
      );
      lookAt = new THREE.Vector3(
        this.px + Math.cos(this.camYaw) * 2,
        1.5,
        this.pz + Math.sin(this.camYaw) * 2,
      );
    }
    this.camPos.lerp(desiredPos, 1 - Math.exp(-dt * 6));
    this.camera.position.copy(this.camPos);
    if (this.shakeT > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeT * 0.9;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeT * 0.5;
    }
    this.camera.lookAt(lookAt);

    // Tracers + muzzle fade.
    for (const tr of this.tracers) {
      if (tr.t > 0) {
        tr.t -= dt;
        if (tr.t <= 0) tr.line.material.opacity = 0;
      }
    }
    if (this.muzzleT > 0) {
      this.muzzleT -= dt;
      if (this.muzzleT <= 0) this.muzzle.material.opacity = 0;
    }

    // --- HUD ---
    this.hud.setStars(this.wanted.stars);
    this.hud.setMoney(this.cash);
    this.hud.setHealth(this.health);
    const m = this.missions.current;
    if (m && !this.missions.done) {
      const d = Math.hypot(this.px - m.target.x, this.pz - m.target.z);
      const timer = m.timeLimit ? ` — ${Math.ceil(this.missions.timeLeft)}s` : '';
      this.hud.setMission(m.name, m.text, `${Math.round(d)}m${timer}`);
    } else if (this.missions.done) {
      this.hud.setMission('NEON HARBOR', 'All jobs done. Free roam — cause chaos.', '');
    }
    this.hud.setSpeed(inCar ? Math.abs(this.playerCar.speed) * 3.6 : 0, inCar);
    this.hud.setCrosshair(!inCar);
    let prompt = '';
    if (!inCar) {
      const car = this.nearestCar(4.5);
      if (car) prompt = '<b>E</b> — ' + (car.owned ? 'Enter car' : 'Steal car');
    } else {
      prompt = '<b>E</b> — Exit car';
    }
    this.hud.setPrompt(prompt);
    this.hud.drawMinimap({
      time: now,
      px: this.px, pz: this.pz,
      heading: inCar ? this.playerCar.heading : this.pHeading,
      traffic: this.traffic.cars,
      police: this.police.cars,
      missionTarget: this.missions.done ? null : this.missions.current.target,
    });

    // Periodic save.
    this.saveT += dt;
    if (this.saveT > 10) { this.saveT = 0; this.save(); }

    this.renderer.render(this.scene, this.camera);
  }
}

new Game();
