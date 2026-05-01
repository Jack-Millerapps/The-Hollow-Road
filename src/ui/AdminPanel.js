import { Travel } from '../game/Travel.js';
import { VillageBuilder } from '../scene/VillageBuilder.js';
import { state } from '../state.js';

// ---------------------------------------------------------------------------
// AdminPanel — F1 dev overlay
// ---------------------------------------------------------------------------

const TELEPORT_LOCATIONS = [
  { label: 'Westwind',         x: 0,     z: 500,    rot: Math.PI },
  { label: 'Ashwick',          x: 0,     z: -500,   rot: Math.PI },
  { label: 'Veil Market',      x: 34,    z: -2500,  rot: Math.PI },
  { label: 'Stonehush',        x: -800,  z: -5000,  rot: Math.PI },
  { label: 'Deeproot',         x: 600,   z: -6000,  rot: Math.PI },
  { label: 'Mirror Town',      x: 200,   z: -7800,  rot: Math.PI },
  { label: 'Unnamed Village',  x: 0,     z: -14500, rot: Math.PI },
];

const TOWN_KEYS = [
  { key: 'ashwick',    label: 'Ashwick'        },
  { key: 'veilMarket', label: 'Veil Market'    },
  { key: 'stonehush',  label: 'Stonehush'      },
  { key: 'deeproot',   label: 'Deeproot'       },
  { key: 'mirrorTown', label: 'Mirror Town'    },
  { key: 'unnamedTown',label: 'Unnamed Town'   },
];

const townScales = {};
TOWN_KEYS.forEach(({ key }) => { townScales[key] = 1; });

let _panel = null;
let _visible = false;
let _teleportFn = null;

function ensureStyle() {
  if (document.getElementById('admin-panel-style')) return;
  const s = document.createElement('style');
  s.id = 'admin-panel-style';
  s.textContent = `
#admin-panel {
  position: fixed;
  top: 20px;
  right: 20px;
  width: 300px;
  max-height: 90vh;
  overflow-y: auto;
  background: rgba(8, 5, 2, 0.96);
  border: 1px solid #c8903a;
  border-radius: 8px;
  padding: 14px 16px;
  color: #e8dcc8;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 13px;
  z-index: 999;
  box-shadow: 0 8px 32px rgba(0,0,0,0.8);
  pointer-events: auto;
}
#admin-panel h3 {
  margin: 0 0 12px;
  font-size: 14px;
  font-variant: small-caps;
  letter-spacing: 0.18em;
  color: #c8903a;
  text-align: center;
  border-bottom: 1px solid #3a2e1a;
  padding-bottom: 8px;
}
#admin-panel .adm-section {
  margin-bottom: 12px;
}
#admin-panel .adm-label {
  font-size: 11px;
  color: #8a7a60;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin-bottom: 6px;
}
#admin-panel button.adm-btn {
  background: rgba(40, 28, 12, 0.85);
  border: 1px solid #3a2e1a;
  border-radius: 4px;
  color: #e8dcc8;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 12px;
  padding: 5px 9px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
#admin-panel button.adm-btn:hover {
  background: rgba(80, 56, 20, 0.9);
  border-color: #c8903a;
}
#admin-panel button.adm-btn.active {
  background: rgba(120, 80, 20, 0.9);
  border-color: #c8903a;
  color: #ffd79a;
}
#admin-panel .adm-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 4px;
}
#admin-panel .adm-teleport-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
}
#admin-panel .adm-scale-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
}
#admin-panel .adm-scale-row span {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#admin-panel .adm-scale-val {
  width: 38px;
  text-align: center;
  color: #c8903a;
  font-size: 12px;
}
#admin-panel .adm-hint {
  font-size: 10px;
  color: #5a4a30;
  margin-top: 2px;
  font-style: italic;
}
`;
  document.head.appendChild(s);
}

function buildPanel() {
  ensureStyle();
  const el = document.createElement('div');
  el.id = 'admin-panel';

  el.innerHTML = `<h3>&#9998; Admin Panel <span style="font-size:10px;color:#5a4a30">[F1]</span></h3>`;

  // ---- Flying ----
  const flySection = document.createElement('div');
  flySection.className = 'adm-section';
  flySection.innerHTML = `<div class="adm-label">Flight</div>`;
  const flyRow = document.createElement('div');
  flyRow.className = 'adm-row';

  const flyBtn = document.createElement('button');
  flyBtn.className = 'adm-btn';
  flyBtn.textContent = 'Flying: OFF';
  flyBtn.onclick = () => {
    Travel.adminFlying = !Travel.adminFlying;
    if (Travel.adminFlying) {
      flyBtn.textContent = 'Flying: ON';
      flyBtn.classList.add('active');
    } else {
      flyBtn.textContent = 'Flying: OFF';
      flyBtn.classList.remove('active');
      // Reset to ground on landing
      if (Travel.player) {
        state.velocityY = 0;
        state.isGrounded = true;
      }
    }
  };

  const flyHint = document.createElement('div');
  flyHint.className = 'adm-hint';
  flyHint.textContent = 'Q = down  |  E = up';

  flyRow.appendChild(flyBtn);
  flySection.appendChild(flyRow);
  flySection.appendChild(flyHint);
  el.appendChild(flySection);

  // ---- Speed ----
  const speedSection = document.createElement('div');
  speedSection.className = 'adm-section';
  speedSection.innerHTML = `<div class="adm-label">Speed Multiplier</div>`;
  const speedRow = document.createElement('div');
  speedRow.className = 'adm-row';

  let activeSpeedBtn = null;
  [1, 2, 4, 8].forEach((mult) => {
    const b = document.createElement('button');
    b.className = 'adm-btn' + (mult === 1 ? ' active' : '');
    b.textContent = `${mult}x`;
    if (mult === 1) activeSpeedBtn = b;
    b.onclick = () => {
      Travel.adminSpeedMult = mult;
      if (activeSpeedBtn) activeSpeedBtn.classList.remove('active');
      b.classList.add('active');
      activeSpeedBtn = b;
    };
    speedRow.appendChild(b);
  });

  speedSection.appendChild(speedRow);
  el.appendChild(speedSection);

  // ---- Teleport ----
  const tpSection = document.createElement('div');
  tpSection.className = 'adm-section';
  tpSection.innerHTML = `<div class="adm-label">Teleport</div>`;
  const tpGrid = document.createElement('div');
  tpGrid.className = 'adm-teleport-grid';

  TELEPORT_LOCATIONS.forEach((loc) => {
    const b = document.createElement('button');
    b.className = 'adm-btn';
    b.textContent = loc.label;
    b.onclick = () => {
      if (_teleportFn) {
        _teleportFn(loc.x, loc.z, loc.rot);
      } else if (Travel.player) {
        Travel.player.position.x = loc.x;
        Travel.player.position.z = loc.z;
        Travel._yaw = loc.rot;
        Travel.player.rotation.y = loc.rot;
        state.playerPos = { x: loc.x, z: loc.z };
        state.cameraYaw = loc.rot;
        if (Travel._setCameraFromPlayer) Travel._setCameraFromPlayer();
      }
    };
    tpGrid.appendChild(b);
  });

  tpSection.appendChild(tpGrid);
  el.appendChild(tpSection);

  // ---- Town Size ----
  const townSection = document.createElement('div');
  townSection.className = 'adm-section';
  townSection.innerHTML = `<div class="adm-label">Town Scale</div>`;

  TOWN_KEYS.forEach(({ key, label }) => {
    const row = document.createElement('div');
    row.className = 'adm-scale-row';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = label;

    const valSpan = document.createElement('span');
    valSpan.className = 'adm-scale-val';
    valSpan.textContent = '1.0x';

    const minus = document.createElement('button');
    minus.className = 'adm-btn';
    minus.textContent = '−';
    minus.onclick = () => {
      townScales[key] = Math.max(0.5, parseFloat((townScales[key] - 0.5).toFixed(1)));
      valSpan.textContent = townScales[key].toFixed(1) + 'x';
      VillageBuilder.setScale(key, townScales[key]);
    };

    const plus = document.createElement('button');
    plus.className = 'adm-btn';
    plus.textContent = '+';
    plus.onclick = () => {
      townScales[key] = Math.min(10, parseFloat((townScales[key] + 0.5).toFixed(1)));
      valSpan.textContent = townScales[key].toFixed(1) + 'x';
      VillageBuilder.setScale(key, townScales[key]);
    };

    row.appendChild(nameSpan);
    row.appendChild(minus);
    row.appendChild(valSpan);
    row.appendChild(plus);
    townSection.appendChild(row);
  });

  el.appendChild(townSection);

  return el;
}

export const AdminPanel = {
  mount({ teleport } = {}) {
    if (_teleportFn === null && teleport) _teleportFn = teleport;

    window.addEventListener('keydown', (e) => {
      if (e.key === 'F1') {
        e.preventDefault();
        this.toggle();
      }
    });
  },

  toggle() {
    _visible = !_visible;
    if (_visible) {
      if (!_panel) {
        _panel = buildPanel();
        document.getElementById('ui-root')?.appendChild(_panel);
      }
      _panel.style.display = 'block';
      // Release pointer lock so mouse can interact with panel
      try { document.exitPointerLock?.(); } catch {}
    } else {
      if (_panel) _panel.style.display = 'none';
    }
  },
};
