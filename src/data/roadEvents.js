export const roadEvents = [
  {
    id: 'wanderingSpirit',
    title: 'A Wandering Spirit',
    text:
      "A pale shape drifts along the verge, neither coming nor going. It turns its head. 'One gold,' it says, 'for something you've never told.'",
    options: [
      {
        label: 'Trade a Secret for 1 Gold',
        cost: { secrets: 1 },
        gain: { gold: 1 },
        outcome:
          'The spirit takes the secret like a held breath. A coin clinks in your palm. It is already colder than it should be.',
      },
      {
        label: 'Walk on',
        outcome: 'You keep your silence. The spirit bows its head and fades.',
      },
    ],
  },
  {
    id: 'lostChild',
    title: 'A Lost Child',
    text:
      "A child stands in the middle of the road, barefoot. Its edges blur at dusk. 'Promise you'll remember me,' it whispers.",
    options: [
      {
        label: 'Make the Promise',
        cost: { promises: 1 },
        gain: { memories: 1 },
        outcome:
          'The child smiles — a smile far older than the face wearing it — and hands you a small, warm thing. A memory, not yours, but yours now.',
      },
      {
        label: 'Say nothing',
        outcome:
          'You step around the child. It does not follow. Something in your chest tightens all the same.',
      },
    ],
  },
  {
    id: 'brokenCart',
    title: 'A Broken Cart',
    text:
      "A merchant crouches over a splintered wheel, muttering. 'Five gold for the repair,' he says, 'and I'll tell you something I wasn't meant to hear.'",
    options: [
      {
        label: 'Pay 5 Gold',
        cost: { gold: 5 },
        gain: { secrets: 1 },
        outcome:
          'You pay. He leans in. What he tells you is not for repeating. You keep it anyway.',
      },
      {
        label: 'Refuse',
        outcome:
          'He spits into the dust and turns away. The cart will be there in the morning. He will not.',
      },
    ],
  },
  {
    id: 'signpost',
    title: 'A Signpost',
    signText:
      'The Weaver at Stonehush counts in years, not coins. Bring what you cannot afford to lose.',
    text:
      "A weathered post leans at the road's edge. Words have been carved, scratched out, carved again. You can just make out the last line:",
    options: [
      {
        label: 'Read it',
        outcome:
          '"The Weaver at Stonehush counts in years, not coins. Bring what you cannot afford to lose." You walk on.',
        flag: 'nextVillageHintShown',
      },
    ],
  },
  {
    id: 'discardedLantern',
    title: 'A Discarded Lantern',
    text:
      'A lantern lies on its side in the grass, glass unbroken, oil still inside. No one is nearby. No one has been, for a long while.',
    options: [
      {
        label: 'Take the coin left beside it',
        gain: { gold: 1 },
        outcome:
          'You pocket the coin. The lantern flickers once, as if in acknowledgement, and then goes out.',
      },
    ],
  },
  {
    id: 'hollowTree',
    title: 'A Hollow Tree',
    text:
      "An oak older than any village here. Its hollow is wide enough to step inside. Something inside it is breathing — slowly, patiently. 'Give me a memory,' it says, 'and I'll give you back a year you thought was spent.'",
    options: [
      {
        label: 'Trade a Memory for a Year',
        cost: { memories: 1 },
        gain: { years: 1 },
        outcome:
          'You press the memory into the dark. Something shifts — in the tree, or in your chest. When you step out, the night feels a little longer. A little more yours.',
      },
      {
        label: 'Walk on',
        outcome:
          'You keep your memory. The tree breathes on, patient as weather.',
      },
    ],
  },
];
