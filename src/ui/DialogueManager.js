import { state } from '../state.js';
import { DialoguePanel } from './DialoguePanel.js';

// ---------------------------------------------------------------------------
// DialogueManager — single ingress point for all DialoguePanel openings.
//
// Responsibilities:
//   - Prevent two panels from being rendered simultaneously (z-index /
//     text-overlap glitches).
//   - Queue openings if one is already in flight, draining in FIFO order.
//   - Flip `state.dialogueActive` so Travel / DayNight / HUD can pause
//     themselves cleanly.
//   - Guard each button click so double-fires don't trigger the handler
//     twice.
//
// Systems should call `DialogueManager.open(cfg)` instead of
// `DialoguePanel.open(cfg)`. The panel itself is still a plain renderer —
// this wrapper is the policy.
// ---------------------------------------------------------------------------

const queue = [];
let currentCfg = null;
let active = false;

function setActive(v) {
  active = v;
  state.dialogueActive = v;
}

function renderCurrent() {
  if (!currentCfg) return;
  const cfg = currentCfg;

  // Guard each button with { once: true } semantics: after the first click
  // the button is locked so double-firing (touchend + click, hurried users,
  // etc.) is a no-op.
  const wrappedButtons = (cfg.buttons || []).map((btn) => {
    let fired = false;
    return {
      ...btn,
      onClick: () => {
        if (fired) return;
        fired = true;
        btn.onClick?.();
      },
    };
  });

  // Ensure any previous panel DOM is gone before we mount the new one so
  // there's no flash of the prior body text.
  if (DialoguePanel.root) DialoguePanel.close();

  DialoguePanel.open({
    title: cfg.title,
    body: cfg.body,
    buttons: wrappedButtons,
  });
}

function drainQueue() {
  if (queue.length === 0) {
    currentCfg = null;
    setActive(false);
    return;
  }
  currentCfg = queue.shift();
  setActive(true);
  renderCurrent();
}

export const DialogueManager = {
  isOpen() {
    return active;
  },

  // Open a new dialogue. If one is already open, queue. Caller's onClick
  // handlers are responsible for calling DialogueManager.close() or .open()
  // with the next step.
  open(cfg) {
    if (!cfg) return;
    if (active && currentCfg) {
      // Already showing something — treat this call as a replacement of the
      // current screen, not a queue (most callers are walking through a
      // multi-step conversation). If you want true queueing, use enqueue().
      currentCfg = cfg;
      renderCurrent();
      return;
    }
    currentCfg = cfg;
    setActive(true);
    renderCurrent();
  },

  // Add to the queue behind any currently-visible dialogue.
  enqueue(cfg) {
    if (!cfg) return;
    if (!active) {
      this.open(cfg);
    } else {
      queue.push(cfg);
    }
  },

  // Close the current dialogue and drain the queue.
  close() {
    currentCfg = null;
    if (DialoguePanel.root) DialoguePanel.close();
    drainQueue();
  },

  // Force-clear everything (e.g. scene transition).
  reset() {
    queue.length = 0;
    currentCfg = null;
    if (DialoguePanel.root) DialoguePanel.close();
    setActive(false);
  },
};
