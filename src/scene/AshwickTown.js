import * as THREE from 'three';
import { ChunkManager } from '../game/ChunkManager.js';
import { Collision } from '../game/Collision.js';
import { SceneManager } from './SceneManager.js';
import { DayNight } from './DayNight.js';
import { ModelLoader } from './ModelLoader.js';
import { TownShells } from './TownShells.js';

/** World-space anchors for quest logic / NPCs (mill is town center). */
export const AshwickWorld = {
  MILL_X: 0,
  MILL_Z: -500,
  GRAVE_X: 80,
  GRAVE_Z: -500,
  PAGE_X: 82,
  PAGE_Z: -498,
  CAVE_X: 200,
  CAVE_Z: -500,
};

const VILLAGE_UPDATE_RANGE_SQ = 220 * 220;

function inAshwickRange(px, pz) {
  const dx = px - AshwickWorld.MILL_X;
  const dz = pz - AshwickWorld.MILL_Z;
  return dx * dx + dz * dz < VILLAGE_UPDATE_RANGE_SQ;
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

function registerBox(cx, cz, hw, hd) {
  Collision.registerBox(cx, cz, hw, hd);
}

/** @type {THREE.Object3D | null} */
let _graveMarker = null;
/** @type {THREE.Mesh | null} */
let _tornPage = null;
/** @type {THREE.Group | null} */
let _shrineGroup = null;
/** @type {THREE.Group | null} */
let _caveInterior = null;

export function getQuestMeshes() {
  return { grave: _graveMarker, page: _tornPage, shrine: _shrineGroup, caveRoot: _caveInterior };
}

/**
 * @param {THREE.Scene} scene
 * @param {object} reg VillageBuilder registry.ashwick — mutated in place.
 */
export function build(scene, reg) {
  reg.group?.removeFromParent?.();
  reg.millSpinning = true;
  reg.millPivot = null;
  reg.waterPivot = null;
  reg.embers = null;
  reg.emberVel = null;
  reg.smoke = null;
  reg.smokeVel = null;
  reg.windows = [];
  reg.hearth = null;
  reg.forge = null;
  reg.tavernWindowMeshes = [];
  reg.lanternLights = [];
  reg._townRoot = null;
  reg._graveRoot = null;
  reg._caveRoot = null;

  const townRoot = new THREE.Group();
  townRoot.position.set(0, 0, AshwickWorld.MILL_Z);
  scene.add(townRoot);
  reg.group = townRoot;
  reg._townRoot = townRoot;

  // Mill-town GLB shell — backdrop for the town. Streams in via the
  // 'town:ashwick' tier when the player approaches.
  // Push the GLB ~40u east of the road (which runs through x=0) so the town
  // sits beside the path instead of straddling it. Lift via bbox so its
  // lowest point lands at y=0, "even with the road."
  const millAnchor = new THREE.Group();
  millAnchor.position.set(40, 0, 0);
  townRoot.add(millAnchor);
  ModelLoader.ensure('townMill')
    .then(() => {
      const inst = ModelLoader.instantiate('townMill');
      if (!inst) return;
      millAnchor.add(inst.root);
      TownShells.register('ashwick', inst.root, 5); // scale first
      const bbox = new THREE.Box3().setFromObject(inst.root);
      if (isFinite(bbox.min.y)) inst.root.position.y = -bbox.min.y + 2;
    })
    .catch(() => {});

  // Procedural forge structure — low stone base with dark iron chimney.
  const forgeBase = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 1.4, 2.8),
    stdMat(0x2c2824, { roughness: 1 }),
  );
  forgeBase.position.set(-12, 0.7, -16.5);
  townRoot.add(forgeBase);
  const forgeChimney = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 2.6, 0.7),
    stdMat(0x1a1612, { roughness: 0.9 }),
  );
  forgeChimney.position.set(-12.3, 2.5, -16.5);
  townRoot.add(forgeChimney);

  // The procedural mill / tower / windmill blades / miller's house / tavern /
  // grain shed / six-cabin ring / fences / well / lantern posts that used to
  // build Ashwick from boxes are gone — `townMill` GLB is the town now.
  // Only the forge core flicker, atmospheric lights, and quest content remain.

  // Mill compound collider (the GLB still has a mill body; player shouldn't
  // walk through it).
  registerBox(0, AshwickWorld.MILL_Z, 3.2, 3.2);

  // Tower point-light — keeps the town glowing at night even before the GLB
  // texture self-illuminates.
  const towerLight = new THREE.PointLight(0xffb060, 1.5, 22, 2);
  towerLight.position.set(0, 7, 0);
  towerLight.castShadow = false;
  townRoot.add(towerLight);
  SceneManager.registerPointLight(towerLight);
  reg.lanternLights.push(towerLight);

  // Miller's house, tavern walls, blacksmith body, market stalls, grain shed,
  // six-cabin ring, well, fences, and procedural lantern posts removed —
  // `townMill` GLB now provides the buildings. We keep only:
  //   • the forge core flicker (animated emissive pulse for the smithy)
  //   • the forge point-light
  //   • collision boxes where the GLB shows solid structure
  //   • six warm point-lights spaced around the town for night atmosphere

  // Forge core (animated emissive — drives `reg.forge` flicker in update()).
  const forgeCore = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 1, 1.5),
    new THREE.MeshStandardMaterial({
      color: 0x4a2810,
      emissive: 0xff4400,
      emissiveIntensity: 2.2,
      roughness: 0.5,
    }),
  );
  forgeCore.position.set(-12, 0.85, -16.8);
  townRoot.add(forgeCore);
  const forgeLight = new THREE.PointLight(0xff6622, 2.2, 14, 2);
  forgeLight.position.set(-12, 1.4, -16.8);
  forgeLight.castShadow = false;
  townRoot.add(forgeLight);
  SceneManager.registerPointLight(forgeLight);
  reg.forge = { light: forgeLight, core: forgeCore };
  reg.lanternLights.push(forgeLight);

  // Collision footprints for the GLB's tavern, smithy, grain shed, and the
  // six-cabin ring around the mill — preserved so the player can't sprint
  // through walls now that the procedural meshes are gone.
  registerBox(-8, AshwickWorld.MILL_Z, 2.7, 2.7);                 // miller's house
  registerBox(10, AshwickWorld.MILL_Z - 10, 4.6, 3.6);             // tavern
  registerBox(-12, AshwickWorld.MILL_Z - 15, 3.1, 2.6);            // blacksmith
  registerBox(0, AshwickWorld.MILL_Z + 12, 3.6, 3.1);              // grain shed
  const _cabinAngles = [0.2, 1.1, 2.0, 3.35, 4.5, 5.4];
  const _cabinRs = [19, 22, 20, 24, 21, 23];
  for (let i = 0; i < 6; i++) {
    const cx = Math.cos(_cabinAngles[i]) * _cabinRs[i];
    const cz = Math.sin(_cabinAngles[i]) * _cabinRs[i];
    registerBox(cx, AshwickWorld.MILL_Z + cz, 2.1, 2.1);
  }
  registerBox(4, AshwickWorld.MILL_Z - 5, 1.35, 1.35);             // well

  // Six warm point-lights around the town centre for night atmosphere. The
  // GLB carries the visible lantern geometry; these are just lights.
  const lanternSpots = [[-7, -7], [7, -7], [-7, 7], [7, 7], [0, -12], [0, 12]];
  for (const [lx, lz] of lanternSpots) {
    const pl = new THREE.PointLight(0xffaa66, 1.2, 16, 2);
    pl.position.set(lx, 3.1, lz);
    pl.castShadow = false;
    townRoot.add(pl);
    SceneManager.registerPointLight(pl);
    reg.lanternLights.push(pl);
  }

  ChunkManager.register(townRoot, 0, AshwickWorld.MILL_Z);

  // --- Grave (separate chunk) ---
  const graveRoot = new THREE.Group();
  graveRoot.position.set(AshwickWorld.GRAVE_X, 0, AshwickWorld.GRAVE_Z);
  scene.add(graveRoot);
  reg._graveRoot = graveRoot;
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.15, 1.1),
    stdMat(0x4a4a4a, { roughness: 1 }),
  );
  slab.position.set(0, 0.08, 0);
  slab.receiveShadow = true;
  graveRoot.add(slab);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.4, 0.2), stdMat(0x3a3a3a));
  crossV.position.set(0, 0.85, 0);
  graveRoot.add(crossV);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.2), stdMat(0x3a3a3a));
  crossH.position.set(0, 1.25, 0);
  graveRoot.add(crossH);
  _graveMarker = graveRoot;

  // Tall grass patches (emissive for atmosphere)
  const grassMat = new THREE.MeshStandardMaterial({
    color: 0x2a4a1a,
    emissive: 0x1a3a0a,
    emissiveIntensity: 0.35,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  for (let g = 0; g < 14; g++) {
    const tuft = new THREE.Mesh(new THREE.PlaneGeometry(0.8 + Math.random() * 0.6, 1.2 + Math.random()), grassMat);
    const ga = Math.random() * Math.PI * 2;
    const gr = 2 + Math.random() * 5;
    tuft.position.set(Math.cos(ga) * gr, 0.4 + Math.random() * 0.2, Math.sin(ga) * gr);
    tuft.rotation.y = Math.random() * Math.PI;
    graveRoot.add(tuft);
  }
  registerBox(AshwickWorld.GRAVE_X, AshwickWorld.GRAVE_Z, 1.4, 0.7);
  ChunkManager.register(graveRoot, AshwickWorld.GRAVE_X, AshwickWorld.GRAVE_Z);

  // --- Torn page ---
  const pageCanvas = document.createElement('canvas');
  pageCanvas.width = 512;
  pageCanvas.height = 256;
  const pctx = pageCanvas.getContext('2d');
  pctx.fillStyle = '#d8c8a8';
  pctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
  pctx.fillStyle = '#2a1810';
  pctx.font = '22px Georgia, serif';
  const line = 'He went to the cave in the hills to the east. He said he heard it singing.';
  const words = line.split(' ');
  let lineY = 40;
  let buf = '';
  for (const w of words) {
    const test = buf ? `${buf} ${w}` : w;
    if (pctx.measureText(test).width > 480) {
      pctx.fillText(buf, 20, lineY);
      lineY += 28;
      buf = w;
    } else {
      buf = test;
    }
  }
  if (buf) pctx.fillText(buf, 20, lineY);

  const pageTex = new THREE.CanvasTexture(pageCanvas);
  const pageMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.75),
    new THREE.MeshStandardMaterial({ map: pageTex, side: THREE.DoubleSide, roughness: 0.9 }),
  );
  pageMesh.position.set(AshwickWorld.PAGE_X, 0.35, AshwickWorld.PAGE_Z);
  pageMesh.rotation.x = -Math.PI / 2 + 0.12;
  pageMesh.rotation.z = 0.15;
  scene.add(pageMesh);
  _tornPage = pageMesh;
  ChunkManager.register(pageMesh, AshwickWorld.PAGE_X, AshwickWorld.PAGE_Z);

  // --- Mini cave (quest only) ---
  const caveRoot = new THREE.Group();
  caveRoot.position.set(AshwickWorld.CAVE_X, 0, AshwickWorld.CAVE_Z);
  scene.add(caveRoot);
  reg._caveRoot = caveRoot;
  _caveInterior = caveRoot;

  const caveMat = stdMat(0x3a3530, { roughness: 1 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 10), caveMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.02, -4);
  floor.receiveShadow = true;
  caveRoot.add(floor);

  const wallT = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 0.4), caveMat);
  wallT.position.set(0, 2, -9);
  caveRoot.add(wallT);
  const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 10), caveMat);
  wallL.position.set(-6, 2, -4);
  caveRoot.add(wallL);
  const wallR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 10), caveMat);
  wallR.position.set(6, 2, -4);
  caveRoot.add(wallR);
  const wallBack = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 0.4), caveMat);
  wallBack.position.set(0, 2, 1);
  caveRoot.add(wallBack);

  registerBox(AshwickWorld.CAVE_X, AshwickWorld.CAVE_Z - 4, 6, 5);

  const shrine = new THREE.Group();
  shrine.position.set(0, 0, -5.5);
  caveRoot.add(shrine);
  for (let s = 0; s < 4; s++) {
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(0.9 - s * 0.12, 0.45, 0.7 - s * 0.08),
      stdMat(0x5a5a58),
    );
    b.position.set(0, 0.22 + s * 0.42, 0);
    b.castShadow = true;
    shrine.add(b);
  }
  const figurine = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.85, 0.25),
    stdMat(0x4a3018, { roughness: 0.85 }),
  );
  figurine.position.set(0, 2.05, 0);
  figurine.castShadow = true;
  shrine.add(figurine);
  _shrineGroup = shrine;

  const caveGlow = new THREE.PointLight(0xaaccff, 0.5, 12, 2);
  caveGlow.position.set(0, 2.5, -5);
  caveRoot.add(caveGlow);
  SceneManager.registerPointLight(caveGlow);
  reg.lanternLights.push(caveGlow);

  ChunkManager.register(caveRoot, AshwickWorld.CAVE_X, AshwickWorld.CAVE_Z);

  _regRef = reg;
}

/** Set by `build` — used for mill stop + update. */
let _regRef = null;

export function setMillWheelSpinning(spinning) {
  if (_regRef) _regRef.millSpinning = spinning !== false;
}

/**
 * Mill rotation, forge flicker, window flicker, tavern night emissive.
 * @param {number} time
 * @param {{ x: number, z: number }} playerPos
 * @param {object} reg registry.ashwick
 */
export function update(time, playerPos, reg) {
  _regRef = reg;
  if (!playerPos || !inAshwickRange(playerPos.x, playerPos.z)) return;

  if (reg.millPivot && reg.millSpinning) {
    reg.millPivot.rotation.z += 0.015;
  }

  for (const w of reg.windows || []) {
    if (w.material) {
      w.material.emissiveIntensity =
        1.6 + Math.sin(time * 2.2 + (w.id || 0) * 0.5) * 0.2 + (Math.random() - 0.5) * 0.08;
    }
  }

  if (reg.forge?.light && reg.forge.core) {
    const f = 0.88 + Math.sin(time * 9) * 0.1 + (Math.random() - 0.5) * 0.08;
    reg.forge.light.intensity = 2.2 * f;
    reg.forge.core.material.emissiveIntensity = 2.0 + f * 0.8;
  }

  const phase = DayNight.getCurrentPhase?.() || 'day';
  const nightish = phase === 'night' || (phase === 'sunset' && DayNight.getPhaseProgress?.() > 0.45);
  for (const tw of reg.tavernWindowMeshes || []) {
    if (tw.material) {
      tw.material.emissiveIntensity = nightish ? 0.55 + Math.sin(time * 1.7) * 0.08 : 0.12;
    }
  }
}
