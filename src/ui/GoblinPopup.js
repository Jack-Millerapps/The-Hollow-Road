// Center-screen dark-red panel that shows for 2.5s after a goblin steals from
// the player. Auto-dismisses, no interaction required.

function ensureStyle() {
  if (document.getElementById('goblin-popup-style')) return;
  const s = document.createElement('style');
  s.id = 'goblin-popup-style';
  s.textContent = `
.goblin-popup {
  position: fixed;
  top: 42%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.96);
  background: linear-gradient(180deg, rgba(48, 8, 8, 0.94), rgba(28, 4, 4, 0.94));
  border: 1px solid #6a1818;
  border-radius: 8px;
  padding: 18px 26px;
  min-width: 300px;
  max-width: 520px;
  color: #f5d0c2;
  font-family: Georgia, 'Times New Roman', serif;
  font-style: italic;
  text-align: center;
  line-height: 1.5;
  font-size: 15px;
  z-index: 55;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55), 0 0 18px rgba(180, 30, 30, 0.25);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.goblin-popup.show {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}
.goblin-popup .accent {
  display: block;
  font-variant: small-caps;
  font-style: normal;
  letter-spacing: 0.2em;
  color: #e25a4a;
  font-size: 11px;
  margin-bottom: 6px;
}
  `;
  document.head.appendChild(s);
}

export const GoblinPopup = {
  el: null,
  timer: 0,

  mount() {
    ensureStyle();
  },

  show(amount, currency) {
    ensureStyle();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = 0;
    }
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    const el = document.createElement('div');
    el.className = 'goblin-popup';
    const accent = document.createElement('span');
    accent.className = 'accent';
    accent.textContent = '— a thief in the dark —';
    const text = document.createElement('div');
    text.textContent = `A goblin snatched ${amount} ${currency} from you and disappeared into the dark.`;
    el.appendChild(accent);
    el.appendChild(text);
    const root = document.getElementById('ui-root') || document.body;
    root.appendChild(el);
    this.el = el;
    requestAnimationFrame(() => el.classList.add('show'));
    this.timer = setTimeout(() => this.hide(), 2500);
  },

  hide() {
    if (!this.el) return;
    this.el.classList.remove('show');
    const el = this.el;
    this.el = null;
    setTimeout(() => {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }, 350);
  },
};
