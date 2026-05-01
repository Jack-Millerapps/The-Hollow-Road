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

import { state } from '../state.js';
import { DayNight } from '../scene/DayNight.js';

const MASTER_VOLUME = 0.5;
const FADE_DURATION = 2.0;
const RANDOM_GAP_MIN_SEC = 20;
const RANDOM_GAP_MAX_SEC = 5 * 60;
const BELL_VOLUME = 0.33;

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
// Tracks that should ONLY play inside their matching town zone, never in the
// outdoor random rotation.
const TOWN_ONLY_TRACKS = new Set(['veilMarket']);
const RANDOM_TRACK_IDS = TRACK_IDS.filter(
  (id) => id !== 'intro' && !TOWN_ONLY_TRACKS.has(id),
);

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

let _bellAudio = null;
let _bellResolved = false;
let _bellCandidateIdx = 0;
const BELL_CANDIDATES = [
  'Bell.mp3',
  'Bell.wav',
  'Bell.ogg',
  'Bell.m4a',
  'Bell',
];

function srcFor(file) {
  const base = import.meta.env.BASE_URL || './';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return encodeURI(`${prefix}${file}`);
}

function tryPlay(audio) {
  const p = audio.play();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

function shouldPlayBell() {
  if (state.currentScene !== 'world') return false;
  if (_currentZoneId !== 'stonehush') return false;
  const q = state.quests?.stonehush;
  if (!q || q.done || (q.step ?? 0) <= 0) return false;
  const phase = DayNight.getCurrentPhase?.() ?? 'day';
  return phase === 'night';
}

function ensureBellAudio() {
  if (typeof Audio === 'undefined' || _bellAudio) return;
  const a = new Audio();
  a.loop = true;
  a.preload = 'auto';
  a.volume = 0;

  const tryNext = () => {
    if (_bellResolved) return;
    if (_bellCandidateIdx >= BELL_CANDIDATES.length) {
      _bellResolved = true;
      return;
    }
    const file = BELL_CANDIDATES[_bellCandidateIdx++];
    a.src = srcFor(file);
    // Force a load attempt so the error event fires quickly if missing.
    try { a.load?.(); } catch { /* ignore */ }
  };

  a.addEventListener('error', () => {
    // Try the next extension/name until one works.
    tryNext();
  });
  a.addEventListener('canplaythrough', () => {
    _bellResolved = true;
  }, { once: true });

  _bellAudio = a;
  tryNext();
}

function pickRandomTrack() {
  return RANDOM_TRACK_IDS[Math.floor(Math.random() * RANDOM_TRACK_IDS.length)];
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
    ensureBellAudio();

    // Browsers block autoplay until the first user gesture. Retry whatever
    // track is currently desired on the first interaction.
    const resume = () => {
      if (_activeId && _audios[_activeId]?.paused) tryPlay(_audios[_activeId]);
      if (_bellAudio && _bellAudio.volume > 0.001 && _bellAudio.paused) tryPlay(_bellAudio);
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

    // --- Stonehush bell loop (night only, quest active) -------------------
    ensureBellAudio();
    if (_bellAudio) {
      const target = shouldPlayBell() ? BELL_VOLUME : 0;
      const bellStep = (BELL_VOLUME / 0.8) * dt; // faster fade than music
      if (_bellAudio.volume < target) _bellAudio.volume = Math.min(target, _bellAudio.volume + bellStep);
      else if (_bellAudio.volume > target) _bellAudio.volume = Math.max(target, _bellAudio.volume - bellStep);

      if (_bellAudio.volume > 0.001 && _bellAudio.paused) tryPlay(_bellAudio);
      else if (_bellAudio.volume <= 0.001 && !_bellAudio.paused) _bellAudio.pause();
    }
  },
};
