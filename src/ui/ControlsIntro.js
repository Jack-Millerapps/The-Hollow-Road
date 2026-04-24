import { state, notify } from '../state.js';
import { Save } from '../game/Save.js';

// One-time controls overlay. Triggered after the cabin scene, on first step
// into Westwind. After dismissal, a closing italic line fades in and out.

const ROWS = [
  ['WASD', 'Move'],
  ['Mouse', 'Look'],
  ['Shift', 'Sprint'],
  ['E', 'Interact'],
  ['F', 'Mine / Rest / Use'],
  ['I', 'Inventory'],
  ['M', 'Map (when you have one)'],
  ['J', 'Quest Log'],
  ['Esc', 'Pause menu'],
];

export const ControlsIntro = {
  root: null,

  maybeShow() {
    if (state.flags.seenControls) return false;
    this.show();
    return true;
  },

  show() {
    if (this.root) return;
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(6, 5, 3, 0.82)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '90',
      cursor: 'pointer',
      opacity: '0',
      transition: 'opacity 500ms ease',
      color: '#e5d9b6',
      fontFamily: 'Georgia, serif',
      letterSpacing: '0.04em',
    });

    const title = document.createElement('div');
    title.textContent = 'The Road';
    Object.assign(title.style, {
      fontStyle: 'italic',
      fontSize: '28px',
      marginBottom: '24px',
      opacity: '0.85',
    });
    wrap.appendChild(title);

    const table = document.createElement('div');
    Object.assign(table.style, {
      display: 'grid',
      gridTemplateColumns: '90px 1fr',
      gap: '12px 24px',
      fontSize: '18px',
      marginBottom: '40px',
    });
    for (const [key, desc] of ROWS) {
      const k = document.createElement('div');
      k.textContent = key;
      Object.assign(k.style, {
        textAlign: 'right',
        color: '#c8b07a',
        fontVariant: 'small-caps',
        letterSpacing: '0.12em',
      });
      const d = document.createElement('div');
      d.textContent = desc;
      table.appendChild(k);
      table.appendChild(d);
    }
    wrap.appendChild(table);

    const hint = document.createElement('div');
    hint.textContent = 'Click anywhere to begin.';
    Object.assign(hint.style, {
      fontStyle: 'italic',
      fontSize: '16px',
      color: '#c8b07a',
    });
    wrap.appendChild(hint);

    wrap.addEventListener('click', () => this.dismiss());

    document.body.appendChild(wrap);
    requestAnimationFrame(() => {
      wrap.style.opacity = '1';
    });
    this.root = wrap;
  },

  dismiss() {
    if (!this.root) return;
    state.flags.seenControls = true;
    notify();
    Save.write(state);
    const wrap = this.root;
    this.root = null;
    wrap.style.opacity = '0';
    setTimeout(() => {
      wrap.remove();
      showNightLine();
    }, 500);
  },
};

function showNightLine() {
  const el = document.createElement('div');
  el.textContent = 'It is night. The road is no kinder for it.';
  Object.assign(el.style, {
    position: 'fixed',
    top: '40%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontFamily: 'Georgia, serif',
    fontStyle: 'italic',
    fontSize: '22px',
    color: '#e5d9b6',
    opacity: '0',
    transition: 'opacity 1200ms ease',
    zIndex: '85',
    pointerEvents: 'none',
    textShadow: '0 0 18px rgba(0,0,0,0.9)',
  });
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = '1';
  });
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 1400);
  }, 3500);
}
