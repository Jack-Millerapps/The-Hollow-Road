// ---------------------------------------------------------------------------
// Collision — minimal circle + AABB collider registry in world space.
//
// Two shapes:
//   { type: 'circle', x, z, r }
//   { type: 'box',    x, z, hw, hd }   // half-width along X, half-depth along Z
//
// Travel.js runs an axis-separated check before committing movement so the
// player slides along walls instead of stopping dead.
//
// Lookups go through a uniform spatial hash — the world is ~3000x18000 units
// with hundreds of colliders, so a linear scan on every movement axis was the
// dominant CPU cost in the travel loop. The hash keeps queries O(cellCount)
// regardless of total collider count.
// ---------------------------------------------------------------------------

const colliders = [];

// Cell size tuned for the tree/fence-post density on the road. A collider
// larger than this is inserted into multiple cells.
const CELL_SIZE = 8;
const INV_CELL = 1 / CELL_SIZE;

// Map<cellKey, collider[]>. cellKey = cx * 73856093 ^ cz * 19349663 bitwise,
// which is the usual spatial-hash mix; Map handles collisions.
const grid = new Map();

function cellKey(cx, cz) {
  // 32-bit signed mix, good enough for a 3000x18000 world at 8u cells.
  return (cx * 73856093) ^ (cz * 19349663);
}

function insertIntoGrid(c) {
  const ext = c.type === 'circle' ? c.r : Math.max(c.hw, c.hd);
  const minCX = Math.floor((c.x - ext) * INV_CELL);
  const maxCX = Math.floor((c.x + ext) * INV_CELL);
  const minCZ = Math.floor((c.z - ext) * INV_CELL);
  const maxCZ = Math.floor((c.z + ext) * INV_CELL);
  c._cells = [];
  for (let cx = minCX; cx <= maxCX; cx++) {
    for (let cz = minCZ; cz <= maxCZ; cz++) {
      const k = cellKey(cx, cz);
      let bucket = grid.get(k);
      if (!bucket) {
        bucket = [];
        grid.set(k, bucket);
      }
      bucket.push(c);
      c._cells.push(k);
    }
  }
}

function removeFromGrid(c) {
  if (!c._cells) return;
  for (const k of c._cells) {
    const bucket = grid.get(k);
    if (!bucket) continue;
    const i = bucket.indexOf(c);
    if (i >= 0) bucket.splice(i, 1);
    if (bucket.length === 0) grid.delete(k);
  }
  c._cells = null;
}

export const Collision = {
  addCircle(x, z, r) {
    if (!isFinite(x) || !isFinite(z) || !(r > 0)) return null;
    const c = { type: 'circle', x, z, r, _cells: null };
    colliders.push(c);
    insertIntoGrid(c);
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
      _cells: null,
    };
    colliders.push(c);
    insertIntoGrid(c);
    return c;
  },

  remove(c) {
    if (!c) return;
    removeFromGrid(c);
    const i = colliders.indexOf(c);
    if (i >= 0) colliders.splice(i, 1);
  },

  clear() {
    colliders.length = 0;
    grid.clear();
  },

  count() {
    return colliders.length;
  },

  // Returns true if the given (x, z) overlaps any collider, treating the
  // query as a point with radius `playerRadius`.
  hits(x, z, playerRadius) {
    // Only scan the cells that could contain something within reach.
    const minCX = Math.floor((x - playerRadius) * INV_CELL);
    const maxCX = Math.floor((x + playerRadius) * INV_CELL);
    const minCZ = Math.floor((z - playerRadius) * INV_CELL);
    const maxCZ = Math.floor((z + playerRadius) * INV_CELL);
    // A collider inserted into multiple cells can appear more than once in
    // the cell sweep; we early-return on first hit so dedupe isn't needed.
    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cz = minCZ; cz <= maxCZ; cz++) {
        const bucket = grid.get(cellKey(cx, cz));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const c = bucket[i];
          if (c.type === 'circle') {
            const dx = x - c.x;
            const dz = z - c.z;
            const r = c.r + playerRadius;
            if (dx * dx + dz * dz < r * r) return true;
          } else {
            const dx = Math.abs(x - c.x) - c.hw;
            const dz = Math.abs(z - c.z) - c.hd;
            if (dx < playerRadius && dz < playerRadius) {
              if (dx < 0 || dz < 0) return true;
              if (dx * dx + dz * dz < playerRadius * playerRadius) return true;
            }
          }
        }
      }
    }
    return false;
  },

  _all() {
    return colliders.slice();
  },
};
