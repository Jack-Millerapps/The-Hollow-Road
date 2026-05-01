// Phase 4 — wandering Veil Market.
//
// State machine
// -------------
//   'guaranteed' : first encounter on the road out of Westwind. Market sits
//                  at its Phase 2 position (0, 40). Triggered once, then the
//                  guaranteed spawn retires forever.
//   'absent'     : no market in the world. A 60-second travel timer ticks up.
//                  On each tick past 60 s we roll for a respawn.
//   'wandering'  : market is present at a random road-segment point with an
//                  8–12 u lateral offset and a soft purple particle plume.
//
// Only one instance is ever visible. Entering the trigger radius pops the
// trade panel (same TradeSystem flow, full options list). Once the player
// leaves the radius afterwards the market despawns and the 60 s timer
// resets.
//
// Integration
// -----------
//   VeilWander.init(scene)               — build the visual group (hidden)
//   VeilWander.update(dt, playerPos)     — advance state machine + anims
//   VeilWander.isActive()                — true when a market is present
//   VeilWander.getCurrentPosition()      — {x, z} | null
//   VeilWander.consumeTradeRequest()     — Travel.js calls this when the
//                                          player enters radius. Returns
//                                          true if the trade panel should
//                                          be opened (i.e. first contact).
//   VeilWander.onTradeComplete()         — Travel.js calls this when the
//                                          trade panel closes.
//   VeilWander.onPlayerLeave()           — called when player exits radius.

import * as THREE from 'three';
import { state, notify } from '../state.js';
import { villages, getVillageByName } from '../data/villages.js';
import { ROAD_WAYPOINTS } from '../scene/Road.js';
import { caves } from '../data/caves.js';
import { TradeSystem } from './TradeSystem.js';

const TRIGGER_RADIUS = 6;
const RESPAWN_INTERVAL = 60; // seconds of world travel
const RESPAWN_CHANCE = 0.25;
const PARTICLE_COUNT = 120;

// Keep the market clear of Westwind, destinations, caves, and the ending.
const EXCLUSION = [
  { x: 0, z: 500, r: 30 }, // Westwind / start
  { x: 0, z: -14500, r: 50 }, // Unnamed Village
  ...villages.map((v) => ({
    x: v.position.x,
    z: v.position.z,
    r: v.radius + 6,
  })),
  ...caves.map((c) => ({ x: c.position.x, z: c.position.z, r: 10 })),
];

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function pickRandomRoadPoint() {
  // Sample segments proportional to their length so long stretches are
  // favoured (avoids clustering on the short bends).
  const segments = [];
  let total = 0;
  for (let i = 0; i < ROAD_WAYPOINTS.length - 1; i++) {
    const a = ROAD_WAYPOINTS[i];
    const b = ROAD_WAYPOINTS[i + 1];
    // Skip the very first and very last segments (too close to start/end).
    if (i === 0 || i === ROAD_WAYPOINTS.length - 2) continue;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    total += len;
    segments.push({ a, b, len, cum: total });
  }
  if (segments.length === 0) return null;

  for (let attempt = 0; attempt < 12; attempt++) {
    const r = Math.random() * total;
    const seg = segments.find((s) => s.cum >= r) || segments[segments.length - 1];
    const t = 0.15 + Math.random() * 0.7;
    const baseX = seg.a.x + (seg.b.x - seg.a.x) * t;
    const baseZ = seg.a.z + (seg.b.z - seg.a.z) * t;

    // Lateral normal to the segment.
    const dx = seg.b.x - seg.a.x;
    const dz = seg.b.z - seg.a.z;
    const segLen = Math.hypot(dx, dz) || 1;
    const nx = -dz / segLen;
    const nz = dx / segLen;
    const side = Math.random() < 0.5 ? -1 : 1;
    const offset = 8 + Math.random() * 4;
    const x = baseX + nx * offset * side;
    const z = baseZ + nz * offset * side;

    let blocked = false;
    for (const e of EXCLUSION) {
      if (Math.hypot(x - e.x, z - e.z) < e.r) {
        blocked = true;
        break;
      }
    }
    if (!blocked) return { x, z };
  }
  return null;
}

function buildVeilMarketBeacon() {
  const group = new THREE.Group();
  group.name = 'veilWanderBeacon';

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x2a241c,
    roughness: 1,
    flatShading: true,
  });
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0x3a2a5a,
    emissive: 0x221038,
    emissiveIntensity: 0.35,
    roughness: 0.85,
    side: THREE.DoubleSide,
    flatShading: true,
  });
  const postMat = new THREE.MeshStandardMaterial({
    color: 0x181008,
    roughness: 0.9,
    flatShading: true,
  });

  // Small plaza disc.
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.2, 0.18, 18),
    stoneMat,
  );
  plaza.position.y = 0.09;
  plaza.receiveShadow = true;
  group.add(plaza);

  // Four posts at plaza corners.
  const posts = [
    [-1.8, -1.8],
    [1.8, -1.8],
    [-1.8, 1.8],
    [1.8, 1.8],
  ];
  for (const [px, pz] of posts) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 3.2, 6),
      postMat,
    );
    post.position.set(px, 1.6, pz);
    group.add(post);
  }

  // Angled canopy.
  const canopy = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 4.6),
    canopyMat,
  );
  canopy.position.y = 3.1;
  canopy.rotation.x = -Math.PI / 2 + 0.25;
  group.add(canopy);

  // Stall counter.
  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.7, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.85 }),
  );
  counter.position.set(0, 0.55, -1.2);
  group.add(counter);

  // Central brazier with purple flame.
  const brazierStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.16, 1.8, 8),
    new THREE.MeshStandardMaterial({ color: 0x1a1208, metalness: 0.4, roughness: 0.5 }),
  );
  brazierStem.position.set(0, 0.9, 0);
  group.add(brazierStem);

  const flameCore = new THREE.Mesh(
    new THREE.ConeGeometry(0.4, 0.9, 8),
    new THREE.MeshStandardMaterial({
      color: 0xd0a0ff,
      emissive: 0xaa66ff,
      emissiveIntensity: 3.0,
      roughness: 0.3,
    }),
  );
  flameCore.position.set(0, 2.2, 0);
  group.add(flameCore);

  const brazLight = new THREE.PointLight(0xbb88ff, 2.2, 14, 1.5);
  brazLight.position.set(0, 2.4, 0);
  group.add(brazLight);

  // Soft purple glow sprite.
  const glowTex = new THREE.CanvasTexture(createGlowCanvas());
  const glowMat = new THREE.SpriteMaterial({
    map: glowTex,
    color: 0xb98aff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(8, 8, 1);
  glow.position.set(0, 2.2, 0);
  group.add(glow);

  // Purple particle plume — visible from a distance as "something magical".
  const posArr = new Float32Array(PARTICLE_COUNT * 3);
  const velArr = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 2.6;
    posArr[i * 3] = Math.cos(a) * r;
    posArr[i * 3 + 1] = Math.random() * 4;
    posArr[i * 3 + 2] = Math.sin(a) * r;
    velArr[i * 3] = (Math.random() - 0.5) * 0.25;
    velArr[i * 3 + 1] = 0.35 + Math.random() * 0.35;
    velArr[i * 3 + 2] = (Math.random() - 0.5) * 0.25;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xc89aff,
    size: 0.18,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    fog: true,
  });
  const particles = new THREE.Points(geo, mat);
  group.add(particles);

  return { group, particles, velocities: velArr, brazLight, flameCore };
}

function createGlowCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(200, 160, 255, 1)');
  g.addColorStop(0.5, 'rgba(140, 90, 220, 0.4)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return c;
}

function isInsideAnyDestination(pos) {
  for (const v of villages) {
    if (v.name === 'veilMarket') continue;
    const dx = pos.x - v.position.x;
    const dz = pos.z - v.position.z;
    if (Math.hypot(dx, dz) < v.radius + 2) return true;
  }
  return false;
}

export const VeilWander = {
  _scene: null,
  _beacon: null,
  _state: 'guaranteed', // rehydrated in init()
  _spawnPoint: null,
  _respawnTimer: 0,
  _playerInside: false,
  _tradeRequested: false,
  _time: 0,

  init(scene) {
    this._scene = scene;
    this._beacon = buildVeilMarketBeacon();
    this._beacon.group.visible = false;
    scene.add(this._beacon.group);

    // Pick initial state from saved progress. Older saves (pre-Phase 4)
    // will not carry `veilFirstEncounterDone`, but if they already completed
    // the Phase 2 Veil Market trade we treat the guaranteed encounter as
    // retired so we don't replay it.
    const firstDone =
      !!(state.flags && state.flags.veilFirstEncounterDone) ||
      !!state.tradeComplete?.veilMarket;
    if (!firstDone) {
      this._state = 'guaranteed';
      this._spawnPoint = { x: 0, z: -200 };
      this._placeBeacon(this._spawnPoint);
    } else {
      this._state = 'absent';
      this._spawnPoint = null;
      this._respawnTimer = 0;
      if (state.flags) state.flags.veilFirstEncounterDone = true;
    }
    this._playerInside = false;
    this._tradeRequested = false;
  },

  _placeBeacon(point) {
    if (!this._beacon || !point) return;
    this._beacon.group.position.set(point.x, 0, point.z);
    this._beacon.group.visible = true;
  },

  _hideBeacon() {
    if (this._beacon) this._beacon.group.visible = false;
  },

  _canAdvanceTimer(playerPos) {
    if (state.currentScene !== 'world') return false;
    if (state.flags && state.flags.endingStarted) return false;
    if (isInsideAnyDestination(playerPos)) return false;
    return true;
  },

  update(dt, playerPos) {
    if (!this._beacon) return;
    this._time += dt;

    // Trade can finish at the fixed market; retire road beacon the same session.
    if (state.tradeComplete?.veilMarket) {
      if (this._state !== 'absent' || this._spawnPoint || this._beacon.group.visible) {
        this._state = 'absent';
        this._spawnPoint = null;
        this._respawnTimer = 0;
        this._hideBeacon();
        this._playerInside = false;
        this._tradeRequested = false;
        if (state.flags && !state.flags.veilFirstEncounterDone) {
          state.flags.veilFirstEncounterDone = true;
          notify();
        }
      }
    }

    // Animate beacon when active.
    if (this._beacon.group.visible) {
      const particles = this._beacon.particles;
      const posAttr = particles.geometry.attributes.position;
      const arr = posAttr.array;
      const vel = this._beacon.velocities;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] += vel[i] * dt;
        arr[i + 1] += vel[i + 1] * dt;
        arr[i + 2] += vel[i + 2] * dt;
        if (arr[i + 1] > 5.5) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * 2.6;
          arr[i] = Math.cos(a) * r;
          arr[i + 1] = 0;
          arr[i + 2] = Math.sin(a) * r;
        }
      }
      posAttr.needsUpdate = true;

      this._beacon.brazLight.intensity =
        2.0 + Math.sin(this._time * 5) * 0.3 + Math.random() * 0.1;
      this._beacon.flameCore.scale.y = 0.9 + Math.sin(this._time * 9) * 0.1;
    }

    if (this._state === 'absent') {
      if (this._canAdvanceTimer(playerPos)) {
        this._respawnTimer += dt;
        if (this._respawnTimer >= RESPAWN_INTERVAL) {
          this._respawnTimer = 0;
          if (Math.random() < RESPAWN_CHANCE) {
            const pt = pickRandomRoadPoint();
            if (pt) {
              this._spawnPoint = pt;
              this._state = 'wandering';
              this._playerInside = false;
              this._tradeRequested = false;
              this._placeBeacon(pt);
              state.veilMarketSpawnCount = (state.veilMarketSpawnCount || 0) + 1;
              notify();
            }
          }
        }
      }
      return;
    }

    // 'guaranteed' or 'wandering' — watch for player enter/leave.
    if (!this._spawnPoint) return;
    const dx = playerPos.x - this._spawnPoint.x;
    const dz = playerPos.z - this._spawnPoint.z;
    const dist = Math.hypot(dx, dz);
    const inside = dist < TRIGGER_RADIUS;

    if (!this._playerInside && inside) {
      this._playerInside = true;
      this._tradeRequested = true;
    } else if (this._playerInside && !inside) {
      this._playerInside = false;
      this._despawn();
    }
  },

  _despawn() {
    if (this._state === 'guaranteed') {
      if (!state.flags.veilFirstEncounterDone) {
        state.flags.veilFirstEncounterDone = true;
        notify();
      }
    }
    this._state = 'absent';
    this._spawnPoint = null;
    this._respawnTimer = 0;
    this._hideBeacon();
    this._tradeRequested = false;
  },

  // Travel.js uses this atomically: if it returns true, it opens the trade
  // panel exactly once. Subsequent polls while the player stays inside the
  // radius return false, so we don't re-trigger every frame.
  consumeTradeRequest() {
    if (this._tradeRequested) {
      this._tradeRequested = false;
      return true;
    }
    return false;
  },

  // Called by Travel.js once the TradePanel onComplete fires. Kept as a
  // hook for future extensions (e.g. offering a "come back tomorrow" line).
  // Intentionally does not force a despawn — the market only despawns when
  // the player physically leaves the trigger radius.
  onTradeComplete() {
    // no-op; despawn is driven by player leaving radius.
  },

  isActive() {
    return this._state !== 'absent' && !!this._spawnPoint;
  },

  getCurrentPosition() {
    return this._spawnPoint ? { ...this._spawnPoint } : null;
  },

  getState() {
    return this._state;
  },

  // Convenience for UI / debugging.
  openTradePanel(onComplete) {
    const village = getVillageByName('veilMarket');
    if (!village) {
      if (onComplete) onComplete();
      return;
    }
    TradeSystem.startTrade(village, () => {
      this.onTradeComplete();
      if (onComplete) onComplete();
    });
  },
};
