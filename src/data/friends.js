// Westwind's three friends — static data consumed by the Westwind scene
// builder and the FriendNPC interaction system.
//
// Positions are in *world space* (Westwind center sits at (0, 0, 120)),
// so each friend stands in front of one of the three neighbor cabins.
// The `grants` field describes an item key in state.items to flip to true
// after the dialogue closes.

export const FRIENDS = [
  {
    id: 'mira',
    name: 'Mira',
    robeColor: 0x5a3020,
    skinColor: 0xd7b78c,
    position: { x: 7.5, z: 122 }, // near neighbor cabin 1
    facing: -Math.PI / 1.5,
    lines: [
      "Don't just follow the road — there are things beneath it.",
      'Caves. I\'ve heard travelers say there are villages down there. Underground.',
      'They trade differently.',
    ],
  },
  {
    id: 'tomas',
    name: 'Tomas',
    robeColor: 0x2a3548,
    skinColor: 0xc29a74,
    position: { x: -7.5, z: 111 }, // near neighbor cabin 2
    facing: Math.PI / 4,
    lines: [
      'The road at night is no place to be.',
      "Promise me you'll get off it before dark.",
    ],
  },
  {
    id: 'elen',
    name: 'Elen',
    robeColor: 0x4a2a4a,
    skinColor: 0xcfa382,
    position: { x: 8.5, z: 111 }, // near neighbor cabin 3
    facing: Math.PI,
    lines: [
      'Take this. A piece of an old map.',
      "It only shows the cave and Ashwick for now — you'll have to find the rest yourself.",
    ],
    grants: 'ripMap',
  },
];

export function getFriend(id) {
  return FRIENDS.find((f) => f.id === id) || null;
}
