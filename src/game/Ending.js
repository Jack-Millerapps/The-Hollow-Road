import * as THREE from 'three';
import { state, computeDominantSacrifice, notify } from '../state.js';
import { SceneManager } from '../scene/SceneManager.js';
import { Environment } from '../scene/Environment.js';
import { DialoguePanel } from '../ui/DialoguePanel.js';
import { Epilogue } from '../ui/Epilogue.js';

// Phase 4 — the Road's monologue is now assembled from conditionals drawn
// against the full save state. The original five dominant-sacrifice lines
// remain as the spine so the ending still feels specific to what the
// player spent most freely. New conditionals layer on top.

const OPENING = 'You have arrived. Fewer do than you might think.';

const SACRIFICE_LINES = {
  gold:
    'You came heavy with coin. Coin is the easiest thing to give. I will not pretend otherwise.',
  memories:
    'You gave me your past, piece by piece. I carry it now. You will not get it back.',
  promises:
    'Every vow you broke to reach me, I witnessed. I do not judge. But I remember.',
  years:
    'You paid in time you had not yet lived. The years are mine now.',
  secrets:
    'You whispered to trolls and strangers. Those whispers are in my keeping.',
  none:
    'You walked this whole road and spent nothing. I am unsure what to make of you. Perhaps you are the first. Perhaps I have simply forgotten the others.',
};

const JOURNEY_SHELTER = 'You sheltered in the hollows. The trolls taught you something I cannot teach.';
const JOURNEY_CLEAN = 'Not once did you let the dark catch you. That is rarer than any currency.';
const JOURNEY_CARELESS = 'You traveled carelessly. The goblins took more than coin from you. I saw.';

const TASK_LINES = {
  ashwick: 'The miller sleeps easier. You did not have to do that.',
  tree: 'The tree thanks you. It is old. It forgets most travellers.',
  mirror: 'You looked at yourself. Very few have that courage here.',
  stonehush: 'You stood by the silent stone. You did not try to fill it.',
};

const FINAL_OFFER =
  'I can give you back what you spent. All of it. But only if you stay with me, here, at the end. Choose.';

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
      "You whisper the last one into the lantern's flame. It steadies. So do you. You walk into the brightness you made.",
    none:
      'The Road has no quarrel with you, and you have none with it. You walk on, and on, and the walking is the thing.',
  },
  back: {
    gold:
      'You turn. The road behind you is longer than the road ahead. You begin counting coins again, out of habit. There are none left.',
    memories:
      'You turn to go home. You cannot remember what home looks like. You walk anyway. The direction is called back.',
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

function buildMonologue(dominant) {
  const lines = [];
  lines.push(OPENING);

  lines.push(SACRIFICE_LINES[dominant] || SACRIFICE_LINES.none);

  const trolls = (state.trollsTraded || []).length;
  if (trolls >= 3) lines.push(JOURNEY_SHELTER);

  const thefts = state.totalGoblinThefts || 0;
  if (thefts === 0) lines.push(JOURNEY_CLEAN);
  else if (thefts >= 5) lines.push(JOURNEY_CARELESS);

  if (state.flags?.ashwickTaskDone) lines.push(TASK_LINES.ashwick);
  if (state.flags?.treeAccepted) lines.push(TASK_LINES.tree);
  if (state.flags?.mirrorSeen) lines.push(TASK_LINES.mirror);
  if (state.flags?.stonehushTaskDone) lines.push(TASK_LINES.stonehush);

  const mapPieces = state.mapPieces instanceof Set ? state.mapPieces.size : 0;
  if (mapPieces === 0) {
    lines.push(
      'You came to the end without a map. You found the road anyway. That, too, is a thing I remember.',
    );
  } else if (mapPieces >= 4) {
    lines.push(
      'You carry most of the drawn road in your pocket. You will not need it from here.',
    );
  }

  lines.push('');
  lines.push(FINAL_OFFER);

  return lines.join('\n\n');
}

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
    const body = buildMonologue(dominant);

    const scene = SceneManager.scene;
    const camera = SceneManager.camera;
    const lanternZ = camera.position.z - 14;

    const currentFog = { density: SceneManager.fog.density, color: SceneManager.fog.color.clone() };
    animateFog(currentFog, { density: 0.2, color: 0x000000 }, 3000, () => {
      Environment.hide();
      this.endingLantern = spawnEndingLantern(scene, lanternZ);
      this.showMonologue(dominant, body);
    });
  },

  showMonologue(dominant, body) {
    DialoguePanel.open({
      title: 'The Road',
      body,
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
    const finalLine = FINAL_LINES[choice][dominant] || FINAL_LINES[choice].none;
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
            // Open the Phase 4 epilogue after the fade finishes.
            setTimeout(() => {
              Epilogue.show({ finalChoice: choice });
            }, 2900);
          },
        },
      ],
    });
  },
};
