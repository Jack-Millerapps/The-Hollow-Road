import { build as buildAshwickTown, update as updateAshwickTown } from './AshwickTown.js';
import {
  buildVeilMarketTown,
  buildStonehushTown,
  buildDeeprootTown,
  buildMirrorTown,
  buildUnnamedTown,
  updateDeeprootTown,
  updateMirrorTown,
} from './GreaterTowns.js';

const registry = {
  ashwick: {
    group: null,
    millPivot: null,
    millSpinning: true,
    embers: null,
    emberVel: null,
    smoke: null,
    smokeVel: null,
    waterPivot: null,
    windows: [],
    hearth: null,
    forge: null,
    tavernWindowMeshes: [],
    lanternLights: [],
  },
  veilMarket: {
    group: null,
    orbs: [],
    flames: [],
    braziers: [],
    chimes: null,
  },
  stonehush: {
    group: null,
    threads: [],
    candles: [],
    pool: null,
  },
  deeproot: {
    group: null,
    lanterns: [],
    rootArcs: [],
  },
  mirrorTown: {
    group: null,
    panels: [],
    spire: null,
    shardRing: null,
  },
  unnamedTown: {
    group: null,
  },
};

function buildAshwick(scene) {
  buildAshwickTown(scene, registry.ashwick);
}

// Anything farther than this from the player is too distant for its flicker
// animations to be visible, so we skip the per-frame work entirely.
const VILLAGE_UPDATE_RANGE_SQ = 220 * 220;

const VILLAGE_POSITIONS = {
  ashwick: { x: 0, z: -500 },
  veilMarket: { x: 34, z: -2500 },
  stonehush: { x: -800, z: -5000 },
  deeproot: { x: 600, z: -6000 },
  mirrorTown: { x: 200, z: -7800 },
  unnamedTown: { x: 0, z: -14500 },
};

function villageInRange(name, playerPos) {
  if (!playerPos) return true;
  const p = VILLAGE_POSITIONS[name];
  if (!p) return true;
  const dx = p.x - playerPos.x;
  const dz = p.z - playerPos.z;
  return dx * dx + dz * dz < VILLAGE_UPDATE_RANGE_SQ;
}

export const VillageBuilder = {
  buildVillage(name, scene) {
    if (name === 'ashwick') buildAshwick(scene);
    else if (name === 'veilMarket') buildVeilMarketTown(scene, registry.veilMarket);
    else if (name === 'stonehush') buildStonehushTown(scene, registry.stonehush);
    else if (name === 'deeproot') buildDeeprootTown(scene, registry.deeproot);
    else if (name === 'mirrorTown') buildMirrorTown(scene, registry.mirrorTown);
    else if (name === 'unnamed' || name === 'unnamedTown') buildUnnamedTown(scene, registry.unnamedTown);
  },

  setScale(name, scale) {
    const entry = registry[name];
    if (entry?.group) entry.group.scale.setScalar(scale);
  },

  update(time, playerPos) {
    const updateAshwick = villageInRange('ashwick', playerPos);
    const updateVeil = villageInRange('veilMarket', playerPos);
    const updateStonehush = villageInRange('stonehush', playerPos);
    const updateDeeproot = villageInRange('deeproot', playerPos);
    const updateMirror = villageInRange('mirrorTown', playerPos);
    if (
      !updateAshwick &&
      !updateVeil &&
      !updateStonehush &&
      !updateDeeproot &&
      !updateMirror
    ) {
      return;
    }
    if (updateAshwick) {
      updateAshwickTown(time, playerPos, registry.ashwick);
    }

    if (updateVeil) {
      for (let i = 0; i < registry.veilMarket.orbs.length; i++) {
        const orb = registry.veilMarket.orbs[i];
        orb.position.y =
          orb.userData.baseY + Math.sin(time * 1.4 + orb.userData.bobPhase) * 0.35;
        const angle = orb.userData.angle + time * 0.08;
        orb.position.x = Math.cos(angle) * 5.5;
        orb.position.z = Math.sin(angle) * 5.5;
      }
      for (const f of registry.veilMarket.flames) {
        const flick = 0.9 + Math.sin(time * 9 + f.phase) * 0.1;
        f.mesh.scale.y = flick;
        f.mesh.scale.x = 1 + Math.sin(time * 11 + f.phase) * 0.08;
        f.glow.material.opacity = 0.5 + flick * 0.2;
      }
      for (const b of registry.veilMarket.braziers) {
        const f1 = 0.9 + Math.sin(time * 6 + b.phase) * 0.1;
        const f2 = 0.95 + Math.sin(time * 11 + b.phase * 1.2) * 0.07;
        b.core.scale.y = f1;
        b.core.scale.x = 1 + Math.sin(time * 7 + b.phase) * 0.06;
        b.inner.scale.y = f2;
        b.light.intensity = 2.8 * f1;
        b.glow.material.opacity = 0.4 + f1 * 0.2;
      }
      if (registry.veilMarket.chimes) {
        registry.veilMarket.chimes.rotation.z = Math.sin(time * 1.1) * 0.04;
      }
    }

    if (updateStonehush) {
      for (const t of registry.stonehush.threads) {
        t.position.x =
          t.userData.baseX + Math.sin(time * 0.8 + t.userData.phase) * 0.015;
        t.rotation.z = Math.sin(time * 1.2 + t.userData.phase) * 0.01;
      }
      for (const c of registry.stonehush.candles) {
        const f =
          0.85 +
          Math.sin(time * 6 + c.phase) * 0.1 +
          (Math.random() - 0.5) * 0.07;
        c.flame.scale.y = f;
        c.flame.scale.x = 1 + Math.sin(time * 8 + c.phase) * 0.08;
        c.light.intensity = 0.35 * f;
        c.glow.material.opacity = 0.4 + f * 0.12;
      }
      if (registry.stonehush.pool) {
        const mat = registry.stonehush.pool.material;
        mat.emissiveIntensity = 0.18 + Math.sin(time * 0.6) * 0.04;
      }
    }

    if (updateDeeproot) {
      updateDeeprootTown(time, registry.deeproot);
    }
    if (updateMirror) {
      updateMirrorTown(time, registry.mirrorTown);
    }
  },
};
