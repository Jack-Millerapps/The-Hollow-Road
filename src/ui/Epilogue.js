// Phase 4 — end-of-run epilogue screen.
//
// Summons a serif "credits-style" panel listing the player's journey, then
// a "New journey" button that wipes the save and returns to the intro.
// Rendered as a plain DOM overlay so it does not interact with the fade
// overlay the Ending uses (the Ending fades to pure black first, then
// invokes Epilogue.show()).

import { state } from '../state.js';
import { Save } from '../game/Save.js';

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function labelForTask(id) {
  switch (id) {
    case 'ashwickTask':
      return 'Stilled the miller’s wheel';
    case 'stonehushTask':
      return 'Heard the silence at Stonehush';
    case 'deeprootTask':
      return state.flags?.treeAccepted
        ? 'Accepted the great tree’s offer'
        : 'Refused the great tree';
    case 'mirrorTownTask':
      return 'Met yourself in the mirror';
    default:
      return id;
  }
}

function labelForCave(id) {
  switch (id) {
    case 'ashCave':
      return 'The Ash Hollow';
    case 'ancientAshwickCave':
      return 'Ancient Ashwick Cave';
    case 'veilCave':
      return 'The Velvet Deep';
    case 'stoneCave':
      return 'The Stone Throat';
    case 'deepCave':
      return 'The Rootway';
    case 'mirrorCave':
      return 'The Still Pool';
    case 'endCave':
      return 'The Last Hollow';
    default:
      return id;
  }
}

function spentBreakdown() {
  const spent = state.spent || {};
  const rows = [];
  for (const [k, v] of Object.entries(spent)) {
    if (!v) continue;
    const label = {
      gold: 'Gold',
      memories: v === 1 ? 'Memory' : 'Memories',
      promises: v === 1 ? 'Promise' : 'Promises',
      years: v === 1 ? 'Year' : 'Years',
      secrets: v === 1 ? 'Secret' : 'Secrets',
    }[k] || k;
    rows.push(`${v} ${label}`);
  }
  if (rows.length === 0) return 'Nothing';
  return rows.join(' · ');
}

export const Epilogue = {
  root: null,

  show({ finalChoice } = {}) {
    if (this.root) return;

    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(0, 0, 0, 0.96)',
      color: '#e5d9b6',
      fontFamily: '"Georgia", "Times New Roman", serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      zIndex: '10000',
      opacity: '0',
      transition: 'opacity 1600ms ease',
      padding: '40px 20px',
      overflow: 'auto',
    });

    const panel = document.createElement('div');
    panel.style.maxWidth = '720px';
    panel.style.width = '100%';
    panel.style.margin = '0 auto';

    const h = document.createElement('div');
    h.textContent = 'The Road Remembers';
    Object.assign(h.style, {
      fontSize: '30px',
      fontStyle: 'italic',
      letterSpacing: '0.04em',
      marginBottom: '32px',
      opacity: '0.9',
    });
    panel.appendChild(h);

    const rows = document.createElement('div');
    Object.assign(rows.style, {
      display: 'grid',
      gridTemplateColumns: '180px 1fr',
      gap: '12px 24px',
      textAlign: 'left',
      fontSize: '17px',
      lineHeight: '1.55',
      margin: '0 auto',
    });

    const tasks = (state.tasksCompleted || []).map(labelForTask);
    const caves = (state.trollsTraded || []).map(labelForCave);
    const questsDone = Object.values(state.quests || {}).filter((q) => q?.done).length;
    const mapPieces = state.mapPieces instanceof Set ? state.mapPieces.size : 0;

    const finalLabel =
      finalChoice === 'accept' ? 'Accepted the Road'
      : finalChoice === 'back' ? 'Walked back'
      : 'Stopped walking';

    const entries = [
      ['Name', state.playerName || '(unnamed)'],
      ['Time played', formatTime(state.playtimeSeconds)],
      ['Currencies spent', spentBreakdown()],
      ['Map pieces gathered', `${mapPieces}`],
      ['Quests completed', `${questsDone}`],
      ['Goblin thefts', `${state.totalGoblinThefts || 0}`],
      ['Tasks completed', tasks.length ? tasks.join('; ') : 'None'],
      ['Caves visited', caves.length ? caves.join('; ') : 'None'],
      ['Final choice', finalLabel],
    ];

    for (const [label, value] of entries) {
      const l = document.createElement('div');
      l.textContent = label;
      l.style.opacity = '0.7';
      l.style.textTransform = 'uppercase';
      l.style.letterSpacing = '0.08em';
      l.style.fontSize = '13px';
      l.style.paddingTop = '4px';
      const v = document.createElement('div');
      v.textContent = value;
      rows.appendChild(l);
      rows.appendChild(v);
    }
    panel.appendChild(rows);

    const closing = document.createElement('div');
    closing.textContent = 'The road remembers.';
    Object.assign(closing.style, {
      marginTop: '44px',
      fontStyle: 'italic',
      fontSize: '20px',
      opacity: '0.9',
    });
    panel.appendChild(closing);

    const btnWrap = document.createElement('div');
    btnWrap.style.marginTop = '48px';

    const btn = document.createElement('button');
    btn.textContent = 'New Journey';
    Object.assign(btn.style, {
      padding: '12px 28px',
      background: 'rgba(0, 0, 0, 0.4)',
      color: '#e5d9b6',
      border: '1px solid rgba(200, 170, 120, 0.5)',
      fontFamily: 'Georgia, serif',
      fontSize: '17px',
      cursor: 'pointer',
      letterSpacing: '0.03em',
    });
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(40, 20, 10, 0.6)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(0, 0, 0, 0.4)';
    });
    btn.addEventListener('click', () => {
      Save.setWritesEnabled(false);
      Save.clear();
      try {
        Save.resetInMemory?.();
      } catch {
        // ignore — page reload will start fresh either way.
      }
      const { origin, pathname, search } = window.location;
      const sep = search && search.length > 0 ? '&' : '?';
      window.location.replace(`${origin}${pathname}${search}${sep}_new=1`);
    });
    btnWrap.appendChild(btn);
    panel.appendChild(btnWrap);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });
    this.root = overlay;
  },

  hide() {
    if (!this.root) return;
    this.root.style.opacity = '0';
    const el = this.root;
    this.root = null;
    setTimeout(() => el.remove(), 1000);
  },
};
