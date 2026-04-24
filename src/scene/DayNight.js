import * as THREE from 'three';
import { state } from '../state.js';
import { SceneManager } from './SceneManager.js';
import { DialoguePanel } from '../ui/DialoguePanel.js';
import { TradePanel } from '../ui/TradePanel.js';

// ---------------------------------------------------------------------------
// Phase 2 — day/night cycle.
//
// The world time (state.gameTime) advances while the player is in the world
// and the game isn't paused. Four phases lerp the scene's moon, ambient and
// fog between hand-authored targets.
// ---------------------------------------------------------------------------

const PHASES = [
  {
    name: 'day',
    duration: 300, // 5 minutes
    moonColor: 0xfff5e0,
    moonIntensity: 0.9,
    ambientColor: 0xb8a080,
    ambientIntensity: 0.55,
    fogColor: 0x8a9a8a,
    fogDensity: 0.012,
  },
  {
    name: 'sunset',
    duration: 60, // 1 minute
    moonColor: 0xff8844,
    moonIntensity: 0.7,
    ambientColor: 0x5a3828,
    ambientIntensity: 0.4,
    fogColor: 0x4a2a1a,
    fogDensity: 0.02,
  },
  {
    name: 'night',
    duration: 120, // 2 minutes
    moonColor: 0x3a4a6a,
    moonIntensity: 0.35,
    ambientColor: 0x0a0a18,
    ambientIntensity: 0.2,
    fogColor: 0x040608,
    fogDensity: 0.045,
  },
  {
    name: 'sunrise',
    duration: 30, // 30 seconds
    moonColor: 0xffb880,
    moonIntensity: 0.7,
    ambientColor: 0x8a6a50,
    ambientIntensity: 0.45,
    fogColor: 0x6a4a3a,
    fogDensity: 0.02,
  },
];

export const CYCLE_LENGTH = PHASES.reduce((s, p) => s + p.duration, 0); // 510s

function phaseAt(time) {
  const wrapped = ((time % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH;
  let acc = 0;
  for (let i = 0; i < PHASES.length; i++) {
    if (wrapped < acc + PHASES[i].duration) {
      return {
        index: i,
        phase: PHASES[i],
        progress: (wrapped - acc) / PHASES[i].duration,
        timeInCycle: wrapped,
        phaseStart: acc,
      };
    }
    acc += PHASES[i].duration;
  }
  return {
    index: 0,
    phase: PHASES[0],
    progress: 0,
    timeInCycle: wrapped,
    phaseStart: 0,
  };
}

function smooth(t) {
  // smoothstep — produces nicer easing between adjacent phase targets.
  return t * t * (3 - 2 * t);
}

const _tmpColor = new THREE.Color();
const _tmpColorB = new THREE.Color();

function lerpHex(a, b, k, out) {
  out.setHex(a);
  _tmpColorB.setHex(b);
  out.lerp(_tmpColorB, k);
  return out;
}

function applyPhase(info) {
  const current = info.phase;
  const next = PHASES[(info.index + 1) % PHASES.length];
  const k = smooth(info.progress);

  const moonLight = SceneManager.moonLight;
  const ambient = SceneManager.ambient;
  const fog = SceneManager.fog;

  if (moonLight) {
    lerpHex(current.moonColor, next.moonColor, k, moonLight.color);
    moonLight.intensity =
      current.moonIntensity + (next.moonIntensity - current.moonIntensity) * k;
  }
  if (ambient) {
    lerpHex(current.ambientColor, next.ambientColor, k, ambient.color);
    ambient.intensity =
      current.ambientIntensity +
      (next.ambientIntensity - current.ambientIntensity) * k;
  }
  if (fog) {
    lerpHex(current.fogColor, next.fogColor, k, fog.color);
    fog.density =
      current.fogDensity + (next.fogDensity - current.fogDensity) * k;
  }
  if (SceneManager.scene && SceneManager.scene.background) {
    // Match background to fog so distant clears never "pop" at the horizon.
    _tmpColor.copy(fog.color).multiplyScalar(0.55);
    SceneManager.scene.background.copy(_tmpColor);
  }
}

// ---------------------------------------------------------------------------
// Panel / scene pause reconciliation
// ---------------------------------------------------------------------------

function reconcilePause() {
  const anyPanel = !!DialoguePanel.root || !!TradePanel.root;
  const offWorld = state.currentScene !== 'world';
  state.timePaused = anyPanel || offWorld;
}

function wrapPanel(panel) {
  const origOpen = panel.open?.bind(panel);
  const origClose = panel.close?.bind(panel);
  if (origOpen) {
    panel.open = function (...args) {
      const ret = origOpen(...args);
      reconcilePause();
      return ret;
    };
  }
  if (origClose) {
    panel.close = function (...args) {
      const ret = origClose(...args);
      reconcilePause();
      return ret;
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let installed = false;

export const DayNight = {
  init() {
    if (installed) return;
    installed = true;
    wrapPanel(DialoguePanel);
    wrapPanel(TradePanel);
    reconcilePause();
    // Apply the starting phase once so initial frame matches state.gameTime.
    applyPhase(phaseAt(state.gameTime || 0));
  },

  update(delta) {
    reconcilePause();
    if (!state.timePaused && state.currentScene === 'world') {
      state.gameTime = (state.gameTime || 0) + delta;
    }
    applyPhase(phaseAt(state.gameTime || 0));
  },

  getCurrentPhase() {
    const info = phaseAt(state.gameTime || 0);
    return info.phase.name;
  },

  getPhaseProgress() {
    return phaseAt(state.gameTime || 0).progress;
  },

  getPhaseInfo() {
    return phaseAt(state.gameTime || 0);
  },

  // Seconds of real time remaining until the 'night' phase starts. Negative
  // if we are already in night.
  timeUntilNight() {
    const info = phaseAt(state.gameTime || 0);
    let offset = 0;
    for (let i = 0; i < PHASES.length; i++) {
      if (PHASES[i].name === 'night') {
        offset = i === 0 ? 0 : PHASES.slice(0, i).reduce((s, p) => s + p.duration, 0);
        break;
      }
    }
    let delta = offset - info.timeInCycle;
    if (delta < 0) delta += CYCLE_LENGTH;
    return delta;
  },

  PHASES,
  CYCLE_LENGTH,
};
