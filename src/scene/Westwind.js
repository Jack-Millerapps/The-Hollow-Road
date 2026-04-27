import * as THREE from 'three';
import { SceneManager } from './SceneManager.js';
import { Collision } from '../game/Collision.js';
import { ChunkManager } from '../game/ChunkManager.js';
import { getSoftCircleTexture } from './spriteTextures.js';
import { ModelLoader } from './ModelLoader.js';

const CABIN_SCALE = 1.0;
const HAMLET_SCALE = 1.0;
const LANTERN_SCALE = 1.0;
const AMBER_SCALE = 1.0;

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

// -- Tree (GLB conifer) ---------------------------------------------------

function makeTree() {
  const tree = new THREE.Group();
  ModelLoader.ensure('conifer')
    .then(() => {
      const inst = ModelLoader.instantiate('conifer');
      if (!inst || !tree.parent) return;
      tree.add(inst.root);
    })
    .catch(() => {});
  tree.userData.swayOffset = Math.random() * Math.PI * 2;
  tree.userData.swayAmp = 0.01 + Math.random() * 0.015;
  return tree;
}

// -- Cabin (timber GLB) ---------------------------------------------------
//
// The user supplied a timber cabin GLB. We use it as the visible body of
// every cabin and keep a small warm-glow point light + window-glow sprite
// out of band so the town reads at night even before the GLB resolves.

function makeCabin({ warmGlow = true } = {}) {
  const g = new THREE.Group();

  // Defer GLB attach.
  ModelLoader.ensure('timberCabin')
    .then(() => {
      const inst = ModelLoader.instantiate('timberCabin');
      if (!inst || !g.parent) return;
      inst.root.scale.setScalar(CABIN_SCALE);
      g.add(inst.root);
    })
    .catch((e) => console.warn('[Westwind] timberCabin failed', e));

  if (warmGlow) {
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getSoftCircleTexture(),
        color: 0xffaa55,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glow.position.set(0, 1.6, 0);
    glow.scale.set(2.6, 2.0, 1);
    g.add(glow);

    const light = new THREE.PointLight(0xffa040, 0.9, 14, 2);
    light.position.set(0, 1.6, 0);
    g.add(light);
    g.userData.windowLights = [{ pane: glow, light }];
  }

  return g;
}

// -- Well (GLB) -----------------------------------------------------------

function makeWell() {
  const g = new THREE.Group();
  ModelLoader.ensure('well')
    .then(() => {
      const inst = ModelLoader.instantiate('well');
      if (!inst || !g.parent) return;
      g.add(inst.root);
    })
    .catch(() => {});
  return g;
}

// -- Lantern post (GLB) ---------------------------------------------------

function makeLanternPost() {
  const g = new THREE.Group();

  // Warm light + glow sprite up high so the village reads at night before
  // the GLB resolves.
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 6),
    emissive(0xffc06a, 0xff9030, 2.6),
  );
  core.position.y = 3.0;
  g.add(core);

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
  glow.position.y = 3.0;
  glow.scale.set(1.4, 1.4, 1);
  g.add(glow);

  const light = new THREE.PointLight(0xffa040, 1.4, 18, 1.8);
  light.position.y = 3.0;
  g.add(light);

  ModelLoader.ensure('lanternTall')
    .then(() => {
      const inst = ModelLoader.instantiate('lanternTall');
      if (!inst || !g.parent) return;
      inst.root.scale.setScalar(LANTERN_SCALE);
      g.add(inst.root);
    })
    .catch(() => {});

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

    // Hamlet shell (GLB) — large, lazy-loaded; sits behind the cabins as the
    // village backdrop.
    const hamletAnchor = new THREE.Group();
    hamletAnchor.position.set(0, 0, 0);
    group.add(hamletAnchor);
    ModelLoader.ensure('hamlet')
      .then(() => {
        const inst = ModelLoader.instantiate('hamlet');
        if (!inst) return;
        inst.root.scale.setScalar(HAMLET_SCALE);
        hamletAnchor.add(inst.root);
      })
      .catch(() => {});

    // Amber-lantern cluster floating above the central path — wraps the
    // village in a warm halo at night.
    const amberAnchor = new THREE.Group();
    amberAnchor.position.set(0, 0, 0);
    group.add(amberAnchor);
    ModelLoader.ensure('amberLanterns')
      .then(() => {
        const inst = ModelLoader.instantiate('amberLanterns');
        if (!inst) return;
        inst.root.scale.setScalar(AMBER_SCALE);
        amberAnchor.add(inst.root);
      })
      .catch(() => {});

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

    // Chunk-register Westwind at its center so the village shows only when
    // the player is within LOAD_RADIUS.
    ChunkManager.register(group, CENTER.x, CENTER.z);

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

  update(time, playerPos) {
    if (!this.group?.visible) return;
    // Once the player is far south of Westwind, none of these animations are
    // visible — skip the per-tree/lantern/window work entirely.
    if (playerPos) {
      const dz = playerPos.z - CENTER.z;
      const dx = playerPos.x - CENTER.x;
      if (dx * dx + dz * dz > 260 * 260) return;
    }
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
