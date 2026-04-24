import { villages } from '../data/villages.js';
import { ROAD_WAYPOINTS } from '../scene/Road.js';

const SIZE = 180;
const FULL_SIZE = 500;

// Phase 2 — minimap now spans from Westwind (z ~120) down to the ending
// threshold (z ~-200). Centered so the whole rescaled route fits.
const WORLD_X_MIN = -60;
const WORLD_X_MAX = 60;
const WORLD_Z_MIN = -210;
const WORLD_Z_MAX = 140;
const WORLD_W = WORLD_X_MAX - WORLD_X_MIN;
const WORLD_H = WORLD_Z_MAX - WORLD_Z_MIN;

function worldToMap(x, z, size) {
  // Preserve aspect by using the longer dimension for the map span.
  const span = Math.max(WORLD_W, WORLD_H);
  const scale = size / span;
  const offsetX = (span - WORLD_W) / 2;
  const offsetZ = (span - WORLD_H) / 2;
  return {
    x: (x - WORLD_X_MIN + offsetX) * scale,
    y: (z - WORLD_Z_MIN + offsetZ) * scale,
  };
}

const SEGMENTS = [];
for (let i = 0; i < ROAD_WAYPOINTS.length - 1; i++) {
  SEGMENTS.push([ROAD_WAYPOINTS[i], ROAD_WAYPOINTS[i + 1]]);
}
// Westwind dirt path marker (not cobblestone, but draw it so the hometown is
// visible on the map).
SEGMENTS.unshift([{ x: 0, z: 130 }, { x: 0, z: 110 }]);

function drawMap(ctx, size, playerPos, villagesArr, state, showAllLabels) {
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#0d0a06';
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.strokeStyle = '#3a2e1a';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const [s, e] of SEGMENTS) {
    const a = worldToMap(s.x, s.z, size);
    const b = worldToMap(e.x, e.z, size);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();

  const labelFontPx = size >= FULL_SIZE ? 14 : 9;
  for (const v of villagesArr) {
    const p = worldToMap(v.position.x, v.position.z, size);
    const visited = state.tradeComplete[v.name];

    ctx.save();
    if (visited) {
      ctx.shadowBlur = 6;
      ctx.shadowColor = '#c8903a';
      ctx.fillStyle = '#c8903a';
    } else {
      ctx.fillStyle = '#3a2e1a';
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (visited || showAllLabels) {
      ctx.fillStyle = '#8a7554';
      ctx.font = `${labelFontPx}px Georgia, serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(v.displayName, p.x + 8, p.y);
    }
  }

  if (playerPos) {
    const pp = worldToMap(playerPos.x, playerPos.z, size);
    ctx.fillStyle = '#e8dcc8';
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

export const Minimap = {
  canvas: null,
  ctx: null,
  hint: null,
  fullscreen: null,
  fullscreenCanvas: null,
  fullscreenCtx: null,
  open: false,
  lastPlayerPos: { x: 0, z: 0 },
  lastState: null,
  lastVillages: villages,

  mount() {
    const root = document.getElementById('ui-root');

    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    canvas.className = 'minimap';
    canvas.style.cssText = [
      'position: fixed',
      'top: 60px',
      'right: 16px',
      `width: ${SIZE}px`,
      `height: ${SIZE}px`,
      'background: #0d0a06',
      'border: 1px solid #3a2e1a',
      'border-radius: 8px',
      'z-index: 15',
      'pointer-events: auto',
    ].join(';');
    root.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    const hint = document.createElement('div');
    hint.textContent = 'M — map';
    hint.style.cssText = [
      'position: fixed',
      `top: ${60 + SIZE + 4}px`,
      'right: 18px',
      'font: 10px Georgia, serif',
      'font-variant: small-caps',
      'letter-spacing: 0.18em',
      'color: #8a7554',
      'z-index: 15',
      'pointer-events: none',
    ].join(';');
    root.appendChild(hint);
    this.hint = hint;

    // Phase 3 — the M-key fullscreen is now owned by src/ui/Map.js (the
    // ripped travel map). The corner minimap here remains always-on.
  },

  update(playerPos, villagesArr, state) {
    this.lastPlayerPos = playerPos;
    this.lastVillages = villagesArr;
    this.lastState = state;

    if (this.ctx) {
      drawMap(this.ctx, SIZE, playerPos, villagesArr, state, false);
    }
    if (this.open && this.fullscreenCtx) {
      drawMap(this.fullscreenCtx, FULL_SIZE, playerPos, villagesArr, state, true);
    }
  },

  toggleFullscreen() {
    if (this.open) this.closeFullscreen();
    else this.openFullscreen();
  },

  openFullscreen() {
    if (this.open) return;
    this.open = true;

    const wrap = document.createElement('div');
    wrap.style.cssText = [
      'position: fixed',
      'inset: 0',
      'background: rgba(0, 0, 0, 0.85)',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'z-index: 60',
      'pointer-events: auto',
    ].join(';');
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) this.closeFullscreen();
    });

    const canvas = document.createElement('canvas');
    canvas.width = FULL_SIZE;
    canvas.height = FULL_SIZE;
    canvas.style.cssText = [
      'background: #0d0a06',
      'border: 1px solid #3a2e1a',
      'border-radius: 8px',
    ].join(';');
    wrap.appendChild(canvas);

    document.body.appendChild(wrap);

    this.fullscreen = wrap;
    this.fullscreenCanvas = canvas;
    this.fullscreenCtx = canvas.getContext('2d');

    if (this.lastState) {
      drawMap(
        this.fullscreenCtx,
        FULL_SIZE,
        this.lastPlayerPos,
        this.lastVillages,
        this.lastState,
        true,
      );
    }
  },

  closeFullscreen() {
    this.open = false;
    if (this.fullscreen && this.fullscreen.parentNode) {
      this.fullscreen.parentNode.removeChild(this.fullscreen);
    }
    this.fullscreen = null;
    this.fullscreenCanvas = null;
    this.fullscreenCtx = null;
  },
};
