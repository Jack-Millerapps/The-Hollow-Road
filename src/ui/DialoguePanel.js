import { state } from '../state.js';

// Pure-ish renderer for one dialogue backdrop at a time. Policy (queueing,
// once-semantics, pause coordination) primarily lives in DialogueManager,
// but we still mark `state.dialogueActive` here so legacy callers that
// bypass the manager still benefit.

export const DialoguePanel = {
  root: null,

  open({ title, body, buttons }) {
    // Always tear down any previous DOM first — otherwise stale text can
    // flash through during the mount of a new panel (one of the "glitchy"
    // symptoms).
    this.close({ keepFlag: true });

    const backdrop = document.createElement('div');
    backdrop.className = 'panel-backdrop';

    const panel = document.createElement('div');
    panel.className = 'panel dialogue-panel';

    if (title) {
      const h = document.createElement('h2');
      h.textContent = '';
      h.textContent = title;
      panel.appendChild(h);
    }

    if (body) {
      const b = document.createElement('p');
      b.className = 'body';
      b.textContent = '';
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
      // Once-semantics: a second click on the same button is ignored so
      // double-firing (e.g. touchend + click, rapid hits) can't execute a
      // handler twice.
      let submitted = false;
      btn.addEventListener('click', () => {
        if (btn.disabled || submitted) return;
        submitted = true;
        btnDef.onClick?.();
      });
      btnWrap.appendChild(btn);
    }
    panel.appendChild(btnWrap);

    backdrop.appendChild(panel);
    document.getElementById('ui-root').appendChild(backdrop);
    this.root = backdrop;
    state.dialogueActive = true;
  },

  close(opts = {}) {
    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    this.root = null;
    if (!opts.keepFlag) {
      state.dialogueActive = false;
    }
  },
};
