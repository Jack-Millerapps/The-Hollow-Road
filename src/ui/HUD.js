import { state, subscribe } from '../state.js';
import { Travel } from '../game/Travel.js';

const CURRENCY_LABELS = [
  { key: 'gold', label: 'Gold' },
  { key: 'memories', label: 'Memories' },
  { key: 'promises', label: 'Promises' },
  { key: 'years', label: 'Years' },
  { key: 'secrets', label: 'Secrets' },
];

const REP_LABELS = [
  { key: 'ashwick', label: 'Ashwick' },
  { key: 'veilMarket', label: 'Veil' },
  { key: 'stonehush', label: 'Stonehush' },
];

export const HUD = {
  root: null,
  elements: {},

  mount() {
    const root = document.getElementById('ui-root');
    this.root = root;

    const hud = document.createElement('div');
    hud.className = 'hud';

    const left = document.createElement('div');
    left.className = 'hud-section';
    for (const { key, label } of CURRENCY_LABELS) {
      const cell = document.createElement('span');
      cell.className = 'hud-cell';
      cell.innerHTML = `${label}: <span class="val" data-cur="${key}">0</span>`;
      left.appendChild(cell);
    }

    const right = document.createElement('div');
    right.className = 'hud-section';
    for (const { key, label } of REP_LABELS) {
      const badge = document.createElement('span');
      badge.className = 'hud-rep';
      badge.dataset.rep = key;
      badge.innerHTML = `${label} · <span class="val" data-rep-val="${key}">0</span>`;
      right.appendChild(badge);
    }

    hud.appendChild(left);
    hud.appendChild(right);
    root.appendChild(hud);

    const whole = document.createElement('div');
    whole.className = 'hud-wholeness';
    whole.innerHTML = `
      <div>Wholeness</div>
      <div class="bar"><div class="fill"></div></div>
    `;
    root.appendChild(whole);

    const pos = document.createElement('div');
    pos.className = 'hud-position';
    pos.innerHTML = 'The Hollow Road · <span data-pos>0</span> / 500';
    root.appendChild(pos);

    const walkBtn = document.createElement('button');
    walkBtn.className = 'walk-button';
    walkBtn.type = 'button';
    walkBtn.textContent = 'Walk';
    walkBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      walkBtn.setPointerCapture?.(e.pointerId);
      Travel.setButtonHeld(true);
    });
    const release = () => Travel.setButtonHeld(false);
    walkBtn.addEventListener('pointerup', release);
    walkBtn.addEventListener('pointercancel', release);
    walkBtn.addEventListener('pointerleave', release);
    walkBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    root.appendChild(walkBtn);

    const hint = document.createElement('div');
    hint.className = 'walk-hint';
    hint.textContent = 'Hold W or the button to walk';
    root.appendChild(hint);

    this.elements = { hud, whole, walkBtn, pos };

    subscribe(() => this.render());
    this.render();
  },

  render() {
    if (!this.root) return;
    for (const { key } of CURRENCY_LABELS) {
      const el = this.root.querySelector(`[data-cur="${key}"]`);
      if (el) el.textContent = String(state.currencies[key]);
    }
    for (const { key } of REP_LABELS) {
      const el = this.root.querySelector(`[data-rep-val="${key}"]`);
      const badge = this.root.querySelector(`.hud-rep[data-rep="${key}"]`);
      if (el) el.textContent = String(state.reputation[key]);
      if (badge) {
        badge.classList.toggle('good', state.reputation[key] > 0);
        badge.classList.toggle('bad', state.reputation[key] < 0);
      }
    }

    const whole = this.elements.whole;
    if (whole) {
      const fill = whole.querySelector('.fill');
      const pct = Math.max(0, Math.min(1, state.wholeness)) * 100;
      fill.style.setProperty('--fill', `${pct}%`);
      fill.style.width = `${pct}%`;
      whole.classList.toggle('low', state.wholeness < 0.45);
    }

    const btn = this.elements.walkBtn;
    if (btn) btn.classList.toggle('walking', state.isWalking);

    const pos = this.elements.pos;
    if (pos) {
      const metric = Math.round(Math.max(0, -state.cameraZ));
      const valEl = pos.querySelector('[data-pos]');
      if (valEl) valEl.textContent = String(metric);
    }
  },
};
