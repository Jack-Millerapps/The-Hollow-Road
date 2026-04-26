import * as THREE from 'three';
import { state, notify } from '../state.js';
import { DialoguePanel } from '../ui/DialoguePanel.js';
import { CabinInterior } from '../scene/CabinInterior.js';
import { makeVillagerMesh } from '../scene/Westwind.js';
import { Save } from './Save.js';

// Spawns the brother NPC inside the cabin, runs a branching dialogue via
// DialoguePanel, then animates the brother to the door, grants the backpack,
// opens the door, and hands off to the world transition.

function animateTo(object3D, targetPos, duration = 1600) {
  return new Promise((resolve) => {
    const start = object3D.position.clone();
    const t0 = performance.now();
    function step() {
      const t = Math.min(1, (performance.now() - t0) / duration);
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

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function setUiRootHidden(hidden) {
  const ui = document.getElementById('ui-root');
  if (!ui) return;
  if (hidden) {
    if (ui.dataset.hrPrevDisplay === undefined) {
      ui.dataset.hrPrevDisplay = ui.style.display || '';
    }
    ui.style.display = 'none';
  } else {
    ui.style.display = ui.dataset.hrPrevDisplay ?? '';
    delete ui.dataset.hrPrevDisplay;
  }
}

/** World-space helpers from CabinInterior layout (W=16, D=20). */
function bedSitWorldPos(out = new THREE.Vector3()) {
  const O = CabinInterior.origin;
  out.set(O.x - 6.4 + 0.9, 0.35, O.z - 7.8 + 0.35);
  return out;
}

function windowWorldPos(out = new THREE.Vector3()) {
  const O = CabinInterior.origin;
  out.set(O.x - 2.2, 0, O.z - 10 + 0.2);
  return out;
}

function paceTargets(origin) {
  const a = origin.clone().add(new THREE.Vector3(-0.9, 0, 0.4));
  const b = origin.clone().add(new THREE.Vector3(0.9, 0, -0.3));
  return [a, b];
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

    const brother = makeVillagerMesh({
      robeColor: 0x3a3022,
      skinColor: 0xc9a684,
    });
    brother.scale.setScalar(0.95);
    const origin = CabinInterior.origin;
    brother.position.set(origin.x + 1.5, 0, origin.z + 4.2);
    brother.rotation.y = Math.PI;
    brother.userData.baseY = 0;
    brother.userData.walkCycle = 0;
    scene.add(brother);
    this.mesh = brother;
  },

  update(delta, time) {
    if (!this.mesh) return;
    const base = this.mesh.userData.baseY ?? 0;
    this.mesh.position.y =
      base + Math.sin(time * 1.4) * 0.02;
    if (this.mesh.userData.walking) {
      this.mesh.rotation.z = Math.sin(time * 8) * 0.05;
    } else {
      this.mesh.rotation.z *= 0.9;
    }
  },

  async play({ onExit }) {
    setUiRootHidden(true);
    try {
      await wait(1200);

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

      const branch = await new Promise((resolve) => {
        DialoguePanel.open({
          title: brotherName,
          body:
            "You've been saying its name for weeks. I think it's calling you.",
          buttons: [
            {
              label: "That's insane. It's just a dream.",
              onClick: () => {
                DialoguePanel.close();
                resolve('dream');
              },
            },
            {
              label: 'You really think I should go?',
              onClick: () => {
                DialoguePanel.close();
                resolve('go');
              },
            },
          ],
        });
      });

      if (branch === 'dream') {
        if (this.mesh) {
          const sit = bedSitWorldPos(new THREE.Vector3());
          this.mesh.userData.baseY = 0.35;
          this.mesh.userData.walking = true;
          await animateTo(this.mesh, sit, 1800);
          this.mesh.userData.walking = false;
          this.mesh.rotation.y = Math.PI * 0.92;
        }

        await new Promise((resolve) => {
          DialoguePanel.open({
            title: brotherName,
            body:
              "You've said that every morning for two weeks. Same dream, same road, same voice.",
            buttons: [
              {
                label: "It's getting worse.",
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
              'I know. I can hear you talking in your sleep. You say the same word over and over.',
            buttons: [
              {
                label: 'What word?',
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
              "End. You keep saying 'the end.' Like you're trying to find it.",
            buttons: [
              {
                label: '…',
                onClick: () => {
                  DialoguePanel.close();
                  resolve();
                },
              },
            ],
          });
        });

        await wait(900);

        if (this.mesh) {
          this.mesh.userData.baseY = 0;
          this.mesh.position.y = 0;
          const win = windowWorldPos(new THREE.Vector3());
          win.y = 0;
          this.mesh.userData.walking = true;
          await animateTo(this.mesh, win, 2000);
          this.mesh.userData.walking = false;
          this.mesh.rotation.y = Math.PI * 0.15;
        }

        await new Promise((resolve) => {
          DialoguePanel.open({
            title: brotherName,
            body:
              "Father walked the road. You know that. He never came back. But he sent a letter. One letter, six months in. He said — and I've read it a hundred times — he said the road was the only honest thing he'd ever seen.",
            buttons: [
              {
                label: "That doesn't make it safe.",
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
              "No. But it makes it real. And I think you already know you're going. You've known since the first dream.",
            buttons: [
              {
                label: "You're right.",
                onClick: () => {
                  DialoguePanel.close();
                  resolve();
                },
              },
            ],
          });
        });
      } else {
        await new Promise((resolve) => {
          DialoguePanel.open({
            title: brotherName,
            body:
              "I think the road chose you. That sounds like something a fool says, but listen — ",
            buttons: [
              {
                label: '…',
                onClick: () => {
                  DialoguePanel.close();
                  resolve();
                },
              },
            ],
          });
        });

        if (this.mesh) {
          const O = this.mesh.position.clone();
          const [p0, p1] = paceTargets(O);
          this.mesh.userData.walking = true;
          await animateTo(this.mesh, p0, 1400);
          await animateTo(this.mesh, p1, 1400);
          await animateTo(this.mesh, O, 1400);
          this.mesh.userData.walking = false;
          this.mesh.rotation.y = Math.PI;
        }

        await new Promise((resolve) => {
          DialoguePanel.open({
            title: brotherName,
            body:
              "You haven't slept properly in two weeks. You've been distracted, short-tempered, somewhere else entirely. The road is already in you. Going is just catching up to where your mind already is.",
            buttons: [
              {
                label: 'What if I don\'t come back?',
                onClick: () => {
                  DialoguePanel.close();
                  resolve();
                },
              },
            ],
          });
        });

        await wait(1400);

        await new Promise((resolve) => {
          DialoguePanel.open({
            title: brotherName,
            body:
              "Then you don't come back. But you'll have gone somewhere that meant something. That's more than most people manage.",
            buttons: [
              {
                label: "You're not going to try to stop me.",
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
              "I stopped trying to stop things that are already happening a long time ago. Come on. Let me get you the pack.",
            buttons: [
              {
                label: '…',
                onClick: () => {
                  DialoguePanel.close();
                  resolve();
                },
              },
            ],
          });
        });
      }

      if (this.mesh) {
        const doorPos = CabinInterior.getDoorWorldPos(new THREE.Vector3());
        doorPos.y = 0;
        doorPos.z -= 0.8;
        this.mesh.userData.walking = true;
        await animateTo(this.mesh, doorPos, 2200);
        this.mesh.rotation.y = 0;
        this.mesh.userData.walking = false;
      }

      await new Promise((resolve) => {
        DialoguePanel.open({
          title: brotherName,
          body:
            "Take this. There's food in it for two days. After that — you'll figure it out. You always do.",
          buttons: [
            {
              label: '(Take the backpack.)',
              onClick: () => {
                state.items.backpack = true;
                state.flags.brotherGaveBackpack = true;
                notify();
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
            'One thing. Whatever the road asks of you — think before you give it. Not everything that wants something deserves it.',
          buttons: [
            {
              label: 'I understand.',
              onClick: () => {
                DialoguePanel.close();
                resolve();
              },
            },
          ],
        });
      });

      const door = CabinInterior.door;
      if (door) {
        const t0 = performance.now();
        await new Promise((resolve) => {
          function stepDoor() {
            const t = Math.min(1, (performance.now() - t0) / 900);
            const k = 1 - Math.pow(1 - t, 2);
            door.rotation.y = -0.85 * k;
            if (t < 1) requestAnimationFrame(stepDoor);
            else resolve();
          }
          requestAnimationFrame(stepDoor);
        });
      }

      await new Promise((resolve) => {
        DialoguePanel.open({
          title: brotherName,
          body: 'Go on then.',
          buttons: [
            {
              label: 'Step into the light',
              onClick: () => {
                DialoguePanel.close();
                resolve();
              },
            },
          ],
        });
      });

      Save.write(state);
    } finally {
      setUiRootHidden(false);
    }

    if (typeof onExit === 'function') onExit();
  },

  dispose(scene) {
    if (this.mesh && scene) scene.remove(this.mesh);
    this.mesh = null;
    this.spawned = false;
  },
};
