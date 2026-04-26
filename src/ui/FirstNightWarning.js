import { state, notify } from '../state.js';
import { Save } from '../game/Save.js';

// Non-pausing overlay that slides in from the top the first time the player
// is on the road at night. Auto-dismisses after 12s.

export const FirstNightWarning = {
  root: null,

  maybeShow() {
    if (state.flags.seenFirstNightWarning) return false;
    state.flags.seenFirstNightWarning = true;
    notify();
    Save.write(state);
    this.show();
    return true;
  },

  show() {
    if (this.root) return;
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
      position: 'fixed',
      top: '0',
      left: '50%',
      transform: 'translate(-50%, -120%)',
      width: 'min(640px, 94vw)',
      padding: '22px 28px 18px',
      background: 'rgba(12, 10, 6, 0.88)',
      border: '1px solid rgba(255, 180, 80, 0.55)',
      borderRadius: '0 0 8px 8px',
      color: '#e5d9b6',
      fontFamily: 'Georgia, serif',
      zIndex: '70',
      boxShadow: '0 10px 40px rgba(0,0,0,0.55)',
      transition: 'transform 650ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      pointerEvents: 'auto',
    });

    // Soft pulse on the border via a keyframe animation (inline via CSS var).
    const style = document.createElement('style');
    style.textContent = `
      @keyframes hr-fnw-pulse {
        0% { box-shadow: 0 10px 40px rgba(0,0,0,0.55), 0 0 0 0 rgba(255, 180, 80, 0.45); }
        60% { box-shadow: 0 10px 40px rgba(0,0,0,0.55), 0 0 0 12px rgba(255, 180, 80, 0); }
        100% { box-shadow: 0 10px 40px rgba(0,0,0,0.55), 0 0 0 0 rgba(255, 180, 80, 0); }
      }
    `;
    document.head.appendChild(style);
    wrap.style.animation = 'hr-fnw-pulse 2800ms ease-in-out infinite';

    const title = document.createElement('div');
    title.textContent = 'It is night.';
    Object.assign(title.style, {
      fontStyle: 'italic',
      fontSize: '22px',
      marginBottom: '12px',
      color: '#ffcf8d',
    });
    wrap.appendChild(title);

    const p1 = document.createElement('div');
    p1.textContent =
      'The road belongs to others after dark. Goblins watch from the verge. They do not fight, but they will take what they can — gold, memories, promises, secrets, even years. They cannot follow you off the road, and they will not enter the caves.';
    Object.assign(p1.style, {
      fontStyle: 'italic',
      fontSize: '14px',
      lineHeight: '1.55',
      marginBottom: '10px',
    });
    wrap.appendChild(p1);

    const p2 = document.createElement('div');
    p2.textContent =
      'If the dark catches you on the road, run. Or step off it. Or find shelter. The choice is yours, but it is a choice.';
    Object.assign(p2.style, {
      fontStyle: 'italic',
      fontSize: '14px',
      lineHeight: '1.55',
      marginBottom: '16px',
    });
    wrap.appendChild(p2);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'I understand.';
    Object.assign(btn.style, {
      display: 'block',
      marginLeft: 'auto',
      padding: '6px 14px',
      background: 'rgba(255, 180, 80, 0.12)',
      border: '1px solid rgba(255, 180, 80, 0.45)',
      borderRadius: '3px',
      color: '#ffd79a',
      fontFamily: 'Georgia, serif',
      fontSize: '13px',
      fontVariant: 'small-caps',
      letterSpacing: '0.18em',
      cursor: 'pointer',
    });
    btn.addEventListener('click', () => this.dismiss());
    wrap.appendChild(btn);

    document.body.appendChild(wrap);
    requestAnimationFrame(() => {
      wrap.style.transform = 'translate(-50%, 18px)';
    });
    this.root = wrap;

    this._autoTimer = setTimeout(() => this.dismiss(), 12000);
  },

  dismiss() {
    if (!this.root) return;
    clearTimeout(this._autoTimer);
    this.root.style.transform = 'translate(-50%, -120%)';
    const wrap = this.root;
    this.root = null;
    setTimeout(() => wrap.remove(), 700);
    notify();
  },
};
