import { state, notify } from '../state.js';
import { Save } from '../game/Save.js';

// Shared UI for currency exchangers. Each destination exchanger drives this
// panel via open({ title, body, rows }) where rows are pre-computed trade
// offers (label + onClick) — this keeps per-exchanger logic close to the
// NPC that owns it (see Exchanger.js).

export const ExchangePanel = {
  root: null,

  open({ title, body, rows, onClose }) {
    this.close();
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(0,0,0,0.78)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '55',
    });
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) {
        this.close();
        onClose?.();
      }
    });
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      width: 'min(480px, 92vw)',
      padding: '22px 26px',
      background: 'rgba(16, 12, 6, 0.96)',
      border: '1px solid rgba(200, 170, 120, 0.4)',
      borderRadius: '4px',
      color: '#e5d9b6',
      fontFamily: 'Georgia, serif',
    });
    const ttl = document.createElement('div');
    ttl.textContent = title;
    Object.assign(ttl.style, {
      fontStyle: 'italic',
      fontSize: '20px',
      marginBottom: '8px',
      color: '#ffd79a',
    });
    panel.appendChild(ttl);
    if (body) {
      const b = document.createElement('div');
      b.textContent = body;
      Object.assign(b.style, {
        fontSize: '14px',
        lineHeight: '1.55',
        fontStyle: 'italic',
        opacity: '0.85',
        marginBottom: '16px',
      });
      panel.appendChild(b);
    }
    for (const row of rows) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = row.label;
      Object.assign(btn.style, {
        display: 'block',
        width: '100%',
        margin: '6px 0',
        padding: '9px 12px',
        textAlign: 'left',
        background: 'rgba(200, 170, 120, 0.07)',
        border: '1px solid rgba(200, 170, 120, 0.28)',
        borderRadius: '3px',
        color: '#e5d9b6',
        fontFamily: 'Georgia, serif',
        fontSize: '14px',
        cursor: row.disabled ? 'not-allowed' : 'pointer',
        opacity: row.disabled ? '0.4' : '1',
      });
      btn.disabled = !!row.disabled;
      btn.addEventListener('click', () => {
        row.onClick?.();
      });
      panel.appendChild(btn);
    }
    const close = document.createElement('button');
    close.textContent = 'Leave';
    Object.assign(close.style, {
      display: 'block',
      marginLeft: 'auto',
      marginTop: '14px',
      padding: '6px 12px',
      background: 'transparent',
      border: '1px solid rgba(200, 170, 120, 0.4)',
      borderRadius: '3px',
      color: '#c8b07a',
      fontFamily: 'Georgia, serif',
      fontSize: '12px',
      fontVariant: 'small-caps',
      letterSpacing: '0.18em',
      cursor: 'pointer',
    });
    close.addEventListener('click', () => {
      this.close();
      onClose?.();
    });
    panel.appendChild(close);

    wrap.appendChild(panel);
    document.body.appendChild(wrap);
    this.root = wrap;
  },

  refresh(opts) {
    this.open(opts);
  },

  close() {
    if (this.root) {
      this.root.remove();
      this.root = null;
    }
  },
};

export function applyExchange({ giveType, giveAmount, getType, getAmount }) {
  if ((state.currencies[giveType] ?? 0) < giveAmount) return false;
  state.currencies[giveType] -= giveAmount;
  state.currencies[getType] = (state.currencies[getType] ?? 0) + getAmount;
  state.spent[giveType] = (state.spent[giveType] ?? 0) + giveAmount;
  notify();
  Save.write(state);
  return true;
}
