import { state, spend, canAfford, addInventory, notify } from '../state.js';
import { TradePanel } from '../ui/TradePanel.js';
import { DialoguePanel } from '../ui/DialoguePanel.js';

function classifyWrongness(option, village) {
  // If the NPC's true want is memories or years (deep cost), offering promises
  // is perceived as cheap. Other wrong choices are neutral (no rep change).
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
    if (option.isTrue) {
      repDelta = 1;
      addInventory({ ...village.sells, source: village.name });
    } else {
      repDelta = classifyWrongness(option, village);
    }
    state.reputation[village.name] += repDelta;
    state.tradeComplete[village.name] = true;
    notify();

    TradePanel.close();

    const repNote =
      option.isTrue
        ? `You received ${village.sells.name}.`
        : repDelta < 0
        ? "Something in the room turns away from you."
        : '';

    DialoguePanel.open({
      title: village.displayName,
      body: [option.outcome, repNote].filter(Boolean).join('\n\n'),
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
