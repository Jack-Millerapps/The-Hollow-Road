// Shared helpers so world NPCs never stand inside voxelized GLB collision.
// Uses the same Collision registry as the player (see glbCollision.js).

import { Collision } from '../game/Collision.js';

/** Slightly wider than the player — humanoid mesh + margin vs 0.5m voxels. */
export const NPC_WORLD_RADIUS = 0.72;

export function npcWorldBlocked(x, z, radius = NPC_WORLD_RADIUS) {
  if (!Collision?.hits || typeof Collision.count !== 'function') return false;
  if (Collision.count() === 0) return false;
  return Collision.hits(x, z, radius);
}

/**
 * If (x,z) overlaps collision, search outward for the nearest free point.
 */
export function snapNpcWorldXZ(x, z, opts = {}) {
  const r = opts.radius ?? NPC_WORLD_RADIUS;
  const maxR = opts.maxSearchRadius ?? 52;
  const ringStep = opts.ringStep ?? 0.32;

  if (!npcWorldBlocked(x, z, r)) return { x, z };

  for (let ring = 1; ring * ringStep <= maxR; ring++) {
    const rr = ring * ringStep;
    const samples = Math.max(14, Math.ceil((2 * Math.PI * rr) / (ringStep * 0.75)));
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      const nx = x + Math.cos(a) * rr;
      const nz = z + Math.sin(a) * rr;
      if (!npcWorldBlocked(nx, nz, r)) return { x: nx, z: nz };
    }
  }

  // Square spiral (axis-aligned) — helps escape tight concavities.
  const grid = ringStep;
  for (let d = grid; d <= maxR; d += grid) {
    for (let sx = -d; sx <= d; sx += grid) {
      for (const sz of [-d, d]) {
        const nx = x + sx;
        const nz = z + sz;
        if (!npcWorldBlocked(nx, nz, r)) return { x: nx, z: nz };
      }
    }
    for (let sz = -d + grid; sz <= d - grid; sz += grid) {
      for (const sx of [-d, d]) {
        const nx = x + sx;
        const nz = z + sz;
        if (!npcWorldBlocked(nx, nz, r)) return { x: nx, z: nz };
      }
    }
  }

  return { x, z };
}

/**
 * Random point in a disc around (cx,cz); resamples then snaps toward center.
 */
export function randomNpcPointInDisc(cx, cz, maxRadius, tries = 40) {
  for (let t = 0; t < tries; t++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random()) * maxRadius;
    const x = cx + Math.cos(ang) * rad;
    const z = cz + Math.sin(ang) * rad;
    if (!npcWorldBlocked(x, z)) return { x, z };
  }
  return snapNpcWorldXZ(cx, cz);
}
