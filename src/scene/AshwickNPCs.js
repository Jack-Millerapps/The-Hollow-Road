import * as THREE from 'three';
import { state } from '../state.js';
import { DayNight } from './DayNight.js';
import { Travel } from '../game/Travel.js';
import { QuestSystem } from '../game/QuestSystem.js';
import { DialoguePanel } from '../ui/DialoguePanel.js';
import { AshwickWorld, getQuestMeshes } from './AshwickTown.js';
import { ModelLoader } from './ModelLoader.js';
import { ChunkManager } from '../game/ChunkManager.js';

const NPC_SCALE = 1.55;

const MZ = AshwickWorld.MILL_Z;
const SPEED = 0.6;
const AI_INTERVAL = 0.5;
const INTERACT_R = 2;
const LABEL_R = 3;

const cabinAngles = [0.2, 1.1, 2.0, 3.35, 4.5, 5.4];
const cabinRs = [19, 22, 20, 24, 21, 23];

function cabinWorld(i) {
  const a = cabinAngles[i % 6];
  const r = cabinRs[i % 6];
  return { x: Math.cos(a) * r, z: MZ + Math.sin(a) * r };
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

// Tint a SkinnedMesh's materials so the same biped reads as different villagers.
function tintMaterials(root, color) {
  const c = new THREE.Color(color);
  root.traverse((o) => {
    if (!o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m.color) continue;
      // Multiplicative tint: keeps texture detail but shifts hue.
      m.color.multiply(c);
    }
  });
}

function humanoid(opts) {
  const g = new THREE.Group();
  g.userData.walking = false;
  g.userData.mixer = null;
  g.userData.actions = null;

  // Default biped — npcSymmetrical reads as a generic townsperson and is
  // visually distinct from the player's lantern bearer.
  const modelKey = opts.model || 'npcSymmetrical';
  const tintColor = opts.cloak || 0xffffff;

  ModelLoader.ensure(modelKey)
    .then(() => {
      const inst = ModelLoader.instantiate(modelKey);
      if (!inst) return;
      inst.root.scale.setScalar(NPC_SCALE);
      // Apply a per-NPC tint so each role reads visually distinct even when
      // the underlying biped pool is small.
      if (tintColor !== 0xffffff) tintMaterials(inst.root, tintColor);
      g.add(inst.root);
      g.userData.mixer = inst.mixer;
      g.userData.actions = inst.actions;
      if (inst.actions?.walk) {
        const wa = inst.actions.walk;
        wa.reset();
        wa.enabled = true;
        wa.setEffectiveWeight(1);
        wa.setEffectiveTimeScale(1);
        wa.play();
        // Random mid-stride seed so each villager freezes at a different
        // pose rather than every NPC sharing the start frame.
        const dur = wa.getClip()?.duration || 0;
        if (dur > 0) wa.time = Math.random() * dur;
        // Sample the pose first, then freeze.
        inst.mixer?.update(0);
        wa.paused = true;
      }
    })
    .catch((e) => console.warn(`[AshwickNPCs] ${modelKey} failed`, e));

  // Small accessory hints stay procedural (tiny boxes, low cost).
  if (opts.apron) {
    const ap = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.7, 0.36),
      new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 1 }),
    );
    ap.position.set(0, 1.05, 0.22);
    ap.castShadow = true;
    g.add(ap);
  }
  if (opts.hat) {
    const hat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.32, 0.22, 8),
      new THREE.MeshStandardMaterial({ color: opts.hat, roughness: 0.9 }),
    );
    hat.position.y = 2.05;
    g.add(hat);
  }
  return g;
}

/** @type {THREE.Scene | null} */
let _scene = null;
/** @type {THREE.Group | null} */
let _root = null;
let _npcs = [];
let _aiAccum = 0;
let _prevE = false;

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
  const w = (x, z) => ({ x, z });

  // 0 Aldric — miller / quest
  list.push({
    id: 'aldric',
    name: 'Aldric',
    role: 'miller',
    homeCabin: 0,
    group: humanoid({ model: 'npcOlderMan', cloak: 0xb89c70, apron: true }),
    dayWaypoints: [w(0, MZ), w(0, MZ - 12), w(-2, MZ)],
    nightPos: w(-8, MZ),
    millPos: w(1.2, MZ + 0.5),
  });

  // 1 Maren
  list.push({
    id: 'maren',
    name: 'Maren',
    role: 'neighbor',
    homeCabin: 1,
    group: humanoid({ model: 'friendMira', cloak: 0xc89890, hat: 0x2a1020 }),
    dayWaypoints: [w(-10, MZ), w(-6, MZ + 2)],
    evePos: w(12, MZ - 10),
    nightPos: cabinWorld(1),
  });

  // 2 Dov — smith
  list.push({
    id: 'dov',
    name: 'Dov',
    role: 'smith',
    homeCabin: 2,
    group: humanoid({ model: 'npcBroad', cloak: 0x9c8870 }),
    dayWaypoints: [w(-12, MZ - 15), w(-10, MZ - 17)],
    nightPos: cabinWorld(2),
    hammer: true,
  });

  // 3 Sera — tavern
  list.push({
    id: 'sera',
    name: 'Sera',
    role: 'tavern',
    homeCabin: 3,
    group: humanoid({ model: 'friendElen', cloak: 0xb09cb8, hat: 0x1a1028 }),
    dayWaypoints: [w(10, MZ - 10), w(8, MZ - 8)],
    mornPos: w(10, MZ - 8),
    nightPos: cabinWorld(3),
  });

  // 4 Old Pell
  list.push({
    id: 'pell',
    name: 'Old Pell',
    role: 'lore',
    homeCabin: 4,
    group: humanoid({ model: 'npcOlderMan', cloak: 0xa8a89c }),
    dayWaypoints: [w(4, MZ - 5)],
    nightPos: cabinWorld(4),
    sway: true,
  });

  // 5–6 vendors
  const stallXs = [-12, -8, -4, 0, 4, 8];
  list.push({
    id: 'vendorA',
    name: 'Market vendor',
    role: 'vendor',
    homeCabin: 0,
    group: humanoid({ model: 'friendTomas', cloak: 0xb0c898 }),
    dayWaypoints: [w(stallXs[0], MZ + 10)],
    nightPos: cabinWorld(0),
  });
  list.push({
    id: 'vendorB',
    name: 'Market vendor',
    role: 'vendor',
    homeCabin: 1,
    group: humanoid({ model: 'npcSymmetrical', cloak: 0x98b0c8 }),
    dayWaypoints: [w(stallXs[3], MZ + 10)],
    nightPos: cabinWorld(1),
  });

  // 7–10 roamers
  const roamerTints = [0xc8a890, 0xb0a890, 0xc0a890, 0xa8b0a0];
  const roamerModels = ['npcSymmetrical', 'npcOlderMan', 'friendMira', 'npcBroad'];
  for (let i = 0; i < 4; i++) {
    list.push({
      id: `roam${i}`,
      name: 'Townsfolk',
      role: 'roamer',
      homeCabin: (i + 2) % 6,
      group: humanoid({ model: roamerModels[i], cloak: roamerTints[i] }),
      dayWaypoints: [
        w(-5 + i * 3, MZ - 4),
        w(8, MZ + 4),
        w(-10, MZ - 12),
        w(2, MZ + 8),
      ].slice(0, 3),
      nightPos: cabinWorld((i + 2) % 6),
    });
  }

  // 11 watchman (positions are overridden at night by patrol math; still need
  // a spawn waypoint for init + day idle at home cabin.)
  list.push({
    id: 'watch',
    name: 'Night watch',
    role: 'watch',
    homeCabin: 5,
    group: humanoid({ model: 'npcSymmetrical', cloak: 0x6c7890, hat: 0x0a0a14 }),
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

const _lerpV = new THREE.Vector3();

function _stepMixer(n, delta) {
  const ud = n.group?.userData;
  if (!ud?.mixer) return;
  const wa = ud.actions?.walk;
  if (wa) {
    wa.enabled = true;
    wa.setEffectiveWeight(1);
    if (ud.walking && wa.paused) wa.paused = false;
    else if (!ud.walking && !wa.paused) wa.paused = true;
  }
  ud.mixer.update(delta);
}

function spawnWaypoint(n) {
  const p = n.dayWaypoints?.[0] ?? n.nightPos ?? { x: AshwickWorld.MILL_X, z: MZ };
  return { x: Number(p.x) || 0, z: Number(p.z) || MZ };
}

export const AshwickNPCs = {
  init(_scene) { /* NPCs disabled */ },

  update(delta, time, playerPos) {
    return; // all NPCs removed
    /* eslint-disable no-unreachable */
    if (!_root || state.currentScene !== 'world' || !playerPos) return;
    const dx = playerPos.x - AshwickWorld.MILL_X;
    const dz = playerPos.z - MZ;
    if (dx * dx + dz * dz > 420 * 420) return;

    const px = playerPos.x;
    const pz = playerPos.z;
    const phase = phaseName();
    const home = atHomePhase();
    const dayish = morningPhase();

    let nearestInteract = null;
    let nearestD2 = INTERACT_R * INTERACT_R;

    _aiAccum += delta;
    const aiTick = _aiAccum >= AI_INTERVAL;
    if (aiTick) _aiAccum = 0;

    for (const n of _npcs) {
      const prevX = n.group.position.x;
      const prevZ = n.group.position.z;

      if (n.role === 'watch') {
        n.group.visible = phase === 'night' || (phase === 'sunset' && DayNight.getPhaseProgress?.() > 0.4);
        if (!n.group.visible) {
          const h = n.nightPos;
          n.group.position.set(h.x, 0, h.z);
          n.group.userData.walking = false;
          continue;
        }
        const t = time * 0.15;
        const rx = AshwickWorld.MILL_X + Math.cos(t) * 34;
        const rz = MZ + Math.sin(t) * 28;
        n.group.position.set(rx, 0, rz);
        n.group.rotation.y = Math.atan2(px - rx, pz - rz);
        // Watchman is always patrolling — drive walk anim only if onscreen.
        const moved = Math.hypot(rx - prevX, rz - prevZ);
        n.group.userData.walking = moved > 0.001;
        if (ChunkManager.isPointInFrustum(rx, 1, rz, 2.5)) _stepMixer(n, delta);
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

      // Frustum cull: skip mixer + waypoint walk math for offscreen NPCs.
      // Interact/label checks below still run so [E] prompt stays correct.
      const onScreen = ChunkManager.isPointInFrustum(
        n.group.position.x, 1, n.group.position.z, 2.5,
      );

      if (onScreen) {
        // Evening: Maren toward tavern
        if (n.id === 'maren' && phase === 'sunset' && n.evePos) {
          const ep = n.evePos;
          n.group.position.lerp(_lerpV.set(ep.x, 0, ep.z), delta * 0.35);
        }

        // Sunrise: Sera outside tavern briefly
        if (n.id === 'sera' && phase === 'sunrise' && n.mornPos) {
          const mp = n.mornPos;
          n.group.position.lerp(_lerpV.set(mp.x, 0, mp.z), delta * 0.4);
        }
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

      if (onScreen) {
        const cur = wps[n.wpIndex % wps.length];
        if (cur && time >= n.pauseUntil) {
          const gx = n.group.position.x;
          const gz = n.group.position.z;
          const step = SPEED * delta;
          const vx = cur.x - gx;
          const vz = cur.z - gz;
          const len = Math.hypot(vx, vz) || 1;
          n.group.position.x += (vx / len) * Math.min(step, len);
          n.group.position.z += (vz / len) * Math.min(step, len);
          n.group.rotation.y = Math.atan2(px - n.group.position.x, pz - n.group.position.z);
        }

        if (n.id === 'aldric' && dayish && phase === 'day') {
          const mp = n.millPos;
          n.group.position.lerp(_lerpV.set(mp.x, 0, mp.z), delta * 0.12);
        }

        if (n.sway) {
          n.group.rotation.z = Math.sin(time * 1.2) * 0.04;
        }

        const movedDist = Math.hypot(n.group.position.x - prevX, n.group.position.z - prevZ);
        n.group.userData.walking = movedDist > delta * 0.05;
        _stepMixer(n, delta);
      } else {
        n.group.userData.walking = false;
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
