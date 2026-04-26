import * as THREE from 'three';
import { ChunkManager } from '../game/ChunkManager.js';
import { Collision } from '../game/Collision.js';
import { SceneManager } from './SceneManager.js';
import { DayNight } from './DayNight.js';

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

function emissivePlane(hex, intensity, w, h) {
  const m = new THREE.MeshStandardMaterial({
    color: hex,
    emissive: hex,
    emissiveIntensity: intensity,
    roughness: 0.4,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.castShadow = false;
  return mesh;
}

function makeSignTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a1a0a';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#8a6a40';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, c.width - 20, c.height - 20);
  ctx.fillStyle = '#e8c878';
  ctx.font = 'bold 52px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
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

  const woodMill = stdMat(0x5c3a1e);
  const woodTower = stdMat(0x6b4423);
  const roofDark = stdMat(0x2c1a0a);
  const woodHouse = stdMat(0x5a3818);
  const woodTavern = stdMat(0x4a3010);
  const woodSmith = stdMat(0x3a2810);
  const woodGrain = stdMat(0x4a3818);

  // --- Mill (center of townRoot at origin) ---
  const millBody = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 6), woodMill);
  millBody.position.set(0, 2.5, 0);
  millBody.castShadow = true;
  millBody.receiveShadow = true;
  townRoot.add(millBody);
  registerBox(0, AshwickWorld.MILL_Z, 3.2, 3.2);

  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.6, 8, 12),
    woodTower,
  );
  tower.position.set(0, 6.5, 0);
  tower.castShadow = true;
  townRoot.add(tower);

  const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(2, 2, 12), roofDark);
  towerRoof.position.set(0, 11.2, 0);
  towerRoof.castShadow = true;
  townRoot.add(towerRoof);

  const pivot = new THREE.Object3D();
  pivot.position.set(0, 9.5, 1.35);
  townRoot.add(pivot);
  reg.millPivot = pivot;

  const bladeSparMat = stdMat(0x2a1a0d);
  const sailMat = stdMat(0xcab48a, { roughness: 0.9, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const wrap = new THREE.Object3D();
    wrap.rotation.z = (i * Math.PI) / 2;
    const spar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 4.2, 0.14), bladeSparMat);
    spar.position.y = 2.3;
    spar.castShadow = true;
    wrap.add(spar);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 3.2), sailMat);
    sail.position.set(-0.48, 2.4, 0.08);
    sail.rotation.y = Math.PI / 2;
    sail.castShadow = true;
    wrap.add(sail);
    for (let j = 0; j < 4; j++) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.05, 0.05), bladeSparMat);
      strut.position.set(-0.4, 1.2 + j * 0.75, 0);
      wrap.add(strut);
    }
    pivot.add(wrap);
  }
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.4, 12),
    stdMat(0x1a0f06, { metalness: 0.4, roughness: 0.4 }),
  );
  hub.rotation.x = Math.PI / 2;
  pivot.add(hub);

  // Tower glow + light (child of town — chunked)
  const glowHex = 0xffaa66;
  const win1 = emissivePlane(glowHex, 1.6, 0.5, 0.7);
  win1.position.set(1.35, 5.5, 0.81);
  win1.rotation.y = -Math.PI / 2;
  townRoot.add(win1);
  reg.windows.push({ material: win1.material, id: 0 });

  const win2 = emissivePlane(glowHex, 1.4, 0.45, 0.65);
  win2.position.set(-1.35, 4.2, 0.81);
  win2.rotation.y = Math.PI / 2;
  townRoot.add(win2);
  reg.windows.push({ material: win2.material, id: 1 });

  const towerLight = new THREE.PointLight(0xffb060, 1.5, 22, 2);
  towerLight.position.set(0, 7, 0);
  towerLight.castShadow = false;
  townRoot.add(towerLight);
  SceneManager.registerPointLight(towerLight);
  reg.lanternLights.push(towerLight);

  // Mill compound collider (tower + blades clearance)
  registerBox(0, AshwickWorld.MILL_Z, 2.2, 2.2);

  // --- Miller's house (-8, 0, 0 local) ---
  const mh = new THREE.Mesh(new THREE.BoxGeometry(5, 3.5, 5), woodHouse);
  mh.position.set(-8, 1.75, 0);
  mh.castShadow = true;
  mh.receiveShadow = true;
  townRoot.add(mh);
  const mhRoofL = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.25, 3.8), roofDark);
  mhRoofL.position.set(-8, 3.55, -0.35);
  mhRoofL.rotation.z = 0.38;
  mhRoofL.castShadow = true;
  townRoot.add(mhRoofL);
  const mhRoofR = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.25, 3.8), roofDark);
  mhRoofR.position.set(-8, 3.55, 0.35);
  mhRoofR.rotation.z = -0.38;
  mhRoofR.castShadow = true;
  townRoot.add(mhRoofR);
  const mhDoor = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.8, 0.08),
    stdMat(0x2a1808),
  );
  mhDoor.position.set(-8, 0.95, 2.52);
  townRoot.add(mhDoor);
  const mhW = emissivePlane(glowHex, 1.2, 0.4, 0.55);
  mhW.position.set(-6.55, 1.9, 2.52);
  townRoot.add(mhW);
  reg.windows.push({ material: mhW.material, id: 2 });
  registerBox(-8, AshwickWorld.MILL_Z, 2.7, 2.7);

  // --- Tavern (10, 0, -10 local) world (10, -510) ---
  const tavern = new THREE.Mesh(new THREE.BoxGeometry(9, 4.5, 7), woodTavern);
  tavern.position.set(10, 2.25, -10);
  tavern.castShadow = true;
  tavern.receiveShadow = true;
  townRoot.add(tavern);
  registerBox(10, AshwickWorld.MILL_Z - 10, 4.6, 3.6);

  const signTex = makeSignTexture('The Amber Cup');
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 1),
    new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.85, side: THREE.DoubleSide }),
  );
  sign.position.set(10, 3.6, -13.51);
  sign.rotation.y = Math.PI;
  townRoot.add(sign);

  for (let i = 0; i < 3; i++) {
    const tw = emissivePlane(0xffcc88, 0.35, 0.55, 0.75);
    tw.position.set(7.2 + i * 1.4, 2.2, -13.51);
    tw.rotation.y = Math.PI;
    townRoot.add(tw);
    reg.tavernWindowMeshes.push(tw);
  }
  const lanternMat = stdMat(0xffaa44, { emissive: 0xff6600, emissiveIntensity: 0.6 });
  const lL = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), lanternMat);
  lL.position.set(8.35, 1.15, -13.35);
  townRoot.add(lL);
  const lR = lL.clone();
  lR.position.set(11.65, 1.15, -13.35);
  townRoot.add(lR);
  const lLg = new THREE.PointLight(0xff9944, 0.9, 10, 2);
  lLg.position.set(8.35, 1.15, -13.35);
  townRoot.add(lLg);
  SceneManager.registerPointLight(lLg);
  reg.lanternLights.push(lLg);
  const lRg = new THREE.PointLight(0xff9944, 0.9, 10, 2);
  lRg.position.set(11.65, 1.15, -13.35);
  townRoot.add(lRg);
  SceneManager.registerPointLight(lRg);
  reg.lanternLights.push(lRg);

  // --- Blacksmith (-12, 0, -15 local) ---
  const smith = new THREE.Mesh(new THREE.BoxGeometry(6, 3.5, 5), woodSmith);
  smith.position.set(-12, 1.75, -15);
  smith.castShadow = true;
  townRoot.add(smith);
  // Open front: omit south face visually — use 3 walls as thin boxes
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

  const anvilPost = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.9, 8), stdMat(0x1a1008));
  anvilPost.position.set(-10.5, 0.45, -16.5);
  townRoot.add(anvilPost);
  const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.2, 0.55), stdMat(0x1a1a1a, { metalness: 0.6, roughness: 0.35 }));
  anvil.position.set(-10.5, 1.0, -16.5);
  anvil.castShadow = true;
  townRoot.add(anvil);

  registerBox(-12, AshwickWorld.MILL_Z - 15, 3.1, 2.6);

  // --- Market stalls (6) z local +10 -> world -490 ---
  const clothColors = [0x4a1e3a, 0x1e3a4a, 0x3a3a1e, 0x2a3a1e, 0x3a1e1e, 0x1e2a3a];
  const stallXs = [-12, -8, -4, 0, 4, 8];
  for (let i = 0; i < 6; i++) {
    const sx = stallXs[i];
    const sz = 10;
    const poleMat = stdMat(0x3a2810);
    for (const [px, pz] of [
      [-0.55, -0.45],
      [0.55, -0.45],
      [-0.55, 0.45],
      [0.55, 0.45],
    ]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.6, 6), poleMat);
      pole.position.set(sx + px, 0.8, sz + pz);
      townRoot.add(pole);
    }
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.08, 1.1),
      stdMat(0x3a3020),
    );
    roof.position.set(sx, 1.65, sz);
    roof.castShadow = true;
    townRoot.add(roof);
    const drape = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 0.9),
      new THREE.MeshStandardMaterial({
        color: clothColors[i],
        side: THREE.DoubleSide,
        roughness: 0.95,
      }),
    );
    drape.position.set(sx, 1.05, sz + 0.56);
    townRoot.add(drape);
    registerBox(sx, AshwickWorld.MILL_Z + sz, 0.75, 0.65);
  }

  // --- Grain storehouse (0, 12 local) -> -488 ---
  const grain = new THREE.Mesh(new THREE.BoxGeometry(7, 4, 6), woodGrain);
  grain.position.set(0, 2, 12);
  grain.castShadow = true;
  townRoot.add(grain);
  const doorL = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 0.1), stdMat(0x2a1a0a));
  doorL.position.set(-0.65, 1.35, 15.01);
  doorL.rotation.y = 0.25;
  townRoot.add(doorL);
  const doorR = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 0.1), stdMat(0x2a1a0a));
  doorR.position.set(0.65, 1.35, 15.01);
  doorR.rotation.y = -0.25;
  townRoot.add(doorR);
  registerBox(0, AshwickWorld.MILL_Z + 12, 3.6, 3.1);

  // --- Six cabins (ring) ---
  const cabinAngles = [0.2, 1.1, 2.0, 3.35, 4.5, 5.4];
  const cabinRs = [19, 22, 20, 24, 21, 23];
  for (let i = 0; i < 6; i++) {
    const r = cabinRs[i];
    const a = cabinAngles[i];
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const cabinWoods = [0x4a3218, 0x523218, 0x4a3818, 0x443018, 0x4e3418, 0x3a2818];
    const cbody = new THREE.Mesh(
      new THREE.BoxGeometry(4, 2.8, 4),
      stdMat(cabinWoods[i]),
    );
    cbody.position.set(cx, 1.4, cz);
    cbody.castShadow = true;
    townRoot.add(cbody);
    const croof = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.2, 3.2), roofDark);
    croof.position.set(cx, 2.85, cz);
    croof.rotation.y = a * 0.3;
    croof.castShadow = true;
    townRoot.add(croof);
    const wz = cz + Math.sin(a) * 2.02;
    const wx = cx + Math.cos(a) * 2.02;
    const cw = emissivePlane(glowHex, 0.9, 0.35, 0.45);
    cw.position.set(wx * 0.92 + cx * 0.08, 1.5, wz * 0.92 + cz * 0.08);
    cw.lookAt(cx * 2, 1.5, cz * 2);
    townRoot.add(cw);
    reg.windows.push({ material: cw.material, id: 10 + i });
    const wWorldX = cx;
    const wWorldZ = AshwickWorld.MILL_Z + cz;
    registerBox(wWorldX, wWorldZ, 2.1, 2.1);
  }

  // --- Well (4, -5 local) ---
  const wellR = 1.1;
  const wellMat = stdMat(0x4a4038);
  wellMat.side = THREE.DoubleSide;
  const wellWall = new THREE.Mesh(
    new THREE.CylinderGeometry(wellR, wellR + 0.08, 0.85, 14, 1, true),
    wellMat,
  );
  wellWall.position.set(4, 0.42, -5);
  wellWall.castShadow = true;
  townRoot.add(wellWall);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.12), stdMat(0x5a3a1a));
  beam.position.set(4, 1.05, -5);
  beam.castShadow = true;
  townRoot.add(beam);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), stdMat(0x2a2a2a, { metalness: 0.5 }));
  chain.position.set(4.55, 0.55, -5);
  townRoot.add(chain);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.35, 8), stdMat(0x5a3a1a));
  bucket.position.set(4.55, 0.1, -5);
  townRoot.add(bucket);
  registerBox(4, AshwickWorld.MILL_Z - 5, 1.35, 1.35);

  // --- Fencing (low segments) + colliders ---
  const fenceSegs = [
    [-14, -8, -10, -2],
    [6, -8, 12, -2],
    [-6, 8, 6, 14],
    [12, -18, 16, -12],
  ];
  const fenceY = 0.35;
  const fenceH = 0.55;
  for (const [x0, z0, x1, z1] of fenceSegs) {
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const ang = Math.atan2(dz, dx);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, fenceH, 0.12), stdMat(0x3a2810));
    rail.position.set(mx, fenceY, mz);
    rail.rotation.y = -ang;
    townRoot.add(rail);
    const wcx = mx;
    const wcz = AshwickWorld.MILL_Z + mz;
    registerBox(wcx, wcz, len * 0.5 + 0.06, 0.2);
  }

  // --- Dirt paths (dark planes) ---
  const pathMat = new THREE.MeshStandardMaterial({
    color: 0x3a2a18,
    roughness: 1,
    metalness: 0,
  });
  const path1 = new THREE.Mesh(new THREE.PlaneGeometry(8, 40), pathMat);
  path1.rotation.x = -Math.PI / 2;
  path1.position.set(0, 0.02, 0);
  townRoot.add(path1);
  const path2 = new THREE.Mesh(new THREE.PlaneGeometry(26, 6), pathMat);
  path2.rotation.x = -Math.PI / 2;
  path2.position.set(-2, 0.021, -8);
  townRoot.add(path2);

  // --- Six lantern posts (square around center) — lights parented to scene for height ---
  const lanternPosts = [
    [-7, -7],
    [7, -7],
    [-7, 7],
    [7, 7],
    [0, -12],
    [0, 12],
  ];
  const postGeo = new THREE.CylinderGeometry(0.1, 0.12, 3.2, 8);
  const postMat = stdMat(0x2a1a0a);
  for (const [lx, lz] of lanternPosts) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(lx, 1.6, lz);
    post.castShadow = true;
    townRoot.add(post);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 10, 10),
      stdMat(0xffaa66, { emissive: 0xff8844, emissiveIntensity: 0.8 }),
    );
    bulb.position.set(lx, 3.1, lz);
    townRoot.add(bulb);
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
