import { state, subscribe } from '../state.js';
import { DayNight } from '../scene/DayNight.js';

// ---------------------------------------------------------------------------
// HUD — consolidation patch.
//
// Layout:
//   - Top-left: menu button (40px, icon only)
//   - Top-center: horizontal currency strip (gold / memories / promises /
//     years / secrets)
//   - Top-right: day / night phase indicator
//   - Bottom-right: watch (when owned) — rendered by src/ui/Watch.js
//   - Bottom-left: stamina bar — rendered by src/ui/StaminaBar.js
//
// No reputation badges, no wholeness bar.
// An FPS counter is mounted separately (src/ui/FPSCounter.js).
// ---------------------------------------------------------------------------

const CURRENCY_LABELS = [
  { key: 'gold', icon: '❂', label: 'gold' },
  { key: 'memories', icon: '✦', label: 'memories' },
  { key: 'promises', icon: '❧', label: 'promises' },
  { key: 'years', icon: '⧖', label: 'years' },
  { key: 'secrets', icon: '☍', label: 'secrets' },
];

const PHASE_ICONS = {
  day: '☀',
  sunset: '◔',
  night: '☾',
  sunrise: '◑',
};

function pillCSS(extra = {}) {
  const base = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '6px 14px',
    background: 'rgba(12, 10, 8, 0.78)',
    border: '1px solid rgba(200, 170, 120, 0.28)',
    borderRadius: '999px',
    color: '#e5d9b6',
    fontFamily: 'Georgia, serif',
    fontSize: '13px',
    letterSpacing: '0.04em',
    pointerEvents: 'auto',
  };
  return Object.assign(base, extra);
}

export const HUD = {
  root: null,
  onMenu: null,
  _currencyEls: {},
  _phaseEl: null,

  mount({ onMenu } = {}) {
    this.root = document.getElementById('ui-root');
    this.onMenu = onMenu;

    // Top-left menu button.
    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.title = 'Menu (Esc)';
    menuBtn.textContent = '≡';
    Object.assign(menuBtn.style, {
      position: 'fixed',
      top: '18px',
      left: '18px',
      width: '40px',
      height: '40px',
      borderRadius: '50%',
      border: '1px solid rgba(200, 170, 120, 0.45)',
      background: 'rgba(12, 10, 8, 0.78)',
      color: '#e5d9b6',
      font: '22px Georgia, serif',
      cursor: 'pointer',
      zIndex: '40',
      pointerEvents: 'auto',
    });
    menuBtn.addEventListener('click', () => this.onMenu?.());
    this.root.appendChild(menuBtn);

    // Top-center currency strip.
    const strip = document.createElement('div');
    Object.assign(strip.style, pillCSS(), {
      position: 'fixed',
      top: '18px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '40',
    });
    for (const { key, icon } of CURRENCY_LABELS) {
      const cell = document.createElement('span');
      cell.innerHTML = `<span style="opacity:0.75">${icon}</span> <span data-cur="${key}">0</span>`;
      strip.appendChild(cell);
      this._currencyEls[key] = cell.querySelector('[data-cur]');
    }
    this.root.appendChild(strip);

    // Top-right phase indicator.
    const phase = document.createElement('div');
    Object.assign(phase.style, pillCSS(), {
      position: 'fixed',
      top: '18px',
      right: '18px',
      zIndex: '40',
    });
    phase.innerHTML = `<span data-phase-icon>☾</span> <span data-phase-text>Night</span>`;
    this.root.appendChild(phase);
    this._phaseEl = phase;

    subscribe(() => this.render());
    this.render();
  },

  render() {
    if (!this.root) return;
    for (const { key } of CURRENCY_LABELS) {
      const el = this._currencyEls[key];
      if (el) el.textContent = String(state.currencies[key] ?? 0);
    }
    if (this._phaseEl) {
      const phase = DayNight.getCurrentPhase?.() || 'night';
      const icon = this._phaseEl.querySelector('[data-phase-icon]');
      const text = this._phaseEl.querySelector('[data-phase-text]');
      if (icon) icon.textContent = PHASE_ICONS[phase] || '•';
      if (text) text.textContent = phase.charAt(0).toUpperCase() + phase.slice(1);
    }
  },
};
