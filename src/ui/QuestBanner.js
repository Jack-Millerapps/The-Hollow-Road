import { state, subscribe } from '../state.js';
import { villages } from '../data/villages.js';
import { QuestSystem } from '../game/QuestSystem.js';

// ---------------------------------------------------------------------------
// QuestBanner — a large, prominent banner at the top of the screen that
// surfaces the active town quest while the player is at or past a town
// whose quest hasn't been resolved.
//
// The smaller ObjectiveTracker line is kept (it summarizes the moment-to-
// moment objective). The banner is reserved for the gating quest the player
// must finish before progressing further down the road.
// ---------------------------------------------------------------------------

const TOWN_DISPLAY = {
  ashwick: 'Ashwick',
  veilMarket: 'The Veil Market',
  stonehush: 'Stonehush',
  deeproot: 'Deeproot',
  mirrorTown: 'Mirror Town',
};

const TOWN_POS = {
  ashwick: { x: 0, z: -500 },
  veilMarket: { x: 0, z: -2500 },
  stonehush: { x: -800, z: -5000 },
  deeproot: { x: 600, z: -6000 },
  mirrorTown: { x: 200, z: -7800 },
};

// Approach radius — within this distance we surface the banner. Generous so
// the player sees it as soon as the next town comes into view.
const APPROACH_RADIUS = 90;

const TOWN_ORDER = ['ashwick', 'veilMarket', 'stonehush', 'deeproot', 'mirrorTown'];

function ensureStyle() {
  if (document.getElementById('quest-banner-style')) return;
  const s = document.createElement('style');
  s.id = 'quest-banner-style';
  s.textContent = `
.quest-banner {
  position: fixed;
  top: 18px;
  left: 50%;
  transform: translate(-50%, -16px);
  z-index: 39;
  min-width: 360px;
  max-width: 86vw;
  padding: 12px 24px 12px 22px;
  background: linear-gradient(180deg, rgba(28, 18, 8, 0.94), rgba(14, 10, 6, 0.94));
  border: 1px solid #6a4a1c;
  border-left: 4px solid #c8903a;
  border-radius: 6px;
  box-shadow: 0 6px 24px -8px rgba(0, 0, 0, 0.7),
              0 0 24px -10px rgba(200, 144, 58, 0.45);
  color: #f0d9a4;
  font-family: Georgia, 'Times New Roman', serif;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.5s ease, transform 0.5s ease;
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: center;
}
.quest-banner.visible {
  opacity: 1;
  transform: translate(-50%, 0);
}
.quest-banner .qb-eyebrow {
  font-size: 11px;
  letter-spacing: 0.32em;
  color: #c8903a;
  text-transform: uppercase;
  font-style: normal;
  font-weight: 600;
}
.quest-banner .qb-title {
  font-size: 19px;
  font-style: italic;
  letter-spacing: 0.04em;
  color: #f5e3b6;
}
.quest-banner .qb-hint {
  font-size: 14px;
  font-style: italic;
  color: #d8c697;
  letter-spacing: 0.02em;
  opacity: 0.92;
}
.quest-banner.locked .qb-eyebrow {
  color: #d65a3a;
}
.quest-banner.locked {
  border-left-color: #d65a3a;
}
  `;
  document.head.appendChild(s);
}

function nearestUnfinishedTown(playerPos) {
  let best = null;
  let bestD = Infinity;
  for (const name of TOWN_ORDER) {
    if (state.tradeComplete?.[name]) continue;
    const p = TOWN_POS[name];
    if (!p) continue;
    const dx = playerPos.x - p.x;
    const dz = playerPos.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < bestD) {
      bestD = d;
      best = { name, distance: d };
    }
  }
  return best;
}

function activeTownIsBlocking(playerPos) {
  // If the player is south of an unfinished town's z-position, they're being
  // blocked by it (they hit or are heading toward the gate).
  for (const name of TOWN_ORDER) {
    if (state.tradeComplete?.[name]) continue;
    const p = TOWN_POS[name];
    if (!p) continue;
    if (playerPos.z <= p.z + 60) {
      return name;
    }
  }
  return null;
}

function buildBannerContent(townName, blocking) {
  const display = TOWN_DISPLAY[townName] || townName;
  const quest = QuestSystem.getQuest?.(townName);
  const v = villages.find((vv) => vv.name === townName);
  let title = quest?.displayName || `${display} — A task awaits`;
  let hint = '';
  if (quest) {
    const q = state.quests?.[townName];
    const stepIdx = q?.step ?? 0;
    const steps = quest.steps || [];
    const step = steps[Math.min(stepIdx, steps.length - 1)];
    if (step) hint = step.hint;
    if (!hint && quest.giver) hint = `Speak to ${quest.giver}.`;
  } else if (v?.npc) {
    hint = `Speak to ${v.npc}.`;
  }
  const eyebrow = blocking ? `⚑ Blocked — ${display}` : `Quest — ${display}`;
  return { eyebrow, title, hint };
}

export const QuestBanner = {
  root: null,
  _mounted: false,
  _lastKey: '',

  mount() {
    if (this._mounted) return;
    this._mounted = true;
    ensureStyle();
    const el = document.createElement('div');
    el.className = 'quest-banner';
    el.innerHTML =
      '<div class="qb-eyebrow"></div>' +
      '<div class="qb-title"></div>' +
      '<div class="qb-hint"></div>';
    document.getElementById('ui-root').appendChild(el);
    this.root = el;

    subscribe(() => this.render());
    setInterval(() => this.render(), 600);
    this.render();
  },

  render() {
    if (!this.root) return;

    const hideChrome =
      state.currentScene === 'cutscene' ||
      state.currentScene === 'cabin' ||
      state.currentScene === 'cave' ||
      state.dialogueActive ||
      !state.flags.hasLeftWestwind;

    if (hideChrome) {
      this.root.classList.remove('visible');
      return;
    }

    const pos = state.playerPos || { x: 0, z: 500 };
    const blocking = activeTownIsBlocking(pos);
    let townName = blocking;
    if (!townName) {
      const near = nearestUnfinishedTown(pos);
      if (near && near.distance < APPROACH_RADIUS) townName = near.name;
    }

    if (!townName) {
      this.root.classList.remove('visible');
      return;
    }

    const { eyebrow, title, hint } = buildBannerContent(townName, !!blocking);
    const key = `${townName}|${blocking ? 1 : 0}|${title}|${hint}`;
    if (key !== this._lastKey) {
      this.root.querySelector('.qb-eyebrow').textContent = eyebrow;
      this.root.querySelector('.qb-title').textContent = title;
      const hintEl = this.root.querySelector('.qb-hint');
      hintEl.textContent = hint;
      hintEl.style.display = hint ? 'block' : 'none';
      this.root.classList.toggle('locked', !!blocking);
      this._lastKey = key;
    }
    this.root.classList.add('visible');
  },
};
