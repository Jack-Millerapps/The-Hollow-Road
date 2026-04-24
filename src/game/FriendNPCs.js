import * as THREE from 'three';
import { state, notify } from '../state.js';
import { DialoguePanel } from '../ui/DialoguePanel.js';
import { FRIENDS } from '../data/friends.js';
import { makeVillagerMesh } from '../scene/Westwind.js';
import { Save } from './Save.js';

// Manages the three friend NPCs in Westwind: spawns their meshes, detects
// proximity, shows an interaction prompt, and opens DialoguePanel with a
// multi-line conversation when the player presses E.

const INTERACT_RADIUS = 3;

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

export const FriendNPCs = {
  spawned: false,
  entries: [], // { friend, mesh, worldPos }
  activeId: null,
  prompt: null,
  travelRef: null,
  dialogueOpen: false,

  spawn(scene, travel) {
    if (this.spawned) return;
    this.spawned = true;
    this.travelRef = travel;

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
      // Don't trigger if in a village trade / any modal
      if (state.currentVillage) return;
      const entry = this.entries.find((x) => x.friend.id === this.activeId);
      if (!entry) return;
      this.openDialogue(entry.friend);
    });
  },

  update(playerPos, time) {
    if (!this.spawned) return;
    // Idle breathing
    for (const { mesh } of this.entries) {
      mesh.position.y =
        mesh.userData.baseY + Math.sin(time * 1.4 + mesh.userData.phase) * 0.02;
    }

    // Proximity detection — find the closest friend within radius
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
          const nm = best.friend.name;
          this.prompt.textContent = `Press E — Talk to ${nm}`;
          this.prompt.style.opacity = '1';
        } else {
          this.prompt.style.opacity = '0';
        }
      }
    }
  },

  openDialogue(friend) {
    if (this.dialogueOpen) return;
    this.dialogueOpen = true;
    if (this.prompt) this.prompt.style.opacity = '0';
    if (this.travelRef?.pause) this.travelRef.pause();

    const lines = friend.lines.slice();
    const showNext = () => {
      if (lines.length === 0) {
        // Grant item if any
        if (friend.grants) {
          state.items[friend.grants] = true;
          notify();
          Save.write(state);
          DialoguePanel.open({
            title: friend.name,
            body: `(You received a ripped map.)`,
            buttons: [
              {
                label: 'Thank you.',
                onClick: () => {
                  DialoguePanel.close();
                  this.dialogueOpen = false;
                  if (this.travelRef?.resume) this.travelRef.resume();
                },
              },
            ],
          });
          return;
        }
        DialoguePanel.close();
        this.dialogueOpen = false;
        if (this.travelRef?.resume) this.travelRef.resume();
        return;
      }
      const line = lines.shift();
      DialoguePanel.open({
        title: friend.name,
        body: line,
        buttons: [
          {
            label: lines.length === 0 && !friend.grants ? 'Farewell.' : 'Continue',
            onClick: showNext,
          },
        ],
      });
    };
    showNext();
  },

  dispose() {
    if (this.prompt && this.prompt.parentNode) {
      this.prompt.parentNode.removeChild(this.prompt);
    }
    this.prompt = null;
  },
};
