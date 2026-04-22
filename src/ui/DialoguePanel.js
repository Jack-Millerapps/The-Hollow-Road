export const DialoguePanel = {
  root: null,

  open({ title, body, buttons }) {
    this.close();

    const backdrop = document.createElement('div');
    backdrop.className = 'panel-backdrop';

    const panel = document.createElement('div');
    panel.className = 'panel dialogue-panel';

    if (title) {
      const h = document.createElement('h2');
      h.textContent = title;
      panel.appendChild(h);
    }

    if (body) {
      const b = document.createElement('p');
      b.className = 'body';
      b.textContent = body;
      panel.appendChild(b);
    }

    const btnWrap = document.createElement('div');
    btnWrap.className = 'buttons';
    for (const btnDef of buttons || []) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = btnDef.label;
      if (btnDef.disabled) btn.disabled = true;
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        btnDef.onClick?.();
      });
      btnWrap.appendChild(btn);
    }
    panel.appendChild(btnWrap);

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
