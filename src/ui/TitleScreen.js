// Home / title screen shown at game launch. Provides Continue (when a save
// exists) and New Game entry points. Pure DOM; sits above the (still hidden)
// 3D canvas until the player chooses how to start.

function makeStyleTag() {
  if (document.getElementById('title-screen-style')) return;
  const style = document.createElement('style');
  style.id = 'title-screen-style';
  style.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap');

.title-screen {
  position: fixed;
  inset: 0;
  z-index: 250;
  background:
    radial-gradient(ellipse at 50% 38%, rgba(80, 50, 22, 0.35) 0%, rgba(10, 6, 4, 0.92) 55%, #000 100%),
    #000;
  color: #e8c98a;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-family: 'Cormorant Garamond', Georgia, serif;
  user-select: none;
  pointer-events: auto;
  overflow: hidden;
  opacity: 1;
}

.title-screen.fadeout { opacity: 0; transition: opacity 0.9s ease; }

.title-screen .ember {
  position: absolute;
  top: 30%;
  left: 50%;
  width: 10px;
  height: 10px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(circle,
    rgba(255, 210, 140, 1) 0%,
    rgba(255, 165, 70, 0.85) 30%,
    rgba(255, 120, 40, 0.3) 60%,
    rgba(0, 0, 0, 0) 100%);
  box-shadow:
    0 0 30px 6px rgba(255, 170, 70, 0.32),
    0 0 120px 40px rgba(255, 140, 50, 0.10),
    0 0 280px 110px rgba(140, 70, 20, 0.07);
  animation: title-ember 3.6s ease-in-out infinite;
}

@keyframes title-ember {
  0%, 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  45% { opacity: 0.85; transform: translate(-50%, -50%) scale(0.97); }
  60% { opacity: 1.05; transform: translate(-50%, -50%) scale(1.03); }
}

.title-screen .title {
  position: relative;
  font-size: 84px;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: #f0d29a;
  text-shadow:
    0 0 22px rgba(255, 170, 80, 0.22),
    0 0 70px rgba(255, 140, 60, 0.10);
  margin-top: 6vh;
  margin-bottom: 8px;
  text-align: center;
}

.title-screen .subtitle {
  position: relative;
  font-size: 18px;
  font-style: italic;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: rgba(232, 201, 138, 0.65);
  margin-bottom: 56px;
  text-align: center;
}

.title-screen .menu {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
}

.title-screen button {
  background: transparent;
  border: 1px solid rgba(232, 201, 138, 0.4);
  border-radius: 2px;
  color: #f3dba4;
  font-family: 'Cormorant Garamond', Georgia, serif;
  font-style: italic;
  font-size: 24px;
  letter-spacing: 0.08em;
  padding: 10px 56px;
  min-width: 280px;
  cursor: pointer;
  transition: background 0.3s ease, border-color 0.3s ease, color 0.3s ease, box-shadow 0.3s ease;
}

.title-screen button:hover:not(:disabled) {
  background: rgba(232, 201, 138, 0.08);
  border-color: #e8c98a;
  color: #fff1c2;
  box-shadow: 0 6px 24px -10px rgba(232, 201, 138, 0.55);
}

.title-screen button:disabled {
  opacity: 0.35;
  cursor: default;
}

.title-screen .music-credit {
  position: absolute;
  bottom: 24px;
  left: 24px;
  text-align: left;
  font-size: 13px;
  font-style: italic;
  letter-spacing: 0.06em;
  color: rgba(232, 201, 138, 0.45);
  font-family: 'Cormorant Garamond', Georgia, serif;
}

.title-screen .footer {
  position: absolute;
  bottom: 24px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 12px;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: rgba(232, 201, 138, 0.35);
  font-family: Georgia, serif;
}

.title-screen .confirm {
  position: absolute;
  inset: 0;
  background: rgba(8, 5, 3, 0.82);
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 28px;
  z-index: 1;
}

.title-screen .confirm.visible { display: flex; }

.title-screen .confirm .text {
  font-size: 26px;
  font-style: italic;
  color: #f0d29a;
  text-align: center;
  max-width: 540px;
  padding: 0 24px;
  line-height: 1.4;
}

.title-screen .confirm .row {
  display: flex;
  gap: 18px;
}
  `;
  document.head.appendChild(style);
}

export const TitleScreen = {
  root: null,

  /**
   * Show the title screen and resolve once the player chooses a path.
   * Resolves with: { mode: 'continue' } or { mode: 'new' }.
   */
  show({ hasSave } = { hasSave: false }) {
    return new Promise((resolve) => {
      makeStyleTag();

      const root = document.createElement('div');
      root.className = 'title-screen';

      const ember = document.createElement('div');
      ember.className = 'ember';
      root.appendChild(ember);

      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = 'The Hollow Road';
      root.appendChild(title);

      const subtitle = document.createElement('div');
      subtitle.className = 'subtitle';
      subtitle.textContent = 'A fable of travel, trade, and sacrifice';
      root.appendChild(subtitle);

      const menu = document.createElement('div');
      menu.className = 'menu';

      const continueBtn = document.createElement('button');
      continueBtn.type = 'button';
      continueBtn.textContent = 'Continue';
      continueBtn.disabled = !hasSave;
      menu.appendChild(continueBtn);

      const newBtn = document.createElement('button');
      newBtn.type = 'button';
      newBtn.textContent = 'New Game';
      menu.appendChild(newBtn);

      root.appendChild(menu);

      const musicCredit = document.createElement('div');
      musicCredit.className = 'music-credit';
      musicCredit.textContent = 'Music made by sloot';
      root.appendChild(musicCredit);

      const footer = document.createElement('div');
      footer.className = 'footer';
      footer.textContent = 'Press Enter to continue';
      root.appendChild(footer);

      // Confirmation overlay used when overwriting an existing save.
      const confirm = document.createElement('div');
      confirm.className = 'confirm';
      const confirmText = document.createElement('div');
      confirmText.className = 'text';
      confirmText.textContent =
        'Starting a new game will erase your existing save. Continue?';
      const confirmRow = document.createElement('div');
      confirmRow.className = 'row';
      const confirmYes = document.createElement('button');
      confirmYes.type = 'button';
      confirmYes.textContent = 'Begin Anew';
      const confirmNo = document.createElement('button');
      confirmNo.type = 'button';
      confirmNo.textContent = 'Go Back';
      confirmRow.appendChild(confirmYes);
      confirmRow.appendChild(confirmNo);
      confirm.appendChild(confirmText);
      confirm.appendChild(confirmRow);
      root.appendChild(confirm);

      document.body.appendChild(root);
      this.root = root;

      const finish = (mode) => {
        document.removeEventListener('keydown', onKey);
        root.classList.add('fadeout');
        setTimeout(() => {
          root.remove();
          this.root = null;
          resolve({ mode });
        }, 900);
      };

      const showConfirm = () => {
        confirm.classList.add('visible');
        confirmYes.focus();
      };
      const hideConfirm = () => {
        confirm.classList.remove('visible');
      };

      continueBtn.addEventListener('click', () => {
        if (!hasSave) return;
        finish('continue');
      });
      newBtn.addEventListener('click', () => {
        if (hasSave) showConfirm();
        else finish('new');
      });
      confirmYes.addEventListener('click', () => finish('new'));
      confirmNo.addEventListener('click', hideConfirm);

      const onKey = (e) => {
        if (e.key === 'Enter') {
          if (confirm.classList.contains('visible')) {
            finish('new');
          } else if (hasSave) {
            finish('continue');
          } else {
            finish('new');
          }
        } else if (e.key === 'Escape') {
          if (confirm.classList.contains('visible')) hideConfirm();
        }
      };
      document.addEventListener('keydown', onKey);

      // Default focus: Continue if available, else New Game.
      setTimeout(() => {
        (hasSave ? continueBtn : newBtn).focus();
      }, 50);
    });
  },
};
