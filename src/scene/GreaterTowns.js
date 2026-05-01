import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { getSoftCircleTexture } from './spriteTextures.js';
import { ChunkManager } from '../game/ChunkManager.js';
import { Collision } from '../game/Collision.js';
import { SceneManager } from './SceneManager.js';
import { MODEL_URLS } from './modelUrls.js';
import { voxelizeMeshCollision } from './glbCollision.js';
import { makeVillagerMesh } from './Westwind.js';

function stdMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.9,
    metalness: opts.metalness ?? 0,
    flatShading: opts.flatShading ?? true,
    ...opts,
  });
}

function emissiveMat(color, emissive, intensity, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: intensity,
    roughness: opts.roughness ?? 0.4,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    flatShading: opts.flatShading ?? false,
  });
}

function glowSprite(color, scale, opacity = 0.6) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getSoftCircleTexture(),
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  s.scale.set(scale, scale, 1);
  return s;
}

export function buildVeilMarketTown(scene, reg) {
  reg.orbs.length = 0;
  reg.flames.length = 0;
  reg.braziers.length = 0;
  reg.chimes = null;
  reg.group?.removeFromParent?.();

  const group = new THREE.Group();
  group.position.set(0, 0, -2500);
  group.rotation.y = 0;

  const core = new THREE.Group();
  core.position.set(34, 0, 0);
  group.add(core);

  const stoneMat = stdMat(0x3b342c, { roughness: 1 });
  const woodMid = stdMat(0x3a2416, { roughness: 0.85 });
  const woodDark = stdMat(0x1a1208, { roughness: 0.9 });
  const postMat = stdMat(0x181008, { roughness: 0.9 });

  // --- Stone plaza base ----
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(11, 11, 0.35, 24),
    stoneMat,
  );
  plaza.position.y = 0.175;
  plaza.receiveShadow = true;
  core.add(plaza);

  // Inner ring of darker stone
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(7.5, 7.5, 0.36, 24),
    stdMat(0x2a241c, { roughness: 1 }),
  );
  inner.position.y = 0.18;
  core.add(inner);

  // Tile rings for decorative effect
  const tileRing = new THREE.Mesh(
    new THREE.TorusGeometry(4.2, 0.08, 5, 48),
    stdMat(0x6a5432, { roughness: 0.7 }),
  );
  tileRing.rotation.x = Math.PI / 2;
  tileRing.position.y = 0.37;
  core.add(tileRing);

  // --- Stalls around the ring (6 of them, different canopy colors) ---
  const stallColors = [0x5a1a2a, 0x3a2a5a, 0x5a4a1a, 0x1a4a3a, 0x4a1a4a, 0x5a2e14];
  const stallPositions = [];
  const postTops = [];
  const numStalls = 6;
  for (let i = 0; i < numStalls; i++) {
    const a = (i / numStalls) * Math.PI * 2;
    const r = 8;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    stallPositions.push([cx, cz, a]);

    const stall = new THREE.Group();
    stall.position.set(cx, 0, cz);
    stall.rotation.y = -a + Math.PI;

    // Four posts
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6),
        postMat,
      );
      post.position.set(dx, 1.2, dz);
      post.castShadow = true;
      stall.add(post);
    }
    postTops.push(new THREE.Vector3(cx - 1, 2.4, cz - 1));
    postTops.push(new THREE.Vector3(cx + 1, 2.4, cz - 1));

    // Counter
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 0.6), woodMid);
    counter.position.set(0, 0.75, -0.9);
    counter.castShadow = true;
    stall.add(counter);

    // Canopy — angled for depth
    const canopyMat = stdMat(stallColors[i % stallColors.length], {
      roughness: 0.85,
      side: THREE.DoubleSide,
    });
    const canopy = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), canopyMat);
    canopy.position.set(0, 2.45, 0);
    canopy.rotation.x = -Math.PI / 2 + 0.3;
    stall.add(canopy);

    // Back panel
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), canopyMat);
    back.position.set(0, 1.5, 1);
    back.rotation.y = Math.PI;
    stall.add(back);

    // Wares on counter — varied silhouettes
    const wareCount = 2 + Math.floor(Math.random() * 3);
    for (let w = 0; w < wareCount; w++) {
      let ware;
      const type = Math.random();
      if (type < 0.33) {
        ware = new THREE.Mesh(
          new THREE.BoxGeometry(0.25, 0.25, 0.25),
          woodDark,
        );
      } else if (type < 0.66) {
        ware = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.12, 0.35, 7),
          stdMat(0x6a4020 + Math.floor(Math.random() * 0x101010), { roughness: 0.6 }),
        );
      } else {
        ware = new THREE.Mesh(
          new THREE.SphereGeometry(0.13, 6, 5),
          stdMat(0x3a2a5a, { metalness: 0.3, roughness: 0.4 }),
        );
      }
      ware.position.set(-0.7 + w * 0.5, 1.3, -0.8);
      ware.castShadow = true;
      stall.add(ware);
    }

    // Small emissive candle on each stall
    const candleBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.12, 6),
      stdMat(0xe8dcc8),
    );
    candleBase.position.set(0.8, 1.28, -0.8);
    stall.add(candleBase);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.045, 0.12, 6),
      emissiveMat(0xfff0b0, 0xffaa40, 3.5, { roughness: 0.3 }),
    );
    flame.position.set(0.8, 1.42, -0.8);
    stall.add(flame);
    const flameGlow = glowSprite(0xffaa40, 0.7, 0.6);
    flameGlow.position.set(0.8, 1.42, -0.8);
    stall.add(flameGlow);
    reg.flames.push({ mesh: flame, glow: flameGlow, phase: Math.random() * Math.PI * 2 });

    const stallLight = new THREE.PointLight(0xffb060, 1.1, 7, 1.5);
    stallLight.position.set(0, 2.1, 0);
    stall.add(stallLight);

    core.add(stall);
  }

  // --- Hanging lantern strings between stall tops ----
  for (let i = 0; i < numStalls; i++) {
    const a = postTops[i * 2];
    const b = postTops[((i + 1) % numStalls) * 2];
    // catenary curve approximation: 20 segments with sag
    const segs = 18;
    const curve = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const y = a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * 0.6;
      curve.push(new THREE.Vector3(x, y, z));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(curve);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0x8a6430, transparent: true, opacity: 0.75 }),
    );
    core.add(line);

    // Beads along the curve
    const beadTints = [0xff9a50, 0xaa88ff, 0xffc070, 0x88c0ff];
    for (let k = 1; k < segs; k += 2) {
      const pt = curve[k];
      const tint = beadTints[(k + i) % beadTints.length];
      const bead = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 6, 6),
        emissiveMat(tint, tint, 1.8, { roughness: 0.3 }),
      );
      bead.position.copy(pt);
      core.add(bead);
    }
  }

  // --- Central brazier (tall, flaming, cool+warm mixed) ----
  const brazierGroup = new THREE.Group();
  brazierGroup.position.set(0, 0, 0);
  core.add(brazierGroup);

  const brazierStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.2, 2.4, 8),
    stdMat(0x1a1208, { metalness: 0.5, roughness: 0.5 }),
  );
  brazierStem.position.y = 1.2;
  brazierGroup.add(brazierStem);

  const brazierBowl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.45, 0.5, 12, 1, true),
    stdMat(0x2a1810, { metalness: 0.4, roughness: 0.5, side: THREE.DoubleSide }),
  );
  brazierBowl.position.y = 2.55;
  brazierGroup.add(brazierBowl);

  // Blue-purple flame
  const flameCore = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 1.2, 8),
    emissiveMat(0xd0a0ff, 0xaa66ff, 3.2, { roughness: 0.3 }),
  );
  flameCore.position.y = 3.2;
  brazierGroup.add(flameCore);

  const flameInner = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 0.9, 8),
    emissiveMat(0xfff0dd, 0xffb470, 3.5, { roughness: 0.3 }),
  );
  flameInner.position.y = 3.0;
  brazierGroup.add(flameInner);

  const brazGlow = glowSprite(0xbb88ff, 3.5, 0.5);
  brazGlow.position.y = 3.1;
  brazierGroup.add(brazGlow);

  const brazierLight = new THREE.PointLight(0xbb88ff, 2.8, 18, 1.5);
  brazierLight.position.y = 3.0;
  brazierGroup.add(brazierLight);

  reg.braziers.push({
    core: flameCore,
    inner: flameInner,
    glow: brazGlow,
    light: brazierLight,
    phase: Math.random() * Math.PI * 2,
  });

  // --- Floating spirit orbs around the plaza ----
  const orbTints = [0xcc99ff, 0xa8c8ff, 0xffa0d4, 0xc0a0ff];
  for (let i = 0; i < 7; i++) {
    const tint = orbTints[i % orbTints.length];
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 10),
      emissiveMat(tint, tint, 2.5, { roughness: 0.3 }),
    );
    const a = (i / 7) * Math.PI * 2;
    orb.position.set(Math.cos(a) * 5.5, 3.2 + Math.random() * 1.2, Math.sin(a) * 5.5);
    orb.userData.bobPhase = Math.random() * Math.PI * 2;
    orb.userData.baseY = orb.position.y;
    orb.userData.driftPhase = Math.random() * Math.PI * 2;
    orb.userData.angle = a;

    const orbGlow = glowSprite(tint, 0.9, 0.4);
    orb.add(orbGlow);

    const orbLight = new THREE.PointLight(tint, 0.45, 5, 2);
    orb.add(orbLight);
    core.add(orb);
    reg.orbs.push(orb);
  }

  // --- Wind chimes hanging from a central pole ----
  const chimePole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 4, 6),
    postMat,
  );
  chimePole.position.set(0, 2.0, -6);
  core.add(chimePole);
  const chimeCross = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), postMat);
  chimeCross.position.set(0, 3.9, -6);
  core.add(chimeCross);
  const chimeGroup = new THREE.Group();
  chimeGroup.position.set(0, 3.9, -6);
  for (let i = 0; i < 5; i++) {
    const chime = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.5 + i * 0.1, 6),
      stdMat(0xb0a088, { metalness: 0.5, roughness: 0.3 }),
    );
    chime.position.set(-0.5 + i * 0.25, -0.3 - i * 0.05, 0);
    chimeGroup.add(chime);
  }
  core.add(chimeGroup);
  reg.chimes = chimeGroup;

  // --- Auctioneer (visible counterpart to trade panel NPC) ----
  const auctioneer = makeVillagerMesh({
    robeColor: 0x4a3058,
    skinColor: 0xc8b090,
  });
  auctioneer.name = 'veilAuctioneer';
  auctioneer.position.set(0, 0, -3.15);
  auctioneer.rotation.y = 0;
  auctioneer.scale.setScalar(1.12);
  auctioneer.traverse((ch) => {
    if (ch.isMesh) {
      ch.castShadow = true;
      ch.receiveShadow = true;
    }
  });
  core.add(auctioneer);
  const auctioneerGlow = new THREE.PointLight(0xc8a8e8, 0.55, 6, 1.8);
  auctioneerGlow.position.set(0, 2.2, -2.8);
  core.add(auctioneerGlow);

  // --- East annex (extra stalls; road stays near x = 0) ----
  const annex = new THREE.Group();
  annex.position.set(58, 0, 18);
  group.add(annex);
  const anMat = stdMat(0x2a1c30, { roughness: 0.88 });
  for (let j = 0; j < 7; j++) {
    const ang = -Math.PI * 0.38 + (j / 6) * Math.PI * 0.76;
    const rr = 9.5 + (j % 2) * 2.8;
    const sx = Math.cos(ang) * rr;
    const sz = Math.sin(ang) * rr;
    const booth = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.2, 2.4), anMat);
    booth.position.set(sx, 1.1, sz);
    booth.castShadow = true;
    annex.add(booth);
    Collision.registerBox(58 + sx, -2500 + 18 + sz, 1.55, 1.55);
  }
  const anPlaza = new THREE.Mesh(
    new THREE.CylinderGeometry(7.5, 7.5, 0.26, 20),
    stdMat(0x2e2830, { roughness: 1 }),
  );
  anPlaza.position.set(2, 0.13, 2);
  anPlaza.receiveShadow = true;
  annex.add(anPlaza);

  for (const sp of stallPositions) {
    const [cx, cz] = sp;
    Collision.registerBox(34 + cx, -2500 + cz, 1.85, 1.85);
  }

  scene.add(group);
  reg.group = group;
  // Group origin is not the visual center; large radius avoids frustum pop-out.
  ChunkManager.register(group, group.position.x, group.position.z, { radius: 120 });
}

// =============================================================

function loadTownGLB(path, group, opts = {}) {
  const { dx = 0, dy = 0, dz = 0, rotateY = 0, walkable = false, collision = {} } = opts;
  new GLTFLoader().load(
    path,
    (gltf) => {
      const model = gltf.scene;
      model.scale.setScalar(20);
      model.rotation.y = rotateY;
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      if (isFinite(box.min.y)) {
        model.position.y = -box.min.y;
      }
      model.position.x += dx;
      model.position.y += dy;
      model.position.z += dz;
      group.add(model);
      if (walkable) {
        group.updateMatrixWorld(true);
        const stats = voxelizeMeshCollision(model, collision);
        console.log(`[GLB] ${path} collision:`, stats);
      }
      console.log(`[GLB] Loaded ${path} — bounds y ${box.min.y.toFixed(1)} → ${box.max.y.toFixed(1)}, pos (${model.position.x.toFixed(1)}, ${model.position.y.toFixed(1)}, ${model.position.z.toFixed(1)}), group:`, group.position);
    },
    undefined,
    (err) => console.error(`[GLB] Failed to load ${path}:`, err),
  );
}

export function buildStonehushTown(scene, reg) {
  reg.threads = [];
  reg.candles = [];
  reg.pool = null;
  reg.group?.removeFromParent?.();

  const group = new THREE.Group();
  group.position.set(-800, 0, -5000);
  loadTownGLB(MODEL_URLS.Stonehush, group, { dy: -1, dx: -30, rotateY: Math.PI / 6, walkable: true });
  scene.add(group);
  reg.group = group;
  ChunkManager.register(group, group.position.x, group.position.z, { radius: 600 });
}

export function buildDeeprootTown(scene, reg) {
  reg.lanterns = [];
  reg.rootArcs = [];
  reg.group?.removeFromParent?.();

  const group = new THREE.Group();
  group.position.set(600, 0, -6000);
  loadTownGLB(MODEL_URLS.Deeproot, group, { dy: -1, dx: 80, rotateY: -Math.PI / 2, walkable: true });
  scene.add(group);
  reg.group = group;
  ChunkManager.register(group, group.position.x, group.position.z, { radius: 600 });
}

export function buildMirrorTown(scene, reg) {
  reg.panels = [];
  reg.spire = null;
  reg.shardRing = null;
  reg.group?.removeFromParent?.();

  const group = new THREE.Group();
  group.position.set(200, 0, -7800);
  loadTownGLB(MODEL_URLS.Mirror_town, group, { rotateY: Math.PI / 2, walkable: true });
  scene.add(group);
  reg.group = group;
  ChunkManager.register(group, group.position.x, group.position.z, { radius: 600 });
}

export function buildUnnamedTown(scene, reg) {
  reg.group?.removeFromParent?.();

  const group = new THREE.Group();
  group.position.set(0, 0, -14500);
  loadTownGLB(MODEL_URLS.The_unamed, group, {
    dy: -1,
    rotateY: -Math.PI / 12,
    walkable: true,
    collision: {
      cellSize: 0.5,
      maxNormalY: 0.5,
      stepHeight: 1.0,
      playerCeiling: 2.0,
    },
  });
  scene.add(group);
  reg.group = group;
  ChunkManager.register(group, group.position.x, group.position.z, { radius: 600 });
}

export function updateDeeprootTown() {}

export function updateMirrorTown() {}
