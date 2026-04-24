// Simple FPS counter. Visible only if the URL has ?debug=1.
// Mounted top-left below the menu button.

export const FPSCounter = {
  el: null,
  _last: 0,
  _frames: 0,
  _acc: 0,
  _enabled: false,

  mount() {
    try {
      this._enabled = new URLSearchParams(window.location.search).get('debug') === '1';
    } catch {
      this._enabled = false;
    }
    if (!this._enabled) return;
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      top: '68px',
      left: '18px',
      padding: '4px 10px',
      background: 'rgba(0,0,0,0.7)',
      color: '#7effd1',
      font: '12px/1 "Courier New", monospace',
      borderRadius: '2px',
      zIndex: '60',
      pointerEvents: 'none',
    });
    el.textContent = 'FPS —';
    document.getElementById('ui-root').appendChild(el);
    this.el = el;
    this._last = performance.now();
  },

  tick() {
    if (!this._enabled || !this.el) return;
    const now = performance.now();
    const dt = now - this._last;
    this._last = now;
    this._acc += dt;
    this._frames++;
    if (this._acc >= 250) {
      const fps = (this._frames * 1000) / this._acc;
      this.el.textContent = `FPS ${fps.toFixed(1)}`;
      this.el.style.color = fps < 30 ? '#ff7070' : fps < 55 ? '#ffcf5f' : '#7effd1';
      this._frames = 0;
      this._acc = 0;
    }
  },
};
