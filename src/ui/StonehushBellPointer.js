import { state, subscribe } from '../state.js';
import { DayNight } from '../scene/DayNight.js';
import { PauseManager } from '../game/PauseManager.js';
import { QuestSystem } from '../game/QuestSystem.js';
import { STONEHUSH_BELL_WORLD } from '../data/stonehushBell.js';

// ---------------------------------------------------------------------------
// StonehushBellPointer — only while sunset/night + quest step "find the bell".
// Rotating chevron shows which way to walk toward the bell interact point.
// ---------------------------------------------------------------------------

/** Signed angle (rad) from view-forward to flat target, Travel.js convention. */
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
  if (document.getElementById('stonehush-bell-pointer-style')) return;
  const s = document.createElement('style');
  s.id = 'stonehush-bell-pointer-style';
  s.textContent = `
.stonehush-bell-pointer {
  position: fixed;
  top: 96px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 48;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 18px 7px 12px;
  background: linear-gradient(180deg, rgba(32, 22, 14, 0.92), rgba(14, 10, 6, 0.92));
  border: 1px solid rgba(200, 144, 58, 0.42);
  border-radius: 999px;
  box-shadow: 0 4px 22px rgba(0, 0, 0, 0.55),
              0 0 20px -8px rgba(200, 144, 58, 0.25);
  color: #f0e0c0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.4s ease;
  max-width: min(92vw, 420px);
}
.stonehush-bell-pointer.visible {
  opacity: 1;
}
.stonehush-bell-pointer.wait-day .arrow {
  opacity: 0.55;
  filter: none;
}
.stonehush-bell-pointer .arrow-wrap {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.stonehush-bell-pointer .arrow {
  display: block;
  width: 34px;
  height: 34px;
  filter: drop-shadow(0 0 8px rgba(240, 200, 106, 0.5));
  transform-origin: 50% 50%;
}
.stonehush-bell-pointer .arrow path {
  fill: #f0c86a;
}
.stonehush-bell-pointer .copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.25;
}
.stonehush-bell-pointer .copy strong {
  font-weight: 600;
  color: #f5e6b8;
  letter-spacing: 0.12em;
  font-size: 11px;
}
.stonehush-bell-pointer .copy span {
  font-size: 11px;
  font-style: italic;
  text-transform: none;
  letter-spacing: 0.02em;
  color: #c8b898;
}
`;
  document.head.appendChild(s);
}

function stonehushBellStepId() {
  const q = state.quests?.stonehush;
  if (!q || q.done) return null;
  return QuestSystem.currentStep?.('stonehush')?.id ?? null;
}

function shouldShow() {
  if (state.currentScene !== 'world') return false;
  if (!state.flags?.hasLeftWestwind) return false;
  if (state.dialogueActive) return false;
  if (PauseManager.isPaused()) return false;

  const id = stonehushBellStepId();
  // Match QuestSystem catalogue ids (not raw step index — saves / ordering safe).
  if (id !== 'waitNight' && id !== 'bellChoice') return false;

  return true;
}

function isWaitNightDaytime() {
  const id = stonehushBellStepId();
  if (id !== 'waitNight') return false;
  const ph = DayNight.getCurrentPhase?.() ?? 'day';
  return ph === 'day';
}

export const StonehushBellPointer = {
  root: null,
  _arrow: null,
  _raf: 0,
  _lastRenderMs: 0,

  mount() {
    ensureStyle();
    const root = document.createElement('div');
    root.className = 'stonehush-bell-pointer';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');

    const wrap = document.createElement('div');
    wrap.className = 'arrow-wrap';
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('viewBox', '0 0 36 36');
    arrow.setAttribute('width', '34');
    arrow.setAttribute('height', '34');
    arrow.classList.add('arrow');
    arrow.setAttribute('aria-hidden', 'true');
    // A clear arrow: shaft + head (points UP in SVG space).
    arrow.innerHTML = `
      <path d="M16 32V16H10L18 4l8 12h-6v16z"></path>
    `;
    wrap.appendChild(arrow);

    const copy = document.createElement('div');
    copy.className = 'copy';
    copy.innerHTML =
      '<strong>Bell</strong><span class="sub">Follow the arrow toward the lower square.</span>';

    root.appendChild(wrap);
    root.appendChild(copy);

    document.getElementById('ui-root')?.appendChild(root);
    this.root = root;
    this._arrow = arrow;
    this._copySub = copy.querySelector('.sub');

    subscribe(() => this.syncVisibility());

    const loop = (now) => {
      if (now - this._lastRenderMs > 40) {
        this._lastRenderMs = now;
        // Phase / time can change without a state notify — re-check visibility here.
        this.syncVisibility();
        this.render();
      }
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
    this.syncVisibility();
  },

  syncVisibility() {
    if (!this.root) return;
    const on = shouldShow();
    this.root.classList.toggle('visible', on);
    this.root.classList.toggle('wait-day', on && isWaitNightDaytime());
    if (on && this._copySub) {
      const id = stonehushBellStepId();
      const ph = DayNight.getCurrentPhase?.() ?? 'day';
      const dark = ph === 'night' || ph === 'sunset' || ph === 'sunrise';
      if (id === 'bellChoice') {
        this._copySub.textContent =
          'South plaza — use your sleeping bag at the bell, or listen, then see the weaver.';
      } else if (dark) {
        this._copySub.textContent =
          'South plaza — arrow points toward the bell; approach and press E.';
      } else {
        this._copySub.textContent =
          'South plaza — head this way; after sunset, press E at the bell when prompted.';
      }
    }
  },

  render() {
    if (!this.root || !this._arrow) return;
    if (!this.root.classList.contains('visible')) return;

    const yaw = state.cameraYaw ?? 0;
    const px = state.playerPos?.x ?? 0;
    const pz = state.playerPos?.z ?? 0;
    const rel = relativeBearingRad(
      yaw,
      px,
      pz,
      STONEHUSH_BELL_WORLD.x,
      STONEHUSH_BELL_WORLD.z,
    );
    const deg = -(rel * 180) / Math.PI;
    this._arrow.style.transform = `rotate(${deg}deg)`;
  },
};
