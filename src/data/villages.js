export const villages = [
  {
    name: 'ashwick',
    position: { x: -120, z: -350 },
    radius: 12,
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
    position: { x: 100, z: -300 },
    radius: 12,
    displayName: 'The Veil Market',
    flavor: "Everything here was someone else's. Including the silence.",
    npc: 'The Auctioneer',
    sells: { name: 'Rare Map', effect: 'revealTrueWant' },
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
    ],
  },
  {
    name: 'stonehush',
    position: { x: 80, z: -370 },
    radius: 12,
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
];

export function getVillageByName(name) {
  return villages.find((v) => v.name === name);
}
