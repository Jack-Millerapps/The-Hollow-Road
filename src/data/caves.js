// Consolidation patch — cave placements rescaled to the 16.5k-unit route.
// Each cave sits off the road on a specific leg.
//
// Leg mapping (positions chosen mid-leg, ~20 units off-road):
//   Westwind (0, 500) → Ashwick (0, -500)         ashCave   @ (25, 0)
//   Ancient Ashwick quest cave (shrine + bed, no troll) @ (200, -500) east of town.
//   Ashwick  (0, -500) → Veil (0, -2500)          veilCave  @ (-25, -1500)
//   Veil     (0, -2500) → Stonehush (-800, -5000) stoneCave @ (-400, -3700)  *the worst time
//   Stonehush (-800, -5000) → Deeproot (600, -6000) deepCave @ (-100, -5500)
//   Deeproot (600, -6000) → Mirror (200, -7800)   mirrorCave @ (430, -6750)
//   Mirror   (200, -7800) → Unnamed (0, -14500)   endCave   @ (60, -11300)  *deep into the pilgrimage

export const caves = [
  {
    id: 'ashCave',
    name: 'The Ash Hollow',
    position: { x: 25, z: 0 },
    currency: 'gold',
    troll: 'Ogrim',
    mapReward: 'ashwickPiece',
    flavor: 'Gold is honest. It does not lie about what it is.',
    cost: { gold: 15 },
  },
  {
    id: 'veilCave',
    name: 'The Velvet Deep',
    position: { x: -25, z: -1500 },
    currency: 'secrets',
    troll: 'Shen',
    mapReward: 'veilPiece',
    flavor: 'Tell me something no one else has heard. I collect.',
    cost: { secrets: 2 },
  },
  {
    id: 'stoneCave',
    name: 'The Stone Throat',
    position: { x: -400, z: -3700 },
    currency: 'promises',
    troll: 'Kalla',
    mapReward: 'stonePiece',
    flavor: "Swear it. I'll hold you to it, even if the world forgets.",
    cost: { promises: 2 },
  },
  {
    id: 'deepCave',
    name: 'The Rootway',
    position: { x: -100, z: -5500 },
    currency: 'memories',
    troll: 'Bram',
    mapReward: 'deepPiece',
    flavor: "Give me a moment you'd rather not lose. I'll keep it safe.",
    cost: { memories: 2 },
  },
  {
    id: 'mirrorCave',
    name: 'The Still Pool',
    position: { x: 430, z: -6750 },
    currency: 'years',
    troll: 'Nera',
    mapReward: 'mirrorPiece',
    flavor: 'Time. The only thing I never have enough of.',
    cost: { years: 1 },
  },
  {
    id: 'endCave',
    name: 'The Last Hollow',
    position: { x: 60, z: -11300 },
    currency: 'any',
    troll: 'Old One',
    mapReward: null,
    flavor: 'You have come far. Give what you can most afford to give.',
    cost: null,
  },
  // Story-only: Ashwick miller quest (shrine + rest bed). No troll / no ore / no map trade.
  {
    id: 'ancientAshwickCave',
    name: 'Ancient Ashwick Cave',
    position: { x: 200, z: -500 },
    entranceRotationY: Math.PI,
    triggerRadius: 11,
  },
];

export const CAVE_TRIGGER_RADIUS = 8;

export function getCaveById(id) {
  return caves.find((c) => c.id === id) || null;
}

export const CURRENCY_COLORS = {
  gold: 0xffcc55,
  secrets: 0x7a4aff,
  promises: 0xd8b892,
  memories: 0x55c8ff,
  years: 0xff88bb,
  any: 0xcfd2d8,
};
