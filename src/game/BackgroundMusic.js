// ---------------------------------------------------------------------------
// Background music director.
//
// Selection rules:
//   - Cutscene scene             → intro.mp3
//   - World, inside a town zone  → that town's dedicated track (loops)
//   - World, outside any zone    → random rotation across ALL tracks with a
//                                  random gap (20s..5min) between picks
//
// All tracks share a master volume of 0.5 (half) and crossfade over 2 seconds
// when the selection changes.
// ---------------------------------------------------------------------------

const MASTER_VOLUME = 0.5;
const FADE_DURATION = 2.0;
const RANDOM_GAP_MIN_SEC = 20;
const RANDOM_GAP_MAX_SEC = 5 * 60;

const TRACKS = {
  hollowPath: 'Hollow Path.mp3',
  intro: 'intro.mp3',
  ashwick: 'Ashwick.mp3',
  veilMarket: 'Veil-market.mp3',
  stonehush: 'stonehush.mp3',
  deeproot: 'deeproot.mp3',
  waysEnd: "Way's End.mp3",
};
const TRACK_IDS = Object.keys(TRACKS);

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
let _activeId = null;
let _currentZoneId = null;
let _randomTrackId = null;
let _randomGapTimer = null;

function srcFor(file) {
  const base = import.meta.env.BASE_URL || './';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return encodeURI(`${prefix}${file}`);
}

function tryPlay(audio) {
  const p = audio.play();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

function pickRandomTrack() {
  return TRACK_IDS[Math.floor(Math.random() * TRACK_IDS.length)];
}

function scheduleNextRandom() {
  if (_randomGapTimer) clearTimeout(_randomGapTimer);
  _randomTrackId = null;
  const gapMs =
    (RANDOM_GAP_MIN_SEC + Math.random() * (RANDOM_GAP_MAX_SEC - RANDOM_GAP_MIN_SEC)) *
    1000;
  _randomGapTimer = setTimeout(() => {
    _randomGapTimer = null;
    _randomTrackId = pickRandomTrack();
    const a = _audios[_randomTrackId];
    if (a) a.currentTime = 0;
  }, gapMs);
}

function townZoneId(scene, playerPos) {
  if (scene !== 'world' || !playerPos) return null;
  for (const zone of TOWN_ZONES) {
    const dx = playerPos.x - zone.x;
    const dz = playerPos.z - zone.z;
    if (dx * dx + dz * dz < zone.r * zone.r) return zone.id;
  }
  return null;
}

function pickFor(scene, playerPos) {
  if (scene === 'cutscene') return 'intro';
  const zone = townZoneId(scene, playerPos);
  if (zone) return zone;
  return _randomTrackId;
}

export const BackgroundMusic = {
  init() {
    if (typeof Audio === 'undefined' || _initialized) return;
    _initialized = true;
    for (const id of TRACK_IDS) {
      const a = new Audio(srcFor(TRACKS[id]));
      a.loop = false;
      a.preload = 'auto';
      a.volume = 0;
      a.addEventListener('ended', () => {
        // While inside a matching town zone, loop the track immediately.
        if (id === _currentZoneId) {
          a.currentTime = 0;
          tryPlay(a);
        } else if (id === _randomTrackId) {
          // Random rotation: gap, then pick a new track.
          scheduleNextRandom();
        }
      });
      _audios[id] = a;
    }
    _randomTrackId = pickRandomTrack();
    _lastTickMs = performance.now();

    // Browsers block autoplay until the first user gesture. Retry whatever
    // track is currently desired on the first interaction.
    const resume = () => {
      if (_activeId && _audios[_activeId]?.paused) tryPlay(_audios[_activeId]);
    };
    window.addEventListener('pointerdown', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
  },

  update(scene, playerPos) {
    if (!_initialized) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - _lastTickMs) / 1000);
    _lastTickMs = now;

    _currentZoneId = townZoneId(scene, playerPos);
    _activeId = pickFor(scene, playerPos);
    const step = (MASTER_VOLUME / FADE_DURATION) * dt;

    for (const id of TRACK_IDS) {
      const a = _audios[id];
      const target = id === _activeId ? MASTER_VOLUME : 0;
      if (a.volume < target) a.volume = Math.min(target, a.volume + step);
      else if (a.volume > target) a.volume = Math.max(target, a.volume - step);

      if (a.volume > 0.001 && a.paused) tryPlay(a);
      else if (a.volume <= 0.001 && !a.paused) a.pause();
    }
  },
};
