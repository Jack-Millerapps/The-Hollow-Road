import { state } from '../state.js';
import { Save } from '../game/Save.js';

// Small "Menu" button in the top-left that opens a pause overlay with
// Resume / Save & Quit / Delete Save. Only visible in world scenes.

function ensureStyle() {
  if (document.getElementById('pause-menu-style')) return;
  const style = document.createElement('style');
  style.id = 'pause-menu-style';
  style.textContent = `
.menu-button {
  position: fixed;
  top: 12px;
  left: 14px;
  z-index: 30;
  padding: 6px 16px;
  background: rgba(13, 10, 6, 0.82);
  border: 1px solid #3a2e1a;
  border-radius: 999px;
  color: #c8903a;
  font-family: Georgia, serif;
  font-size: 12px;
  font-variant: small-caps;
  letter-spacing: 0.24em;
  cursor: pointer;
  pointer-events: auto;
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}
.menu-button:hover {
  color: #e8dcc8;
  border-color: #c8903a;
  background: rgba(30, 22, 13, 0.9);
}
.pause-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 45;
  animation: inv-fade-in 0.3s ease;
}
.pause-panel {
  background: rgba(13, 10, 6, 0.96);
  border: 1px solid #3a2e1a;
  border-radius: 10px;
  padding: 32px 40px;
  width: min(420px, calc(100% - 40px));
  color: #e8dcc8;
  font-family: Georgia, serif;
  text-align: center;
}
.pause-panel h2 {
  margin: 0 0 6px;
  font-weight: normal;
  font-variant: small-caps;
  letter-spacing: 0.2em;
  color: #c8903a;
  font-size: 20px;
}
.pause-panel .sub {
  font-style: italic;
  color: #8a7554;
  margin: 0 0 22px;
  font-size: 13px;
}
.pause-buttons {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pause-panel button {
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
.pause-panel button:hover {
  background: rgba(50, 36, 20, 0.95);
  color: #e8dcc8;
  border-color: #8a6330;
}
.pause-panel button.danger {
  color: #a44a3a;
}
.pause-panel button.danger:hover {
  color: #e37555;
  border-color: #5c2e26;
}
  `;
  document.head.appendChild(style);
}

export const PauseMenu = {
  button: null,
  overlay: null,
  open: false,
  onPause: null,
  onResume: null,

  mount({ onPause, onResume } = {}) {
    ensureStyle();
    this.onPause = onPause;
    this.onResume = onResume;

    // The duplicate "Menu" text pill was removed in the HUD rebuild — the
    // HUD now owns the single top-left menu button. We keep PauseMenu as a
    // headless controller (openMenu / closeMenu) driven by HUD + Escape.
    this.button = null;

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open) {
        e.preventDefault();
        this.closeMenu();
      }
    });
  },

  // No-op — button visibility is now HUD-controlled.
  setVisible() {},

  openMenu() {
    if (this.open) return;
    this.open = true;
    if (this.onPause) this.onPause();

    const backdrop = document.createElement('div');
    backdrop.className = 'pause-backdrop';
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.closeMenu();
    });

    const panel = document.createElement('div');
    panel.className = 'pause-panel';

    const title = document.createElement('h2');
    title.textContent = 'The Road Pauses';
    panel.appendChild(title);
    const sub = document.createElement('p');
    sub.className = 'sub';
    sub.textContent = state.playerName
      ? `For ${state.playerName}.`
      : 'Only for a moment.';
    panel.appendChild(sub);

    const btns = document.createElement('div');
    btns.className = 'pause-buttons';

    const resumeBtn = document.createElement('button');
    resumeBtn.textContent = 'Resume';
    resumeBtn.addEventListener('click', () => this.closeMenu());
    btns.appendChild(resumeBtn);

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save & Quit';
    saveBtn.addEventListener('click', () => {
      Save.write(state);
      saveBtn.textContent = 'Saved. Refreshing...';
      setTimeout(() => {
        window.location.reload();
      }, 600);
    });
    btns.appendChild(saveBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'danger';
    delBtn.textContent = 'Delete Save';
    delBtn.addEventListener('click', () => {
      if (delBtn.dataset.confirm === '1') {
        Save.clear();
        delBtn.textContent = 'Deleted. Restarting...';
        setTimeout(() => window.location.reload(), 500);
      } else {
        delBtn.dataset.confirm = '1';
        delBtn.textContent = 'Click again to confirm';
      }
    });
    btns.appendChild(delBtn);

    panel.appendChild(btns);
    backdrop.appendChild(panel);
    document.getElementById('ui-root').appendChild(backdrop);
    this.overlay = backdrop;
  },

  closeMenu() {
    if (!this.open) return;
    this.open = false;
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null;
    if (this.onResume) this.onResume();
  },
};
