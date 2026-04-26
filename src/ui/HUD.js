import { state, subscribe } from '../state.js';
import { DayNight } from '../scene/DayNight.js';
import { PauseManager } from '../game/PauseManager.js';

// ---------------------------------------------------------------------------
// HUD — consolidation patch.
//
// Layout:
//   - Top-left: a single "Menu" text button (Cinzel Decorative, warm gold)
//   - Top-center: horizontal currency strip
//   - Top-right: day / night phase indicator
//   - Bottom-right: watch (when owned)
//   - Bottom-left: stamina bar
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

function ensureMenuFont() {
  if (document.getElementById('hud-cinzel-font')) return;
  const link = document.createElement('link');
  link.id = 'hud-cinzel-font';
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700&display=swap';
  document.head.appendChild(link);
}

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
  menuBtn: null,

  mount({ onMenu } = {}) {
    this.root = document.getElementById('ui-root');
    ensureMenuFont();

    this.onMenu = onMenu || (() => PauseManager.toggle());

    // Strip any stale pre-existing menu buttons from older builds.
    this.root
      ?.querySelectorAll(
        '.hamburger, .menu-button, [data-hamburger], #hud-menu-btn',
      )
      .forEach((el) => el.remove());

    // Top-left "Menu" text button — single source of truth.
    const menuBtn = document.createElement('button');
    menuBtn.id = 'hud-menu-btn';
    menuBtn.type = 'button';
    menuBtn.title = 'Menu (Esc)';
    menuBtn.textContent = 'Menu';
    Object.assign(menuBtn.style, {
      position: 'fixed',
      top: '14px',
      left: '18px',
      padding: '6px 14px',
      background: 'rgba(12, 10, 8, 0.72)',
      border: '1px solid rgba(200, 170, 120, 0.55)',
      borderRadius: '2px',
      color: '#c8903a',
      fontFamily: "'Cinzel Decorative', Cinzel, Georgia, serif",
      fontSize: '10px',
      fontWeight: '400',
      letterSpacing: '0.25em',
      fontVariant: 'small-caps',
      cursor: 'pointer',
      zIndex: '40',
      pointerEvents: 'auto',
      textShadow: '0 0 6px rgba(200, 144, 58, 0.25)',
    });
    menuBtn.addEventListener('mouseenter', () => {
      menuBtn.style.color = '#e8dcc8';
    });
    menuBtn.addEventListener('mouseleave', () => {
      menuBtn.style.color = '#c8903a';
    });
    menuBtn.addEventListener('click', () => this.onMenu?.());
    this.root.appendChild(menuBtn);
    this.menuBtn = menuBtn;

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
