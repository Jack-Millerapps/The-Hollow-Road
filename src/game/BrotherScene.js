import * as THREE from 'three';
import { state, notify } from '../state.js';
import { DialoguePanel } from '../ui/DialoguePanel.js';
import { CabinInterior } from '../scene/CabinInterior.js';
import { makeVillagerMesh } from '../scene/Westwind.js';
import { Save } from './Save.js';

// Spawns the brother NPC inside the cabin, runs a branching dialogue via
// DialoguePanel, then animates the brother to the door and shows a
// "Step outside" button to exit the scene.

function animateTo(object3D, targetPos, duration = 1600) {
  return new Promise((resolve) => {
    const start = object3D.position.clone();
    const t0 = performance.now();
    function step() {
      const t = Math.min(1, (performance.now() - t0) / duration);
      // Ease in/out
      const k = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      object3D.position.lerpVectors(start, targetPos, k);
      object3D.userData.walking = t < 1;
      if (t < 1) requestAnimationFrame(step);
      else {
        object3D.userData.walking = false;
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

export const BrotherScene = {
  mesh: null,
  scene: null,
  spawned: false,
  animating: false,

  spawn(scene) {
    if (this.spawned) return;
    this.spawned = true;
    this.scene = scene;

    // Brother stands in the middle of the room, facing the player (who
    // spawns to the south facing +z). Later he walks to the door.
    const brother = makeVillagerMesh({
      robeColor: 0x3a3022,
      skinColor: 0xc9a684,
    });
    brother.scale.setScalar(0.95);
    const origin = CabinInterior.origin;
    brother.position.set(origin.x + 1.5, 0, origin.z + 4.2);
    brother.rotation.y = Math.PI; // face -z (back toward the player)
    brother.userData.baseY = 0;
    brother.userData.walkCycle = 0;
    scene.add(brother);
    this.mesh = brother;
  },

  update(delta, time) {
    if (!this.mesh) return;
    // Gentle idle bob
    this.mesh.position.y =
      this.mesh.userData.baseY + Math.sin(time * 1.4) * 0.02;
    if (this.mesh.userData.walking) {
      // Cheap walk wobble
      this.mesh.rotation.z = Math.sin(time * 8) * 0.05;
    } else {
      this.mesh.rotation.z *= 0.9;
    }
  },

  async play({ onExit }) {
    // A short beat to let the scene settle.
    await new Promise((r) => setTimeout(r, 1200));

    const brotherName = 'Brother';

    await new Promise((resolve) => {
      DialoguePanel.open({
        title: brotherName,
        body: 'You were talking in your sleep again.',
        buttons: [
          {
            label: 'I had the strangest dream.',
            onClick: () => {
              DialoguePanel.close();
              resolve();
            },
          },
        ],
      });
    });

    await new Promise((resolve) => {
      DialoguePanel.open({
        title: brotherName,
        body: 'The road?',
        buttons: [
          {
            label: 'How did you know?',
            onClick: () => {
              DialoguePanel.close();
              resolve();
            },
          },
        ],
      });
    });

    await new Promise((resolve) => {
      DialoguePanel.open({
        title: brotherName,
        body: "You've been saying its name for weeks. I think it's calling you.",
        buttons: [
          {
            label: "That's insane. It's just a dream.",
            onClick: () => {
              DialoguePanel.close();
              resolve();
            },
          },
          {
            label: 'You really think I should go?',
            onClick: () => {
              DialoguePanel.close();
              resolve();
            },
          },
        ],
      });
    });

    await new Promise((resolve) => {
      DialoguePanel.open({
        title: brotherName,
        body:
          "The road has taken others. But it's always taken them for a reason.\n\nPack your things. I'll see you at the door.",
        buttons: [
          {
            label: '...',
            onClick: () => {
              DialoguePanel.close();
              resolve();
            },
          },
        ],
      });
    });

    // Brother walks to the door.
    if (this.mesh) {
      const doorPos = CabinInterior.getDoorWorldPos(new THREE.Vector3());
      doorPos.y = 0;
      doorPos.z -= 0.8;
      this.mesh.userData.walking = true;
      await animateTo(this.mesh, doorPos, 2200);
      this.mesh.rotation.y = 0;
    }

    // Brother gives the backpack at the door — the player starts with
    // nothing in their inventory except what friends/brother provide.
    if (!state.items.backpack) {
      await new Promise((resolve) => {
        DialoguePanel.open({
          title: brotherName,
          body:
            "Take this. You'll need to carry more than memories where you're going.",
          buttons: [
            {
              label: '(Accept the backpack.)',
              onClick: () => {
                state.items.backpack = true;
                state.flags.brotherGifted = true;
                notify();
                DialoguePanel.close();
                resolve();
              },
            },
          ],
        });
      });
    }

    state.currentScene = 'cabin';
    Save.write(state);

    await new Promise((resolve) => {
      DialoguePanel.open({
        title: '',
        body: 'You pull on your boots. The road is waiting.',
        buttons: [
          {
            label: 'Step outside',
            onClick: () => {
              DialoguePanel.close();
              resolve();
            },
          },
        ],
      });
    });

    if (typeof onExit === 'function') onExit();
  },

  dispose(scene) {
    if (this.mesh && scene) scene.remove(this.mesh);
    this.mesh = null;
    this.spawned = false;
  },
};
