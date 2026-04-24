// Consolidation patch — friends now grant starting items. The player must
// explicitly ASK for them: a friend opens with a long ethos paragraph, and
// offers the item only when the player says "I'm leaving today."
//
// Grants:
//   Mira   — pickaxe + shovel
//   Tomas  — watch + sleepingBag
//   Elen   — ripMap

export const FRIENDS = [
  {
    id: 'mira',
    name: 'Mira',
    robeColor: 0x5a3020,
    skinColor: 0xd7b78c,
    position: { x: 7.5, z: 502 },
    facing: -Math.PI / 1.5,
    ethos:
      "You won't survive on the road. Not at night. The caves are the only shelter, and the trolls won't open their hollows for an empty hand. Take these. The pickaxe lets you mine what they want. The shovel — well. The shovel is for what you'd rather not be seen burying.",
    grants: ['pickaxe', 'shovel'],
    receivedLine: '(You received a pickaxe and a shovel.)',
  },
  {
    id: 'tomas',
    name: 'Tomas',
    robeColor: 0x2a3548,
    skinColor: 0xc29a74,
    position: { x: -7.5, z: 491 },
    facing: Math.PI / 4,
    ethos:
      "My grandfather walked the road. He came back. He told me one thing before he died: the road forgives no one who can't tell day from night. This watch was his. The sleeping bag was his too. He carried it for forty years. He said the only mercy on the road is sleeping through the dark hours.",
    grants: ['watch', 'sleepingBag'],
    receivedLine: '(You received a watch and a sleeping bag.)',
  },
  {
    id: 'elen',
    name: 'Elen',
    robeColor: 0x4a2a4a,
    skinColor: 0xcfa382,
    position: { x: 8.5, z: 491 },
    facing: Math.PI,
    ethos:
      "I tore this from a book my brother left when he disappeared. The map is incomplete on purpose. He said no one is ready to see the whole road at once. I think he was right. You'll earn the rest. Or you won't.",
    grants: ['ripMap'],
    receivedLine: '(You received a ripped map.)',
  },
];

export function getFriend(id) {
  return FRIENDS.find((f) => f.id === id) || null;
}
