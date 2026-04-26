import * as THREE from 'three';
import { ROAD_SEGMENTS_DATA } from './Road.js';
import { SceneManager } from './SceneManager.js';
import { Collision } from '../game/Collision.js';
import { ChunkManager } from '../game/ChunkManager.js';

// ---------------------------------------------------------------------------
// Environment — consolidation patch.
//
// The world is now ~16,500 units long. Trees, grass, lanterns, rocks, and
// hills are rendered as InstancedMesh groups. A lantern light budget is
// enforced via SceneManager.registerPointLight() + cullPointLights() so
// only the 4 nearest PointLights are active at any time.
//
// World-spanning InstancedMeshes must use frustumCulled = false: Three.js
// only bounds the base geometry (near the origin), not every instance, so
// with culling on the whole forest/hills mesh disappears when you face away
// from that default sphere. ChunkManager + fog still limit what matters.
// ---------------------------------------------------------------------------

const ROAD_HALF_WIDTH = 3.2;

// Hill barriers between legs — tall silhouettes that hide the next town
// until the player is nearly on top of it. Rendered as InstancedMesh.
// On low-end hardware (matches SceneManager.detectLowEnd) we halve the
// instance counts so the vertex pipeline and transform upload are cheaper.
function isLowEnd() {
  try {
    const p = new URLSearchParams(window.location.search).get('lowend');
    if (p === '1') return true;
    if (p === '0') return false;
  } catch {}
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const touch = typeof window !== 'undefined' && 'ontouchstart' in window;
  return cores <= 4 || mem <= 4 || touch;
}
const LOW = isLowEnd();
const HILL_COUNT = LOW ? 60 : 120;
const TREE_COUNT = LOW ? 700 : 1400;
const GRASS_COUNT = LOW ? 900 : 1800;
const ROCK_COUNT = LOW ? 130 : 260;
const LANTERN_COUNT_PER_KM = 8; // sparse at this scale

function stdMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.9,
    metalness: opts.metalness ?? 0,
    flatShading: opts.flatShading ?? true,
  });
}

function makeGroundTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0a1208';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 30 + Math.random() * 90;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(22, 38, 18, ${0.3 + Math.random() * 0.25})`);
    grad.addColorStop(1, 'rgba(22, 38, 18, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 800; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = `rgba(${15 + Math.random() * 25}, ${30 + Math.random() * 20}, ${10 + Math.random() * 10}, 0.6)`;
    ctx.fillRect(x, y, 1.3, 1.3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function makeMoonTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(240, 236, 222, 1)');
  g.addColorStop(0.55, 'rgba(210, 210, 200, 0.9)');
  g.addColorStop(0.7, 'rgba(160, 170, 200, 0.2)');
  g.addColorStop(1, 'rgba(20, 30, 50, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function distanceToSegment(x, z, s, e) {
  const dx = e.x - s.x;
  const dz = e.z - s.z;
  const l2 = dx * dx + dz * dz;
  if (l2 === 0) return Math.hypot(x - s.x, z - s.z);
  let t = ((x - s.x) * dx + (z - s.z) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  const px = s.x + t * dx;
  const pz = s.z + t * dz;
  return Math.hypot(x - px, z - pz);
}

function distToRoad(x, z) {
  let best = Infinity;
  for (const seg of ROAD_SEGMENTS_DATA) {
    const d = distanceToSegment(x, z, seg.start, seg.end);
    if (d < best) best = d;
  }
  return best;
}

function sampleAlongRoad() {
  const seg =
    ROAD_SEGMENTS_DATA[Math.floor(Math.random() * ROAD_SEGMENTS_DATA.length)];
  const t = Math.random();
  const x = seg.start.x + (seg.end.x - seg.start.x) * t;
  const z = seg.start.z + (seg.end.z - seg.start.z) * t;
  const dx = seg.end.x - seg.start.x;
  const dz = seg.end.z - seg.start.z;
  const pl = Math.hypot(dx, dz) || 1;
  const perpX = -dz / pl;
  const perpZ = dx / pl;
  return { x, z, perpX, perpZ };
}

export const Environment = {
  group: null,
  moonGroup: null,
  stars: null,
  treeInst: null,
  grassInst: null,
  rockInst: null,
  hillInst: null,
  lanternCores: null,
  lanternPoles: null,
  lanternLights: [],

  init(scene) {
    const group = new THREE.Group();
    // Do not cull the whole group — children include mis-bounded InstancedMeshes.
    group.frustumCulled = false;
    this.group = group;

    this._buildGround(group);
    this._buildSkyProps(scene);
    this._buildHills(group);
    this._buildTrees(group);
    this._buildGrass(group);
    this._buildRocks(group);
    this._buildLanterns(group);

    scene.add(group);

    // ChunkManager registration. InstancedMeshes span the whole road; they
    // are "global" so chunk distance does not hide them. Mesh-level frustum
    // culling is off on those meshes (see _build*), since their bounds are
    // not expanded to all instances.
    if (this.hillInst) ChunkManager.registerGlobal(this.hillInst);
    if (this.treeInst?.trunk) ChunkManager.registerGlobal(this.treeInst.trunk);
    if (this.treeInst?.canopy) ChunkManager.registerGlobal(this.treeInst.canopy);
    if (this.grassInst) ChunkManager.registerGlobal(this.grassInst);
    if (this.rockInst) ChunkManager.registerGlobal(this.rockInst);
    if (this.lanternPoles) ChunkManager.registerGlobal(this.lanternPoles);
    if (this.lanternCores) ChunkManager.registerGlobal(this.lanternCores);
    // Per-position lantern point lights are registered with their world
    // position so distant ones get hidden (and skipped by the renderer).
    for (const light of this.lanternLights) {
      const p = new THREE.Vector3();
      light.getWorldPosition(p);
      ChunkManager.register(light, p.x, p.z);
    }
  },

  _buildGround(group) {
    const tex = makeGroundTexture();
    tex.repeat.set(60, 60);
    const groundMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.98,
      metalness: 0,
    });
    // Huge ground plane covering the whole route (18k along Z). Continuity
    // with Westwind→Ashwick relies on SceneManager camera far (~32k) plus
    // ChunkManager on instanced props (see Prompt A / B Fix 5).
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(3000, 18000, 1, 1),
      groundMat,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, -7000);
    // The ground covers 3000x18000 units; sampling the shadow map per
    // fragment across that area is a real fill-rate cost for very subtle
    // benefit (the dim moon shadow barely lands on the textured ground).
    ground.receiveShadow = false;
    group.add(ground);
  },

  _buildSkyProps(scene) {
    const moonGroup = new THREE.Group();
    this.moonGroup = moonGroup;

    const moonTex = makeMoonTexture();
    const moon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: moonTex,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    moon.scale.set(90, 90, 1);
    moon.renderOrder = -1;
    moonGroup.add(moon);

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: moonTex,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    halo.scale.set(220, 220, 1);
    halo.renderOrder = -2;
    moonGroup.add(halo);

    moonGroup.position.set(-400, 260, -700);
    scene.add(moonGroup);

    // Stars
    const starCount = 500;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.8 + 0.05);
      const r = 900 + Math.random() * 100;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.6 + 40;
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta) - 600;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      size: 2.2,
      color: 0xddddff,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      depthWrite: false,
      fog: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    stars.renderOrder = -3;
    scene.add(stars);
    this.stars = stars;
  },

  // Tall hill silhouettes to block line of sight between legs.
  _buildHills(group) {
    const geo = new THREE.ConeGeometry(60, 80, 8);
    const mat = stdMat(0x0a140b, { roughness: 1 });
    const inst = new THREE.InstancedMesh(geo, mat, HILL_COUNT);
    inst.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const q = new THREE.Quaternion();

    let placed = 0;
    let safety = 0;
    while (placed < HILL_COUNT && safety < HILL_COUNT * 20) {
      safety++;
      // Hills ride along both sides of the road, offset 80-200 units.
      const hit = sampleAlongRoad();
      const side = Math.random() < 0.5 ? -1 : 1;
      const off = 80 + Math.random() * 120;
      const x = hit.x + hit.perpX * side * off;
      const z = hit.z + hit.perpZ * side * off;
      if (distToRoad(x, z) < 70) continue;
      pos.set(x, -6 + Math.random() * 2, z);
      const s = 0.8 + Math.random() * 1.4;
      scl.set(s, s * (0.8 + Math.random() * 0.6), s);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
      m.compose(pos, q, scl);
      inst.setMatrixAt(placed, m);
      placed++;
    }
    inst.count = placed;
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    group.add(inst);
    this.hillInst = inst;
  },

  _buildTrees(group) {
    // Simple low-poly trunk + spherical canopy, merged into two instanced meshes
    // sharing the same transforms via a pair of InstancedMesh (trunk + canopy).
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.6, 6);
    trunkGeo.translate(0, 1.3, 0);
    const canopyGeo = new THREE.IcosahedronGeometry(1.1, 0);
    canopyGeo.translate(0, 3.1, 0);

    const trunkMat = stdMat(0x2a1a0f, { roughness: 0.95 });
    const canopyMat = stdMat(0x1c3120, { roughness: 0.95 });

    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, TREE_COUNT);
    const canopyInst = new THREE.InstancedMesh(canopyGeo, canopyMat, TREE_COUNT);

    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const q = new THREE.Quaternion();

    let placed = 0;
    let safety = 0;
    while (placed < TREE_COUNT && safety < TREE_COUNT * 10) {
      safety++;
      const hit = sampleAlongRoad();
      const side = Math.random() < 0.5 ? -1 : 1;
      const off = ROAD_HALF_WIDTH + 3 + Math.random() * 40;
      const x = hit.x + hit.perpX * side * off;
      const z = hit.z + hit.perpZ * side * off;
      if (distToRoad(x, z) < ROAD_HALF_WIDTH + 2) continue;
      pos.set(x, 0, z);
      const s = 0.85 + Math.random() * 0.6;
      scl.set(s, s, s);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
      m.compose(pos, q, scl);
      trunkInst.setMatrixAt(placed, m);
      canopyInst.setMatrixAt(placed, m);
      // Only register colliders for trees genuinely next to the road —
      // distant instances are unreachable for the player anyway and
      // registering all 1400 would waste per-frame work.
      if (off < 12) {
        Collision.addCircle(x, z, 0.55 * s);
      }
      placed++;
    }
    trunkInst.count = placed;
    canopyInst.count = placed;
    trunkInst.instanceMatrix.needsUpdate = true;
    canopyInst.instanceMatrix.needsUpdate = true;
    trunkInst.castShadow = false;
    canopyInst.castShadow = false;
    trunkInst.receiveShadow = true;
    canopyInst.receiveShadow = true;
    trunkInst.frustumCulled = false;
    canopyInst.frustumCulled = false;
    group.add(trunkInst);
    group.add(canopyInst);
    this.treeInst = { trunk: trunkInst, canopy: canopyInst };
  },

  _buildGrass(group) {
    const geo = new THREE.ConeGeometry(0.08, 0.35, 4);
    geo.translate(0, 0.175, 0);
    const mat = stdMat(0x1a3312, { roughness: 1 });
    const inst = new THREE.InstancedMesh(geo, mat, GRASS_COUNT);

    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const q = new THREE.Quaternion();

    let placed = 0;
    let safety = 0;
    while (placed < GRASS_COUNT && safety < GRASS_COUNT * 6) {
      safety++;
      const hit = sampleAlongRoad();
      const side = Math.random() < 0.5 ? -1 : 1;
      const off = ROAD_HALF_WIDTH + 0.3 + Math.random() * 4;
      const x = hit.x + hit.perpX * side * off;
      const z = hit.z + hit.perpZ * side * off;
      pos.set(x, 0, z);
      const s = 0.7 + Math.random() * 0.8;
      scl.set(s, s, s);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
      m.compose(pos, q, scl);
      inst.setMatrixAt(placed, m);
      placed++;
    }
    inst.count = placed;
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    group.add(inst);
    this.grassInst = inst;
  },

  _buildRocks(group) {
    const geo = new THREE.DodecahedronGeometry(0.4, 0);
    const mat = stdMat(0x262222, { roughness: 0.9 });
    const inst = new THREE.InstancedMesh(geo, mat, ROCK_COUNT);
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const q = new THREE.Quaternion();

    let placed = 0;
    let safety = 0;
    while (placed < ROCK_COUNT && safety < ROCK_COUNT * 6) {
      safety++;
      const hit = sampleAlongRoad();
      const side = Math.random() < 0.5 ? -1 : 1;
      const off = ROAD_HALF_WIDTH + 1 + Math.random() * 10;
      const x = hit.x + hit.perpX * side * off;
      const z = hit.z + hit.perpZ * side * off;
      pos.set(x, 0.1, z);
      const s = 0.6 + Math.random() * 1.1;
      scl.set(s, s * (0.5 + Math.random() * 0.4), s);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
      m.compose(pos, q, scl);
      inst.setMatrixAt(placed, m);
      placed++;
    }
    inst.count = placed;
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = false;
    inst.receiveShadow = true;
    inst.frustumCulled = false;
    group.add(inst);
    this.rockInst = inst;
  },

  _buildLanterns(group) {
    // Lanterns are sparse along the road. The lantern meshes (pole + cage) are
    // instanced; the small PointLight attached to each is registered with the
    // SceneManager light budget so only the closest 4 are lit at a time.
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.075, 3.6, 6);
    poleGeo.translate(0, 1.8, 0);
    const coreGeo = new THREE.SphereGeometry(0.12, 6, 5);
    coreGeo.translate(0.5, 3.3, 0);

    const poleMat = stdMat(0x0c0904, { roughness: 0.8 });
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xffc06a,
      emissive: 0xff9030,
      emissiveIntensity: 2.2,
      roughness: 0.4,
    });

    // Estimate lantern count from total road length.
    let totalLen = 0;
    for (const s of ROAD_SEGMENTS_DATA) {
      totalLen += Math.hypot(s.end.x - s.start.x, s.end.z - s.start.z);
    }
    const count = Math.max(80, Math.floor((totalLen / 1000) * LANTERN_COUNT_PER_KM));

    const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, count);
    const coreInst = new THREE.InstancedMesh(coreGeo, coreMat, count);

    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const scl = new THREE.Vector3(1, 1, 1);

    // Walk along the full road length placing lanterns every ~total/count.
    // We iterate segments without mutating them — advance a cursor along
    // each segment instead.
    const spacing = totalLen / Math.max(1, count);
    let onSide = 1;
    let placed = 0;
    let distRemaining = spacing * 0.5;
    for (let segIdx = 0; segIdx < ROAD_SEGMENTS_DATA.length && placed < count; segIdx++) {
      const seg = ROAD_SEGMENTS_DATA[segIdx];
      const dx = seg.end.x - seg.start.x;
      const dz = seg.end.z - seg.start.z;
      const segLen = Math.hypot(dx, dz);
      if (segLen < 0.01) continue;
      const perpX = -dz / segLen;
      const perpZ = dx / segLen;
      let cursor = 0;
      while (cursor + distRemaining < segLen && placed < count) {
        cursor += distRemaining;
        const t = cursor / segLen;
        const x = seg.start.x + dx * t;
        const z = seg.start.z + dz * t;
        const px = x + perpX * onSide * (ROAD_HALF_WIDTH + 0.8);
        const pz = z + perpZ * onSide * (ROAD_HALF_WIDTH + 0.8);
        pos.set(px, 0, pz);
        q.setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          Math.atan2(-perpX * onSide, -perpZ * onSide),
        );
        m.compose(pos, q, scl);
        poleInst.setMatrixAt(placed, m);
        coreInst.setMatrixAt(placed, m);

        if (placed % 3 === 0) {
          const light = new THREE.PointLight(0xffac5a, 1.4, 24, 1.7);
          light.position.set(px + perpX * onSide * 0.4, 3.25, pz + perpZ * onSide * 0.4);
          light.castShadow = false;
          group.add(light);
          SceneManager.registerPointLight(light);
          this.lanternLights.push(light);
        }

        placed++;
        onSide *= -1;
        distRemaining = spacing;
      }
      distRemaining -= segLen - cursor;
      if (distRemaining < 0) distRemaining = spacing;
    }
    poleInst.count = placed;
    coreInst.count = placed;
    poleInst.instanceMatrix.needsUpdate = true;
    coreInst.instanceMatrix.needsUpdate = true;
    poleInst.castShadow = false;
    coreInst.castShadow = false;
    poleInst.receiveShadow = true;
    poleInst.frustumCulled = false;
    coreInst.frustumCulled = false;
    group.add(poleInst);
    group.add(coreInst);
    this.lanternPoles = poleInst;
    this.lanternCores = coreInst;
  },

  update(time) {
    // These only affect world-scene visuals; skip while the group is hidden.
    if (!this.group?.visible) return;
    if (this.lanternCores) {
      const m = this.lanternCores.material;
      m.emissiveIntensity = 2.0 + Math.sin(time * 3.2) * 0.25;
    }
    // Stars opacity is owned by DayNight (Fix 3 — phase target lerp). We add
    // a small breathing modulation on top, but only when stars are at least
    // partly visible so we never override the day/sunrise zero target.
    if (this.stars?.visible && this.stars.material) {
      const base = this.stars.material.opacity;
      if (base > 0.02) {
        const flicker = 1 + Math.sin(time * 0.7) * 0.05;
        this.stars.material.opacity = Math.max(0, Math.min(1, base * flicker));
      }
    }
  },

  // Frustum culling: hide the moon and stars when off-world. Environment
  // group is left visible; InstancedMesh geometries are already frustum-
  // culled per-instance by three.js.
  updateCulling(camera) {
    if (!camera) return;
    // Placeholder hook — InstancedMesh automatically skips offscreen draws.
    // We could add large-scale section groups and toggle visibility here.
  },

  hide() {
    if (this.group) this.group.visible = false;
    if (this.moonGroup) this.moonGroup.visible = false;
    if (this.stars) this.stars.visible = false;
  },

  show() {
    if (this.group) this.group.visible = true;
    if (this.moonGroup) this.moonGroup.visible = true;
    if (this.stars) this.stars.visible = true;
  },
};
