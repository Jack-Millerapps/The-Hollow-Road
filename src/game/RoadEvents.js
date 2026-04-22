import { state, spend, gain, canAfford, notify } from '../state.js';
import { roadEvents } from '../data/roadEvents.js';
import { DialoguePanel } from '../ui/DialoguePanel.js';

function pickEvent() {
  const unseen = roadEvents.filter((e) => !state.seenRoadEvents.has(e.id));
  const pool = unseen.length > 0 ? unseen : roadEvents;
  return pool[Math.floor(Math.random() * pool.length)];
}

export const RoadEvents = {
  trigger(onComplete) {
    const event = pickEvent();
    state.seenRoadEvents.add(event.id);

    const buttons = event.options.map((opt) => ({
      label: opt.label,
      disabled: opt.cost ? !canAfford(opt.cost) : false,
      onClick: () => this.resolve(event, opt, onComplete),
    }));

    DialoguePanel.open({
      title: event.title,
      body: event.text,
      buttons,
    });
  },

  resolve(event, option, onComplete) {
    if (option.cost && !canAfford(option.cost)) return;

    if (option.cost) {
      for (const [type, amount] of Object.entries(option.cost)) {
        spend(type, amount);
      }
    }
    if (option.gain) {
      for (const [type, amount] of Object.entries(option.gain)) {
        gain(type, amount);
      }
    }
    if (option.flag) {
      state.flags[option.flag] = true;
      notify();
    }

    DialoguePanel.close();
    DialoguePanel.open({
      title: event.title,
      body: option.outcome,
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
