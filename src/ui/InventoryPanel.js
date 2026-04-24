import { state, subscribe } from '../state.js';

// Togglable inventory UI. Opens/closes on the `I` key.

const ITEM_DEFS = [
  {
    key: 'backpack',
    name: 'Backpack',
    flavor: "Carries what you'll need. And what you'll wish you hadn't brought.",
  },
  {
    key: 'shovel',
    name: 'Shovel',
    flavor: 'For things that need burying. Or unburying.',
  },
  {
    key: 'pickaxe',
    name: 'Pickaxe',
    flavor: "Stone yields, if you're patient enough.",
  },
  {
    key: 'watch',
    name: 'Watch',
    flavor: 'The only honest thing you own.',
  },
  {
    key: 'sleepingBag',
    name: 'Sleeping Bag',
    flavor: 'Warmth has a weight.',
  },
  {
    key: 'ripMap',
    name: 'Ripped Map',
    flavor: 'Half-complete. The rest will come.',
    hiddenWhenAbsent: true,
  },
];

function ensureStyle() {
  if (document.getElementById('inventory-panel-style')) return;
  const style = document.createElement('style');
  style.id = 'inventory-panel-style';
  style.textContent = `
.inv-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 35;
  animation: inv-fade-in 0.35s ease;
}
@keyframes inv-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.inv-panel {
  background: rgba(13, 10, 6, 0.95);
  border: 1px solid #3a2e1a;
  border-radius: 10px;
  padding: 28px 32px;
  width: min(720px, calc(100% - 40px));
  max-height: 82vh;
  overflow: auto;
  color: #e8dcc8;
  font-family: Georgia, 'Times New Roman', serif;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
}
.inv-panel h2 {
  margin: 0 0 4px;
  font-weight: normal;
  font-variant: small-caps;
  letter-spacing: 0.2em;
  color: #c8903a;
  font-size: 20px;
  text-align: center;
}
.inv-panel .sub {
  text-align: center;
  font-style: italic;
  color: #8a7554;
  margin: 0 0 22px;
  font-size: 13px;
}
.inv-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}
.inv-card {
  background: rgba(30, 22, 13, 0.7);
  border: 1px solid #3a2e1a;
  border-radius: 8px;
  padding: 16px 18px;
  transition: border-color 0.2s ease, background 0.2s ease;
}
.inv-card:hover {
  border-color: #8a6330;
  background: rgba(40, 30, 17, 0.8);
}
.inv-card .name {
  font-variant: small-caps;
  letter-spacing: 0.14em;
  color: #c8903a;
  font-size: 15px;
  margin: 0 0 6px;
}
.inv-card .flavor {
  font-style: italic;
  color: #c8b89c;
  font-size: 13px;
  line-height: 1.55;
  margin: 0;
}
.inv-empty {
  text-align: center;
  font-style: italic;
  color: #8a7554;
  padding: 40px 0;
}
.inv-close-hint {
  text-align: center;
  margin-top: 22px;
  font-size: 11px;
  font-variant: small-caps;
  letter-spacing: 0.2em;
  color: #8a7554;
}
  `;
  document.head.appendChild(style);
}

export const InventoryPanel = {
  root: null,
  open: false,
  enabled: false,

  mount() {
    ensureStyle();
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        this.toggle();
      } else if (e.key === 'Escape' && this.open) {
        e.preventDefault();
        this.close();
      }
    });
    subscribe(() => {
      if (this.open) this.render();
    });
  },

  setEnabled(v) {
    this.enabled = !!v;
  },

  toggle() {
    if (this.open) this.close();
    else this.openPanel();
  },

  openPanel() {
    if (this.open) return;
    this.open = true;

    const backdrop = document.createElement('div');
    backdrop.className = 'inv-backdrop';
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.close();
    });

    const panel = document.createElement('div');
    panel.className = 'inv-panel';
    backdrop.appendChild(panel);

    document.getElementById('ui-root').appendChild(backdrop);
    this.root = backdrop;
    this.render();
  },

  close() {
    if (!this.open) return;
    this.open = false;
    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    this.root = null;
  },

  render() {
    if (!this.root) return;
    const panel = this.root.querySelector('.inv-panel');
    if (!panel) return;
    panel.innerHTML = '';

    const title = document.createElement('h2');
    title.textContent = 'What You Carry';
    panel.appendChild(title);

    const sub = document.createElement('p');
    sub.className = 'sub';
    sub.textContent = state.playerName
      ? `${state.playerName}'s pack`
      : 'Your pack';
    panel.appendChild(sub);

    const items = ITEM_DEFS.filter((def) => {
      const owned = !!state.items[def.key];
      if (!owned && def.hiddenWhenAbsent) return false;
      return true;
    });

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'inv-empty';
      empty.textContent = 'Nothing yet.';
      panel.appendChild(empty);
    } else {
      const grid = document.createElement('div');
      grid.className = 'inv-grid';
      for (const def of items) {
        const owned = !!state.items[def.key];
        const card = document.createElement('div');
        card.className = 'inv-card';
        if (!owned) card.style.opacity = '0.45';
        const name = document.createElement('p');
        name.className = 'name';
        name.textContent = def.name;
        card.appendChild(name);
        const flavor = document.createElement('p');
        flavor.className = 'flavor';
        flavor.textContent = def.flavor;
        card.appendChild(flavor);
        grid.appendChild(card);
      }
      panel.appendChild(grid);
    }

    const hint = document.createElement('div');
    hint.className = 'inv-close-hint';
    hint.textContent = 'I / Esc — close';
    panel.appendChild(hint);
  },
};
