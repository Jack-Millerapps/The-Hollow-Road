import * as THREE from 'three';
import { getSoftCircleTexture } from './spriteTextures.js';
import { ChunkManager } from '../game/ChunkManager.js';
import { build as buildAshwickTown, update as updateAshwickTown } from './AshwickTown.js';

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
};

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

// ============================================================
// ASHWICK — full town (see AshwickTown.js).
// ============================================================

function buildAshwick(scene) {
  buildAshwickTown(scene, registry.ashwick);
}

// ============================================================
// VEIL MARKET — mysterious midnight bazaar. Cool + warm accent.
// ============================================================

function buildVeilMarket(scene) {
  const group = new THREE.Group();
  group.position.set(100, 0, -300);
  group.rotation.y = -0.3;

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
  group.add(plaza);

  // Inner ring of darker stone
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(7.5, 7.5, 0.36, 24),
    stdMat(0x2a241c, { roughness: 1 }),
  );
  inner.position.y = 0.18;
  group.add(inner);

  // Tile rings for decorative effect
  const tileRing = new THREE.Mesh(
    new THREE.TorusGeometry(4.2, 0.08, 5, 48),
    stdMat(0x6a5432, { roughness: 0.7 }),
  );
  tileRing.rotation.x = Math.PI / 2;
  tileRing.position.y = 0.37;
  group.add(tileRing);

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
    registry.veilMarket.flames.push({ mesh: flame, glow: flameGlow, phase: Math.random() * Math.PI * 2 });

    const stallLight = new THREE.PointLight(0xffb060, 1.1, 7, 1.5);
    stallLight.position.set(0, 2.1, 0);
    stall.add(stallLight);

    group.add(stall);
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
    group.add(line);

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
      group.add(bead);
    }
  }

  // --- Central brazier (tall, flaming, cool+warm mixed) ----
  const brazierGroup = new THREE.Group();
  brazierGroup.position.set(0, 0, 0);
  group.add(brazierGroup);

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

  registry.veilMarket.braziers.push({
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
    group.add(orb);
    registry.veilMarket.orbs.push(orb);
  }

  // --- Wind chimes hanging from a central pole ----
  const chimePole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 4, 6),
    postMat,
  );
  chimePole.position.set(0, 2.0, -6);
  group.add(chimePole);
  const chimeCross = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), postMat);
  chimeCross.position.set(0, 3.9, -6);
  group.add(chimeCross);
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
  group.add(chimeGroup);
  registry.veilMarket.chimes = chimeGroup;

  scene.add(group);
  registry.veilMarket.group = group;
  ChunkManager.register(group, group.position.x, group.position.z);
}

// ============================================================
// STONEHUSH — weaver's sacred clearing. Cold, quiet, moonlit.
// ============================================================

function buildStonehush(scene) {
  const group = new THREE.Group();
  group.position.set(80, 0, -370);
  group.rotation.y = -0.4;

  const stoneMat = stdMat(0x2c2a28, { roughness: 1 });
  const darkStoneMat = stdMat(0x1e1c1a, { roughness: 1 });
  const mossMat = stdMat(0x1a3012, { roughness: 1 });
  const beamMat = stdMat(0x151008, { roughness: 0.95 });

  // --- Circular mossy clearing floor ----
  const clearing = new THREE.Mesh(
    new THREE.CircleGeometry(13, 32),
    stdMat(0x0a1608, { roughness: 1 }),
  );
  clearing.rotation.x = -Math.PI / 2;
  clearing.position.y = 0.01;
  clearing.receiveShadow = true;
  group.add(clearing);

  // Inner darker ring
  const innerRing = new THREE.Mesh(
    new THREE.CircleGeometry(6, 32),
    stdMat(0x060c06, { roughness: 1 }),
  );
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.y = 0.02;
  group.add(innerRing);

  // --- Monoliths (9, varied heights and lean) ----
  const stoneCircle = 9;
  for (let i = 0; i < stoneCircle; i++) {
    const a = (i / stoneCircle) * Math.PI * 2 + (Math.random() - 0.5) * 0.15;
    const r = 9 + (Math.random() - 0.5) * 1.2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 4 + Math.random() * 3.5;
    const bottomR = 0.5 + Math.random() * 0.25;
    const topR = bottomR * (0.55 + Math.random() * 0.25);

    const stone = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(topR, bottomR, h, 9),
      stoneMat,
    );
    shaft.position.y = h / 2;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    // slight imperfection in shape via scale
    shaft.scale.set(1 + (Math.random() - 0.5) * 0.1, 1, 1 + (Math.random() - 0.5) * 0.1);
    stone.add(shaft);

    // Moss base
    const moss = new THREE.Mesh(
      new THREE.CylinderGeometry(bottomR + 0.08, bottomR + 0.12, 0.4, 10),
      mossMat,
    );
    moss.position.y = 0.2;
    stone.add(moss);

    // Top cap (darker, weathered)
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(topR * 0.9, topR * 1.05, 0.22, 9),
      darkStoneMat,
    );
    cap.position.y = h + 0.1;
    stone.add(cap);

    stone.position.set(x, 0, z);
    stone.rotation.z = (Math.random() - 0.5) * 0.15;
    stone.rotation.x = (Math.random() - 0.5) * 0.1;
    stone.rotation.y = Math.random() * Math.PI;
    group.add(stone);
  }

  // --- A fallen stone ----
  const fallen = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.55, 5, 9),
    stoneMat,
  );
  fallen.rotation.z = Math.PI / 2 + 0.2;
  fallen.rotation.y = 0.3;
  fallen.position.set(-3.5, 0.55, 3);
  fallen.castShadow = true;
  group.add(fallen);

  const fallenMoss = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.58, 1.5, 10),
    mossMat,
  );
  fallenMoss.rotation.z = Math.PI / 2 + 0.2;
  fallenMoss.rotation.y = 0.3;
  fallenMoss.position.set(-4.8, 0.55, 3.2);
  group.add(fallenMoss);

  // --- Small candle circle around the loom ----
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = 3.5;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;

    const candleBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 0.18, 6),
      stdMat(0xaaa48c, { roughness: 0.95 }),
    );
    candleBase.position.set(cx, 0.09, cz);
    group.add(candleBase);

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.04, 0.12, 6),
      emissiveMat(0xb8d8ff, 0x7090d8, 2.8, { roughness: 0.3 }),
    );
    flame.position.set(cx, 0.26, cz);
    group.add(flame);

    const flameGlow = glowSprite(0x80a0d8, 0.5, 0.45);
    flameGlow.position.set(cx, 0.28, cz);
    group.add(flameGlow);

    const candleLight = new THREE.PointLight(0x9bb6e8, 0.35, 4, 1.5);
    candleLight.position.set(cx, 0.3, cz);
    group.add(candleLight);

    registry.stonehush.candles.push({
      flame,
      glow: flameGlow,
      light: candleLight,
      phase: Math.random() * Math.PI * 2,
    });
  }

  // --- Loom in the center (taller, dramatic) ----
  const loomGroup = new THREE.Group();
  loomGroup.position.set(0, 0, 0);
  group.add(loomGroup);

  const vert1 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4.4, 0.22), beamMat);
  vert1.position.set(-1.6, 2.2, 0);
  vert1.castShadow = true;
  loomGroup.add(vert1);
  const vert2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4.4, 0.22), beamMat);
  vert2.position.set(1.6, 2.2, 0);
  vert2.castShadow = true;
  loomGroup.add(vert2);

  const horizTop = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.22, 0.22), beamMat);
  horizTop.position.set(0, 4.2, 0);
  loomGroup.add(horizTop);
  const horizBot = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.22, 0.22), beamMat);
  horizBot.position.set(0, 0.4, 0);
  loomGroup.add(horizBot);

  // Crossbar that holds threads at various heights
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 0.14), beamMat);
  crossbar.position.set(0, 3.4, -0.1);
  loomGroup.add(crossbar);

  // Diagonal brace
  const brace = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.12, 0.12), beamMat);
  brace.position.set(0, 2.6, -0.18);
  brace.rotation.z = -0.45;
  loomGroup.add(brace);

  // Vertical threads — tinted different grays / pale warm, animated swaying
  for (let i = 0; i < 18; i++) {
    const tint = i % 3 === 0 ? 0xa89a86 : i % 3 === 1 ? 0x888076 : 0xb0a692;
    const thread = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 3.5, 0.02),
      new THREE.MeshBasicMaterial({
        color: tint,
        transparent: true,
        opacity: 0.75,
      }),
    );
    thread.position.set(-1.55 + i * 0.18, 2.2, 0);
    thread.userData.phase = Math.random() * Math.PI * 2;
    thread.userData.baseX = thread.position.x;
    loomGroup.add(thread);
    registry.stonehush.threads.push(thread);
  }

  // Partial woven fabric hanging from top
  const fabric = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 1.2),
    new THREE.MeshStandardMaterial({
      color: 0x6a5a48,
      roughness: 0.95,
      side: THREE.DoubleSide,
    }),
  );
  fabric.position.set(0, 3.6, 0.05);
  loomGroup.add(fabric);

  // --- Small reflective pool of water ----
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 24),
    new THREE.MeshStandardMaterial({
      color: 0x0a1020,
      emissive: 0x3050a0,
      emissiveIntensity: 0.2,
      roughness: 0.15,
      metalness: 0.6,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(4.5, 0.04, -3.5);
  group.add(pool);
  registry.stonehush.pool = pool;

  // Stone edging around the pool
  const edgingCount = 10;
  for (let i = 0; i < edgingCount; i++) {
    const a = (i / edgingCount) * Math.PI * 2;
    const stone = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.25 + Math.random() * 0.08, 0),
      darkStoneMat,
    );
    stone.position.set(
      4.5 + Math.cos(a) * 1.75,
      0.1,
      -3.5 + Math.sin(a) * 1.75,
    );
    stone.rotation.y = Math.random() * Math.PI;
    group.add(stone);
  }

  // --- Small stone cairn off to the side ----
  const cairnPieces = [
    { r: 0.4, y: 0.4 },
    { r: 0.33, y: 1.05 },
    { r: 0.27, y: 1.55 },
    { r: 0.22, y: 1.95 },
    { r: 0.17, y: 2.25 },
  ];
  for (const p of cairnPieces) {
    const s = new THREE.Mesh(
      new THREE.DodecahedronGeometry(p.r, 0),
      stoneMat,
    );
    s.position.set(-5.5, p.y, -5);
    s.rotation.y = Math.random() * Math.PI;
    s.castShadow = true;
    group.add(s);
  }

  // A faint, distant blue light for the pool to pick up moon reflection
  const moonSuggestionLight = new THREE.PointLight(0x5a78c8, 0.25, 14, 2.2);
  moonSuggestionLight.position.set(4.5, 4, -3.5);
  group.add(moonSuggestionLight);

  scene.add(group);
  registry.stonehush.group = group;
  ChunkManager.register(group, group.position.x, group.position.z);
}

// ============================================================

// Anything farther than this from the player is too distant for its flicker
// animations to be visible, so we skip the per-frame work entirely.
const VILLAGE_UPDATE_RANGE_SQ = 220 * 220;

const VILLAGE_POSITIONS = {
  ashwick: { x: 0, z: -500 },
  veilMarket: { x: 0, z: -2500 },
  stonehush: { x: -800, z: -5000 },
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
    else if (name === 'veilMarket') buildVeilMarket(scene);
    else if (name === 'stonehush') buildStonehush(scene);
  },

  update(time, playerPos) {
    const updateAshwick = villageInRange('ashwick', playerPos);
    const updateVeil = villageInRange('veilMarket', playerPos);
    const updateStonehush = villageInRange('stonehush', playerPos);
    if (!updateAshwick && !updateVeil && !updateStonehush) return;
    // -- Ashwick (town mesh + mill + forge flicker — AshwickTown.js) --
    if (updateAshwick) {
      updateAshwickTown(time, playerPos, registry.ashwick);
    }

    // -- Veil Market --
    if (updateVeil) {
    for (let i = 0; i < registry.veilMarket.orbs.length; i++) {
      const orb = registry.veilMarket.orbs[i];
      orb.position.y = orb.userData.baseY + Math.sin(time * 1.4 + orb.userData.bobPhase) * 0.35;
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
    } // end updateVeil

    // -- Stonehush --
    if (updateStonehush) {
    for (const t of registry.stonehush.threads) {
      t.position.x = t.userData.baseX + Math.sin(time * 0.8 + t.userData.phase) * 0.015;
      t.rotation.z = Math.sin(time * 1.2 + t.userData.phase) * 0.01;
    }
    for (const c of registry.stonehush.candles) {
      const f = 0.85 + Math.sin(time * 6 + c.phase) * 0.1 + (Math.random() - 0.5) * 0.07;
      c.flame.scale.y = f;
      c.flame.scale.x = 1 + Math.sin(time * 8 + c.phase) * 0.08;
      c.light.intensity = 0.35 * f;
      c.glow.material.opacity = 0.4 + f * 0.12;
    }
    if (registry.stonehush.pool) {
      const mat = registry.stonehush.pool.material;
      mat.emissiveIntensity = 0.18 + Math.sin(time * 0.6) * 0.04;
    }
    } // end updateStonehush
  },
};
