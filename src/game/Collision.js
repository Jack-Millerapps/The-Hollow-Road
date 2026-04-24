// ---------------------------------------------------------------------------
// Collision — minimal circle + AABB collider registry in world space.
//
// Two shapes:
//   { type: 'circle', x, z, r }
//   { type: 'box',    x, z, hw, hd }   // half-width along X, half-depth along Z
//
// Travel.js runs an axis-separated check before committing movement so the
// player slides along walls instead of stopping dead.
// ---------------------------------------------------------------------------

const colliders = [];
// Collisions outside this radius from the player are skipped — most of the
// world is far away and testing 1000+ colliders each frame would be wasteful.
const CULL_RADIUS_SQ = 60 * 60;

export const Collision = {
  addCircle(x, z, r) {
    if (!isFinite(x) || !isFinite(z) || !(r > 0)) return null;
    const c = { type: 'circle', x, z, r };
    colliders.push(c);
    return c;
  },

  addBox(x, z, halfWidth, halfDepth) {
    if (!isFinite(x) || !isFinite(z)) return null;
    const c = {
      type: 'box',
      x,
      z,
      hw: Math.max(0.05, halfWidth),
      hd: Math.max(0.05, halfDepth),
    };
    colliders.push(c);
    return c;
  },

  remove(c) {
    const i = colliders.indexOf(c);
    if (i >= 0) colliders.splice(i, 1);
  },

  clear() {
    colliders.length = 0;
  },

  count() {
    return colliders.length;
  },

  // Returns true if the given (x, z) overlaps any collider, treating the
  // query as a point with radius `playerRadius`. Far-away colliders are
  // culled by a bounding-distance check.
  hits(x, z, playerRadius) {
    for (const c of colliders) {
      const dxCull = c.x - x;
      const dzCull = c.z - z;
      if (dxCull * dxCull + dzCull * dzCull > CULL_RADIUS_SQ) continue;

      if (c.type === 'circle') {
        const dx = x - c.x;
        const dz = z - c.z;
        const r = c.r + playerRadius;
        if (dx * dx + dz * dz < r * r) return true;
      } else if (c.type === 'box') {
        const dx = Math.abs(x - c.x) - c.hw;
        const dz = Math.abs(z - c.z) - c.hd;
        if (dx < playerRadius && dz < playerRadius) {
          if (dx < 0 || dz < 0) return true;
          if (dx * dx + dz * dz < playerRadius * playerRadius) return true;
        }
      }
    }
    return false;
  },

  // Used for debugging from the console.
  _all() {
    return colliders.slice();
  },
};
