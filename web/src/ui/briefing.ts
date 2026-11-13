// The round briefing: before a bag rolls in, a box says how the round works and what is
// on the belt. The round starts when the player presses START (or Space).
import { api } from '../net.ts';
import { state, fmt, esc } from '../state.ts';
import { TERMINALS } from '../../../shared/rules.ts';
import { sound, unlock } from '../audio.ts';
import { mountHourglass } from './hourglass.ts';
import { nextTip } from './bits.ts';
import { levelPicker, wireLevel } from './level.ts';

const OFF = 'fc:brief-off';
export const briefingOff = () => {
  try {
    return localStorage.getItem(OFF) === '1';
  } catch {
    return false;
  }
};
export function setBriefing(on: boolean) {
  try {
    on ? localStorage.removeItem(OFF) : localStorage.setItem(OFF, '1');
  } catch {}
}

/** Shows the briefing over `host` and resolves when the player starts the round. */
export function briefing(host: HTMLElement, lotId: number): Promise<void> {
  if (briefingOff()) return Promise.resolve();
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'brief';
    el.innerHTML = `
      <div class="brief-card">
        <div class="brief-top">
          <div class="brief-hg"></div>
          <div class="grow">
            <small id="bk">BAG ON THE BELT</small>
            <b id="bt">Lot ${lotId}</b>
            <span id="bs">Loading the tag…</span>
          </div>
        </div>
        <div class="section-title" style="margin:0">HOW THIS ROUND WORKS</div>
        <div class="brief-steps">
          <div><i>1</i><div><b>Scan it · a few seconds</b><span>Drag across the bag on the X-ray. Tap an item to see what it is worth. Dark pouches stay sealed until someone wins.</span></div></div>
          <div><i>2</i><div><b>Bid against AI rivals</b><span>Each bid restarts a 5-second clock: <em>going once</em> at 2 s, <em>going twice</em> at 3.5 s, <em>SOLD</em> at 5 s. After 25 s every step doubles. Rivals have real wallets and limits.</span></div></div>
          <div><i>3</i><div><b>Open it and sell</b><span>Win the bag, crack the pouches, then sell what is inside. Profit is what is inside minus what you paid.</span></div></div>
        </div>
        <div class="section-title" style="margin:0">RIVALS</div>
        ${levelPicker()}
        <div class="brief-tip">💡 ${esc(nextTip())}</div>
        <label class="brief-skip"><input type="checkbox" id="bskip"/> Don't show this before every bag</label>
        <button class="btn primary" id="bgo">START <span class="kbd">Space</span></button>
      </div>`;
    host.appendChild(el);
    wireLevel(el, () => sound.tap());
    const stop = mountHourglass(el.querySelector('.brief-hg') as HTMLElement, 5, 46);
    void api(`/lot/${lotId}`)
      .then((b) => {
        if (!el.isConnected) return;
        (el.querySelector('#bk') as HTMLElement).textContent = `${TERMINALS[b.tier].name.toUpperCase()} · BELT ${b.flight.carousel}`;
        (el.querySelector('#bt') as HTMLElement).textContent = `${b.flight.code} from ${b.flight.origin}`;
        (el.querySelector('#bs') as HTMLElement).textContent = `${b.itemCount} items · ${b.flight.days} days unclaimed · bidding opens at ${fmt(b.opening)} MI · you have ${fmt(state.profile?.miles ?? 0)} MI`;
      })
      .catch(() => {});
    const go = () => {
      unlock();
      sound.tap();
      if ((el.querySelector('#bskip') as HTMLInputElement).checked) setBriefing(false);
      window.removeEventListener('keydown', onKey, true);
      stop();
      el.classList.add('out');
      setTimeout(() => el.remove(), 220);
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        go();
      }
    };
    window.addEventListener('keydown', onKey, true);
    (el.querySelector('#bgo') as HTMLButtonElement).onclick = go;
  });
}
