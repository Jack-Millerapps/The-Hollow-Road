// Phase 2 rescale — the full route Westwind (0, 120) → Unnamed Village
// (0, -170) is roughly 300m total. Existing villages keep their NPC data
// untouched; new phase-3 placeholders are marked `placeholder: true` so
// Travel.js skips their trigger until later phases fill in the content.
//
// Phase 4 additions:
//   • veilMarket.options now includes a "Whisper of the Road" repeatable
//     purchase (costs 3 secrets, grants a single random unowned map piece).
//     It is marked repeatable so the trade flow does not set
//     state.tradeComplete.veilMarket on its own — VeilWander drives that.
//   • veilMarket.wandering: true is a flag used by Travel.js to delegate
//     trigger handling to VeilWander.js rather than the standard village
//     loop.

export const villages = [
  {
    name: 'ashwick',
    position: { x: 0, z: 70 },
    radius: 6,
    displayName: 'Ashwick',
    flavor: "The wheel hasn't stopped in eleven years. Neither has he.",
    npc: 'The Miller',
    sells: { name: 'Rations', effect: 'extraDialogue' },
    options: [
      {
        label: 'Pay 10 Gold',
        cost: { gold: 10 },
        isTrue: false,
        outcome: 'He pockets it without looking up. The wheel keeps turning.',
      },
      {
        label: 'Offer a Memory',
        cost: { memories: 1 },
        isTrue: true,
        outcome:
          'He takes it carefully, like something fragile. The wheel slows — just for a moment.',
      },
      {
        label: 'Make a Promise',
        cost: { promises: 1 },
        isTrue: false,
        outcome: "He nods, but his eyes say he's heard promises before.",
      },
    ],
  },
  {
    name: 'veilMarket',
    position: { x: 0, z: 40 },
    radius: 6,
    displayName: 'The Veil Market',
    flavor: "Everything here was someone else's. Including the silence.",
    npc: 'The Auctioneer',
    sells: { name: 'Rare Map', effect: 'revealTrueWant' },
    wandering: true,
    options: [
      {
        label: 'Share a Secret',
        cost: { secrets: 1 },
        isTrue: false,
        outcome:
          "It vanishes into their coat. You wonder what they'll do with it.",
      },
      {
        label: 'Make a Promise',
        cost: { promises: 1 },
        isTrue: true,
        outcome:
          'The mask tilts. Something behind it softens. You have the map.',
      },
      {
        label: 'Pay 20 Gold',
        cost: { gold: 20 },
        isTrue: false,
        outcome:
          'They take the gold and say nothing. A transaction, nothing more.',
      },
      {
        // Phase 4 — a single random unowned map piece.
        label: 'Whisper of the Road (3 Secrets)',
        cost: { secrets: 3 },
        isTrue: false,
        specialEffect: 'whisperOfRoad',
        outcome:
          'They lean close. A sound so quiet you feel it before you hear it. A piece of the road is yours.',
      },
    ],
  },
  {
    name: 'stonehush',
    position: { x: -25, z: -20 },
    radius: 6,
    displayName: 'Stonehush',
    flavor: 'She places a finger to her lips. Then points at your hands.',
    npc: 'The Weaver',
    sells: { name: 'Whisper-cloth', effect: 'skipEncounter' },
    options: [
      {
        label: 'Give a Year',
        cost: { years: 1 },
        isTrue: true,
        outcome:
          'She presses the cloth into your hands and looks at you a long time.',
      },
      {
        label: 'Make a Promise',
        cost: { promises: 1 },
        isTrue: false,
        outcome:
          'She nods slowly. The cloth is yours. But her hands are shaking.',
      },
      {
        label: 'Offer a Memory',
        cost: { memories: 1 },
        isTrue: false,
        outcome: 'She shakes her head gently. That is not what she needs.',
      },
    ],
  },
  {
    name: 'deeproot',
    position: { x: 20, z: -80 },
    radius: 6,
    displayName: 'Deeproot',
    flavor: 'Roots thick as a man’s arm break the stones of the road.',
    npc: 'The Root-keeper',
    sells: { name: 'Rooted Charm', effect: 'quietGoblins' },
    options: [
      {
        label: 'Offer a Memory',
        cost: { memories: 1 },
        isTrue: false,
        outcome:
          'She presses the memory into the bark. The tree does not stir for it.',
      },
      {
        label: 'Give a Year',
        cost: { years: 1 },
        isTrue: true,
        outcome:
          'The charm warms in your hand. You feel the road lean, very slightly, toward you.',
      },
      {
        label: 'Pay 15 Gold',
        cost: { gold: 15 },
        isTrue: false,
        outcome:
          'She takes the coins and turns back to the roots. You are not sure she looked up.',
      },
    ],
  },
  {
    name: 'mirrorTown',
    position: { x: 30, z: -100 },
    radius: 6,
    displayName: 'Mirror Town',
    flavor: 'Every window shows you, but not the you that is walking.',
    npc: 'The Glassmaker',
    sells: { name: 'True-glass Shard', effect: 'reflectEnding' },
    options: [
      {
        label: 'Share a Secret',
        cost: { secrets: 1 },
        isTrue: true,
        outcome:
          'He listens. The shard is already on the counter, waiting for you to take it.',
      },
      {
        label: 'Pay 25 Gold',
        cost: { gold: 25 },
        isTrue: false,
        outcome:
          'He takes the gold without meeting your eye. The shard is yours.',
      },
      {
        label: 'Make a Promise',
        cost: { promises: 1 },
        isTrue: false,
        outcome:
          'The promise falls flat between you. He hands over the shard anyway.',
      },
    ],
  },
  {
    name: 'unnamed',
    position: { x: 0, z: -170 },
    radius: 8,
    displayName: 'The Unnamed Village',
    flavor: 'No one here will tell you what this place is called.',
    placeholder: true,
  },
];

export function getVillageByName(name) {
  return villages.find((v) => v.name === name);
}
