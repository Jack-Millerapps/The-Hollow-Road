import { state, notify, gain } from '../state.js';
import { CaveInterior } from '../scene/CaveInterior.js';
import { DayNight } from '../scene/DayNight.js';
import { Save } from './Save.js';

// ---------------------------------------------------------------------------
// Phase 3 — Mining + resting.
//
// Pressing F with a pickaxe while close to an ore node mines it over 2
// seconds. Nodes have 3 uses then deplete. Pressing F at the sleeping
// alcove rests the player, advances gameTime to the next day phase start,
// and restores stamina. All live while state.currentScene === 'cave'.
// ---------------------------------------------------------------------------

const MINE_RADIUS = 2.0;
const REST_RADIUS = 2.0;
const MINE_DURATION = 2.0; // seconds
const NODE_USES = 3;
const ALL_CURRENCIES = ['gold', 'memories', 'promises', 'years', 'secrets'];

function ensureProgressStyle() {
  if (document.getElementById('mine-progress-style')) return;
  const s = document.createElement('style');
  s.id = 'mine-progress-style';
  s.textContent = `
.mine-progress {
  position: fixed;
  bottom: 200px;
  left: 50%;
  transform: translateX(-50%);
  width: 240px;
  padding: 12px 16px;
  background: rgba(13, 6, 4, 0.88);
  border: 1px solid #5a2a14;
  border-radius: 8px;
  color: #e9c894;
  font-family: Georgia, serif;
  font-variant: small-caps;
  letter-spacing: 0.22em;
  text-align: center;
  z-index: 40;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}
.mine-progress.show { opacity: 1; }
.mine-progress .label { font-size: 12px; margin-bottom: 8px; }
.mine-progress .track {
  position: relative;
  height: 6px;
  background: rgba(60, 30, 10, 0.8);
  border-radius: 3px;
  overflow: hidden;
}
.mine-progress .fill {
  position: absolute; inset: 0;
  width: 0%;
  background: linear-gradient(90deg, #c27a1a, #ffae5a);
  transition: width 0.1s linear;
}
.mine-prompt {
  position: fixed;
  bottom: 150px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 18px;
  background: rgba(13, 10, 6, 0.88);
  border: 1px solid #5a3820;
  border-radius: 999px;
  color: #ffb060;
  font-family: Georgia, serif;
  font-size: 13px;
  font-variant: small-caps;
  letter-spacing: 0.22em;
  z-index: 25;
  opacity: 0;
  transition: opacity 0.25s ease;
  pointer-events: none;
}
  `;
  document.head.appendChild(s);
}

function buildProgressDOM() {
  ensureProgressStyle();
  const el = document.createElement('div');
  el.className = 'mine-progress';
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = 'Mining…';
  const track = document.createElement('div');
  track.className = 'track';
  const fill = document.createElement('div');
  fill.className = 'fill';
  track.appendChild(fill);
  el.appendChild(label);
  el.appendChild(track);
  const root = document.getElementById('ui-root') || document.body;
  root.appendChild(el);
  return { el, fill, label };
}

function buildPromptDOM() {
  ensureProgressStyle();
  const el = document.createElement('div');
  el.className = 'mine-prompt';
  const root = document.getElementById('ui-root') || document.body;
  root.appendChild(el);
  return el;
}

function fadeToBlack(duration) {
  return new Promise((resolve) => {
    const el = document.getElementById('fade-overlay');
    if (!el) return resolve();
    el.style.transition = `opacity ${duration}ms ease`;
    void el.offsetWidth;
    el.style.opacity = '1';
    setTimeout(resolve, duration + 30);
  });
}

function fadeFromBlack(duration) {
  return new Promise((resolve) => {
    const el = document.getElementById('fade-overlay');
    if (!el) return resolve();
    el.style.transition = `opacity ${duration}ms ease`;
    void el.offsetWidth;
    el.style.opacity = '0';
    setTimeout(resolve, duration + 30);
  });
}

function advanceTimeToNextDay(gameTime) {
  const cycle = DayNight.CYCLE_LENGTH;
  // PHASES are in order day, sunset, night, sunrise. We want to jump to the
  // next "day" start. Find current position within cycle, then move
  // forward until we hit the next day-phase boundary.
  const phases = DayNight.PHASES;
  let acc = 0;
  let dayStart = 0;
  for (let i = 0; i < phases.length; i++) {
    if (phases[i].name === 'day') {
      dayStart = acc;
      break;
    }
    acc += phases[i].duration;
  }
  const wrapped = ((gameTime % cycle) + cycle) % cycle;
  let delta = dayStart - wrapped;
  if (delta <= 0) delta += cycle;
  return gameTime + delta;
}

export const Mining = {
  _progress: null,
  _prompt: null,
  _miningNode: null,
  _mineT: 0,
  _resting: false,
  _playerPos: null,

  init() {
    this._progress = buildProgressDOM();
    this._prompt = buildPromptDOM();

    window.addEventListener('keyup', (e) => {
      if (state.currentScene !== 'cave') return;
      if ((e.key === 'f' || e.key === 'F') && this._miningNode) {
        this._cancelMining();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (state.currentScene !== 'cave') return;
      if (e.key === 'f' || e.key === 'F') {
        this._onFPress();
      }
    });
  },

  _setPrompt(text) {
    if (!this._prompt) return;
    if (text) {
      this._prompt.textContent = text;
      this._prompt.style.opacity = '1';
    } else {
      this._prompt.style.opacity = '0';
    }
  },

  _nearestActiveOre() {
    if (!this._playerPos) return null;
    const nodes = CaveInterior.getOreNodes();
    let best = null;
    let bestDist = Infinity;
    for (const n of nodes) {
      if (n.userData.depleted) continue;
      const wp = new (n.position.constructor)();
      n.getWorldPosition(wp);
      const dist = Math.hypot(wp.x - this._playerPos.x, wp.z - this._playerPos.z);
      if (dist < MINE_RADIUS && dist < bestDist) {
        best = n;
        bestDist = dist;
      }
    }
    return best;
  },

  _nearBed() {
    if (!this._playerPos) return false;
    const bed = CaveInterior.getBedWorldPos();
    if (!bed) return false;
    return Math.hypot(bed.x - this._playerPos.x, bed.z - this._playerPos.z) < REST_RADIUS;
  },

  _onFPress() {
    if (this._resting || this._miningNode) return;

    // Priority: bed > ore.
    if (this._nearBed()) {
      this._rest();
      return;
    }
    const ore = this._nearestActiveOre();
    if (!ore) return;

    // Need a pickaxe to mine.
    if (!state.items.pickaxe) {
      this._setPrompt('You need a pickaxe');
      setTimeout(() => {
        if (!this._miningNode) this._setPrompt('');
      }, 1400);
      return;
    }

    this._startMining(ore);
  },

  _startMining(node) {
    this._miningNode = node;
    this._mineT = 0;
    this._progress.el.classList.add('show');
    this._progress.label.textContent = `Mining ${this._oreLabel(node)}…`;
    this._progress.fill.style.width = '0%';
  },

  _oreLabel(node) {
    const cave = node.userData.cave;
    return cave.currency === 'any' ? 'deep ore' : cave.currency;
  },

  _cancelMining() {
    if (!this._miningNode) return;
    this._miningNode = null;
    this._mineT = 0;
    this._progress.el.classList.remove('show');
  },

  _finishMining() {
    const node = this._miningNode;
    if (!node) return;
    const cave = node.userData.cave;
    let reward = cave.currency;
    if (reward === 'any') {
      reward = ALL_CURRENCIES[Math.floor(Math.random() * ALL_CURRENCIES.length)];
    }
    gain(reward, 1);

    const nodeId = node.userData.nodeId;
    const remaining =
      state.mined[nodeId] !== undefined
        ? state.mined[nodeId] - 1
        : NODE_USES - 1;
    state.mined[nodeId] = Math.max(0, remaining);
    if (state.mined[nodeId] <= 0) {
      // Deplete: mute the crystal emissive.
      node.userData.depleted = true;
      for (const crystal of node.userData.crystals || []) {
        if (crystal.material) {
          crystal.material.emissiveIntensity = 0;
          crystal.material.color.setHex(0x1a1008);
        }
      }
    }
    this._miningNode = null;
    this._mineT = 0;
    this._progress.el.classList.remove('show');
    notify();
    Save.write(state);
  },

  async _rest() {
    this._resting = true;
    this._setPrompt('Resting…');
    await fadeToBlack(900);
    state.gameTime = advanceTimeToNextDay(state.gameTime || 0);
    state.stamina = state.maxStamina ?? 1.0;
    notify();
    Save.write(state);
    await new Promise((r) => setTimeout(r, 400));
    await fadeFromBlack(900);
    this._resting = false;
    this._setPrompt('');
  },

  update(delta, playerPos) {
    this._playerPos = playerPos;

    if (state.currentScene !== 'cave') {
      this._setPrompt('');
      if (this._miningNode) this._cancelMining();
      return;
    }

    // Advance active mining progress.
    if (this._miningNode) {
      // Still in range?
      const wp = new (this._miningNode.position.constructor)();
      this._miningNode.getWorldPosition(wp);
      const dist = Math.hypot(wp.x - playerPos.x, wp.z - playerPos.z);
      if (dist > MINE_RADIUS + 0.3) {
        this._cancelMining();
      } else {
        this._mineT += delta;
        const pct = Math.min(1, this._mineT / MINE_DURATION);
        this._progress.fill.style.width = `${pct * 100}%`;
        if (pct >= 1) {
          this._finishMining();
        }
      }
      return;
    }

    // Show prompts when near something interactable.
    if (this._resting) return;
    if (this._nearBed()) {
      this._setPrompt('Press F — rest until morning');
      return;
    }
    const ore = this._nearestActiveOre();
    if (ore) {
      const label = this._oreLabel(ore);
      const remaining =
        state.mined[ore.userData.nodeId] !== undefined
          ? state.mined[ore.userData.nodeId]
          : NODE_USES;
      this._setPrompt(`Press F — mine ${label} (${remaining})`);
    } else {
      this._setPrompt('');
    }
  },

  // Applied on cave entry so already-mined depleted nodes visually reflect
  // their state.
  syncDepletion() {
    const nodes = CaveInterior.getOreNodes();
    for (const n of nodes) {
      const id = n.userData.nodeId;
      const remaining = state.mined[id];
      if (remaining !== undefined && remaining <= 0) {
        n.userData.depleted = true;
        for (const crystal of n.userData.crystals || []) {
          if (crystal.material) {
            crystal.material.emissiveIntensity = 0;
            crystal.material.color.setHex(0x1a1008);
          }
        }
      }
    }
  },
};
