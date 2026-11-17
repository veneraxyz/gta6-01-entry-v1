// Missions: six jobs from the Fixer, plus the wanted system.
// The beacon (purple pillar + pulsing ring) marks the waypoint in 3D.
import * as THREE from 'three';

export const MISSIONS = [
  { name: 'JOB 1 — THE MEET', text: 'Meet the Fixer at the corner of 5th & Harbor.', target: { x: 120, z: -120 }, reward: 150 },
  { name: 'JOB 2 — THE PICKUP', text: 'Pick up the package at the south-west lot.', target: { x: -160, z: 160 }, reward: 200 },
  { name: 'JOB 3 — THE DROP', text: 'Deliver the package to the docks office.', target: { x: 240, z: 80 }, reward: 250 },
  { name: 'JOB 4 — CROSS-TOWN', text: 'Get to the pier in 90 seconds. No excuses.', target: { x: 240, z: 0 }, reward: 300, timeLimit: 90 },
  { name: 'JOB 5 — THE HEAT', text: 'The cops are onto you. Reach the safe house.', target: { x: -200, z: -200 }, reward: 400, wantedOnStart: 3 },
  { name: 'JOB 6 — THE GETAWAY', text: 'Two stops, full heat. First: the north garage.', target: { x: 120, z: 120 }, reward: 500, wantedOnStart: 4 },
  { name: 'JOB 6 — LAST LEG', text: 'Final stop: the old bridge underpass.', target: { x: -40, z: -200 }, reward: 0, wantedOnStart: 4 },
];

export class MissionManager {
  constructor(scene) {
    this.index = 0;
    this.timeLeft = 0;
    this.done = false;
    // Beacon: a tall translucent purple pillar + a pulsing ground ring.
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 70, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xa878ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.beacon.position.y = 35;
    scene.add(this.beacon);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(4.5, 6, 32),
      new THREE.MeshBasicMaterial({ color: 0xa878ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.06;
    scene.add(this.ring);
    this.moveBeacon();
  }

  get current() { return MISSIONS[this.index]; }

  start(index) {
    this.index = index;
    this.done = false;
    const m = this.current;
    this.timeLeft = m.timeLimit || 0;
    this.moveBeacon();
  }

  moveBeacon() {
    if (this.done) { this.beacon.visible = false; this.ring.visible = false; return; }
    const t = this.current.target;
    this.beacon.position.x = t.x; this.beacon.position.z = t.z;
    this.ring.position.x = t.x; this.ring.position.z = t.z;
    this.beacon.visible = true; this.ring.visible = true;
  }

  // Returns 'complete' | 'failed' | null. Caller handles rewards/fines.
  update(dt, px, pz) {
    if (this.done) return null;
    const m = this.current;
    if (m.timeLimit) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) return 'failed';
    }
    const d = Math.hypot(px - m.target.x, pz - m.target.z);
    if (d < 7) return 'complete';
    return null;
  }

  complete() {
    this.index++;
    if (this.index >= MISSIONS.length) { this.done = true; this.moveBeacon(); return true; }
    this.start(this.index);
    return false;
  }

  fail() {
    // Timer ran out: restart the same job with a fresh clock.
    this.start(this.index);
  }

  updateBeacon(time) {
    if (this.done) return;
    const s = 1 + Math.sin(time * 3) * 0.12;
    this.ring.scale.set(s, s, 1);
    this.beacon.material.opacity = 0.18 + Math.sin(time * 2) * 0.06;
  }
}

// Wanted: stars 0..5. Crimes add stars; they decay after 18 s with no police near.
export class Wanted {
  constructor() {
    this.stars = 0;
    this.quietT = 0;
  }
  crime(n) {
    this.stars = Math.min(5, this.stars + n);
    this.quietT = 0;
  }
  update(dt, nearestPoliceDist) {
    if (this.stars === 0) return;
    if (nearestPoliceDist < 45) this.quietT = 0;
    else {
      this.quietT += dt;
      if (this.quietT > 18) { this.stars--; this.quietT = 0; }
    }
  }
}
