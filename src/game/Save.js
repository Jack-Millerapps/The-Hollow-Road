import {
  state,
  notify,
  SAVE_VERSION,
  mergeDefaults,
  createDefaultState,
} from '../state.js';

const KEY = 'hollowRoadSave';

// When deleting save we must block writes until reload — otherwise the
// autosave interval can repopulate localStorage before navigation completes.
let _writesEnabled = true;

function cloneDeep(obj) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return {};
  }
}

function showMigrationNotice(fromVersion) {
  try {
    const el = document.createElement('div');
    el.textContent = `Save updated (v${fromVersion || 0} → v${SAVE_VERSION}). Progress carried over.`;
    Object.assign(el.style, {
      position: 'fixed',
      top: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '10px 18px',
      background: 'rgba(20, 16, 10, 0.92)',
      color: '#e5d9b6',
      fontFamily: 'Georgia, serif',
      fontSize: '14px',
      letterSpacing: '0.02em',
      border: '1px solid rgba(200, 170, 120, 0.35)',
      borderRadius: '2px',
      zIndex: '9999',
      opacity: '0',
      transition: 'opacity 500ms ease',
      pointerEvents: 'none',
    });
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = '1';
    });
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 600);
    }, 4200);
  } catch {
    /* no DOM yet */
  }
}

export const Save = {
  /** When false, `write()` is a no-op (used while wiping save before reload). */
  setWritesEnabled(on) {
    _writesEnabled = !!on;
  },

  exists() {
    try {
      return localStorage.getItem(KEY) !== null;
    } catch {
      return false;
    }
  },

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);

      data.seenRoadEvents = Array.isArray(data.seenRoadEvents)
        ? new Set(data.seenRoadEvents)
        : new Set();
      data.mapPieces = Array.isArray(data.mapPieces)
        ? new Set(data.mapPieces)
        : new Set();

      const savedVersion = Number(data.saveVersion || 0);
      mergeDefaults(data);
      if (savedVersion < SAVE_VERSION) {
        setTimeout(() => showMigrationNotice(savedVersion), 250);
      }
      data.saveVersion = SAVE_VERSION;
      return data;
    } catch (err) {
      console.warn('[Save] Failed to load:', err);
      return null;
    }
  },

  write(src = state) {
    if (!_writesEnabled) return false;
    try {
      const payload = {
        saveVersion: SAVE_VERSION,
        playerName: src.playerName ?? '',
        hasSeenIntro: !!src.hasSeenIntro,
        currentScene: src.currentScene ?? 'cutscene',
        playerPos: {
          x: src.playerPos?.x ?? 0,
          z: src.playerPos?.z ?? 0,
        },
        currencies: cloneDeep(src.currencies),
        reputation: cloneDeep(src.reputation),
        inventory: Array.isArray(src.inventory) ? src.inventory.slice() : [],
        items: cloneDeep(src.items),
        tradeComplete: cloneDeep(src.tradeComplete),
        spent: cloneDeep(src.spent),
        seenRoadEvents: src.seenRoadEvents
          ? Array.from(src.seenRoadEvents)
          : [],
        flags: cloneDeep(src.flags),
        gameTime: src.gameTime ?? 0,
        currentCaveId: src.currentCaveId ?? null,
        mapPieces: src.mapPieces ? Array.from(src.mapPieces) : [],
        mined: cloneDeep(src.mined),
        trollsTraded: Array.isArray(src.trollsTraded)
          ? src.trollsTraded.slice()
          : [],
        offRoad: !!src.offRoad,
        totalGoblinThefts: src.totalGoblinThefts ?? 0,
        tasksCompleted: Array.isArray(src.tasksCompleted)
          ? src.tasksCompleted.slice()
          : [],
        veilMarketSpawnCount: src.veilMarketSpawnCount ?? 0,
        playtimeSeconds: src.playtimeSeconds ?? 0,
        quests: cloneDeep(src.quests),
        cameraYaw: src.cameraYaw ?? 0,
        cameraPitch: src.cameraPitch ?? 0,
      };
      localStorage.setItem(KEY, JSON.stringify(payload));
      return true;
    } catch (err) {
      console.warn('[Save] Failed to write:', err);
      return false;
    }
  },

  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch (err) {
      console.warn('[Save] Failed to clear:', err);
    }
  },

  resetInMemory() {
    const d = createDefaultState();
    for (const key of Object.keys(d)) {
      state[key] = d[key];
    }
    notify();
  },

  apply(snapshot) {
    if (!snapshot) return;
    const passthrough = [
      'playerName',
      'hasSeenIntro',
      'currentScene',
      'gameTime',
      'currentCaveId',
      'offRoad',
      'totalGoblinThefts',
      'veilMarketSpawnCount',
      'playtimeSeconds',
      'cameraYaw',
      'cameraPitch',
    ];
    for (const k of passthrough) {
      if (snapshot[k] !== undefined) state[k] = snapshot[k];
    }
    if (snapshot.playerPos) {
      state.playerPos = {
        x: snapshot.playerPos.x ?? 0,
        z: snapshot.playerPos.z ?? 0,
      };
    }
    if (snapshot.currencies) Object.assign(state.currencies, snapshot.currencies);
    if (snapshot.reputation) Object.assign(state.reputation, snapshot.reputation);
    if (Array.isArray(snapshot.inventory)) state.inventory = snapshot.inventory.slice();
    if (snapshot.items) Object.assign(state.items, snapshot.items);
    if (snapshot.tradeComplete) Object.assign(state.tradeComplete, snapshot.tradeComplete);
    if (snapshot.spent) Object.assign(state.spent, snapshot.spent);
    if (snapshot.seenRoadEvents instanceof Set) {
      state.seenRoadEvents = new Set(snapshot.seenRoadEvents);
    } else if (Array.isArray(snapshot.seenRoadEvents)) {
      state.seenRoadEvents = new Set(snapshot.seenRoadEvents);
    }
    if (snapshot.flags) Object.assign(state.flags, snapshot.flags);
    if (snapshot.mapPieces instanceof Set) {
      state.mapPieces = new Set(snapshot.mapPieces);
    } else if (Array.isArray(snapshot.mapPieces)) {
      state.mapPieces = new Set(snapshot.mapPieces);
    }
    if (snapshot.mined && typeof snapshot.mined === 'object') {
      state.mined = { ...snapshot.mined };
    }
    if (Array.isArray(snapshot.trollsTraded)) {
      state.trollsTraded = snapshot.trollsTraded.slice();
    }
    if (Array.isArray(snapshot.tasksCompleted)) {
      state.tasksCompleted = snapshot.tasksCompleted.slice();
    }
    if (snapshot.quests && typeof snapshot.quests === 'object') {
      state.quests = cloneDeep(snapshot.quests);
    }
    notify();
  },
};
