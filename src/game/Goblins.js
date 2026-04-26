import * as THREE from 'three';
import { state, notify } from '../state.js';
import { ROAD_WAYPOINTS } from '../scene/Road.js';
import { villages } from '../data/villages.js';
import { caves } from '../data/caves.js';
import { DayNight } from '../scene/DayNight.js';
import { GoblinPopup } from '../ui/GoblinPopup.js';
import { ChunkManager } from './ChunkManager.js';

// ---------------------------------------------------------------------------
// Goblins — low-poly stalkers; chunked visibility; no cast shadows.
// (Max 5 animated Groups; InstancedMesh for >3 multi-part rigs is skipped.)
// ---------------------------------------------------------------------------

const MAX_GOBLINS = 5;
const SUNSET_WALK_SPEED = 0.5;
const NIGHT_PURSUIT_SPEED = 1.5;
const CONTACT_RADIUS = 1.5;
const ROAD_LATERAL_LIMIT = 8;
const SPAWN_DIST_MIN = 14;
const SPAWN_DIST_MAX = 40;
const WESTWIND_EXCLUSION_Z = 108;
const VILLAGE_EXCLUSION_PAD = 3;
const CAVE_EXCLUSION_PAD = 3;
const SPAWN_TRY_INTERVAL = 1.0;
const DESPAWN_FADE = 0.35;

const SKIN = 0x2a3a1a;
const SKIN_DARK = 0x1e2814;
const EAR = 0x223218;

const BODY_MAT = new THREE.MeshStandardMaterial({
  color: SKIN,
  roughness: 0.92,
  metalness: 0,
  flatShading: true,
});
const HEAD_MAT = new THREE.MeshStandardMaterial({
  color: SKIN,
  roughness: 0.9,
  flatShading: true,
});
const EAR_MAT = new THREE.MeshStandardMaterial({
  color: EAR,
  roughness: 0.95,
  flatShading: true,
});
const EYE_MAT = new THREE.MeshStandardMaterial({
  color: 0xff1100,
  emissive: 0xff1100,
  emissiveIntensity: 2.0,
  roughness: 0.35,
});
const NOSE_MAT = new THREE.MeshStandardMaterial({
  color: SKIN_DARK,
  roughness: 0.95,
  flatShading: true,
});
const LIMB_MAT = new THREE.MeshStandardMaterial({
  color: SKIN_DARK,
  roughness: 0.95,
  flatShading: true,
});
const HAND_MAT = new THREE.MeshStandardMaterial({
  color: SKIN_DARK,
  roughness: 0.9,
  flatShading: true,
});
const FOOT_MAT = new THREE.MeshStandardMaterial({
  color: 0x1a1810,
  roughness: 1,
  flatShading: true,
});

/** Full low-poly goblin as Group — 11 meshes. */
function buildGoblinGroup() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 0.55, 8),
    BODY_MAT,
  );
  body.position.y = 0.28;
  body.rotation.x = 0.2;
  body.castShadow = false;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), HEAD_MAT);
  head.position.set(0, 0.62, 0.02);
  head.castShadow = false;
  group.add(head);

  const earGeom = new THREE.ConeGeometry(0.06, 0.18, 4);
  const earL = new THREE.Mesh(earGeom, EAR_MAT);
  earL.position.set(-0.16, 0.68, 0);
  earL.rotation.z = -0.5;
  earL.rotation.x = -0.25;
  group.add(earL);
  const earR = new THREE.Mesh(earGeom, EAR_MAT);
  earR.position.set(0.16, 0.68, 0);
  earR.rotation.z = 0.5;
  earR.rotation.x = -0.25;
  group.add(earR);

  const eyeGeom = new THREE.SphereGeometry(0.04, 6, 6);
  const eyeL = new THREE.Mesh(eyeGeom, EYE_MAT);
  eyeL.position.set(-0.06, 0.64, 0.14);
  group.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeom, EYE_MAT);
  eyeR.position.set(0.06, 0.64, 0.14);
  group.add(eyeR);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), NOSE_MAT);
  nose.position.set(0, 0.58, 0.16);
  group.add(nose);

  const armGeom = new THREE.CylinderGeometry(0.04, 0.05, 0.38, 6);
  const armL = new THREE.Mesh(armGeom, LIMB_MAT);
  armL.position.set(-0.22, 0.32, 0.02);
  armL.rotation.z = 0.35;
  armL.rotation.x = 0.25;
  group.add(armL);
  const armR = new THREE.Mesh(armGeom, LIMB_MAT);
  armR.position.set(0.22, 0.32, 0.02);
  armR.rotation.z = -0.35;
  armR.rotation.x = 0.25;
  group.add(armR);

  const handGeom = new THREE.SphereGeometry(0.06, 6, 6);
  const handL = new THREE.Mesh(handGeom, HAND_MAT);
  handL.position.set(-0.26, 0.08, 0.04);
  handL.scale.set(1.2, 0.7, 1.3);
  group.add(handL);
  const handR = new THREE.Mesh(handGeom, HAND_MAT);
  handR.position.set(0.26, 0.08, 0.04);
  handR.scale.set(1.2, 0.7, 1.3);
  group.add(handR);

  const legGeom = new THREE.CylinderGeometry(0.06, 0.08, 0.35, 6);
  const legL = new THREE.Mesh(legGeom, LIMB_MAT);
  legL.position.set(-0.1, -0.12, 0);
  legL.rotation.z = 0.18;
  legL.rotation.x = -0.08;
  group.add(legL);
  const legR = new THREE.Mesh(legGeom, LIMB_MAT);
  legR.position.set(0.1, -0.12, 0);
  legR.rotation.z = -0.18;
  legR.rotation.x = -0.08;
  group.add(legR);

  const footGeom = new THREE.BoxGeometry(0.12, 0.06, 0.18);
  const footL = new THREE.Mesh(footGeom, FOOT_MAT);
  footL.position.set(-0.1, -0.32, 0.04);
  group.add(footL);
  const footR = new THREE.Mesh(footGeom, FOOT_MAT);
  footR.position.set(0.1, -0.32, 0.04);
  group.add(footR);

  group.userData.body = body;
  group.userData.armL = armL;
  group.userData.armR = armR;
  group.userData.legL = legL;
  group.userData.legR = legR;
  group.userData.bobSeed = Math.random() * 10;
  return group;
}

function segmentDistSq(px, pz, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-6) {
    const ex = px - a.x;
    const ez = pz - a.z;
    return ex * ex + ez * ez;
  }
  let t = ((px - a.x) * dx + (pz - a.z) * dz) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const ex = px - (a.x + dx * t);
  const ez = pz - (a.z + dz * t);
  return ex * ex + ez * ez;
}

export function distanceToNearestRoad(px, pz) {
  let bestSq = Infinity;
  for (let i = 0; i < ROAD_WAYPOINTS.length - 1; i++) {
    const a = ROAD_WAYPOINTS[i];
    const b = ROAD_WAYPOINTS[i + 1];
    const d = segmentDistSq(px, pz, a, b);
    if (d < bestSq) bestSq = d;
  }
  return Math.sqrt(bestSq);
}

export function isWithinRoadDistance(px, pz, limit) {
  const limitSq = limit * limit;
  for (let i = 0; i < ROAD_WAYPOINTS.length - 1; i++) {
    const a = ROAD_WAYPOINTS[i];
    const b = ROAD_WAYPOINTS[i + 1];
    if (segmentDistSq(px, pz, a, b) <= limitSq) return true;
  }
  return false;
}

function insideVillageZone(px, pz) {
  for (const v of villages) {
    const dx = px - v.position.x;
    const dz = pz - v.position.z;
    if (Math.hypot(dx, dz) < (v.radius + VILLAGE_EXCLUSION_PAD)) return true;
  }
  return false;
}

function insideCaveZone(px, pz) {
  for (const c of caves) {
    const dx = px - c.position.x;
    const dz = pz - c.position.z;
    if (Math.hypot(dx, dz) < (4 + CAVE_EXCLUSION_PAD)) return true;
  }
  return false;
}

function pickSpawnPoint(playerPos) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const i = Math.floor(Math.random() * (ROAD_WAYPOINTS.length - 1));
    const a = ROAD_WAYPOINTS[i];
    const b = ROAD_WAYPOINTS[i + 1];
    const t = Math.random();
    const cx = a.x + (b.x - a.x) * t;
    const cz = a.z + (b.z - a.z) * t;
    const nx = -(b.z - a.z);
    const nz = b.x - a.x;
    const nLen = Math.hypot(nx, nz) || 1;
    const lat = (Math.random() * 6 + 2) * (Math.random() < 0.5 ? -1 : 1);
    const x = cx + (nx / nLen) * lat;
    const z = cz + (nz / nLen) * lat;

    if (z > WESTWIND_EXCLUSION_Z) continue;
    const distFromPlayer = Math.hypot(x - playerPos.x, z - playerPos.z);
    if (distFromPlayer < SPAWN_DIST_MIN || distFromPlayer > SPAWN_DIST_MAX) continue;
    if (insideVillageZone(x, z)) continue;
    if (insideCaveZone(x, z)) continue;
    if (distanceToNearestRoad(x, z) > ROAD_LATERAL_LIMIT + 2) continue;
    return { x, z };
  }
  return null;
}

export const Goblins = {
  scene: null,
  parent: null,
  entries: [],
  spawnTimer: 0,
  lastPhase: 'day',

  init(scene) {
    this.scene = scene;
    this.parent = new THREE.Group();
    this.parent.name = 'goblins';
    scene.add(this.parent);
  },

  _clearAll() {
    for (const g of this.entries) {
      if (g.chunkEntry) ChunkManager.unregister(g.chunkEntry);
      if (g.mesh.parent) g.mesh.parent.remove(g.mesh);
    }
    this.entries = [];
  },

  _spawnOne(playerPos) {
    const pt = pickSpawnPoint(playerPos);
    if (!pt) return;

    if (this.entries.length >= MAX_GOBLINS) return;

    const mesh = buildGoblinGroup();
    mesh.position.set(pt.x, 0, pt.z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    this.parent.add(mesh);
    const chunkEntry = ChunkManager.register(mesh, pt.x, pt.z);
    this.entries.push({
      mesh,
      chunkEntry,
      state: 'wander',
      wanderT: 0,
      wanderDir: new THREE.Vector2(Math.random() - 0.5, Math.random() - 0.5).normalize(),
      fadeT: 0,
    });
  },

  _despawn(entry) {
    entry.state = 'despawn';
    entry.fadeT = 0;
  },

  _stealFrom(entry) {
    const pool = [];
    const c = state.currencies || {};
    if ((c.gold || 0) >= 5) pool.push('gold');
    if ((c.memories || 0) >= 1) pool.push('memories');
    if ((c.promises || 0) >= 1) pool.push('promises');
    if ((c.years || 0) >= 1) pool.push('years');
    if ((c.secrets || 0) >= 1) pool.push('secrets');
    if (pool.length === 0) {
      this._despawn(entry);
      return;
    }
    const which = pool[Math.floor(Math.random() * pool.length)];
    let amount;
    if (which === 'gold') {
      const max = Math.min(15, c.gold || 0);
      const min = Math.min(5, max);
      amount = Math.max(1, Math.floor(Math.random() * (max - min + 1)) + min);
    } else {
      amount = 1;
    }
    state.currencies[which] = Math.max(0, (c[which] || 0) - amount);
    state.totalGoblinThefts = (state.totalGoblinThefts || 0) + 1;
    GoblinPopup.show(amount, which);
    notify();
    this._despawn(entry);
  },

  _phaseAllows() {
    const phase = DayNight.getCurrentPhase();
    return phase === 'sunset' || phase === 'night';
  },

  update(delta, playerPos) {
    if (!this.parent) return;

    if (state.currentScene !== 'world') {
      if (this.entries.length) this._clearAll();
      this.parent.visible = false;
      return;
    }
    this.parent.visible = true;

    const phase = DayNight.getCurrentPhase();
    if (phase === 'sunrise' || phase === 'day') {
      if (this.entries.length) this._clearAll();
      this.lastPhase = phase;
      return;
    }

    const offRoad = !!state.offRoad;

    if (!offRoad) {
      const total = this.entries.length;
      this.spawnTimer -= delta;
      if (total < MAX_GOBLINS && this.spawnTimer <= 0) {
        this._spawnOne(playerPos);
        this.spawnTimer = SPAWN_TRY_INTERVAL * (0.6 + Math.random() * 0.8);
      }
    }

    const isNight = phase === 'night';
    const t = performance.now() * 0.001;

    for (let i = this.entries.length - 1; i >= 0; i--) {
      const g = this.entries[i];
      const m = g.mesh;
      if (g.chunkEntry) {
        ChunkManager.moveEntryToWorld(g.chunkEntry, m.position.x, m.position.z);
      }

      if (g.state === 'despawn') {
        g.fadeT += delta;
        const k = Math.min(1, g.fadeT / DESPAWN_FADE);
        m.scale.setScalar(Math.max(0.001, 1 - k));
        if (k >= 1) {
          if (g.chunkEntry) ChunkManager.unregister(g.chunkEntry);
          if (m.parent) m.parent.remove(m);
          this.entries.splice(i, 1);
        }
        continue;
      }

      let mode;
      if (!isNight) mode = 'wander';
      else if (offRoad) mode = 'flee';
      else mode = 'pursue';

      if (mode === 'wander') {
        g.wanderT -= delta;
        if (g.wanderT <= 0) {
          g.wanderT = 0.8 + Math.random() * 1.4;
          g.wanderDir.set(Math.random() - 0.5, Math.random() - 0.5).normalize();
        }
        m.position.x += g.wanderDir.x * SUNSET_WALK_SPEED * delta;
        m.position.z += g.wanderDir.y * SUNSET_WALK_SPEED * delta;
        m.rotation.y = Math.atan2(g.wanderDir.x, g.wanderDir.y);
        if (distanceToNearestRoad(m.position.x, m.position.z) > ROAD_LATERAL_LIMIT + 4) {
          this._despawn(g);
        }
      } else if (mode === 'pursue') {
        const dx = playerPos.x - m.position.x;
        const dz = playerPos.z - m.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < CONTACT_RADIUS) {
          this._stealFrom(g);
          continue;
        }
        if (dist > 0.001) {
          const step = NIGHT_PURSUIT_SPEED * delta;
          m.position.x += (dx / dist) * step;
          m.position.z += (dz / dist) * step;
          m.rotation.y = Math.atan2(dx, dz);
        }
      } else if (mode === 'flee') {
        g.wanderT -= delta;
        if (g.wanderT <= 0) {
          g.wanderT = 1.2 + Math.random();
          g.wanderDir.set(Math.random() - 0.5, Math.random() - 0.5).normalize();
        }
        m.position.x += g.wanderDir.x * SUNSET_WALK_SPEED * delta;
        m.position.z += g.wanderDir.y * SUNSET_WALK_SPEED * delta;
        m.rotation.y = Math.atan2(g.wanderDir.x, g.wanderDir.y);
        if (distanceToNearestRoad(m.position.x, m.position.z) > ROAD_LATERAL_LIMIT + 6) {
          this._despawn(g);
        }
      }

      const bob = Math.sin(t * (Math.PI * 2 * 1.8) + (m.userData.bobSeed || 0)) * 0.04;
      m.position.y = bob;
      const lean = mode === 'pursue' && isNight ? 0.26 : 0;
      if (m.userData.body) m.userData.body.rotation.x = 0.2 + lean;
      const swing = Math.sin(t * 5.5 + (m.userData.bobSeed || 0)) * 0.12;
      if (m.userData.armL) m.userData.armL.rotation.x = 0.25 + swing * 0.08;
      if (m.userData.armR) m.userData.armR.rotation.x = 0.25 - swing * 0.08;
      const legPh = t * 6 + (m.userData.bobSeed || 0);
      if (m.userData.legL) m.userData.legL.rotation.x = -0.08 + Math.sin(legPh) * (mode === 'pursue' ? 0.35 : 0.12);
      if (m.userData.legR) m.userData.legR.rotation.x = -0.08 - Math.sin(legPh) * (mode === 'pursue' ? 0.35 : 0.12);
    }

    this.lastPhase = phase;
  },
};
