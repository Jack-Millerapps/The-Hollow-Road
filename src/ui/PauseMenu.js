import { PauseManager } from '../game/PauseManager.js';

// ---------------------------------------------------------------------------
// PauseMenu — legacy shim. The real pause logic lives in
// src/game/PauseManager.js, which owns its own DOM overlay and pointer-lock
// behavior. This shim keeps older callers (main.js wiring, scene-show/hide
// helpers) working without duplicating the overlay.
// ---------------------------------------------------------------------------

let _pauseMenuMounted = false;

export const PauseMenu = {
  open: false,
  mount() {
    if (_pauseMenuMounted) return;
    _pauseMenuMounted = true;
    // Keep .open in sync with PauseManager so callers that read it still work.
    // PauseManager updates state.paused, but external readers may peek at this
    // module — wrap pause/resume to mirror.
    const origPause = PauseManager.pause.bind(PauseManager);
    const origResume = PauseManager.resume.bind(PauseManager);
    PauseManager.pause = (...a) => {
      const r = origPause(...a);
      this.open = true;
      return r;
    };
    PauseManager.resume = (...a) => {
      const r = origResume(...a);
      this.open = false;
      return r;
    };
  },
  setVisible() {},
  openMenu() {
    PauseManager.pause();
    this.open = true;
  },
  closeMenu() {
    PauseManager.resume();
    this.open = false;
  },
};
