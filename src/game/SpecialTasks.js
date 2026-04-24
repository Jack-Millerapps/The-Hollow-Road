// Phase 4 — special tasks per destination.
//
//   Ashwick        "Still the Wheel"   — find miller at night, offer a
//                                         memory → 10 gold + ashwickTaskDone
//   Stonehush      "Hear the Silence"  — silent stone at village edge. 15 s
//                                         audio-muted moment → stonehushTaskDone
//                                         + rep
//   Deeproot       "The Tree's Offer"  — interact with the great tree at
//                                         night. Accept (1 year → 3 memories)
//                                         or refuse (+rep). Either outcome
//                                         marks the task complete.
//   Mirror Town    "See Yourself"      — enter the hidden mirror room. The
//                                         reflection delivers dialogue
//                                         assembled from the player's
//                                         choices → mirrorSeen
//
// Every task push its id onto state.tasksCompleted.

import * as THREE from 'three';
import {
  state,
  spend,
  gain,
  canAfford,
  notify,
} from '../state.js';
import { DialoguePanel } from '../ui/DialoguePanel.js';
import { DayNight } from '../scene/DayNight.js';
import { villages } from '../data/villages.js';

const INTERACT_RADIUS = 3.2;
// Re-used for the "hidden" mirror room entrance; the mirror scene itself is
// a separate overlay.
const MIRROR_RADIUS = 2.2;

function stdMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.9,
    metalness: opts.metalness ?? 0,
    flatShading: opts.flatShading ?? true,
    ...opts,
  });
}

function buildPrompt(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = 'rgba(10, 6, 2, 0.8)';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = 'rgba(200, 170, 120, 0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, 512, 128);
  ctx.fillStyle = '#e5d9b6';
  ctx.font = '30px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4, 1, 1);
  return sprite;
}

function villagePos(name) {
  const v = villages.find((vv) => vv.name === name);
  return v ? { x: v.position.x, z: v.position.z } : { x: 0, z: 0 };
}

// ---------------------------------------------------------------------------
// Silent Stone overlay — full-screen fade with a single line of text. Cuts
// background audio for 15 seconds by muting any <audio>/<video> elements
// currently playing.
// ---------------------------------------------------------------------------

async function playSilentStoneSequence() {
  return new Promise((resolve) => {
    const audios = Array.from(document.querySelectorAll('audio, video'));
    const prevVols = audios.map((a) => ({ el: a, vol: a.volume }));
    for (const { el } of prevVols) {
      try {
        el.volume = 0;
      } catch {
        // cross-origin media may refuse; ignore.
      }
    }

    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(0, 0, 0, 0.96)',
      color: '#e5d9b6',
      fontFamily: 'Georgia, serif',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      fontStyle: 'italic',
      fontSize: '26px',
      letterSpacing: '0.02em',
      zIndex: '9998',
      opacity: '0',
      transition: 'opacity 800ms ease',
      padding: '0 10vw',
      pointerEvents: 'none',
    });
    overlay.textContent = 'What you came here with is enough.';
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });

    setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
        for (const { el, vol } of prevVols) {
          try {
            el.volume = vol;
          } catch {
            // ignore
          }
        }
        resolve();
      }, 900);
    }, 15000);
  });
}

// ---------------------------------------------------------------------------
// Mirror Room overlay — the reflection delivers a procedurally assembled
// line drawn from the player's current save.
// ---------------------------------------------------------------------------

function assembleMirrorLine() {
  const lines = [];
  const spent = state.spent || {};
  if ((spent.memories || 0) >= 1) lines.push('You sold a memory at the Veil.');
  if ((spent.years || 0) >= 1) lines.push('You gave years to the tree.');
  if (state.flags && state.flags.treeAccepted) {
    lines.push('You traded a year for memories, and you cannot say which memories they were.');
  }
  if (state.flags && state.flags.ashwickTaskDone) {
    lines.push('You stilled the miller’s wheel.');
  } else if (state.tradeComplete?.ashwick) {
    lines.push('You refused the miller.');
  }
  if ((state.totalGoblinThefts || 0) >= 3) {
    lines.push('The goblins have taken more from you than you have noticed.');
  }
  if ((state.trollsTraded || []).length >= 3) {
    lines.push('You have slept in hollows most travellers do not enter.');
  }
  if ((state.mapShopsUsed || []).length >= 2) {
    lines.push('You have bought your map rather than taken it.');
  }
  if (lines.length === 0) {
    lines.push('You have kept almost everything you came with. That is its own kind of choosing.');
  }
  lines.push('All of this is what you are becoming.');
  return lines.join(' ');
}

async function playMirrorScene() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      background:
        'radial-gradient(circle at 50% 45%, rgba(60, 60, 90, 0.9) 0%, rgba(6, 4, 10, 0.98) 70%)',
      color: '#e5d9b6',
      fontFamily: 'Georgia, serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      fontSize: '22px',
      letterSpacing: '0.02em',
      zIndex: '9998',
      opacity: '0',
      transition: 'opacity 1000ms ease',
      padding: '0 10vw',
    });

    const title = document.createElement('div');
    title.textContent = 'A Reflection';
    Object.assign(title.style, {
      fontStyle: 'italic',
      marginBottom: '24px',
      opacity: '0.8',
    });
    overlay.appendChild(title);

    const text = document.createElement('div');
    text.textContent = assembleMirrorLine();
    Object.assign(text.style, { maxWidth: '720px', lineHeight: '1.6' });
    overlay.appendChild(text);

    const btn = document.createElement('button');
    btn.textContent = 'Look away';
    Object.assign(btn.style, {
      marginTop: '36px',
      padding: '10px 22px',
      background: 'rgba(0, 0, 0, 0.4)',
      color: '#e5d9b6',
      border: '1px solid rgba(200, 170, 120, 0.5)',
      fontFamily: 'Georgia, serif',
      fontSize: '16px',
      cursor: 'pointer',
    });
    btn.addEventListener('click', () => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
        resolve();
      }, 1000);
    });
    overlay.appendChild(btn);

    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });
  });
}

// ---------------------------------------------------------------------------
// Task registry — each entry owns its own model + interaction loop.
// ---------------------------------------------------------------------------

export const SpecialTasks = {
  _scene: null,
  _entries: [],
  _pause: null,
  _resume: null,
  _busy: false,

  init(scene, { onPause, onResume } = {}) {
    this._scene = scene;
    this._pause = onPause || (() => {});
    this._resume = onResume || (() => {});

    this._buildAshwick(scene);
    this._buildStonehush(scene);
    this._buildDeeproot(scene);
    this._buildMirrorTown(scene);

    const onKey = (e) => {
      const k = e.key.toLowerCase();
      if (k !== 'e' && k !== 'f') return;
      this._tryInteract(k);
    };
    window.addEventListener('keydown', onKey);
  },

  _buildAshwick(scene) {
    const pos = villagePos('ashwick');
    const group = new THREE.Group();
    group.position.set(pos.x - 5, 0, pos.z - 1);

    const figure = new THREE.Group();
    const robe = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 1.4, 10),
      stdMat(0x2c2016),
    );
    robe.position.y = 0.7;
    figure.add(robe);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 10, 8),
      stdMat(0xbf9a76),
    );
    head.position.y = 1.45;
    figure.add(head);
    group.add(figure);

    const prompt = buildPrompt('Press E — The Miller');
    prompt.position.y = 2.4;
    prompt.visible = false;
    group.add(prompt);
    group.visible = false;
    scene.add(group);

    this._entries.push({
      id: 'ashwickTask',
      key: 'e',
      group,
      prompt,
      pos: { x: pos.x - 5, z: pos.z - 1 },
      check: () =>
        !!state.tradeComplete.ashwick &&
        !state.flags.ashwickTaskDone &&
        isNight(),
      onInteract: () => this._runAshwick(),
    });
  },

  _buildStonehush(scene) {
    const pos = villagePos('stonehush');
    const group = new THREE.Group();
    group.position.set(pos.x + 4.5, 0, pos.z + 2);

    const stone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.7, 2.2, 9),
      stdMat(0x2c2a28),
    );
    stone.position.y = 1.1;
    group.add(stone);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.45, 0.2, 9),
      stdMat(0x1e1c1a),
    );
    cap.position.y = 2.3;
    group.add(cap);

    const prompt = buildPrompt('Press F — Silent Stone');
    prompt.position.y = 3.2;
    prompt.visible = false;
    group.add(prompt);
    group.visible = false;
    scene.add(group);

    this._entries.push({
      id: 'stonehushTask',
      key: 'f',
      group,
      prompt,
      pos: { x: pos.x + 4.5, z: pos.z + 2 },
      check: () =>
        !!state.tradeComplete.stonehush && !state.flags.stonehushTaskDone,
      onInteract: () => this._runStonehush(),
    });
  },

  _buildDeeproot(scene) {
    const pos = villagePos('deeproot');
    const group = new THREE.Group();
    group.position.set(pos.x - 4, 0, pos.z - 3);

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.4, 6, 10),
      stdMat(0x3a2516),
    );
    trunk.position.y = 3;
    group.add(trunk);
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(3, 10, 8),
      stdMat(0x1a3012),
    );
    canopy.position.y = 6.5;
    canopy.scale.y = 0.75;
    group.add(canopy);

    const prompt = buildPrompt('Press E — The Great Tree');
    prompt.position.y = 10.5;
    prompt.visible = false;
    group.add(prompt);
    group.visible = false;
    scene.add(group);

    this._entries.push({
      id: 'deeprootTask',
      key: 'e',
      group,
      prompt,
      pos: { x: pos.x - 4, z: pos.z - 3 },
      check: () =>
        !!state.tradeComplete.deeproot &&
        !state.flags.deeprootTaskDone &&
        isNight(),
      onInteract: () => this._runDeeproot(),
    });
  },

  _buildMirrorTown(scene) {
    const pos = villagePos('mirrorTown');
    const group = new THREE.Group();
    group.position.set(pos.x + 4, 0, pos.z + 3);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 3.4, 0.3),
      stdMat(0x1a1208, { metalness: 0.3, roughness: 0.6 }),
    );
    frame.position.y = 1.8;
    group.add(frame);

    const mirror = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 2.9),
      new THREE.MeshStandardMaterial({
        color: 0x202030,
        emissive: 0x4a6fc0,
        emissiveIntensity: 0.35,
        roughness: 0.1,
        metalness: 0.85,
      }),
    );
    mirror.position.set(0, 1.8, 0.18);
    group.add(mirror);

    const prompt = buildPrompt('Press E — Mirror Room');
    prompt.position.y = 4.2;
    prompt.visible = false;
    group.add(prompt);
    group.visible = false;
    scene.add(group);

    this._entries.push({
      id: 'mirrorTownTask',
      key: 'e',
      group,
      prompt,
      pos: { x: pos.x + 4, z: pos.z + 3 },
      radius: MIRROR_RADIUS,
      check: () =>
        !!state.tradeComplete.mirrorTown && !state.flags.mirrorSeen,
      onInteract: () => this._runMirror(),
    });
  },

  update(playerPos) {
    if (state.currentScene !== 'world' || this._busy) {
      for (const e of this._entries) {
        e.group.visible = false;
        e.prompt.visible = false;
      }
      return;
    }
    for (const e of this._entries) {
      const available = e.check();
      e.group.visible = available;
      if (!available) {
        e.prompt.visible = false;
        continue;
      }
      const dx = playerPos.x - e.pos.x;
      const dz = playerPos.z - e.pos.z;
      const r = e.radius ?? INTERACT_RADIUS;
      const near = Math.hypot(dx, dz) < r;
      e.prompt.visible = near;
    }
  },

  _tryInteract(pressedKey) {
    if (this._busy) return;
    if (state.currentScene !== 'world') return;
    const pp = state.playerPos || { x: 0, z: 0 };
    for (const e of this._entries) {
      if (e.key !== pressedKey) continue;
      if (!e.check()) continue;
      const dx = pp.x - e.pos.x;
      const dz = pp.z - e.pos.z;
      const r = e.radius ?? INTERACT_RADIUS;
      if (Math.hypot(dx, dz) < r) {
        e.onInteract();
        return;
      }
    }
  },

  _markComplete(id) {
    if (!Array.isArray(state.tasksCompleted)) state.tasksCompleted = [];
    if (!state.tasksCompleted.includes(id)) state.tasksCompleted.push(id);
    notify();
  },

  // ----- Ashwick -----------------------------------------------------------

  _runAshwick() {
    this._busy = true;
    this._pause();

    if (!canAfford({ memories: 1 })) {
      DialoguePanel.open({
        title: 'The Miller',
        body:
          'He looks at you a long time. "You have nothing soft enough to give me. Come back when you have a memory to spare."',
        buttons: [
          {
            label: 'Walk away',
            onClick: () => this._endBusy(),
          },
        ],
      });
      return;
    }

    DialoguePanel.open({
      title: 'The Miller',
      body:
        'He is awake. He is always awake. He says: "If you have a memory of peace — a real one — I would stop the wheel for one night and one day. Would you give it?"',
      buttons: [
        {
          label: 'Offer a memory of peace',
          onClick: () => {
            spend('memories', 1);
            gain('gold', 10);
            state.flags.ashwickTaskDone = true;
            this._markComplete('ashwickTask');
            DialoguePanel.close();
            DialoguePanel.open({
              title: 'The Miller',
              body:
                'The wheel slows. Then stops. He hands you ten coins with both hands, as if they were heavy. "Thank you," he says, though it does not sound like you are the one being thanked.',
              buttons: [
                { label: 'Walk on', onClick: () => this._endBusy() },
              ],
            });
          },
        },
        {
          label: 'Refuse',
          onClick: () => {
            DialoguePanel.close();
            DialoguePanel.open({
              title: 'The Miller',
              body:
                'He nods. The wheel keeps turning. You feel, for a moment, that something is being weighed, and you are not the one holding the scale.',
              buttons: [
                { label: 'Walk on', onClick: () => this._endBusy() },
              ],
            });
          },
        },
      ],
    });
  },

  // ----- Stonehush ---------------------------------------------------------

  async _runStonehush() {
    this._busy = true;
    this._pause();
    // No dialogue — just a 15 s silent fade.
    DialoguePanel.close();
    await playSilentStoneSequence();
    state.flags.stonehushTaskDone = true;
    if (typeof state.reputation.stonehush === 'number') {
      state.reputation.stonehush += 1;
    }
    this._markComplete('stonehushTask');
    this._endBusy();
  },

  // ----- Deeproot ----------------------------------------------------------

  _runDeeproot() {
    this._busy = true;
    this._pause();

    const canAccept = canAfford({ years: 1 });

    DialoguePanel.open({
      title: 'The Great Tree',
      body:
        'Bark folds into an almost-face. A voice older than the road: "I will take a year of the life you have not yet lived. I will give you back three moments you have forgotten. Your ledger will change in both directions."',
      buttons: [
        {
          label: canAccept ? 'Accept (1 year → 3 memories)' : 'Accept (not enough years)',
          disabled: !canAccept,
          onClick: () => {
            if (!canAccept) return;
            spend('years', 1);
            gain('memories', 3);
            state.flags.treeAccepted = true;
            state.flags.deeprootTaskDone = true;
            this._markComplete('deeprootTask');
            DialoguePanel.close();
            DialoguePanel.open({
              title: 'The Great Tree',
              body:
                'Three moments return to you — small ones, unremarkable. You cannot remember what you gave in exchange, but the loss has the shape of a year.',
              buttons: [
                { label: 'Walk on', onClick: () => this._endBusy() },
              ],
            });
          },
        },
        {
          label: 'Refuse',
          onClick: () => {
            state.flags.deeprootTaskDone = true;
            this._markComplete('deeprootTask');
            if (typeof state.reputation.deeproot === 'number') {
              state.reputation.deeproot += 1;
            }
            DialoguePanel.close();
            DialoguePanel.open({
              title: 'The Great Tree',
              body:
                'The bark folds back into itself. The villagers do not say so, but they walk easier around you now.',
              buttons: [
                { label: 'Walk on', onClick: () => this._endBusy() },
              ],
            });
          },
        },
      ],
    });
  },

  // ----- Mirror Town -------------------------------------------------------

  async _runMirror() {
    this._busy = true;
    this._pause();
    DialoguePanel.close();
    await playMirrorScene();
    state.flags.mirrorSeen = true;
    this._markComplete('mirrorTownTask');
    this._endBusy();
  },

  _endBusy() {
    DialoguePanel.close();
    this._busy = false;
    this._resume();
    notify();
  },
};

function isNight() {
  const phase = DayNight.getCurrentPhase?.();
  return phase === 'night' || phase === 'sunset';
}
