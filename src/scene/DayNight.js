import * as THREE from 'three';
import { state } from '../state.js';
import { SceneManager } from './SceneManager.js';
import { DialoguePanel } from '../ui/DialoguePanel.js';
import { TradePanel } from '../ui/TradePanel.js';
import { Environment } from './Environment.js';

// ---------------------------------------------------------------------------
// Day / night cycle.
//
// Total cycle length is 8.5 minutes = 510 seconds:
//   5 day + 1 sunset + 2 night + 0.5 sunrise.
//
// The player starts at the BEGINNING of the NIGHT phase when they first step
// onto the road from Westwind. `state.gameTime` is set to the offset for
// "night" at that moment (see Travel.js) so the cycle arrives at sunrise ~2
// minutes later.
// ---------------------------------------------------------------------------

const PHASES = [
  {
    name: 'day',
    duration: 300, // 5 min
    moonColor: 0xfff5e0,
    moonIntensity: 0.9,
    ambientColor: 0xb8a080,
    ambientIntensity: 0.55,
    fogColor: 0x8a9a8a,
    fogDensity: 0.0015,
    skyColor: 0x8a9a8a,
    starOpacity: 0.0,
  },
  {
    name: 'sunset',
    duration: 60, // 1 min
    moonColor: 0xff8844,
    moonIntensity: 0.7,
    ambientColor: 0x5a3828,
    ambientIntensity: 0.4,
    fogColor: 0x4a2a1a,
    fogDensity: 0.004,
    skyColor: 0x4a2a1a,
    starOpacity: 0.6,
  },
  {
    name: 'night',
    duration: 120, // 2 min
    moonColor: 0x3a4a6a,
    moonIntensity: 0.35,
    ambientColor: 0x0a0a18,
    ambientIntensity: 0.2,
    fogColor: 0x040608,
    fogDensity: 0.008,
    skyColor: 0x040608,
    starOpacity: 1.0,
  },
  {
    name: 'sunrise',
    duration: 30, // 0.5 min
    moonColor: 0xffb880,
    moonIntensity: 0.7,
    ambientColor: 0x8a6a50,
    ambientIntensity: 0.45,
    fogColor: 0x6a4a3a,
    fogDensity: 0.004,
    skyColor: 0x6a4a3a,
    starOpacity: 0.3,
  },
];

export const CYCLE_LENGTH = PHASES.reduce((s, p) => s + p.duration, 0); // 510s

function phaseStartOffset(name) {
  let acc = 0;
  for (const p of PHASES) {
    if (p.name === name) return acc;
    acc += p.duration;
  }
  return 0;
}

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
  const scene = SceneManager.scene;

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

  // Sky background — lerp per-phase target colors directly (no darkening
  // multiplier). This is what was missing; the scene.background used to be
  // fixed to the initial fog-derived hex and never moved with the cycle.
  if (scene) {
    lerpHex(current.skyColor, next.skyColor, k, _tmpColor);
    if (scene.background && scene.background.isColor) {
      scene.background.copy(_tmpColor);
    } else {
      scene.background = _tmpColor.clone();
    }
  }

  // Stars fade across phases — 0 during day, 1 during night.
  const stars = Environment?.stars;
  if (stars?.material) {
    const starOpacity =
      current.starOpacity + (next.starOpacity - current.starOpacity) * k;
    stars.material.opacity = Math.max(0, Math.min(1, starOpacity));
    stars.visible = stars.material.opacity > 0.01;
  }
}

function reconcilePause() {
  const anyPanel =
    !!DialoguePanel.root || !!TradePanel.root || !!state.dialogueActive;
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

let installed = false;
let _logAccum = 0;
let _debugLog = false;
let _applyAccum = 0;

export const DayNight = {
  init({ startPhase = null } = {}) {
    if (installed) return;
    installed = true;
    wrapPanel(DialoguePanel);
    wrapPanel(TradePanel);

    try {
      _debugLog =
        new URLSearchParams(window.location.search).get('debug') === '1';
    } catch {
      _debugLog = false;
    }
    // Always log the first handful of phase transitions so sky-bug debugging
    // doesn't require manual URL flags.
    if (typeof window !== 'undefined') {
      window.__hollowRoadDayNightDebug = () => {
        _debugLog = true;
      };
    }

    if (startPhase) {
      state.gameTime = phaseStartOffset(startPhase);
    }

    reconcilePause();
    applyPhase(phaseAt(state.gameTime || 0));
  },

  setStartPhase(name) {
    state.gameTime = phaseStartOffset(name);
    applyPhase(phaseAt(state.gameTime));
  },

  update(delta) {
    reconcilePause();
    const wasPaused = state.timePaused || state.currentScene !== 'world';
    if (!wasPaused) {
      state.gameTime = (state.gameTime || 0) + delta;
      _logAccum += delta;
      if (_debugLog && _logAccum >= 1) {
        _logAccum = 0;
        const info = phaseAt(state.gameTime);
        const fog = SceneManager.fog;
        const moon = SceneManager.moonLight;
        const amb = SceneManager.ambient;
        // eslint-disable-next-line no-console
        console.log(
          `[DayNight] phase=${info.phase.name} t=${state.gameTime.toFixed(1)}s ` +
            `moonI=${moon ? moon.intensity.toFixed(2) : '?'} ` +
            `ambI=${amb ? amb.intensity.toFixed(2) : '?'} ` +
            `fogD=${fog ? fog.density.toExponential(2) : '?'} ` +
            `fogHex=#${fog ? fog.color.getHexString() : '?'} ` +
            `skyHex=#${
              SceneManager.scene?.background?.isColor
                ? SceneManager.scene.background.getHexString()
                : '?'
            }`,
        );
      }
    }
    // Sky / fog / moon colors change over many seconds. Re-lerping them at
    // 60fps is pure waste; 10Hz is indistinguishable to the eye. Still runs
    // when paused so the cycle "sticks" to the right look on resume.
    _applyAccum += delta;
    if (_applyAccum >= 0.1 || wasPaused) {
      _applyAccum = 0;
      applyPhase(phaseAt(state.gameTime || 0));
    }
  },

  getCurrentPhase() {
    return phaseAt(state.gameTime || 0).phase.name;
  },
  getPhaseProgress() {
    return phaseAt(state.gameTime || 0).progress;
  },
  getPhaseInfo() {
    return phaseAt(state.gameTime || 0);
  },
  timeUntilNight() {
    const info = phaseAt(state.gameTime || 0);
    const offset = phaseStartOffset('night');
    let delta = offset - info.timeInCycle;
    if (delta < 0) delta += CYCLE_LENGTH;
    return delta;
  },

  PHASES,
  CYCLE_LENGTH,
};
