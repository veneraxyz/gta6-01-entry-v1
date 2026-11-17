// Cars: box-built groups with spinning wheels, headlights and taillights.
// Player driving is arcade physics; traffic follows the road grid in right-hand
// lanes; police pursue, reverse out when blocked, ram, and arrest on foot.
import * as THREE from 'three';
import { makeRng, clamp, angleDiff, dist2 } from './rng.js';
import { ROADS, nearestRoad, laneOffset, resolveCircle } from './city.js';

const CAR_COLORS = [0xc0392b, 0x2980b9, 0xf39c12, 0x7f8c8d, 0x8e44ad, 0x16a085, 0xd35400, 0x2c3e50, 0xececec, 0x27ae60];

function blobShadow(scene, r = 2.4) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(r, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  scene.add(m);
  return m;
}

export function makeCarMesh(scene, color, isPolice) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.0, 2.0), bodyMat);
  body.position.y = 0.75;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.75, 1.8),
    new THREE.MeshLambertMaterial({ color: 0x1a2028 }));
  cabin.position.set(-0.25, 1.55, 0);
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12);
  wheelGeo.rotateX(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [wx, wz] of [[1.5, 0.95], [1.5, -0.95], [-1.5, 0.95], [-1.5, -0.95]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(wx, 0.42, wz);
    g.add(w); wheels.push(w);
  }
  const hlMat = new THREE.MeshLambertMaterial({ color: 0x444422, emissive: 0xffedb0, emissiveIntensity: 1.6 });
  for (const hz of [0.6, -0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.4), hlMat);
    h.position.set(2.22, 0.8, hz);
    g.add(h);
  }
  const tlMat = new THREE.MeshLambertMaterial({ color: 0x220000, emissive: 0xff2222, emissiveIntensity: 1.2 });
  for (const hz of [0.6, -0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.4), tlMat);
    t.position.set(-2.22, 0.8, hz);
    g.add(t);
  }
  let barRed = null, barBlue = null;
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.18, 1.5),
      new THREE.MeshLambertMaterial({ color: 0x222222 }));
    bar.position.set(-0.25, 2.0, 0);
    g.add(bar);
    barRed = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.7),
      new THREE.MeshLambertMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 2 }));
    barRed.position.set(-0.25, 2.12, 0.38);
    barBlue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.7),
      new THREE.MeshLambertMaterial({ color: 0x000033, emissive: 0x2266ff, emissiveIntensity: 0.3 }));
    barBlue.position.set(-0.25, 2.12, -0.38);
    g.add(barRed); g.add(barBlue);
  }
  scene.add(g);
  const shadow = blobShadow(scene);
  return { group: g, wheels, shadow, barRed, barBlue };
}

// A moving car (player, traffic or police). Heading is radians, 0 = +x (east).
export class Car {
  constructor(mesh, x, z, heading) {
    this.mesh = mesh;
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.wheelSpin = 0;
  }
  get pos() { return { x: this.x, z: this.z }; }
  syncMesh() {
    this.mesh.group.position.set(this.x, 0, this.z);
    this.mesh.group.rotation.y = -this.heading;
    this.mesh.shadow.position.set(this.x, 0.02, this.z);
    this.wheelSpin += this.speed * 0.016 * 2.4;
    for (const w of this.mesh.wheels) w.rotation.z = this.wheelSpin;
    const fl = this.mesh.wheels[0], fr = this.mesh.wheels[1];
    fl.rotation.y = this.steer * 0.5; fr.rotation.y = this.steer * 0.5;
  }
}

// ---- Player driving ----
export function drivePlayer(car, input, dt, colliders, others, onRam) {
  const ax = input.axis();
  const handbrake = input.held('Space');
  const boost = input.held('ShiftLeft') || input.held('ShiftRight');
  const maxSpeed = boost ? 40 : 33;
  const accel = 26, brake = 42, drag = 6;
  if (ax.y > 0) car.speed += accel * dt;
  else if (ax.y < 0) {
    if (car.speed > 0.5) car.speed -= brake * dt;
    else car.speed -= accel * 0.55 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * drag * dt;
    if (Math.abs(car.speed) < 0.4) car.speed = 0;
  }
  if (handbrake) {
    car.speed -= Math.sign(car.speed) * 26 * dt;
    if (Math.abs(car.speed) < 1) car.speed = 0;
  }
  car.speed = clamp(car.speed, -13, maxSpeed);
  const steerTarget = -ax.x * (handbrake ? 0.85 : 0.55) * (1 - Math.min(Math.abs(car.speed) / maxSpeed, 0.75) * 0.55);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 9);
  const turn = car.steer * car.speed * dt * 0.075 * (car.speed < 0 ? -1 : 1);
  car.heading += turn;
  const nx = car.x + Math.cos(car.heading) * car.speed * dt;
  const nz = car.z + Math.sin(car.heading) * car.speed * dt;
  const px = car.x, pz = car.z;
  car.x = nx; car.z = nz;
  // Clamp to the drivable city and resolve building collisions.
  car.x = clamp(car.x, -278, 248);
  car.z = clamp(car.z, -278, 278);
  const p = { x: car.x, z: car.z };
  if (resolveCircle(p, 2.3, colliders)) {
    car.x = p.x; car.z = p.z;
    car.speed *= 0.55; // scrub speed on a wall hit
    if (Math.abs(car.speed) > 8) onRam && onRam();
  }
  // Car-vs-car push-out.
  for (const o of others) {
    const d2 = dist2(car.x, car.z, o.x, o.z);
    if (d2 < 4.6 * 4.6 && d2 > 0.01) {
      const d = Math.sqrt(d2);
      const push = (4.6 - d) / 2;
      const ux = (car.x - o.x) / d, uz = (car.z - o.z) / d;
      car.x += ux * push; car.z += uz * push;
      o.x -= ux * push; o.z -= uz * push;
      const rel = car.speed - o.speed;
      if (rel > 4) { car.speed *= 0.92; o.speed = Math.max(o.speed, car.speed * 0.4); }
    }
  }
  car.syncMesh();
  return { moved: Math.hypot(car.x - px, car.z - pz) };
}

// ---- Traffic AI ----
export class Traffic {
  constructor(scene, seed, colliders) {
    this.rng = makeRng(seed + 101);
    this.cars = [];
    for (let i = 0; i < 14; i++) {
      const color = CAR_COLORS[i % CAR_COLORS.length];
      const mesh = makeCarMesh(scene, color, false);
      const car = new Car(mesh, 0, 0, 0);
      this.placeOnRoad(car, true);
      car.speed = this.rng.range(8, 13);
      this.cars.push(car);
    }
    this.colliders = colliders;
  }

  placeOnRoad(car, random) {
    const r = this.rng;
    const axis = r.chance(0.5) ? 'x' : 'z';
    const road = r.pick(ROADS);
    const dir = r.chance(0.5) ? 1 : -1;
    const along = r.range(-260, 260);
    const lo = laneOffset(axis === 'x' ? dir : 0, axis === 'z' ? dir : 0);
    if (axis === 'x') { car.x = along; car.z = road + lo.oz; car.heading = dir === 1 ? 0 : Math.PI; }
    else { car.x = road + lo.ox; car.z = along; car.heading = dir === 1 ? Math.PI / 2 : -Math.PI / 2; }
    car.axis = axis; car.dir = dir; car.road = road;
    car.targetSpeed = r.range(9, 13);
    car.waypoint = null;
  }

  update(dt, playerCar, policeCars) {
    for (const car of this.cars) {
      const along = car.axis === 'x' ? car.x : car.z;
      // U-turn at the city ends instead of driving into the clamp forever.
      if ((car.dir === 1 && along > 246) || (car.dir === -1 && along < -246)) {
        car.dir *= -1;
        car.heading += Math.PI;
        car.waypoint = null;
      }
      const nextRoad = car.dir === 1
        ? ROADS.find((r) => r > along + 6) ?? 240
        : [...ROADS].reverse().find((r) => r < along - 6) ?? -240;
      const distToNext = Math.abs(nextRoad - along);
      // One turn decision per intersection (roll once when a new next road appears).
      if (!car.waypoint && distToNext < 14 && car.decidedAt !== nextRoad) {
        car.decidedAt = nextRoad;
        if (this.rng.chance(0.4)) {
          // Turn through the intersection center, then lane-keeping pulls the
          // car into the right-hand lane of the new road (no corner cutting).
          const newDir = this.rng.chance(0.5) ? 1 : -1;
          if (car.axis === 'x') {
            car.waypoint = { x: nextRoad, z: car.road, turn: true, newAxis: 'z', newDir, newRoad: car.road };
          } else {
            car.waypoint = { x: car.road, z: nextRoad, turn: true, newAxis: 'x', newDir, newRoad: car.road };
          }
        }
      }
      let desired = car.heading;
      let speedTarget = car.targetSpeed;
      if (car.waypoint) {
        const wp = car.waypoint;
        desired = Math.atan2(wp.z - car.z, wp.x - car.x);
        if (dist2(car.x, car.z, wp.x, wp.z) < 9) {
          if (wp.turn) {
            car.axis = wp.newAxis; car.dir = wp.newDir; car.road = wp.newRoad;
            car.heading = wp.newAxis === 'x' ? (wp.newDir === 1 ? 0 : Math.PI) : (wp.newDir === 1 ? Math.PI / 2 : -Math.PI / 2);
          }
          car.waypoint = null;
        }
      } else {
        // Lane-keeping: steer toward a point 20 ahead on the right-hand lane.
        const lo = laneOffset(car.axis === 'x' ? car.dir : 0, car.axis === 'z' ? car.dir : 0);
        if (car.axis === 'x') desired = Math.atan2((car.road + lo.oz) - car.z, car.dir * 20);
        else desired = Math.atan2(car.dir * 20, (car.road + lo.ox) - car.x);
      }
      // Brake for the car ahead (any car within 20 units in the forward cone).
      const fx = Math.cos(car.heading), fz = Math.sin(car.heading);
      const all = [...this.cars, playerCar, ...policeCars];
      for (const o of all) {
        if (o === car) continue;
        const dx = o.x - car.x, dz = o.z - car.z;
        const d = Math.hypot(dx, dz);
        if (d < 20 && d > 0.1 && (dx * fx + dz * fz) / d > 0.86) {
          speedTarget = Math.min(speedTarget, d < 9 ? 0 : (o.speed ?? 0) * 0.8);
        }
      }
      car.speed += clamp(speedTarget - car.speed, -14 * dt, 8 * dt);
      const dh = angleDiff(car.heading, desired);
      car.heading += clamp(dh, -1.5 * dt, 1.5 * dt);
      car.x += Math.cos(car.heading) * car.speed * dt;
      car.z += Math.sin(car.heading) * car.speed * dt;
      // Keep on the roads: clamp inside the city and out of buildings.
      car.x = clamp(car.x, -278, 248);
      car.z = clamp(car.z, -278, 278);
      const p = { x: car.x, z: car.z };
      resolveCircle(p, 2.3, this.colliders);
      car.x = p.x; car.z = p.z;
      car.syncMesh();
    }
    // Gentle car-vs-car separation between traffic cars.
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i], b = this.cars[j];
        const d2 = dist2(a.x, a.z, b.x, b.z);
        if (d2 < 4.6 * 4.6 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (4.6 - d) / 2;
          const ux = (a.x - b.x) / d, uz = (a.z - b.z) / d;
          a.x += ux * push; a.z += uz * push;
          b.x -= ux * push; b.z -= uz * push;
        }
      }
    }
  }
}

// ---- Police AI ----
export class Police {
  constructor(scene, seed) {
    this.rng = makeRng(seed + 202);
    this.scene = scene;
    this.cars = [];
    this._flashAt = 0;
  }

  setCount(n, px, pz) {
    while (this.cars.length < n) {
      const mesh = makeCarMesh(this.scene, 0x11151c, true);
      const car = new Car(mesh, 0, 0, 0);
      // Spawn on a road 60–90 units from the player.
      const road = this.rng.pick(ROADS);
      const axis = this.rng.chance(0.5) ? 'x' : 'z';
      const ang = this.rng.range(0, Math.PI * 2);
      const d = this.rng.range(60, 90);
      let x = px + Math.cos(ang) * d, z = pz + Math.sin(ang) * d;
      x = clamp(x, -270, 240); z = clamp(z, -270, 270);
      if (axis === 'x') { car.z = nearestRoad(z); car.x = x; }
      else { car.x = nearestRoad(x); car.z = z; }
      car.heading = Math.atan2(pz - car.z, px - car.x);
      car.speed = 14;
      car.reverseAt = 0; car.blockedAt = 0; car.reverseT = 0;
      this.cars.push(car);
    }
    while (this.cars.length > n) {
      const car = this.cars.pop();
      this.scene.remove(car.mesh.group);
      this.scene.remove(car.mesh.shadow);
    }
  }

  update(dt, time, player, playerInCar, onRam, onArrest) {
    this._flashAt += dt;
    const flash = Math.floor(this._flashAt / 0.28) % 2 === 0;
    for (const car of this.cars) {
      if (car.mesh.barRed) {
        car.mesh.barRed.material.emissiveIntensity = flash ? 2.4 : 0.25;
        car.mesh.barBlue.material.emissiveIntensity = flash ? 0.25 : 2.4;
      }
      const dx = player.x - car.x, dz = player.z - car.z;
      const dist = Math.hypot(dx, dz);
      const desired = Math.atan2(dz, dx);
      const dh = angleDiff(car.heading, desired);
      if (car.reverseT > 0) {
        car.reverseT -= dt;
        car.speed = -8;
        car.heading += clamp(-dh, -1.8 * dt, 1.8 * dt);
      } else {
        const targetSpeed = dist > 90 ? 38 : dist > 30 ? 34 : 26;
        car.speed += clamp(targetSpeed - car.speed, -20 * dt, 16 * dt);
        car.heading += clamp(dh, -1.9 * dt, 1.9 * dt);
        if (car.speed < 2 && Math.abs(dh) > 0.9) {
          car.blockedAt += dt;
          if (car.blockedAt > 1.5) { car.reverseT = 0.9; car.blockedAt = 0; }
        } else car.blockedAt = 0;
      }
      car.x += Math.cos(car.heading) * car.speed * dt;
      car.z += Math.sin(car.heading) * car.speed * dt;
      car.x = clamp(car.x, -278, 248);
      car.z = clamp(car.z, -278, 278);
      // Ram the player's car.
      if (playerInCar && dist < 4.8) {
        onRam && onRam(car);
      }
      // Arrest: player on foot, cruiser on top of them.
      if (!playerInCar && dist < 3.6) {
        car.arrestT = (car.arrestT || 0) + dt;
        if (car.arrestT > 1.2) onArrest && onArrest();
      } else car.arrestT = 0;
      car.syncMesh();
    }
  }

  nearestDist(px, pz) {
    let best = Infinity;
    for (const c of this.cars) best = Math.min(best, Math.hypot(c.x - px, c.z - pz));
    return best;
  }
}
