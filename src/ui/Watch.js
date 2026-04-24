import { state, subscribe } from '../state.js';
import { DayNight, CYCLE_LENGTH } from '../scene/DayNight.js';

// Analog pocket-watch in the bottom-right corner. Hidden unless the player
// owns the watch item. A full rotation of the hour hand equals one full
// day/night cycle (CYCLE_LENGTH seconds).

const SIZE = 90;

function ensureStyle() {
  if (document.getElementById('watch-ui-style')) return;
  const s = document.createElement('style');
  s.id = 'watch-ui-style';
  s.textContent = `
.watch-ui {
  position: fixed;
  right: 16px;
  bottom: 16px;
  width: ${SIZE}px;
  height: ${SIZE}px;
  z-index: 16;
  pointer-events: auto;
  filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.55));
  cursor: default;
  transition: opacity 0.4s ease, transform 0.4s ease;
}
.watch-ui[hidden] { display: none; }
.watch-ui .tooltip {
  position: absolute;
  right: 100%;
  bottom: 50%;
  transform: translate(-10px, 50%);
  padding: 6px 10px;
  background: rgba(13, 10, 6, 0.92);
  border: 1px solid #3a2e1a;
  border-radius: 6px;
  color: #e8dcc8;
  font-family: Georgia, serif;
  font-size: 11px;
  font-variant: small-caps;
  letter-spacing: 0.14em;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}
.watch-ui:hover .tooltip { opacity: 1; }
  `;
  document.head.appendChild(s);
}

function mixHex(hex, tint, k) {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  const tr = ((tint >> 16) & 0xff) / 255;
  const tg = ((tint >> 8) & 0xff) / 255;
  const tb = (tint & 0xff) / 255;
  return `rgb(${Math.round((r + (tr - r) * k) * 255)}, ${Math.round(
    (g + (tg - g) * k) * 255,
  )}, ${Math.round((b + (tb - b) * k) * 255)})`;
}

const PHASE_TINTS = {
  day: 0xfff0d0,
  sunset: 0xffb060,
  night: 0x6a84c8,
  sunrise: 0xffc88a,
};

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r}s`;
  return `${m}m ${r}s`;
}

export const Watch = {
  root: null,
  canvas: null,
  ctx: null,
  tooltip: null,
  _raf: 0,

  mount() {
    ensureStyle();
    const root = document.createElement('div');
    root.className = 'watch-ui';
    root.hidden = true;

    const canvas = document.createElement('canvas');
    canvas.width = SIZE * 2; // crisp on HiDPI
    canvas.height = SIZE * 2;
    canvas.style.width = `${SIZE}px`;
    canvas.style.height = `${SIZE}px`;
    root.appendChild(canvas);

    const tip = document.createElement('div');
    tip.className = 'tooltip';
    tip.textContent = '';
    root.appendChild(tip);

    document.getElementById('ui-root').appendChild(root);

    this.root = root;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tooltip = tip;

    subscribe(() => this.syncVisibility());
    this.syncVisibility();

    // Clock hands move slowly (one revolution per 8.5-minute cycle). Redrawing
    // the gradient-heavy canvas at 60fps is pure waste — 5Hz is indistinguish-
    // able from realtime for this UI.
    this._lastRenderMs = 0;
    const renderLoop = (now) => {
      if (!this._lastRenderMs || now - this._lastRenderMs > 200) {
        this._lastRenderMs = now;
        this.render();
      }
      this._raf = requestAnimationFrame(renderLoop);
    };
    this._raf = requestAnimationFrame(renderLoop);
  },

  syncVisibility() {
    if (!this.root) return;
    const shouldShow =
      !!state.items?.watch && state.currentScene === 'world';
    this.root.hidden = !shouldShow;
  },

  render() {
    if (!this.root || this.root.hidden || !this.ctx) return;
    const info = DayNight.getPhaseInfo();
    const time = state.gameTime || 0;

    // Hand angles (0 rad = 12 o'clock; clockwise).
    const cycleFrac = (((time % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH) / CYCLE_LENGTH;
    const hourAngle = cycleFrac * Math.PI * 2;
    const minuteAngle = ((time * 10) / CYCLE_LENGTH) * Math.PI * 2;

    const ctx = this.ctx;
    const dpi = 2;
    const size = SIZE * dpi;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 6 * dpi;

    ctx.clearRect(0, 0, size, size);

    // Brass rim (outer gradient ring)
    const rim = ctx.createRadialGradient(cx, cy - r * 0.1, r * 0.5, cx, cy, r + 4 * dpi);
    rim.addColorStop(0, '#d8a258');
    rim.addColorStop(0.75, '#8c5a24');
    rim.addColorStop(1, '#2c1a0c');
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4 * dpi, 0, Math.PI * 2);
    ctx.fill();

    // Inner bezel
    ctx.fillStyle = '#1a1208';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Cream face — tinted by phase
    const tintHex = PHASE_TINTS[info.phase.name] ?? 0xfff0d0;
    const face = ctx.createRadialGradient(cx, cy - r * 0.2, r * 0.15, cx, cy, r - 2 * dpi);
    face.addColorStop(0, mixHex(0xfff5d8, tintHex, 0.35));
    face.addColorStop(1, mixHex(0xd4b078, tintHex, 0.45));
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2 * dpi, 0, Math.PI * 2);
    ctx.fill();

    // Subtle vignette on the face
    const vg = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r);
    vg.addColorStop(0, 'rgba(60, 40, 20, 0)');
    vg.addColorStop(1, 'rgba(40, 24, 10, 0.45)');
    ctx.fillStyle = vg;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2 * dpi, 0, Math.PI * 2);
    ctx.fill();

    // Four phase marks (12/3/6/9 → Day/Sunset/Night/Sunrise)
    const markAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    const markColors = ['#8a5a20', '#b86428', '#1a1a2e', '#b88a3c'];
    for (let i = 0; i < 4; i++) {
      const a = markAngles[i];
      const inner = r - 10 * dpi;
      const outer = r - 3 * dpi;
      const x1 = cx + Math.sin(a) * inner;
      const y1 = cy - Math.cos(a) * inner;
      const x2 = cx + Math.sin(a) * outer;
      const y2 = cy - Math.cos(a) * outer;
      ctx.strokeStyle = markColors[i];
      ctx.lineWidth = 2.5 * dpi;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    // Minor ticks every 30°
    ctx.strokeStyle = 'rgba(60, 40, 20, 0.6)';
    ctx.lineWidth = 1 * dpi;
    for (let i = 0; i < 12; i++) {
      if (i % 3 === 0) continue;
      const a = (i / 12) * Math.PI * 2;
      const inner = r - 7 * dpi;
      const outer = r - 3 * dpi;
      const x1 = cx + Math.sin(a) * inner;
      const y1 = cy - Math.cos(a) * inner;
      const x2 = cx + Math.sin(a) * outer;
      const y2 = cy - Math.cos(a) * outer;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Minute hand (slimmer)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(minuteAngle);
    ctx.strokeStyle = '#2a1a0c';
    ctx.lineWidth = 1.6 * dpi;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 4 * dpi);
    ctx.lineTo(0, -(r - 14 * dpi));
    ctx.stroke();
    ctx.restore();

    // Hour hand
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(hourAngle);
    ctx.strokeStyle = '#1a0f08';
    ctx.lineWidth = 2.8 * dpi;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 5 * dpi);
    ctx.lineTo(0, -(r - 24 * dpi));
    ctx.stroke();
    ctx.restore();

    // Center pin
    ctx.fillStyle = '#2a1a0c';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5 * dpi, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8a258';
    ctx.beginPath();
    ctx.arc(cx, cy, 1.2 * dpi, 0, Math.PI * 2);
    ctx.fill();

    // Update tooltip text
    if (this.tooltip) {
      const phaseName = info.phase.name;
      if (phaseName === 'night') {
        const remaining = info.phase.duration * (1 - info.progress);
        this.tooltip.textContent = `Dawn in ${formatDuration(remaining)}`;
      } else {
        const until = DayNight.timeUntilNight();
        this.tooltip.textContent = `Time until night: ${formatDuration(until)}`;
      }
    }
  },
};
