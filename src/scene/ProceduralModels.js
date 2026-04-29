// ---------------------------------------------------------------------------
// ProceduralModels.js — Three.js geometry fallbacks used when a GLB asset
// fails to load (e.g. Git LFS pointers served instead of binary data).
//
// Each builder returns { scene: THREE.Group, animations: AnimationClip[] }
// matching the shape that ModelLoader caches, so instantiate() works as-is.
// ---------------------------------------------------------------------------

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function mat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

function box(w, h, d, color, name) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(rt, rb, h, segs, color, name) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segs), mat(color));
  m.name = name;
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// Walk animation (targets named children of the humanoid group)
// ---------------------------------------------------------------------------

function buildWalkClip() {
  const duration = 0.72;
  const steps = 9;
  const times = [];
  for (let i = 0; i < steps; i++) times.push((i / (steps - 1)) * duration);

  const swing = Math.PI / 5.5; // ~32 degrees
  const legLQ = [], legRQ = [], armLQ = [], armRQ = [], torsoQ = [];
  const q = new THREE.Quaternion();

  for (let i = 0; i < steps; i++) {
    const t = (i / (steps - 1)) * Math.PI * 2;
    const angle = Math.sin(t) * swing;

    q.setFromEuler(new THREE.Euler(angle, 0, 0));
    legLQ.push(q.x, q.y, q.z, q.w);

    q.setFromEuler(new THREE.Euler(-angle, 0, 0));
    legRQ.push(q.x, q.y, q.z, q.w);

    q.setFromEuler(new THREE.Euler(-angle * 0.55, 0, 0));
    armLQ.push(q.x, q.y, q.z, q.w);

    q.setFromEuler(new THREE.Euler(angle * 0.55, 0, 0));
    armRQ.push(q.x, q.y, q.z, q.w);

    // Subtle torso counter-rotation
    q.setFromEuler(new THREE.Euler(0, Math.sin(t) * 0.08, 0));
    torsoQ.push(q.x, q.y, q.z, q.w);
  }

  return new THREE.AnimationClip('Walking', duration, [
    new THREE.QuaternionKeyframeTrack('legL.quaternion', times, legLQ),
    new THREE.QuaternionKeyframeTrack('legR.quaternion', times, legRQ),
    new THREE.QuaternionKeyframeTrack('armL.quaternion', times, armLQ),
    new THREE.QuaternionKeyframeTrack('armR.quaternion', times, armRQ),
    new THREE.QuaternionKeyframeTrack('torso.quaternion', times, torsoQ),
  ]);
}

// ---------------------------------------------------------------------------
// Humanoid character (player, NPCs, friends, enemies)
// ---------------------------------------------------------------------------
// Colors:
//   skinHex  — head/hands
//   bodyHex  — torso/arms (tinted further by per-NPC cloak color)
//   legsHex  — legs

const HUMANOID_CONFIGS = {
  player:        { body: 0x8b6914, legs: 0x3a3020, skin: 0xd4a870 },
  brother:       { body: 0x7a6040, legs: 0x4a3828, skin: 0xd4a870 },
  friendMira:    { body: 0x8a5060, legs: 0x3a2830, skin: 0xe0b090 },
  friendTomas:   { body: 0x5a6840, legs: 0x303820, skin: 0xc89860 },
  friendElen:    { body: 0x485870, legs: 0x283038, skin: 0xdaa890 },
  npcLantern:    { body: 0x6b5030, legs: 0x382818, skin: 0xc89060 },
  npcOlderMan:   { body: 0x504840, legs: 0x302820, skin: 0xc0a080 },
  npcBroad:      { body: 0x604838, legs: 0x382820, skin: 0xb88060 },
  npcSymmetrical:{ body: 0x607080, legs: 0x303840, skin: 0xd0c0b0 },
  veilWanderer:  { body: 0x303040, legs: 0x202030, skin: 0x888090 },
};

export function buildHumanoidFallback(key) {
  const cfg = HUMANOID_CONFIGS[key] || { body: 0x908070, legs: 0x484038, skin: 0xd0a878 };
  const g = new THREE.Group();
  g.name = 'ProceduralHumanoid';

  // Head
  const head = box(0.34, 0.34, 0.28, cfg.skin, 'head');
  head.position.set(0, 1.66, 0);
  g.add(head);

  // Torso (pivot at shoulder line so rotation looks natural)
  const torso = box(0.44, 0.52, 0.24, cfg.body, 'torso');
  torso.position.set(0, 1.22, 0);
  g.add(torso);

  // Arms — positioned relative to group root, rotation pivot at shoulder
  const armL = box(0.12, 0.44, 0.12, cfg.body, 'armL');
  armL.position.set(-0.30, 1.0, 0);
  g.add(armL);

  const armR = box(0.12, 0.44, 0.12, cfg.body, 'armR');
  armR.position.set(0.30, 1.0, 0);
  g.add(armR);

  // Legs — pivot at hip; shift mesh so pivot is at top of leg geometry
  const legL = box(0.17, 0.58, 0.17, cfg.legs, 'legL');
  legL.position.set(-0.13, 0.62, 0);
  g.add(legL);

  const legR = box(0.17, 0.58, 0.17, cfg.legs, 'legR');
  legR.position.set(0.13, 0.62, 0);
  g.add(legR);

  // Feet
  const footL = box(0.16, 0.08, 0.22, cfg.legs, 'footL');
  footL.position.set(-0.13, 0.33, 0.04);
  g.add(footL);
  const footR = box(0.16, 0.08, 0.22, cfg.legs, 'footR');
  footR.position.set(0.13, 0.33, 0.04);
  g.add(footR);

  return { scene: g, animations: [buildWalkClip()] };
}

// ---------------------------------------------------------------------------
// Troll — large, hunched biped
// ---------------------------------------------------------------------------

export function buildTrollFallback() {
  const g = new THREE.Group();
  g.name = 'ProceduralTroll';
  const stoneGrey = 0x706858;

  const body = box(1.2, 1.1, 0.8, stoneGrey, 'torso');
  body.position.set(0, 1.1, 0);
  g.add(body);

  const head = box(0.7, 0.65, 0.6, stoneGrey, 'head');
  head.position.set(0, 1.9, 0.15);
  g.add(head);

  // Arms hang low
  const armL = box(0.3, 0.9, 0.3, 0x605848, 'armL');
  armL.position.set(-0.85, 0.7, 0);
  g.add(armL);
  const armR = box(0.3, 0.9, 0.3, 0x605848, 'armR');
  armR.position.set(0.85, 0.7, 0);
  g.add(armR);

  // Legs
  const legL = box(0.42, 0.8, 0.42, stoneGrey, 'legL');
  legL.position.set(-0.35, 0.4, 0);
  g.add(legL);
  const legR = box(0.42, 0.8, 0.42, stoneGrey, 'legR');
  legR.position.set(0.35, 0.4, 0);
  g.add(legR);

  return { scene: g, animations: [] };
}

// ---------------------------------------------------------------------------
// Pocket watch prop
// ---------------------------------------------------------------------------

export function buildPocketWatchFallback() {
  const g = new THREE.Group();
  g.name = 'ProceduralPocketWatch';

  const face = cyl(0.18, 0.18, 0.04, 16, 0xd4a020, 'watchFace');
  face.rotation.x = Math.PI / 2;
  g.add(face);

  const rim = cyl(0.20, 0.20, 0.02, 16, 0xb08000, 'watchRim');
  rim.rotation.x = Math.PI / 2;
  rim.position.z = 0.01;
  g.add(rim);

  const chain = box(0.02, 0.3, 0.02, 0xb08000, 'chain');
  chain.position.set(0, 0.25, 0);
  g.add(chain);

  return { scene: g, animations: [] };
}

// ---------------------------------------------------------------------------
// Cave / environment props
// ---------------------------------------------------------------------------

export function buildCaveFallback(key) {
  const g = new THREE.Group();
  g.name = `ProceduralCave_${key}`;
  const rockColor = 0x605850;
  const darkRock = 0x484038;

  switch (key) {
    case 'caveArch': {
      // Two pillars + lintel
      const pilL = box(0.8, 4, 0.8, rockColor, 'pilL');
      pilL.position.set(-2.5, 2, 0);
      const pilR = box(0.8, 4, 0.8, rockColor, 'pilR');
      pilR.position.set(2.5, 2, 0);
      const lintel = box(6, 0.8, 0.9, darkRock, 'lintel');
      lintel.position.set(0, 4.4, 0);
      g.add(pilL, pilR, lintel);
      break;
    }
    case 'caveFloor': {
      const floor = box(12, 0.4, 12, 0x504840, 'floor');
      floor.position.set(0, 0.2, 0);
      g.add(floor);
      // Scattered boulders
      for (let i = 0; i < 5; i++) {
        const s = 0.4 + Math.random() * 0.6;
        const r = box(s, s * 0.7, s, rockColor, `rock${i}`);
        r.position.set((Math.random() - 0.5) * 10, 0.4 * s, (Math.random() - 0.5) * 10);
        g.add(r);
      }
      break;
    }
    case 'caveSleeping': {
      const slab = box(2.2, 0.3, 1.0, rockColor, 'slab');
      slab.position.set(0, 0.15, 0);
      const pillow = box(0.5, 0.15, 0.5, 0x8a7060, 'pillow');
      pillow.position.set(-0.7, 0.38, 0);
      g.add(slab, pillow);
      break;
    }
    case 'caveMassiveStone': {
      const stone = box(4, 3.5, 3, rockColor, 'massiveStone');
      stone.position.set(0, 1.75, 0);
      const cap = box(3.5, 0.5, 2.8, darkRock, 'cap');
      cap.position.set(0, 3.75, 0);
      g.add(stone, cap);
      break;
    }
    case 'caveAncient': {
      for (let i = 0; i < 3; i++) {
        const col = box(0.6, 3.5, 0.6, 0x686058, `col${i}`);
        col.position.set(-3 + i * 3, 1.75, 0);
        g.add(col);
      }
      const beam = box(9, 0.4, 0.8, darkRock, 'beam');
      beam.position.set(0, 3.7, 0);
      g.add(beam);
      break;
    }
    case 'rockFormation':
    default: {
      for (let i = 0; i < 4; i++) {
        const h = 0.8 + i * 0.5;
        const r = box(0.5 + i * 0.2, h, 0.5, rockColor, `rock${i}`);
        r.position.set(-0.9 + i * 0.6, h / 2, 0);
        g.add(r);
      }
    }
  }

  return { scene: g, animations: [] };
}

// ---------------------------------------------------------------------------
// Town shells — distinctive low-poly building clusters per town
// ---------------------------------------------------------------------------

// Helper: build a simple house (box body + pyramidal roof)
function addHouse(parent, x, z, w, h, d, wallColor, roofColor, name) {
  const body = box(w, h, d, wallColor, `${name}_wall`);
  body.position.set(x, h / 2, z);
  parent.add(body);

  // Roof (tall thin box as simple gable stand-in)
  const roof = box(w + 0.2, h * 0.5, d + 0.2, roofColor, `${name}_roof`);
  roof.position.set(x, h + h * 0.25, z);
  parent.add(roof);
}

export function buildTownFallback(key) {
  const g = new THREE.Group();
  g.name = `ProceduralTown_${key}`;

  switch (key) {
    case 'townMill':
    case 'hamlet': {
      // Warm mill-town: several tightly packed buildings + mill tower
      const wall = 0xc8a870;
      const roof = 0x784830;
      const stone = 0x888068;
      addHouse(g, 0, 0, 8, 4, 6, wall, roof, 'tavern');
      addHouse(g, 12, 2, 5, 3.5, 5, wall, roof, 'house1');
      addHouse(g, -10, -1, 4, 3, 4, stone, 0x604020, 'forge');
      addHouse(g, 6, -10, 6, 3, 5, wall, roof, 'barn');
      addHouse(g, -5, 8, 4, 3.5, 4, wall, roof, 'house2');
      // Mill tower
      const tower = cyl(1.2, 1.5, 7, 8, stone, 'millTower');
      tower.position.set(3, 3.5, 5);
      g.add(tower);
      // Mill cap
      const cap = cyl(1.5, 0.3, 1.5, 8, roof, 'millCap');
      cap.position.set(3, 7.75, 5);
      g.add(cap);
      break;
    }

    case 'townStone': {
      // Stonehush: grey stone walls, fortress-like
      const grey = 0x808878;
      const darkRoof = 0x484840;
      addHouse(g, 0, 0, 10, 5, 8, grey, darkRoof, 'hall');
      addHouse(g, 14, 0, 5, 4, 5, grey, darkRoof, 'house1');
      addHouse(g, -14, 0, 5, 4, 5, grey, darkRoof, 'house2');
      addHouse(g, 0, 14, 6, 4.5, 6, grey, darkRoof, 'house3');
      // Corner towers
      for (const [ox, oz] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) {
        const t = cyl(1.0, 1.1, 6, 6, 0x707868, `tower_${ox}_${oz}`);
        t.position.set(ox, 3, oz);
        g.add(t);
      }
      break;
    }

    case 'townForest': {
      // Deeproot: earthy, organic, round buildings
      const earth = 0x806040;
      const greenRoof = 0x486030;
      const bark = 0x604828;
      addHouse(g, 0, 0, 7, 4, 7, earth, greenRoof, 'lodge');
      addHouse(g, 12, 3, 4.5, 3, 4, earth, greenRoof, 'hut1');
      addHouse(g, -10, 2, 4, 3, 4, bark, greenRoof, 'hut2');
      addHouse(g, 3, -12, 5, 3.5, 5, earth, greenRoof, 'hut3');
      // Great tree trunk
      const trunk = cyl(1.8, 2.5, 12, 10, bark, 'greatTrunk');
      trunk.position.set(-4, 6, -5);
      g.add(trunk);
      // Canopy dome (flattened sphere → approximate with wide short cyl)
      const canopy = cyl(5, 3, 3, 12, greenRoof, 'canopy');
      canopy.position.set(-4, 12.5, -5);
      g.add(canopy);
      break;
    }

    case 'townPristine': {
      // Mirror Town: pale, crystalline, symmetric
      const white = 0xdce0e8;
      const crystal = 0xa0b0c0;
      const spireColor = 0xb8c8e0;
      // Symmetric ring of panels
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const r = 10;
        const panel = box(2, 6, 0.4, crystal, `panel${i}`);
        panel.position.set(Math.cos(angle) * r, 3, Math.sin(angle) * r);
        panel.rotation.y = -angle;
        g.add(panel);
      }
      addHouse(g, 0, 0, 8, 5, 8, white, crystal, 'temple');
      // Central spire
      const spire = cyl(0.3, 1.0, 10, 4, spireColor, 'spire');
      spire.position.set(0, 5, 0);
      g.add(spire);
      break;
    }

    case 'townBarely': {
      // Unnamed / barely visible: sparse, weathered
      const dull = 0x908070;
      const worn = 0x605040;
      addHouse(g, 0, 0, 5, 3, 5, dull, worn, 'ruin1');
      addHouse(g, 10, 0, 4, 2.5, 4, dull, worn, 'ruin2');
      // Crumbled wall sections
      const wall1 = box(6, 1.5, 0.6, worn, 'wall1');
      wall1.position.set(-5, 0.75, 5);
      const wall2 = box(4, 1.0, 0.6, worn, 'wall2');
      wall2.position.set(4, 0.5, -6);
      g.add(wall1, wall2);
      break;
    }

    default: {
      // Generic town fallback
      addHouse(g, 0, 0, 6, 3.5, 6, 0xa09080, 0x604030, 'building');
      addHouse(g, 10, 0, 4, 3, 4, 0x909080, 0x503020, 'house');
    }
  }

  return { scene: g, animations: [] };
}

// ---------------------------------------------------------------------------
// Main dispatch — pick the right builder for any model key
// ---------------------------------------------------------------------------

const HUMANOID_KEYS = new Set([
  'player', 'brother',
  'friendMira', 'friendTomas', 'friendElen',
  'npcLantern', 'npcOlderMan', 'npcBroad', 'npcSymmetrical',
  'veilWanderer',
]);

const TOWN_KEYS = new Set([
  'townMill', 'townStone', 'townForest', 'townPristine', 'townBarely', 'hamlet',
]);

const CAVE_KEYS = new Set([
  'caveArch', 'caveFloor', 'caveSleeping', 'caveMassiveStone', 'caveAncient', 'rockFormation',
]);

export function buildFallback(key) {
  if (HUMANOID_KEYS.has(key)) return buildHumanoidFallback(key);
  if (key === 'troll')        return buildTrollFallback();
  if (key === 'pocketWatch')  return buildPocketWatchFallback();
  if (CAVE_KEYS.has(key))     return buildCaveFallback(key);
  if (TOWN_KEYS.has(key))     return buildTownFallback(key);

  // Generic box placeholder for unknown keys
  const g = new THREE.Group();
  g.name = `ProceduralUnknown_${key}`;
  const b = box(1, 1, 1, 0x888888, 'placeholder');
  b.position.set(0, 0.5, 0);
  g.add(b);
  return { scene: g, animations: [] };
}
