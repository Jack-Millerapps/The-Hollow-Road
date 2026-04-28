// TownShells — central registry for the GLB town models so AdminMode can
// resize them at runtime. Each builder calls `register(townId, root, baseScale)`
// once the GLB has been attached. Scale changes persist in localStorage so a
// hard reload still reflects the user's choice (effectively "updates the code").

const STORAGE_KEY = 'hr.townScales';

function loadStored() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

const _stored = loadStored();
const _shells = new Map(); // townId -> { root, baseScale }

export const TOWN_IDS = [
  'westwind',
  'ashwick',
  'stonehush',
  'deeproot',
  'mirrorTown',
  'unnamed',
];

export const TownShells = {
  register(townId, root, baseScale = 1) {
    if (!townId || !root) return;
    _shells.set(townId, { root, baseScale });
    const userScale = _stored[townId] ?? 1;
    root.scale.setScalar(baseScale * userScale);
  },

  setScale(townId, userScale) {
    if (typeof userScale !== 'number' || userScale <= 0) return;
    _stored[townId] = userScale;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_stored));
    } catch {}
    const s = _shells.get(townId);
    if (s) s.root.scale.setScalar(s.baseScale * userScale);
  },

  getScale(townId) {
    return _stored[townId] ?? 1;
  },
};
