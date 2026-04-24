import { state } from '../state.js';
import { DayNight } from '../scene/DayNight.js';

// Faint pulsing amber banner at the top of the screen, only visible during
// the 'sunset' phase. Lets the player know night is about to begin.

function ensureStyle() {
  if (document.getElementById('phase-warning-style')) return;
  const s = document.createElement('style');
  s.id = 'phase-warning-style';
  s.textContent = `
.phase-warning {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translate(-50%, -6px);
  padding: 6px 18px;
  color: #f0c080;
  font-family: Georgia, serif;
  font-style: italic;
  font-size: 15px;
  letter-spacing: 0.04em;
  text-shadow:
    0 0 10px rgba(255, 150, 60, 0.4),
    0 0 30px rgba(255, 110, 40, 0.2);
  pointer-events: none;
  opacity: 0;
  transition: opacity 1.2s ease, transform 1.2s ease;
  z-index: 18;
}
.phase-warning.visible {
  opacity: 1;
  transform: translate(-50%, 0);
  animation: phase-warning-pulse 3.2s ease-in-out infinite;
}
@keyframes phase-warning-pulse {
  0%, 100% { text-shadow: 0 0 10px rgba(255, 150, 60, 0.35), 0 0 28px rgba(255, 110, 40, 0.18); }
  50% { text-shadow: 0 0 18px rgba(255, 170, 80, 0.55), 0 0 42px rgba(255, 130, 50, 0.3); }
}
  `;
  document.head.appendChild(s);
}

export const PhaseWarning = {
  root: null,
  _raf: 0,

  mount() {
    ensureStyle();
    const root = document.createElement('div');
    root.className = 'phase-warning';
    root.textContent = 'The sun is setting. The road will not be safe soon.';
    document.getElementById('ui-root').appendChild(root);
    this.root = root;

    const loop = () => {
      this.sync();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  },

  sync() {
    if (!this.root) return;
    const inWorld = state.currentScene === 'world';
    const phase = DayNight.getCurrentPhase();
    const shouldShow = inWorld && phase === 'sunset';
    this.root.classList.toggle('visible', shouldShow);
  },
};
