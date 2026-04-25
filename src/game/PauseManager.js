import { state, notify } from '../state.js';
import { Save } from './Save.js';

// ---------------------------------------------------------------------------
// PauseManager — centralized pause control for The Hollow Road.
//
// Owns: state.paused (this module's local), state.timePaused (for DayNight),
// pointer-lock release/re-acquire, and the pause DOM overlay (built lazily).
//
// Public API:
//   PauseManager.pause()    — pause + show overlay + release pointer + freeze time
//   PauseManager.resume()   — resume + hide overlay + re-lock pointer + unfreeze time
//   PauseManager.toggle()   — pause/resume based on current state
//   PauseManager.isPaused() — boolean
// ---------------------------------------------------------------------------

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700&display=swap';

function ensureFont() {
  if (document.getElementById('pm-cinzel-font')) return;
  const link = document.createElement('link');
  link.id = 'pm-cinzel-font';
  link.rel = 'stylesheet';
  link.href = FONT_HREF;
  document.head.appendChild(link);
}

function ensureStyle() {
  if (document.getElementById('pause-manager-style')) return;
  const s = document.createElement('style');
  s.id = 'pause-manager-style';
  s.textContent = `
.pm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.78);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
  opacity: 0;
  transition: opacity 0.18s ease;
  pointer-events: auto;
}
.pm-backdrop.shown { opacity: 1; }
.pm-panel {
  background: rgba(13, 10, 6, 0.96);
  border: 1px solid #3a2e1a;
  border-radius: 10px;
  padding: 32px 44px;
  width: min(380px, calc(100% - 40px));
  text-align: center;
  color: #e8dcc8;
  font-family: Georgia, serif;
  box-shadow: 0 12px 60px rgba(0, 0, 0, 0.7);
}
.pm-title {
  margin: 0 0 24px;
  font-family: 'Cinzel Decorative', 'Cinzel', Georgia, serif;
  font-weight: 400;
  font-size: 28px;
  letter-spacing: 0.18em;
  color: #c8903a;
}
.pm-buttons {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pm-btn {
  background: rgba(30, 22, 13, 0.75);
  border: 1px solid #3a2e1a;
  border-radius: 6px;
  color: #c8903a;
  padding: 12px 16px;
  font-family: Georgia, serif;
  font-size: 14px;
  font-variant: small-caps;
  letter-spacing: 0.18em;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.pm-btn:hover {
  background: rgba(50, 36, 20, 0.95);
  color: #e8dcc8;
  border-color: #8a6330;
}
.pm-toast {
  margin-top: 16px;
  font-size: 12px;
  font-style: italic;
  color: #8a7554;
  min-height: 16px;
}
  `;
  document.head.appendChild(s);
}

let _overlay = null;
let _toastEl = null;
let _toastTimer = 0;
let _canvas = null;

function buildOverlay() {
  ensureFont();
  ensureStyle();

  const backdrop = document.createElement('div');
  backdrop.className = 'pm-backdrop';

  const panel = document.createElement('div');
  panel.className = 'pm-panel';

  const title = document.createElement('h2');
  title.className = 'pm-title';
  title.textContent = 'Paused';
  panel.appendChild(title);

  const btns = document.createElement('div');
  btns.className = 'pm-buttons';

  const resumeBtn = document.createElement('button');
  resumeBtn.className = 'pm-btn';
  resumeBtn.textContent = 'Resume';
  resumeBtn.addEventListener('click', () => PauseManager.resume());
  btns.appendChild(resumeBtn);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'pm-btn';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', () => {
    Save.write(state);
    showToast('Saved.', 1500);
  });
  btns.appendChild(saveBtn);

  const quitBtn = document.createElement('button');
  quitBtn.className = 'pm-btn';
  quitBtn.textContent = 'Quit to Menu';
  quitBtn.addEventListener('click', () => quitToMenu());
  btns.appendChild(quitBtn);

  panel.appendChild(btns);

  const toast = document.createElement('div');
  toast.className = 'pm-toast';
  toast.textContent = '';
  panel.appendChild(toast);
  _toastEl = toast;

  backdrop.appendChild(panel);
  return backdrop;
}

function showToast(msg, durationMs = 1500) {
  if (!_toastEl) return;
  _toastEl.textContent = msg;
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    _toastEl.textContent = '';
    _toastTimer = 0;
  }, durationMs);
}

function quitToMenu() {
  try {
    if (document.pointerLockElement) document.exitPointerLock?.();
  } catch {}
  let fade = document.getElementById('fade-overlay');
  if (!fade) {
    fade = document.createElement('div');
    fade.id = 'fade-overlay';
    Object.assign(fade.style, {
      position: 'fixed',
      inset: '0',
      background: '#000',
      opacity: '0',
      zIndex: '70',
      pointerEvents: 'none',
    });
    document.body.appendChild(fade);
  }
  fade.style.transition = 'opacity 600ms ease';
  // Force a reflow before flipping opacity so the transition runs.
  // eslint-disable-next-line no-unused-expressions
  fade.offsetWidth;
  fade.style.opacity = '1';
  setTimeout(() => window.location.reload(), 700);
}

function showOverlay() {
  if (!_overlay) _overlay = buildOverlay();
  if (!_overlay.parentNode) {
    const root = document.getElementById('ui-root') || document.body;
    root.appendChild(_overlay);
  }
  // Allow the next frame to apply the .shown class so the transition runs.
  requestAnimationFrame(() => {
    if (_overlay) _overlay.classList.add('shown');
  });
}

function hideOverlay() {
  if (!_overlay) return;
  _overlay.classList.remove('shown');
  if (_overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
}

export const PauseManager = {
  setCanvas(canvas) {
    _canvas = canvas;
  },

  isPaused() {
    return !!state.paused;
  },

  pause() {
    if (state.paused) return;
    state.paused = true;
    state.timePaused = true;
    try {
      if (document.pointerLockElement) document.exitPointerLock?.();
    } catch {}
    showOverlay();
    notify();
  },

  resume() {
    if (!state.paused) return;
    state.paused = false;
    state.timePaused = false;
    hideOverlay();
    // Re-lock the pointer if we're back in a world/cave scene.
    const sc = state.currentScene;
    if (sc === 'world' || sc === 'cave') {
      try {
        const target = _canvas || document.querySelector('canvas');
        target?.requestPointerLock?.();
      } catch {}
    }
    notify();
  },

  toggle() {
    if (state.paused) this.resume();
    else this.pause();
  },
};
