import * as THREE from 'three';
import { state, computeDominantSacrifice, notify } from '../state.js';
import { SceneManager } from '../scene/SceneManager.js';
import { Environment } from '../scene/Environment.js';
import { DialoguePanel } from '../ui/DialoguePanel.js';

const MONOLOGUES = {
  gold: {
    body:
      "You spent coin most freely, and coin is the easiest thing to lose. The Road has seen purses heavier than yours. It has also seen what is left when the purse is empty. You are neither the first nor the last to walk here paying in metal.",
  },
  memories: {
    body:
      "You gave pieces of yourself in bright, careful coins. Each one lit a little further ahead. Each one darkened a little behind. The Road remembers what you have forgotten. It does not give it back.",
  },
  promises: {
    body:
      "You spoke the easiest currency. Words weigh nothing until they are asked for, and you have been asked often. The Road does not judge you for this. It only notes what was said. It is very good at noting.",
  },
  years: {
    body:
      "You paid in time — time not yet lived, time you cannot unlive. The Road grows quiet around those who do this. It knows the taste of a year given early. It knows, too, how short the rest will feel.",
  },
  secrets: {
    body:
      "You handed over what was only yours. Somewhere, in hands you will never see, those small dark things are being turned over like coins. The Road does not mind. The Road has always kept secrets. Yours are safe, in the way that means: unreachable.",
  },
  none: {
    body:
      "You walked this whole road and spent nothing. The Road is unsure what to make of you. Perhaps you are the first. Perhaps it has simply forgotten the others.",
  },
};

const FINAL_LINES = {
  accept: {
    gold:
      'You open your hand. The last coin falls. You follow the road until there is no road, only the direction of walking.',
    memories:
      'You close your eyes. What is left of you fits easily into the dark. The lantern ahead grows no closer. You do not mind.',
    promises:
      'You say the last promise aloud — the one you meant. The Road answers, in a voice that has always been yours. You walk on together.',
    years:
      'You give what is left. The Road accepts it without ceremony, the way a river accepts a stone. You are lighter than you expected to be.',
    secrets:
      'You whisper the last one into the lantern\'s flame. It steadies. So do you. You walk into the brightness you made.',
    none:
      "The Road has no quarrel with you, and you have none with it. You walk on, and on, and the walking is the thing.",
  },
  back: {
    gold:
      'You turn. The road behind you is longer than the road ahead. You begin counting coins again, out of habit. There are none left.',
    memories:
      "You turn to go home. You cannot remember what home looks like. You walk anyway. The direction is called back.",
    promises:
      'You turn. Every promise you have not kept is waiting on the path behind you, patient as weather. You begin to gather them, one by one.',
    years:
      'You turn. The years you have left are fewer now than the years behind. You use them carefully. You do not look up often.',
    secrets:
      'You turn. The secrets you gave are already at work in the world. Some of them, you will meet again. You do not know yet which ones.',
    none:
      'You turn. The road looks the same either way. This is, perhaps, the lesson. You keep walking.',
  },
};

function spawnEndingLantern(scene, zPos) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.07, 2.4, 6),
    new THREE.MeshLambertMaterial({ color: 0x1a1208 }),
  );
  pole.position.y = 1.2;
  group.add(pole);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.6, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xffd48a }),
  );
  head.position.y = 2.6;
  group.add(head);

  const light = new THREE.PointLight(0xffcc77, 2.5, 25, 1.4);
  light.position.y = 2.6;
  group.add(light);

  group.position.set(0, 0, zPos);
  scene.add(group);
  return group;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function animateFog(from, to, duration, onDone) {
  const fog = SceneManager.fog;
  const startDensity = from.density;
  const endDensity = to.density;
  const startColor = new THREE.Color().copy(from.color);
  const endColor = new THREE.Color(to.color);
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    fog.density = lerp(startDensity, endDensity, t);
    fog.color.r = lerp(startColor.r, endColor.r, t);
    fog.color.g = lerp(startColor.g, endColor.g, t);
    fog.color.b = lerp(startColor.b, endColor.b, t);
    if (t < 1) requestAnimationFrame(step);
    else if (onDone) onDone();
  }
  requestAnimationFrame(step);
}

function fadeOverlay(alpha, duration) {
  const el = document.getElementById('fade-overlay');
  if (!el) return;
  el.style.transition = `opacity ${duration}ms ease-in`;
  el.style.opacity = String(alpha);
}

export const Ending = {
  endingLantern: null,

  begin() {
    if (state.flags.endingStarted) return;
    state.flags.endingStarted = true;
    notify();

    const dominant = computeDominantSacrifice();
    const monologue = MONOLOGUES[dominant] || MONOLOGUES.none;

    const scene = SceneManager.scene;
    const camera = SceneManager.camera;
    const lanternZ = camera.position.z - 14;

    // Fade fog to black, hide environment, spawn lantern
    const currentFog = { density: SceneManager.fog.density, color: SceneManager.fog.color.clone() };
    animateFog(currentFog, { density: 0.2, color: 0x000000 }, 3000, () => {
      Environment.hide();
      this.endingLantern = spawnEndingLantern(scene, lanternZ);
      this.showMonologue(dominant, monologue);
    });
  },

  showMonologue(dominant, monologue) {
    DialoguePanel.open({
      title: 'The Road',
      body: monologue.body,
      buttons: [
        {
          label: 'Accept the Road',
          onClick: () => this.finish(dominant, 'accept'),
        },
        {
          label: 'Walk Back',
          onClick: () => this.finish(dominant, 'back'),
        },
      ],
    });
  },

  finish(dominant, choice) {
    const finalLine = (FINAL_LINES[choice][dominant] || FINAL_LINES[choice].none);
    DialoguePanel.close();
    DialoguePanel.open({
      title: choice === 'accept' ? 'Onward' : 'Back',
      body: finalLine,
      buttons: [
        {
          label: 'End',
          onClick: () => {
            DialoguePanel.close();
            fadeOverlay(1, 2800);
            state.flags.endingComplete = true;
            notify();
          },
        },
      ],
    });
  },
};
