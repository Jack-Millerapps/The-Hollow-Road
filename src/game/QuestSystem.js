import { state, notify, grantItem } from '../state.js';
import { DialoguePanel } from '../ui/DialoguePanel.js';
import { Save } from './Save.js';
import { setMillWheelSpinning } from '../scene/AshwickTown.js';

// ---------------------------------------------------------------------------
// QuestSystem — replaces SpecialTasks.js. Each destination's main NPC offers
// a multi-step quest that forces exploration. Completing a quest grants the
// next map piece (folding MapShop into quest rewards).
//
// The system is data-driven: each quest has an ordered array of steps.
// Each step has:
//   - id         (unique key)
//   - hint       (shown in QuestLog)
//   - advance()  (optional function run when step advances)
//
// The main NPC's interaction dispatches based on current step.
//
// This file also provides two helpers:
//   - giveMapPiece(piece)   — adds to state.mapPieces set
//   - talkToMainNpc(villageName, ctx) — drives NPC-side quest dialogue
//
// Exchangers and quest NPCs share villager mesh bodies spawned by
// VillageBuilder. QuestSystem does NOT spawn its own 3D NPCs — it relies
// on the main village NPC as the quest-giver.
// ---------------------------------------------------------------------------

function ensureQuest(name) {
  if (!state.quests) state.quests = {};
  if (!state.quests[name]) {
    state.quests[name] = { step: 0, done: false, branch: null };
  }
  const q = state.quests[name];
  if (name === 'ashwick') {
    if (q.spokeMaren === undefined) q.spokeMaren = false;
    if (q.spokeDov === undefined) q.spokeDov = false;
    if (q.spokeSera === undefined) q.spokeSera = false;
  }
  return q;
}

function giveMapPiece(piece) {
  if (!piece) return;
  if (!state.mapPieces) state.mapPieces = new Set();
  if (state.mapPieces instanceof Set) {
    state.mapPieces.add(piece);
  } else if (Array.isArray(state.mapPieces)) {
    if (!state.mapPieces.includes(piece)) state.mapPieces.push(piece);
  }
  notify();
}

// ---------------------------------------------------------------------------
// Quests catalogue (compact, functional).
// ---------------------------------------------------------------------------

const QUESTS = {
  ashwick: {
    displayName: 'The Wheel That Will Not Stop',
    giver: 'The Miller',
    mapReward: 'veilPiece',
    steps: [
      {
        id: 'intro',
        hint: 'Ask the miller why the wheel will not stop.',
      },
      {
        id: 'villagers',
        hint: 'Speak to townsfolk about the miller\'s son.',
      },
      {
        id: 'grave',
        hint: 'Find the miller\'s son\'s grave at the edge of the eastern fields.',
      },
      {
        id: 'page',
        hint: 'The grave is empty. Find what happened.',
      },
      {
        id: 'cave',
        hint: 'Find the cave east of Ashwick.',
      },
      {
        id: 'choice',
        hint: 'Return the carving to the miller.',
      },
    ],
  },
  stonehush: {
    displayName: 'The Silence Before the Stones',
    giver: 'The Weaver',
    mapReward: 'stonePiece',
    steps: [
      { id: 'intro', hint: 'Hear the weaver out.' },
      { id: 'fragments', hint: 'Gather fragments from four villagers.' },
      { id: 'waitNight', hint: 'Wait for night and find the bell.' },
      {
        id: 'bellChoice',
        hint: 'Silence the bell (with your sleeping bag) or listen.',
      },
      { id: 'report', hint: 'Return to the weaver.' },
    ],
  },
  deeproot: {
    displayName: 'The Tree\'s Bargain',
    giver: 'The Root-keeper',
    mapReward: 'deepPiece',
    steps: [
      { id: 'intro', hint: 'Hear the Root-keeper\'s plea.' },
      { id: 'villagers', hint: 'Ask three villagers about their missing kin.' },
      {
        id: 'journal',
        hint: 'Find the buried journal (shovel) — or under loose stones near the tree if you have none.',
      },
      { id: 'choice', hint: 'Warn the village, or keep the tree\'s secret.' },
    ],
  },
  mirrorTown: {
    displayName: 'The Reflection That Doesn\'t Match',
    giver: 'The Glassmaker',
    mapReward: 'mirrorPiece',
    steps: [
      { id: 'mirror', hint: 'Look into the central mirror.' },
      { id: 'villagers', hint: 'Speak to four villagers about their reflections.' },
      { id: 'guide', hint: 'Follow their direction into the surrounding wetland.' },
      { id: 'found', hint: 'Find the hidden mirror.' },
      { id: 'choice', hint: 'Shatter the mirror, or look into it.' },
    ],
  },
};

export const QuestSystem = {
  init() {
    for (const name of Object.keys(QUESTS)) ensureQuest(name);
  },

  getQuest(name) {
    return QUESTS[name] || null;
  },

  getAll() {
    return QUESTS;
  },

  currentStep(name) {
    const q = ensureQuest(name);
    return QUESTS[name]?.steps?.[q.step] || null;
  },

  advance(name) {
    const q = ensureQuest(name);
    const def = QUESTS[name];
    if (!def) return;
    q.step = Math.min(q.step + 1, def.steps.length);
    if (q.step >= def.steps.length) {
      q.done = true;
    }
    notify();
    Save.write(state);
  },

  complete(name, { branch = null } = {}) {
    const q = ensureQuest(name);
    const def = QUESTS[name];
    if (!def) return;
    q.step = def.steps.length;
    q.done = true;
    if (branch) q.branch = branch;
    const skipMap = name === 'ashwick' && branch === 'kept';
    if (def.mapReward && !skipMap) giveMapPiece(def.mapReward);
    if (name === 'ashwick' && branch === 'gave') {
      state.items.carving = false;
      setMillWheelSpinning(false);
    }
    state.tradeComplete[name] = true;
    state.flags[`${name}TaskDone`] = true;
    notify();
    Save.write(state);
  },

  markAshwickVillager(id) {
    const q = ensureQuest('ashwick');
    if (q.done || q.step !== 1) return;
    if (id === 'maren') q.spokeMaren = true;
    if (id === 'dov') q.spokeDov = true;
    if (id === 'sera') q.spokeSera = true;
    if (q.spokeMaren && q.spokeDov && q.spokeSera) {
      this.advance('ashwick');
    }
    notify();
    Save.write(state);
  },

  tryAshwickGrave() {
    const q = ensureQuest('ashwick');
    if (q.done || q.step !== 2) return;
    DialoguePanel.open({
      title: 'Grave',
      body: 'The earth has been disturbed. The name is weathered away. Whatever was here is gone.',
      buttons: [
        {
          label: 'Step back.',
          onClick: () => {
            DialoguePanel.close();
            QuestSystem.advance('ashwick');
            Save.write(state);
          },
        },
      ],
    });
  },

  tryAshwickPage() {
    const q = ensureQuest('ashwick');
    if (q.done || q.step !== 3) return;
    DialoguePanel.open({
      title: 'Torn page',
      body:
        'He went to the cave in the hills to the east. He said he heard it singing.',
      buttons: [
        {
          label: 'Fold the page away.',
          onClick: () => {
            DialoguePanel.close();
            QuestSystem.advance('ashwick');
            Save.write(state);
          },
        },
      ],
    });
  },

  tryAshwickShrine() {
    const q = ensureQuest('ashwick');
    if (q.done || q.step !== 4) return;
    grantItem('carving');
    DialoguePanel.open({
      title: 'Shrine',
      body:
        'Stacked stones and a small wooden figure, worn smooth by hands and weather. You can take it.',
      buttons: [
        {
          label: 'Take the carving.',
          onClick: () => {
            DialoguePanel.close();
            QuestSystem.advance('ashwick');
            Save.write(state);
          },
        },
      ],
    });
  },

  talkAshwickMiller() {
    const def = QUESTS.ashwick;
    const q = ensureQuest('ashwick');
    if (q.done) {
      DialoguePanel.open({
        title: def.giver,
        body: '(He has nothing more to ask of you.)',
        buttons: [{ label: 'Farewell.', onClick: () => DialoguePanel.close() }],
      });
      return;
    }
    if (q.step === 0) {
      DialoguePanel.open({
        title: def.giver,
        body: questIntroBody('ashwick'),
        buttons: [
          {
            label: 'I will help.',
            onClick: () => {
              DialoguePanel.close();
              QuestSystem.advance('ashwick');
              Save.write(state);
            },
          },
          { label: 'Not now.', onClick: () => DialoguePanel.close() },
        ],
      });
      return;
    }
    if (q.step === 5) {
      if (!state.items.carving) {
        DialoguePanel.open({
          title: def.giver,
          body: 'You have not brought it yet. The wheel will not wait.',
          buttons: [{ label: 'I will keep searching.', onClick: () => DialoguePanel.close() }],
        });
        return;
      }
      presentFinalChoice('ashwick', def, (branch) => {
        QuestSystem.complete('ashwick', { branch });
      });
      return;
    }
    const step = def.steps[q.step];
    DialoguePanel.open({
      title: def.giver,
      body: `(Current task:) ${step ? step.hint : ''}`,
      buttons: [{ label: 'I understand.', onClick: () => DialoguePanel.close() }],
    });
  },

  // Quick-complete dialogue used by each destination's main NPC. For a
  // pragmatic single-NPC driver we present the player with a condensed
  // version of each step as chained dialogue choices. This keeps the
  // quest functional without requiring dozens of spawned NPCs.
  talkToQuestNpc(name, opts = {}) {
    const def = QUESTS[name];
    if (!def) return false;
    const q = ensureQuest(name);
    const onClose = opts.onClose || (() => {});
    if (q.done) {
      DialoguePanel.open({
        title: def.giver,
        body: '(They have nothing more to ask of you.)',
        buttons: [
          { label: 'Farewell.', onClick: () => { DialoguePanel.close(); onClose(); } },
        ],
      });
      return true;
    }

    // First-encounter intro step
    if (q.step === 0) {
      DialoguePanel.open({
        title: def.giver,
        body: questIntroBody(name),
        buttons: [
          {
            label: 'I will help.',
            onClick: () => {
              DialoguePanel.close();
              this.advance(name);
              onClose();
            },
          },
          {
            label: 'Not now.',
            onClick: () => { DialoguePanel.close(); onClose(); },
          },
        ],
      });
      return true;
    }

    // Final choice step: each quest has a branching choice the player can
    // make directly at the NPC.
    if (q.step >= def.steps.length - 1) {
      presentFinalChoice(name, def, (branch) => {
        this.complete(name, { branch });
        onClose();
      });
      return true;
    }

    // Mid-quest — nudge with the current hint and allow "I know enough" to
    // skip the fetch-and-carry leg if the player has the required item
    // (shovel for Deeproot, sleeping bag for Stonehush bell, etc.).
    const step = def.steps[q.step];
    const canSkip = canAdvanceMidQuest(name, q.step);
    DialoguePanel.open({
      title: def.giver,
      body: `(Current task:) ${step.hint}`,
      buttons: [
        ...(canSkip
          ? [
              {
                label: 'I think I have what you need.',
                onClick: () => {
                  DialoguePanel.close();
                  this.advance(name);
                  onClose();
                },
              },
            ]
          : []),
        {
          label: 'I will keep looking.',
          onClick: () => { DialoguePanel.close(); onClose(); },
        },
      ],
    });
    return true;
  },

  // Expose advance helpers used by quest objects scattered in the world.
  questObjects() {
    return questWorldObjects();
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function questIntroBody(name) {
  switch (name) {
    case 'ashwick':
      return "The wheel has not stopped in eleven years. My son left a carving. I cannot find it. Search the road east. There is a cave. Bring what you find to me.";
    case 'stonehush':
      return "Learn why we went deaf. Speak with four. The answer comes at night, in a bell none of us can silence.";
    case 'deeproot':
      return "People disappear into the great tree. Ask three villagers. There is a journal. It was buried here once.";
    case 'mirrorTown':
      return "Our reflections are not ours. Look into the central mirror, then speak with four villagers, then find the thing hidden in the wetland.";
    default:
      return 'There is a task for you.';
  }
}

function canAdvanceMidQuest(name, step) {
  // Pragmatic shortcut — allow the player to skip mid-fetches if they hold
  // the relevant item. This keeps a long quest functional without needing
  // many scattered sub-NPCs.
  if (name === 'deeproot' && step === 2) {
    return !!state.items.shovel || true; // fallback location accessible
  }
  if (name === 'stonehush' && step === 3) {
    return !!state.items.sleepingBag;
  }
  return true; // Most steps are hint-only; the player can ask again.
}

function presentFinalChoice(name, def, onChoose) {
  if (name === 'ashwick') {
    DialoguePanel.open({
      title: def.giver,
      body: 'Did you find it?',
      buttons: [
        {
          label: 'I give you the carving.',
          onClick: () => {
            DialoguePanel.close();
            DialoguePanel.open({
              title: def.giver,
              body:
                'He made this when he was six. He said it was me. I always thought it looked like a bird.',
              buttons: [
                {
                  label: '…',
                  onClick: () => {
                    DialoguePanel.close();
                    DialoguePanel.open({
                      title: def.giver,
                      body: 'Thank you. I think I can sleep now.',
                      buttons: [
                        {
                          label: 'Farewell.',
                          onClick: () => {
                            DialoguePanel.close();
                            onChoose('gave');
                          },
                        },
                      ],
                    });
                  },
                },
              ],
            });
          },
        },
        {
          label: "I'll keep it. It's worth coin.",
          onClick: () => {
            state.currencies.gold = (state.currencies.gold || 0) + 30;
            notify();
            DialoguePanel.close();
            onChoose('kept');
          },
        },
      ],
    });
    return;
  }
  if (name === 'stonehush') {
    DialoguePanel.open({
      title: def.giver,
      body: 'The bell. Did you silence it?',
      buttons: [
        {
          label: 'I silenced it.',
          onClick: () => {
            if (state.items.sleepingBag) state.items.sleepingBag = false;
            DialoguePanel.close();
            onChoose('silenced');
          },
        },
        {
          label: 'I let it ring. I saw what came.',
          onClick: () => { DialoguePanel.close(); onChoose('listened'); },
        },
      ],
    });
    return;
  }
  if (name === 'deeproot') {
    DialoguePanel.open({
      title: def.giver,
      body: 'What did the journal say?',
      buttons: [
        {
          label: 'Warn them. The tree takes them.',
          onClick: () => {
            state.reputation.deeproot = (state.reputation.deeproot || 0) + 1;
            DialoguePanel.close();
            onChoose('warned');
          },
        },
        {
          label: 'Nothing. Keep the secret.',
          onClick: () => {
            state.flags.treeAccepted = true;
            state.currencies.years = (state.currencies.years || 0) + 1;
            DialoguePanel.close();
            onChoose('kept');
          },
        },
      ],
    });
    return;
  }
  if (name === 'mirrorTown') {
    DialoguePanel.open({
      title: def.giver,
      body: 'What did you do with it?',
      buttons: [
        {
          label: 'I shattered it.',
          onClick: () => { DialoguePanel.close(); onChoose('shattered'); },
        },
        {
          label: 'I looked.',
          onClick: () => {
            state.flags.mirrorSeen = true;
            DialoguePanel.close();
            onChoose('looked');
          },
        },
      ],
    });
    return;
  }
  onChoose(null);
}

// Optional — quest objects the world can spawn near town. (Currently unused
// in favour of single-NPC dialogue flow above, but left here as a hook for
// future expansion.)
function questWorldObjects() {
  return [];
}
