// The Esc menu: resume, how to play, settings, and a way
// out. Auctions run on the server clock, so "pause" here is a menu, not a freeze.
import { live } from '../net.ts';
import { sound } from '../audio.ts';
import { showHowto } from '../screens/howto.ts';
import { showSettings } from './settings.ts';

const I = (d: string) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const PLAY = I('<path d="M6 4l14 8-14 8z"/>');
const BOOK = I('<path d="M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>');
const GEAR = I('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>');
const POWER = I('<path d="M18.4 6.6a9 9 0 1 1-12.8 0M12 2v10"/>');

export function toggleMenu() {
  const open = document.querySelector('.pmenu');
  if (open) return void open.remove();
  const inAuction = location.hash.startsWith('#auction');
  const el = document.createElement('div');
  el.className = 'overlay pmenu';
  el.innerHTML = `
    <div class="pm-card">
      <div class="pm-title">${inAuction ? 'TABLE MENU' : 'MENU'}</div>
      ${inAuction ? '<div class="small muted" style="text-align:center">The auction keeps running while this is open.</div>' : ''}
      <button class="pm-b" data-a="resume">${PLAY}<span>RESUME</span></button>
      <button class="pm-b" data-a="help">${BOOK}<span>HOW TO PLAY</span></button>
      <button class="pm-b" data-a="settings">${GEAR}<span>SETTINGS</span></button>
      <button class="pm-b warn" data-a="quit">${POWER}<span>${inAuction ? 'LEAVE THE TABLE' : 'BACK TO HOME'}</span></button>
      <div class="small muted" style="text-align:center"><kbd>Esc</kbd> to close</div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', (e) => e.target === el && el.remove());
  el.querySelectorAll<HTMLButtonElement>('.pm-b').forEach(
    (b) =>
      (b.onclick = () => {
        sound.tap();
        el.remove();
        const a = b.dataset.a;
        if (a === 'help') showHowto();
        else if (a === 'settings') showSettings();
        else if (a === 'quit') {
          if (inAuction) void live.send({ type: 'fold' });
          location.hash = '#home';
        }
      }),
  );
  (el.querySelector('[data-a=resume]') as HTMLButtonElement).focus();
}

/** Esc closes the top sheet if one is open, otherwise opens the menu. */
export function installEsc() {
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const sheets = [...document.querySelectorAll('.overlay')];
    const top = sheets.at(-1);
    if (top && !top.classList.contains('pmenu')) return void top.remove();
    if (!document.querySelector('#app .topbar')) return; // not signed in yet
    toggleMenu();
  });
}
