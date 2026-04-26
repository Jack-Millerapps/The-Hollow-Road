import { state } from '../state.js';
import { villages } from '../data/villages.js';
import { caves } from '../data/caves.js';
import { ROAD_WAYPOINTS } from '../scene/Road.js';

// ---------------------------------------------------------------------------
// Map — aged parchment on canvas, torn clip, hand-drawn roads, pan/zoom.
// ---------------------------------------------------------------------------

const SIZE = 640;

const WORLD_X_MIN = -1400;
const WORLD_X_MAX = 1400;
const WORLD_Z_MIN = -14800;
const WORLD_Z_MAX = 700;
const WORLD_W = WORLD_X_MAX - WORLD_X_MIN;

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

function hashString(s) {
  let h = 2166136261;
  const str = String(s || 'traveler');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTornClipPath(seed, inset = 6) {
  const rnd = mulberry32(seed);
  const pts = [];
  const steps = 28;
  for (let i = 0; i < steps; i++) {
    const ang = (i / steps) * Math.PI * 2;
    const wobble = inset + rnd() * 22;
    const px = 50 + Math.cos(ang) * (50 - wobble / 14);
    const py = 50 + Math.sin(ang) * (50 - wobble / 16);
    pts.push(`${px.toFixed(2)}% ${py.toFixed(2)}%`);
  }
  return `polygon(${pts.join(',')})`;
}

function buildCanvasTornPath(ctx, w, h, seed) {
  const rnd = mulberry32(seed ^ 0x9e3779b9);
  const marginMin = 18;
  const marginMax = 48;
  const n = 36;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const ang = t * Math.PI * 2;
    const m = marginMin + rnd() * (marginMax - marginMin);
    const x = w / 2 + Math.cos(ang) * (w / 2 - m - rnd() * 12);
    const y = h / 2 + Math.sin(ang) * (h / 2 - m - rnd() * 12);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawParchmentNoise(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    d[i] = Math.max(0, Math.min(255, 240 + n));
    d[i + 1] = Math.max(0, Math.min(255, 232 + n * 0.9));
    d[i + 2] = Math.max(0, Math.min(255, 208 + n * 0.7));
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function waypointCumulativeLengths() {
  const cum = [0];
  for (let i = 0; i < ROAD_WAYPOINTS.length - 1; i++) {
    const a = ROAD_WAYPOINTS[i];
    const b = ROAD_WAYPOINTS[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    cum.push(cum[cum.length - 1] + len);
  }
  return cum;
}

const _CUM_LEN = waypointCumulativeLengths();

function playerRoadArcLength(px, pz) {
  let bestD = Infinity;
  let bestArc = 0;
  for (let i = 0; i < ROAD_WAYPOINTS.length - 1; i++) {
    const a = ROAD_WAYPOINTS[i];
    const b = ROAD_WAYPOINTS[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz;
    if (l2 < 1e-8) continue;
    let t = ((px - a.x) * dx + (pz - a.z) * dz) / l2;
    t = Math.max(0, Math.min(1, t));
    const qx = a.x + t * dx;
    const qz = a.z + t * dz;
    const d = Math.hypot(px - qx, pz - qz);
    if (d < bestD) {
      bestD = d;
      const segLen = Math.sqrt(l2);
      bestArc = _CUM_LEN[i] + t * segLen;
    }
  }
  return bestArc;
}

function nextDestinationAhead(px, pz) {
  let best = null;
  let bestD = Infinity;
  for (const v of villages) {
    if (v.placeholder) continue;
    if (v.position.z >= pz - 40) continue;
    const d = Math.hypot(v.position.x - px, v.position.z - pz);
    if (d < bestD) {
      bestD = d;
      best = { x: v.position.x, z: v.position.z };
    }
  }
  for (const c of caves) {
    if (c.position.z >= pz - 40) continue;
    const d = Math.hypot(c.position.x - px, c.position.z - pz);
    if (d < bestD) {
      bestD = d;
      best = { x: c.position.x, z: c.position.z };
    }
  }
  if (!best) {
    const last = ROAD_WAYPOINTS[ROAD_WAYPOINTS.length - 1];
    return { x: last.x, z: last.z };
  }
  return best;
}

function computeFitViewport() {
  const revealed = REGIONS.filter((r) => isRegionRevealed(r));
  if (revealed.length >= REGIONS.length - 1) {
    return {
      zMin: WORLD_Z_MIN,
      zMax: WORLD_Z_MAX,
      xMin: WORLD_X_MIN,
      xMax: WORLD_X_MAX,
    };
  }
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

export const Map = {
  open: false,
  backdrop: null,
  panel: null,
  canvas: null,
  ctx: null,
  _raf: 0,
  _view: {
    centerX: 0,
    centerZ: 0,
    halfSpan: 1200,
  },
  _drag: null,
  _clipSeed: 1,
  _panelClip: '',

  mount() {
    window.addEventListener('keydown', (e) => {
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

  _defaultView() {
    const px = state.playerPos?.x ?? 0;
    const pz = state.playerPos?.z ?? 0;
    const next = nextDestinationAhead(px, pz);
    const dist = Math.hypot(next.x - px, next.z - pz);
    const span = Math.max(380, Math.min(dist * 1.35, 3200));
    this._view.centerX = px;
    this._view.centerZ = pz;
    this._view.halfSpan = span;
  },

  _fitAllView() {
    const vp = computeFitViewport();
    const w = vp.xMax - vp.xMin;
    const h = vp.zMax - vp.zMin;
    const span = Math.max(w, h) * 0.55;
    this._view.centerX = (vp.xMin + vp.xMax) / 2;
    this._view.centerZ = (vp.zMin + vp.zMax) / 2;
    this._view.halfSpan = Math.max(span, 400);
  },

  openPanel() {
    if (this.open) return;
    if (!state.items.ripMap) {
      showNoMapToast();
      return;
    }
    this.open = true;

    if (!document.getElementById('map-hand-fonts')) {
      const link = document.createElement('link');
      link.id = 'map-hand-fonts';
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@500;600&family=Satisfy&display=swap';
      document.head.appendChild(link);
    }

    this._clipSeed = hashString(state.playerName);
    this._panelClip = buildTornClipPath(this._clipSeed + 11);
    this._defaultView();

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

    const panel = document.createElement('div');
    panel.style.cssText = [
      'position: relative',
      'padding: 18px',
      'background: transparent',
      'filter: drop-shadow(0 14px 28px rgba(0,0,0,0.55))',
      'transform: rotate(1.4deg)',
      'clip-path: ' + this._panelClip,
      'max-width: 96vmin',
      'max-height: 96vmin',
    ].join(';');

    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    canvas.style.cssText = [
      'display: block',
      'background: transparent',
      'max-width: 88vmin',
      'max-height: 88vmin',
      'cursor: crosshair',
      'touch-action: none',
    ].join(';');

    const fitBtn = document.createElement('button');
    fitBtn.type = 'button';
    fitBtn.textContent = 'Fit all';
    Object.assign(fitBtn.style, {
      position: 'absolute',
      right: '12px',
      bottom: '12px',
      padding: '6px 12px',
      font: '11px Georgia, serif',
      fontVariant: 'small-caps',
      letterSpacing: '0.2em',
      color: '#c8903a',
      background: 'rgba(12, 10, 6, 0.75)',
      border: '1px solid rgba(200, 170, 120, 0.45)',
      borderRadius: '2px',
      cursor: 'pointer',
      zIndex: '2',
    });
    fitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._fitAllView();
    });

    const hint = document.createElement('div');
    hint.textContent = 'Scroll — zoom · Drag — pan · M / Esc — close';
    hint.style.cssText = [
      'position: absolute',
      'bottom: -36px',
      'left: 50%',
      'transform: translateX(-50%)',
      'font: 11px Georgia, serif',
      'font-variant: small-caps',
      'letter-spacing: 0.18em',
      'color: #8a7554',
      'pointer-events: none',
      'white-space: nowrap',
    ].join(';');

    let dragging = false;
    let lx = 0;
    let ly = 0;
    canvas.addEventListener('mousedown', (e) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.open || !dragging) return;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
      const span = this._view.halfSpan * 2;
      const scale = span / SIZE;
      this._view.centerX -= dx * scale;
      this._view.centerZ -= dy * scale;
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.open) return;
        e.preventDefault();
        const dir = e.deltaY > 0 ? 1.08 : 1 / 1.08;
        let span = this._view.halfSpan * dir;
        const minH = 220;
        const maxH = WORLD_W * 2;
        span = Math.max(minH, Math.min(maxH, span));
        this._view.halfSpan = span;
      },
      { passive: false },
    );

    panel.appendChild(canvas);
    panel.appendChild(fitBtn);
    panel.appendChild(hint);
    wrap.appendChild(panel);
    document.body.appendChild(wrap);

    this.backdrop = wrap;
    this.panel = panel;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    const loop = () => {
      if (!this.open) return;
      this.render();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  },

  close() {
    if (!this.open) return;
    this.open = false;
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this.backdrop && this.backdrop.parentNode) {
      this.backdrop.parentNode.removeChild(this.backdrop);
    }
    this.backdrop = null;
    this.panel = null;
    this.canvas = null;
    this.ctx = null;
  },

  render() {
    if (!this.ctx) return;
    draw(
      this.ctx,
      SIZE,
      performance.now(),
      this._view,
      this._clipSeed,
    );
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

function worldToCanvas(x, z, size, view) {
  const span = view.halfSpan * 2;
  const sx = size / span;
  return {
    x: (x - view.centerX) * sx + size / 2,
    y: (z - view.centerZ) * sx + size / 2,
  };
}

function jitter(rnd, v) {
  return v + (rnd() - 0.5) * 2;
}

function draw(ctx, size, timeMs, view, clipSeed) {
  const rnd = mulberry32(clipSeed);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, size, size);

  ctx.save();
  buildCanvasTornPath(ctx, size, size, clipSeed);
  ctx.clip();

  ctx.fillStyle = '#f0e8d0';
  ctx.fillRect(0, 0, size, size);
  drawParchmentNoise(ctx, size, size);

  for (let s = 0; s < 4; s++) {
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#2a1810';
    ctx.beginPath();
    ctx.ellipse(
      rnd() * size,
      rnd() * size,
      30 + rnd() * 90,
      22 + rnd() * 70,
      rnd() * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.strokeStyle = 'rgba(42, 28, 14, 0.55)';
  ctx.lineWidth = 1;
  for (let f = 0; f < 3; f++) {
    const x0 = rnd() * size;
    const y0 = rnd() * size;
    const ang = -0.35 + rnd() * 0.7;
    const len = size * 1.4;
    ctx.beginPath();
    ctx.moveTo(x0 - Math.cos(ang) * len, y0 - Math.sin(ang) * len);
    ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
    ctx.stroke();
  }
  ctx.restore();

  const px = state.playerPos?.x ?? 0;
  const pz = state.playerPos?.z ?? 0;
  const playerArc = playerRoadArcLength(px, pz);

  ctx.save();
  ctx.strokeStyle = '#3a2010';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.setLineDash([4, 2]);

  for (let i = 0; i < ROAD_WAYPOINTS.length - 1; i++) {
    const a = ROAD_WAYPOINTS[i];
    const b = ROAD_WAYPOINTS[i + 1];
    const regionA = REGIONS.find((r) => pointInRegion(a.x, a.z, r));
    const regionB = REGIONS.find((r) => pointInRegion(b.x, b.z, r));
    const revealed =
      (regionA && isRegionRevealed(regionA)) ||
      (regionB && isRegionRevealed(regionB));
    if (!revealed) continue;

    const midArc = (_CUM_LEN[i] + _CUM_LEN[i + 1]) / 2;
    const visited = midArc <= playerArc + 40;
    ctx.globalAlpha = visited ? 1 : 0.25;

    const rndSeg = mulberry32(clipSeed + i * 374761393);
    const steps = 10;
    ctx.beginPath();
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const wx = a.x + (b.x - a.x) * t;
      const wz = a.z + (b.z - a.z) * t;
      const pa = worldToCanvas(
        jitter(rndSeg, wx),
        jitter(rndSeg, wz),
        size,
        view,
      );
      if (s === 0) ctx.moveTo(pa.x, pa.y);
      else ctx.lineTo(pa.x, pa.y);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();

  const pulse = 0.85 + Math.sin(timeMs * 0.004) * 0.12;

  for (const v of villages) {
    const region = REGIONS.find((r) =>
      pointInRegion(v.position.x, v.position.z, r),
    );
    if (!region || !isRegionRevealed(region)) continue;
    const visitedVillage = !!state.tradeComplete?.[v.name];
    const p = worldToCanvas(v.position.x, v.position.z, size, view);
    ctx.save();
    if (visitedVillage) {
      ctx.fillStyle = '#c9a050';
      ctx.strokeStyle = '#6a4a18';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 8);
      ctx.lineTo(p.x, p.y + 8);
      ctx.moveTo(p.x - 8, p.y);
      ctx.lineTo(p.x + 8, p.y);
      ctx.stroke();
      ctx.font =
        '600 15px "Dancing Script", "Satisfy", Georgia, serif';
      ctx.fillStyle = '#3a2010';
      ctx.textBaseline = 'bottom';
      ctx.fillText(v.displayName || v.name, p.x + 10, p.y - 4);
    } else {
      ctx.strokeStyle = 'rgba(58, 32, 16, 0.35)';
      ctx.fillStyle = 'rgba(58, 32, 16, 0.25)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = 'italic 16px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('?', p.x, p.y + 5);
      ctx.textAlign = 'start';
    }
    ctx.restore();
  }

  for (const c of caves) {
    const region = REGIONS.find((r) =>
      pointInRegion(c.position.x, c.position.z, r),
    );
    if (!region || !isRegionRevealed(region)) continue;
    const p = worldToCanvas(c.position.x, c.position.z, size, view);
    const visitedCave =
      !!state.mined?.[c.id] ||
      (Array.isArray(state.trollsTraded) &&
        state.trollsTraded.includes(c.id));
    ctx.save();
    ctx.fillStyle = visitedCave ? '#3a3834' : 'rgba(58, 56, 52, 0.35)';
    ctx.strokeStyle = visitedCave ? '#2a2824' : 'rgba(42, 40, 38, 0.4)';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 7);
    ctx.lineTo(p.x + 7, p.y + 5);
    ctx.lineTo(p.x - 7, p.y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (visitedCave) {
      ctx.font =
        '600 14px "Dancing Script", "Satisfy", Georgia, serif';
      ctx.fillStyle = '#3a2010';
      ctx.textBaseline = 'bottom';
      ctx.fillText(c.name, p.x + 10, p.y - 2);
    } else {
      ctx.beginPath();
      ctx.arc(p.x + 18, p.y - 8, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = 'italic 12px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('?', p.x + 18, p.y - 5);
      ctx.textAlign = 'start';
    }
    ctx.restore();
  }

  ctx.save();
  for (const region of REGIONS) {
    if (isRegionRevealed(region)) continue;
    const zTop = Math.max(region.zMin, view.centerZ - view.halfSpan);
    const zBot = Math.min(region.zMax, view.centerZ + view.halfSpan);
    if (zBot <= zTop) continue;
    const topLeft = worldToCanvas(
      view.centerX - view.halfSpan,
      zBot,
      size,
      view,
    );
    const bottomRight = worldToCanvas(
      view.centerX + view.halfSpan,
      zTop,
      size,
      view,
    );
    const x0 = Math.min(topLeft.x, bottomRight.x);
    const y0 = Math.min(topLeft.y, bottomRight.y);
    const w = Math.abs(bottomRight.x - topLeft.x);
    const h = Math.abs(bottomRight.y - topLeft.y);
    const g = ctx.createLinearGradient(x0, y0, x0, y0 + h);
    g.addColorStop(0, 'rgba(34, 30, 26, 0.82)');
    g.addColorStop(1, 'rgba(20, 18, 16, 0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = 'rgba(160, 140, 108, 0.28)';
    ctx.font = 'bold 36px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x0 + w / 2, y0 + h / 2);
    ctx.textAlign = 'start';
  }
  ctx.restore();

  if (state.currentScene === 'world' && state.playerPos) {
    const p = worldToCanvas(state.playerPos.x, state.playerPos.z, size, view);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(pulse, pulse);
    ctx.strokeStyle = '#8b4518';
    ctx.fillStyle = 'rgba(200, 160, 90, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(2.5, -3);
    ctx.lineTo(9, -2);
    ctx.lineTo(3.5, 2);
    ctx.lineTo(5.5, 9);
    ctx.lineTo(0, 5);
    ctx.lineTo(-5.5, 9);
    ctx.lineTo(-3.5, 2);
    ctx.lineTo(-9, -2);
    ctx.lineTo(-2.5, -3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = '#3a2010';
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = '#3a2518';
  ctx.font = 'italic 20px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('The Hollow Road', size / 2, 36);
  ctx.font = '11px Georgia, serif';
  ctx.fillStyle = 'rgba(58, 37, 24, 0.75)';
  ctx.fillText(
    `${revealedCount() - 1} / ${REGIONS.length - 1} regions revealed`,
    size / 2,
    size - 18,
  );
  ctx.textAlign = 'start';
  ctx.restore();

  ctx.restore();
}
