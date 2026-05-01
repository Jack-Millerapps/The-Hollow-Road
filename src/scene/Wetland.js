import * as THREE from 'three';
import { ChunkManager } from '../game/ChunkManager.js';
import { MIRROR_WETLAND_CENTER, MIRROR_WETLAND_R } from '../data/mirrorTownTargets.js';

// Simple wetland terrain patch near Mirror Town: shallow water + reeds.
export const Wetland = {
  group: null,
  _reeds: null,
  _water: null,

  init(scene) {
    if (this.group) return;
    const g = new THREE.Group();
    g.name = 'Wetland';
    g.position.set(0, 0, 0);

    // Water sheet.
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x1a3a40,
      roughness: 0.2,
      metalness: 0.0,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
    });
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(MIRROR_WETLAND_R, 48),
      waterMat,
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(MIRROR_WETLAND_CENTER.x, 0.02, MIRROR_WETLAND_CENTER.z);
    water.receiveShadow = false;
    g.add(water);
    this._water = water;

    // Reeds (cheap instancing).
    const reedGeom = new THREE.CylinderGeometry(0.05, 0.07, 1.8, 5);
    const reedMat = new THREE.MeshStandardMaterial({
      color: 0x2f5a34,
      roughness: 0.95,
      metalness: 0,
      flatShading: true,
    });
    const count = 220;
    const inst = new THREE.InstancedMesh(reedGeom, reedMat, count);
    inst.frustumCulled = false;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      // Ring-biased placement: more reeds near the edge.
      const a = Math.random() * Math.PI * 2;
      const r = MIRROR_WETLAND_R * (0.35 + Math.pow(Math.random(), 0.45) * 0.65);
      p.set(
        MIRROR_WETLAND_CENTER.x + Math.cos(a) * r + (Math.random() - 0.5) * 6,
        0.9,
        MIRROR_WETLAND_CENTER.z + Math.sin(a) * r + (Math.random() - 0.5) * 6,
      );
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
      const h = 1.2 + Math.random() * 1.25;
      s.set(1, h / 1.8, 1);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    g.add(inst);
    this._reeds = inst;

    scene.add(g);
    this.group = g;
    ChunkManager.register(g, MIRROR_WETLAND_CENTER.x, MIRROR_WETLAND_CENTER.z, { radius: MIRROR_WETLAND_R + 80 });
  },

  update(timeS) {
    if (!this.group || !this._water) return;
    const t = timeS || (performance.now() * 0.001);
    // Subtle shimmer via opacity.
    const base = 0.48;
    const wobble = (Math.sin(t * 0.9) + Math.sin(t * 1.4 + 1.2)) * 0.02;
    this._water.material.opacity = base + wobble;
  },
};

