// ---------------------------------------------------------------------------
// Background music — plays when the session starts; after each full play,
// waits a random interval (0–5 minutes) then plays again.
// ---------------------------------------------------------------------------

const MAX_GAP_SEC = 5 * 60;

let _audio = null;
let _replayTimer = null;

function musicSrc() {
  const base = import.meta.env.BASE_URL || './';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return encodeURI(`${prefix}Hollow Path.mp3`);
}

function clearReplayTimer() {
  if (_replayTimer != null) {
    clearTimeout(_replayTimer);
    _replayTimer = null;
  }
}

function scheduleReplay() {
  clearReplayTimer();
  const delayMs = Math.random() * MAX_GAP_SEC * 1000;
  _replayTimer = setTimeout(() => {
    _replayTimer = null;
    if (!_audio) return;
    _audio.currentTime = 0;
    const p = _audio.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }, delayMs);
}

function tryPlay() {
  if (!_audio) return;
  const p = _audio.play();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

export const BackgroundMusic = {
  init() {
    if (typeof Audio === 'undefined') return;
    if (_audio) return;

    _audio = new Audio(musicSrc());
    _audio.loop = false;
    _audio.preload = 'auto';

    _audio.addEventListener('ended', () => {
      scheduleReplay();
    });

    tryPlay();
    window.addEventListener('pointerdown', tryPlay, { once: true });
  },
};
