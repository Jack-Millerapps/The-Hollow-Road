// Phase 3 — six caves carved into the world between the main destinations.
// Each cave has a single, stubborn troll who only accepts the cave's
// signature currency. The `mapReward` string becomes an entry in
// state.mapPieces after a successful trade.

export const caves = [
  {
    id: 'ashCave',
    name: 'The Ash Hollow',
    position: { x: -18, z: 85 },
    currency: 'gold',
    troll: 'Ogrim',
    mapReward: 'ashwickPiece',
    flavor: 'Gold is honest. It does not lie about what it is.',
    cost: { gold: 15 },
  },
  {
    id: 'veilCave',
    name: 'The Velvet Deep',
    position: { x: 15, z: 55 },
    currency: 'secrets',
    troll: 'Shen',
    mapReward: 'veilPiece',
    flavor: 'Tell me something no one else has heard. I collect.',
    cost: { secrets: 2 },
  },
  {
    id: 'stoneCave',
    name: 'The Stone Throat',
    position: { x: -35, z: 10 },
    currency: 'promises',
    troll: 'Kalla',
    mapReward: 'stonePiece',
    flavor: "Swear it. I'll hold you to it, even if the world forgets.",
    cost: { promises: 2 },
  },
  {
    id: 'deepCave',
    name: 'The Rootway',
    position: { x: 35, z: -50 },
    currency: 'memories',
    troll: 'Bram',
    mapReward: 'deepPiece',
    flavor: "Give me a moment you'd rather not lose. I'll keep it safe.",
    cost: { memories: 2 },
  },
  {
    id: 'mirrorCave',
    name: 'The Still Pool',
    position: { x: 45, z: -95 },
    currency: 'years',
    troll: 'Nera',
    mapReward: 'mirrorPiece',
    flavor: 'Time. The only thing I never have enough of.',
    cost: { years: 1 },
  },
  {
    id: 'endCave',
    name: 'The Last Hollow',
    position: { x: -15, z: -140 },
    currency: 'any',
    troll: 'Old One',
    mapReward: null, // final cave reveals the true path — handled in UI
    flavor: 'You have come far. Give what you can most afford to give.',
    // End-cave cost is picked by the player at trade time. See TrollTrade.
    cost: null,
  },
];

export const CAVE_TRIGGER_RADIUS = 4;

export function getCaveById(id) {
  return caves.find((c) => c.id === id) || null;
}

// Ore node currency colors used for both the mining mesh emissive tint and
// the ore name shown in tooltips. endCave rolls a random currency at mine
// time so its color here is a neutral "any" silver.
export const CURRENCY_COLORS = {
  gold: 0xffcc55,
  secrets: 0x7a4aff,
  promises: 0xd8b892,
  memories: 0x55c8ff,
  years: 0xff88bb,
  any: 0xcfd2d8,
};
