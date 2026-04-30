import * as THREE from 'three';
import { Collision } from '../game/Collision.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _n = new THREE.Vector3();

export function voxelizeMeshCollision(model, {
  cellSize = 0.5,
  minY = 0.5,
  maxNormalY = 0.7,
} = {}) {
  const cells = new Set();

  model.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
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

      if (_a.y < minY && _b.y < minY && _c.y < minY) continue;

      _ab.subVectors(_b, _a);
      _ac.subVectors(_c, _a);
      _n.crossVectors(_ab, _ac);
      const lenSq = _n.x * _n.x + _n.y * _n.y + _n.z * _n.z;
      if (lenSq > 0) {
        const ny = _n.y / Math.sqrt(lenSq);
        if (Math.abs(ny) > maxNormalY) continue;
      }

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
          cells.add(`${cx}|${cz}`);
        }
      }
    }
  });

  const half = cellSize / 2;
  for (const key of cells) {
    const sep = key.indexOf('|');
    const cx = +key.slice(0, sep);
    const cz = +key.slice(sep + 1);
    Collision.registerBox((cx + 0.5) * cellSize, (cz + 0.5) * cellSize, half, half);
  }

  return cells.size;
}
