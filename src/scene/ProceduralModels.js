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

// PBR material used for humanoid characters — looks better under point lights.
function charMat(color, roughness = 0.88) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, flatShading: true });
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

// Mesh factory used by the humanoid builder.
function mk(geo, material, name) {
  const m = new THREE.Mesh(geo, material);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// Walk animation (targets named children of the humanoid group)
// ---------------------------------------------------------------------------

function buildWalkClip() {
  const duration = 0.76;
  const steps = 10;
  const times = [];
  for (let i = 0; i < steps; i++) times.push((i / (steps - 1)) * duration);

  // With pivot-correct groups (hips / shoulders), a smaller angle produces
  // a more natural stride — the full leg length amplifies the motion.
  const legSwing  = Math.PI / 6.8;   // ~26°
  const armSwing  = Math.PI / 13.0;  // ~14° counter-swing
  const torsoYaw  = 0.07;            // subtle Y counter-rotation

  const legLQ = [], legRQ = [], armLQ = [], armRQ = [], torsoQ = [];
  // Position track: torso bobs up twice per step cycle (once per foot-fall).
  const torsoPY = [];
  const q = new THREE.Quaternion();

  for (let i = 0; i < steps; i++) {
    const t = (i / (steps - 1)) * Math.PI * 2;
    const angle = Math.sin(t) * legSwing;

    q.setFromEuler(new THREE.Euler(angle, 0, 0));
    legLQ.push(q.x, q.y, q.z, q.w);

    q.setFromEuler(new THREE.Euler(-angle, 0, 0));
    legRQ.push(q.x, q.y, q.z, q.w);

    q.setFromEuler(new THREE.Euler(-Math.sin(t) * armSwing, 0, 0));
    armLQ.push(q.x, q.y, q.z, q.w);

    q.setFromEuler(new THREE.Euler(Math.sin(t) * armSwing, 0, 0));
    armRQ.push(q.x, q.y, q.z, q.w);

    // Upper-body counter-yaw + very slight forward lean
    q.setFromEuler(new THREE.Euler(0.04, Math.sin(t) * torsoYaw, 0));
    torsoQ.push(q.x, q.y, q.z, q.w);

    // Torso bobs up at each footfall (abs-sine gives 2 peaks per stride).
    torsoPY.push(0, 0.94 + Math.abs(Math.sin(t)) * 0.022, 0);
  }

  return new THREE.AnimationClip('Walking', duration, [
    new THREE.QuaternionKeyframeTrack('legL.quaternion',  times, legLQ),
    new THREE.QuaternionKeyframeTrack('legR.quaternion',  times, legRQ),
    new THREE.QuaternionKeyframeTrack('armL.quaternion',  times, armLQ),
    new THREE.QuaternionKeyframeTrack('armR.quaternion',  times, armRQ),
    new THREE.QuaternionKeyframeTrack('torso.quaternion', times, torsoQ),
    new THREE.VectorKeyframeTrack('torso.position',       times, torsoPY),
  ]);
}

// ---------------------------------------------------------------------------
// Humanoid character (player, NPCs, friends, enemies)
// ---------------------------------------------------------------------------
// Color keys:
//   skin  — face / hands
//   body  — cloak / upper garment
//   legs  — trousers
//   boot  — footwear (falls back to legs)
//   belt  — waist band (falls back to body)
//   inner — collar / cuffs inner layer (falls back to body)
//
// All characters use a darker, more atmospheric palette that reads well
// under The Hollow Road's point-lit night scenes.

const HUMANOID_CONFIGS = {
  // Lantern Bearer — deep midnight cloak, worn leather, weathered skin
  player:        { body: 0x1e2030, legs: 0x181820, skin: 0xb08058, boot: 0x120e0a, belt: 0x3a2414, inner: 0x2e1e10 },
  // Brother — dusty travelling coat, earthy tones
  brother:       { body: 0x2e2820, legs: 0x221c14, skin: 0xb88c60, boot: 0x181008, belt: 0x342214 },
  // Mira — deep burgundy cloak, pale skin
  friendMira:    { body: 0x3a1a24, legs: 0x241018, skin: 0xc89070, boot: 0x180a10, belt: 0x301420 },
  // Tomas — forest-green coat
  friendTomas:   { body: 0x1e2c14, legs: 0x161e0e, skin: 0xa87840, boot: 0x100e08, belt: 0x28200c },
  // Elen — slate-blue travelling dress
  friendElen:    { body: 0x1e2838, legs: 0x141c24, skin: 0xc09878, boot: 0x0e1218, belt: 0x242c38 },
  // Lantern NPC — aged leather and soot-dark fabrics
  npcLantern:    { body: 0x221808, legs: 0x161008, skin: 0xa07040, boot: 0x0e0804, belt: 0x2e1a08 },
  // Older Man — grey woollen layers
  npcOlderMan:   { body: 0x2c2820, legs: 0x201c16, skin: 0xb09878, boot: 0x14100c, belt: 0x282418 },
  // Broad-shouldered — heavy dark coat
  npcBroad:      { body: 0x281c10, legs: 0x1c1408, skin: 0x986040, boot: 0x100806, belt: 0x301808 },
  // Symmetrical figure — cold blue-grey
  npcSymmetrical:{ body: 0x242c38, legs: 0x181e28, skin: 0xb8b0a0, boot: 0x101420, belt: 0x2c3440 },
  // Veil Wanderer — near-black robes, ashen skin
  veilWanderer:  { body: 0x10101a, legs: 0x0a0a12, skin: 0x68606e, boot: 0x08080e, belt: 0x141420 },
};

export function buildHumanoidFallback(key) {
  const cfg = HUMANOID_CONFIGS[key] || { body: 0x706858, legs: 0x3a3028, skin: 0xb09070 };

  const bootColor  = cfg.boot  ?? cfg.legs;
  const beltColor  = cfg.belt  ?? cfg.body;
  const innerColor = cfg.inner ?? cfg.body;

  // Per-character MeshStandardMaterial — reads well under lantern point-lights.
  const mBody  = charMat(cfg.body,  0.90);
  const mLegs  = charMat(cfg.legs,  0.92);
  const mSkin  = charMat(cfg.skin,  0.78);
  const mBoot  = charMat(bootColor, 0.95);
  const mBelt  = charMat(beltColor, 0.94);
  const mInner = charMat(innerColor, 0.91);

  const g = new THREE.Group();
  g.name = 'ProceduralHumanoid';

  // ── HEAD ─────────────────────────────────────────────────────────────────
  // Low-poly sphere instead of a box: immediately less cube-like.
  const head = mk(new THREE.SphereGeometry(0.165, 8, 6), mSkin, 'head');
  head.position.set(0, 1.72, 0);
  g.add(head);

  // Hood cap — flattened sphere sitting over the top/back of the head.
  const hood = mk(new THREE.SphereGeometry(0.175, 8, 5), mBody, 'hood');
  hood.scale.set(1.0, 0.54, 1.0);
  hood.position.set(0, 1.80, -0.02);
  g.add(hood);

  // Neck
  const neck = mk(new THREE.CylinderGeometry(0.062, 0.072, 0.13, 8), mSkin, 'neck');
  neck.position.set(0, 1.60, 0);
  g.add(neck);

  // ── TORSO (Group — pivot at waist so upper-body sway looks correct) ──────
  // The group position IS the animated pivot; geometry offsets hang from it.
  const torsoG = new THREE.Group();
  torsoG.name = 'torso';
  torsoG.position.set(0, 0.94, 0);   // set once here; Y also driven by walk clip bob
  g.add(torsoG);

  // Main chest — tapered cylinder (wider at shoulders, narrower at waist).
  const chest = mk(new THREE.CylinderGeometry(0.200, 0.172, 0.54, 9), mBody, 'chest');
  chest.position.set(0, 0.27, 0);    // world y ≈ 1.21
  torsoG.add(chest);

  // Inner layer visible at collar opening.
  const collar = mk(new THREE.CylinderGeometry(0.125, 0.182, 0.09, 9), mInner, 'collar');
  collar.position.set(0, 0.52, 0);
  torsoG.add(collar);

  // Cloak panel on the back — flat box, slightly proud of the chest geo.
  const cloakBack = mk(new THREE.BoxGeometry(0.40, 0.44, 0.04), mBody, 'cloakBack');
  cloakBack.position.set(0, 0.24, -0.19);
  torsoG.add(cloakBack);

  // Shoulder pads — flattened spheres over each shoulder socket.
  for (const sx of [-0.22, 0.22]) {
    const side = sx < 0 ? 'L' : 'R';
    const pad = mk(new THREE.SphereGeometry(0.098, 7, 4), mBody, `shoulderPad${side}`);
    pad.scale.set(0.95, 0.60, 0.88);
    pad.position.set(sx, 0.52, 0);
    torsoG.add(pad);
  }

  // Belt — inside torsoG so it counter-rotates with the upper body sway.
  const beltMesh = mk(new THREE.BoxGeometry(0.40, 0.064, 0.23), mBelt, 'belt');
  beltMesh.position.set(0, -0.01, 0);   // world y ≈ 0.93
  torsoG.add(beltMesh);

  // Small buckle nub
  const buckle = mk(new THREE.BoxGeometry(0.055, 0.055, 0.04), charMat(0x3a3428, 0.70), 'buckle');
  buckle.position.set(0, -0.01, 0.12);
  torsoG.add(buckle);

  // ── ARMS — Groups pivot at each shoulder socket ───────────────────────────
  // Because the pivot is at the shoulder, the AnimationMixer quaternion track
  // produces a natural swing rather than the old mid-arm rotation.
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const armG = new THREE.Group();
    armG.name = `arm${side}`;
    armG.position.set(sx * 0.262, 1.46, 0);
    g.add(armG);

    // Upper arm — tapered cylinder
    const upper = mk(new THREE.CylinderGeometry(0.062, 0.052, 0.34, 8), mBody, `upperArm${side}`);
    upper.position.set(0, -0.19, 0);
    armG.add(upper);

    // Elbow joint sphere
    const elbow = mk(new THREE.SphereGeometry(0.052, 6, 4), mBody, `elbow${side}`);
    elbow.position.set(0, -0.37, 0);
    armG.add(elbow);

    // Forearm — slightly narrower, different colour (inner layer sleeve)
    const fore = mk(new THREE.CylinderGeometry(0.048, 0.040, 0.28, 8), mInner, `forearm${side}`);
    fore.position.set(0, -0.54, 0);
    armG.add(fore);

    // Hand — small sphere
    const hand = mk(new THREE.SphereGeometry(0.046, 6, 5), mSkin, `hand${side}`);
    hand.position.set(0, -0.70, 0.01);
    armG.add(hand);
  }

  // ── LEGS — Groups pivot at each hip socket ────────────────────────────────
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const legG = new THREE.Group();
    legG.name = `leg${side}`;
    legG.position.set(sx * 0.127, 0.90, 0);
    g.add(legG);

    // Thigh — slightly wider at hip
    const thigh = mk(new THREE.CylinderGeometry(0.090, 0.076, 0.36, 8), mLegs, `thigh${side}`);
    thigh.position.set(0, -0.20, 0);
    legG.add(thigh);

    // Knee sphere
    const knee = mk(new THREE.SphereGeometry(0.076, 6, 5), mLegs, `knee${side}`);
    knee.position.set(0, -0.40, 0);
    legG.add(knee);

    // Shin — slightly narrower
    const shin = mk(new THREE.CylinderGeometry(0.072, 0.060, 0.30, 8), mLegs, `shin${side}`);
    shin.position.set(0, -0.57, 0);
    legG.add(shin);

    // Boot — box, extended forward so there's a visible toe
    const boot = mk(new THREE.BoxGeometry(0.148, 0.088, 0.22), mBoot, `boot${side}`);
    boot.position.set(0, -0.745, 0.025);
    legG.add(boot);

    // Boot toe-cap — small forward nub
    const toe = mk(new THREE.BoxGeometry(0.120, 0.068, 0.09), mBoot, `toe${side}`);
    toe.position.set(0, -0.750, 0.145);
    legG.add(toe);
  }

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
