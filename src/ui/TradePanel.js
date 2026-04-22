function costToString(cost) {
  if (!cost) return '';
  return Object.entries(cost)
    .map(([k, v]) => `${v} ${k}`)
    .join(' · ');
}

export const TradePanel = {
  root: null,

  open({ village, canAfford, onChoose }) {
    this.close();

    const backdrop = document.createElement('div');
    backdrop.className = 'panel-backdrop';

    const panel = document.createElement('div');
    panel.className = 'panel trade-panel';

    const title = document.createElement('h2');
    title.textContent = village.displayName;
    panel.appendChild(title);

    const npc = document.createElement('div');
    npc.className = 'npc-name';
    npc.textContent = village.npc;
    panel.appendChild(npc);

    const flavor = document.createElement('p');
    flavor.className = 'flavor';
    flavor.textContent = village.flavor;
    panel.appendChild(flavor);

    const body = document.createElement('p');
    body.className = 'body';
    body.textContent = `${village.npc} looks up from their work. They are waiting for you to offer something. They will know if it is the wrong thing.`;
    panel.appendChild(body);

    const options = document.createElement('div');
    options.className = 'options';

    for (const option of village.options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const label = document.createElement('span');
      label.textContent = option.label;
      const costTag = document.createElement('span');
      costTag.className = 'cost-tag';
      costTag.textContent = `Costs ${costToString(option.cost)}`;
      btn.appendChild(label);
      btn.appendChild(costTag);

      const affordable = canAfford(option.cost);
      btn.disabled = !affordable;
      if (!affordable) {
        const note = document.createElement('span');
        note.className = 'cost-tag';
        note.textContent = 'You cannot afford this.';
        btn.appendChild(note);
      }

      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        onChoose(option);
      });
      options.appendChild(btn);
    }

    panel.appendChild(options);
    backdrop.appendChild(panel);
    document.getElementById('ui-root').appendChild(backdrop);
    this.root = backdrop;
  },

  close() {
    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    this.root = null;
  },
};
