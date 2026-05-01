import { state, notify } from '../state.js';
import { Save } from '../game/Save.js';

// Small non-pausing popup when the player walks homeward on the road (~+Z).

export const RoadWhisperPopup = {
  root: null,
  _autoTimer: null,

  maybeShow() {
    if (state.flags?.seenWrongWayWhisper) return false;
    state.flags.seenWrongWayWhisper = true;
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
      left: '50%',
      bottom: '22px',
      transform: 'translate(-50%, 120%)',
      width: 'min(720px, 94vw)',
      padding: '16px 18px',
      background: 'rgba(12, 10, 6, 0.88)',
      border: '1px solid rgba(200, 144, 58, 0.55)',
      borderRadius: '10px',
      color: '#e5d9b6',
      fontFamily: 'Georgia, serif',
      zIndex: '70',
      boxShadow: '0 10px 40px rgba(0,0,0,0.55)',
      transition: 'transform 520ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 420ms ease',
      pointerEvents: 'auto',
      opacity: '1',
    });

    const title = document.createElement('div');
    title.textContent = '…something whispers';
    Object.assign(title.style, {
      fontVariant: 'small-caps',
      letterSpacing: '0.22em',
      color: 'rgba(200, 170, 130, 0.75)',
      fontSize: '11px',
      marginBottom: '8px',
      opacity: '0.92',
    });
    wrap.appendChild(title);

    const body = document.createElement('div');
    body.textContent =
      "Don't turn back—not yet. The road still runs ahead of you.";
    Object.assign(body.style, {
      fontStyle: 'italic',
      fontSize: '14px',
      lineHeight: '1.55',
      color: 'rgba(255, 215, 170, 0.88)',
      letterSpacing: '0.02em',
      fontWeight: '300',
    });
    wrap.appendChild(body);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '…';
    Object.assign(btn.style, {
      marginTop: '12px',
      marginLeft: 'auto',
      display: 'block',
      padding: '6px 12px',
      background: 'rgba(255, 180, 80, 0.12)',
      border: '1px solid rgba(255, 180, 80, 0.45)',
      borderRadius: '6px',
      color: '#ffd79a',
      fontFamily: 'Georgia, serif',
      fontSize: '13px',
      cursor: 'pointer',
    });
    btn.addEventListener('click', () => this.dismiss());
    wrap.appendChild(btn);

    document.body.appendChild(wrap);
    requestAnimationFrame(() => {
      wrap.style.transform = 'translate(-50%, 0)';
    });
    this.root = wrap;

    this._autoTimer = setTimeout(() => this.dismiss(), 8000);
  },

  dismiss() {
    if (!this.root) return;
    clearTimeout(this._autoTimer);
    this.root.style.opacity = '0';
    this.root.style.transform = 'translate(-50%, 120%)';
    const el = this.root;
    this.root = null;
    setTimeout(() => el.remove(), 600);
  },
};

