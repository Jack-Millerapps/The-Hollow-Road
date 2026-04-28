// AdminMode — debug overlay for teleport + speed tuning.
// Toggle with backtick (`) or F1.

import { Travel } from '../game/Travel.js';
import { state, notify } from '../state.js';
import { villages } from '../data/villages.js';
import { TownShells, TOWN_IDS } from '../scene/TownShells.js';

const LOCATIONS = [
  { name: 'Westwind (home)', x: 0, z: 500 },
  ...villages.map((v) => ({
    name: v.displayName || v.name,
    x: v.position.x,
    z: v.position.z,
  })),
];

const TOWN_LABELS = {
  westwind: 'Westwind',
  ashwick: 'Ashwick',
  stonehush: 'Stonehush',
  deeproot: 'Deeproot',
  mirrorTown: 'Mirror Town',
  unnamed: 'The Unnamed',
};

let panel = null;
let visible = false;

function fmt(n) {
  return Number(n).toFixed(1);
}

function build() {
  const el = document.createElement('div');
  el.id = 'admin-panel';
  el.style.cssText = [
    'position: fixed',
    'top: 16px',
    'right: 16px',
    'width: 260px',
    'max-height: calc(100vh - 32px)',
    'overflow-y: auto',
    'padding: 12px 14px',
    'background: rgba(10,8,5,0.92)',
    'border: 1px solid #5a4628',
    'border-radius: 6px',
    'color: #e8dcc8',
    'font-family: Georgia, serif',
    'font-size: 12px',
    'z-index: 9999',
    'display: none',
    'box-shadow: 0 4px 16px rgba(0,0,0,0.6)',
  ].join(';');

  const speeds = Travel.getSpeeds();
  el.innerHTML = `
    <div style="font-variant:small-caps;letter-spacing:.18em;color:#c8903a;
                border-bottom:1px solid #3a2e1a;padding-bottom:6px;margin-bottom:8px;">
      Admin Mode
    </div>
    <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;cursor:pointer;">
      <input type="checkbox" data-fly ${Travel.isFlying() ? 'checked' : ''}>
      <span><strong>Fly</strong> — Space up, Ctrl/X down (Shift = fast)</span>
    </label>
    <div style="margin-bottom:10px;">
      <label style="display:flex;justify-content:space-between;">
        <span>Walk</span><span data-v="walk">${fmt(speeds.walk)}</span>
      </label>
      <input type="range" min="0" max="40" step="0.5" value="${speeds.walk}" data-k="walk" style="width:100%">
      <label style="display:flex;justify-content:space-between;">
        <span>Sprint</span><span data-v="sprint">${fmt(speeds.sprint)}</span>
      </label>
      <input type="range" min="0" max="60" step="0.5" value="${speeds.sprint}" data-k="sprint" style="width:100%">
      <label style="display:flex;justify-content:space-between;">
        <span>Cave</span><span data-v="cave">${fmt(speeds.cave)}</span>
      </label>
      <input type="range" min="0" max="20" step="0.25" value="${speeds.cave}" data-k="cave" style="width:100%">
    </div>
    <div style="font-variant:small-caps;letter-spacing:.14em;color:#c8903a;margin-bottom:4px;">
      Teleport
    </div>
    <div data-tp style="display:flex;flex-direction:column;gap:4px;"></div>
    <div style="font-variant:small-caps;letter-spacing:.14em;color:#c8903a;margin:12px 0 4px;">
      Town Scale
    </div>
    <div data-towns style="display:flex;flex-direction:column;gap:6px;"></div>
    <div style="margin-top:10px;font-size:10px;color:#8a7a5a;letter-spacing:.06em;">
      Toggle: \` or F1 — scales persist across reloads
    </div>
  `;

  // Wire fly toggle.
  const flyBox = el.querySelector('[data-fly]');
  flyBox?.addEventListener('change', (e) => {
    Travel.setFlying(e.target.checked);
  });

  // Wire speed sliders.
  el.querySelectorAll('input[data-k]').forEach((input) => {
    input.addEventListener('input', (e) => {
      const k = e.target.dataset.k;
      const v = parseFloat(e.target.value);
      const patch = {};
      patch[k] = v;
      Travel.setSpeeds(patch);
      const lbl = el.querySelector(`[data-v="${k}"]`);
      if (lbl) lbl.textContent = fmt(v);
    });
  });

  // Build town-scale sliders.
  const townHost = el.querySelector('[data-towns]');
  for (const id of TOWN_IDS) {
    const wrap = document.createElement('div');
    const cur = TownShells.getScale(id);
    wrap.innerHTML = `
      <label style="display:flex;justify-content:space-between;font-size:11px;">
        <span>${TOWN_LABELS[id] || id}</span>
        <span data-sv="${id}">${fmt(cur)}×</span>
      </label>
      <input type="range" min="0.25" max="4" step="0.05" value="${cur}" data-town="${id}" style="width:100%">
    `;
    townHost.appendChild(wrap);
  }
  townHost.querySelectorAll('input[data-town]').forEach((input) => {
    input.addEventListener('input', (e) => {
      const id = e.target.dataset.town;
      const v = parseFloat(e.target.value);
      TownShells.setScale(id, v);
      const lbl = el.querySelector(`[data-sv="${id}"]`);
      if (lbl) lbl.textContent = `${fmt(v)}×`;
    });
  });

  // Build teleport buttons.
  const tpHost = el.querySelector('[data-tp]');
  for (const loc of LOCATIONS) {
    const b = document.createElement('button');
    b.textContent = loc.name;
    b.style.cssText = [
      'padding:5px 8px',
      'background:#231a0e',
      'color:#e8dcc8',
      'border:1px solid #4a3a20',
      'border-radius:3px',
      'cursor:pointer',
      'font-family:Georgia,serif',
      'font-size:11px',
      'text-align:left',
    ].join(';');
    b.addEventListener('mouseenter', () => { b.style.background = '#3a2c14'; });
    b.addEventListener('mouseleave', () => { b.style.background = '#231a0e'; });
    b.addEventListener('click', () => {
      Travel.teleport(loc.x, loc.z, { unlockExit: true });
    });
    tpHost.appendChild(b);
  }

  document.body.appendChild(el);
  return el;
}

function toggle() {
  if (!panel) panel = build();
  visible = !visible;
  panel.style.display = visible ? 'block' : 'none';
}

export const AdminMode = {
  init() {
    window.addEventListener('keydown', (e) => {
      if (e.key === '`' || e.key === 'F1') {
        e.preventDefault();
        toggle();
      }
    });
  },
};
