import { state, subscribe } from '../state.js';

// World compass — canvas-based rose displayed above the watch in the
// bottom-right corner. Shows which cardinal direction the player is facing.
//
// Coordinate system:
//   yaw = 0   → facing south  (-z, toward Ashwick)
//   yaw = π   → facing north  (+z, toward Westwind)
//   yaw = π/2 → facing west   (-x)
//   yaw = -π/2 → facing east  (+x)
//
// CSS rotation to put the player's heading at the top of the dial:
//   rot_deg = -(atan2(-sin(yaw), -cos(yaw)) * 180/π)

const SIZE = 70;

function ensureStyle() {
  if (document.getElementById('compass-ui-style')) return;
  const s = document.createElement('style');
  s.id = 'compass-ui-style';
  s.textContent = `
.compass-ui {
  position: fixed;
  right: 16px;
  bottom: 120px;
  width: ${SIZE}px;
  height: ${SIZE}px;
  z-index: 16;
  pointer-events: none;
  filter: drop-shadow(0 4px 10px rgba(0,0,0,0.55));
  transition: opacity 0.4s ease;
}
.compass-ui[hidden] { display: none; }
  `;
  document.head.appendChild(s);
}

export const Compass = {
  root: null,
  canvas: null,
  ctx: null,
  _raf: 0,
  _lastRenderMs: 0,

  mount() {
    ensureStyle();
    const root = document.createElement('div');
    root.className = 'compass-ui';
    root.hidden = true;

    const canvas = document.createElement('canvas');
    canvas.width = SIZE * 2;
    canvas.height = SIZE * 2;
    canvas.style.width = `${SIZE}px`;
    canvas.style.height = `${SIZE}px`;
    root.appendChild(canvas);

    document.getElementById('ui-root').appendChild(root);

    this.root = root;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    subscribe(() => this.syncVisibility());
    this.syncVisibility();

    const renderLoop = (now) => {
      if (!this._lastRenderMs || now - this._lastRenderMs > 50) {
        this._lastRenderMs = now;
        this.render();
      }
      this._raf = requestAnimationFrame(renderLoop);
    };
    this._raf = requestAnimationFrame(renderLoop);
  },

  syncVisibility() {
    if (!this.root) return;
    const show = state.currentScene === 'world' && state.flags?.hasLeftWestwind;
    this.root.hidden = !show;
  },

  render() {
    if (!this.root || this.root.hidden || !this.ctx) return;

    const yaw = state.cameraYaw ?? 0;
    const ctx = this.ctx;
    const dpi = 2;
    const size = SIZE * dpi;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 4 * dpi;

    ctx.clearRect(0, 0, size, size);

    // Outer brass ring
    const rim = ctx.createRadialGradient(cx, cy - r * 0.1, r * 0.4, cx, cy, r + 4 * dpi);
    rim.addColorStop(0, '#c89040');
    rim.addColorStop(0.8, '#7a4c1e');
    rim.addColorStop(1, '#1e0f06');
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4 * dpi, 0, Math.PI * 2);
    ctx.fill();

    // Dark face
    ctx.fillStyle = '#0e0905';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Subtle face vignette
    const vg = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
    vg.addColorStop(0, 'rgba(60,38,18,0.0)');
    vg.addColorStop(1, 'rgba(20,10,4,0.7)');
    ctx.fillStyle = vg;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Compass rose rotation: rotate the dial so current heading faces up.
    // rotDeg = -(atan2(-sin(yaw), -cos(yaw)) * 180/π)
    const rotDeg = -(Math.atan2(-Math.sin(yaw), -Math.cos(yaw)) * 180 / Math.PI);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotDeg * Math.PI / 180);

    // Cardinal tick marks and labels
    const cardinals = [
      { label: 'N', angle: 0,             color: '#e84040' },
      { label: 'E', angle: Math.PI / 2,   color: '#c8b880' },
      { label: 'S', angle: Math.PI,       color: '#c8b880' },
      { label: 'W', angle: -Math.PI / 2,  color: '#c8b880' },
    ];

    for (const { label, angle, color } of cardinals) {
      const cosA = Math.cos(angle - Math.PI / 2);
      const sinA = Math.sin(angle - Math.PI / 2);
      // Tick mark
      const inner = r - 12 * dpi;
      const outer = r - 4 * dpi;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5 * dpi;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cosA * inner, sinA * inner);
      ctx.lineTo(cosA * outer, sinA * outer);
      ctx.stroke();

      // Label
      ctx.fillStyle = color;
      ctx.font = `bold ${9 * dpi}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const labelR = r - 22 * dpi;
      ctx.fillText(label, cosA * labelR, sinA * labelR);
    }

    // Intercardinal marks (NE, SE, SW, NW) — shorter ticks
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const cosA = Math.cos(angle - Math.PI / 2);
      const sinA = Math.sin(angle - Math.PI / 2);
      ctx.strokeStyle = 'rgba(150,110,60,0.7)';
      ctx.lineWidth = 1.5 * dpi;
      const inner = r - 10 * dpi;
      const outer = r - 4 * dpi;
      ctx.beginPath();
      ctx.moveTo(cosA * inner, sinA * inner);
      ctx.lineTo(cosA * outer, sinA * outer);
      ctx.stroke();
    }

    ctx.restore();

    // Fixed north-indicator arrow (always points up = current heading).
    // A small orange triangle at the 12-o'clock position to show "you face this."
    const tipY = -(r - 14 * dpi);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#ff7a28';
    ctx.shadowColor = 'rgba(255,100,30,0.6)';
    ctx.shadowBlur = 4 * dpi;
    ctx.beginPath();
    ctx.moveTo(0, tipY);
    ctx.lineTo(-4 * dpi, tipY + 8 * dpi);
    ctx.lineTo(4 * dpi, tipY + 8 * dpi);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Center pin
    ctx.fillStyle = '#5a3a18';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5 * dpi, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c89040';
    ctx.beginPath();
    ctx.arc(cx, cy, 1.2 * dpi, 0, Math.PI * 2);
    ctx.fill();
  },
};
