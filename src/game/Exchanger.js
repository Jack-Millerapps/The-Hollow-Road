import * as THREE from 'three';
import { state } from '../state.js';
import { ExchangePanel, applyExchange } from '../ui/ExchangePanel.js';
import { villages } from '../data/villages.js';
// ---------------------------------------------------------------------------
// Currency exchangers — one per destination.
//
// Each exchanger stands near (but distinct from) the main village NPC.
// Interaction: player walks within INTERACT_RADIUS and presses F.
//
// Types:
//   ashwick    — fixed rates
//   stonehush  — negotiating (player can counter twice)
//   deeproot   — specialized (memories <-> years, 4:1)
//   mirrorTown — random mirror rates
// ---------------------------------------------------------------------------

const INTERACT_RADIUS = 6;

const CONFIG = {
  ashwick: {
    kind: 'fixed',
    title: 'The Exchanger of Ashwick',
    body: '"Set rates. Take it or leave it."',
    rates: [
      { give: { gold: 10 }, get: { memories: 1 } },
      { give: { memories: 1 }, get: { gold: 10 } },
      { give: { gold: 8 }, get: { promises: 1 } },
      { give: { promises: 1 }, get: { gold: 8 } },
      { give: { gold: 12 }, get: { secrets: 1 } },
      { give: { secrets: 1 }, get: { gold: 12 } },
    ],
  },
  stonehush: {
    kind: 'negotiate',
    title: 'The Exchanger of Stonehush',
    body: '"Make me an offer. I will counter. Twice, perhaps."',
  },
  deeproot: {
    kind: 'specialized',
    title: 'The Exchanger of Deeproot',
    body: '"Here, only one trade matters. Memories for years, four to one."',
  },
  mirrorTown: {
    kind: 'mirror',
    title: 'The Mirror Exchanger',
    body: '"Offer, and see what comes back. The glass decides."',
  },
};

const TYPES = ['gold', 'memories', 'promises', 'years', 'secrets'];

export const Exchanger = {
  scene: null,
  entries: [], // { config, worldPos, group, villageName }
  prompt: null,
  activeKey: null,
  travelRef: null,
  _bound: false,

  init(scene, opts = {}) {
    this.scene = scene;
    this.travelRef = opts.travel || null;

    for (const v of villages) {
      const cfg = CONFIG[v.name];
      if (!cfg) continue;
      const g = new THREE.Group();
      // Procedural stacked-stone altar.
      const altMat = new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.98, flatShading: true });
      const altBase = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.78, 0.38, 8), altMat);
      altBase.position.y = 0.19;
      g.add(altBase);
      const altMid = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.22, 0.78), altMat);
      altMid.position.y = 0.49;
      g.add(altMid);
      const altTop = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.16, 0.64),
        new THREE.MeshStandardMaterial({ color: 0x4a4540, roughness: 0.95, flatShading: true }));
      altTop.position.y = 0.66;
      g.add(altTop);

      // Glowing sigil hovers above the altar so it remains visible at distance.
      const sigil = new THREE.Mesh(
        new THREE.TorusGeometry(0.32, 0.07, 6, 14),
        new THREE.MeshStandardMaterial({
          color: 0xd8a868,
          emissive: 0xa85a10,
          emissiveIntensity: 0.8,
          roughness: 0.4,
        }),
      );
      sigil.position.y = 2.4;
      g.add(sigil);

      // Exchangers stand offset 8 units east of the main village NPC.
      const x = (v.position?.x ?? 0) + 8;
      const z = (v.position?.z ?? 0) + 4;
      g.position.set(x, 0, z);
      scene.add(g);
      this.entries.push({
        config: cfg,
        worldPos: new THREE.Vector3(x, 0, z),
        group: g,
        villageName: v.name,
      });
    }

    if (!this._bound) {
      window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        if (e.key !== 'f' && e.key !== 'F') return;
        if (!this.activeKey) return;
        if (state.currentScene !== 'world') return;
        const entry = this.entries.find((x) => x.villageName === this.activeKey);
        if (entry) this.open(entry);
      });
      this._bound = true;
    }
  },

  update(playerPos) {
    if (state.currentScene !== 'world') {
      this._setActive(null);
      return;
    }
    // Squared-distance comparison avoids an unnecessary sqrt per entry.
    const limitSq = INTERACT_RADIUS * INTERACT_RADIUS;
    let best = null;
    let bestSq = Infinity;
    for (const e of this.entries) {
      const dx = e.worldPos.x - playerPos.x;
      const dz = e.worldPos.z - playerPos.z;
      const dsq = dx * dx + dz * dz;
      if (dsq < limitSq && dsq < bestSq) {
        bestSq = dsq;
        best = e;
      }
    }
    this._setActive(best ? best.villageName : null);
  },

  _setActive(key) {
    if (key === this.activeKey) return;
    this.activeKey = key;
    if (!this.prompt) {
      const el = document.createElement('div');
      Object.assign(el.style, {
        position: 'fixed',
        bottom: '130px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '6px 14px',
        background: 'rgba(13, 10, 6, 0.88)',
        border: '1px solid #3a2e1a',
        borderRadius: '999px',
        color: '#c8903a',
        font: '12px Georgia, serif',
        fontVariant: 'small-caps',
        letterSpacing: '0.22em',
        opacity: '0',
        transition: 'opacity 0.2s ease',
        zIndex: '25',
        pointerEvents: 'none',
      });
      document.getElementById('ui-root').appendChild(el);
      this.prompt = el;
    }
    if (key) {
      this.prompt.textContent = 'Press F — Exchange';
      this.prompt.style.opacity = '1';
    } else {
      this.prompt.style.opacity = '0';
    }
  },

  open(entry) {
    this.travelRef?.pause?.();
    const close = () => this.travelRef?.resume?.();
    switch (entry.config.kind) {
      case 'fixed':
        openFixed(entry.config, close);
        break;
      case 'negotiate':
        openNegotiate(entry.config, close);
        break;
      case 'specialized':
        openSpecialized(entry.config, close);
        break;
      case 'mirror':
        openMirror(entry.config, close);
        break;
      default:
        close();
    }
  },
};

function firstKey(obj) {
  return Object.keys(obj)[0];
}

function formatAmount(rec) {
  const k = firstKey(rec);
  return `${rec[k]} ${k}`;
}

function openFixed(cfg, onClose) {
  const rows = cfg.rates.map((r) => {
    const giveType = firstKey(r.give);
    const getType = firstKey(r.get);
    const have = state.currencies[giveType] ?? 0;
    return {
      label: `${formatAmount(r.give)} → ${formatAmount(r.get)} (you have ${have})`,
      disabled: have < r.give[giveType],
      onClick: () => {
        applyExchange({
          giveType,
          giveAmount: r.give[giveType],
          getType,
          getAmount: r.get[getType],
        });
        openFixed(cfg, onClose);
      },
    };
  });
  ExchangePanel.open({
    title: cfg.title,
    body: cfg.body,
    rows,
    onClose,
  });
}

function openNegotiate(cfg, onClose) {
  // Player picks a give-type; a fair rate is computed and 10-25% better rate
  // is offered after successful counters. Each counter has a chance to end
  // the trade.
  const tradable = TYPES.filter((t) => t !== 'years');
  const rows = tradable.map((t) => ({
    label: `Offer 1 ${t}...`,
    disabled: (state.currencies[t] ?? 0) < 1,
    onClick: () => startNegotiation(cfg, t, onClose),
  }));
  ExchangePanel.open({
    title: cfg.title,
    body: cfg.body,
    rows,
    onClose,
  });
}

function fairRate(giveType, getType) {
  const worth = { gold: 1, memories: 10, promises: 8, secrets: 12, years: 40 };
  return (worth[giveType] || 1) / (worth[getType] || 1);
}

function startNegotiation(cfg, giveType, onClose) {
  const getType = pickRandom(TYPES.filter((t) => t !== giveType && t !== 'years'));
  const baseRate = fairRate(giveType, getType);
  let offered = Math.max(1, Math.round(baseRate * 0.85)); // starting stingy
  let counters = 2;

  const askAgain = (rejection = false) => {
    ExchangePanel.open({
      title: cfg.title,
      body: rejection
        ? '"Too greedy. I will walk."'
        : `"I give ${offered} ${getType} for your 1 ${giveType}."`,
      rows: [
        {
          label: rejection ? 'Take the best rate offered.' : 'Accept.',
          onClick: () => {
            applyExchange({
              giveType,
              giveAmount: 1,
              getType,
              getAmount: offered,
            });
            openNegotiate(cfg, onClose);
          },
        },
        ...(counters > 0 && !rejection
          ? [
              {
                label: 'Counter — ask for more.',
                onClick: () => {
                  counters--;
                  const bump = 0.1 + Math.random() * 0.15; // 10-25%
                  const walkChance = Math.min(0.6, (offered / baseRate) * 0.25);
                  if (Math.random() < walkChance) {
                    ExchangePanel.close();
                    onClose?.();
                    return;
                  }
                  offered = Math.max(offered + 1, Math.round(offered * (1 + bump)));
                  askAgain(false);
                },
              },
            ]
          : []),
        {
          label: 'Walk away.',
          onClick: () => {
            ExchangePanel.close();
            onClose?.();
          },
        },
      ],
      onClose,
    });
  };
  askAgain(false);
}

function openSpecialized(cfg, onClose) {
  const rows = [
    {
      label: '4 memories → 1 year',
      disabled: (state.currencies.memories ?? 0) < 4,
      onClick: () => {
        applyExchange({ giveType: 'memories', giveAmount: 4, getType: 'years', getAmount: 1 });
        openSpecialized(cfg, onClose);
      },
    },
    {
      label: '1 year → 4 memories',
      disabled: (state.currencies.years ?? 0) < 1,
      onClick: () => {
        applyExchange({ giveType: 'years', giveAmount: 1, getType: 'memories', getAmount: 4 });
        openSpecialized(cfg, onClose);
      },
    },
  ];
  ExchangePanel.open({ title: cfg.title, body: cfg.body, rows, onClose });
}

function openMirror(cfg, onClose) {
  const rows = TYPES.map((t) => ({
    label: `Offer 1 ${t} into the glass`,
    disabled: (state.currencies[t] ?? 0) < 1,
    onClick: () => {
      const others = TYPES.filter((x) => x !== t);
      const getType = pickRandom(others);
      const mult = 0.5 + Math.random() * 1.5; // 0.5x to 2x
      const getAmount = Math.max(1, Math.round(mult));
      applyExchange({ giveType: t, giveAmount: 1, getType, getAmount });
      ExchangePanel.open({
        title: cfg.title,
        body: `The glass returns ${getAmount} ${getType}.`,
        rows: [
          { label: 'Offer again.', onClick: () => openMirror(cfg, onClose) },
          {
            label: 'Walk away.',
            onClick: () => { ExchangePanel.close(); onClose?.(); },
          },
        ],
        onClose,
      });
    },
  }));
  ExchangePanel.open({ title: cfg.title, body: cfg.body, rows, onClose });
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
