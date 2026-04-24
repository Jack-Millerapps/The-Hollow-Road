import { state } from '../state.js';
import { villages } from '../data/villages.js';
import { caves } from '../data/caves.js';
import { ROAD_WAYPOINTS } from '../scene/Road.js';

// ---------------------------------------------------------------------------
// Phase 3 — Ripped travel map. Press M to open fullscreen.
//
// The player's map starts mostly blank. As trolls grant map pieces, regions
// reveal in order along the road. Unrevealed regions render as foggy gray
// with '?' markers.
// ---------------------------------------------------------------------------

const SIZE = 640;

const WORLD_X_MIN = -60;
const WORLD_X_MAX = 60;
const WORLD_Z_MIN = -210;
const WORLD_Z_MAX = 140;
const WORLD_W = WORLD_X_MAX - WORLD_X_MIN;
const WORLD_H = WORLD_Z_MAX - WORLD_Z_MIN;

function worldToMap(x, z, size) {
  const span = Math.max(WORLD_W, WORLD_H);
  const scale = size / span;
  const offX = (span - WORLD_W) / 2;
  const offZ = (span - WORLD_H) / 2;
  return {
    x: (x - WORLD_X_MIN + offX) * scale,
    y: (z - WORLD_Z_MIN + offZ) * scale,
  };
}

// Revealed "regions" along the Z axis. A region spans from one waypoint z
// to the next; unlocking a piece clears fog for that region.
//
// By default only the Westwind + ashCave + Ashwick region is visible (it's
// the first stretch the player sees). Each subsequent piece extends south.
const REGIONS = [
  {
    id: 'start', // always revealed from the beginning
    zMin: 70,
    zMax: 140,
    label: 'The Home Road',
    includesVillages: ['ashwick'],
    includesCaves: ['ashCave'],
  },
  {
    id: 'ashwickPiece',
    zMin: 35,
    zMax: 70,
    label: 'The Market Road',
    includesVillages: ['veilMarket'],
    includesCaves: ['veilCave'],
  },
  {
    id: 'veilPiece',
    zMin: -5,
    zMax: 35,
    label: 'The Silent Road',
    includesVillages: ['stonehush'],
    includesCaves: ['stoneCave'],
  },
  {
    id: 'stonePiece',
    zMin: -60,
    zMax: -5,
    label: 'The Root Road',
    includesVillages: ['deeproot'],
    includesCaves: ['deepCave'],
  },
  {
    id: 'deepPiece',
    zMin: -110,
    zMax: -60,
    label: 'The Glass Road',
    includesVillages: ['mirrorTown'],
    includesCaves: ['mirrorCave'],
  },
  {
    id: 'mirrorPiece',
    zMin: -155,
    zMax: -110,
    label: 'The Last Road',
    includesVillages: [],
    includesCaves: ['endCave'],
  },
  {
    id: 'endPiece',
    zMin: WORLD_Z_MIN,
    zMax: -155,
    label: 'The Unnamed',
    includesVillages: ['unnamed'],
    includesCaves: [],
  },
];

function isRegionRevealed(region) {
  if (region.id === 'start') return true;
  const pieces = state.mapPieces;
  if (!pieces) return false;
  if (pieces instanceof Set) return pieces.has(region.id);
  return Array.isArray(pieces) && pieces.includes(region.id);
}

function pointInRegion(x, z, region) {
  return z >= region.zMin && z <= region.zMax;
}

function draw(ctx, size) {
  ctx.clearRect(0, 0, size, size);

  // Parchment background.
  const grd = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.15,
    size / 2,
    size / 2,
    size * 0.65,
  );
  grd.addColorStop(0, '#e9d4a8');
  grd.addColorStop(1, '#8a6a48');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);

  // Torn ragged border.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  const m = 24;
  const step = 18;
  ctx.moveTo(m, m);
  for (let x = m; x < size - m; x += step) {
    const jitter = (Math.sin(x * 0.37) + 1) * 5;
    ctx.lineTo(x, m + jitter);
  }
  for (let y = m; y < size - m; y += step) {
    const jitter = (Math.sin(y * 0.29) + 1) * 5;
    ctx.lineTo(size - m - jitter, y);
  }
  for (let x = size - m; x > m; x -= step) {
    const jitter = (Math.sin(x * 0.41) + 1) * 5;
    ctx.lineTo(x, size - m - jitter);
  }
  for (let y = size - m; y > m; y -= step) {
    const jitter = (Math.sin(y * 0.33) + 1) * 5;
    ctx.lineTo(m + jitter, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Road drawn only through revealed regions.
  ctx.save();
  ctx.strokeStyle = '#3a2514';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (let i = 0; i < ROAD_WAYPOINTS.length - 1; i++) {
    const a = ROAD_WAYPOINTS[i];
    const b = ROAD_WAYPOINTS[i + 1];
    const regionA = REGIONS.find((r) => pointInRegion(a.x, a.z, r));
    const regionB = REGIONS.find((r) => pointInRegion(b.x, b.z, r));
    const revealed =
      (regionA && isRegionRevealed(regionA)) ||
      (regionB && isRegionRevealed(regionB));
    if (!revealed) continue;
    const pa = worldToMap(a.x, a.z, size);
    const pb = worldToMap(b.x, b.z, size);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }
  ctx.restore();

  // Villages.
  for (const v of villages) {
    const region = REGIONS.find((r) => pointInRegion(v.position.x, v.position.z, r));
    if (!region || !isRegionRevealed(region)) continue;
    const p = worldToMap(v.position.x, v.position.z, size);
    ctx.save();
    ctx.fillStyle = '#3a1818';
    ctx.strokeStyle = '#2a0e08';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2a1608';
    ctx.font = 'italic 14px Georgia, serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(v.displayName, p.x + 10, p.y);
    ctx.restore();
  }

  // Caves.
  for (const c of caves) {
    const region = REGIONS.find((r) => pointInRegion(c.position.x, c.position.z, r));
    if (!region || !isRegionRevealed(region)) continue;
    const p = worldToMap(c.position.x, c.position.z, size);
    ctx.save();
    ctx.fillStyle = '#2a1608';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 6);
    ctx.lineTo(p.x + 6, p.y + 5);
    ctx.lineTo(p.x - 6, p.y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#5a3a18';
    ctx.font = '11px Georgia, serif';
    ctx.fillText(c.name, p.x + 10, p.y + 2);
    ctx.restore();
  }

  // Fog over unrevealed regions.
  ctx.save();
  for (const region of REGIONS) {
    if (isRegionRevealed(region)) continue;
    const topLeft = worldToMap(WORLD_X_MIN, region.zMax, size);
    const bottomRight = worldToMap(WORLD_X_MAX, region.zMin, size);
    const x0 = Math.min(topLeft.x, bottomRight.x);
    const y0 = Math.min(topLeft.y, bottomRight.y);
    const w = Math.abs(bottomRight.x - topLeft.x);
    const h = Math.abs(bottomRight.y - topLeft.y);
    const g = ctx.createLinearGradient(x0, y0, x0, y0 + h);
    g.addColorStop(0, 'rgba(34, 30, 26, 0.85)');
    g.addColorStop(1, 'rgba(20, 18, 16, 0.92)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = 'rgba(160, 140, 108, 0.35)';
    ctx.font = 'bold 42px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x0 + w / 2, y0 + h / 2);
    ctx.textAlign = 'start';
  }
  ctx.restore();

  // Player marker (only if in world and in a revealed region).
  if (state.currentScene === 'world' && state.playerPos) {
    const region = REGIONS.find((r) =>
      pointInRegion(state.playerPos.x, state.playerPos.z, r),
    );
    if (region && isRegionRevealed(region)) {
      const p = worldToMap(state.playerPos.x, state.playerPos.z, size);
      ctx.save();
      ctx.fillStyle = '#c22a1a';
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#ff7a40';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Title.
  ctx.save();
  ctx.fillStyle = '#2a1608';
  ctx.font = 'italic 22px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('The Hollow Road', size / 2, 50);
  ctx.textAlign = 'start';
  ctx.restore();
}

export const Map = {
  open: false,
  backdrop: null,
  canvas: null,
  ctx: null,

  mount() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        this.toggle();
      } else if (e.key === 'Escape' && this.open) {
        e.preventDefault();
        this.close();
      }
    });
  },

  toggle() {
    if (this.open) this.close();
    else this.openPanel();
  },

  openPanel() {
    if (this.open) return;
    // Only useful if the player has the ripped map.
    if (!state.items.ripMap) {
      // A short-lived toast: tell them they don't have a map yet.
      showNoMapToast();
      return;
    }
    this.open = true;

    const wrap = document.createElement('div');
    wrap.style.cssText = [
      'position: fixed',
      'inset: 0',
      'background: rgba(0, 0, 0, 0.88)',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'z-index: 60',
      'pointer-events: auto',
    ].join(';');
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) this.close();
    });

    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    canvas.style.cssText = [
      'background: transparent',
      'max-width: 92vmin',
      'max-height: 92vmin',
      'filter: drop-shadow(0 10px 40px rgba(0,0,0,0.6))',
    ].join(';');
    wrap.appendChild(canvas);

    const hint = document.createElement('div');
    hint.textContent = 'M / Esc — close';
    hint.style.cssText = [
      'position: absolute',
      'bottom: 24px',
      'left: 50%',
      'transform: translateX(-50%)',
      'font: 12px Georgia, serif',
      'font-variant: small-caps',
      'letter-spacing: 0.22em',
      'color: #8a7554',
      'pointer-events: none',
    ].join(';');
    wrap.appendChild(hint);

    document.body.appendChild(wrap);
    this.backdrop = wrap;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.render();
  },

  close() {
    if (!this.open) return;
    this.open = false;
    if (this.backdrop && this.backdrop.parentNode) {
      this.backdrop.parentNode.removeChild(this.backdrop);
    }
    this.backdrop = null;
    this.canvas = null;
    this.ctx = null;
  },

  render() {
    if (!this.ctx) return;
    draw(this.ctx, SIZE);
  },
};

let _toastTimer = 0;
function showNoMapToast() {
  let el = document.getElementById('map-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'map-toast';
    el.style.cssText = [
      'position: fixed',
      'top: 38%',
      'left: 50%',
      'transform: translate(-50%, -50%)',
      'padding: 14px 22px',
      'background: rgba(13, 10, 6, 0.92)',
      'border: 1px solid #3a2e1a',
      'border-radius: 6px',
      'color: #c8903a',
      'font-family: Georgia, serif',
      'font-style: italic',
      'z-index: 70',
      'opacity: 0',
      'transition: opacity 0.3s ease',
      'pointer-events: none',
    ].join(';');
    el.textContent = "You don't have a map to read.";
    document.body.appendChild(el);
  }
  clearTimeout(_toastTimer);
  el.style.opacity = '1';
  _toastTimer = setTimeout(() => {
    el.style.opacity = '0';
  }, 1400);
}
