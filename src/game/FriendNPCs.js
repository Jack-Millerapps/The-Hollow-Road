import * as THREE from 'three';
import { state, notify } from '../state.js';
import { DialogueManager } from '../ui/DialogueManager.js';
import { FRIENDS } from '../data/friends.js';
import { makeVillagerMesh } from '../scene/Westwind.js';
import { Save } from './Save.js';

// ---------------------------------------------------------------------------
// Friend NPCs in Westwind.
//
// Two entry points:
//   - runArrivalSequence(travel): one-time choreographed scene where each
//     friend walks up to the player in order, speaks, and gifts items.
//   - spawn(scene, travel): idle/wander behavior for subsequent visits —
//     friends stand at their cabins and respond to "E — Talk".
// ---------------------------------------------------------------------------

const INTERACT_RADIUS = 3;
const APPROACH_SPEED = 2.4;
const APPROACH_STOP_DISTANCE = 2.0;
const BETWEEN_FRIEND_PAUSE = 2.0; // seconds

function makePrompt() {
  const el = document.createElement('div');
  el.className = 'friend-prompt';
  el.textContent = 'Press E — Talk';
  el.style.cssText = [
    'position: fixed',
    'bottom: 110px',
    'left: 50%',
    'transform: translateX(-50%)',
    'padding: 8px 18px',
    'background: rgba(13, 10, 6, 0.88)',
    'border: 1px solid #3a2e1a',
    'border-radius: 999px',
    'color: #c8903a',
    'font-family: Georgia, serif',
    'font-size: 13px',
    'font-variant: small-caps',
    'letter-spacing: 0.22em',
    'z-index: 25',
    'opacity: 0',
    'transition: opacity 0.25s ease',
    'pointer-events: none',
  ].join(';');
  document.getElementById('ui-root').appendChild(el);
  return el;
}

function friendGiftFlag(id) {
  return `friend${id.charAt(0).toUpperCase() + id.slice(1)}Gifted`;
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function showDirectionPopup(text) {
  const el = document.createElement('div');
  el.textContent = text;
  Object.assign(el.style, {
    position: 'fixed',
    top: '38%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    padding: '14px 26px',
    background: 'rgba(12, 10, 6, 0.9)',
    border: '1px solid rgba(200, 170, 120, 0.45)',
    borderRadius: '4px',
    color: '#ffd79a',
    fontFamily: 'Georgia, serif',
    fontStyle: 'italic',
    fontSize: '17px',
    letterSpacing: '0.04em',
    zIndex: '70',
    opacity: '0',
    transition: 'opacity 0.6s ease',
    pointerEvents: 'none',
  });
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = '1';
  });
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 800);
  }, 4500);
}

export const FriendNPCs = {
  spawned: false,
  entries: [],
  activeId: null,
  prompt: null,
  travelRef: null,
  dialogueOpen: false,
  sceneRef: null,
  // While an arrival-approach is running we walk this NPC each frame.
  _arrivalWalker: null,
  _arrivalTarget: null,

  spawn(scene, travel) {
    if (this.spawned) return;
    this.spawned = true;
    this.travelRef = travel;
    this.sceneRef = scene;

    for (const friend of FRIENDS) {
      const mesh = makeVillagerMesh({
        robeColor: friend.robeColor,
        skinColor: friend.skinColor,
      });
      mesh.position.set(friend.position.x, 0, friend.position.z);
      mesh.rotation.y = friend.facing ?? 0;
      mesh.userData.friendId = friend.id;
      mesh.userData.baseY = 0;
      mesh.userData.phase = Math.random() * Math.PI * 2;
      mesh.userData.homeX = friend.position.x;
      mesh.userData.homeZ = friend.position.z;
      scene.add(mesh);
      this.entries.push({
        friend,
        mesh,
        worldPos: new THREE.Vector3(friend.position.x, 0, friend.position.z),
      });
    }

    this.prompt = makePrompt();

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.key !== 'e' && e.key !== 'E') return;
      if (this.dialogueOpen) return;
      if (!this.activeId) return;
      if (state.currentVillage) return;
      if (!state.flags.friendsArrived) return; // locked during arrival
      const entry = this.entries.find((x) => x.friend.id === this.activeId);
      if (!entry) return;
      this.openDialogue(entry.friend);
    });
  },

  update(playerPos, time) {
    if (!this.spawned) return;

    // Idle bob for each NPC.
    for (const { mesh } of this.entries) {
      mesh.position.y =
        mesh.userData.baseY + Math.sin(time * 1.4 + mesh.userData.phase) * 0.02;
    }

    // Arrival-approach walking — one entry moves toward the player until
    // it's close enough, then the waiting promise resolves.
    if (this._arrivalWalker && this._arrivalTarget) {
      const m = this._arrivalWalker.mesh;
      const tx = this._arrivalTarget.x;
      const tz = this._arrivalTarget.z;
      const dx = tx - m.position.x;
      const dz = tz - m.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > APPROACH_STOP_DISTANCE) {
        const dt = Math.min(0.05, this._lastDtEstimate || 1 / 60);
        const step = Math.min(dist - APPROACH_STOP_DISTANCE, APPROACH_SPEED * dt);
        m.position.x += (dx / dist) * step;
        m.position.z += (dz / dist) * step;
        m.rotation.y = Math.atan2(dx, dz);
        this._arrivalWalker.worldPos.set(m.position.x, 0, m.position.z);
      } else if (this._arrivalResolve) {
        const resolve = this._arrivalResolve;
        this._arrivalResolve = null;
        this._arrivalWalker = null;
        this._arrivalTarget = null;
        resolve();
      }
    }

    // No "Press E" prompt until the arrival sequence is done.
    if (!state.flags.friendsArrived) {
      if (this.prompt) this.prompt.style.opacity = '0';
      this.activeId = null;
      return;
    }

    let best = null;
    let bestDist = Infinity;
    for (const entry of this.entries) {
      const dx = entry.worldPos.x - playerPos.x;
      const dz = entry.worldPos.z - playerPos.z;
      const d = Math.hypot(dx, dz);
      if (d < INTERACT_RADIUS && d < bestDist) {
        bestDist = d;
        best = entry;
      }
    }

    const newId = best?.friend.id || null;
    if (newId !== this.activeId) {
      this.activeId = newId;
      if (this.prompt) {
        if (newId) {
          this.prompt.textContent = `Press E — Talk to ${best.friend.name}`;
          this.prompt.style.opacity = '1';
        } else {
          this.prompt.style.opacity = '0';
        }
      }
    }
  },

  _lastDtEstimate: 1 / 60,

  // Called once, on first exit from the cabin scene.
  async runArrivalSequence(travel) {
    if (state.flags.friendsArrived) return;
    if (!this.spawned || !travel) return;

    // Disable movement while the scene plays.
    travel.pause?.();

    // Park each friend at its cabin door to start.
    for (const { mesh, friend } of this.entries) {
      mesh.position.set(friend.position.x, 0, friend.position.z);
    }

    for (const entry of this.entries) {
      const playerPos = state.playerPos || { x: 0, z: 496 };
      // Target: ~2.2 units in front of the player on the player's z side.
      const target = {
        x: playerPos.x + (entry.friend.position.x < 0 ? -1 : 1) * 0.8,
        z: playerPos.z + 2.2,
      };
      await this._approach(entry, target);
      await this._arrivalMonologue(entry.friend);
      await delay(BETWEEN_FRIEND_PAUSE * 1000);
    }

    state.flags.friendsArrived = true;
    notify();
    Save.write(state);

    showDirectionPopup('Head south down the road. Ashwick is 1km away.');

    travel.resume?.();
  },

  _approach(entry, target) {
    this._arrivalWalker = entry;
    this._arrivalTarget = target;
    return new Promise((resolve) => {
      this._arrivalResolve = resolve;
    });
  },

  _arrivalMonologue(friend) {
    return new Promise((resolve) => {
      DialogueManager.open({
        id: `arrival-${friend.id}-intro`,
        title: friend.name,
        body: friend.ethos,
        buttons: [
          {
            label: 'Then take this.',
            onClick: () => {
              for (const key of friend.grants) {
                state.items[key] = true;
              }
              state.flags[friendGiftFlag(friend.id)] = true;
              notify();
              Save.write(state);
              DialogueManager.open({
                id: `arrival-${friend.id}-gift`,
                title: friend.name,
                body: friend.receivedLine,
                buttons: [
                  {
                    label: 'Thank you.',
                    onClick: () => {
                      DialogueManager.close();
                      resolve();
                    },
                  },
                ],
              });
            },
          },
        ],
      });
    });
  },

  openDialogue(friend) {
    if (this.dialogueOpen) return;
    this.dialogueOpen = true;
    if (this.prompt) this.prompt.style.opacity = '0';
    if (this.travelRef?.pause) this.travelRef.pause();

    const alreadyGifted = state.flags[friendGiftFlag(friend.id)] === true;

    const close = () => {
      DialogueManager.close();
      this.dialogueOpen = false;
      if (this.travelRef?.resume) this.travelRef.resume();
    };

    if (alreadyGifted) {
      DialogueManager.open({
        title: friend.name,
        body: 'Be careful out there. Come back to us.',
        buttons: [{ label: 'Farewell.', onClick: close }],
      });
      return;
    }

    DialogueManager.open({
      title: friend.name,
      body: '(Ask to be ready for the road.)',
      buttons: [
        {
          label: "I'm leaving today.",
          onClick: () => this._showEthos(friend, close),
        },
        { label: 'Nevermind.', onClick: close },
      ],
    });
  },

  _showEthos(friend, close) {
    DialogueManager.open({
      title: friend.name,
      body: friend.ethos,
      buttons: [
        {
          label: 'Then you can spare something for the road?',
          onClick: () => this._showGift(friend, close),
        },
      ],
    });
  },

  _showGift(friend, close) {
    DialogueManager.open({
      title: friend.name,
      body: 'Then take this.',
      buttons: [
        {
          label: '(Accept.)',
          onClick: () => {
            for (const key of friend.grants) {
              state.items[key] = true;
            }
            state.flags[friendGiftFlag(friend.id)] = true;
            notify();
            Save.write(state);
            DialogueManager.open({
              title: friend.name,
              body: friend.receivedLine,
              buttons: [{ label: 'Thank you.', onClick: close }],
            });
          },
        },
      ],
    });
  },

  missingFriend() {
    for (const f of FRIENDS) {
      if (!state.flags[friendGiftFlag(f.id)]) return f;
    }
    return null;
  },

  dispose() {
    if (this.prompt && this.prompt.parentNode) {
      this.prompt.parentNode.removeChild(this.prompt);
    }
    this.prompt = null;
  },
};
