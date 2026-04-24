import { state, subscribe } from '../state.js';
import { DayNight } from '../scene/DayNight.js';
import { villages } from '../data/villages.js';
import { caves } from '../data/caves.js';

// ---------------------------------------------------------------------------
// ObjectiveTracker — a single-line serif-italic strip below the currency
// pill telling the player what to do next. Text fades in / out when it
// changes. A small arrow "→" appears before the text when there's a
// concrete direction to head (toward the next town or an active objective).
// ---------------------------------------------------------------------------

function ensureStyle() {
  if (document.getElementById('objective-tracker-style')) return;
  const s = document.createElement('style');
  s.id = 'objective-tracker-style';
  s.textContent = `
.objective-tracker {
  position: fixed;
  top: 62px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 38;
  max-width: 80vw;
  padding: 4px 16px;
  background: rgba(12, 10, 8, 0.55);
  border: 1px solid rgba(200, 170, 120, 0.18);
  border-radius: 999px;
  color: #e5d9b6;
  font-family: Georgia, 'Times New Roman', serif;
  font-style: italic;
  font-size: 13px;
  letter-spacing: 0.03em;
  white-space: nowrap;
  pointer-events: none;
  transition: opacity 0.45s ease;
  opacity: 0;
}
.objective-tracker.visible { opacity: 1; }
.objective-tracker .arrow {
  display: inline-block;
  margin-right: 8px;
  color: #c8903a;
  font-style: normal;
  transform: translateY(-1px);
}
  `;
  document.head.appendChild(s);
}

// Return the next town ahead of the player (lower z = further south).
function nextTownSouthOf(playerPos) {
  let best = null;
  let bestDist = Infinity;
  for (const v of villages) {
    if (v.placeholder) continue;
    if (v.wandering) continue;
    if (state.tradeComplete?.[v.name]) continue;
    const dz = v.position.z - playerPos.z;
    if (dz > -1) continue; // must be south of player
    const d = Math.hypot(playerPos.x - v.position.x, dz);
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  return best;
}

function computeObjective() {
  const scene = state.currentScene;
  const pos = state.playerPos || { x: 0, z: 500 };

  if (scene === 'cave') {
    const caveId = state.currentCaveId;
    const cave = caves.find((c) => c.id === caveId);
    const name = cave?.name || 'the cave';
    return {
      text: `Explore ${name}. Mine, or find the troll.`,
      arrow: false,
    };
  }

  if (!state.flags.friendsArrived) {
    return { text: 'Wait for your friends.', arrow: false };
  }

  if (!state.flags.hasLeftWestwind) {
    return {
      text: 'Follow the road south to Ashwick.',
      arrow: true,
    };
  }

  // Night-on-road safety nudge.
  const phase = DayNight.getCurrentPhase?.();
  if (phase === 'night' && !state.offRoad) {
    return {
      text: 'Get off the road or find shelter.',
      arrow: false,
    };
  }

  // If there's an active quest with a hinted next step, prefer it.
  const activeQuest = Object.entries(state.quests || {}).find(
    ([, q]) => q && !q.done && q.step > 0,
  );
  if (activeQuest) {
    const [qname, q] = activeQuest;
    const hint = q.hint || 'continue the task';
    const displayName = qname.charAt(0).toUpperCase() + qname.slice(1);
    return { text: `${displayName} — ${hint}.`, arrow: true };
  }

  const next = nextTownSouthOf(pos);
  if (next) {
    return {
      text: `Reach ${next.displayName || next.name}.`,
      arrow: true,
    };
  }

  return { text: 'Follow the road.', arrow: true };
}

export const ObjectiveTracker = {
  root: null,
  _lastText: '',
  _mounted: false,

  mount() {
    if (this._mounted) return;
    this._mounted = true;
    ensureStyle();
    const el = document.createElement('div');
    el.className = 'objective-tracker';
    el.innerHTML = '<span class="arrow">→</span><span class="text"></span>';
    document.getElementById('ui-root').appendChild(el);
    this.root = el;

    subscribe(() => this.render());
    // Refresh periodically too (phase changes, off-road flips, etc.).
    setInterval(() => this.render(), 750);
    this.render();
  },

  render() {
    if (!this.root) return;
    const obj = computeObjective();
    const txtEl = this.root.querySelector('.text');
    const arrowEl = this.root.querySelector('.arrow');

    // Hide the whole strip during cutscenes / cabin / dialogue so it
    // doesn't pile on top of modal UI.
    const hideChrome =
      state.currentScene === 'cutscene' ||
      state.currentScene === 'cabin' ||
      state.dialogueActive;
    if (hideChrome) {
      this.root.classList.remove('visible');
      return;
    }

    if (obj.text !== this._lastText) {
      // Fade out, swap text, fade in.
      this.root.classList.remove('visible');
      setTimeout(() => {
        txtEl.textContent = obj.text;
        arrowEl.style.display = obj.arrow ? 'inline-block' : 'none';
        this.root.classList.add('visible');
      }, 150);
      this._lastText = obj.text;
    } else {
      if (txtEl.textContent !== obj.text) txtEl.textContent = obj.text;
      arrowEl.style.display = obj.arrow ? 'inline-block' : 'none';
      this.root.classList.add('visible');
    }
  },
};
