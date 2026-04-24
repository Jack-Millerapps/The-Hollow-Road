import * as THREE from 'three';
import { state, notify } from '../state.js';
import { ROAD_WAYPOINTS } from '../scene/Road.js';
import { villages } from '../data/villages.js';
import { caves } from '../data/caves.js';
import { DayNight } from '../scene/DayNight.js';
import { GoblinPopup } from '../ui/GoblinPopup.js';

// ---------------------------------------------------------------------------
// Phase 3 — Goblins.
//
// Non-combatable stalkers that appear during sunset (passive) and night
// (aggressive). They spawn only along the road, never inside Westwind / cave
// triggers / village zones. A touch during night triggers a theft popup and
// the goblin despawns. Stepping off the road (> 8 units lateral) at night
// makes them lose interest and wander.
// ---------------------------------------------------------------------------

const MAX_GOBLINS = 3;
const SUNSET_WALK_SPEED = 0.5;
const NIGHT_PURSUIT_SPEED = 1.5;
const CONTACT_RADIUS = 1.5;
const ROAD_LATERAL_LIMIT = 8;
const SPAWN_DIST_MIN = 14;
const SPAWN_DIST_MAX = 40;
const WESTWIND_EXCLUSION_Z = 108; // do not spawn north of here (inside Westwind)
const VILLAGE_EXCLUSION_PAD = 3; // extra margin around village trigger radius
const CAVE_EXCLUSION_PAD = 3;
const SPAWN_TRY_INTERVAL = 1.0; // seconds between spawn attempts during sunset
const DESPAWN_FADE = 0.35; // seconds

// ---------------------------------------------------------------------------
// Geometry — one shared set of materials reused per goblin.
// ---------------------------------------------------------------------------

const BODY_MAT = new THREE.MeshStandardMaterial({
  color: 0x2a3a2a,
  roughness: 0.95,
  metalness: 0.0,
  flatShading: true,
});
const HEAD_MAT = new THREE.MeshStandardMaterial({
  color: 0x3a3a32,
  roughness: 0.9,
  flatShading: true,
});
const ARM_MAT = new THREE.MeshStandardMaterial({
  color: 0x252f26,
  roughness: 0.95,
  flatShading: true,
});
const EYE_MAT = new THREE.MeshStandardMaterial({
  color: 0xff2020,
  emissive: 0xff0a0a,
  emissiveIntensity: 2.2,
  roughness: 0.3,
});

function buildGoblinMesh() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.52, 0.85, 8),
    BODY_MAT,
  );
  body.position.y = 0.43;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 12, 10),
    HEAD_MAT,
  );
  head.position.y = 1.15;
  head.castShadow = true;
  group.add(head);

  const eyeGeom = new THREE.SphereGeometry(0.07, 8, 6);
  const leftEye = new THREE.Mesh(eyeGeom, EYE_MAT);
  leftEye.position.set(-0.15, 1.2, 0.36);
  group.add(leftEye);
  const rightEye = new THREE.Mesh(eyeGeom, EYE_MAT);
  rightEye.position.set(0.15, 1.2, 0.36);
  group.add(rightEye);

  // Spindly arms.
  const armGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.9, 6);
  const leftArm = new THREE.Mesh(armGeom, ARM_MAT);
  leftArm.position.set(-0.42, 0.55, 0);
  leftArm.rotation.z = 0.4;
  group.add(leftArm);
  const rightArm = new THREE.Mesh(armGeom, ARM_MAT);
  rightArm.position.set(0.42, 0.55, 0);
  rightArm.rotation.z = -0.4;
  group.add(rightArm);

  group.userData.eyes = [leftEye, rightEye];
  group.userData.bobSeed = Math.random() * 10;
  return group;
}

// ---------------------------------------------------------------------------
// Road / village / cave exclusion helpers.
// ---------------------------------------------------------------------------

// Squared distance from point to segment — avoids allocating a result object
// and skips Math.hypot when we only need to compare.
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

// Cheaper boolean variant — stops on the first segment within `limit` units.
// Callers that only care about "within range" (Travel's off-road flag, spawner
// placement) pay for <1 segment on average once the player is on the road.
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

// Pick a point along the road within [min, max] distance of the player,
// close to (but not inside) the road corridor. Returns null if no valid
// candidate was found in a few tries.
function pickSpawnPoint(playerPos) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const i = Math.floor(Math.random() * (ROAD_WAYPOINTS.length - 1));
    const a = ROAD_WAYPOINTS[i];
    const b = ROAD_WAYPOINTS[i + 1];
    const t = Math.random();
    const cx = a.x + (b.x - a.x) * t;
    const cz = a.z + (b.z - a.z) * t;
    // Push slightly to the side so they appear along the edge of the road.
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
    // Confirm the picked point is actually near the road centerline.
    if (distanceToNearestRoad(x, z) > ROAD_LATERAL_LIMIT + 2) continue;
    return { x, z };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Goblins module
// ---------------------------------------------------------------------------

export const Goblins = {
  scene: null,
  parent: null, // THREE.Group holding all live goblin meshes
  entries: [], // { mesh, state, targetPt, wanderT, wanderDir }
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
      if (g.mesh.parent) g.mesh.parent.remove(g.mesh);
    }
    this.entries = [];
  },

  _spawnOne(playerPos) {
    const pt = pickSpawnPoint(playerPos);
    if (!pt) return;
    const mesh = buildGoblinMesh();
    mesh.position.set(pt.x, 0, pt.z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    this.parent.add(mesh);
    this.entries.push({
      mesh,
      // 'wander' during sunset, 'pursue' at night, 'flee' if player went off-road,
      // 'despawn' during the fade-out before removal.
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
    // Pick a random currency the player actually has something of.
    const pool = [];
    const c = state.currencies || {};
    if ((c.gold || 0) >= 5) pool.push('gold');
    if ((c.memories || 0) >= 1) pool.push('memories');
    if ((c.promises || 0) >= 1) pool.push('promises');
    if ((c.years || 0) >= 1) pool.push('years');
    if ((c.secrets || 0) >= 1) pool.push('secrets');
    if (pool.length === 0) {
      // Nothing to steal; goblin just leaves.
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
    // Phase 4 — track thefts for the ending monologue.
    state.totalGoblinThefts = (state.totalGoblinThefts || 0) + 1;
    // ideally play stolen.mp3
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

    // Hide everything if we're not in the world.
    if (state.currentScene !== 'world') {
      if (this.entries.length) this._clearAll();
      this.parent.visible = false;
      return;
    }
    this.parent.visible = true;

    const phase = DayNight.getCurrentPhase();
    // Despawn whole population when sunrise starts or we drop back to day.
    if (phase === 'sunrise' || phase === 'day') {
      if (this.entries.length) this._clearAll();
      this.lastPhase = phase;
      return;
    }

    // Freeze spawning if the player is already off-road at night — goblins
    // never enter the scene in that case.
    const offRoad = !!state.offRoad;

    // Attempt to top up population during sunset and night.
    if (!offRoad) {
      this.spawnTimer -= delta;
      if (this.entries.length < MAX_GOBLINS && this.spawnTimer <= 0) {
        this._spawnOne(playerPos);
        this.spawnTimer = SPAWN_TRY_INTERVAL * (0.6 + Math.random() * 0.8);
      }
    }

    const isNight = phase === 'night';

    // Per-goblin behaviour.
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const g = this.entries[i];
      const m = g.mesh;

      if (g.state === 'despawn') {
        g.fadeT += delta;
        const k = Math.min(1, g.fadeT / DESPAWN_FADE);
        m.scale.setScalar(Math.max(0.001, 1 - k));
        if (k >= 1) {
          if (m.parent) m.parent.remove(m);
          this.entries.splice(i, 1);
        }
        continue;
      }

      // Determine behaviour mode for this frame.
      let mode;
      if (!isNight) {
        mode = 'wander';
      } else if (offRoad) {
        mode = 'flee';
      } else {
        mode = 'pursue';
      }

      if (mode === 'wander') {
        g.wanderT -= delta;
        if (g.wanderT <= 0) {
          g.wanderT = 0.8 + Math.random() * 1.4;
          g.wanderDir.set(Math.random() - 0.5, Math.random() - 0.5).normalize();
        }
        m.position.x += g.wanderDir.x * SUNSET_WALK_SPEED * delta;
        m.position.z += g.wanderDir.y * SUNSET_WALK_SPEED * delta;
        m.rotation.y = Math.atan2(g.wanderDir.x, g.wanderDir.y);

        // Despawn if they stray too far from the road.
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
        // Lose interest: wander back toward the road centerline and despawn
        // if we get too far.
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

      // Subtle bob so they feel alive.
      const t = performance.now() / 1000 + (m.userData.bobSeed || 0);
      m.position.y = Math.abs(Math.sin(t * 4.4)) * 0.06;
    }

    this.lastPhase = phase;
  },
};
