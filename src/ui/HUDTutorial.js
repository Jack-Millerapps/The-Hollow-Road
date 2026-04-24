import { state, notify } from '../state.js';
import { Save } from '../game/Save.js';

// ---------------------------------------------------------------------------
// HUDTutorial — one-shot, runs once after the friends-arrive sequence.
//
// Highlights each HUD element in turn with a glowing outline and a label.
// Player can press Space or click "Skip" to dismiss early. When dismissed
// (naturally or via skip), sets state.flags.seenHudTutorial so it never runs
// again.
// ---------------------------------------------------------------------------

const STEP_DURATION_MS = 3000;

function ensureStyle() {
  if (document.getElementById('hud-tutorial-style')) return;
  const s = document.createElement('style');
  s.id = 'hud-tutorial-style';
  s.textContent = `
.hud-tut-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 60;
  pointer-events: auto;
  animation: hud-tut-fade 0.35s ease;
}
@keyframes hud-tut-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
.hud-tut-highlight {
  position: fixed;
  border: 2px solid rgba(255, 210, 130, 0.9);
  border-radius: 12px;
  box-shadow:
    0 0 0 4px rgba(255, 210, 130, 0.22),
    0 0 24px 4px rgba(255, 180, 80, 0.55),
    inset 0 0 16px rgba(255, 180, 80, 0.25);
  pointer-events: none;
  transition: top 0.35s ease, left 0.35s ease, width 0.35s ease, height 0.35s ease, opacity 0.25s ease;
  z-index: 61;
}
.hud-tut-label {
  position: fixed;
  max-width: 280px;
  padding: 10px 14px;
  background: rgba(13, 10, 6, 0.95);
  border: 1px solid rgba(200, 170, 120, 0.55);
  border-radius: 6px;
  color: #e8dcc8;
  font-family: Georgia, serif;
  font-size: 13.5px;
  line-height: 1.45;
  letter-spacing: 0.02em;
  pointer-events: none;
  z-index: 62;
  transition: top 0.35s ease, left 0.35s ease, opacity 0.25s ease;
}
.hud-tut-label .hdr {
  display: block;
  font-variant: small-caps;
  letter-spacing: 0.18em;
  color: #c8903a;
  margin-bottom: 4px;
  font-size: 12px;
}
.hud-tut-skip {
  position: fixed;
  right: 18px;
  bottom: 18px;
  padding: 8px 18px;
  background: rgba(13, 10, 6, 0.9);
  border: 1px solid rgba(200, 170, 120, 0.45);
  border-radius: 999px;
  color: #c8903a;
  font-family: Georgia, serif;
  font-size: 12px;
  font-variant: small-caps;
  letter-spacing: 0.22em;
  cursor: pointer;
  z-index: 63;
}
.hud-tut-skip:hover { color: #ffd79a; }
  `;
  document.head.appendChild(s);
}

function rectOf(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  return r;
}

function findMenuButton() {
  return (
    document.getElementById('hud-menu-btn') ||
    document.querySelector('#ui-root button[title^="Menu"]')
  );
}

function findCurrencyPill() {
  // The strip is the fixed-position div at top:18px / left:50% in HUD.
  const root = document.getElementById('ui-root');
  if (!root) return null;
  const candidates = Array.from(root.children);
  for (const c of candidates) {
    if (c.querySelector && c.querySelector('[data-cur]')) return c;
  }
  return null;
}

function findPhaseIndicator() {
  const root = document.getElementById('ui-root');
  if (!root) return null;
  for (const c of root.children) {
    if (c.querySelector && c.querySelector('[data-phase-text]')) return c;
  }
  return null;
}

function findWatch() {
  return document.querySelector('.watch-ui');
}

function findStamina() {
  return document.querySelector('.stamina-bar');
}

export const HUDTutorial = {
  running: false,
  root: null,
  highlight: null,
  label: null,
  skipBtn: null,
  _timer: null,
  _keyHandler: null,

  maybeShow() {
    if (this.running) return false;
    if (state.flags.seenHudTutorial) return false;
    this.start();
    return true;
  },

  start() {
    this.running = true;
    ensureStyle();

    const backdrop = document.createElement('div');
    backdrop.className = 'hud-tut-backdrop';
    document.body.appendChild(backdrop);

    const highlight = document.createElement('div');
    highlight.className = 'hud-tut-highlight';
    highlight.style.opacity = '0';
    document.body.appendChild(highlight);

    const label = document.createElement('div');
    label.className = 'hud-tut-label';
    label.style.opacity = '0';
    document.body.appendChild(label);

    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'hud-tut-skip';
    skipBtn.textContent = 'Skip';
    skipBtn.addEventListener('click', () => this.finish());
    document.body.appendChild(skipBtn);

    this.root = backdrop;
    this.highlight = highlight;
    this.label = label;
    this.skipBtn = skipBtn;

    this._keyHandler = (e) => {
      if (e.key === ' ' || e.code === 'Space' || e.key === 'Escape') {
        e.preventDefault();
        this.finish();
      }
    };
    window.addEventListener('keydown', this._keyHandler);

    const steps = [
      {
        header: 'Menu',
        text: 'Menu — pause, save, quit.',
        find: findMenuButton,
      },
      {
        header: 'Currencies',
        text:
          'Currencies — gold, memories, promises, years, secrets. You\'ll spend these.',
        find: findCurrencyPill,
      },
      {
        header: 'Phase',
        text: 'Day or night. The road is different at night.',
        find: findPhaseIndicator,
      },
      {
        header: 'Watch',
        text: 'Your watch. Count the time between nights.',
        find: findWatch,
        optional: true,
      },
      {
        header: 'Stamina',
        text: 'Stamina. It refills when you stop.',
        find: findStamina,
        optional: true,
      },
    ];

    let i = 0;
    const advance = () => {
      if (!this.running) return;
      if (i >= steps.length) {
        this.finish();
        return;
      }
      const step = steps[i++];
      const target = step.find();
      if (!target) {
        // Silent skip optional elements that aren't in the DOM yet.
        if (step.optional) {
          advance();
          return;
        }
      }
      const r = rectOf(target);
      if (!r) {
        advance();
        return;
      }
      this._position(r, step);
      this._timer = setTimeout(advance, STEP_DURATION_MS);
    };
    advance();
  },

  _position(r, step) {
    const pad = 8;
    this.highlight.style.top = `${r.top - pad}px`;
    this.highlight.style.left = `${r.left - pad}px`;
    this.highlight.style.width = `${r.width + pad * 2}px`;
    this.highlight.style.height = `${r.height + pad * 2}px`;
    this.highlight.style.opacity = '1';

    this.label.innerHTML = `<span class="hdr">${step.header}</span>${step.text}`;
    this.label.style.opacity = '1';

    // Place the label near the highlight without going off-screen.
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const labelW = 300;
    let lx = r.left + r.width / 2 - labelW / 2;
    let ly = r.bottom + 14;
    if (ly + 90 > vh) ly = r.top - 90;
    if (lx < 12) lx = 12;
    if (lx + labelW > vw - 12) lx = vw - labelW - 12;
    this.label.style.left = `${lx}px`;
    this.label.style.top = `${ly}px`;
    this.label.style.maxWidth = `${labelW}px`;
  },

  finish() {
    if (!this.running) return;
    this.running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    for (const el of [this.root, this.highlight, this.label, this.skipBtn]) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
    this.root = this.highlight = this.label = this.skipBtn = null;

    state.flags.seenHudTutorial = true;
    notify();
    Save.write(state);
  },
};
