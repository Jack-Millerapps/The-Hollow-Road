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
// Color targets (Fix 3):
//   day      sky=#7aa0c8 (clear blue) ambient=#c8d8e8 fog=#9ab0c8
//   sunset   sky=#c8602a (amber)      ambient=#8a4828 fog=#6a3820
//   night    sky=#04060a (near black) ambient=#0a0c18 fog=#04060a
//   sunrise  sky=#e8804a (warm pink)  ambient=#906858 fog=#8a5840
//
// scene.background is a THREE.Color which we lerp toward the phase target
// every frame (rather than snapping). Stars opacity = 0 during day & sunrise,
// and fade up across sunset → night. The opacity is lerped with phase
// progress so the transition is smooth.
// ---------------------------------------------------------------------------

const PHASES = [
  {
    name: 'day',
    duration: 300,
    moonColor: 0xffffff,
    moonIntensity: 1.1,
    ambientColor: 0xc8d8e8,
    ambientIntensity: 0.7,
    fogColor: 0x9ab0c8,
    fogDensity: 0.0008,
    skyColor: 0x7aa0c8,
    starOpacity: 0.0,
  },
  {
    name: 'sunset',
    duration: 60,
    moonColor: 0xff7722,
    moonIntensity: 0.75,
    ambientColor: 0x8a4828,
    ambientIntensity: 0.45,
    fogColor: 0x6a3820,
    fogDensity: 0.002,
    skyColor: 0xc8602a,
    starOpacity: 0.55,
  },
  {
    name: 'night',
    duration: 120,
    moonColor: 0x3a4a7a,
    moonIntensity: 0.4,
    ambientColor: 0x0a0c18,
    ambientIntensity: 0.18,
    fogColor: 0x04060a,
    fogDensity: 0.006,
    skyColor: 0x04060a,
    starOpacity: 1.0,
  },
  {
    name: 'sunrise',
    duration: 30,
    moonColor: 0xffaa55,
    moonIntensity: 0.8,
    ambientColor: 0x906858,
    ambientIntensity: 0.5,
    fogColor: 0x8a5840,
    fogDensity: 0.0015,
    skyColor: 0xe8804a,
    starOpacity: 0.0,
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

// Leg 1 (Westwind → Ashwick): never leave the "day" slice of the cycle so
// sunset/night never render. Clamp wrapped cycle time to the blue-sky part.
const LEG1_MAX_WITHIN_CYCLE = 168;

function effectiveGameTime() {
  let t = state.gameTime || 0;
  if (state.flags?.leg1Complete) return t;
  const base = Math.floor(t / CYCLE_LENGTH) * CYCLE_LENGTH;
  const w = t - base;
  if (w > LEG1_MAX_WITHIN_CYCLE) return base + LEG1_MAX_WITHIN_CYCLE;
  return t;
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
const _skyTarget = new THREE.Color();

function lerpHex(a, b, k, out) {
  out.setHex(a);
  _tmpColorB.setHex(b);
  out.lerp(_tmpColorB, k);
  return out;
}

// Per-frame lerp toward target (rather than snapping). delta-aware so the
// rate is consistent regardless of frame timing.
function lerpColorTowards(current, targetHex, rate) {
  _tmpColorB.setHex(targetHex);
  current.lerp(_tmpColorB, rate);
  return current;
}

function applyPhase(info, dt) {
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

  // Sky background — compute the target for this point in the cycle, then
  // lerp the actual scene.background toward it. The lerp rate is tuned so
  // the sky catches up over ~1.5s (visible smoothness, no hard snaps).
  if (scene) {
    lerpHex(current.skyColor, next.skyColor, k, _skyTarget);
    if (!scene.background || !scene.background.isColor) {
      scene.background = _skyTarget.clone();
    } else {
      // 1 - exp(-dt * rate) gives a frame-rate-independent lerp.
      const rate = 1 - Math.exp(-(dt || 0.016) * 1.8);
      scene.background.lerp(_skyTarget, rate);
    }
  }

  // Stars: visible during night and late sunset only. day & sunrise = 0.
  // Use the same smoothed phase progress so the alpha transitions softly.
  const stars = Environment?.stars;
  if (stars?.material) {
    const targetAlpha =
      current.starOpacity + (next.starOpacity - current.starOpacity) * k;
    // Lerp toward target to avoid the per-frame breathing flicker overriding
    // the global transition.
    const rate = 1 - Math.exp(-(dt || 0.016) * 1.6);
    const cur = stars.material.opacity;
    stars.material.opacity = cur + (targetAlpha - cur) * rate;
    stars.visible = stars.material.opacity > 0.01;
  }
}

function reconcilePause() {
  const anyPanel =
    !!DialoguePanel.root || !!TradePanel.root || !!state.dialogueActive;
  const offWorld = state.currentScene !== 'world';
  const paused = !!state.paused;
  state.timePaused = anyPanel || offWorld || paused;
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
    if (typeof window !== 'undefined') {
      window.__hollowRoadDayNightDebug = () => {
        _debugLog = true;
      };
    }

    if (startPhase) {
      state.gameTime = phaseStartOffset(startPhase);
    }

    reconcilePause();
    applyPhase(phaseAt(effectiveGameTime()), 1.0);
  },

  setStartPhase(name) {
    state.gameTime = phaseStartOffset(name);
    applyPhase(phaseAt(effectiveGameTime()), 1.0);
  },

  update(delta) {
    reconcilePause();
    const wasPaused = state.timePaused || state.currentScene !== 'world';
    if (!wasPaused) {
      state.gameTime = (state.gameTime || 0) + delta;
      if (!state.flags?.leg1Complete) {
        const base = Math.floor(state.gameTime / CYCLE_LENGTH) * CYCLE_LENGTH;
        const w = state.gameTime - base;
        if (w > LEG1_MAX_WITHIN_CYCLE) {
          state.gameTime = base + LEG1_MAX_WITHIN_CYCLE;
        }
      }
      _logAccum += delta;
      if (_debugLog && _logAccum >= 1) {
        _logAccum = 0;
        const info = phaseAt(effectiveGameTime());
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
    // Apply every frame so scene.background and stars always lerp smoothly
    // (even when paused, so resume looks consistent).
    applyPhase(phaseAt(effectiveGameTime()), delta);
  },

  getCurrentPhase() {
    return phaseAt(effectiveGameTime()).phase.name;
  },
  getPhaseProgress() {
    return phaseAt(effectiveGameTime()).progress;
  },
  getPhaseInfo() {
    return phaseAt(effectiveGameTime());
  },
  timeUntilNight() {
    const info = phaseAt(effectiveGameTime());
    const offset = phaseStartOffset('night');
    let delta = offset - info.timeInCycle;
    if (delta < 0) delta += CYCLE_LENGTH;
    return delta;
  },

  PHASES,
  CYCLE_LENGTH,
};
