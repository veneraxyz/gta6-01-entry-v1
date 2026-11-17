// Pedestrians: 24 walkers on the sidewalks. They flee gunshots, sirens and
// speeding cars, and fall down when hit (by a car, a punch or a bullet).
import * as THREE from 'three';
import { makeRng, clamp } from './rng.js';
import { ROADS, resolveCircle } from './city.js';

const SHIRTS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0xe67e22, 0x95a5a6];
const PANTS = [0x2c3e50, 0x34495e, 0x7f8c8d, 0x5d4037];

function blobShadow(scene) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(0.7, 14),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  scene.add(m);
  return m;
}

export class Pedestrians {
  constructor(scene, seed, colliders) {
    this.rng = makeRng(seed + 303);
    this.colliders = colliders;
    this.list = [];
    for (let i = 0; i < 24; i++) {
      const g = new THREE.Group();
      const shirt = new THREE.MeshLambertMaterial({ color: SHIRTS[i % SHIRTS.length] });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.95, 0.36), shirt);
      body.position.y = 1.05;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42),
        new THREE.MeshLambertMaterial({ color: 0xd9a066 }));
      head.position.y = 1.78;
      const legMat = new THREE.MeshLambertMaterial({ color: PANTS[i % PANTS.length] });
      const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6, 0.24), legMat);
      legL.position.set(0, 0.3, 0.14);
      const legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6, 0.24), legMat);
      legR.position.set(0, 0.3, -0.14);
      g.add(body, head, legL, legR);
      scene.add(g);
      const shadow = blobShadow(scene);
      const ped = {
        group: g, shadow, legL, legR,
        x: 0, z: 0, heading: 0, speed: this.rng.range(1.4, 2.4),
        state: 'walk', timer: 0, phase: this.rng.range(0, 6),
        road: 0, axis: 'x', dir: 1, side: 1,
      };
      this.placeOnSidewalk(ped);
      this.list.push(ped);
    }
  }

  placeOnSidewalk(ped) {
    const r = this.rng;
    ped.axis = r.chance(0.5) ? 'x' : 'z';
    ped.road = r.pick(ROADS);
    ped.dir = r.chance(0.5) ? 1 : -1;
    ped.side = r.chance(0.5) ? 1 : -1;
    const along = r.range(-260, 260);
    // Sidewalk band: 8 (road edge) + 3 = 11 from the road center.
    if (ped.axis === 'x') { ped.x = along; ped.z = ped.road + ped.side * 11; ped.heading = ped.dir === 1 ? 0 : Math.PI; }
    else { ped.x = ped.road + ped.side * 11; ped.z = along; ped.heading = ped.dir === 1 ? Math.PI / 2 : -Math.PI / 2; }
  }

  // A threat at (x,z): peds within radius run away from it.
  scare(x, z, radius) {
    for (const p of this.list) {
      if (p.state === 'fall') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < radius) {
        p.state = 'flee';
        p.timer = 2.5;
        p.heading = Math.atan2(p.z - z, p.x - x);
      }
    }
  }

  // A car hit this ped: it falls down. Returns true if it was standing.
  knockDown(ped) {
    if (ped.state === 'fall') return false;
    ped.state = 'fall';
    ped.timer = 4;
    ped.group.rotation.x = -Math.PI / 2 * 0.9;
    return true;
  }

  // Bullet hitscan: a ped near the shot line falls. Returns the ped or null.
  shootTest(ox, oz, dx, dz, maxDist = 60) {
    let best = null, bestT = Infinity;
    for (const p of this.list) {
      if (p.state === 'fall') continue;
      const rx = p.x - ox, rz = p.z - oz;
      const t = rx * dx + rz * dz;
      if (t < 0 || t > maxDist) continue;
      const perp = Math.abs(rx * dz - rz * dx);
      if (perp < 1.6 && t < bestT) { best = p; bestT = t; }
    }
    if (best) {
      this.knockDown(best);
      this.scare(ox, oz, 18);
    }
    return best;
  }

  update(dt, threats) {
    for (const p of this.list) {
      if (p.state === 'fall') {
        p.timer -= dt;
        if (p.timer <= 0) {
          p.state = 'flee';
          p.timer = 3;
          p.group.rotation.x = 0;
          p.heading = Math.atan2(p.z - threats.pz, p.x - threats.px);
        }
        continue;
      }
      if (p.state === 'flee') {
        p.timer -= dt;
        if (p.timer <= 0) { p.state = 'walk'; this.placeOnSidewalk(p); }
        else {
          const sp = 5.2;
          p.x += Math.cos(p.heading) * sp * dt;
          p.z += Math.sin(p.heading) * sp * dt;
          p.x = clamp(p.x, -275, 245); p.z = clamp(p.z, -275, 275);
        }
      } else {
        // Walk along the sidewalk; turn at intersections sometimes (one roll per intersection).
        const along = p.axis === 'x' ? p.x : p.z;
        const nextRoad = p.dir === 1
          ? ROADS.find((r) => r > along + 4) ?? 240
          : [...ROADS].reverse().find((r) => r < along - 4) ?? -240;
        if (Math.abs(nextRoad - along) < 6 && p.decidedAt !== nextRoad) {
          p.decidedAt = nextRoad;
          if (this.rng.chance(0.25)) {
            // Turn onto the crossing road's sidewalk.
            p.axis = p.axis === 'x' ? 'z' : 'x';
            p.dir = this.rng.chance(0.5) ? 1 : -1;
            p.road = nextRoad;
            p.side = this.rng.chance(0.5) ? 1 : -1;
            if (p.axis === 'x') { p.z = p.road + p.side * 11; p.heading = p.dir === 1 ? 0 : Math.PI; }
            else { p.x = p.road + p.side * 11; p.heading = p.dir === 1 ? Math.PI / 2 : -Math.PI / 2; }
          }
        }
        p.x += Math.cos(p.heading) * p.speed * dt;
        p.z += Math.sin(p.heading) * p.speed * dt;
        if (p.x > 260 || p.x < -272 || p.z > 272 || p.z < -272) this.placeOnSidewalk(p);
      }
      // Flee from a speeding car right behind them.
      if (threats.carSpeed > 14) {
        const d = Math.hypot(p.x - threats.cx, p.z - threats.cz);
        if (d < 11 && p.state !== 'flee') {
          p.state = 'flee'; p.timer = 2;
          p.heading = Math.atan2(p.z - threats.cz, p.x - threats.cx);
        }
      }
      // Walk-cycle legs.
      p.phase += dt * (p.state === 'flee' ? 11 : 6);
      const swing = p.state === 'fall' ? 0 : Math.sin(p.phase) * 0.5;
      p.legL.rotation.x = swing;
      p.legR.rotation.x = -swing;
      // Sync mesh.
      p.group.position.set(p.x, 0, p.z);
      p.group.rotation.y = -p.heading;
      if (p.state !== 'fall') p.group.rotation.x = 0;
      p.shadow.position.set(p.x, 0.02, p.z);
      // Keep out of buildings (peds walk on sidewalks, but fleeing can cut corners).
      const pos = { x: p.x, z: p.z };
      resolveCircle(pos, 0.6, this.colliders);
      p.x = pos.x; p.z = pos.z;
    }
  }
}
