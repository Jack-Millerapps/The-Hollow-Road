import * as THREE from 'three';
import { getSoftCircleTexture } from './spriteTextures.js';
import { ChunkManager } from '../game/ChunkManager.js';
import { Collision } from '../game/Collision.js';
import { SceneManager } from './SceneManager.js';
import { ModelLoader } from './ModelLoader.js';

function attachTownShell(parent, modelKey) {
  ModelLoader.ensure(modelKey)
    .then(() => {
      const inst = ModelLoader.instantiate(modelKey);
      if (!inst) return;
      parent.add(inst.root);
    })
    .catch(() => {});
}

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
  ChunkManager.register(group, group.position.x, group.position.z);
}

// ============================================================
export function buildStonehushTown(scene, reg) {
  reg.threads.length = 0;
  reg.candles.length = 0;
  reg.pool = null;
  reg.group?.removeFromParent?.();

  const ax = -800;
  const az = -5000;
  const nx = 600;
  const nz = -6000;
  const dx = nx - ax;
  const dz = nz - az;
  const segLen = Math.hypot(dx, dz);
  const ox = (-dz / segLen) * 44;
  const oz = (dx / segLen) * 44;

  const group = new THREE.Group();
  group.position.set(ax, 0, az);
  group.rotation.y = 0;

  const core = new THREE.Group();
  core.position.set(ox, 0, oz);
  group.add(core);

  attachTownShell(core, 'townStone');

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
  core.add(clearing);

  // Inner darker ring
  const innerRing = new THREE.Mesh(
    new THREE.CircleGeometry(6, 32),
    stdMat(0x060c06, { roughness: 1 }),
  );
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.y = 0.02;
  core.add(innerRing);

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
    core.add(stone);
    const stWx = ax + ox + x;
    const stWz = az + oz + z;
    Collision.registerBox(stWx, stWz, bottomR + 0.55, bottomR + 0.55);
  }

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const r = 12.5 + (i % 3) * 0.6;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 2.8 + Math.random() * 2;
    const bottomR = 0.35 + Math.random() * 0.12;
    const topR = bottomR * 0.62;
    const sg = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(topR, bottomR, h, 8),
      stoneMat,
    );
    shaft.position.y = h / 2;
    shaft.castShadow = true;
    sg.add(shaft);
    sg.position.set(x, 0, z);
    sg.rotation.y = Math.random() * Math.PI;
    core.add(sg);
    Collision.registerBox(ax + ox + x, az + oz + z, bottomR + 0.45, bottomR + 0.45);
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
  core.add(fallen);

  const fallenMoss = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.58, 1.5, 10),
    mossMat,
  );
  fallenMoss.rotation.z = Math.PI / 2 + 0.2;
  fallenMoss.rotation.y = 0.3;
  fallenMoss.position.set(-4.8, 0.55, 3.2);
  core.add(fallenMoss);

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
    core.add(candleBase);

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.04, 0.12, 6),
      emissiveMat(0xb8d8ff, 0x7090d8, 2.8, { roughness: 0.3 }),
    );
    flame.position.set(cx, 0.26, cz);
    core.add(flame);

    const flameGlow = glowSprite(0x80a0d8, 0.5, 0.45);
    flameGlow.position.set(cx, 0.28, cz);
    core.add(flameGlow);

    const candleLight = new THREE.PointLight(0x9bb6e8, 0.35, 4, 1.5);
    candleLight.position.set(cx, 0.3, cz);
    core.add(candleLight);

    reg.candles.push({
      flame,
      glow: flameGlow,
      light: candleLight,
      phase: Math.random() * Math.PI * 2,
    });
  }

  // --- Loom in the center (taller, dramatic) ----
  const loomGroup = new THREE.Group();
  loomGroup.position.set(0, 0, 0);
  core.add(loomGroup);

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
    reg.threads.push(thread);
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
  core.add(pool);
  reg.pool = pool;

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
    core.add(stone);
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
    core.add(s);
  }

  // A faint, distant blue light for the pool to pick up moon reflection
  const moonSuggestionLight = new THREE.PointLight(0x5a78c8, 0.25, 14, 2.2);
  moonSuggestionLight.position.set(4.5, 4, -3.5);
  core.add(moonSuggestionLight);

  scene.add(group);
  reg.group = group;
  ChunkManager.register(group, group.position.x, group.position.z);
}

/** Deeproot — root-bound settlement; bulk offset perpendicular to the road toward Mirror Town. */
export function buildDeeprootTown(scene, reg) {
  reg.lanterns ??= [];
  reg.rootArcs ??= [];
  reg.lanterns.length = 0;
  reg.rootArcs.length = 0;
  reg.group?.removeFromParent?.();

  const ax = 600;
  const az = -6000;
  const nx = 200;
  const nz = -7800;
  const dx = nx - ax;
  const dz = nz - az;
  const L = Math.hypot(dx, dz);
  const ox = (-dz / L) * 46;
  const oz = (dx / L) * 46;

  const group = new THREE.Group();
  group.position.set(ax, 0, az);
  const core = new THREE.Group();
  core.position.set(ox, 0, oz);
  group.add(core);

  attachTownShell(core, 'townForest');

  const barkMat = stdMat(0x1a1410, { roughness: 0.94 });
  const hutWall = stdMat(0x3a2818, { roughness: 0.9 });
  const roofMat = stdMat(0x0f2814, { roughness: 0.92 });

  const greatPad = new THREE.Mesh(
    new THREE.CircleGeometry(28, 40),
    stdMat(0x081408, { roughness: 1 }),
  );
  greatPad.rotation.x = -Math.PI / 2;
  greatPad.position.y = 0.015;
  greatPad.receiveShadow = true;
  core.add(greatPad);

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 3.4, 16, 16),
    stdMat(0x241810, { roughness: 0.9 }),
  );
  trunk.position.set(-4, 8, 3);
  trunk.castShadow = true;
  core.add(trunk);
  Collision.registerBox(ax + ox - 4, az + oz + 3, 3.2, 3.2);

  for (let i = 0; i < 6; i++) {
    const u = (i / 6) * Math.PI * 2;
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(2.8 + (i % 2) * 0.6, 0.32, 8, 22),
      barkMat,
    );
    torus.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.2;
    torus.position.set(Math.cos(u) * 7, 2.4 + i * 0.6, Math.sin(u) * 7 + 2);
    torus.castShadow = true;
    core.add(torus);
    reg.rootArcs.push(torus);
  }

  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    const r = 15 + (i % 3) * 1.1;
    const hx = Math.cos(a) * r;
    const hz = Math.sin(a) * r;
    const hut = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.35, 3.2), hutWall);
    body.position.y = 1.18;
    body.castShadow = true;
    hut.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.7, 1.45, 4), roofMat);
    roof.position.y = 2.85;
    roof.rotation.y = 0.2;
    hut.add(roof);
    hut.position.set(hx, 0, hz);
    hut.rotation.y = -a + Math.PI * 0.15;
    core.add(hut);
    Collision.registerBox(ax + ox + hx, az + oz + hz, 1.85, 1.85);
  }

  for (let i = 0; i < 28; i++) {
    const rx = (Math.random() - 0.5) * 34;
    const rz = (Math.random() - 0.5) * 34;
    const ln = 1.5 + Math.random() * 2.8;
    const root = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, ln, 6), barkMat);
    root.position.set(rx, ln * 0.25, rz);
    root.rotation.z = (Math.random() - 0.5) * 0.75;
    root.rotation.x = (Math.random() - 0.5) * 0.45;
    core.add(root);
  }

  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = 8.5 + (i % 2) * 1.4;
    const lx = Math.cos(a) * r;
    const lz = Math.sin(a) * r;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.07, 2.35, 6),
      stdMat(0x1a1008),
    );
    pole.position.set(lx, 1.18, lz);
    core.add(pole);
    const lan = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 8),
      emissiveMat(0x9ad870, 0x3a6020, 2.0, { roughness: 0.35 }),
    );
    lan.position.set(lx, 2.38, lz);
    core.add(lan);
    reg.lanterns.push(lan);
    const pl = new THREE.PointLight(0xa0e888, 0.42, 10, 2);
    pl.position.set(ax + ox + lx, 2.35, az + oz + lz);
    group.add(pl);
    SceneManager.registerPointLight(pl);
  }

  const midGlow = new THREE.PointLight(0x4a6838, 0.55, 38, 2.1);
  midGlow.position.set(ax + ox - 4, 6, az + oz + 3);
  group.add(midGlow);
  SceneManager.registerPointLight(midGlow);

  scene.add(group);
  reg.group = group;
  ChunkManager.register(group, group.position.x, group.position.z);
}

/** Mirror Town — glassy ring; offset from the pilgrimage road leg. */
export function buildMirrorTown(scene, reg) {
  reg.panels ??= [];
  reg.panels.length = 0;
  reg.group?.removeFromParent?.();

  const ax = 200;
  const az = -7800;
  const nx = 0;
  const nz = -14500;
  const dx = nx - ax;
  const dz = nz - az;
  const L = Math.hypot(dx, dz);
  const ox = (-dz / L) * 50;
  const oz = (dx / L) * 50;

  const group = new THREE.Group();
  group.position.set(ax, 0, az);
  const core = new THREE.Group();
  core.position.set(ox, 0, oz);
  group.add(core);

  attachTownShell(core, 'townPristine');

  const frameMat = stdMat(0x101828, { metalness: 0.35, roughness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xb0d8f8,
    emissive: 0x305070,
    emissiveIntensity: 0.45,
    metalness: 0.75,
    roughness: 0.14,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
  });

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(24, 36),
    stdMat(0x0c1018, { metalness: 0.25, roughness: 0.5 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  core.add(floor);

  for (let k = 0; k < 7; k++) {
    const ang = (k / 7) * Math.PI * 2;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 5), glassMat);
    const px = Math.cos(ang) * 6.5;
    const pz = Math.sin(ang) * 6.5;
    panel.position.set(px, 2.6, pz);
    panel.rotation.y = ang + Math.PI;
    core.add(panel);
    reg.panels.push(panel);
  }

  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = 17 + (i % 2) * 1.5;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const shell = new THREE.Mesh(new THREE.BoxGeometry(3.8, 4.6, 3.6), frameMat);
    shell.position.set(bx, 2.3, bz);
    shell.rotation.y = -a + Math.PI * 0.2;
    shell.castShadow = true;
    core.add(shell);
    Collision.registerBox(ax + ox + bx, az + oz + bz, 2.1, 2);
  }

  reg.spire = new THREE.Mesh(
    new THREE.ConeGeometry(0.75, 10, 6),
    emissiveMat(0xf0fcff, 0x5890c0, 2.2, { roughness: 0.22 }),
  );
  reg.spire.position.set(0, 5, 0);
  reg.spire.castShadow = true;
  core.add(reg.spire);

  reg.shardRing = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    const s = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 1.8 + (i % 3) * 0.4, 0.28),
      emissiveMat(0xd0e8ff, 0x7090b0, 1.5, { roughness: 0.25 }),
    );
    s.position.set(Math.cos(ang) * 1.9, 1.2, Math.sin(ang) * 1.9);
    s.rotation.y = ang;
    s.rotation.z = (Math.random() - 0.5) * 0.25;
    reg.shardRing.add(s);
  }
  core.add(reg.shardRing);

  const amb = new THREE.PointLight(0xa8c8e8, 0.55, 32, 2);
  amb.position.set(ax + ox, 4.5, az + oz);
  group.add(amb);
  SceneManager.registerPointLight(amb);

  scene.add(group);
  reg.group = group;
  ChunkManager.register(group, group.position.x, group.position.z);
}

export function updateDeeprootTown(time, reg) {
  if (reg.rootArcs?.length) {
    for (let i = 0; i < reg.rootArcs.length; i++) {
      reg.rootArcs[i].rotation.y = time * 0.05 + i * 0.28;
    }
  }
  if (!reg.lanterns?.length) return;
  for (const m of reg.lanterns) {
    const mat = m.material;
    mat.emissiveIntensity = 1.65 + Math.sin(time * 2.2 + m.position.x * 2) * 0.42;
  }
}

export function updateMirrorTown(time, reg) {
  if (reg.shardRing) reg.shardRing.rotation.y = time * 0.11;
  if (reg.spire?.material) {
    reg.spire.material.emissiveIntensity = 2.0 + Math.sin(time * 1.9) * 0.38;
  }
  const g = reg.panels[0]?.material;
  if (g) {
    g.emissiveIntensity = 0.42 + Math.sin(time * 1.35) * 0.12;
  }
}
