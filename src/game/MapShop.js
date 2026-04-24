// Phase 4 — destination map shops.
//
// Every primary destination (Ashwick, Stonehush, Deeproot, Mirror Town) gets
// a second NPC: an old cartographer sitting at a wooden table covered in
// rolled scrolls. Approach the table and press E to open a short trade
// dialog offering a single map piece for gold or a rare currency.
//
// One purchase per shop for the whole game. After purchase the shop NPC
// says a short atmospheric line and the stall stays visible but inert.

import * as THREE from 'three';
import { state, canAfford, spend, notify } from '../state.js';
import { DialoguePanel } from '../ui/DialoguePanel.js';
import { villages } from '../data/villages.js';

const SHOPS = [
  {
    id: 'ashwickShop',
    village: 'ashwick',
    displayName: 'Ashwick Cartographer',
    offset: { x: 5, z: 0 },
    requires: 'ashwick', // village name that must have tradeComplete set
    piece: 'veilPiece',
    costs: [{ gold: 15 }, { memories: 1 }],
    flavor: 'A weathered woman behind a table of rolled maps. She looks tired.',
    offer:
      'The Veil Market is far from still on any of my drawings. I sold one piece — I can sell you the next.',
    line:
      "The road forks at the Veil. I've only drawn what I've walked. The rest is yours to discover.",
  },
  {
    id: 'stonehushShop',
    village: 'stonehush',
    displayName: 'Stonehush Cartographer',
    offset: { x: 5, z: 0 },
    requires: 'stonehush',
    piece: 'stonePiece',
    costs: [{ gold: 15 }, { promises: 1 }],
    flavor: 'An old man in gray wool, his fingers stained with ink.',
    offer:
      'The Stone Throat is a cave I have not entered. The piece I hold was taken from one who did.',
    line:
      'The stones remember their own paths. This piece was taken from one who stopped remembering.',
  },
  {
    id: 'deeprootShop',
    village: 'deeproot',
    displayName: 'Deeproot Cartographer',
    offset: { x: 5, z: 0 },
    requires: 'deeproot',
    piece: 'deepPiece',
    costs: [{ gold: 15 }, { years: 1 }],
    flavor: 'A half-blind map-drawer working by lantern light.',
    offer:
      'From here the road bends into root and mirror country. Not every piece is made to be kept.',
    line:
      'Every map here costs something the map-taker can no longer afford.',
  },
  {
    id: 'mirrorTownShop',
    village: 'mirrorTown',
    displayName: 'Mirror Town Cartographer',
    offset: { x: 5, z: 0 },
    requires: 'mirrorTown',
    piece: 'mirrorPiece',
    costs: [{ gold: 20 }, { secrets: 1 }],
    flavor: 'A woman whose handwriting is visible in half the town.',
    offer:
      'This piece leads you to the Last Hollow. After that, the road makes its own shape.',
    line:
      'The last piece. Beyond this, no one has drawn a map that matched what they found.',
  },
];

const INTERACT_RADIUS = 3;

function stdMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.9,
    metalness: opts.metalness ?? 0,
    flatShading: opts.flatShading ?? true,
    ...opts,
  });
}

function buildShopStall() {
  const group = new THREE.Group();

  const tableMat = stdMat(0x4a2d16);
  const legMat = stdMat(0x1a0f06);
  const cloth = stdMat(0x5a2e14, { roughness: 1 });

  // Table top.
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 1.2), tableMat);
  top.position.y = 1.0;
  group.add(top);

  // Cloth runner.
  const runner = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 0.5), cloth);
  runner.position.set(0, 1.06, 0);
  group.add(runner);

  // Legs.
  for (const [x, z] of [
    [-1.05, -0.5],
    [1.05, -0.5],
    [-1.05, 0.5],
    [1.05, 0.5],
  ]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), legMat);
    leg.position.set(x, 0.5, z);
    group.add(leg);
  }

  // Scrolls — three rolled cylinders lying on the table.
  const paperMat = stdMat(0xbfa982);
  for (let i = 0; i < 3; i++) {
    const scroll = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.55, 10),
      paperMat,
    );
    scroll.rotation.z = Math.PI / 2;
    scroll.position.set(-0.6 + i * 0.6, 1.11, -0.2);
    group.add(scroll);
  }

  // Upright scroll in a cup.
  const scrollUp = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8),
    paperMat,
  );
  scrollUp.position.set(0.8, 1.3, 0.2);
  group.add(scrollUp);

  // Lantern on the corner.
  const lantern = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.22, 0.18),
    stdMat(0x1a1208, { metalness: 0.5, roughness: 0.5 }),
  );
  lantern.position.set(-0.95, 1.22, 0.3);
  group.add(lantern);
  const lanternCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 6, 6),
    new THREE.MeshStandardMaterial({
      color: 0xffd48a,
      emissive: 0xff9a36,
      emissiveIntensity: 3.0,
      roughness: 0.3,
    }),
  );
  lanternCore.position.set(-0.95, 1.22, 0.3);
  group.add(lanternCore);
  const lanternLight = new THREE.PointLight(0xffac5a, 0.8, 6, 1.6);
  lanternLight.position.set(-0.95, 1.3, 0.3);
  group.add(lanternLight);

  // Cartographer figure — a simple seated silhouette so the shop is legible
  // from the road. Detailed enough to read as a person.
  const figure = new THREE.Group();
  const robeMat = stdMat(0x2c2016);
  const skinMat = stdMat(0xbf9a76);

  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.4, 10), robeMat);
  robe.position.y = 0.7;
  figure.add(robe);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skinMat);
  head.position.y = 1.45;
  figure.add(head);

  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.3, 10), robeMat);
  hood.position.y = 1.6;
  figure.add(hood);

  figure.position.set(0, 0, 0.75);
  figure.rotation.y = Math.PI; // face the player approaching from +z
  group.add(figure);

  return group;
}

function buildPrompt(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = 'rgba(10, 6, 2, 0.8)';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = 'rgba(200, 170, 120, 0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, 512, 128);
  ctx.fillStyle = '#e5d9b6';
  ctx.font = '32px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4, 1, 1);
  return sprite;
}

export const MapShop = {
  _scene: null,
  _shops: [],
  _pause: null,
  _resume: null,

  init(scene, { onPause, onResume } = {}) {
    this._scene = scene;
    this._pause = onPause || (() => {});
    this._resume = onResume || (() => {});

    for (const def of SHOPS) {
      const group = buildShopStall();
      const villageData = findVillageInList(def.village);
      const vx = villageData?.position?.x ?? 0;
      const vz = villageData?.position?.z ?? 0;
      group.position.set(vx + def.offset.x, 0, vz + def.offset.z);
      group.visible = false;
      scene.add(group);

      const prompt = buildPrompt('Press E — Cartographer');
      prompt.position.set(0, 2.5, 0);
      prompt.visible = false;
      group.add(prompt);

      this._shops.push({
        def,
        group,
        prompt,
        origin: { x: vx + def.offset.x, z: vz + def.offset.z },
        _interacting: false,
      });
    }

    const onKey = (e) => {
      if (e.key === 'e' || e.key === 'E') this._tryInteract();
    };
    window.addEventListener('keydown', onKey);
  },

  update(playerPos) {
    if (state.currentScene !== 'world') {
      for (const s of this._shops) {
        s.group.visible = false;
        s.prompt.visible = false;
      }
      return;
    }
    for (const s of this._shops) {
      const available = this._isAvailable(s.def);
      s.group.visible = available;
      if (!available) {
        s.prompt.visible = false;
        continue;
      }
      const dx = playerPos.x - s.origin.x;
      const dz = playerPos.z - s.origin.z;
      const near = Math.hypot(dx, dz) < INTERACT_RADIUS;
      s.prompt.visible = near && !this._isUsed(s.def);
    }
  },

  _isAvailable(def) {
    // Shops appear once the village's main trade has been completed. For
    // Deeproot / Mirror Town (Phase 4 destinations) the trade must happen
    // first; the villages.js definitions now include NPC trade data for
    // those, so tradeComplete flips as normal.
    if (!state.tradeComplete[def.requires]) return false;
    return true;
  },

  _isUsed(def) {
    return (state.mapShopsUsed || []).includes(def.id);
  },

  _tryInteract() {
    const playerPos = state.playerPos || { x: 0, z: 0 };
    for (const s of this._shops) {
      if (!this._isAvailable(s.def)) continue;
      if (this._isUsed(s.def)) continue;
      const dx = playerPos.x - s.origin.x;
      const dz = playerPos.z - s.origin.z;
      if (Math.hypot(dx, dz) < INTERACT_RADIUS) {
        this._openShop(s);
        return;
      }
    }
  },

  _openShop(s) {
    if (s._interacting) return;
    s._interacting = true;
    this._pause();

    const { def } = s;
    const alreadyOwned =
      state.mapPieces instanceof Set && state.mapPieces.has(def.piece);

    const buttons = [];
    if (alreadyOwned) {
      buttons.push({
        label: 'I already have that piece',
        onClick: () => this._close(s, 'You already hold it. She nods and lets you go.'),
      });
    } else {
      for (const cost of def.costs) {
        const [type, amount] = Object.entries(cost)[0];
        const label = formatCost(type, amount);
        buttons.push({
          label,
          disabled: !canAfford(cost),
          onClick: () => this._buy(s, cost),
        });
      }
    }
    buttons.push({
      label: 'Walk away',
      onClick: () => this._close(s),
    });

    DialoguePanel.open({
      title: def.displayName,
      body: `${def.flavor}\n\n${def.offer}\n\nThe piece offered is a fragment leading toward the next hollow.`,
      buttons,
    });
  },

  _buy(s, cost) {
    const { def } = s;
    if (!canAfford(cost)) return;
    const [type, amount] = Object.entries(cost)[0];
    spend(type, amount);

    if (!(state.mapPieces instanceof Set)) state.mapPieces = new Set();
    state.mapPieces.add(def.piece);
    if (!Array.isArray(state.mapShopsUsed)) state.mapShopsUsed = [];
    if (!state.mapShopsUsed.includes(def.id)) state.mapShopsUsed.push(def.id);
    notify();

    DialoguePanel.close();
    DialoguePanel.open({
      title: def.displayName,
      body: `${def.line}\n\nYou now hold another piece of the road.`,
      buttons: [
        {
          label: 'Walk on',
          onClick: () => this._close(s),
        },
      ],
    });
  },

  _close(s, extraLine) {
    DialoguePanel.close();
    if (extraLine) {
      DialoguePanel.open({
        title: s.def.displayName,
        body: extraLine,
        buttons: [
          {
            label: 'Walk on',
            onClick: () => {
              DialoguePanel.close();
              s._interacting = false;
              this._resume();
            },
          },
        ],
      });
      return;
    }
    s._interacting = false;
    this._resume();
  },
};

function findVillageInList(name) {
  return villages.find((v) => v.name === name) || null;
}

function formatCost(type, amount) {
  const singular = {
    gold: 'Gold',
    memories: amount === 1 ? 'Memory' : 'Memories',
    promises: amount === 1 ? 'Promise' : 'Promises',
    years: amount === 1 ? 'Year' : 'Years',
    secrets: amount === 1 ? 'Secret' : 'Secrets',
  };
  const label = singular[type] || type;
  return `${amount} ${label}`;
}
