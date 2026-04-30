import { state, spend, canAfford, addInventory, notify } from '../state.js';
import { TradePanel } from '../ui/TradePanel.js';
import { DialoguePanel } from '../ui/DialoguePanel.js';
import { QuestSystem } from './QuestSystem.js';

// Consolidation — villages that have multi-step quests. Entering these towns
// hands off to QuestSystem (the quest's main NPC drives the dialogue).
const QUEST_VILLAGES = new Set(['ashwick', 'stonehush', 'deeproot', 'mirrorTown']);

// List of all map pieces the world can yield. Kept in sync with CAVE_PIECES
// in src/data/caves.js — the caves module is the authoritative owner of the
// piece ids, but we duplicate the list here to avoid a circular import.
const ALL_MAP_PIECES = [
  'ashwickPiece',
  'veilPiece',
  'stonePiece',
  'deepPiece',
  'mirrorPiece',
];

function pickRandomUnownedPiece() {
  const owned = state.mapPieces instanceof Set ? state.mapPieces : new Set();
  const remaining = ALL_MAP_PIECES.filter((id) => !owned.has(id));
  if (remaining.length === 0) return null;
  return remaining[Math.floor(Math.random() * remaining.length)];
}

function classifyWrongness(option, village) {
  // If the NPC's true want is memories or years (deep cost), offering promises
  // or gold is perceived as cheap. Other wrong choices are neutral.
  const trueOpt = village.options.find((o) => o.isTrue);
  if (!trueOpt) return 0;
  const trueType = Object.keys(trueOpt.cost)[0];
  const offeredType = Object.keys(option.cost)[0];
  const deep = trueType === 'memories' || trueType === 'years';
  if (deep && offeredType === 'promises') return -1;
  if (deep && offeredType === 'gold') return -1;
  return 0;
}

export const TradeSystem = {
  startTrade(village, onComplete) {
    // Ashwick uses world NPCs (Aldric + townsfolk). On the very first time
    // the player enters the radius we still auto-open the miller's intro
    // so the quest can't be missed; afterwards the player goes back to
    // talking to him in-world.
    if (village.name === 'ashwick') {
      const q = state.quests?.ashwick;
      if (!q || q.step === 0) {
        QuestSystem.talkAshwickMiller();
      }
      if (onComplete) onComplete();
      return;
    }
    if (QUEST_VILLAGES.has(village.name)) {
      QuestSystem.talkToQuestNpc(village.name, { onClose: onComplete });
      return;
    }
    TradePanel.open({
      village,
      canAfford,
      onChoose: (option) => this.choose(village, option, onComplete),
    });
  },

  choose(village, option, onComplete) {
    if (!canAfford(option.cost)) return;

    for (const [type, amount] of Object.entries(option.cost)) {
      spend(type, amount);
    }

    let repDelta = 0;
    let bodyText = option.outcome;
    let headerNote = '';

    // Phase 4 — handle the Veil Market "Whisper of the Road" special effect.
    if (option.specialEffect === 'whisperOfRoad') {
      const piece = pickRandomUnownedPiece();
      if (piece) {
        if (!(state.mapPieces instanceof Set)) state.mapPieces = new Set();
        state.mapPieces.add(piece);
        addInventory({
          name: `Whisper: ${piece}`,
          effect: 'mapPiece',
          source: village.name,
        });
        headerNote = `A new piece of the map is yours.`;
      } else {
        headerNote = 'You already hold every piece of the road they know.';
      }
      // Whispers do not mark the village's main trade as complete.
      state.tradeComplete[village.name] = state.tradeComplete[village.name] || false;
    } else if (option.isTrue) {
      repDelta = 1;
      addInventory({ ...village.sells, source: village.name });
      headerNote = `You received ${village.sells.name}.`;
      state.tradeComplete[village.name] = true;
    } else {
      repDelta = classifyWrongness(option, village);
      state.tradeComplete[village.name] = true;
      if (repDelta < 0) headerNote = 'Something in the room turns away from you.';
    }

    if (typeof state.reputation[village.name] === 'number') {
      state.reputation[village.name] += repDelta;
    } else {
      state.reputation[village.name] = repDelta;
    }
    notify();

    TradePanel.close();

    DialoguePanel.open({
      title: village.displayName,
      body: [bodyText, headerNote].filter(Boolean).join('\n\n'),
      buttons: [
        {
          label: 'Walk on',
          onClick: () => {
            DialoguePanel.close();
            if (onComplete) onComplete();
          },
        },
      ],
    });
  },
};
