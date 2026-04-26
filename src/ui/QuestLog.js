import { state } from '../state.js';
import { QuestSystem } from '../game/QuestSystem.js';

// Press J to open. Shows active quests with current step + hint.

export const QuestLog = {
  open: false,
  root: null,

  mount() {
    window.addEventListener('keydown', (e) => {
      // Don't steal keys while the player is typing into an input (e.g. name entry).
      const a = document.activeElement;
      const typing =
        a &&
        (a.tagName === 'INPUT' ||
          a.tagName === 'TEXTAREA' ||
          a.isContentEditable);
      if (typing) return;
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        this.toggle();
      } else if (e.key === 'Escape' && this.open) {
        e.preventDefault();
        this.close();
      }
    });
  },

  toggle() {
    if (this.open) this.close();
    else this.openPanel();
  },

  openPanel() {
    if (this.open) return;
    this.open = true;

    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(0, 0, 0, 0.78)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '60',
    });
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) this.close();
    });

    const panel = document.createElement('div');
    Object.assign(panel.style, {
      width: 'min(560px, 92vw)',
      maxHeight: '80vh',
      overflow: 'auto',
      padding: '28px 32px',
      background: 'rgba(14, 10, 6, 0.96)',
      border: '1px solid rgba(200, 170, 120, 0.4)',
      borderRadius: '4px',
      color: '#e5d9b6',
      fontFamily: 'Georgia, serif',
      boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
    });

    const title = document.createElement('div');
    title.textContent = 'Quests';
    Object.assign(title.style, {
      fontStyle: 'italic',
      fontSize: '24px',
      marginBottom: '18px',
      opacity: '0.9',
    });
    panel.appendChild(title);

    const quests = QuestSystem.getAll();
    const names = Object.keys(quests);
    let any = false;
    for (const name of names) {
      const q = state.quests?.[name];
      if (!q) continue;
      if (q.step === 0 && !q.done) continue; // not yet encountered
      any = true;
      const item = document.createElement('div');
      Object.assign(item.style, {
        padding: '10px 0',
        borderTop: '1px solid rgba(200, 170, 120, 0.14)',
      });
      const def = quests[name];
      const head = document.createElement('div');
      head.textContent = def.displayName;
      Object.assign(head.style, {
        fontWeight: '600',
        fontSize: '16px',
        color: '#ffd79a',
      });
      item.appendChild(head);
      const status = document.createElement('div');
      const statusBase = {
        fontStyle: 'italic',
        fontSize: '13px',
        lineHeight: '1.5',
        marginTop: '4px',
      };
      if (q.done) {
        status.textContent = `Complete${q.branch ? ` — ${q.branch}` : ''}`;
        status.style.color = '#8cd7a3';
        Object.assign(status.style, statusBase);
        item.appendChild(status);
      } else {
        const step = def.steps[q.step];
        if (name === 'ashwick' && q.step === 1 && step?.id === 'villagers') {
          status.textContent = step.hint;
          Object.assign(status.style, statusBase);
          item.appendChild(status);
          const boxWrap = document.createElement('div');
          Object.assign(boxWrap.style, {
            marginTop: '10px',
            fontSize: '12px',
            lineHeight: '1.7',
            fontStyle: 'normal',
            color: '#c8b898',
          });
          const mkRow = (label, done) => {
            const row = document.createElement('div');
            row.textContent = `${label}  [ ${done ? '✓' : ' '} ]`;
            return row;
          };
          boxWrap.appendChild(mkRow('Maren', !!q.spokeMaren));
          boxWrap.appendChild(mkRow('Dov', !!q.spokeDov));
          boxWrap.appendChild(mkRow('Sera', !!q.spokeSera));
          item.appendChild(boxWrap);
        } else {
          status.textContent = step ? step.hint : 'In progress.';
          Object.assign(status.style, statusBase);
          item.appendChild(status);
        }
      }
      panel.appendChild(item);
    }
    if (!any) {
      const empty = document.createElement('div');
      empty.textContent = 'No quests yet. The villages have not asked anything of you.';
      Object.assign(empty.style, {
        fontStyle: 'italic',
        opacity: '0.7',
      });
      panel.appendChild(empty);
    }

    const hint = document.createElement('div');
    hint.textContent = 'J / Esc — close';
    Object.assign(hint.style, {
      marginTop: '20px',
      fontSize: '11px',
      fontVariant: 'small-caps',
      letterSpacing: '0.22em',
      color: '#8a7554',
      textAlign: 'right',
    });
    panel.appendChild(hint);

    wrap.appendChild(panel);
    document.body.appendChild(wrap);
    this.root = wrap;
  },

  close() {
    if (!this.open) return;
    this.open = false;
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    this.root = null;
  },
};
