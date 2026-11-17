// Neon Harbor city: a seeded 7x7 road grid on a 1024x1024 painted ground texture,
// 100+ instanced buildings, container yard + pier on the east edge, street props.
import * as THREE from 'three';
import { makeRng, clamp } from './rng.js';

export const ROADS = [-240, -160, -80, 0, 80, 160, 240];
export const ROAD_W = 16;
export const CITY_HALF = 288;
export const WATER_X = 256;
export const BLOCK_CENTERS = [-200, -120, -40, 40, 120, 200];

// Circle (x,z,r) vs AABB list: push the circle out of any overlap.
export function resolveCircle(pos, r, colliders) {
  let hit = false;
  for (const c of colliders) {
    const cx = clamp(pos.x, c.minX, c.maxX);
    const cz = clamp(pos.z, c.minZ, c.maxZ);
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * r;
      pos.z = cz + (dz / d) * r;
    } else {
      // Center inside the box: push out along the smallest penetration axis.
      const px = Math.min(pos.x - c.minX + r, c.maxX - pos.x + r);
      const pz = Math.min(pos.z - c.minZ + r, c.maxZ - pos.z + r);
      if (px < pz) pos.x = (pos.x - c.minX < c.maxX - pos.x) ? c.minX - r : c.maxX + r;
      else pos.z = (pos.z - c.minZ < c.maxZ - pos.z) ? c.minZ - r : c.maxZ + r;
    }
  }
  return hit;
}

function windowTexture(rng, variant) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = variant === 0 ? '#2b3242' : variant === 1 ? '#33302e' : '#232a33';
  g.fillRect(0, 0, 128, 256);
  const cols = 6, rows = 14;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (rng.chance(0.28)) continue;
      const warm = rng.chance(0.6);
      g.fillStyle = warm ? 'rgba(255, 205, 110, 0.95)' : 'rgba(150, 210, 255, 0.9)';
      if (rng.chance(0.12)) g.fillStyle = 'rgba(255, 120, 200, 0.85)';
      g.fillRect(8 + x * 20, 10 + y * 17, 12, 10);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function groundTexture(rng) {
  const S = 1024, HALF = CITY_HALF;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const w2c = (v) => ((v + HALF) / (HALF * 2)) * S;
  const sc = S / (HALF * 2); // px per world unit

  // Base: sidewalk gray.
  g.fillStyle = '#767b83'; g.fillRect(0, 0, S, S);
  // Block interiors: grass, or asphalt parking lots on some blocks.
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      const x0 = w2c(bx - 32), z0 = w2c(bz - 32), w = 64 * sc;
      if (bx === 200) { // container yard: worn concrete
        g.fillStyle = '#5d6066'; g.fillRect(x0, z0, w, w);
        g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 2;
        for (let i = 1; i < 4; i++) {
          g.beginPath(); g.moveTo(x0, z0 + i * w / 4); g.lineTo(x0 + w, z0 + i * w / 4); g.stroke();
        }
        continue;
      }
      if (rng.chance(0.28)) { // parking lot
        g.fillStyle = '#3a3d44'; g.fillRect(x0, z0, w, w);
        g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          g.strokeRect(x0 + 8 + i * 18, z0 + 10, 13, 26);
          g.strokeRect(x0 + 8 + i * 18, z0 + w - 36, 13, 26);
        }
      } else {
        const shade = 52 + rng.int(0, 18);
        g.fillStyle = `rgb(${shade - 12}, ${shade + 18}, ${shade - 8})`;
        g.fillRect(x0, z0, w, w);
        // a few darker grass patches
        g.fillStyle = 'rgba(0,0,0,0.10)';
        for (let i = 0; i < 5; i++) {
          g.beginPath();
          g.ellipse(x0 + rng.next() * w, z0 + rng.next() * w, 8 + rng.next() * 16, 6 + rng.next() * 10, rng.next() * 3, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }
  // Harbor water on the east edge.
  g.fillStyle = '#12324e';
  g.fillRect(w2c(WATER_X), 0, S - w2c(WATER_X), S);
  g.strokeStyle = 'rgba(120, 190, 230, 0.35)'; g.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    const y = rng.next() * S, x = w2c(WATER_X) + 8 + rng.next() * (S - w2c(WATER_X) - 20);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14 + rng.next() * 22, y + (rng.next() - 0.5) * 6); g.stroke();
  }
  // Pier: concrete deck jutting into the water.
  g.fillStyle = '#7d8187';
  g.fillRect(w2c(252), w2c(-40), S - w2c(252), 80 * sc);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
  g.strokeRect(w2c(252), w2c(-40), S - w2c(252), 80 * sc);
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  for (let i = 1; i < 5; i++) g.strokeRect(w2c(252) + i * 12, w2c(-40) + 6, 8, 80 * sc - 12);

  // Roads: asphalt strips both ways.
  g.fillStyle = '#22252b';
  for (const r of ROADS) {
    g.fillRect(w2c(r - ROAD_W / 2), 0, ROAD_W * sc, S);
    g.fillRect(0, w2c(r - ROAD_W / 2), S, ROAD_W * sc);
  }
  // Lane dashes: yellow center lines.
  g.fillStyle = '#c8a028';
  for (const r of ROADS) {
    for (let v = -280; v < 280; v += 16) {
      g.fillRect(w2c(r) - 1, w2c(v), 2, 8 * sc);
      g.fillRect(w2c(v), w2c(r) - 1, 8 * sc, 2);
    }
  }
  // Crosswalks at every intersection.
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      for (let i = -3; i <= 3; i++) {
        g.fillRect(w2c(rx + i * 2.2) - 1.5, w2c(rz - ROAD_W / 2) + 2, 3, 5);
        g.fillRect(w2c(rx + i * 2.2) - 1.5, w2c(rz + ROAD_W / 2) - 7, 3, 5);
        g.fillRect(w2c(rx - ROAD_W / 2) + 2, w2c(rz + i * 2.2) - 1.5, 5, 3);
        g.fillRect(w2c(rx + ROAD_W / 2) - 7, w2c(rz + i * 2.2) - 1.5, 5, 3);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildCity(scene, seed) {
  const rng = makeRng(seed);
  const colliders = [];

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2, CITY_HALF * 2),
    new THREE.MeshLambertMaterial({ map: groundTexture(makeRng(seed + 7)) }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Buildings: instanced unit boxes, 3 window textures x 3 tints.
  const winTex = [windowTexture(makeRng(seed + 11), 0), windowTexture(makeRng(seed + 12), 1), windowTexture(makeRng(seed + 13), 2)];
  const tints = [0x9aa4b8, 0xb8a894, 0x7e8a99];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0); // origin at the base
  const placements = []; // {x, z, w, h, d, tex, tint}
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      if (bx === 200) continue; // container yard, no towers
      const n = rng.int(3, 4);
      const centerBoost = 1 + (1 - Math.hypot(bx, bz) / 380) * 0.9;
      for (let i = 0; i < n; i++) {
        const w = rng.range(10, 20), d = rng.range(8, 16);
        const h = rng.range(12, 30) * centerBoost;
        const x = bx + rng.range(-18, 18) * 0.7;
        const z = bz + rng.range(-18, 18) * 0.7;
        placements.push({ x, z, w, h, d, tex: rng.int(0, 2), tint: rng.int(0, 2) });
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      }
    }
  }
  const dummy = new THREE.Object3D();
  for (let t = 0; t < 3; t++) {
    for (let k = 0; k < 3; k++) {
      const list = placements.filter((p) => p.tex === t && p.tint === k);
      if (!list.length) continue;
      const mat = new THREE.MeshLambertMaterial({ map: winTex[t], color: tints[k] });
      const inst = new THREE.InstancedMesh(boxGeo, mat, list.length);
      list.forEach((p, i) => {
        dummy.position.set(p.x, 0, p.z);
        dummy.scale.set(p.w, p.h, p.d);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      });
      inst.instanceMatrix.needsUpdate = true;
      scene.add(inst);
      // Roof slabs: one thin dark box per building, also instanced.
      const roof = new THREE.InstancedMesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x1c1f26 }), list.length);
      list.forEach((p, i) => {
        dummy.position.set(p.x, p.h, p.z);
        dummy.scale.set(p.w + 0.6, 0.8, p.d + 0.6);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        roof.setMatrixAt(i, dummy.matrix);
      });
      roof.instanceMatrix.needsUpdate = true;
      scene.add(roof);
    }
  }

  // Container yard: instanced colored boxes, some stacked two high.
  const contGeo = new THREE.BoxGeometry(1, 1, 1);
  contGeo.translate(0, 0.5, 0);
  const contColors = [0xb8442c, 0x2c5ab8, 0x3a8a4a, 0xc47a1e, 0x7a4a9e];
  const contMats = contColors.map((col) => new THREE.MeshLambertMaterial({ color: col }));
  const contSpots = [];
  for (const bz of BLOCK_CENTERS) {
    for (let i = 0; i < 7; i++) {
      const x = 200 + rng.range(-22, 22);
      const z = bz + rng.range(-22, 22);
      const stack = rng.chance(0.4) ? 2 : 1;
      contSpots.push({ x, z, w: 12, h: 2.6, d: 2.6, color: rng.int(0, 4), stack });
      colliders.push({ minX: x - 6, maxX: x + 6, minZ: z - 1.3, maxZ: z + 1.3 });
    }
  }
  // Pier containers, lined up along the dock.
  for (let i = 0; i < 6; i++) {
    const x = 262 + rng.range(-4, 4), z = -32 + i * 13;
    contSpots.push({ x, z, w: 12, h: 2.6, d: 2.6, color: rng.int(0, 4), stack: rng.chance(0.5) ? 2 : 1 });
    colliders.push({ minX: x - 6, maxX: x + 6, minZ: z - 1.3, maxZ: z + 1.3 });
  }
  for (let k = 0; k < 5; k++) {
    const list = contSpots.filter((p) => p.color === k);
    if (!list.length) continue;
    const inst = new THREE.InstancedMesh(contGeo, contMats[k], list.length * 2);
    let idx = 0;
    for (const p of list) {
      for (let s = 0; s < p.stack; s++) {
        dummy.position.set(p.x, s * 2.6, p.z);
        dummy.scale.set(p.w, 2.6, p.d);
        dummy.rotation.set(0, (p.x * 7 + p.z * 3) % 2 === 0 ? 0 : Math.PI / 2);
        dummy.updateMatrix();
        inst.setMatrixAt(idx++, dummy.matrix);
      }
    }
    inst.count = idx;
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
  }

  // Trees: instanced trunks + foliage, on block corners.
  const treeSpots = [];
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      if (bx === 200) continue;
      for (let i = 0; i < 3; i++) {
        const x = bx + rng.pick([-26, 26]) + rng.range(-3, 3);
        const z = bz + rng.pick([-26, 26]) + rng.range(-3, 3);
        treeSpots.push({ x, z, s: rng.range(0.8, 1.3) });
        colliders.push({ minX: x - 0.7, maxX: x + 0.7, minZ: z - 0.7, maxZ: z + 0.7 });
      }
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3, 6);
  trunkGeo.translate(0, 1.5, 0);
  const trunkInst = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x5a4128 }), treeSpots.length);
  const folGeo = new THREE.SphereGeometry(2.2, 8, 6);
  folGeo.translate(0, 4.6, 0);
  const folInst = new THREE.InstancedMesh(folGeo, new THREE.MeshLambertMaterial({ color: 0x2e5a2e }), treeSpots.length);
  treeSpots.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z); dummy.scale.setScalar(p.s); dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);
    folInst.setMatrixAt(i, dummy.matrix);
  });
  trunkInst.instanceMatrix.needsUpdate = true;
  folInst.instanceMatrix.needsUpdate = true;
  scene.add(trunkInst); scene.add(folInst);

  // Streetlights at intersections (instanced poles + lamp heads).
  const poleGeo = new THREE.CylinderGeometry(0.14, 0.18, 7, 6);
  poleGeo.translate(0, 3.5, 0);
  const lampGeo = new THREE.SphereGeometry(0.5, 8, 6);
  lampGeo.translate(0, 7, 0);
  const lightSpots = [];
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      lightSpots.push({ x: rx + 9, z: rz + 9 });
      lightSpots.push({ x: rx - 9, z: rz - 9 });
    }
  }
  const poleInst = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x2a2d33 }), lightSpots.length);
  const lampInst = new THREE.InstancedMesh(lampGeo, new THREE.MeshLambertMaterial({ color: 0x443311, emissive: 0xffc46a, emissiveIntensity: 0.9 }), lightSpots.length);
  lightSpots.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z); dummy.scale.setScalar(1); dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poleInst.setMatrixAt(i, dummy.matrix);
    lampInst.setMatrixAt(i, dummy.matrix);
  });
  poleInst.instanceMatrix.needsUpdate = true;
  lampInst.instanceMatrix.needsUpdate = true;
  scene.add(poleInst); scene.add(lampInst);

  // Traffic lights at the 9 major intersections: pole + head with red/green lenses.
  const tlHeads = [];
  const tlGeo = new THREE.BoxGeometry(0.9, 2.4, 0.9);
  tlGeo.translate(0, 5.4, 0);
  const tlMat = new THREE.MeshLambertMaterial({ color: 0x15161a });
  for (const rx of [-160, 0, 160]) {
    for (const rz of [-160, 0, 160]) {
      const head = new THREE.Mesh(tlGeo, tlMat);
      head.position.set(rx + 10, 0, rz + 10);
      scene.add(head);
      const red = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 1.4 }));
      red.position.set(rx + 10, 5.9, rz + 10.6);
      const green = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0x003300, emissive: 0x22ff66, emissiveIntensity: 0.2 }));
      green.position.set(rx + 10, 5.0, rz + 10.6);
      scene.add(red); scene.add(green);
      tlHeads.push({ red, green, phase: (rx + rz) % 2 === 0 ? 0 : 1 });
    }
  }

  // Harbor railing along the water edge (visual wall at x = 252).
  const railGeo = new THREE.BoxGeometry(0.3, 1.1, 6);
  const railMat = new THREE.MeshLambertMaterial({ color: 0x8a94a6 });
  for (let z = -280; z < 280; z += 6) {
    if (z > -42 && z < 42) continue; // pier opening
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.set(252, 0.55, z);
    scene.add(rail);
  }
  colliders.push({ minX: 250, maxX: 256, minZ: -280, maxZ: -42 });
  colliders.push({ minX: 250, maxX: 256, minZ: 42, maxZ: 280 });

  return {
    colliders,
    buildingCount: placements.length,
    update(dt, time) {
      // Traffic lights cycle every 6 s, offset per intersection.
      for (const tl of tlHeads) {
        const on = Math.floor(time / 6 + tl.phase) % 2 === 0;
        tl.red.material.emissiveIntensity = on ? 0.15 : 1.4;
        tl.green.material.emissiveIntensity = on ? 1.4 : 0.15;
      }
    },
  };
}

// Snap a coordinate to the nearest road line.
export function nearestRoad(v) {
  let best = ROADS[0], bd = Infinity;
  for (const r of ROADS) {
    const d = Math.abs(v - r);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}
// Right-hand lane offset for travel direction (dx,dz) on a road.
export function laneOffset(dx, dz) {
  // Right of travel: +x travel -> +z; -x -> -z; +z -> -x; -z -> +x.
  if (dx === 1) return { ox: 0, oz: 4 };
  if (dx === -1) return { ox: 0, oz: -4 };
  if (dz === 1) return { ox: -4, oz: 0 };
  return { ox: 4, oz: 0 };
}
