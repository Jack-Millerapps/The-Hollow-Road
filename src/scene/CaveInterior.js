import * as THREE from 'three';
import { state, notify } from '../state.js';
import { caves, CURRENCY_COLORS } from '../data/caves.js';
import { SceneManager } from './SceneManager.js';
import { Collision } from '../game/Collision.js';
import { QuestSystem } from '../game/QuestSystem.js';

// ---------------------------------------------------------------------------
// Phase 3 — Cave interiors.
//
// Each cave is built as a single self-contained THREE.Group positioned at a
// far offset in the main scene (one group per cave). Only the active cave's
// group is `visible`; everything else (world, westwind, cabin, other caves)
// is hidden by main.js on entry. Caves are built lazily on first entry and
// cached thereafter.
//
// Layout per cave (cave-local XZ, before applying cave origin):
//
//   entry  ( 0,   0)                ← player spawn + exit portal
//       │
//       ▼
//   mine1  ( 0, +20)
//       │
//       ▼
//   mine2  ( 0, +40) ──── alcove (-18, +40)   (sleeping rest)
//       │
//       ▼
//   troll  ( 0, +62)
// ---------------------------------------------------------------------------

const ROOM_SIZE = 12;
const ROOM_HEIGHT = 4;
const TUNNEL_WIDTH = 3;
const WALL_THICKNESS = 0.5;

const CAVE_FOG_COLOR = 0x2a0a08;
const CAVE_FOG_DENSITY = 0.08;
const CAVE_AMBIENT_COLOR = 0x3a1810;
const CAVE_AMBIENT_INTENSITY = 0.2;

// Cave-origin spacing so multiple caves can exist simultaneously in the
// same THREE.Scene without their geometry overlapping.
function caveOrigin(caveIndex) {
  return new THREE.Vector3(2000 + caveIndex * 400, 0, 2000);
}

// ---------------------------------------------------------------------------
// Seeded RNG — reproducible per cave.
// ---------------------------------------------------------------------------

function seedRng(seed) {
  let s = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    s ^= seed.charCodeAt(i);
    s = Math.imul(s, 16777619) >>> 0;
  }
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507) >>> 0;
    s = Math.imul(s ^ (s >>> 13), 3266489909) >>> 0;
    return ((s ^ (s >>> 16)) >>> 0) / 0xffffffff;
  };
}

// ---------------------------------------------------------------------------
// Shared materials
// ---------------------------------------------------------------------------

function caveMaterials() {
  return {
    stone: new THREE.MeshStandardMaterial({
      color: 0x35241a,
      roughness: 0.98,
      metalness: 0.0,
      flatShading: true,
    }),
    floor: new THREE.MeshStandardMaterial({
      color: 0x241712,
      roughness: 1.0,
      flatShading: true,
    }),
    ceiling: new THREE.MeshStandardMaterial({
      color: 0x1b110a,
      roughness: 1.0,
    }),
    debris: new THREE.MeshStandardMaterial({
      color: 0x3a2818,
      roughness: 0.95,
      flatShading: true,
    }),
    bed: new THREE.MeshStandardMaterial({
      color: 0x3a2a20,
      roughness: 0.85,
      flatShading: true,
    }),
    bedding: new THREE.MeshStandardMaterial({
      color: 0x6a4832,
      roughness: 0.9,
    }),
    seat: new THREE.MeshStandardMaterial({
      color: 0x2a2218,
      roughness: 1.0,
      flatShading: true,
    }),
  };
}

// ---------------------------------------------------------------------------
// Room and tunnel geometry.
// ---------------------------------------------------------------------------

function buildFloor(group, cx, cz, w, d, mat) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  floor.receiveShadow = true;
  group.add(floor);
}

function buildCeiling(group, cx, cz, w, d, mat) {
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(cx, ROOM_HEIGHT, cz);
  group.add(ceiling);
}

// A wall panel with an optional centered gap (for tunnel openings).
function buildWallPanel(group, params, mat, walls) {
  const { cx, cz, length, axis, gap } = params;
  if (!gap) {
    buildWallSegment(group, cx, cz, length, axis, mat, walls);
    return;
  }
  const halfGap = gap / 2;
  const segLen = (length - gap) / 2;
  if (segLen <= 0.01) return;
  if (axis === 'x') {
    buildWallSegment(group, cx - (halfGap + segLen / 2), cz, segLen, axis, mat, walls);
    buildWallSegment(group, cx + (halfGap + segLen / 2), cz, segLen, axis, mat, walls);
  } else {
    buildWallSegment(group, cx, cz - (halfGap + segLen / 2), segLen, axis, mat, walls);
    buildWallSegment(group, cx, cz + (halfGap + segLen / 2), segLen, axis, mat, walls);
  }
}

function buildWallSegment(group, cx, cz, length, axis, mat, walls) {
  const w = axis === 'x' ? length : WALL_THICKNESS;
  const d = axis === 'x' ? WALL_THICKNESS : length;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, ROOM_HEIGHT, d),
    mat,
  );
  mesh.position.set(cx, ROOM_HEIGHT / 2, cz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const axisScale = 0.92 + ((Math.sin(cx * 7.3 + cz * 1.9) + 1) * 0.5) * 0.22;
  mesh.scale.y = axisScale;
  mesh.position.y = (ROOM_HEIGHT * axisScale) / 2;
  group.add(mesh);
  // Record cave-local box-collider footprint (Fix 6).
  if (walls) {
    walls.push({ cx, cz, hw: w / 2, hd: d / 2 });
  }
}

// Describe which sides of a room are open (tunnels). openSides: {n,s,e,w}.
function buildRoom(group, room, materials, rng, walls) {
  const { cx, cz, w, d, openSides } = room;
  buildFloor(group, cx, cz, w, d, materials.floor);
  buildCeiling(group, cx, cz, w, d, materials.ceiling);

  const gap = TUNNEL_WIDTH;
  // North wall (z = cz - d/2)
  buildWallPanel(
    group,
    { cx, cz: cz - d / 2, length: w, axis: 'x', gap: openSides.n ? gap : 0 },
    materials.stone,
    walls,
  );
  // South wall
  buildWallPanel(
    group,
    { cx, cz: cz + d / 2, length: w, axis: 'x', gap: openSides.s ? gap : 0 },
    materials.stone,
    walls,
  );
  // West wall
  buildWallPanel(
    group,
    { cx: cx - w / 2, cz, length: d, axis: 'z', gap: openSides.w ? gap : 0 },
    materials.stone,
    walls,
  );
  // East wall
  buildWallPanel(
    group,
    { cx: cx + w / 2, cz, length: d, axis: 'z', gap: openSides.e ? gap : 0 },
    materials.stone,
    walls,
  );

  // Debris — small rough boulders scattered on the floor for flavor.
  const debrisCount = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < debrisCount; i++) {
    const px = cx + (rng() - 0.5) * (w - 3);
    const pz = cz + (rng() - 0.5) * (d - 3);
    const sx = 0.3 + rng() * 0.7;
    const sy = 0.2 + rng() * 0.5;
    const sz = 0.3 + rng() * 0.7;
    const boulder = new THREE.Mesh(
      new THREE.BoxGeometry(sx, sy, sz),
      materials.debris,
    );
    boulder.position.set(px, sy / 2, pz);
    boulder.rotation.y = rng() * Math.PI * 2;
    boulder.castShadow = true;
    boulder.receiveShadow = true;
    group.add(boulder);
  }

  // Dim amber point light at the room center.
  const light = new THREE.PointLight(0xff9a48, 1.0, 18, 1.6);
  light.position.set(cx, ROOM_HEIGHT - 0.4, cz);
  group.add(light);
}

// Tunnel connecting two room centers. We pick axis-aligned tunnels only, so
// callers must make sure rooms align on either x or z.
function buildTunnel(group, from, to, materials, walls) {
  const w = Math.abs(from.cx - to.cx);
  const d = Math.abs(from.cz - to.cz);
  const midX = (from.cx + to.cx) / 2;
  const midZ = (from.cz + to.cz) / 2;
  const axis = w > d ? 'x' : 'z';
  const length =
    axis === 'x'
      ? Math.abs(from.cx - to.cx) - (from.w / 2 + to.w / 2)
      : Math.abs(from.cz - to.cz) - (from.d / 2 + to.d / 2);
  if (length <= 0.1) return;

  if (axis === 'x') {
    buildFloor(group, midX, midZ, length, TUNNEL_WIDTH, materials.floor);
    buildCeiling(group, midX, midZ, length, TUNNEL_WIDTH, materials.ceiling);
    buildWallSegment(group, midX, midZ - TUNNEL_WIDTH / 2, length, 'x', materials.stone, walls);
    buildWallSegment(group, midX, midZ + TUNNEL_WIDTH / 2, length, 'x', materials.stone, walls);
  } else {
    buildFloor(group, midX, midZ, TUNNEL_WIDTH, length, materials.floor);
    buildCeiling(group, midX, midZ, TUNNEL_WIDTH, length, materials.ceiling);
    buildWallSegment(group, midX - TUNNEL_WIDTH / 2, midZ, length, 'z', materials.stone, walls);
    buildWallSegment(group, midX + TUNNEL_WIDTH / 2, midZ, length, 'z', materials.stone, walls);
  }
}

// ---------------------------------------------------------------------------
// Cave layout — a fixed floor plan applied per cave, then populated.
// ---------------------------------------------------------------------------

function makeRooms() {
  return {
    entry: { name: 'entry', cx: 0, cz: 0, w: ROOM_SIZE, d: ROOM_SIZE,
      openSides: { n: false, s: true, e: false, w: false } },
    mine1: { name: 'mine1', cx: 0, cz: 20, w: ROOM_SIZE, d: ROOM_SIZE,
      openSides: { n: true, s: true, e: false, w: false } },
    mine2: { name: 'mine2', cx: 0, cz: 40, w: ROOM_SIZE, d: ROOM_SIZE,
      openSides: { n: true, s: true, e: false, w: true } },
    alcove: { name: 'alcove', cx: -18, cz: 40, w: ROOM_SIZE, d: ROOM_SIZE,
      openSides: { n: false, s: false, e: true, w: false } },
    troll: { name: 'troll', cx: 0, cz: 62, w: ROOM_SIZE, d: ROOM_SIZE,
      openSides: { n: true, s: false, e: false, w: false } },
  };
}

// ---------------------------------------------------------------------------
// Per-cave contents: ore nodes, alcove bed, troll, exit portal.
// ---------------------------------------------------------------------------

function buildOreNode(group, cave, cx, cy, cz, nodeId, materials) {
  const color = CURRENCY_COLORS[cave.currency] || 0xffaa55;
  const oreGroup = new THREE.Group();
  oreGroup.position.set(cx, cy, cz);
  // Host stone slab.
  const stone = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.9, 0.5),
    materials.stone,
  );
  oreGroup.add(stone);
  // Glowing crystal cluster.
  const crystal = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.28, 0),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.3,
      roughness: 0.5,
    }),
  );
  crystal.position.z = 0.28;
  oreGroup.add(crystal);
  const crystal2 = crystal.clone();
  crystal2.material = crystal.material.clone();
  crystal2.scale.setScalar(0.6);
  crystal2.position.set(0.18, 0.12, 0.3);
  oreGroup.add(crystal2);

  oreGroup.userData.nodeId = nodeId;
  oreGroup.userData.cave = cave;
  oreGroup.userData.crystals = [crystal, crystal2];
  oreGroup.userData.depleted = false;

  group.add(oreGroup);
  return oreGroup;
}

function buildAlcoveBed(group, room, materials) {
  const cx = room.cx;
  const cz = room.cz;
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.5, 1.3),
    materials.bed,
  );
  base.position.set(cx, 0.25, cz - 2);
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.18, 1.1),
    materials.bedding,
  );
  pad.position.set(cx, 0.6, cz - 2);
  group.add(pad);
  // Warm rest lantern overhead.
  const lantern = new THREE.PointLight(0xffb070, 0.7, 6, 2.2);
  lantern.position.set(cx, 3.0, cz - 2);
  group.add(lantern);
  return { x: cx, z: cz - 2 };
}

function buildTroll(group, cave, room, materials) {
  const cx = room.cx;
  // Push troll against the north wall and face him south toward the player.
  const cz = room.cz + room.d / 2 - 3.5;
  const trollGroup = new THREE.Group();
  trollGroup.position.set(cx, 0, cz);
  trollGroup.rotation.y = Math.PI;

  // Stone seat.
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.6, 1.8),
    materials.seat,
  );
  seat.position.set(0, 0.3, 0);
  seat.castShadow = true;
  seat.receiveShadow = true;
  trollGroup.add(seat);
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 2.4, 0.4),
    materials.seat,
  );
  back.position.set(0, 1.5, -0.8);
  trollGroup.add(back);

  // Body — hunched, 2.5x player scale.
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0x4a5a38,
    roughness: 0.95,
    flatShading: true,
  });
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.1, 1.8, 10),
    skinMat,
  );
  torso.position.y = 1.55;
  torso.rotation.z = 0.08;
  torso.castShadow = true;
  trollGroup.add(torso);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 14, 12),
    skinMat,
  );
  head.position.set(0.1, 2.7, 0.2);
  head.castShadow = true;
  trollGroup.add(head);

  const jaw = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.3, 0.6),
    skinMat,
  );
  jaw.position.set(0.1, 2.4, 0.5);
  trollGroup.add(jaw);

  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xffb040,
    emissive: 0xffa030,
    emissiveIntensity: 1.6,
    roughness: 0.4,
  });
  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), eyeMat);
  leftEye.position.set(-0.2, 2.8, 0.72);
  trollGroup.add(leftEye);
  const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), eyeMat);
  rightEye.position.set(0.2, 2.78, 0.72);
  trollGroup.add(rightEye);

  const armMat = skinMat;
  const leftArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.25, 1.5, 8),
    armMat,
  );
  leftArm.position.set(-0.95, 1.75, 0.4);
  leftArm.rotation.z = 0.55;
  trollGroup.add(leftArm);
  const rightArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.25, 1.5, 8),
    armMat,
  );
  rightArm.position.set(0.95, 1.75, 0.4);
  rightArm.rotation.z = -0.55;
  trollGroup.add(rightArm);

  // Pouch.
  const pouch = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.6, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x241812, roughness: 0.95 }),
  );
  pouch.position.set(0.6, 1.1, 0.6);
  pouch.rotation.y = -0.3;
  trollGroup.add(pouch);

  // Warm glow from the troll.
  const glow = new THREE.PointLight(0xff9848, 0.7, 8, 2.0);
  glow.position.set(0, 2.6, 0.5);
  trollGroup.add(glow);

  trollGroup.userData.cave = cave;
  trollGroup.userData.worldPos = new THREE.Vector3(cx, 0, cz);
  group.add(trollGroup);
  return trollGroup;
}

function buildExitPortal(group, room, materials) {
  // A glowing arch at the north wall of the entry room.
  const cx = room.cx;
  const cz = room.cz - room.d / 2 + 0.1; // just inside the north wall
  const arch = new THREE.Group();
  arch.position.set(cx, 0, cz);

  const leftStone = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 3.2, 0.9),
    materials.stone,
  );
  leftStone.position.set(-1.4, 1.6, 0);
  arch.add(leftStone);
  const rightStone = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 3.2, 0.9),
    materials.stone,
  );
  rightStone.position.set(1.4, 1.6, 0);
  arch.add(rightStone);
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.7, 0.9),
    materials.stone,
  );
  top.position.set(0, 3.2, 0);
  arch.add(top);

  // Daylight-looking panel to suggest the world beyond.
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.8),
    new THREE.MeshBasicMaterial({ color: 0x3a2a1a, side: THREE.DoubleSide }),
  );
  panel.position.set(0, 1.6, -0.05);
  arch.add(panel);

  const glow = new THREE.PointLight(0xffc080, 0.9, 8, 2.0);
  glow.position.set(0, 2.2, 0.4);
  arch.add(glow);

  group.add(arch);
  return { x: cx, z: cz };
}

// Ashwick quest — stone stack + carving in the alcove (same props as the old
// overworld fake cave; now lives inside The Ash Hollow interior).
function buildAshwickQuestShrine(group, rooms, materials) {
  const alc = rooms.alcove;
  const shrine = new THREE.Group();
  shrine.name = 'ashwickQuestShrine';
  shrine.position.set(alc.cx + 0.35, 0, alc.cz - 2.35);
  for (let s = 0; s < 4; s++) {
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(0.9 - s * 0.12, 0.45, 0.7 - s * 0.08),
      materials.stone,
    );
    b.position.set(0, 0.22 + s * 0.42, 0);
    b.castShadow = true;
    shrine.add(b);
  }
  const figurine = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.85, 0.25),
    new THREE.MeshStandardMaterial({
      color: 0x4a3018,
      roughness: 0.85,
      flatShading: true,
    }),
  );
  figurine.position.set(0, 2.05, 0);
  figurine.castShadow = true;
  shrine.add(figurine);
  const gl = new THREE.PointLight(0xaaccff, 0.55, 9, 2);
  gl.position.set(0.45, 2.95, 0.05);
  shrine.add(gl);
  group.add(shrine);
  return { x: shrine.position.x, z: shrine.position.z, r: 3.6 };
}

// ---------------------------------------------------------------------------
// Build one cave (cached).
// ---------------------------------------------------------------------------

function buildCave(cave, caveIndex) {
  const origin = caveOrigin(caveIndex);
  const materials = caveMaterials();
  const rng = seedRng(cave.id);

  const group = new THREE.Group();
  group.name = `caveInterior:${cave.id}`;
  group.position.copy(origin);
  group.visible = false;

  const rooms = makeRooms();

  // walls: list of cave-local box-collider footprints {cx, cz, hw, hd}
  // populated by buildWallSegment (Fix 6).
  const walls = [];
  buildRoom(group, rooms.entry, materials, rng, walls);
  buildRoom(group, rooms.mine1, materials, rng, walls);
  buildRoom(group, rooms.mine2, materials, rng, walls);
  buildRoom(group, rooms.alcove, materials, rng, walls);
  buildRoom(group, rooms.troll, materials, rng, walls);

  buildTunnel(group, rooms.entry, rooms.mine1, materials, walls);
  buildTunnel(group, rooms.mine1, rooms.mine2, materials, walls);
  buildTunnel(group, rooms.mine2, rooms.alcove, materials, walls);
  buildTunnel(group, rooms.mine2, rooms.troll, materials, walls);

  // Ore nodes — 4-6 per cave, distributed across mine1 and mine2.
  const totalNodes = 4 + Math.floor(rng() * 3); // 4..6
  const oreNodes = [];
  const mineRooms = [rooms.mine1, rooms.mine2];
  const candidateWalls = [
    // For each mine room, legal wall-embedded positions (against the east
    // and west walls since those are solid in both mine rooms).
    (room) => ({ x: room.cx - room.w / 2 + 0.3, z: room.cz + (rng() - 0.5) * (room.d - 2.5) }),
    (room) => ({ x: room.cx + room.w / 2 - 0.3, z: room.cz + (rng() - 0.5) * (room.d - 2.5) }),
  ];
  for (let i = 0; i < totalNodes; i++) {
    const room = mineRooms[i % mineRooms.length];
    const pick = candidateWalls[Math.floor(rng() * candidateWalls.length)];
    const pos = pick(room);
    const nodeId = `${cave.id}:ore:${i}`;
    const ore = buildOreNode(
      group,
      cave,
      pos.x,
      0.9 + rng() * 0.6,
      pos.z,
      nodeId,
      materials,
    );
    oreNodes.push(ore);
  }

  const bedPos = buildAlcoveBed(group, rooms.alcove, materials);
  const troll = buildTroll(group, cave, rooms.troll, materials);
  const exitPortal = buildExitPortal(group, rooms.entry, materials);

  let ashwickShrineLocal = null;
  if (cave.id === 'ashCave') {
    ashwickShrineLocal = buildAshwickQuestShrine(group, rooms, materials);
  }

  // A single slightly brighter torch-pair flanking the entry room interior
  // so first sight on spawn is inviting.
  for (const side of [-1, 1]) {
    const torchLight = new THREE.PointLight(0xffb070, 1.3, 8, 2.0);
    torchLight.position.set(side * 2.5, 2.6, -1.5);
    group.add(torchLight);
  }

  return {
    group,
    origin,
    rooms,
    oreNodes,
    bedPos,
    troll,
    exitPortal,
    walls, // cave-local box footprints for collider registration (Fix 6)
    activeColliders: [], // populated when this cave is active
    spawnLocal: { x: rooms.entry.cx, z: rooms.entry.cz + 1.5, rotationY: Math.PI },
    compassLocal: { x: rooms.troll.cx, z: rooms.troll.cz },
    floorY: 0, // cave floor height — flat for now
    ashwickShrineLocal,
  };
}

// ---------------------------------------------------------------------------
// Cave HUD compass
// ---------------------------------------------------------------------------

function buildCompassDOM() {
  const el = document.createElement('div');
  el.className = 'cave-compass';
  el.style.cssText = [
    'position: fixed',
    'top: 140px',
    'right: 24px',
    'width: 56px',
    'height: 56px',
    'border-radius: 50%',
    'background: rgba(12, 6, 4, 0.8)',
    'border: 1px solid #5a2818',
    'display: flex',
    'align-items: center',
    'justify-content: center',
    'z-index: 20',
    'opacity: 0',
    'transition: opacity 0.3s ease',
    'pointer-events: none',
  ].join(';');
  const arrow = document.createElement('div');
  arrow.style.cssText = [
    'width: 0',
    'height: 0',
    'border-left: 10px solid transparent',
    'border-right: 10px solid transparent',
    'border-bottom: 22px solid #ff8a3a',
    'transform-origin: 50% 70%',
    'filter: drop-shadow(0 0 4px rgba(255, 120, 60, 0.7))',
  ].join(';');
  el.appendChild(arrow);
  const label = document.createElement('div');
  label.textContent = 'troll';
  label.style.cssText = [
    'position: absolute',
    'bottom: -18px',
    'left: 50%',
    'transform: translateX(-50%)',
    'font: 10px Georgia, serif',
    'font-variant: small-caps',
    'letter-spacing: 0.2em',
    'color: #8a5838',
  ].join(';');
  el.appendChild(label);
  document.body.appendChild(el);
  return { el, arrow };
}

function buildExitPromptDOM() {
  const el = document.createElement('div');
  el.className = 'cave-exit-prompt';
  el.style.cssText = [
    'position: fixed',
    'bottom: 150px',
    'left: 50%',
    'transform: translateX(-50%)',
    'padding: 8px 18px',
    'background: rgba(13, 10, 6, 0.88)',
    'border: 1px solid #5a2818',
    'border-radius: 999px',
    'color: #ffaa60',
    'font-family: Georgia, serif',
    'font-size: 13px',
    'font-variant: small-caps',
    'letter-spacing: 0.22em',
    'z-index: 25',
    'opacity: 0',
    'transition: opacity 0.25s ease',
    'pointer-events: none',
  ].join(';');
  el.textContent = 'Press E — leave the cave';
  const root = document.getElementById('ui-root') || document.body;
  root.appendChild(el);
  return el;
}

function buildShrinePromptDOM() {
  const el = document.createElement('div');
  el.className = 'cave-shrine-prompt';
  el.style.cssText = [
    'position: fixed',
    'bottom: 118px',
    'left: 50%',
    'transform: translateX(-50%)',
    'padding: 8px 18px',
    'background: rgba(13, 10, 6, 0.88)',
    'border: 1px solid #5a3820',
    'border-radius: 999px',
    'color: #ffaa60',
    'font-family: Georgia, serif',
    'font-size: 13px',
    'font-variant: small-caps',
    'letter-spacing: 0.22em',
    'z-index: 25',
    'opacity: 0',
    'transition: opacity 0.25s ease',
    'pointer-events: none',
  ].join(';');
  el.textContent = 'Press E — examine the stones';
  const root = document.getElementById('ui-root') || document.body;
  root.appendChild(el);
  return el;
}

// ---------------------------------------------------------------------------
// CaveInterior module
// ---------------------------------------------------------------------------

export const CaveInterior = {
  scene: null,
  built: {}, // caveId -> { group, origin, ... }
  active: null, // built entry for current cave
  // Saved lighting so we can restore when exiting.
  _savedFog: null,
  _savedAmbient: null,
  _savedMoon: null,
  _compass: null,
  _exitPrompt: null,
  _shrinePrompt: null,
  _playerRef: null,
  onExit: null, // called when player presses E at the exit portal
  EXIT_TRIGGER_RADIUS: 2.2,
  _atAshwickShrine: false,
  _shrinePromptVisible: null,

  init(scene) {
    this.scene = scene;
    if (!this._compass) this._compass = buildCompassDOM();
    if (!this._exitPrompt) this._exitPrompt = buildExitPromptDOM();
    if (!this._shrinePrompt) this._shrinePrompt = buildShrinePromptDOM();

    window.addEventListener('keydown', (e) => {
      if (state.currentScene !== 'cave') return;
      if (e.repeat) return;
      if (e.key !== 'e' && e.key !== 'E') return;
      if (this._atExit) {
        if (typeof this.onExit === 'function') this.onExit();
        return;
      }
      if (
        this._atAshwickShrine &&
        this.active?.cave?.id === 'ashCave' &&
        !state.dialogueActive
      ) {
        const q = state.quests?.ashwick;
        if (q && !q.done && q.step === 4) {
          QuestSystem.tryAshwickShrine();
        }
      }
    });
  },

  setOnExit(fn) {
    this.onExit = fn;
  },

  setPlayer(player) {
    this._playerRef = player;
  },

  _getOrBuild(caveId) {
    if (this.built[caveId]) return this.built[caveId];
    const cave = caves.find((c) => c.id === caveId);
    if (!cave) return null;
    const idx = caves.indexOf(cave);
    const entry = buildCave(cave, idx);
    this.scene.add(entry.group);
    entry.cave = cave;
    entry.caveIndex = idx;
    this.built[caveId] = entry;
    return entry;
  },

  getActive() {
    return this.active;
  },

  // Enter a cave. Returns the world-space spawn point for the player.
  enter(caveId, { restorePlayerLocal = null } = {}) {
    const entry = this._getOrBuild(caveId);
    if (!entry) return null;

    // Save lighting state if this is the first entry.
    if (!this._savedFog && SceneManager.fog) {
      this._savedFog = {
        color: SceneManager.fog.color.clone(),
        density: SceneManager.fog.density,
      };
    }
    if (!this._savedAmbient && SceneManager.ambient) {
      this._savedAmbient = {
        color: SceneManager.ambient.color.clone(),
        intensity: SceneManager.ambient.intensity,
      };
    }
    if (!this._savedMoon && SceneManager.moonLight) {
      this._savedMoon = {
        color: SceneManager.moonLight.color.clone(),
        intensity: SceneManager.moonLight.intensity,
      };
    }

    // Apply cave lighting.
    if (SceneManager.fog) {
      SceneManager.fog.color.setHex(CAVE_FOG_COLOR);
      SceneManager.fog.density = CAVE_FOG_DENSITY;
    }
    if (SceneManager.ambient) {
      SceneManager.ambient.color.setHex(CAVE_AMBIENT_COLOR);
      SceneManager.ambient.intensity = CAVE_AMBIENT_INTENSITY;
    }
    if (SceneManager.moonLight) {
      SceneManager.moonLight.intensity = 0.0;
    }
    if (SceneManager.scene && SceneManager.scene.background) {
      SceneManager.scene.background.setHex(0x0a0302);
    }

    entry.group.visible = true;
    this.active = entry;

    // Fix 6 — register cave wall colliders. Translate cave-local footprints
    // to world coords using the cave origin and remember them so we can
    // remove on exit.
    this.registerColliders(entry);

    // Compute world-space spawn.
    const local = restorePlayerLocal || entry.spawnLocal;
    const spawn = {
      x: entry.origin.x + local.x,
      z: entry.origin.z + local.z,
      rotationY: local.rotationY ?? Math.PI,
    };
    return spawn;
  },

  // Fix 6 — register every wall in the active cave as a box collider so the
  // player can't walk through walls. Called from enter().
  registerColliders(entry) {
    if (!entry || !Array.isArray(entry.walls)) return;
    if (entry.activeColliders && entry.activeColliders.length) {
      // Defensive: clear any prior registration.
      this.unregisterColliders(entry);
    }
    entry.activeColliders = [];
    const ox = entry.origin.x;
    const oz = entry.origin.z;
    for (const w of entry.walls) {
      const c = Collision.addBox(ox + w.cx, oz + w.cz, w.hw, w.hd);
      if (c) entry.activeColliders.push(c);
    }
  },

  unregisterColliders(entry) {
    if (!entry || !entry.activeColliders) return;
    for (const c of entry.activeColliders) Collision.remove(c);
    entry.activeColliders = [];
  },

  // Exit the active cave. Returns cave metadata (world entrance pos).
  exit() {
    const entry = this.active;
    if (!entry) return null;
    // Fix 6 — drop the cave's wall colliders before hiding the geometry so
    // the world's normal collision set is fully restored.
    this.unregisterColliders(entry);
    entry.group.visible = false;
    this.active = null;
    this._atExit = false;
    this._atAshwickShrine = false;
    if (this._exitPrompt) this._exitPrompt.style.opacity = '0';
    if (this._shrinePrompt) {
      this._shrinePrompt.style.opacity = '0';
      this._shrinePromptVisible = false;
    }
    if (this._compass) this._compass.el.style.opacity = '0';

    // Restore world lighting to saved values — DayNight will continue
    // lerping from the next frame onward so one frame of "saved" values is
    // fine.
    if (this._savedFog && SceneManager.fog) {
      SceneManager.fog.color.copy(this._savedFog.color);
      SceneManager.fog.density = this._savedFog.density;
    }
    if (this._savedAmbient && SceneManager.ambient) {
      SceneManager.ambient.color.copy(this._savedAmbient.color);
      SceneManager.ambient.intensity = this._savedAmbient.intensity;
    }
    if (this._savedMoon && SceneManager.moonLight) {
      SceneManager.moonLight.color.copy(this._savedMoon.color);
      SceneManager.moonLight.intensity = this._savedMoon.intensity;
    }
    return entry;
  },

  // Convert a world-space player position into cave-local coords.
  worldToLocal(worldX, worldZ) {
    if (!this.active) return null;
    return {
      x: worldX - this.active.origin.x,
      z: worldZ - this.active.origin.z,
    };
  },

  localToWorld(localX, localZ) {
    if (!this.active) return null;
    return {
      x: this.active.origin.x + localX,
      z: this.active.origin.z + localZ,
    };
  },

  getOreNodes() {
    return this.active ? this.active.oreNodes : [];
  },

  getBedWorldPos() {
    if (!this.active) return null;
    const b = this.active.bedPos;
    return {
      x: this.active.origin.x + b.x,
      z: this.active.origin.z + b.z,
    };
  },

  getTrollWorldPos() {
    if (!this.active) return null;
    const t = this.active.troll.userData.worldPos;
    return {
      x: this.active.origin.x + t.x,
      z: this.active.origin.z + t.z,
    };
  },

  _compassAccum: 0,
  _exitPromptVisible: null,
  _lastCompassDeg: null,

  // Called from main game loop while in the cave scene.
  update(delta, playerPos, playerYaw) {
    if (state.currentScene !== 'cave' || !this.active) {
      if (this._compass && this._compass.el.style.opacity !== '0') {
        this._compass.el.style.opacity = '0';
      }
      if (this._exitPrompt && this._exitPromptVisible !== false) {
        this._exitPrompt.style.opacity = '0';
        this._exitPromptVisible = false;
      }
      if (this._shrinePrompt && this._shrinePromptVisible) {
        this._shrinePrompt.style.opacity = '0';
        this._shrinePromptVisible = false;
      }
      return;
    }
    const local = this.worldToLocal(playerPos.x, playerPos.z);

    // Exit portal proximity.
    const ex = this.active.exitPortal.x;
    const ez = this.active.exitPortal.z;
    const dxE = local.x - ex;
    const dzE = local.z - ez;
    const distExitSq = dxE * dxE + dzE * dzE;
    const limitSq = this.EXIT_TRIGGER_RADIUS * this.EXIT_TRIGGER_RADIUS;
    this._atExit = distExitSq < limitSq;
    if (this._exitPrompt && this._exitPromptVisible !== this._atExit) {
      this._exitPrompt.style.opacity = this._atExit ? '1' : '0';
      this._exitPromptVisible = this._atExit;
    }

    // Ashwick quest shrine (inside ashCave only).
    let atShrine = false;
    const shr = this.active.ashwickShrineLocal;
    if (shr && this.active.cave?.id === 'ashCave') {
      const dxs = local.x - shr.x;
      const dzs = local.z - shr.z;
      const rr = (shr.r ?? 3.5) * (shr.r ?? 3.5);
      atShrine = dxs * dxs + dzs * dzs < rr;
    }
    this._atAshwickShrine = atShrine;
    const qAsh = state.quests?.ashwick;
    const showShrinePrompt =
      atShrine &&
      qAsh &&
      !qAsh.done &&
      qAsh.step === 4 &&
      !state.dialogueActive &&
      !this._atExit;
    if (this._shrinePrompt && this._shrinePromptVisible !== showShrinePrompt) {
      this._shrinePrompt.style.opacity = showShrinePrompt ? '1' : '0';
      this._shrinePromptVisible = showShrinePrompt;
    }

    // Compass toward troll chamber — DOM style writes trigger restyle,
    // throttle to ~10Hz and skip when the angle hasn't actually moved.
    this._compassAccum += delta;
    if (this._compass && this._compassAccum >= 0.1) {
      this._compassAccum = 0;
      if (this._compass.el.style.opacity !== '1') {
        this._compass.el.style.opacity = '1';
      }
      const tx = this.active.compassLocal.x;
      const tz = this.active.compassLocal.z;
      const dirX = tx - local.x;
      const dirZ = tz - local.z;
      const cos = Math.cos(-playerYaw);
      const sin = Math.sin(-playerYaw);
      const rx = dirX * cos - dirZ * sin;
      const rz = dirX * sin + dirZ * cos;
      const deg = Math.atan2(rx, -rz) * (180 / Math.PI);
      if (this._lastCompassDeg === null || Math.abs(deg - this._lastCompassDeg) > 1) {
        this._lastCompassDeg = deg;
        this._compass.arrow.style.transform = `rotate(${deg}deg)`;
      }
    }
  },
};
