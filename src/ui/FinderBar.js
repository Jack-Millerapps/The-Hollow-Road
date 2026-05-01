import { state, subscribe } from '../state.js';
import { QuestSystem } from '../game/QuestSystem.js';
import { DayNight } from '../scene/DayNight.js';
import {
  DEEPROOT_TOWN_CENTER,
  DEEPROOT_VILLAGER_POSTS,
  DEEPROOT_JOURNAL_SPOT,
} from '../data/deeprootTargets.js';

// ---------------------------------------------------------------------------
// FinderBar — directional objective bar (old-school quest finder).
// Shows target label + distance + an arrow that points to the next location.
// ---------------------------------------------------------------------------

function relativeBearingRad(yaw, fromX, fromZ, toX, toZ) {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const len = Math.hypot(dx, dz);
  if (len < 0.25) return 0;
  const tx = dx / len;
  const tz = dz / len;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  return Math.atan2(fx * tz - fz * tx, fx * tx + fz * tz);
}

function ensureStyle() {
  if (document.getElementById('finder-bar-style')) return;
  const s = document.createElement('style');
  s.id = 'finder-bar-style';
  s.textContent = `
.finder-bar {
  position: fixed;
  top: 126px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 47;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 18px 8px 14px;
  background: linear-gradient(180deg, rgba(22, 16, 10, 0.92), rgba(12, 10, 6, 0.92));
  border: 1px solid rgba(200, 170, 120, 0.32);
  border-radius: 999px;
  box-shadow: 0 6px 26px rgba(0, 0, 0, 0.55);
  color: #e5d9b6;
  font-family: Georgia, 'Times New Roman', serif;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.35s ease;
  max-width: min(92vw, 560px);
}
.finder-bar.visible { opacity: 1; }
.finder-bar .arrow {
  width: 28px;
  height: 28px;
  filter: drop-shadow(0 0 8px rgba(200, 144, 58, 0.35));
}
.finder-bar .arrow path { fill: #c8903a; }
.finder-bar .txt {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.2;
}
.finder-bar .txt .top {
  font-variant: small-caps;
  letter-spacing: 0.16em;
  color: #f0d9a4;
  font-size: 12px;
}
.finder-bar .txt .sub {
  font-style: italic;
  font-size: 12px;
  color: rgba(229, 217, 182, 0.88);
}
`;
  document.head.appendChild(s);
}

function pickActiveQuest() {
  // Prefer blocked gating quests by road order, else first active quest.
  for (const name of ['ashwick', 'stonehush', 'deeproot', 'mirrorTown']) {
    const q = state.quests?.[name];
    if (q && !q.done && (q.step ?? 0) > 0) return name;
  }
  return null;
}

function deeprootTarget() {
  const q = state.quests?.deeproot;
  if (!q || q.done) return null;
  const step = QuestSystem.currentStep?.('deeproot')?.id ?? null;

  if (step === 'villagers') {
    const heard = q.villagerHeard || [false, false, false];
    const px = state.playerPos?.x ?? 0;
    const pz = state.playerPos?.z ?? 0;
    // Aim at nearest un-heard villager post (fallback to any).
    let best = null;
    for (let i = 0; i < 3; i++) {
      const target = DEEPROOT_VILLAGER_POSTS[i];
      if (!target) continue;
      const dx = target.x - px;
      const dz = target.z - pz;
      const d = dx * dx + dz * dz;
      const ok = !heard[i];
      if (ok && (!best || d < best.d)) best = { ...target, d, label: 'Deeproot villager' };
    }
    if (!best) {
      // Everyone heard: point to the center so re-enter dialogue is obvious.
      return { ...DEEPROOT_TOWN_CENTER, label: 'Root-keeper' };
    }
    return best;
  }

  if (step === 'journal') {
    return { ...DEEPROOT_JOURNAL_SPOT, label: 'Loose stones (journal)' };
  }

  if (step === 'choice') {
    return { ...DEEPROOT_TOWN_CENTER, label: 'Root-keeper' };
  }

  return null;
}

function getTarget() {
  const qname = pickActiveQuest();
  if (!qname) return null;
  if (qname === 'deeproot') return deeprootTarget();
  return null;
}

export const FinderBar = {
  root: null,
  _arrow: null,
  _top: null,
  _sub: null,
  _raf: 0,
  _lastMs: 0,

  mount() {
    ensureStyle();
    const root = document.createElement('div');
    root.className = 'finder-bar';

    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('viewBox', '0 0 36 36');
    arrow.setAttribute('width', '28');
    arrow.setAttribute('height', '28');
    arrow.classList.add('arrow');
    arrow.innerHTML = `<path d="M16 32V16H10L18 4l8 12h-6v16z"></path>`;

    const txt = document.createElement('div');
    txt.className = 'txt';
    txt.innerHTML = `<div class="top"></div><div class="sub"></div>`;

    root.appendChild(arrow);
    root.appendChild(txt);
    document.getElementById('ui-root')?.appendChild(root);

    this.root = root;
    this._arrow = arrow;
    this._top = txt.querySelector('.top');
    this._sub = txt.querySelector('.sub');

    subscribe(() => this.sync());

    const loop = (now) => {
      if (now - this._lastMs > 50) {
        this._lastMs = now;
        this.sync();
        this.render();
      }
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
    this.sync();
  },

  sync() {
    if (!this.root) return;
    const hide =
      state.currentScene === 'cutscene' ||
      state.currentScene === 'cabin' ||
      state.dialogueActive ||
      !state.flags?.hasLeftWestwind;
    if (hide) {
      this.root.classList.remove('visible');
      return;
    }
    const tgt = getTarget();
    this.root.classList.toggle('visible', !!tgt);
  },

  render() {
    if (!this.root || !this._arrow || !this._top || !this._sub) return;
    if (!this.root.classList.contains('visible')) return;
    const tgt = getTarget();
    if (!tgt) return;

    const px = state.playerPos?.x ?? 0;
    const pz = state.playerPos?.z ?? 0;
    const dist = Math.hypot(tgt.x - px, tgt.z - pz);
    const yaw = state.cameraYaw ?? 0;
    const rel = relativeBearingRad(yaw, px, pz, tgt.x, tgt.z);
    const deg = -(rel * 180) / Math.PI;
    this._arrow.style.transform = `rotate(${deg}deg)`;

    this._top.textContent = `${tgt.label}  •  ${Math.round(dist)}m`;

    const phase = DayNight.getCurrentPhase?.() ?? '';
    this._sub.textContent = phase === 'night'
      ? 'Night makes paths feel wrong — keep the arrow at the top and walk.'
      : 'Keep the arrow at the top and walk.';
  },
};

