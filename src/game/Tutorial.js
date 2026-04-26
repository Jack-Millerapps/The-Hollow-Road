import { state, subscribe, notify } from '../state.js';
import { Save } from './Save.js';
import { FRIENDS } from '../data/friends.js';
import { villages } from '../data/villages.js';
import { caves, CAVE_TRIGGER_RADIUS } from '../data/caves.js';
import { FirstNightWarning } from '../ui/FirstNightWarning.js';

// ---------------------------------------------------------------------------
// First-playthrough contextual tips. One tooltip at a time; step 5 is
// click-to-dismiss. Order: 1 → 8 via state.flags.tutorialS*.
// ---------------------------------------------------------------------------

const MIRA = FRIENDS.find((f) => f.id === 'mira');
const ASH_CAVE = caves.find((c) => c.id === 'ashCave');
const ASHWICK = villages.find((v) => v.name === 'ashwick');

const CURRENCY_LABELS = {
  gold: 'gold',
  memories: 'memories',
  promises: 'promises',
  years: 'years',
  secrets: 'secrets',
};

let _active = null;
let _queue = [];
let _westwindTimer = 0;
let _currencyBaseline = null;
let _s2Offered = false;

function ensureFont() {
  if (document.getElementById('hr-tutorial-font')) return;
  const link = document.createElement('link');
  link.id = 'hr-tutorial-font';
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital@0;1&display=swap';
  document.head.appendChild(link);
}

function mark(flag, on) {
  if (state.flags[flag] === on) return;
  state.flags[flag] = on;
  notify();
  Save.write(state);
}

function allFriendsGifted() {
  return (
    !!state.flags.friendMiraGifted &&
    !!state.flags.friendTomasGifted &&
    !!state.flags.friendElenGifted
  );
}

function distToMira() {
  if (!MIRA || !state.playerPos) return 1e9;
  return Math.hypot(
    state.playerPos.x - MIRA.position.x,
    state.playerPos.z - MIRA.position.z,
  );
}

function distToAshCave() {
  if (!ASH_CAVE || !state.playerPos) return 1e9;
  return Math.hypot(
    state.playerPos.x - ASH_CAVE.position.x,
    state.playerPos.z - ASH_CAVE.position.z,
  );
}

function distToAshwick() {
  if (!ASHWICK || !state.playerPos) return 1e9;
  return Math.hypot(
    state.playerPos.x - ASHWICK.position.x,
    state.playerPos.z - ASHWICK.position.z,
  );
}

function checkTutorialComplete() {
  if (state.flags.tutorialComplete) return;
  const f = state.flags;
  if (
    f.tutorialS1Move &&
    f.tutorialS2Look &&
    f.tutorialS3Interact &&
    f.tutorialS4Inventory &&
    f.tutorialS5Night &&
    f.tutorialS6Cave &&
    f.tutorialS7Quest &&
    f.tutorialS8Currency
  ) {
    f.tutorialComplete = true;
    notify();
    Save.write(state);
  }
}

function dismissActive() {
  if (!_active) return;
  const { el, id } = _active;
  el.style.opacity = '0';
  setTimeout(() => el.remove(), 350);
  _active = null;

  if (id === 's1') mark('tutorialS1Move', true);
  if (id === 's2') mark('tutorialS2Look', true);
  if (id === 's3') mark('tutorialS3Interact', true);
  if (id === 's4') mark('tutorialS4Inventory', true);
  if (id === 's5') mark('tutorialS5Night', true);
  if (id === 's6') mark('tutorialS6Cave', true);
  if (id === 's7') {
    mark('tutorialS7Quest', true);
    _currencyBaseline = { ...state.currencies };
  }
  if (id === 's8') mark('tutorialS8Currency', true);
  checkTutorialComplete();
  drainQueue();
}

function makePill(text, opts = {}) {
  ensureFont();
  const el = document.createElement('div');
  el.className = 'hr-tutorial-tip';
  el.setAttribute('role', 'status');
  Object.assign(el.style, {
    position: 'fixed',
    maxWidth: 'min(420px, 92vw)',
    padding: '10px 16px',
    background: 'rgba(12, 10, 8, 0.9)',
    color: '#e8d4b0',
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: '15px',
    lineHeight: '1.45',
    borderRadius: '999px',
    boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
    zIndex: '85',
    opacity: '0',
    transition: 'opacity 0.45s ease',
    pointerEvents: opts.blocking ? 'auto' : 'none',
  });
  el.textContent = text;
  if (opts.left != null) el.style.left = typeof opts.left === 'number' ? `${opts.left}px` : opts.left;
  if (opts.right != null) el.style.right = typeof opts.right === 'number' ? `${opts.right}px` : opts.right;
  if (opts.top != null) el.style.top = typeof opts.top === 'number' ? `${opts.top}px` : opts.top;
  if (opts.bottom != null) el.style.bottom = typeof opts.bottom === 'number' ? `${opts.bottom}px` : opts.bottom;
  if (opts.transform) el.style.transform = opts.transform;
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = '1';
  });
  return el;
}

function showTip(def) {
  if (_active) {
    if (!_queue.some((q) => q.id === def.id)) _queue.push(def);
    return;
  }
  const el = makePill(def.text, def);
  _active = { id: def.id, el, blocking: !!def.blocking };

  if (def.blocking) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Understood';
    Object.assign(btn.style, {
      display: 'block',
      marginTop: '10px',
      marginLeft: 'auto',
      padding: '4px 12px',
      font: '12px Georgia, serif',
      fontVariant: 'small-caps',
      letterSpacing: '0.16em',
      color: '#c8903a',
      background: 'rgba(255,200,120,0.12)',
      border: '1px solid rgba(200,170,120,0.4)',
      borderRadius: '4px',
      cursor: 'pointer',
    });
    btn.addEventListener('click', () => dismissActive());
    el.appendChild(btn);
    el.style.pointerEvents = 'auto';
  } else if (def.dismissMs) {
    setTimeout(() => {
      if (_active && _active.id === def.id) dismissActive();
    }, def.dismissMs);
  }
}

function drainQueue() {
  if (_active || state.flags.tutorialComplete) return;
  const next = _queue.shift();
  if (next) showTip(next);
}

const STEP_DONE_FLAG = {
  s1: 'tutorialS1Move',
  s2: 'tutorialS2Look',
  s3: 'tutorialS3Interact',
  s4: 'tutorialS4Inventory',
  s5: 'tutorialS5Night',
  s6: 'tutorialS6Cave',
  s7: 'tutorialS7Quest',
  s8: 'tutorialS8Currency',
};

function enqueue(def) {
  if (state.flags.tutorialComplete) return;
  const doneKey = STEP_DONE_FLAG[def.id];
  if (!doneKey || state.flags[doneKey]) return;
  if (_queue.some((q) => q.id === def.id)) return;
  if (_active && _active.id === def.id) return;
  _queue.push(def);
  drainQueue();
}

function syncFromState() {
  if (state.flags.tutorialComplete) return;
  if (state.currentScene !== 'world') return;
  if (state.dialogueActive) return;

  const f = state.flags;

  if (f.tutorialS1Move && !f.tutorialS2Look && state.isWalking && !_s2Offered) {
    _s2Offered = true;
    enqueue({
      id: 's2',
      text: 'Click to lock your view. Move the mouse to look around.',
      left: '50%',
      top: 88,
      transform: 'translateX(-50%)',
    });
  }

  if (
    f.tutorialS2Look &&
    !f.tutorialS3Interact &&
    distToMira() <= 5 &&
    !_queue.some((q) => q.id === 's3') &&
    _active?.id !== 's3'
  ) {
    enqueue({
      id: 's3',
      text: 'Press E to talk to people and interact with objects.',
      left: '50%',
      bottom: 118,
      transform: 'translateX(-50%)',
    });
  }

  if (
    f.tutorialS3Interact &&
    !f.tutorialS4Inventory &&
    allFriendsGifted() &&
    !_queue.some((q) => q.id === 's4') &&
    _active?.id !== 's4'
  ) {
    enqueue({
      id: 's4',
      text: "Press I to open your inventory and see what you're carrying.",
      right: 22,
      bottom: 140,
    });
  }

  if (
    f.tutorialS4Inventory &&
    !f.tutorialS5Night &&
    f.seenFirstNightWarning &&
    !FirstNightWarning.root &&
    !_queue.some((q) => q.id === 's5') &&
    _active?.id !== 's5'
  ) {
    enqueue({
      id: 's5',
      text:
        'You are on the road at night. Goblins patrol here after dark. Step off the road to lose them. Find a cave to shelter safely.',
      left: 24,
      top: 72,
      blocking: true,
    });
  }

  if (
    f.tutorialS5Night &&
    !f.tutorialS6Cave &&
    ASH_CAVE &&
    distToAshCave() < CAVE_TRIGGER_RADIUS + 3 &&
    !_queue.some((q) => q.id === 's6') &&
    _active?.id !== 's6'
  ) {
    enqueue({
      id: 's6',
      text:
        'Press E to enter the cave. Caves are safe from goblins. Mine ore with F, rest in the sleeping alcove to skip the night.',
      left: '50%',
      bottom: 118,
      transform: 'translateX(-50%)',
    });
  }

  if (
    f.tutorialS6Cave &&
    !f.tutorialS7Quest &&
    ASHWICK &&
    distToAshwick() < ASHWICK.radius &&
    !_queue.some((q) => q.id === 's7') &&
    _active?.id !== 's7'
  ) {
    enqueue({
      id: 's7',
      text:
        'Press J to open your quest log. It tracks your objectives and gives hints.',
      right: 24,
      top: 120,
    });
  }

  if (f.tutorialS7Quest && !f.tutorialS8Currency && _currencyBaseline) {
    for (const key of Object.keys(CURRENCY_LABELS)) {
      const prev = _currencyBaseline[key] ?? 0;
      const cur = state.currencies[key] ?? 0;
      if (cur > prev) {
        const label = CURRENCY_LABELS[key];
        enqueue({
          id: 's8',
          text: `You've received ${label}. Currencies are traded for goods, information, and safe passage. Each town and cave values different things.`,
          left: '50%',
          top: 110,
          transform: 'translateX(-50%)',
          dismissMs: 8000,
        });
        _currencyBaseline = { ...state.currencies };
        break;
      }
    }
  }

  drainQueue();
}

export const Tutorial = {
  mount() {
    subscribe(() => syncFromState());
    window.addEventListener('keydown', (e) => Tutorial._onKey(e), true);
    document.addEventListener('mousemove', (e) => Tutorial._onMouseMove(e), true);
  },

  onWestwindEntered() {
    if (state.flags.tutorialComplete) return;
    clearTimeout(_westwindTimer);
    _currencyBaseline = { ...state.currencies };
    _s2Offered = false;

    if (!state.flags.tutorialS1Move) {
      _westwindTimer = setTimeout(() => {
        if (state.flags.tutorialComplete || state.flags.tutorialS1Move) return;
        if (state.currentScene !== 'world') return;
        showTip({
          id: 's1',
          text:
            'Move with WASD. Hold Shift to sprint — but watch your stamina.',
          left: 22,
          bottom: 96,
          dismissMs: 6000,
        });
      }, 3000);
    }
  },

  notifyInventoryOpened() {
    if (state.flags.tutorialComplete) return;
    if (state.flags.tutorialS4Inventory) return;
    if (!state.flags.tutorialS3Interact || !allFriendsGifted()) return;
    if (_active?.id === 's4') dismissActive();
    else if (!state.flags.tutorialS4Inventory) mark('tutorialS4Inventory', true);
    checkTutorialComplete();
    syncFromState();
  },

  notifyQuestLogOpened() {
    if (state.flags.tutorialComplete) return;
    if (state.flags.tutorialS7Quest) return;
    if (!state.flags.tutorialS6Cave) return;
    if (!ASHWICK || distToAshwick() >= ASHWICK.radius) return;
    if (_active?.id === 's7') dismissActive();
    else {
      mark('tutorialS7Quest', true);
      _currencyBaseline = { ...state.currencies };
    }
    checkTutorialComplete();
    syncFromState();
  },

  _onKey(e) {
    if (state.flags.tutorialComplete) return;
    const k = e.key.toLowerCase();
    if (k === 'e') {
      if (_active?.id === 's6') {
        dismissActive();
        return;
      }
      if (!state.flags.tutorialS3Interact && distToMira() <= 5) {
        if (_active?.id === 's3') dismissActive();
        else mark('tutorialS3Interact', true);
        checkTutorialComplete();
        syncFromState();
      }
    }
    if (k === 'i' && _active?.id === 's4') dismissActive();
    if (k === 'j' && _active?.id === 's7') dismissActive();
  },

  _onMouseMove(e) {
    if (state.flags.tutorialComplete) return;
    if (_active?.id !== 's2') return;
    if (!document.pointerLockElement) return;
    const mx = e.movementX || 0;
    const my = e.movementY || 0;
    if (mx * mx + my * my < 9) return;
    dismissActive();
  },
};
