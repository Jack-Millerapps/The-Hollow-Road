import { state, subscribe } from '../state.js';

// Thin horizontal bar mounted under the wholeness meter. Fades in while the
// player is depleting stamina and fades back out once it's full again.

function ensureStyle() {
  if (document.getElementById('stamina-bar-style')) return;
  const s = document.createElement('style');
  s.id = 'stamina-bar-style';
  s.textContent = `
.stamina-bar {
  position: fixed;
  top: 84px;
  left: 22px;
  width: 100px;
  height: 3px;
  background: rgba(58, 46, 26, 0.5);
  border-radius: 2px;
  overflow: hidden;
  opacity: 0;
  transition: opacity 0.45s ease;
  pointer-events: none;
  z-index: 14;
}
.stamina-bar.visible {
  opacity: 1;
}
.stamina-bar .fill {
  height: 100%;
  width: 100%;
  background: linear-gradient(to right, #e8c07a, #b87a2a);
  transition: width 0.1s linear, background 0.3s ease;
}
.stamina-bar.low .fill {
  background: linear-gradient(to right, #e37555, #7a2e1a);
}
  `;
  document.head.appendChild(s);
}

export const StaminaBar = {
  root: null,
  fill: null,
  _hideTimer: null,

  mount() {
    ensureStyle();
    const root = document.getElementById('ui-root');

    const bar = document.createElement('div');
    bar.className = 'stamina-bar';
    const fill = document.createElement('div');
    fill.className = 'fill';
    bar.appendChild(fill);
    root.appendChild(bar);

    this.root = bar;
    this.fill = fill;

    subscribe(() => this.render());
    this.render();
  },

  render() {
    if (!this.root || !this.fill) return;
    const max = state.maxStamina ?? 1.0;
    const s = Math.max(0, Math.min(max, state.stamina ?? max));
    const pct = (s / max) * 100;
    this.fill.style.width = `${pct}%`;
    this.root.classList.toggle('low', s / max < 0.3);

    // Visible whenever stamina isn't full, or while currently sprinting.
    const shouldShow = s < max - 0.001 || state.isSprinting;
    if (shouldShow) {
      this.root.classList.add('visible');
      if (this._hideTimer) {
        clearTimeout(this._hideTimer);
        this._hideTimer = null;
      }
    } else {
      if (!this._hideTimer) {
        this._hideTimer = setTimeout(() => {
          this.root?.classList.remove('visible');
          this._hideTimer = null;
        }, 600);
      }
    }
  },
};
