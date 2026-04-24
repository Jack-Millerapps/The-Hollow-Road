import {
  state,
  notify,
  SAVE_VERSION,
  mergeDefaults,
  createDefaultState,
} from '../state.js';

const KEY = 'hollowRoadSave';

function cloneRecord(obj) {
  const out = {};
  for (const k of Object.keys(obj || {})) out[k] = obj[k];
  return out;
}

// Lightweight migration notice — a single toast that fades itself out. Built
// without any ui/ dependency so it is safe to call from Save.load() before
// the main HUD has mounted.
function showMigrationNotice(fromVersion) {
  try {
    const el = document.createElement('div');
    el.textContent =
      fromVersion === 0
        ? 'Save format updated. Your progress has been carried over.'
        : `Save format updated (v${fromVersion} → v${SAVE_VERSION}). Your progress has been carried over.`;
    Object.assign(el.style, {
      position: 'fixed',
      top: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '10px 18px',
      background: 'rgba(20, 16, 10, 0.92)',
      color: '#e5d9b6',
      fontFamily: 'Georgia, "Times New Roman", serif',
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
    // no DOM yet — silently skip
  }
}

export const Save = {
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

      // Rehydrate Sets.
      data.seenRoadEvents = Array.isArray(data.seenRoadEvents)
        ? new Set(data.seenRoadEvents)
        : new Set();
      data.mapPieces = Array.isArray(data.mapPieces)
        ? new Set(data.mapPieces)
        : new Set();

      // Migration: merge in defaults for any new Phase 4 fields.
      const savedVersion = Number(data.saveVersion || 0);
      mergeDefaults(data);
      if (savedVersion < SAVE_VERSION) {
        // Notice runs async so we don't block the load.
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
        currencies: cloneRecord(src.currencies),
        reputation: cloneRecord(src.reputation),
        inventory: Array.isArray(src.inventory) ? src.inventory.slice() : [],
        items: cloneRecord(src.items),
        tradeComplete: cloneRecord(src.tradeComplete),
        spent: cloneRecord(src.spent),
        seenRoadEvents: src.seenRoadEvents
          ? Array.from(src.seenRoadEvents)
          : [],
        flags: cloneRecord(src.flags),
        gameTime: src.gameTime ?? 0,
        // -- Phase 3 ----------------------------------------------------------
        currentCaveId: src.currentCaveId ?? null,
        mapPieces: src.mapPieces ? Array.from(src.mapPieces) : [],
        mined: cloneRecord(src.mined),
        trollsTraded: Array.isArray(src.trollsTraded)
          ? src.trollsTraded.slice()
          : [],
        offRoad: !!src.offRoad,
        // -- Phase 4 ----------------------------------------------------------
        totalGoblinThefts: src.totalGoblinThefts ?? 0,
        tasksCompleted: Array.isArray(src.tasksCompleted)
          ? src.tasksCompleted.slice()
          : [],
        veilMarketSpawnCount: src.veilMarketSpawnCount ?? 0,
        mapShopsUsed: Array.isArray(src.mapShopsUsed)
          ? src.mapShopsUsed.slice()
          : [],
        playtimeSeconds: src.playtimeSeconds ?? 0,
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

  // Wipe in-memory state back to defaults. Used by the Epilogue "New Journey"
  // button before the page reloads.
  resetInMemory() {
    const d = createDefaultState();
    for (const key of Object.keys(d)) {
      state[key] = d[key];
    }
    notify();
  },

  // Applies a saved snapshot onto the live state.
  apply(snapshot) {
    if (!snapshot) return;
    if (snapshot.playerName !== undefined) state.playerName = snapshot.playerName;
    if (snapshot.hasSeenIntro !== undefined) state.hasSeenIntro = snapshot.hasSeenIntro;
    if (snapshot.currentScene !== undefined) state.currentScene = snapshot.currentScene;
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
    if (snapshot.gameTime !== undefined) state.gameTime = snapshot.gameTime;

    // -- Phase 3 -----------------------------------------------------------
    if (snapshot.currentCaveId !== undefined) {
      state.currentCaveId = snapshot.currentCaveId;
    }
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
    if (snapshot.offRoad !== undefined) state.offRoad = !!snapshot.offRoad;

    // -- Phase 4 -----------------------------------------------------------
    if (snapshot.totalGoblinThefts !== undefined) {
      state.totalGoblinThefts = snapshot.totalGoblinThefts;
    }
    if (Array.isArray(snapshot.tasksCompleted)) {
      state.tasksCompleted = snapshot.tasksCompleted.slice();
    }
    if (snapshot.veilMarketSpawnCount !== undefined) {
      state.veilMarketSpawnCount = snapshot.veilMarketSpawnCount;
    }
    if (Array.isArray(snapshot.mapShopsUsed)) {
      state.mapShopsUsed = snapshot.mapShopsUsed.slice();
    }
    if (snapshot.playtimeSeconds !== undefined) {
      state.playtimeSeconds = snapshot.playtimeSeconds;
    }
    notify();
  },
};
