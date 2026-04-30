import * as THREE from 'three';
import { Collision } from '../game/Collision.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _n = new THREE.Vector3();

// Elevation-aware voxel collision builder.
//
// For each XZ cell the model touches, we track the min/max Y of the geometry
// that passes through it. A cell only becomes a collider if its vertical
// extent actually overlaps the player body band [stepHeight, playerCeiling].
// That drops three classes of "phantom walls" the previous AABB voxel
// approach kept registering:
//   * raised platforms / ledge tops sitting above the player's head
//   * curbs, garden borders, low fence trims under step height
//   * second-floor walls or overhangs whose ground-level XZ has no real wall
export function voxelizeMeshCollision(model, opts = {}) {
  const {
    cellSize = 0.5,
    triFloorY = 0.1,
    maxNormalY = 0.6,
    stepHeight = 0.6,
    playerCeiling = 2.2,
  } = opts;

  const cellRanges = new Map();

  model.traverse((child) => {
    if (!child.isMesh || !child.geometry || child.visible === false) return;
    const mat = Array.isArray(child.material) ? child.material[0] : child.material;
    if (mat && mat.transparent && mat.opacity !== undefined && mat.opacity < 0.1) return;

    const geom = child.geometry;
    const pos = geom.attributes?.position;
    if (!pos) return;
    const idx = geom.index;
    const mw = child.matrixWorld;

    const triCount = idx ? idx.count / 3 : pos.count / 3;
    for (let t = 0; t < triCount; t++) {
      const ia = idx ? idx.getX(t * 3) : t * 3;
      const ib = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const ic = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      _a.fromBufferAttribute(pos, ia).applyMatrix4(mw);
      _b.fromBufferAttribute(pos, ib).applyMatrix4(mw);
      _c.fromBufferAttribute(pos, ic).applyMatrix4(mw);

      if (_a.y < triFloorY && _b.y < triFloorY && _c.y < triFloorY) continue;

      _ab.subVectors(_b, _a);
      _ac.subVectors(_c, _a);
      _n.crossVectors(_ab, _ac);
      const lenSq = _n.x * _n.x + _n.y * _n.y + _n.z * _n.z;
      if (lenSq > 0) {
        const ny = _n.y / Math.sqrt(lenSq);
        if (Math.abs(ny) > maxNormalY) continue;
      }

      const triMinY = Math.min(_a.y, _b.y, _c.y);
      const triMaxY = Math.max(_a.y, _b.y, _c.y);

      const minX = Math.min(_a.x, _b.x, _c.x);
      const maxX = Math.max(_a.x, _b.x, _c.x);
      const minZ = Math.min(_a.z, _b.z, _c.z);
      const maxZ = Math.max(_a.z, _b.z, _c.z);
      const cx0 = Math.floor(minX / cellSize);
      const cx1 = Math.floor(maxX / cellSize);
      const cz0 = Math.floor(minZ / cellSize);
      const cz1 = Math.floor(maxZ / cellSize);

      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          const key = `${cx}|${cz}`;
          const range = cellRanges.get(key);
          if (range) {
            if (triMinY < range[0]) range[0] = triMinY;
            if (triMaxY > range[1]) range[1] = triMaxY;
          } else {
            cellRanges.set(key, [triMinY, triMaxY]);
          }
        }
      }
    }
  });

  const half = cellSize / 2;
  let registered = 0;
  let skippedHigh = 0;
  let skippedLow = 0;
  for (const [key, [cellMinY, cellMaxY]] of cellRanges) {
    if (cellMinY > playerCeiling) { skippedHigh++; continue; }
    if (cellMaxY < stepHeight) { skippedLow++; continue; }
    const sep = key.indexOf('|');
    const cx = +key.slice(0, sep);
    const cz = +key.slice(sep + 1);
    Collision.registerBox((cx + 0.5) * cellSize, (cz + 0.5) * cellSize, half, half);
    registered++;
  }

  return { registered, skippedHigh, skippedLow, totalCells: cellRanges.size };
}
