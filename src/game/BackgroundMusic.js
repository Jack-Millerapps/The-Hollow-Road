// ---------------------------------------------------------------------------
// Background music director — picks one looping track based on scene and
// player position, fading between tracks when the selection changes. All
// tracks share a master volume of 0.5 (half).
// ---------------------------------------------------------------------------

const MASTER_VOLUME = 0.5;
const FADE_DURATION = 2.0;

const TRACKS = {
  hollowPath: 'Hollow Path.mp3',
  intro: 'intro.mp3',
  ashwick: 'Ashwick.mp3',
  veilMarket: 'Veil-market.mp3',
  stonehush: 'stonehush.mp3',
  deeproot: 'deeproot.mp3',
  waysEnd: "Way's End.mp3",
};

// Town music zones — entering the radius around the listed coords cross-fades
// to that town's track. Centers match the GLB building positions used in
// AshwickNPCs/TownNPCs/GreaterTowns.
const TOWN_ZONES = [
  { id: 'ashwick', x: -30, z: -500, r: 70 },
  { id: 'veilMarket', x: 34, z: -2500, r: 70 },
  { id: 'stonehush', x: -830, z: -5000, r: 90 },
  { id: 'deeproot', x: 680, z: -6000, r: 90 },
  { id: 'waysEnd', x: 0, z: -14500, r: 110 },
];

const _audios = {};
let _initialized = false;
let _lastTickMs = 0;
let _desiredId = null;

function srcFor(file) {
  const base = import.meta.env.BASE_URL || './';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return encodeURI(`${prefix}${file}`);
}

function tryPlay(audio) {
  const p = audio.play();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

function pickFor(scene, playerPos) {
  if (scene === 'cutscene') return 'intro';
  if (scene === 'world' && playerPos) {
    for (const zone of TOWN_ZONES) {
      const dx = playerPos.x - zone.x;
      const dz = playerPos.z - zone.z;
      if (dx * dx + dz * dz < zone.r * zone.r) return zone.id;
    }
  }
  return 'hollowPath';
}

export const BackgroundMusic = {
  init() {
    if (typeof Audio === 'undefined' || _initialized) return;
    _initialized = true;
    for (const id of Object.keys(TRACKS)) {
      const a = new Audio(srcFor(TRACKS[id]));
      a.loop = true;
      a.preload = 'auto';
      a.volume = 0;
      _audios[id] = a;
    }
    _lastTickMs = performance.now();

    // Browsers block autoplay until the first user gesture. Retry whatever
    // track is currently desired on the first interaction.
    const resume = () => {
      if (_desiredId && _audios[_desiredId]?.paused) tryPlay(_audios[_desiredId]);
    };
    window.addEventListener('pointerdown', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
  },

  update(scene, playerPos) {
    if (!_initialized) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - _lastTickMs) / 1000);
    _lastTickMs = now;

    _desiredId = pickFor(scene, playerPos);
    const step = (MASTER_VOLUME / FADE_DURATION) * dt;

    for (const id of Object.keys(_audios)) {
      const a = _audios[id];
      const target = id === _desiredId ? MASTER_VOLUME : 0;
      if (a.volume < target) a.volume = Math.min(target, a.volume + step);
      else if (a.volume > target) a.volume = Math.max(target, a.volume - step);

      if (a.volume > 0.001 && a.paused) tryPlay(a);
      else if (a.volume <= 0.001 && !a.paused) {
        a.pause();
        a.currentTime = 0;
      }
    }
  },
};
