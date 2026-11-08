// The "How to play" box: shown on the first visit, and from the ? button any time.
import { iconSvg, XRAY } from '../icons.ts';
import { sound } from '../audio.ts';

const SEEN = 'fc:howto';

export function howtoSeen(): boolean {
  try {
    return localStorage.getItem(SEEN) === '1';
  } catch {
    return false;
  }
}

const CASE = `<svg viewBox="0 0 64 64" width="54" height="54" aria-hidden="true"><rect x="8" y="20" width="48" height="34" rx="7" fill="#2f8f83"/><rect x="24" y="11" width="16" height="10" rx="4" fill="none" stroke="#1b3b37" stroke-width="4"/><rect x="40" y="18" width="14" height="9" rx="2" fill="#f4e9c8"/><path d="M18 26v24M46 26v24" stroke="rgba(255,255,255,.15)" stroke-width="3"/></svg>`;
const GAVEL = `<svg viewBox="0 0 64 64" width="54" height="54" aria-hidden="true"><rect x="8" y="14" width="30" height="16" rx="4" transform="rotate(-30 23 22)" fill="#8b5a2b"/><rect x="26" y="26" width="6" height="34" rx="3" transform="rotate(-30 29 43)" fill="#a0522d"/><rect x="34" y="52" width="24" height="6" rx="2" fill="#5c3a1e"/></svg>`;

export function showHowto(onClose?: () => void) {
  document.querySelector('.howto')?.remove();
  const el = document.createElement('div');
  el.className = 'overlay howto';
  el.innerHTML = `
    <div class="sheet">
      <div class="h1" style="text-align:center">How to play</div>
      <div class="small muted" style="text-align:center">Lost luggage goes under the hammer. Buy low, flip high, climb the board.</div>
      <div class="steps">
        <div class="hstep"><div class="art">${CASE}</div><div><b>1 · A lost bag rolls in</b><p>Its contents were sealed on NEAR before it reached the board, so nobody can swap what's inside after you bid.</p></div></div>
        <div class="hstep"><div class="art xr">${iconSvg('film-camera', { xray: XRAY.metal, size: 54 })}</div><div><b>2 · Scan it (6 seconds)</b><p>Drag the X-ray beam across the bag. Tap or hold an item to see its value. Dark pouches hide things: <em>heavy</em> or <em>glinting</em> ones can be worth a lot.</p></div></div>
        <div class="hstep"><div class="art">${GAVEL}</div><div><b>3 · Bid</b><p>Tap <b>BID</b> to raise. Every bid restarts the clock: going once, going twice, <b>SOLD</b>. Your rivals have real wallets and limits. When one hesitates, they're near theirs.</p></div></div>
        <div class="hstep"><div class="art">${iconSvg('gold-bar', { size: 54 })}</div><div><b>4 · Unzip and sell</b><p>Open the bag and crack the pouches. Sell to the Customs Dealer, or to a rival collector who wants that piece. Every sale lowers that item's price for everyone.</p></div></div>
      </div>
      <div class="panel small">No wallet needed: your browser holds the only key to your account, and every payment is signed by you in the background. Runs on NEAR testnet; miles are play money.</div>
      <div class="small muted keys">On a computer: <b>Space</b> bid · <b>J</b> jump · <b>F</b> fold · drag with the mouse to scan.</div>
      <button class="btn primary" id="hgo">LET'S GO</button>
    </div>`;
  document.body.appendChild(el);
  (el.querySelector('#hgo') as HTMLButtonElement).onclick = () => {
    try {
      localStorage.setItem(SEEN, '1');
    } catch {}
    sound.tap();
    el.remove();
    onClose?.();
  };
}
