import * as THREE from 'three';
import { state } from '../state.js';
import { makeVillagerMesh } from './Westwind.js';
import {
  npcWorldBlocked,
  snapNpcWorldXZ,
  snapNpcWorldXZWithFallbacks,
  randomNpcPointInDisc,
} from './npcWorldPlacement.js';
import { Travel } from '../game/Travel.js';
import { QuestSystem } from '../game/QuestSystem.js';
import { Collision } from '../game/Collision.js';
import { DayNight } from './DayNight.js';
import {
  STONEHUSH_BELL_WORLD,
  STONEHUSH_BELL_INTERACT_R,
} from '../data/stonehushBell.js';

// ---------------------------------------------------------------------------
// TownNPCs — a generic wandering-villager system used by every greater town
// (Veil Market, Stonehush, Deeproot, Mirror, Unnamed).
//
// Each NPC picks waypoints inside a circle around the town center and walks
// to them. A fraction of the waypoints are flagged as "doorways" — when an
// NPC reaches one, it fades out (entering a building), waits, and then fades
// back in at a different doorway as if it had walked through and come out
// somewhere else.
//
// The towns are GLB models, so we don't know exact building positions — the
// doorway anchors are sampled along the edge of the visit ring so they tend
// to land at the buildings clustered around the town's plaza.
// ---------------------------------------------------------------------------

const SPEED = 0.9;
const ARRIVE_R = 0.6;
const PAUSE_MIN = 1.4;
const PAUSE_MAX = 3.2;
const UPDATE_RANGE_SQ = 280 * 280;
const DOORWAY_HOLD_MIN = 2.2;
const DOORWAY_HOLD_MAX = 4.8;
const FADE_TIME = 0.55;

// Stonehush GLB voxel collision is dense — march stuck wanderers toward open plaza.
const STONHUSH_ESCAPE_ANCHORS = [
  { x: -830, z: -5000 },
  { x: -810, z: -4992 },
  { x: -850, z: -5008 },
  { x: -822, z: -5018 },
  { x: -838, z: -4988 },
];

// Fixed posts for the four fragment NPCs — avoids one wanderer pathing into
// dense GLB voxels or ending up effectively untargetable.
const STONHUSH_FRAGMENT_STANDS = [
  { x: -816, z: -4994 },
  { x: -844, z: -5002 },
  { x: -826, z: -5010 },
  { x: -836, z: -4988 },
];

/** Tighter probe than default NPC radius — finds a tile the mesh can stand on. */
const STONEHUSH_FOOT_RADIUS = 0.48;

function findOpenStonehushPost(sx, sz) {
  if (!Collision.count || Collision.count() === 0) {
    return { x: sx, z: sz };
  }
  if (!npcWorldBlocked(sx, sz, STONEHUSH_FOOT_RADIUS)) return { x: sx, z: sz };
  const s = snapNpcWorldXZWithFallbacks(sx, sz, STONHUSH_ESCAPE_ANCHORS, {
    radius: STONEHUSH_FOOT_RADIUS,
    maxSearchRadius: 88,
  });
  if (!npcWorldBlocked(s.x, s.z, STONEHUSH_FOOT_RADIUS)) return s;
  for (let ring = 1; ring <= 70; ring++) {
    const step = ring * 0.34;
    const samples = Math.max(10, Math.round((2 * Math.PI * step) / 0.38));
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      const nx = sx + Math.cos(a) * step;
      const nz = sz + Math.sin(a) * step;
      if (!npcWorldBlocked(nx, nz, STONEHUSH_FOOT_RADIUS)) return { x: nx, z: nz };
    }
  }
  return { x: sx, z: sz };
}

let _prevStonehushE = false;
let _prevDeeprootE = false;

const STONEHUSH_INTERACT_R = 4.8;
const STONEHUSH_INTERACT_R_SQ = STONEHUSH_INTERACT_R * STONEHUSH_INTERACT_R;
/** Wider bubble so NPCs + E work before ChunkManager clips the GLB at the town edge. */
const STONEHUSH_UPDATE_RANGE_SQ = 360 * 360;

const DEEPROOT_INTERACT_R = 5.2;
const DEEPROOT_INTERACT_R_SQ = DEEPROOT_INTERACT_R * DEEPROOT_INTERACT_R;

// Stable posts for Deeproot quest villagers (keeps them reachable in voxel-heavy GLB).
const DEEPROOT_FRAGMENT_STANDS = [
  { x: 670, z: -5992 },
  { x: 694, z: -6006 },
  { x: 676, z: -6014 },
];
const DEEPROOT_FOOT_RADIUS = 0.5;

function findOpenDeeprootPost(sx, sz) {
  if (!Collision.count || Collision.count() === 0) return { x: sx, z: sz };
  if (!npcWorldBlocked(sx, sz, DEEPROOT_FOOT_RADIUS)) return { x: sx, z: sz };
  const anchors = [
    { x: 680, z: -6000 },
    { x: 666, z: -5990 },
    { x: 698, z: -6008 },
    { x: 672, z: -6020 },
    { x: 690, z: -5986 },
  ];
  const s = snapNpcWorldXZWithFallbacks(sx, sz, anchors, {
    radius: DEEPROOT_FOOT_RADIUS,
    maxSearchRadius: 110,
  });
  if (!npcWorldBlocked(s.x, s.z, DEEPROOT_FOOT_RADIUS)) return s;
  for (let ring = 1; ring <= 72; ring++) {
    const step = ring * 0.38;
    const samples = Math.max(12, Math.round((2 * Math.PI * step) / 0.42));
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      const nx = sx + Math.cos(a) * step;
      const nz = sz + Math.sin(a) * step;
      if (!npcWorldBlocked(nx, nz, DEEPROOT_FOOT_RADIUS)) return { x: nx, z: nz };
    }
  }
  return { x: sx, z: sz };
}

const STONEHUSH_BELL_R_SQ =
  STONEHUSH_BELL_INTERACT_R * STONEHUSH_BELL_INTERACT_R;
let _prevStonehushBellE = false;

function handleStonehushBellInteract(playerPos) {
  const q = state.quests?.stonehush;
  if (!q || q.done || (q.step !== 2 && q.step !== 3) || state.dialogueActive) {
    _prevStonehushBellE = Travel.keys?.has?.('e') ?? false;
    return;
  }
  const dx = STONEHUSH_BELL_WORLD.x - playerPos.x;
  const dz = STONEHUSH_BELL_WORLD.z - playerPos.z;
  if (dx * dx + dz * dz > STONEHUSH_BELL_R_SQ) {
    _prevStonehushBellE = Travel.keys?.has?.('e') ?? false;
    return;
  }
  const keys = Travel.keys;
  const eDown = keys?.has?.('e') ?? false;
  const eEdge = eDown && !_prevStonehushBellE;
  _prevStonehushBellE = eDown;

  const phase = DayNight.getCurrentPhase?.() ?? 'day';
  const darkEnough = phase === 'night' || phase === 'sunset' || phase === 'sunrise';
  const label = q.step === 3
    ? (darkEnough ? '[E] The bell (choose)' : '[E] The bell')
    : (darkEnough ? '[E] The bell' : '[E] Inspect');
  Travel._showSoftPrompt?.(label);

  if (eEdge) {
    QuestSystem.tryStonehushBell();
  }
}

function handleStonehushInteract(entry, playerPos) {
  const q = state.quests?.stonehush;
  if (!q || q.done || q.step !== 1 || state.dialogueActive) {
    _prevStonehushE = Travel.keys?.has?.('e') ?? false;
    return;
  }
  const heard = q.fragmentHeard || [false, false, false, false];
  const px = playerPos.x;
  const pz = playerPos.z;
  const candidates = [];
  for (const npc of entry.npcs) {
    if (npc.stonehushSlot === undefined || npc.stonehushSlot === null) continue;
    const dx = npc.mesh.position.x - px;
    const dz = npc.mesh.position.z - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 < STONEHUSH_INTERACT_R_SQ) {
      candidates.push({ npc, d2, slot: npc.stonehushSlot });
    }
  }
  candidates.sort((a, b) => a.d2 - b.d2);

  const keys = Travel.keys;
  const eDown = keys?.has?.('e') ?? false;
  const eEdge = eDown && !_prevStonehushE;
  _prevStonehushE = eDown;

  const unheard = candidates.find((c) => !heard[c.slot]);
  const promptTarget = unheard || candidates[0];
  if (promptTarget) {
    Travel._showSoftPrompt?.('[E] Listen');
  }

  if (eEdge && candidates.length) {
    const target = unheard || candidates[0];
    QuestSystem.tryStonehushFragment(target.slot);
  }
}

function handleDeeprootInteract(entry, playerPos) {
  const q = state.quests?.deeproot;
  if (!q || q.done || q.step !== 1 || state.dialogueActive) {
    _prevDeeprootE = Travel.keys?.has?.('e') ?? false;
    return;
  }
  const heard = q.villagerHeard || [false, false, false];
  const px = playerPos.x;
  const pz = playerPos.z;
  const candidates = [];
  for (const npc of entry.npcs) {
    if (npc.deeprootSlot === undefined || npc.deeprootSlot === null) continue;
    const dx = npc.mesh.position.x - px;
    const dz = npc.mesh.position.z - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 < DEEPROOT_INTERACT_R_SQ) {
      candidates.push({ npc, d2, slot: npc.deeprootSlot });
    }
  }
  candidates.sort((a, b) => a.d2 - b.d2);

  const keys = Travel.keys;
  const eDown = keys?.has?.('e') ?? false;
  const eEdge = eDown && !_prevDeeprootE;
  _prevDeeprootE = eDown;

  const unheard = candidates.find((c) => !heard[c.slot]);
  const promptTarget = unheard || candidates[0];
  if (promptTarget) {
    Travel._showSoftPrompt?.('[E] Ask');
  }

  if (eEdge && candidates.length) {
    const target = unheard || candidates[0];
    QuestSystem.tryDeeprootVillager(target.slot);
  }
}

// Town centers match the GLB model offsets in GreaterTowns.js so NPCs
// wander inside the building cluster instead of in the surrounding field.
// Stonehush and Deeproot have non-zero dx offsets on their models.
const TOWNS = [
  {
    id: 'veilMarket',
    center: { x: 34, z: -2500 },
    radius: 12,
    npcCount: 6,
    palette: [0x4a2e18, 0x2a3548, 0x4a2a4a, 0x3a4a30, 0x4a3018, 0x2a4a4a],
  },
  {
    id: 'stonehush',
    center: { x: -830, z: -5000 },
    radius: 17,
    npcCount: 6,
    // Doorway fade puts NPCs "inside" for seconds; with tight voxels many never read as visible.
    doorChance: 0,
    palette: [0x3a3030, 0x2a2838, 0x3a2a30, 0x40362a, 0x2a3a40, 0x322828],
  },
  {
    id: 'deeproot',
    center: { x: 680, z: -6000 },
    radius: 14,
    npcCount: 5,
    palette: [0x2e3a18, 0x4a3a1e, 0x3a2e18, 0x2e2a1a, 0x3a4a28],
  },
  {
    id: 'mirrorTown',
    center: { x: 200, z: -7800 },
    radius: 13,
    npcCount: 5,
    palette: [0x303a48, 0x4a4a5a, 0x382a3a, 0x303040, 0x4a3a4a],
  },
  {
    id: 'unnamed',
    center: { x: 0, z: -14500 },
    radius: 15,
    npcCount: 6,
    palette: [0x2a2018, 0x322a22, 0x281a18, 0x3a2a20, 0x2a2228, 0x40342a],
  },
];

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function randomWaypoint(center, radius) {
  return randomNpcPointInDisc(center.x, center.z, radius);
}

function buildDoorways(center, radius, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const r = radius * (0.78 + Math.random() * 0.18);
    const rawX = center.x + Math.cos(a) * r;
    const rawZ = center.z + Math.sin(a) * r;
    const s = snapNpcWorldXZ(rawX, rawZ);
    out.push({ x: s.x, z: s.z });
  }
  return out;
}

function setOpacity(mesh, opacity) {
  mesh.traverse((child) => {
    const m = child.material;
    if (!m) return;
    if (Array.isArray(m)) {
      for (const mm of m) {
        mm.transparent = true;
        mm.opacity = opacity;
        mm.depthWrite = opacity >= 0.99;
      }
    } else {
      m.transparent = true;
      m.opacity = opacity;
      m.depthWrite = opacity >= 0.99;
    }
  });
}

function makeNpc(town, doorways) {
  const robe = town.palette[Math.floor(Math.random() * town.palette.length)];
  const skinPick = [0xc8a888, 0xc9a684, 0xb89880, 0xcaa080, 0xa88868];
  const skin = skinPick[Math.floor(Math.random() * skinPick.length)];
  const mesh = makeVillagerMesh({ robeColor: robe, skinColor: skin });
  const start = doorways[Math.floor(Math.random() * doorways.length)];
  const s0 = snapNpcWorldXZ(start.x, start.z);
  mesh.position.set(s0.x, 0, s0.z);
  mesh.userData.phase = Math.random() * Math.PI * 2;
  mesh.userData.baseY = 0;
  return {
    mesh,
    target: randomWaypoint(town.center, town.radius * 0.85),
    pauseUntil: 0,
    state: 'walk', // 'walk' | 'pause' | 'inside'
    insideUntil: 0,
    fadeFrom: 1,
    fadeTo: 1,
    fadeAcc: 0,
    fadeTotal: 0,
    opacity: 1,
  };
}

const _townState = new Map();

function ensureTown(scene, town) {
  if (_townState.has(town.id)) return _townState.get(town.id);
  const root = new THREE.Group();
  root.name = `TownNPCs:${town.id}`;
  scene.add(root);
  const doorways = buildDoorways(town.center, town.radius, 7);
  const npcs = [];
  for (let i = 0; i < town.npcCount; i++) {
    if (town.id === 'stonehush' && i < 4) {
      const n = makeNpc(town, doorways);
      n.stonehushSlot = i;
      n.stonehushPinned = true;
      n._stonehushReliablePlaced = false;
      n.state = 'walk';
      n.fadeTotal = 0;
      n.opacity = 1;
      setOpacity(n.mesh, 1);
      n.mesh.visible = true;
      const prefer = STONHUSH_FRAGMENT_STANDS[i];
      const free = findOpenStonehushPost(prefer.x, prefer.z);
      n.mesh.position.set(free.x, 0, free.z);
      root.add(n.mesh);
      npcs.push(n);
      continue;
    }
    if (town.id === 'deeproot' && i < 3) {
      const n = makeNpc(town, doorways);
      n.deeprootSlot = i;
      n.deeprootPinned = true;
      n.state = 'walk';
      n.fadeTotal = 0;
      n.opacity = 1;
      setOpacity(n.mesh, 1);
      n.mesh.visible = true;
      const prefer = DEEPROOT_FRAGMENT_STANDS[i];
      const free = findOpenDeeprootPost(prefer.x, prefer.z);
      n.mesh.position.set(free.x, 0, free.z);
      root.add(n.mesh);
      npcs.push(n);
      continue;
    }
    const n = makeNpc(town, doorways);
    root.add(n.mesh);
    npcs.push(n);
  }
  const entry = { town, root, doorways, npcs };
  _townState.set(town.id, entry);
  return entry;
}

function pickTarget(town, doorways) {
  // Some towns disable doorways so NPCs stay visible inside voxel-heavy GLBs.
  const doorChance = typeof town.doorChance === 'number' ? town.doorChance : 0.35;
  if (Math.random() < doorChance) {
    return { ...doorways[Math.floor(Math.random() * doorways.length)], door: true };
  }
  return { ...randomWaypoint(town.center, town.radius * 0.85), door: false };
}

function stepFade(npc, delta) {
  if (npc.fadeTotal <= 0) return;
  npc.fadeAcc += delta;
  const t = Math.min(1, npc.fadeAcc / npc.fadeTotal);
  npc.opacity = npc.fadeFrom + (npc.fadeTo - npc.fadeFrom) * t;
  setOpacity(npc.mesh, npc.opacity);
  if (t >= 1) npc.fadeTotal = 0;
}

function startFade(npc, to, duration) {
  npc.fadeFrom = npc.opacity;
  npc.fadeTo = to;
  npc.fadeAcc = 0;
  npc.fadeTotal = duration;
}

function tickNpc(npc, town, doorways, delta, time, playerPos) {
  stepFade(npc, delta);

  // Stonehush fragment NPCs: stay at fixed posts (no doorway / wander into walls).
  if (npc.stonehushPinned) {
    npc.fadeTotal = 0;
    npc.opacity = 1;
    setOpacity(npc.mesh, 1);
    npc.mesh.visible = true;
    npc.state = 'walk';
    const collReady = Collision.count && Collision.count() > 0;
    if (collReady && !npc._stonehushReliablePlaced) {
      const prefer = STONHUSH_FRAGMENT_STANDS[npc.stonehushSlot % STONHUSH_FRAGMENT_STANDS.length];
      const u = findOpenStonehushPost(prefer.x, prefer.z);
      npc.mesh.position.set(u.x, 0, u.z);
      npc._stonehushReliablePlaced = true;
    }
    const px = npc.mesh.position.x;
    const pz = npc.mesh.position.z;
    if (collReady && npcWorldBlocked(px, pz, STONEHUSH_FOOT_RADIUS)) {
      const prefer = STONHUSH_FRAGMENT_STANDS[npc.stonehushSlot % STONHUSH_FRAGMENT_STANDS.length];
      const u = findOpenStonehushPost(prefer.x, prefer.z);
      npc.mesh.position.set(u.x, 0, u.z);
    }
    const plx = playerPos.x - px;
    const plz = playerPos.z - pz;
    if (plx * plx + plz * plz > 0.04) {
      npc.mesh.rotation.y = Math.atan2(plx, plz);
    }
    npc.mesh.position.y =
      npc.mesh.userData.baseY + Math.sin(time * 2.2 + npc.mesh.userData.phase) * 0.035;
    return;
  }
  if (npc.deeprootPinned) {
    npc.fadeTotal = 0;
    npc.opacity = 1;
    setOpacity(npc.mesh, 1);
    npc.mesh.visible = true;

    const collReady = !!Collision.count && Collision.count() > 0;
    if (collReady && npcWorldBlocked(npc.mesh.position.x, npc.mesh.position.z, DEEPROOT_FOOT_RADIUS)) {
      const prefer = DEEPROOT_FRAGMENT_STANDS[npc.deeprootSlot % DEEPROOT_FRAGMENT_STANDS.length];
      const u = findOpenDeeprootPost(prefer.x, prefer.z);
      npc.mesh.position.x = u.x;
      npc.mesh.position.z = u.z;
    }
    npc.mesh.rotation.y = Math.atan2(
      playerPos.x - npc.mesh.position.x,
      playerPos.z - npc.mesh.position.z,
    );
    npc.mesh.position.y = npc.mesh.userData.baseY + Math.sin(time * 5 + npc.mesh.userData.phase) * 0.04;
    return;
  }

  // Town GLB collision registers async — keep any NPC from staying inside voxels.
  if (npc.state !== 'inside' && npcWorldBlocked(npc.mesh.position.x, npc.mesh.position.z)) {
    let u = snapNpcWorldXZ(npc.mesh.position.x, npc.mesh.position.z);
    if (town.id === 'stonehush' && npcWorldBlocked(u.x, u.z)) {
      u = snapNpcWorldXZWithFallbacks(
        npc.mesh.position.x,
        npc.mesh.position.z,
        STONHUSH_ESCAPE_ANCHORS,
      );
    }
    npc.mesh.position.x = u.x;
    npc.mesh.position.z = u.z;
  }

  // While inside a building, hold position offstage and resurface when the
  // timer expires at a different doorway.
  if (npc.state === 'inside') {
    if (time >= npc.insideUntil) {
      let exit = doorways[Math.floor(Math.random() * doorways.length)];
      // Avoid coming out the same door we went in.
      if (npc._lastDoor) {
        for (let i = 0; i < 4; i++) {
          if (Math.hypot(exit.x - npc._lastDoor.x, exit.z - npc._lastDoor.z) > 6) break;
          exit = doorways[Math.floor(Math.random() * doorways.length)];
        }
      }
      const ex = snapNpcWorldXZ(exit.x, exit.z);
      npc.mesh.position.set(ex.x, 0, ex.z);
      npc.mesh.visible = true;
      startFade(npc, 1, FADE_TIME);
      npc.state = 'walk';
      npc.target = pickTarget(town, doorways);
      npc.pauseUntil = 0;
    }
    return;
  }

  if (npc.state === 'pause') {
    if (time >= npc.pauseUntil) {
      npc.state = 'walk';
      npc.target = pickTarget(town, doorways);
    }
    return;
  }

  // 'walk'
  const t = npc.target;
  const tx = snapNpcWorldXZ(t.x, t.z);
  const dx = tx.x - npc.mesh.position.x;
  const dz = tx.z - npc.mesh.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= ARRIVE_R) {
    if (t.door) {
      // Enter the building: fade out, hold offstage for a few seconds.
      startFade(npc, 0, FADE_TIME);
      npc._lastDoor = { x: t.x, z: t.z };
      npc.state = 'inside';
      npc.insideUntil = time + rand(DOORWAY_HOLD_MIN, DOORWAY_HOLD_MAX);
      // Hide after fade completes — but we already start fade, the mesh
      // becomes invisible visually at opacity 0; it does not need to be
      // disabled because we still update the state machine off it.
    } else {
      npc.state = 'pause';
      npc.pauseUntil = time + rand(PAUSE_MIN, PAUSE_MAX);
    }
    return;
  }

  const rdx = tx.x - npc.mesh.position.x;
  const rdz = tx.z - npc.mesh.position.z;
  const rdist = Math.hypot(rdx, rdz) || 1;

  const step = Math.min(rdist, SPEED * delta);
  npc.mesh.position.x += (rdx / rdist) * step;
  npc.mesh.position.z += (rdz / rdist) * step;
  if (npcWorldBlocked(npc.mesh.position.x, npc.mesh.position.z)) {
    let u = snapNpcWorldXZ(npc.mesh.position.x, npc.mesh.position.z);
    if (town.id === 'stonehush' && npcWorldBlocked(u.x, u.z)) {
      u = snapNpcWorldXZWithFallbacks(
        npc.mesh.position.x,
        npc.mesh.position.z,
        STONHUSH_ESCAPE_ANCHORS,
      );
    }
    npc.mesh.position.x = u.x;
    npc.mesh.position.z = u.z;
  }
  npc.mesh.rotation.y = Math.atan2(rdx, rdz);
  // Idle bob.
  npc.mesh.position.y = npc.mesh.userData.baseY + Math.sin(time * 5 + npc.mesh.userData.phase) * 0.04;
}

export const TownNPCs = {
  init(scene) {
    if (!scene) return;
    for (const town of TOWNS) ensureTown(scene, town);
  },

  update(delta, time, playerPos) {
    if (state.currentScene !== 'world' || !playerPos) return;
    for (const entry of _townState.values()) {
      const c = entry.town.center;
      const dx = c.x - playerPos.x;
      const dz = c.z - playerPos.z;
      const rangeSq =
        entry.town.id === 'stonehush' ? STONEHUSH_UPDATE_RANGE_SQ : UPDATE_RANGE_SQ;
      const inRange = dx * dx + dz * dz < rangeSq;
      // Hide root when far away to skip per-NPC work and keep them off the
      // GPU until the player approaches.
      if (entry.root.visible !== inRange) entry.root.visible = inRange;
      if (!inRange) continue;
      for (const npc of entry.npcs) {
        tickNpc(npc, entry.town, entry.doorways, delta, time, playerPos);
      }
      if (entry.town.id === 'stonehush') {
        handleStonehushInteract(entry, playerPos);
        handleStonehushBellInteract(playerPos);
      }
      if (entry.town.id === 'deeproot') {
        handleDeeprootInteract(entry, playerPos);
      }
    }
  },
};
