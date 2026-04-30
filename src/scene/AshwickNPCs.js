import * as THREE from 'three';
import { state } from '../state.js';
import { DayNight } from './DayNight.js';
import { Travel } from '../game/Travel.js';
import { QuestSystem } from '../game/QuestSystem.js';
import { DialoguePanel } from '../ui/DialoguePanel.js';
import { AshwickWorld, getQuestMeshes } from './AshwickTown.js';
import { Collision } from '../game/Collision.js';

// Ashwick town-model center: the GLB is loaded with dx=-30 offset, so the
// building cluster is centered around (-30, MILL_Z). NPCs anchor here, not at
// MILL_X=0, so their waypoints land in town instead of in the road grass.
const MX = AshwickWorld.MILL_X - 30;
const MZ = AshwickWorld.MILL_Z;
const SPEED = 0.6;
const AI_INTERVAL = 0.5;
const INTERACT_R = 2;
const LABEL_R = 3;
const NPC_RADIUS = 0.55;
const SAFETY_SEARCH_MAX_R = 18;
const SAFETY_RING_STEP = 0.85;

function isBlocked(x, z, r = NPC_RADIUS) {
  // If collision hasn't been registered yet (GLB still loading), treat as free.
  if (!Collision?.count || Collision.count() === 0) return false;
  return Collision.hits(x, z, r);
}

function snapToSafeXZ(pos, { r = NPC_RADIUS, maxR = SAFETY_SEARCH_MAX_R } = {}) {
  const x0 = pos.x;
  const z0 = pos.z;
  if (!isBlocked(x0, z0, r)) return { x: x0, z: z0 };

  // Concentric rings; enough samples per ring to escape voxelized geometry.
  for (let ring = 1; ring * SAFETY_RING_STEP <= maxR; ring++) {
    const rr = ring * SAFETY_RING_STEP;
    const samples = Math.max(10, Math.floor((2 * Math.PI * rr) / 1.1));
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      const x = x0 + Math.cos(a) * rr;
      const z = z0 + Math.sin(a) * rr;
      if (!isBlocked(x, z, r)) return { x, z };
    }
  }
  return { x: x0, z: z0 };
}

const cabinAngles = [0.2, 1.1, 2.0, 3.35, 4.5, 5.4];
const cabinRs = [14, 16, 15, 17, 15, 16];

function cabinWorld(i) {
  const a = cabinAngles[i % 6];
  const r = cabinRs[i % 6];
  return { x: MX + Math.cos(a) * r, z: MZ + Math.sin(a) * r };
}

function makeNameSprite(text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = 'rgba(200,170,120,0.5)';
  ctx.strokeRect(2, 2, c.width - 4, c.height - 4);
  ctx.fillStyle = '#e8dcc8';
  ctx.font = 'italic 22px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(2.2, 0.55, 1);
  sp.visible = false;
  return sp;
}

function humanoid(opts) {
  const g = new THREE.Group();
  const cloak = new THREE.Color(opts.cloak);
  const skin = new THREE.Color(opts.skin || 0xc8a888);
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.4, 0.95, 10),
    new THREE.MeshStandardMaterial({ color: cloak, roughness: 0.9 }),
  );
  torso.position.y = 1.0;
  torso.castShadow = true;
  g.add(torso);
  if (opts.apron) {
    const ap = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.7, 0.36),
      new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 1 }),
    );
    ap.position.set(0, 0.85, 0.22);
    ap.castShadow = true;
    g.add(ap);
    for (let i = 0; i < 3; i++) {
      const dust = new THREE.Mesh(
        new THREE.PlaneGeometry(0.12, 0.1),
        new THREE.MeshStandardMaterial({
          color: 0xddd0c0,
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide,
        }),
      );
      dust.position.set(-0.1 + i * 0.1, 0.9 + Math.random() * 0.15, 0.41);
      g.add(dust);
    }
  }
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 12),
    new THREE.MeshStandardMaterial({ color: skin, roughness: 0.85 }),
  );
  head.position.y = 1.65;
  head.castShadow = true;
  g.add(head);
  if (opts.hat) {
    const hat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.32, 0.22, 8),
      new THREE.MeshStandardMaterial({ color: opts.hat, roughness: 0.9 }),
    );
    hat.position.y = 1.88;
    g.add(hat);
  }
  const legGeo = new THREE.CylinderGeometry(0.1, 0.11, 0.55, 6);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 1 });
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.14, 0.28, 0);
  legL.castShadow = true;
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  g.add(legR);
  const armL = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.08, 0.55, 6),
    new THREE.MeshStandardMaterial({ color: cloak, roughness: 0.9 }),
  );
  armL.position.set(-0.48, 1.05, 0);
  armL.rotation.z = 0.25;
  armL.castShadow = true;
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.48;
  armR.rotation.z = -0.25;
  g.add(armR);
  g.userData.torso = torso;
  g.userData.armR = armR;
  return g;
}

/** @type {THREE.Scene | null} */
let _scene = null;
/** @type {THREE.Group | null} */
let _root = null;
let _npcs = [];
let _aiAccum = 0;
let _prevE = false;
let _lastCollisionCount = -1;

function phaseName() {
  return DayNight.getCurrentPhase?.() || 'day';
}

function atHomePhase() {
  const p = phaseName();
  return p === 'night' || (p === 'sunset' && DayNight.getPhaseProgress?.() > 0.55);
}

function morningPhase() {
  const p = phaseName();
  return p === 'day' || (p === 'sunrise' && DayNight.getPhaseProgress?.() > 0.35);
}

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function npcDialogue(npc, body, extraButtons = []) {
  DialoguePanel.open({
    title: npc.name,
    body,
    buttons: [
      ...extraButtons,
      { label: 'Goodbye.', onClick: () => DialoguePanel.close() },
    ],
  });
}

function buildNpcList() {
  const list = [];
  const w = (x, z) => ({ x: MX + x, z });

  // 0 Aldric — miller / quest
  list.push({
    id: 'aldric',
    name: 'Aldric',
    role: 'miller',
    homeCabin: 0,
    group: humanoid({ cloak: 0x4a3018, skin: 0xc8a090, apron: true }),
    dayWaypoints: [w(0, MZ), w(0, MZ - 8), w(-2, MZ)],
    nightPos: w(-6, MZ),
    millPos: w(1.2, MZ + 0.5),
  });

  // 1 Maren
  list.push({
    id: 'maren',
    name: 'Maren',
    role: 'neighbor',
    homeCabin: 1,
    group: humanoid({ cloak: 0x5a2a4a, hat: 0x2a1020 }),
    dayWaypoints: [w(-7, MZ), w(-4, MZ + 2)],
    evePos: w(8, MZ - 7),
    nightPos: cabinWorld(1),
  });

  // 2 Dov — smith
  list.push({
    id: 'dov',
    name: 'Dov',
    role: 'smith',
    homeCabin: 2,
    group: humanoid({ cloak: 0x2a2820, skin: 0xb89880 }),
    dayWaypoints: [w(-8, MZ - 10), w(-6, MZ - 12)],
    nightPos: cabinWorld(2),
    hammer: true,
  });

  // 3 Sera — tavern
  list.push({
    id: 'sera',
    name: 'Sera',
    role: 'tavern',
    homeCabin: 3,
    group: humanoid({ cloak: 0x4a3a60, hat: 0x1a1028 }),
    dayWaypoints: [w(7, MZ - 7), w(5, MZ - 5)],
    mornPos: w(7, MZ - 5),
    nightPos: cabinWorld(3),
  });

  // 4 Old Pell
  list.push({
    id: 'pell',
    name: 'Old Pell',
    role: 'lore',
    homeCabin: 4,
    group: humanoid({ cloak: 0x3a3a30, skin: 0xa89888 }),
    dayWaypoints: [w(3, MZ - 4)],
    nightPos: cabinWorld(4),
    sway: true,
  });

  // 5–6 roamers (kept down to two so the village feels lived-in but not
  // crowded). Waypoints stay tight inside the building cluster.
  const roamerColors = [0x5a4030, 0x403a28];
  const roamerPaths = [
    [w(-3, MZ - 3), w(5, MZ + 2), w(-6, MZ - 8)],
    [w(0, MZ - 2), w(-7, MZ + 3), w(2, MZ - 9)],
  ];
  for (let i = 0; i < roamerColors.length; i++) {
    list.push({
      id: `roam${i}`,
      name: 'Townsfolk',
      role: 'roamer',
      homeCabin: (i + 2) % 6,
      group: humanoid({ cloak: roamerColors[i] }),
      dayWaypoints: roamerPaths[i],
      nightPos: cabinWorld((i + 2) % 6),
    });
  }

  // 7 watchman (positions are overridden at night by patrol math; still need
  // a spawn waypoint for init + day idle at home cabin.)
  list.push({
    id: 'watch',
    name: 'Night watch',
    role: 'watch',
    homeCabin: 5,
    group: humanoid({ cloak: 0x1a2030, hat: 0x0a0a14 }),
    patrol: true,
    dayWaypoints: [cabinWorld(5)],
    nightPos: cabinWorld(5),
  });

  for (const n of list) {
    n.label = makeNameSprite(n.name);
    n.label.position.y = 2.15;
    n.group.add(n.label);
    n.wpIndex = 0;
    n.pauseUntil = 0;
    n._visible = true;
  }
  return list;
}

function spawnWaypoint(n) {
  const p = n.dayWaypoints?.[0] ?? n.nightPos ?? { x: AshwickWorld.MILL_X, z: MZ };
  const raw = { x: Number(p.x) || 0, z: Number(p.z) || MZ };
  return snapToSafeXZ(raw);
}

export const AshwickNPCs = {
  init(scene) {
    if (!scene?.add) return;
    _scene = scene;
    if (_root) _root.removeFromParent();
    _root = new THREE.Group();
    _root.name = 'AshwickNPCs';
    scene.add(_root);
    _npcs = buildNpcList();
    for (const n of _npcs) {
      if (!n?.group) continue;
      const wp0 = spawnWaypoint(n);
      n.group.position.set(wp0.x, 0, wp0.z);
      n._spawnSafeChecked = false;
      _root.add(n.group);
    }
    _aiAccum = 0;
    _prevE = false;
    _lastCollisionCount = -1;
  },

  update(delta, time, playerPos) {
    if (!_root || state.currentScene !== 'world' || !playerPos) return;
    const dx = playerPos.x - AshwickWorld.MILL_X;
    const dz = playerPos.z - MZ;
    if (dx * dx + dz * dz > 420 * 420) return;

    const px = playerPos.x;
    const pz = playerPos.z;
    const phase = phaseName();
    const home = atHomePhase();
    const dayish = morningPhase();

    // GLB collision registers asynchronously (voxelization runs after load).
    // Once colliders appear, make sure nobody is sitting inside a model.
    const colCount = Collision?.count?.() ?? 0;
    const collisionJustLoaded = colCount > 0 && colCount !== _lastCollisionCount;
    _lastCollisionCount = colCount;

    let nearestInteract = null;
    let nearestD2 = INTERACT_R * INTERACT_R;

    _aiAccum += delta;
    const aiTick = _aiAccum >= AI_INTERVAL;
    if (aiTick) _aiAccum = 0;

    for (const n of _npcs) {
      if (collisionJustLoaded || !n._spawnSafeChecked) {
        const gx0 = n.group.position.x;
        const gz0 = n.group.position.z;
        if (isBlocked(gx0, gz0, NPC_RADIUS)) {
          const safe0 = snapToSafeXZ({ x: gx0, z: gz0 });
          n.group.position.set(safe0.x, 0, safe0.z);
        }
        n._spawnSafeChecked = true;
      }

      if (n.role === 'watch') {
        n.group.visible = phase === 'night' || (phase === 'sunset' && DayNight.getPhaseProgress?.() > 0.4);
        if (!n.group.visible) {
          const h = n.nightPos;
          n.group.position.set(h.x, 0, h.z);
          continue;
        }
        const t = time * 0.15;
        const rx = MX + Math.cos(t) * 18;
        const rz = MZ + Math.sin(t) * 14;
        const safe = snapToSafeXZ({ x: rx, z: rz });
        n.group.position.set(safe.x, 0, safe.z);
        const tx = MX + Math.cos(t + 0.3) * 18;
        const tz = MZ + Math.sin(t + 0.3) * 14;
        n.group.lookAt(tx, n.group.position.y, tz);
        const d2 = dist2(px, pz, rx, rz);
        if (d2 < nearestD2) {
          nearestD2 = d2;
          nearestInteract = n;
        }
        continue;
      }

      if (home) {
        const h = n.nightPos || cabinWorld(n.homeCabin);
        n.group.visible = false;
        n.group.position.set(h.x, -50, h.z);
        n._hidHome = true;
        continue;
      }
      n.group.visible = true;
      if (n._hidHome) {
        const wp = spawnWaypoint(n);
        n.group.position.set(wp.x, 0, wp.z);
        n._hidHome = false;
      }

      // Evening: Maren toward tavern
      if (n.id === 'maren' && phase === 'sunset' && n.evePos) {
        const ep = n.evePos;
        n.group.position.lerp(new THREE.Vector3(ep.x, 0, ep.z), delta * 0.35);
      }

      // Sunrise: Sera outside tavern briefly
      if (n.id === 'sera' && phase === 'sunrise' && n.mornPos) {
        const mp = n.mornPos;
        n.group.position.lerp(new THREE.Vector3(mp.x, 0, mp.z), delta * 0.4);
      }

      const wps = n.dayWaypoints;
      if (!wps?.length) continue;

      if (aiTick) {
        const curWp = wps[n.wpIndex % wps.length];
        if (curWp) {
          const gx = n.group.position.x;
          const gz = n.group.position.z;
          if (dist2(gx, gz, curWp.x, curWp.z) < 0.5) {
            n.wpIndex = (n.wpIndex + 1) % wps.length;
            n.pauseUntil = time + 2 + Math.random() * 3;
          }
        }
      }

      const cur = wps[n.wpIndex % wps.length];
      if (!cur) continue;
      const d2player = dist2(px, pz, n.group.position.x, n.group.position.z);
      if (time >= n.pauseUntil) {
        const gx = n.group.position.x;
        const gz = n.group.position.z;
        const step = SPEED * delta;
        const vx = cur.x - gx;
        const vz = cur.z - gz;
        const len = Math.hypot(vx, vz) || 1;
        n.group.position.x += (vx / len) * Math.min(step, len);
        n.group.position.z += (vz / len) * Math.min(step, len);

        if (isBlocked(n.group.position.x, n.group.position.z, NPC_RADIUS)) {
          const safe = snapToSafeXZ({ x: n.group.position.x, z: n.group.position.z });
          n.group.position.set(safe.x, 0, safe.z);
          n.pauseUntil = Math.min(n.pauseUntil, time + 0.25);
        }
        // Face walk direction; only turn to the player if they are close.
        if (d2player < LABEL_R * LABEL_R) {
          n.group.lookAt(px, n.group.position.y, pz);
        } else {
          n.group.lookAt(cur.x, n.group.position.y, cur.z);
        }
      } else if (d2player < LABEL_R * LABEL_R) {
        n.group.lookAt(px, n.group.position.y, pz);
      }

      if (n.id === 'aldric' && dayish && phase === 'day') {
        const mp = n.millPos;
        n.group.position.lerp(new THREE.Vector3(mp.x, 0, mp.z), delta * 0.12);
      }

      if (n.hammer && n.group.userData.armR) {
        n.group.userData.armR.rotation.x = Math.sin(time * 8) * 0.65 - 0.3;
      }
      if (n.sway) {
        n.group.rotation.z = Math.sin(time * 1.2) * 0.04;
      }

      const d2p = dist2(px, pz, n.group.position.x, n.group.position.z);
      n.label.visible = d2p < LABEL_R * LABEL_R;

      if (d2p < INTERACT_R * INTERACT_R && n.group.visible) {
        if (d2p < nearestD2) {
          nearestD2 = d2p;
          nearestInteract = n;
        }
      }
    }

    const keys = Travel.keys;
    const eDown = keys?.has?.('e') ?? false;
    const eEdge = eDown && !_prevE;
    _prevE = eDown;

    if (eEdge && !state.dialogueActive) {
      if (nearestInteract && nearestInteract.group.visible) {
        this._talkTo(nearestInteract);
      } else {
        const { grave, page, shrine } = getQuestMeshes();
        if (grave && dist2(px, pz, AshwickWorld.GRAVE_X, AshwickWorld.GRAVE_Z) < 9) {
          QuestSystem.tryAshwickGrave();
        } else if (page && dist2(px, pz, AshwickWorld.PAGE_X, AshwickWorld.PAGE_Z) < 6) {
          QuestSystem.tryAshwickPage();
        } else if (shrine) {
          const sx = AshwickWorld.CAVE_X + shrine.position.x;
          const sz = AshwickWorld.CAVE_Z + shrine.position.z;
          if (dist2(px, pz, sx, sz) < 16) QuestSystem.tryAshwickShrine();
        }
      }
    }

    if (nearestInteract && nearestInteract.group.visible) {
      Travel._showSoftPrompt?.('[E] Talk');
    }
  },

  _talkTo(n) {
    if (n.id === 'aldric') {
      QuestSystem.talkAshwickMiller();
      return;
    }
    if (n.id === 'maren') {
      QuestSystem.markAshwickVillager('maren');
      npcDialogue(
        n,
        "Aldric's boy went east three seasons ago. He was looking for something in the hills.",
      );
      return;
    }
    if (n.id === 'dov') {
      QuestSystem.markAshwickVillager('dov');
      npcDialogue(
        n,
        "I made him a knife before he left. He said he was following a sound. I thought he meant music.",
      );
      return;
    }
    if (n.id === 'sera') {
      QuestSystem.markAshwickVillager('sera');
      npcDialogue(
        n,
        "He came in the night before he left. He didn't eat. Just sat by the window facing east.",
      );
      return;
    }
    if (n.id === 'pell') {
      npcDialogue(
        n,
        'This road was old when I was young. They say the hollow listens. I say the hollow remembers.',
      );
      return;
    }
    if (n.role === 'vendor') {
      npcDialogue(
        n,
        'Grain from the east, salt from the west. Prices are what they are. The road takes its cut too.',
      );
      return;
    }
    if (n.role === 'roamer') {
      const lines = [
        'Goblins have been bolder lately. Keep your pack tied.',
        'They say the Veil Market moves. I would not chase it.',
        'Smells like rain. My bones never lie.',
        'The mill wheel… you get used to the sound. Until you do not.',
      ];
      npcDialogue(n, lines[Math.floor(Math.random() * lines.length)]);
      return;
    }
    if (n.role === 'watch') {
      npcDialogue(
        n,
        "Don't go east at night. There's a cave out there. Things in it aren't friendly.",
      );
    }
  },
};
