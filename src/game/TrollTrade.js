import { state, notify } from '../state.js';
import { CaveInterior } from '../scene/CaveInterior.js';
import { Save } from './Save.js';

// ---------------------------------------------------------------------------
// Phase 3 — Troll trading.
//
// Each cave's deepest chamber holds a unique troll. Trolls only accept the
// cave's signature currency (endCave trolls take any). A successful trade
// adds the cave's mapReward to state.mapPieces.
// ---------------------------------------------------------------------------

const TROLL_RADIUS = 3.0;
const ALL_CURRENCIES = ['gold', 'memories', 'promises', 'years', 'secrets'];
// End-cave premium prices per currency.
const END_CAVE_COSTS = {
  gold: 40,
  memories: 3,
  promises: 3,
  years: 2,
  secrets: 3,
};

function ensureStyle() {
  if (document.getElementById('troll-panel-style')) return;
  const s = document.createElement('style');
  s.id = 'troll-panel-style';
  s.textContent = `
.troll-backdrop {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.78);
  display: flex; align-items: center; justify-content: center;
  z-index: 38;
  animation: troll-fade-in 0.4s ease;
}
@keyframes troll-fade-in {
  from { opacity: 0; } to { opacity: 1; }
}
.troll-panel {
  background: linear-gradient(180deg, rgba(22, 14, 10, 0.96), rgba(12, 8, 4, 0.96));
  border: 1px solid #5a3420;
  border-radius: 10px;
  padding: 26px 32px;
  width: min(560px, calc(100% - 40px));
  color: #e8dcc8;
  font-family: Georgia, 'Times New Roman', serif;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.7), 0 0 24px rgba(160, 80, 20, 0.18);
}
.troll-panel h2 {
  margin: 0 0 4px;
  font-weight: normal;
  font-variant: small-caps;
  letter-spacing: 0.22em;
  color: #ffab55;
  font-size: 20px;
  text-align: center;
}
.troll-panel .subtitle {
  text-align: center;
  font-style: italic;
  color: #9a7a5a;
  margin: 0 0 20px;
  font-size: 13px;
}
.troll-panel .flavor {
  font-style: italic;
  color: #d8c2a4;
  line-height: 1.55;
  margin: 0 0 18px;
  padding: 14px 18px;
  background: rgba(30, 18, 10, 0.6);
  border-left: 2px solid #8a5828;
  border-radius: 4px;
}
.troll-panel .reward {
  text-align: center;
  margin: 0 0 18px;
  font-variant: small-caps;
  letter-spacing: 0.18em;
  color: #e9c894;
  font-size: 14px;
}
.troll-panel .options {
  display: flex; flex-direction: column; gap: 10px;
}
.troll-panel button {
  background: rgba(40, 24, 14, 0.85);
  border: 1px solid #5a3a20;
  border-radius: 6px;
  color: #e8dcc8;
  font-family: Georgia, serif;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
  text-align: left;
  display: flex; justify-content: space-between; align-items: center;
}
.troll-panel button:hover:not(:disabled) {
  background: rgba(60, 36, 20, 0.9);
  border-color: #a26830;
}
.troll-panel button:disabled {
  opacity: 0.42; cursor: not-allowed;
}
.troll-panel .cost-tag {
  font-variant: small-caps;
  letter-spacing: 0.18em;
  font-size: 12px;
  color: #c8903a;
}
.troll-panel .close-hint {
  text-align: center;
  margin-top: 18px;
  font-size: 11px;
  font-variant: small-caps;
  letter-spacing: 0.22em;
  color: #8a7554;
}
.troll-panel .already {
  text-align: center;
  font-style: italic;
  color: #9a8464;
  padding: 10px 0;
}
  `;
  document.head.appendChild(s);
}

// ---------------------------------------------------------------------------
// Panel lifecycle — small local module so open/close symmetry is obvious.
// ---------------------------------------------------------------------------

const TrollPanel = {
  root: null,
  onClose: null,

  open(cave, opts) {
    this.close();
    ensureStyle();
    const backdrop = document.createElement('div');
    backdrop.className = 'troll-backdrop';
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.close();
    });

    const panel = document.createElement('div');
    panel.className = 'troll-panel';
    backdrop.appendChild(panel);

    const title = document.createElement('h2');
    title.textContent = cave.troll;
    panel.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'subtitle';
    subtitle.textContent = cave.name;
    panel.appendChild(subtitle);

    const flavor = document.createElement('p');
    flavor.className = 'flavor';
    flavor.textContent = `“${cave.flavor}”`;
    panel.appendChild(flavor);

    const alreadyTraded = (state.trollsTraded || []).includes(cave.id);

    if (alreadyTraded) {
      const already = document.createElement('p');
      already.className = 'already';
      already.textContent =
        cave.id === 'endCave'
          ? 'The Old One nods once. The Road is already yours to see.'
          : `${cave.troll} has nothing more to give.`;
      panel.appendChild(already);
    } else {
      const reward = document.createElement('p');
      reward.className = 'reward';
      reward.textContent =
        cave.id === 'endCave'
          ? 'The Road\'s True Shape'
          : `A piece of the map — ${cave.name} to ${nextMapName(cave.id)}`;
      panel.appendChild(reward);

      const options = document.createElement('div');
      options.className = 'options';

      const rows = buildOptions(cave);
      for (const opt of rows) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const label = document.createElement('span');
        label.textContent = opt.label;
        const cost = document.createElement('span');
        cost.className = 'cost-tag';
        cost.textContent = `${opt.cost.amount} ${opt.cost.type}`;
        btn.appendChild(label);
        btn.appendChild(cost);
        const canAfford = (state.currencies[opt.cost.type] || 0) >= opt.cost.amount;
        btn.disabled = !canAfford;
        btn.addEventListener('click', () => {
          if (!canAfford) return;
          opts.onTrade(cave, opt);
        });
        options.appendChild(btn);
      }
      panel.appendChild(options);
    }

    const hint = document.createElement('p');
    hint.className = 'close-hint';
    hint.textContent = 'Esc — step back';
    panel.appendChild(hint);

    const root = document.getElementById('ui-root') || document.body;
    root.appendChild(backdrop);
    this.root = backdrop;
    this.onClose = opts.onClose;

    this._keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  },

  close() {
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    this.root = null;
    if (typeof this.onClose === 'function') {
      const fn = this.onClose;
      this.onClose = null;
      fn();
    }
  },
};

function nextMapName(caveId) {
  switch (caveId) {
    case 'ashCave': return 'Veil Market';
    case 'veilCave': return 'Stonehush';
    case 'stoneCave': return 'Deeproot';
    case 'deepCave': return 'Mirror Town';
    case 'mirrorCave': return 'The Unnamed Village';
    default: return 'beyond';
  }
}

function buildOptions(cave) {
  if (cave.id !== 'endCave') {
    const [type, amount] = Object.entries(cave.cost)[0];
    return [
      {
        label: `Pay ${amount} ${type}`,
        cost: { type, amount },
      },
    ];
  }
  // End cave: player's choice of any currency.
  const options = [];
  for (const type of ALL_CURRENCIES) {
    const amount = END_CAVE_COSTS[type];
    options.push({
      label: `Offer ${type}`,
      cost: { type, amount },
    });
  }
  return options;
}

// ---------------------------------------------------------------------------
// Public module
// ---------------------------------------------------------------------------

export const TrollTrade = {
  _playerPos: null,
  _prompt: null,
  _panelOpen: false,

  init() {
    this._prompt = buildPrompt();
    window.addEventListener('keydown', (e) => {
      if (state.currentScene !== 'cave') return;
      if (this._panelOpen) return;
      if (e.key === 'e' || e.key === 'E') {
        if (this._atTroll()) this._openPanel();
      }
    });
  },

  _atTroll() {
    if (!this._playerPos) return false;
    const pos = CaveInterior.getTrollWorldPos();
    if (!pos) return false;
    return (
      Math.hypot(pos.x - this._playerPos.x, pos.z - this._playerPos.z) <
      TROLL_RADIUS
    );
  },

  _openPanel() {
    const active = CaveInterior.getActive();
    if (!active) return;
    const cave = active.cave;
    if (!cave) return;
    this._panelOpen = true;
    this._setPrompt('');
    TrollPanel.open(cave, {
      onTrade: (cave, opt) => this._completeTrade(cave, opt),
      onClose: () => {
        this._panelOpen = false;
      },
    });
  },

  _completeTrade(cave, opt) {
    // Deduct cost.
    state.currencies[opt.cost.type] = Math.max(
      0,
      (state.currencies[opt.cost.type] || 0) - opt.cost.amount,
    );
    state.spent[opt.cost.type] =
      (state.spent[opt.cost.type] || 0) + opt.cost.amount;

    // Grant reward.
    if (!state.mapPieces || !(state.mapPieces instanceof Set)) {
      state.mapPieces = new Set(state.mapPieces || []);
    }
    if (cave.mapReward) {
      state.mapPieces.add(cave.mapReward);
    } else if (cave.id === 'endCave') {
      // Final reveal key.
      state.mapPieces.add('endPiece');
    }
    if (!state.trollsTraded) state.trollsTraded = [];
    if (!state.trollsTraded.includes(cave.id)) state.trollsTraded.push(cave.id);

    notify();
    Save.write(state);
    TrollPanel.close();
  },

  _setPrompt(text) {
    if (!this._prompt) return;
    if (text) {
      this._prompt.textContent = text;
      this._prompt.style.opacity = '1';
    } else {
      this._prompt.style.opacity = '0';
    }
  },

  update(delta, playerPos) {
    this._playerPos = playerPos;
    if (state.currentScene !== 'cave' || this._panelOpen) {
      this._setPrompt('');
      return;
    }
    if (this._atTroll()) {
      const active = CaveInterior.getActive();
      const cave = active?.cave;
      const alreadyTraded = cave && (state.trollsTraded || []).includes(cave.id);
      this._setPrompt(
        alreadyTraded
          ? `Press E — speak with ${cave.troll}`
          : `Press E — trade with ${cave ? cave.troll : 'the troll'}`,
      );
    } else {
      this._setPrompt('');
    }
  },
};

function buildPrompt() {
  const el = document.createElement('div');
  el.className = 'troll-prompt';
  el.style.cssText = [
    'position: fixed',
    'bottom: 150px',
    'left: 50%',
    'transform: translateX(-50%)',
    'padding: 8px 18px',
    'background: rgba(13, 10, 6, 0.88)',
    'border: 1px solid #5a3820',
    'border-radius: 999px',
    'color: #ffab55',
    'font-family: Georgia, serif',
    'font-size: 13px',
    'font-variant: small-caps',
    'letter-spacing: 0.22em',
    'z-index: 25',
    'opacity: 0',
    'transition: opacity 0.25s ease',
    'pointer-events: none',
  ].join(';');
  const root = document.getElementById('ui-root') || document.body;
  root.appendChild(el);
  return el;
}
