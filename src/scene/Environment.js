import * as THREE from 'three';

// Road segments mirror the fork in Road.js. Keep in sync.
const ROAD_SEGMENTS = [
  { start: new THREE.Vector3(0, 0, 0), end: new THREE.Vector3(0, 0, -200) },
  { start: new THREE.Vector3(0, 0, -200), end: new THREE.Vector3(-120, 0, -350) },
  { start: new THREE.Vector3(0, 0, -200), end: new THREE.Vector3(120, 0, -350) },
];

const ROAD_HALF_WIDTH = 3.2;
const STONEHUSH_POS = new THREE.Vector3(80, 0, -370);
const STONEHUSH_NO_TREE_RADIUS = 28;

// -- Material helpers ------------------------------------------------------

function stdMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.9,
    metalness: opts.metalness ?? 0,
    flatShading: opts.flatShading ?? true,
    ...opts,
  });
}

// -- Texture generators ----------------------------------------------------

function makeGroundTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Deep earth base with moss tint
  ctx.fillStyle = '#0a1208';
  ctx.fillRect(0, 0, size, size);

  // Large mossy patches
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 30 + Math.random() * 90;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(22, 38, 18, ${0.35 + Math.random() * 0.25})`);
    grad.addColorStop(1, 'rgba(22, 38, 18, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Darker earth splotches
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 20 + Math.random() * 60;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(6, 10, 5, ${0.3 + Math.random() * 0.25})`);
    grad.addColorStop(1, 'rgba(6, 10, 5, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dry leaf / twig specks
  for (let i = 0; i < 1200; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const warm = Math.random() < 0.5;
    ctx.fillStyle = warm
      ? `rgba(${60 + Math.random() * 40}, ${40 + Math.random() * 20}, 20, 0.6)`
      : `rgba(${15 + Math.random() * 15}, ${30 + Math.random() * 20}, ${10 + Math.random() * 10}, 0.65)`;
    ctx.fillRect(x, y, 1.3, 1.3);
  }

  // Grain
  const imgData = ctx.getImageData(0, 0, size, size);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function makeFireflyTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255, 220, 140, 1)');
  g.addColorStop(0.25, 'rgba(255, 180, 80, 0.8)');
  g.addColorStop(0.6, 'rgba(180, 90, 30, 0.25)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
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
  // Craters
  for (let i = 0; i < 14; i++) {
    const r = 6 + Math.random() * 14;
    const cx = size / 2 + (Math.random() - 0.5) * size * 0.55;
    const cy = size / 2 + (Math.random() - 0.5) * size * 0.55;
    const distFromCenter = Math.hypot(cx - size / 2, cy - size / 2);
    if (distFromCenter > size / 2 - r) continue;
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    cg.addColorStop(0, 'rgba(180, 180, 170, 0.35)');
    cg.addColorStop(1, 'rgba(180, 180, 170, 0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(canvas);
}

// -- Geometry helpers ------------------------------------------------------

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
  for (const seg of ROAD_SEGMENTS) {
    const d = distanceToSegment(x, z, seg.start, seg.end);
    if (d < best) best = d;
  }
  return best;
}

// -- Procedural tree (multi-segment trunk + branches + cluster canopy) -----

function makeTree() {
  const tree = new THREE.Group();

  const trunkMat = stdMat(0x2a1a0f, { roughness: 0.95 });
  const branchMat = trunkMat;

  // Trunk — stacked tapered segments with slight rotation for an irregular bend.
  const trunkHeight = 1.8 + Math.random() * 1.2;
  const segments = 3;
  let lastY = 0;
  let xOff = 0;
  let zOff = 0;
  for (let i = 0; i < segments; i++) {
    const segH = trunkHeight / segments;
    const r1 = 0.22 - i * 0.04;
    const r2 = 0.18 - i * 0.04;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(r2, r1, segH, 7),
      trunkMat,
    );
    const tilt = (Math.random() - 0.5) * 0.08;
    const twist = (Math.random() - 0.5) * 0.4;
    trunk.rotation.z = tilt;
    trunk.rotation.y = twist;
    trunk.position.set(xOff, lastY + segH / 2, zOff);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    tree.add(trunk);
    lastY += segH;
    xOff += Math.sin(tilt) * segH * 0.4;
  }

  // A few bare branches poking out of the upper trunk
  const branchCount = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < branchCount; i++) {
    const branch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.07, 0.8 + Math.random() * 0.6, 5),
      branchMat,
    );
    const yPos = 1.2 + Math.random() * (trunkHeight - 1.3);
    const ang = Math.random() * Math.PI * 2;
    branch.position.set(
      xOff + Math.cos(ang) * 0.15,
      yPos,
      zOff + Math.sin(ang) * 0.15,
    );
    branch.rotation.z = Math.cos(ang) * (0.9 + Math.random() * 0.4);
    branch.rotation.x = Math.sin(ang) * (0.9 + Math.random() * 0.4);
    branch.castShadow = true;
    tree.add(branch);
  }

  // Canopy — cluster of 4–6 slightly varied spheres
  const canopyMat = stdMat(
    new THREE.Color().setHSL(0.27 + Math.random() * 0.05, 0.35, 0.11 + Math.random() * 0.05).getHex(),
    { roughness: 0.95 },
  );
  const canopyCount = 4 + Math.floor(Math.random() * 3);
  const baseY = lastY + 0.2;
  for (let i = 0; i < canopyCount; i++) {
    const r = 0.65 + Math.random() * 0.45;
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(r, 8, 6),
      canopyMat,
    );
    canopy.position.set(
      xOff + (Math.random() - 0.5) * 0.9,
      baseY + (Math.random() - 0.3) * 0.8,
      zOff + (Math.random() - 0.5) * 0.9,
    );
    canopy.scale.y = 0.85 + Math.random() * 0.3;
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    tree.add(canopy);
  }

  tree.userData.swayOffset = Math.random() * Math.PI * 2;
  tree.userData.swayAmp = 0.012 + Math.random() * 0.018;
  return tree;
}

// -- Grass tuft (small flared cone cluster) --------------------------------

const GRASS_MAT = stdMat(0x1a3312, { roughness: 0.95 });

function makeGrassTuft() {
  const g = new THREE.Group();
  const blades = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < blades; i++) {
    const blade = new THREE.Mesh(
      new THREE.ConeGeometry(0.04, 0.22 + Math.random() * 0.1, 4),
      GRASS_MAT,
    );
    blade.position.set(
      (Math.random() - 0.5) * 0.18,
      0.11,
      (Math.random() - 0.5) * 0.18,
    );
    blade.rotation.z = (Math.random() - 0.5) * 0.3;
    blade.rotation.x = (Math.random() - 0.5) * 0.2;
    g.add(blade);
  }
  return g;
}

// -- Rock (for scattering) -------------------------------------------------

const ROCK_MAT = stdMat(0x262222, { roughness: 0.9 });

function makeRock() {
  const s = 0.25 + Math.random() * 0.45;
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), ROCK_MAT);
  rock.scale.set(1 + Math.random() * 0.3, 0.55 + Math.random() * 0.25, 1 + Math.random() * 0.3);
  rock.rotation.y = Math.random() * Math.PI;
  rock.rotation.x = (Math.random() - 0.5) * 0.2;
  rock.position.y = s * 0.25;
  rock.castShadow = true;
  rock.receiveShadow = true;
  return rock;
}

// -- Hill (displaced sphere for silhouette variation) ----------------------

function makeHill(baseColor) {
  const geo = new THREE.SphereGeometry(28, 20, 14);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n =
      Math.sin(x * 0.12 + y * 0.1) * 1.8 +
      Math.sin(z * 0.08 - y * 0.15) * 1.4 +
      Math.sin(x * 0.35 + z * 0.4) * 0.6;
    const r = Math.sqrt(x * x + y * y + z * z) || 1;
    pos.setX(i, x + (x / r) * n);
    pos.setY(i, y + (y / r) * n);
    pos.setZ(i, z + (z / r) * n);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, stdMat(baseColor, { roughness: 1 }));
}

// -------------------------------------------------------------------------

export const Environment = {
  group: null,
  trees: [],
  lanterns: [],
  grasses: [],
  fireflies: null,
  fireflyBase: null,
  fireflyPhases: null,
  moonGroup: null,
  stars: null,
  mists: [],

  init(scene) {
    const group = new THREE.Group();
    this.group = group;
    this.trees = [];
    this.lanterns = [];
    this.grasses = [];
    this.mists = [];

    this._buildGround(group);
    this._buildDistantBackdrop(group);
    this._buildSkyProps(scene);
    this._buildTrees(group);
    this._buildGrassAndRocks(group);
    this._buildLanterns(group);
    this._buildFireflies(group);
    this._buildMist(group);

    scene.add(group);
  },

  _buildGround(group) {
    const tex = makeGroundTexture();
    tex.repeat.set(16, 40);
    const groundMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.98,
      metalness: 0,
    });
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(440, 1100, 1, 1),
      groundMat,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, -320);
    ground.receiveShadow = true;
    group.add(ground);
  },

  _buildDistantBackdrop(group) {
    // A wave of hills along the horizon, layered for parallax feel.
    const near = [
      [-120, -30, 0x0f1c10],
      [-90, -90, 0x0e1a0f],
      [-60, -160, 0x0c180d],
      [0, -220, 0x0b160c],
      [60, -170, 0x0d190e],
      [100, -90, 0x0e1a0f],
      [130, -20, 0x0f1c10],
      [-150, -260, 0x0a140b],
      [0, -420, 0x08120a],
      [-180, -360, 0x0a140b],
      [180, -360, 0x0a140b],
    ];
    near.forEach(([x, z, color]) => {
      const hill = makeHill(color);
      const scale = 0.9 + Math.random() * 0.7;
      hill.scale.set(scale, scale * (0.4 + Math.random() * 0.2), scale);
      hill.position.set(x + (Math.random() - 0.5) * 12, -8, z + (Math.random() - 0.5) * 12);
      group.add(hill);
    });
  },

  _buildSkyProps(scene) {
    // Moon — large bright disc high in the sky, off to the side to match the
    // directional light direction, plus a soft halo behind it.
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
    moon.scale.set(26, 26, 1);
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
    halo.scale.set(60, 60, 1);
    halo.renderOrder = -2;
    moonGroup.add(halo);

    moonGroup.position.set(-140, 90, -260);
    scene.add(moonGroup);

    // Stars — large sphere of points around the scene.
    const starCount = 700;
    const starPos = new Float32Array(starCount * 3);
    const starCol = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.8 + 0.05);
      const r = 300 + Math.random() * 40;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.6 + 20;
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta) - 200;
      const warm = Math.random() < 0.15;
      const tint = Math.random() * 0.4 + 0.6;
      if (warm) {
        starCol[i * 3] = tint;
        starCol[i * 3 + 1] = tint * 0.85;
        starCol[i * 3 + 2] = tint * 0.6;
      } else {
        starCol[i * 3] = tint * 0.85;
        starCol[i * 3 + 1] = tint * 0.9;
        starCol[i * 3 + 2] = tint;
      }
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
    const starMat = new THREE.PointsMaterial({
      size: 1.3,
      vertexColors: true,
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

  _buildTrees(group) {
    // Trees cluster along the road but stay clear of the road itself and of
    // Stonehush (ritual clearing). They scatter on both sides.
    const tried = new Set();
    for (const seg of ROAD_SEGMENTS) {
      const dx = seg.end.x - seg.start.x;
      const dz = seg.end.z - seg.start.z;
      const length = Math.hypot(dx, dz);
      const dirX = dx / length;
      const dirZ = dz / length;
      const perpX = -dirZ;
      const perpZ = dirX;
      const step = 3.5;
      for (let t = 0; t < length; t += step) {
        for (const side of [-1, 1]) {
          if (Math.random() < 0.35) continue;
          const offset = ROAD_HALF_WIDTH + 1.5 + Math.random() * 10;
          const jitterForward = (Math.random() - 0.5) * step;
          const x =
            seg.start.x + dirX * (t + jitterForward) + perpX * side * offset;
          const z =
            seg.start.z + dirZ * (t + jitterForward) + perpZ * side * offset;

          // Stonehush clearing
          if (Math.hypot(x - STONEHUSH_POS.x, z - STONEHUSH_POS.z) < STONEHUSH_NO_TREE_RADIUS)
            continue;
          // Keep clear of other roads too
          if (distToRoad(x, z) < ROAD_HALF_WIDTH + 1.2) continue;

          const key = `${Math.round(x)},${Math.round(z)}`;
          if (tried.has(key)) continue;
          tried.add(key);

          const tree = makeTree();
          tree.position.set(x, 0, z);
          tree.rotation.y = Math.random() * Math.PI * 2;
          const s = 0.85 + Math.random() * 0.5;
          tree.scale.setScalar(s);
          group.add(tree);
          this.trees.push(tree);
        }
      }
    }
  },

  _buildGrassAndRocks(group) {
    // Tufts along road edges, thinned out to avoid clutter.
    for (const seg of ROAD_SEGMENTS) {
      const dx = seg.end.x - seg.start.x;
      const dz = seg.end.z - seg.start.z;
      const length = Math.hypot(dx, dz);
      const dirX = dx / length;
      const dirZ = dz / length;
      const perpX = -dirZ;
      const perpZ = dirX;
      const step = 1.6;
      for (let t = 0; t < length; t += step) {
        for (const side of [-1, 1]) {
          if (Math.random() < 0.65) continue;
          const off = ROAD_HALF_WIDTH + Math.random() * 2.3;
          const x = seg.start.x + dirX * t + perpX * side * off;
          const z = seg.start.z + dirZ * t + perpZ * side * off;
          if (distToRoad(x, z) < ROAD_HALF_WIDTH - 0.1) continue;

          const g = makeGrassTuft();
          g.position.set(x, 0, z);
          g.rotation.y = Math.random() * Math.PI * 2;
          const s = 0.6 + Math.random() * 0.6;
          g.scale.setScalar(s);
          group.add(g);
          this.grasses.push(g);

          // Occasional rock
          if (Math.random() < 0.08) {
            const rock = makeRock();
            rock.position.set(
              x + (Math.random() - 0.5) * 0.8,
              0,
              z + (Math.random() - 0.5) * 0.8,
            );
            group.add(rock);
          }
        }
      }
    }
  },

  _buildLanterns(group) {
    // Lantern poles planted along each road segment on alternating sides.
    for (const seg of ROAD_SEGMENTS) {
      const dx = seg.end.x - seg.start.x;
      const dz = seg.end.z - seg.start.z;
      const length = Math.hypot(dx, dz);
      const dirX = dx / length;
      const dirZ = dz / length;
      const perpX = -dirZ;
      const perpZ = dirX;
      const step = 22;
      let side = 1;
      for (let t = step * 0.6; t < length - step * 0.2; t += step) {
        const jitter = (Math.random() - 0.5) * 2;
        const x = seg.start.x + dirX * (t + jitter) + perpX * side * (ROAD_HALF_WIDTH + 0.7);
        const z = seg.start.z + dirZ * (t + jitter) + perpZ * side * (ROAD_HALF_WIDTH + 0.7);
        const pole = this._makeLanternPole();
        pole.position.set(x, 0, z);
        // Aim the lantern inward toward the road
        pole.rotation.y = Math.atan2(-perpX * side, -perpZ * side);
        group.add(pole);
        this.lanterns.push(pole);
        side *= -1;
      }
    }
  },

  _makeLanternPole() {
    const pole = new THREE.Group();

    const poleMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.075, 3.6, 7),
      stdMat(0x0c0904, { roughness: 0.8 }),
    );
    poleMesh.position.y = 1.8;
    poleMesh.castShadow = true;
    pole.add(poleMesh);

    // Arm hanging the lantern
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.05, 0.05),
      stdMat(0x0c0904, { roughness: 0.8 }),
    );
    arm.position.set(0.3, 3.45, 0);
    pole.add(arm);

    // Lantern cage
    const cageMat = stdMat(0x181008, { metalness: 0.5, roughness: 0.5 });
    const cageTop = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 8), cageMat);
    cageTop.position.set(0.6, 3.4, 0);
    pole.add(cageTop);
    const cageBot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.04, 8), cageMat);
    cageBot.position.set(0.6, 3.1, 0);
    pole.add(cageBot);

    // Glass panels — warm glow
    for (let i = 0; i < 4; i++) {
      const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.14, 0.26),
        new THREE.MeshStandardMaterial({
          color: 0x5a3012,
          emissive: 0xff9030,
          emissiveIntensity: 0.8,
          transparent: true,
          opacity: 0.45,
          roughness: 0.35,
          side: THREE.DoubleSide,
        }),
      );
      const a = (i / 4) * Math.PI * 2;
      pane.position.set(0.6 + Math.cos(a) * 0.09, 3.25, Math.sin(a) * 0.09);
      pane.rotation.y = a + Math.PI / 2;
      pole.add(pane);
    }

    // Inner glowing core
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshStandardMaterial({
        color: 0xffc06a,
        emissive: 0xff9030,
        emissiveIntensity: 2.6,
        roughness: 0.4,
      }),
    );
    core.position.set(0.6, 3.25, 0);
    pole.add(core);

    // Soft glow sprite
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        color: 0xffaa55,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glow.position.set(0.6, 3.25, 0);
    glow.scale.set(1.1, 1.1, 1);
    pole.add(glow);

    // Cone cap
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 0.2, 8),
      stdMat(0x0c0904, { metalness: 0.5, roughness: 0.4 }),
    );
    cap.position.set(0.6, 3.55, 0);
    pole.add(cap);

    // Volumetric light cone — subtle additive god-ray down to the ground
    const volMat = new THREE.MeshBasicMaterial({
      color: 0xffaa55,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    const vol = new THREE.Mesh(
      new THREE.ConeGeometry(1.7, 3.2, 14, 1, true),
      volMat,
    );
    vol.position.set(0.6, 1.65, 0);
    pole.add(vol);

    // Point light
    const light = new THREE.PointLight(0xffac5a, 1.5, 22, 1.7);
    light.position.set(0.6, 3.25, 0);
    pole.add(light);

    pole.userData.light = light;
    pole.userData.core = core;
    pole.userData.glow = glow;
    pole.userData.flickerOffset = Math.random() * Math.PI * 2;
    pole.userData.baseIntensity = 1.5;
    return pole;
  },

  _buildFireflies(group) {
    const count = 90;
    const positions = new Float32Array(count * 3);
    const base = new Float32Array(count * 3);
    const phases = new Float32Array(count * 4);

    // Scatter along road segments, slightly offset outward.
    let placed = 0;
    let safety = 0;
    while (placed < count && safety < count * 8) {
      safety++;
      const seg = ROAD_SEGMENTS[Math.floor(Math.random() * ROAD_SEGMENTS.length)];
      const t = Math.random();
      const px = seg.start.x + (seg.end.x - seg.start.x) * t;
      const pz = seg.start.z + (seg.end.z - seg.start.z) * t;
      const side = Math.random() < 0.5 ? -1 : 1;
      const off = ROAD_HALF_WIDTH + 1 + Math.random() * 6;
      const perpX = -(seg.end.z - seg.start.z);
      const perpZ = seg.end.x - seg.start.x;
      const pl = Math.hypot(perpX, perpZ) || 1;
      const x = px + (perpX / pl) * side * off;
      const z = pz + (perpZ / pl) * side * off;
      if (distToRoad(x, z) < ROAD_HALF_WIDTH + 0.5) continue;
      const y = 0.4 + Math.random() * 2.2;

      base[placed * 3] = x;
      base[placed * 3 + 1] = y;
      base[placed * 3 + 2] = z;
      positions[placed * 3] = x;
      positions[placed * 3 + 1] = y;
      positions[placed * 3 + 2] = z;
      phases[placed * 4] = Math.random() * Math.PI * 2;
      phases[placed * 4 + 1] = 0.5 + Math.random() * 1.5;
      phases[placed * 4 + 2] = Math.random() * Math.PI * 2;
      phases[placed * 4 + 3] = 0.5 + Math.random() * 1.2;
      placed++;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      map: makeFireflyTexture(),
      color: 0xffce7a,
      size: 0.35,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      fog: true,
    });
    this.fireflies = new THREE.Points(geo, mat);
    this.fireflyBase = base;
    this.fireflyPhases = phases;
    group.add(this.fireflies);
  },

  _buildMist(group) {
    // Rolling mist puffs near the ground — sprite-based, low opacity.
    const mistTex = makeFireflyTexture();
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: mistTex,
          color: 0xa8b0c8,
          transparent: true,
          opacity: 0.13,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const x = (Math.random() - 0.5) * 200;
      const z = -Math.random() * 480 - 10;
      const y = 0.5 + Math.random() * 1.2;
      m.position.set(x, y, z);
      const s = 14 + Math.random() * 10;
      m.scale.set(s, s * 0.5, 1);
      m.userData.base = { x, y, z };
      m.userData.phase = Math.random() * Math.PI * 2;
      m.userData.speed = 0.03 + Math.random() * 0.05;
      group.add(m);
      this.mists.push(m);
    }
  },

  update(time) {
    // Tree sway
    for (const tree of this.trees) {
      tree.rotation.z = Math.sin(time + tree.userData.swayOffset) * tree.userData.swayAmp;
    }
    // Lantern flicker (poles)
    for (const pole of this.lanterns) {
      const off = pole.userData.flickerOffset;
      const f =
        0.88 +
        Math.sin(time * 3.1 + off) * 0.07 +
        Math.sin(time * 7.7 + off * 2.3) * 0.04 +
        (Math.random() - 0.5) * 0.04;
      pole.userData.light.intensity = pole.userData.baseIntensity * f;
      if (pole.userData.core) {
        pole.userData.core.material.emissiveIntensity = 2.6 * f;
      }
      if (pole.userData.glow) {
        pole.userData.glow.material.opacity = 0.42 + f * 0.15;
      }
    }
    // Fireflies — random drift
    if (this.fireflies) {
      const pos = this.fireflies.geometry.attributes.position.array;
      const base = this.fireflyBase;
      const ph = this.fireflyPhases;
      for (let i = 0; i < pos.length / 3; i++) {
        const phX = ph[i * 4];
        const spX = ph[i * 4 + 1];
        const phY = ph[i * 4 + 2];
        const spY = ph[i * 4 + 3];
        pos[i * 3] = base[i * 3] + Math.sin(time * spX + phX) * 1.4;
        pos[i * 3 + 1] =
          base[i * 3 + 1] + Math.sin(time * spY + phY) * 0.35 + Math.sin(time * 0.3 + phY) * 0.6;
        pos[i * 3 + 2] =
          base[i * 3 + 2] + Math.cos(time * spX * 1.1 + phX) * 1.4;
      }
      this.fireflies.geometry.attributes.position.needsUpdate = true;

      const mat = this.fireflies.material;
      mat.opacity = 0.8 + Math.sin(time * 2.3) * 0.15;
    }
    // Mist drift + breathing
    for (const m of this.mists) {
      const b = m.userData.base;
      m.position.x = b.x + Math.sin(time * m.userData.speed + m.userData.phase) * 8;
      m.position.z = b.z + Math.cos(time * m.userData.speed * 0.7 + m.userData.phase) * 6;
      m.material.opacity = 0.1 + Math.sin(time * 0.3 + m.userData.phase) * 0.03;
    }
    // Stars — faint twinkle via opacity breathing
    if (this.stars) {
      this.stars.material.opacity = 0.85 + Math.sin(time * 0.7) * 0.08;
    }
  },

  hide() {
    if (this.group) this.group.visible = false;
    if (this.moonGroup) this.moonGroup.visible = false;
    if (this.stars) this.stars.visible = false;
  },
};
