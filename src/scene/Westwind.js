import * as THREE from 'three';
import { SceneManager } from './SceneManager.js';
import { Collision } from '../game/Collision.js';
import { getSoftCircleTexture } from './spriteTextures.js';

// Westwind — the player's hometown, perched just north of the existing
// road network. Builds a small village and a dirt path running south to
// meet (0, 0), where the existing Hollow Road begins.

// Consolidation — Westwind center moved to z=500 (see data/villages.js)
const CENTER = new THREE.Vector3(0, 0, 500);

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.9,
    metalness: opts.metalness ?? 0,
    flatShading: opts.flatShading ?? true,
    ...opts,
  });
}

function emissive(color, emitColor, intensity, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: emitColor,
    emissiveIntensity: intensity,
    roughness: opts.roughness ?? 0.5,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });
}

// -- Tree (cluster canopy) ------------------------------------------------

function makeTree() {
  const tree = new THREE.Group();
  const trunkMat = mat(0x2a1a0f, { roughness: 0.95 });
  const trunkH = 1.6 + Math.random() * 1.2;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.22, trunkH, 7),
    trunkMat,
  );
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  tree.add(trunk);

  const canopyColor = new THREE.Color().setHSL(
    0.27 + Math.random() * 0.05,
    0.35,
    0.11 + Math.random() * 0.05,
  );
  const canopyMat = mat(canopyColor.getHex(), { roughness: 0.95 });
  const count = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    const r = 0.6 + Math.random() * 0.4;
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(r, 8, 6),
      canopyMat,
    );
    canopy.position.set(
      (Math.random() - 0.5) * 0.8,
      trunkH + (Math.random() - 0.3) * 0.7,
      (Math.random() - 0.5) * 0.8,
    );
    canopy.scale.y = 0.85 + Math.random() * 0.3;
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    tree.add(canopy);
  }
  tree.userData.swayOffset = Math.random() * Math.PI * 2;
  tree.userData.swayAmp = 0.01 + Math.random() * 0.015;
  return tree;
}

// -- Cabin with thatched roof + window glow -------------------------------

function makeCabin({ warmGlow = true } = {}) {
  const g = new THREE.Group();

  const W = 4.4;
  const D = 3.6;
  const H = 2.4;

  const wallMat = mat(0x4a2e18, { roughness: 0.95 });

  // Four walls as one hollow-ish structure — just boxes, the interior is
  // not visible from outside because windows/door are sealed planes.
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(W, H, D),
    wallMat,
  );
  body.position.y = H / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // Log trim — horizontal beams on the side walls
  const beamMat = mat(0x2a1608, { roughness: 0.95 });
  for (let i = 0; i < 3; i++) {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(W + 0.05, 0.08, 0.08),
      beamMat,
    );
    beam.position.set(0, 0.5 + i * 0.7, D / 2 + 0.02);
    g.add(beam);
    const beamBack = beam.clone();
    beamBack.position.z = -D / 2 - 0.02;
    g.add(beamBack);
  }
  // Corner posts
  for (const dx of [-1, 1]) {
    for (const dz of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, H + 0.1, 0.18),
        beamMat,
      );
      post.position.set((W / 2 + 0.05) * dx, H / 2, (D / 2 + 0.05) * dz);
      g.add(post);
    }
  }

  // Thatched roof — two tilted panels forming a gable
  const thatchMat = mat(0x6a4a1e, { roughness: 1 });
  const roofLeft = new THREE.Mesh(
    new THREE.BoxGeometry(W + 0.6, 0.2, D / 2 + 0.6),
    thatchMat,
  );
  roofLeft.position.set(0, H + 0.6, -D / 4);
  roofLeft.rotation.x = -Math.PI / 6;
  roofLeft.castShadow = true;
  g.add(roofLeft);
  const roofRight = new THREE.Mesh(
    new THREE.BoxGeometry(W + 0.6, 0.2, D / 2 + 0.6),
    thatchMat,
  );
  roofRight.position.set(0, H + 0.6, D / 4);
  roofRight.rotation.x = Math.PI / 6;
  roofRight.castShadow = true;
  g.add(roofRight);

  // Thatch texture — overlay darker strips
  for (let i = 0; i < 6; i++) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(W + 0.58, 0.04, 0.06),
      mat(0x4a2e0e, { roughness: 1 }),
    );
    const z = -D / 2 + (i / 5) * D;
    strip.position.set(0, H + 0.95, z);
    g.add(strip);
  }

  // Chimney
  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 1.0, 0.5),
    mat(0x2a2420, { roughness: 1 }),
  );
  chimney.position.set(W / 2 - 0.6, H + 0.9, -D / 4);
  chimney.castShadow = true;
  g.add(chimney);

  // Door
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.7, 0.06),
    mat(0x2a1608, { roughness: 0.9 }),
  );
  door.position.set(0, 0.85, D / 2 + 0.04);
  g.add(door);
  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 8, 6),
    mat(0x6a4626, { metalness: 0.6, roughness: 0.4 }),
  );
  knob.position.set(0.3, 0.9, D / 2 + 0.08);
  g.add(knob);
  // Door frame
  const frameMat = mat(0x1e0f05, { roughness: 0.9 });
  const topFrame = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.08, 0.1),
    frameMat,
  );
  topFrame.position.set(0, 1.74, D / 2 + 0.05);
  g.add(topFrame);

  // Windows (front + side) with warm glow
  function addWindow(x, y, z, ry = 0) {
    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.7),
      new THREE.MeshStandardMaterial({
        color: 0x5a3012,
        emissive: warmGlow ? 0xffaa44 : 0x4a3020,
        emissiveIntensity: warmGlow ? 1.8 : 0.2,
        transparent: true,
        opacity: 0.9,
        roughness: 0.4,
        side: THREE.DoubleSide,
      }),
    );
    pane.position.set(x, y, z);
    pane.rotation.y = ry;
    g.add(pane);
    // Cross bars
    for (const vertical of [true, false]) {
      const bar = new THREE.Mesh(
        vertical
          ? new THREE.BoxGeometry(0.04, 0.7, 0.02)
          : new THREE.BoxGeometry(0.8, 0.04, 0.02),
        mat(0x2a1608, { roughness: 0.9 }),
      );
      bar.position.set(x, y, z);
      bar.rotation.y = ry;
      g.add(bar);
    }
    if (warmGlow) {
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: getSoftCircleTexture(),
          color: 0xffaa55,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      glow.position.set(x, y, z);
      glow.scale.set(1.4, 1.2, 1);
      g.add(glow);

      const light = new THREE.PointLight(0xffa040, 0.8, 8, 2);
      light.position.set(x * 1.1, y, z * 1.1);
      g.add(light);
      g.userData.windowLights = g.userData.windowLights || [];
      g.userData.windowLights.push({ pane, light });
    }
  }

  // Front-facing window
  addWindow(-1.2, 1.4, D / 2 + 0.04, 0);
  // Side window
  addWindow(W / 2 + 0.04, 1.4, 0.3, Math.PI / 2);

  return g;
}

// -- Well -----------------------------------------------------------------

function makeWell() {
  const g = new THREE.Group();
  const stoneMat = mat(0x3a342e, { roughness: 1 });
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.1, 0.9, 16),
    stoneMat,
  );
  base.position.y = 0.45;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);
  // Stone lip
  const lip = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.0, 0.15, 16),
    mat(0x2a2420, { roughness: 1 }),
  );
  lip.position.y = 0.93;
  g.add(lip);
  // Water inside
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(0.92, 0.92, 0.05, 14),
    emissive(0x0a1020, 0x1a2438, 0.4, { roughness: 0.2 }),
  );
  water.position.y = 0.7;
  g.add(water);
  // Roof posts
  const postMat = mat(0x2a1608, { roughness: 0.95 });
  for (const dz of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 2.4, 8),
      postMat,
    );
    post.position.set(0, 1.2, 0.9 * dz);
    g.add(post);
  }
  // Cross bar
  const cross = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 2.0, 8),
    postMat,
  );
  cross.rotation.x = Math.PI / 2;
  cross.position.y = 2.4;
  g.add(cross);
  // Thatched mini-roof
  const thatchMat = mat(0x6a4a1e, { roughness: 1 });
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(3.0, 0.2, 2.4),
    thatchMat,
  );
  roof.position.y = 2.6;
  g.add(roof);
  // Bucket hanging
  const bucket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 0.3, 10),
    mat(0x3a2411, { roughness: 0.9 }),
  );
  bucket.position.set(0, 1.9, 0);
  g.add(bucket);
  // Rope
  const rope = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6),
    mat(0x6a5840, { roughness: 0.95 }),
  );
  rope.position.set(0, 2.2, 0);
  g.add(rope);
  return g;
}

// -- Lantern post (shared style with Environment but standalone) ----------

function makeLanternPost() {
  const g = new THREE.Group();
  const poleMat = mat(0x0c0904, { roughness: 0.85 });
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 3.2, 8),
    poleMat,
  );
  pole.position.y = 1.6;
  pole.castShadow = true;
  g.add(pole);
  // Cage
  const cage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.16, 0.35, 8),
    mat(0x181008, { metalness: 0.5, roughness: 0.5 }),
  );
  cage.position.y = 3.25;
  g.add(cage);
  // Core
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 6),
    emissive(0xffc06a, 0xff9030, 2.6),
  );
  core.position.y = 3.25;
  g.add(core);
  // Glow sprite
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getSoftCircleTexture(),
      color: 0xffaa55,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.position.y = 3.25;
  glow.scale.set(1.4, 1.4, 1);
  g.add(glow);
  // Cap
  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 0.22, 8),
    mat(0x0c0904, { metalness: 0.4, roughness: 0.5 }),
  );
  cap.position.y = 3.55;
  g.add(cap);
  // Point light
  const light = new THREE.PointLight(0xffa040, 1.4, 18, 1.8);
  light.position.y = 3.2;
  g.add(light);

  g.userData.core = core;
  g.userData.glow = glow;
  g.userData.light = light;
  g.userData.flickerOffset = Math.random() * Math.PI * 2;
  g.userData.baseIntensity = 1.4;
  return g;
}

// -- Signpost -------------------------------------------------------------

function makeSignpost(text) {
  const g = new THREE.Group();
  const postMat = mat(0x2a1608, { roughness: 0.95 });
  const post = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 2.2, 0.14),
    postMat,
  );
  post.position.y = 1.1;
  post.castShadow = true;
  g.add(post);

  // Plank
  const plank = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.5, 0.08),
    mat(0x4a2e18, { roughness: 0.9 }),
  );
  plank.position.y = 1.7;
  g.add(plank);
  // Pointer arrow — a chevron on the southern end
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 0.5, 3),
    mat(0x4a2e18, { roughness: 0.9 }),
  );
  arrow.rotation.z = -Math.PI / 2;
  arrow.position.set(-1.15, 1.7, 0);
  g.add(arrow);

  // Text billboard (canvas texture for the sign label)
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(40, 26, 12, 0)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#e8dcc8';
  ctx.font = 'italic 40px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 6;
  ctx.fillText(text || 'Hollow Road — 500m', 260, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const labelMat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
  });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.45), labelMat);
  label.position.set(0, 1.7, 0.05);
  g.add(label);
  const labelBack = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.45), labelMat);
  labelBack.position.set(0, 1.7, -0.05);
  labelBack.rotation.y = Math.PI;
  g.add(labelBack);

  return g;
}

// -- Dirt path segment ----------------------------------------------------

function makeDirtPath(length, width = 2.4) {
  const mat1 = new THREE.MeshStandardMaterial({
    color: 0x2a1d10,
    roughness: 1,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, length), mat1);
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;
  return plane;
}

// -- NPC placeholder (scaled-down merchant body) --------------------------

export function makeVillagerMesh({ robeColor = 0x4a2e18, skinColor = 0xc9a684 } = {}) {
  const g = new THREE.Group();
  const robeMat = mat(robeColor, { roughness: 0.9 });
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.36, 1.1, 10),
    robeMat,
  );
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  const shoulders = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.28, 0.12, 10),
    robeMat,
  );
  shoulders.position.y = 1.15;
  g.add(shoulders);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 12, 10),
    mat(skinColor, { roughness: 0.95 }),
  );
  head.position.y = 1.36;
  head.castShadow = true;
  g.add(head);
  // Hair cap
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    mat(0x1a0f08, { roughness: 1 }),
  );
  hair.position.y = 1.4;
  g.add(hair);
  // Arms (stubs)
  const armMat = mat(robeColor, { roughness: 0.9 });
  const leftArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.06, 0.7, 6),
    armMat,
  );
  leftArm.position.set(-0.32, 0.85, 0);
  g.add(leftArm);
  const rightArm = leftArm.clone();
  rightArm.position.x = 0.32;
  g.add(rightArm);
  // Belt
  const belt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.06, 10),
    mat(0x1f1208, { roughness: 0.7 }),
  );
  belt.position.y = 0.7;
  g.add(belt);
  return g;
}

// -- Westwind module ------------------------------------------------------

export const Westwind = {
  group: null,
  center: CENTER.clone(),
  trees: [],
  lanterns: [],
  windowLights: [],
  npcs: [],
  signpost: null,

  build(scene) {
    const group = new THREE.Group();
    group.position.copy(CENTER);
    this.group = group;
    this.trees = [];
    this.lanterns = [];
    this.windowLights = [];
    this.npcs = [];

    // Widened ground patch so Westwind reads as a proper clearing
    const clearing = new THREE.Mesh(
      new THREE.CircleGeometry(24, 32),
      new THREE.MeshStandardMaterial({ color: 0x1a1408, roughness: 1 }),
    );
    clearing.rotation.x = -Math.PI / 2;
    clearing.position.y = 0.01;
    clearing.receiveShadow = true;
    group.add(clearing);

    // Central dirt path (N-S axis through the village)
    const path = makeDirtPath(30, 2.8);
    path.position.y = 0.02;
    group.add(path);

    // The road south — from Westwind out to (0, 0)
    const exitPath = makeDirtPath(110, 2.8);
    exitPath.position.set(0, 0.02, -70);
    group.add(exitPath);

    // Player's cabin (home). Local (-6.5, 0, 4); world (CENTER + local).
    const playerCabin = makeCabin({ warmGlow: true });
    playerCabin.position.set(-6.5, 0, 4);
    playerCabin.rotation.y = 0.2;
    group.add(playerCabin);
    if (playerCabin.userData.windowLights) {
      this.windowLights.push(...playerCabin.userData.windowLights);
    }
    Collision.addBox(CENTER.x - 6.5, CENTER.z + 4, 2.5, 2.0);

    // Three neighbor cabins.
    const neighbor1 = makeCabin({ warmGlow: true });
    neighbor1.position.set(7.5, 0, 4);
    neighbor1.rotation.y = -0.25;
    group.add(neighbor1);
    if (neighbor1.userData.windowLights) {
      this.windowLights.push(...neighbor1.userData.windowLights);
    }
    Collision.addBox(CENTER.x + 7.5, CENTER.z + 4, 2.5, 2.0);

    const neighbor2 = makeCabin({ warmGlow: true });
    neighbor2.position.set(-7.5, 0, -7);
    neighbor2.rotation.y = 0.6;
    group.add(neighbor2);
    if (neighbor2.userData.windowLights) {
      this.windowLights.push(...neighbor2.userData.windowLights);
    }
    Collision.addBox(CENTER.x - 7.5, CENTER.z - 7, 2.5, 2.0);

    const neighbor3 = makeCabin({ warmGlow: true });
    neighbor3.position.set(8.5, 0, -7);
    neighbor3.rotation.y = -0.5;
    group.add(neighbor3);
    if (neighbor3.userData.windowLights) {
      this.windowLights.push(...neighbor3.userData.windowLights);
    }
    Collision.addBox(CENTER.x + 8.5, CENTER.z - 7, 2.5, 2.0);

    // Well at the center.
    const well = makeWell();
    well.position.set(0, 0, -1);
    group.add(well);
    Collision.addCircle(CENTER.x + 0, CENTER.z - 1, 1.3);

    // Signpost pointing south (toward (-z) in world, but Westwind is at +z so
    // "south" from here is toward lower z). In the group we rotate so the
    // arrow points toward -z.
    const signpost = makeSignpost('The Hollow Road');
    signpost.position.set(1.5, 0, -13);
    signpost.rotation.y = Math.PI / 2; // arrow points -x locally; rotate
    group.add(signpost);
    this.signpost = signpost;

    // Village lanterns on posts.
    const lanternSpots = [
      [-3, 0, 2],
      [3, 0, 2],
      [-4, 0, -10],
      [4, 0, -10],
      [0, 0, -18],
      [0, 0, 10],
    ];
    for (const [x, y, z] of lanternSpots) {
      const lp = makeLanternPost();
      lp.position.set(x, y, z);
      group.add(lp);
      this.lanterns.push(lp);
      // Register the lantern's PointLight with the scene light budget so it
      // competes fairly for active-light slots. Without this, the lanterns
      // rendered as unlit geometry at night (Bug 3).
      if (lp.userData.light) {
        SceneManager.registerPointLight(lp.userData.light);
      }
      // Lantern post collider.
      Collision.addCircle(CENTER.x + x, CENTER.z + z, 0.35);
    }

    // Surrounding low forest.
    for (let i = 0; i < 60; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 18 + Math.random() * 22;
      const tx = Math.cos(angle) * radius;
      const tz = Math.sin(angle) * radius;
      // Keep a clear corridor to the south (path out).
      if (Math.abs(tx) < 2.5 && tz < -10) continue;
      const tree = makeTree();
      tree.position.set(tx, 0, tz);
      tree.rotation.y = Math.random() * Math.PI * 2;
      const s = 0.85 + Math.random() * 0.45;
      tree.scale.setScalar(s);
      group.add(tree);
      this.trees.push(tree);
      // Only register near-corridor trees to keep collider count cheap.
      if (radius < 32) {
        Collision.addCircle(CENTER.x + tx, CENTER.z + tz, 0.55);
      }
    }

    scene.add(group);
    return group;
  },

  show() {
    if (this.group) this.group.visible = true;
  },

  hide() {
    if (this.group) this.group.visible = false;
  },

  // World-space spawn on the south edge of the village facing the road
  // south. Default Three.js forward is -z, so rotationY 0 points the
  // player toward lower-z (the road toward Ashwick).
  getArrivalSpawn() {
    return {
      position: { x: this.center.x, z: this.center.z - 4 },
      rotationY: 0,
    };
  },

  update(time) {
    if (!this.group?.visible) return;
    // Tree sway
    for (const tree of this.trees) {
      tree.rotation.z =
        Math.sin(time + tree.userData.swayOffset) * tree.userData.swayAmp;
    }
    // Lantern flicker
    for (const lp of this.lanterns) {
      const off = lp.userData.flickerOffset;
      const f =
        0.88 +
        Math.sin(time * 3.2 + off) * 0.07 +
        Math.sin(time * 7.5 + off) * 0.04 +
        (Math.random() - 0.5) * 0.04;
      if (lp.userData.light) lp.userData.light.intensity = lp.userData.baseIntensity * f;
      if (lp.userData.core) lp.userData.core.material.emissiveIntensity = 2.6 * f;
      if (lp.userData.glow) lp.userData.glow.material.opacity = 0.5 + f * 0.15;
    }
    // Window breathing glow
    for (const { pane } of this.windowLights) {
      pane.material.emissiveIntensity = 1.7 + Math.sin(time * 1.8) * 0.2;
    }
  },
};
