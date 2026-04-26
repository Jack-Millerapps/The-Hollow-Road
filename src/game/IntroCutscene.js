import { state, notify } from '../state.js';
import { Save } from './Save.js';

// Fullscreen DOM cutscene. A dark void with a single distant lantern, serif
// italic lines that fade in and out, and a styled name input. Pure DOM — the
// 3D scene is hidden behind.

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fadeTo(el, opacity, duration = 1200) {
  return new Promise((resolve) => {
    if (!el) return resolve();
    el.style.transition = `opacity ${duration}ms ease`;
    // Force reflow so the transition takes effect.
    void el.offsetWidth;
    el.style.opacity = String(opacity);
    setTimeout(resolve, duration + 30);
  });
}

function makeStyleTag() {
  if (document.getElementById('intro-cutscene-style')) return;
  const style = document.createElement('style');
  style.id = 'intro-cutscene-style';
  style.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500&display=swap');

.intro-cutscene {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: radial-gradient(ellipse at center, #0a0604 0%, #000000 65%);
  color: #e8c98a;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  font-family: 'Cormorant Garamond', 'Cormorant', Georgia, serif;
  overflow: hidden;
  opacity: 1;
  transition: opacity 0.6s ease;
  user-select: none;
  pointer-events: auto;
}

.intro-cutscene .lantern {
  position: absolute;
  top: 36%;
  left: 50%;
  width: 14px;
  height: 14px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(circle,
    rgba(255, 210, 140, 1) 0%,
    rgba(255, 165, 70, 0.85) 30%,
    rgba(255, 120, 40, 0.35) 60%,
    rgba(0, 0, 0, 0) 100%);
  box-shadow:
    0 0 40px 8px rgba(255, 170, 70, 0.35),
    0 0 140px 50px rgba(255, 140, 50, 0.12),
    0 0 320px 130px rgba(140, 70, 20, 0.08);
  animation: lantern-flicker 3.4s ease-in-out infinite;
  filter: blur(0.3px);
}

@keyframes lantern-flicker {
  0%, 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  42% { opacity: 0.88; transform: translate(-50%, -50%) scale(0.98); }
  58% { opacity: 1.05; transform: translate(-50%, -50%) scale(1.02); }
}

.intro-cutscene .line {
  position: relative;
  max-width: 720px;
  padding: 0 32px;
  text-align: center;
  font-style: italic;
  font-weight: 400;
  font-size: 34px;
  letter-spacing: 0.02em;
  line-height: 1.45;
  color: #f0d29a;
  text-shadow:
    0 0 20px rgba(255, 170, 80, 0.18),
    0 0 60px rgba(255, 140, 60, 0.08);
  opacity: 0;
  transition: opacity 1.6s ease;
  margin-top: 10vh;
}

.intro-cutscene .input-wrap {
  position: relative;
  margin-top: 36px;
  opacity: 0;
  transition: opacity 1.2s ease;
}

.intro-cutscene input[type="text"] {
  background: transparent;
  border: none;
  outline: none;
  border-bottom: 1px solid rgba(232, 201, 138, 0.55);
  color: #f3dba4;
  font-family: 'Cormorant Garamond', Georgia, serif;
  font-style: italic;
  font-size: 28px;
  text-align: center;
  padding: 8px 12px;
  width: 320px;
  caret-color: #e8c98a;
  letter-spacing: 0.03em;
  transition: border-color 0.4s ease, box-shadow 0.4s ease;
}

.intro-cutscene input[type="text"]:focus {
  border-bottom-color: #e8c98a;
  box-shadow: 0 6px 24px -12px rgba(232, 201, 138, 0.6);
}

.intro-cutscene .hint {
  margin-top: 14px;
  font-size: 14px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  font-style: normal;
  color: rgba(232, 201, 138, 0.45);
  font-family: Georgia, serif;
}

.intro-cutscene.fadeout {
  opacity: 0;
  transition: opacity 1.6s ease;
}
  `;
  document.head.appendChild(style);
}

export const IntroCutscene = {
  root: null,

  async start(onComplete) {
    makeStyleTag();

    const uiRoot = document.getElementById('ui-root');
    let uiPrev = '';
    if (uiRoot) {
      uiPrev = uiRoot.style.display || '';
      uiRoot.style.display = 'none';
    }

    let name = '';
    try {
      const root = document.createElement('div');
      root.className = 'intro-cutscene';

      const lantern = document.createElement('div');
      lantern.className = 'lantern';
      root.appendChild(lantern);

      const line = document.createElement('div');
      line.className = 'line';
      line.textContent = '';
      root.appendChild(line);

      const inputWrap = document.createElement('div');
      inputWrap.className = 'input-wrap';
      const input = document.createElement('input');
      input.type = 'text';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.maxLength = 24;
      input.placeholder = '';
      inputWrap.appendChild(input);
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = 'Press Enter';
      inputWrap.appendChild(hint);
      root.appendChild(inputWrap);

      document.body.appendChild(root);
      this.root = root;
      // Show the layer immediately — the root used to stay at opacity 0 for
      // ~2s while fading in, which left a transparent hole over a hidden/empty
      // canvas (reads as a frozen black screen).
      root.style.opacity = '1';

      await wait(350);

      // 1. First line fades in.
      line.textContent = 'Seek the end and you will find clarity.';
      await fadeTo(line, 1, 1800);

      // 3. Hold on first line.
      await wait(3000);

      // Fade it out, swap to prompt.
      await fadeTo(line, 0, 1200);
      line.textContent = 'What is your name, traveler?';
      await fadeTo(line, 1, 1400);

      // 4. Reveal the input.
      await fadeTo(inputWrap, 1, 900);
      setTimeout(() => input.focus(), 50);

      name = await new Promise((resolve) => {
        const onKey = (e) => {
          if (e.key === 'Enter') {
            const val = input.value.trim();
            if (!val) return;
            input.removeEventListener('keydown', onKey);
            resolve(val);
          }
        };
        input.addEventListener('keydown', onKey);
      });

      input.disabled = true;
      await fadeTo(inputWrap, 0, 800);

      // 5. Personalized line.
      await fadeTo(line, 0, 900);
      line.textContent = `${name}… hmm, that's a great name.`;
      await fadeTo(line, 1, 1400);

      // Persist early so a reload keeps the name.
      state.playerName = name;
      state.hasSeenIntro = true;
      notify();
      Save.write(state);

      // 6. Hold, then fade to black.
      await wait(3000);
      await fadeTo(line, 0, 900);
      await fadeTo(root, 0, 1600);

      root.remove();
      this.root = null;
    } finally {
      if (uiRoot) uiRoot.style.display = uiPrev;
    }

    if (typeof onComplete === 'function') onComplete({ name });
  },
};
