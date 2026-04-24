import { state } from '../state.js';
import { villages } from '../data/villages.js';
import { caves } from '../data/caves.js';
import { ROAD_WAYPOINTS } from '../scene/Road.js';

// ---------------------------------------------------------------------------
// Map — consolidation patch. The world is ~16,500 units long; we zoom to the
// player's currently-revealed regions and pan the canvas accordingly.
// Only regions the player has unlocked (via map pieces) are drawn; everything
// else is fogged out with a '?'.
// ---------------------------------------------------------------------------

const SIZE = 640;

// World bounds for the new scale.
const WORLD_X_MIN = -1400;
const WORLD_X_MAX = 1400;
const WORLD_Z_MIN = -14800;
const WORLD_Z_MAX = 700;
const WORLD_W = WORLD_X_MAX - WORLD_X_MIN;
const WORLD_H = WORLD_Z_MAX - WORLD_Z_MIN;

// A region is a band along Z, keyed to a map piece the player must earn.
const REGIONS = [
  {
    id: 'start',
    zMin: -500,
    zMax: 700,
    label: 'The Home Road',
    includesVillages: ['ashwick'],
    includesCaves: ['ashCave'],
  },
  {
    id: 'ashwickPiece',
    zMin: -2500,
    zMax: -500,
    label: 'The Market Road',
    includesVillages: ['veilMarket'],
    includesCaves: ['veilCave'],
  },
  {
    id: 'veilPiece',
    zMin: -5000,
    zMax: -2500,
    label: 'The Silent Road',
    includesVillages: ['stonehush'],
    includesCaves: ['stoneCave'],
  },
  {
    id: 'stonePiece',
    zMin: -6000,
    zMax: -5000,
    label: 'The Root Road',
    includesVillages: ['deeproot'],
    includesCaves: ['deepCave'],
  },
  {
    id: 'deepPiece',
    zMin: -7800,
    zMax: -6000,
    label: 'The Glass Road',
    includesVillages: ['mirrorTown'],
    includesCaves: ['mirrorCave'],
  },
  {
    id: 'mirrorPiece',
    zMin: -13000,
    zMax: -7800,
    label: 'The Long Road',
    includesVillages: [],
    includesCaves: ['endCave'],
  },
  {
    id: 'endPiece',
    zMin: WORLD_Z_MIN,
    zMax: -13000,
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

function revealedCount() {
  return REGIONS.filter((r) => isRegionRevealed(r)).length;
}

function pointInRegion(x, z, region) {
  return z >= region.zMin && z <= region.zMax;
}

// Dynamic viewport: by default show the player's current region plus 1 above,
// zoomed to the player. Once you have many map pieces, zoom out to the whole
// route.
function computeViewport() {
  const revealed = REGIONS.filter((r) => isRegionRevealed(r));
  if (revealed.length >= REGIONS.length - 1) {
    return {
      zMin: WORLD_Z_MIN,
      zMax: WORLD_Z_MAX,
      xMin: WORLD_X_MIN,
      xMax: WORLD_X_MAX,
    };
  }
  // Center on the player; show revealed surrounding territory.
  const pz = state.playerPos?.z ?? 0;
  const rangeZ = 3500;
  const rangeX = 900;
  return {
    zMin: pz - rangeZ,
    zMax: pz + rangeZ / 2,
    xMin: -rangeX,
    xMax: rangeX,
  };
}

function worldToMap(x, z, size, vp) {
  const w = vp.xMax - vp.xMin;
  const h = vp.zMax - vp.zMin;
  const span = Math.max(w, h);
  const scale = size / span;
  const offX = (span - w) / 2;
  const offZ = (span - h) / 2;
  return {
    x: (x - vp.xMin + offX) * scale,
    y: (z - vp.zMin + offZ) * scale,
  };
}

function draw(ctx, size) {
  ctx.clearRect(0, 0, size, size);
  const vp = computeViewport();

  const grd = ctx.createRadialGradient(
    size / 2, size / 2, size * 0.15,
    size / 2, size / 2, size * 0.65,
  );
  grd.addColorStop(0, '#e9d4a8');
  grd.addColorStop(1, '#8a6a48');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);

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
    const pa = worldToMap(a.x, a.z, size, vp);
    const pb = worldToMap(b.x, b.z, size, vp);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }
  ctx.restore();

  for (const v of villages) {
    const region = REGIONS.find((r) => pointInRegion(v.position.x, v.position.z, r));
    if (!region || !isRegionRevealed(region)) continue;
    const p = worldToMap(v.position.x, v.position.z, size, vp);
    ctx.save();
    ctx.fillStyle = '#3a1818';
    ctx.strokeStyle = '#2a0e08';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2a1608';
    ctx.font = 'italic 13px Georgia, serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(v.displayName, p.x + 10, p.y);
    ctx.restore();
  }

  for (const c of caves) {
    const region = REGIONS.find((r) => pointInRegion(c.position.x, c.position.z, r));
    if (!region || !isRegionRevealed(region)) continue;
    const p = worldToMap(c.position.x, c.position.z, size, vp);
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

  // Fog over unrevealed regions (visible in current viewport only).
  ctx.save();
  for (const region of REGIONS) {
    if (isRegionRevealed(region)) continue;
    const zTop = Math.max(region.zMin, vp.zMin);
    const zBot = Math.min(region.zMax, vp.zMax);
    if (zBot <= zTop) continue;
    const topLeft = worldToMap(vp.xMin, zBot, size, vp);
    const bottomRight = worldToMap(vp.xMax, zTop, size, vp);
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

  if (state.currentScene === 'world' && state.playerPos) {
    const p = worldToMap(state.playerPos.x, state.playerPos.z, size, vp);
    ctx.save();
    ctx.fillStyle = '#c22a1a';
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#ff7a40';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = '#2a1608';
  ctx.font = 'italic 22px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('The Hollow Road', size / 2, 50);
  ctx.font = '12px Georgia, serif';
  ctx.fillText(
    `${revealedCount() - 1} / ${REGIONS.length - 1} regions revealed`,
    size / 2,
    size - 22,
  );
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
      // Don't steal keys while the player is typing into an input (e.g. name entry).
      const a = document.activeElement;
      const typing =
        a &&
        (a.tagName === 'INPUT' ||
          a.tagName === 'TEXTAREA' ||
          a.isContentEditable);
      if (typing) return;
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
    if (!state.items.ripMap) {
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
