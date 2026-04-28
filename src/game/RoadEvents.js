import * as THREE from 'three';
import { state, spend, gain, canAfford, notify } from '../state.js';
import { roadEvents } from '../data/roadEvents.js';
import { DialoguePanel } from '../ui/DialoguePanel.js';
import { ROAD_SEGMENTS_DATA } from '../scene/Road.js';
import { ChunkManager } from './ChunkManager.js';
import { SceneManager } from '../scene/SceneManager.js';
import { ModelLoader } from '../scene/ModelLoader.js';

// ---------------------------------------------------------------------------
// RoadEvents — random encounters with visible props; dialogue on E only.
// ---------------------------------------------------------------------------

const INTERACT_RADIUS = 4;
const SPAWN_AHEAD_MIN = 15;
const SPAWN_AHEAD_MAX = 25;
const DESPAWN_AFTER_S = 5;
const FADE_IN_S = 1;

let _scene = null;
let _hooks = { pause: () => {}, resume: () => {} };

/** Closest point on polyline (road) to (qx,qz); returns { x, z, segDirX, segDirZ }. */
function closestOnRoad(qx, qz) {
  let bestD2 = Infinity;
  let bx = qx;
  let bz = qz;
  let sdx = 0;
  let sdz = -1;
  for (const seg of ROAD_SEGMENTS_DATA) {
    const ax = seg.start.x;
    const az = seg.start.z;
    const bx0 = seg.end.x;
    const bz0 = seg.end.z;
    const dx = bx0 - ax;
    const dz = bz0 - az;
    const l2 = dx * dx + dz * dz;
    if (l2 < 1e-8) continue;
    let t = ((qx - ax) * dx + (qz - az) * dz) / l2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t;
    const pz = az + dz * t;
    const ex = qx - px;
    const ez = qz - pz;
    const d2 = ex * ex + ez * ez;
    if (d2 < bestD2) {
      bestD2 = d2;
      bx = px;
      bz = pz;
      const len = Math.sqrt(l2);
      sdx = dx / len;
      sdz = dz / len;
    }
  }
  return { x: bx, z: bz, sdx, sdz };
}

function pickSpawnXZ(px, pz, yaw) {
  const fwdX = -Math.sin(yaw);
  const fwdZ = -Math.cos(yaw);
  const dist = SPAWN_AHEAD_MIN + Math.random() * (SPAWN_AHEAD_MAX - SPAWN_AHEAD_MIN);
  const qx = px + fwdX * dist;
  const qz = pz + fwdZ * dist;
  const on = closestOnRoad(qx, qz);
  const perpX = -on.sdz;
  const perpZ = on.sdx;
  const side = (Math.random() - 0.5) * 2;
  const lateral = 1.2 + Math.random() * 2.5;
  return {
    x: on.x + perpX * side * lateral,
    z: on.z + perpZ * side * lateral,
    faceY: Math.atan2(on.sdx, on.sdz),
  };
}

// (Imports added at top of file in this same edit pass.)
function makeSpiritMaterial(hex, {
  opacity = 0.55,
  transparent = true,
  emissive = 0xaaccdd,
  emiI = 0.4,
} = {}) {
  return new THREE.MeshStandardMaterial({
    color: hex,
    transparent,
    opacity,
    emissive,
    emissiveIntensity: emiI,
    roughness: 0.85,
    metalness: 0,
    flatShading: true,
  });
}

function spawnWanderingSpirit() {
  const g = new THREE.Group();
  // Robed masked figure (GLB) with semi-transparent override for the ghostly
  // veil-wanderer effect. Falls back to invisible until the GLB resolves.
  const fadeMeshes = [];
  ModelLoader.ensure('veilWanderer')
    .then(() => {
      const inst = ModelLoader.instantiate('veilWanderer');
      if (!inst || !g.parent) return;
      inst.root.scale.setScalar(1.55);
      inst.root.traverse((o) => {
        if (!o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          m.transparent = true;
          m.opacity = 0.55;
          if ('emissive' in m) {
            m.emissive = new THREE.Color(0xaaccdd);
            m.emissiveIntensity = 0.4;
          }
        }
        if (o.isMesh || o.isSkinnedMesh) fadeMeshes.push(o);
      });
      g.add(inst.root);
      g.userData.mixer = inst.mixer;
      g.userData.actions = inst.actions;
      if (inst.actions?.walk) {
        inst.actions.walk.reset();
        inst.actions.walk.setEffectiveWeight(1);
        inst.actions.walk.play();
      }
    })
    .catch(() => {});
  g.userData.fadeMeshes = fadeMeshes;
  g.userData.bobPhase = Math.random() * Math.PI * 2;
  return g;
}

function spawnLostChild() {
  const g = new THREE.Group();
  const mat = makeSpiritMaterial(0xe8d8c0, {
    opacity: 1,
    transparent: false,
    emissive: 0xc8b8a0,
    emiI: 0.25,
  });
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.15, 0.75, 8),
    mat,
  );
  body.position.y = 0.38;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat);
  head.position.y = 0.88;
  g.add(head);
  g.scale.setScalar(0.7);
  g.userData.head = head;
  g.userData.bobPhase = Math.random() * Math.PI * 2;
  return g;
}

function spawnBrokenCart() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({
    color: 0x4a3020,
    roughness: 0.95,
    flatShading: true,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x2a1a10,
    roughness: 1,
    flatShading: true,
  });
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.9), wood);
  bed.position.set(0, 0.35, 0);
  bed.rotation.z = 0.12;
  g.add(bed);
  const w1 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 10), dark);
  w1.rotation.z = Math.PI / 2;
  w1.position.set(-0.55, 0.22, 0.35);
  w1.rotation.y = 0.4;
  g.add(w1);
  const w2 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 10), dark);
  w2.rotation.z = Math.PI / 2;
  w2.position.set(0.5, 0.1, -0.25);
  w2.rotation.set(0.9, 0.2, 0.5);
  g.add(w2);
  for (let i = 0; i < 5; i++) {
    const d = new THREE.Mesh(
      new THREE.BoxGeometry(0.08 + Math.random() * 0.12, 0.05, 0.15 + Math.random() * 0.1),
      wood,
    );
    d.position.set((Math.random() - 0.5) * 1.2, 0.04, (Math.random() - 0.5) * 1);
    d.rotation.y = Math.random() * Math.PI;
    g.add(d);
  }
  const lamp = new THREE.PointLight(0xffcc88, 0.8, 6, 2);
  lamp.position.set(0.9, 0.55, 0.4);
  g.add(lamp);
  SceneManager.registerPointLight(lamp);
  g.userData.light = lamp;
  return g;
}

function spawnSignpost(event) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 1, flatShading: true }),
  );
  pole.position.y = 0.8;
  g.add(pole);
  const faceW = 0.95;
  const faceH = 0.55;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2a1c10';
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#5a4020';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 492, 236);
  ctx.fillStyle = '#d8c8a8';
  ctx.font = 'italic 26px Georgia, serif';
  const line = (event.signText || event.text || '').slice(0, 120);
  const words = line.split(' ');
  let y = 48;
  let lineBuf = '';
  for (const w of words) {
    const test = lineBuf ? `${lineBuf} ${w}` : w;
    if (ctx.measureText(test).width > 470) {
      ctx.fillText(lineBuf, 28, y);
      y += 34;
      lineBuf = w;
    } else {
      lineBuf = test;
    }
  }
  if (lineBuf) ctx.fillText(lineBuf, 28, y);
  const tex = new THREE.CanvasTexture(canvas);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(faceW, faceH),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide }),
  );
  sign.position.set(0, 1.35, 0.08);
  g.add(sign);
  return g;
}

function spawnDiscardedLantern() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1008, roughness: 0.8, flatShading: true });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.32, 7), bodyMat);
  body.rotation.z = Math.PI / 2;
  body.position.set(0.1, 0.12, 0);
  g.add(body);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xffc06a,
    emissive: new THREE.Color(0xff9030),
    emissiveIntensity: 2.0,
  });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), coreMat);
  core.position.set(0.15, 0.12, 0);
  g.add(core);
  const lamp = new THREE.PointLight(0xffac5a, 0.5, 8, 2);
  lamp.position.set(0.15, 0.12, 0);
  g.add(lamp);
  SceneManager.registerPointLight(lamp);
  g.userData.light = lamp;
  return g;
}

function spawnHollowTree() {
  const g = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({
    color: 0x1a120c,
    roughness: 1,
    flatShading: true,
  });
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.58, 2.8, 10),
    bark,
  );
  trunk.position.y = 1.4;
  g.add(trunk);
  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(0.35, 12),
    new THREE.MeshBasicMaterial({ color: 0x040208, side: THREE.DoubleSide }),
  );
  hole.position.set(0.42, 1.1, 0.15);
  hole.rotation.y = Math.PI / 2;
  g.add(hole);
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1.35, 8, 6),
    new THREE.MeshStandardMaterial({
      color: 0x152818,
      roughness: 1,
      flatShading: true,
    }),
  );
  canopy.position.y = 3.1;
  canopy.scale.set(1.15, 0.55, 1.15);
  g.add(canopy);
  return g;
}

function spawnVisual(event, pos) {
  let g;
  switch (event.id) {
    case 'wanderingSpirit':
      g = spawnWanderingSpirit();
      break;
    case 'lostChild':
      g = spawnLostChild();
      break;
    case 'brokenCart':
      g = spawnBrokenCart();
      break;
    case 'signpost':
      g = spawnSignpost(event);
      break;
    case 'discardedLantern':
      g = spawnDiscardedLantern();
      break;
    case 'hollowTree':
      g = spawnHollowTree();
      break;
    default:
      g = new THREE.Group();
  }
  g.position.set(pos.x, 0, pos.z);
  g.rotation.y = pos.faceY ?? 0;
  _scene.add(g);
  return g;
}

function pickEvent() {
  const unseen = roadEvents.filter((e) => !state.seenRoadEvents.has(e.id));
  const pool = unseen.length > 0 ? unseen : roadEvents;
  return pool[Math.floor(Math.random() * pool.length)];
}

let _active = null;
let _promptEl = null;
let _eDown = false;

function removePrompt() {
  if (_promptEl && _promptEl.parentNode) _promptEl.parentNode.removeChild(_promptEl);
  _promptEl = null;
}

function showPrompt() {
  if (_promptEl) return;
  const el = document.createElement('div');
  el.textContent = 'Press E';
  Object.assign(el.style, {
    position: 'fixed',
    left: '50%',
    bottom: '22%',
    transform: 'translateX(-50%)',
    padding: '6px 14px',
    background: 'rgba(10, 8, 6, 0.82)',
    border: '1px solid rgba(200, 160, 100, 0.45)',
    borderRadius: '999px',
    color: '#e8d4a8',
    fontFamily: 'Georgia, serif',
    fontSize: '12px',
    letterSpacing: '0.2em',
    fontVariant: 'small-caps',
    zIndex: '42',
    pointerEvents: 'none',
    opacity: '0.92',
  });
  document.getElementById('ui-root')?.appendChild(el);
  _promptEl = el;
}

function teardownVisual() {
  removePrompt();
  if (!_active) return;
  const { group, chunkEntry, lights } = _active;
  if (chunkEntry) ChunkManager.unregister(chunkEntry);
  if (lights) {
    for (const L of lights) {
      SceneManager.unregisterPointLight(L);
    }
  }
  if (group?.parent) group.parent.remove(group);
  _active = null;
}

function scheduleDespawn() {
  if (!_active) return;
  _active.despawnAt = performance.now() / 1000 + DESPAWN_AFTER_S;
}

function openFirstDialogue(event, onComplete) {
  _eDown = false;
  state.seenRoadEvents.add(event.id);
  notify();
  _hooks.pause();
  const buttons = event.options.map((opt) => ({
    label: opt.label,
    disabled: opt.cost ? !canAfford(opt.cost) : false,
    onClick: () => RoadEvents._resolve(event, opt, onComplete),
  }));
  DialoguePanel.open({
    title: event.title,
    body: event.text,
    buttons,
  });
}

export const RoadEvents = {
  init(scene, hooks = {}) {
    _scene = scene;
    _hooks = {
      pause: hooks.pause || (() => {}),
      resume: hooks.resume || (() => {}),
    };
  },

  /** Roll for a new encounter; spawns a visible prop only (no dialogue yet). */
  tryBeginEvent(playerPos, yaw, onComplete) {
    if (_active || state.currentScene !== 'world') return false;
    if (state.dialogueActive || state.paused) return false;
    const event = pickEvent();
    const pos = pickSpawnXZ(playerPos.x, playerPos.z, yaw);
    const group = spawnVisual(event, pos);
    const chunkEntry = ChunkManager.register(group, pos.x, pos.z);
    const lights = [];
    if (group.userData.light) lights.push(group.userData.light);
    _active = {
      group,
      event,
      chunkEntry,
      fadeT: 0,
      despawnAt: null,
      onComplete,
      lights,
    };
    if (event.id === 'wanderingSpirit') {
      for (const m of group.userData.fadeMeshes || []) {
        m.material = m.material.clone();
        m.material.opacity = 0;
        m.material.transparent = true;
      }
    }
    return true;
  },

  update(delta, playerPos, travel) {
    if (!_scene || !_active || state.currentScene !== 'world') return;
    const a = _active;
    const g = a.group;
    const px = playerPos.x;
    const pz = playerPos.z;
    const dx = g.position.x - px;
    const dz = g.position.z - pz;
    const dist = Math.hypot(dx, dz);

    ChunkManager.moveEntryToWorld(a.chunkEntry, g.position.x, g.position.z);

    if (a.event.id === 'wanderingSpirit' && g.userData.fadeMeshes) {
      a.fadeT += delta;
      const k = Math.min(1, a.fadeT / FADE_IN_S);
      for (const m of g.userData.fadeMeshes) {
        if (m.material) m.material.opacity = 0.55 * k;
      }
    } else {
      a.fadeT += delta;
    }

    const tSec = performance.now() * 0.001;
    if (a.event.id === 'wanderingSpirit' || a.event.id === 'lostChild') {
      const ph = g.userData.bobPhase ?? 0;
      g.position.y = 0.3 + Math.sin(tSec * 2.2 + ph) * 0.08;
    }

    if (a.event.id === 'lostChild' && g.userData.head && dist < 10) {
      const tox = px - g.position.x;
      const toz = pz - g.position.z;
      const ang = Math.atan2(tox, toz);
      g.userData.head.rotation.y = ang - g.rotation.y;
    }

    if (dist < INTERACT_RADIUS && a.fadeT >= FADE_IN_S && !state.dialogueActive) {
      showPrompt();
      const wantsE = travel?.keys?.has('e');
      if (wantsE && !_eDown) {
        _eDown = true;
        removePrompt();
        openFirstDialogue(a.event, a.onComplete);
      }
      if (!wantsE) _eDown = false;
    } else {
      removePrompt();
      if (!travel?.keys?.has('e')) _eDown = false;
    }

    if (a.despawnAt != null && performance.now() / 1000 >= a.despawnAt) {
      teardownVisual();
      _eDown = false;
    }
  },

  /** Legacy — replaced by tryBeginEvent + E; kept if something still calls it. */
  trigger(onComplete) {
    if (!RoadEvents.tryBeginEvent(
      state.playerPos || { x: 0, z: 0 },
      state.cameraYaw ?? 0,
      onComplete,
    )) {
      return;
    }
  },

  _resolve(event, option, onComplete) {
    if (option.cost && !canAfford(option.cost)) return;
    if (option.cost) {
      for (const [type, amount] of Object.entries(option.cost)) {
        spend(type, amount);
      }
    }
    if (option.gain) {
      for (const [type, amount] of Object.entries(option.gain)) {
        gain(type, amount);
      }
    }
    if (option.flag) {
      state.flags[option.flag] = true;
      notify();
    }

    // Keep dialogueActive true while swapping to the outcome panel so Travel
    // does not briefly re-acquire pointer lock between closes.
    DialoguePanel.close({ keepFlag: true });
    DialoguePanel.open({
      title: event.title,
      body: option.outcome,
      buttons: [
        {
          label: 'Walk on',
          onClick: () => {
            DialoguePanel.close({ keepFlag: false });
            state.dialogueActive = false;
            _hooks.resume();
            if (onComplete) onComplete();
            scheduleDespawn();
            notify();
          },
        },
      ],
    });
  },

  /** Call when Ashwick zone entered for the first time (leg 1 → free cycle). */
  markLeg1Complete() {
    if (state.flags.leg1Complete) return;
    state.flags.leg1Complete = true;
    notify();
  },

  dispose() {
    teardownVisual();
    _scene = null;
  },
};
