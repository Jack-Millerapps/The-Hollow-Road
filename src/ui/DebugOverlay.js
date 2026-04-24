import { state, subscribe } from '../state.js';

function fmtBool(v) {
  return v ? 'yes' : 'no';
}

function safeStr(v) {
  try {
    if (v === null || v === undefined) return String(v);
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NaN';
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export const DebugOverlay = {
  el: null,
  _unsub: null,
  _lastErr: null,
  _ctxLost: false,
  _extra: {},

  mount({ canvas } = {}) {
    if (this.el) return;
    const el = document.createElement('div');
    el.id = 'debug-overlay';
    Object.assign(el.style, {
      position: 'fixed',
      left: '10px',
      bottom: '10px',
      zIndex: '9998',
      padding: '10px 12px',
      background: 'rgba(0,0,0,0.75)',
      border: '1px solid rgba(255,255,255,0.15)',
      color: '#e5d9b6',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: '11px',
      lineHeight: '1.35',
      maxWidth: 'min(520px, calc(100vw - 20px))',
      whiteSpace: 'pre-wrap',
      pointerEvents: 'none',
    });
    document.body.appendChild(el);
    this.el = el;

    // Capture runtime errors even if the render loop dies.
    window.addEventListener('error', (e) => {
      const msg = e?.error?.stack || e?.message || 'Unknown error';
      this._lastErr = String(msg);
      this.render();
    });
    window.addEventListener('unhandledrejection', (e) => {
      const msg = e?.reason?.stack || e?.reason || 'Unhandled rejection';
      this._lastErr = String(msg);
      this.render();
    });

    // WebGL context loss (renders as blank/white).
    if (canvas) {
      canvas.addEventListener(
        'webglcontextlost',
        (ev) => {
          ev.preventDefault?.();
          this._ctxLost = true;
          this.render();
        },
        false,
      );
      canvas.addEventListener(
        'webglcontextrestored',
        () => {
          this._ctxLost = false;
          this.render();
        },
        false,
      );
    }

    this._unsub = subscribe(() => this.render());
    this.render();
  },

  setExtra(extra) {
    this._extra = extra || {};
    this.render();
  },

  render() {
    if (!this.el) return;
    const lines = [];
    lines.push(`[scene] ${state.currentScene}`);
    lines.push(`[name] ${state.playerName ? 'set' : 'empty'}  [intro] ${fmtBool(state.hasSeenIntro)}`);
    lines.push(`[paused] ${fmtBool(state.timePaused)}  [dialogue] ${fmtBool(state.dialogueActive)}`);
    if (this._ctxLost) lines.push(`[webgl] CONTEXT LOST`);
    if (this._extra && Object.keys(this._extra).length) {
      for (const [k, v] of Object.entries(this._extra)) {
        lines.push(`[${k}] ${safeStr(v)}`);
      }
    }
    if (this._lastErr) {
      lines.push('');
      lines.push('--- last error ---');
      lines.push(this._lastErr);
    }
    this.el.textContent = lines.join('\n');
  },
};

