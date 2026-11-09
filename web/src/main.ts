import { api, live } from './net.ts';
import { connectChain, call, errorText } from './wallet.ts';
import { state, $, walletHtml, refreshMe, toast, txLink, esc } from './state.ts';
import { unlock, startMusic, sound } from './audio.ts';
import { welcome } from './screens/welcome.ts';
import { arrivals } from './screens/arrivals.ts';
import { auction } from './screens/auction.ts';
import { bags } from './screens/bags.ts';
import { board } from './screens/board.ts';
import { tag } from './screens/tag.ts';
import { home, pickBag } from './screens/home.ts';
import { album } from './screens/album.ts';
import { showHowto } from './screens/howto.ts';
import { showSettings } from './ui/settings.ts';
import { ICON } from './ui/bits.ts';
import { coachOff } from './ui/coach.ts';
import { mountSide, wide } from './ui/side.ts';
import { installEsc } from './ui/menu.ts';
import { recordWorth } from './ui/progress.ts';

const app = $('#app');
let cleanup: (() => void) | void;
let sideOff: () => void = () => {};

const NAV: [string, string, keyof typeof ICON][] = [
  ['home', 'HOME', 'home'],
  ['arrivals', 'FLIGHTS', 'plane'],
  ['bags', 'BAGS', 'bag'],
  ['album', 'ALBUM', 'album'],
  ['board', 'BOARD', 'trophy'],
];

/** On a computer the side menu magnifies under the mouse, like a dock. */
function magnify(dock: HTMLElement) {
  const btns = [...dock.querySelectorAll('button')] as HTMLElement[];
  dock.addEventListener('mousemove', (e) => {
    if (!wide()) return;
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      const k = Math.max(0, 1 - Math.abs(e.clientY - (r.top + r.height / 2)) / 130);
      b.style.transform = `translateX(${(k * 8).toFixed(1)}px) scale(${(1 + 0.34 * k).toFixed(3)})`;
    }
  });
  dock.addEventListener('mouseleave', () => btns.forEach((b) => (b.style.transform = '')));
}

function shell(active: string) {
  app.className = 'app-main';
  app.innerHTML = `
    <div class="topbar">
      <button class="brand" id="brand">FINAL CALL <span class="tag">TESTNET</span></button>
      <div id="wallet">${walletHtml()}</div>
      <button class="icon-btn" id="help" aria-label="How to play">${ICON.help}</button>
      <button class="icon-btn" id="gear" aria-label="Settings">${ICON.gear}</button>
    </div>
    <div id="view"></div>
    <nav class="dock" aria-label="Main">
      ${NAV.map(([id, label, icon]) => `<button data-go="#${id}" class="${active === id ? 'on' : ''}">${ICON[icon]}<span>${label}</span>${id === 'bags' && state.pending.length ? '<i class="dot"></i>' : ''}</button>`).join('')}
    </nav>
    <aside class="sidepanel" id="side" aria-label="The floor"></aside>`;
  sideOff = mountSide($('#side'), 'floor');
  magnify($('.dock'));
  ($('#help') as HTMLButtonElement).onclick = () => showHowto();
  ($('#gear') as HTMLButtonElement).onclick = () => { unlock(); sound.tap(); showSettings(); };
  ($('#brand') as HTMLButtonElement).onclick = () => (location.hash = '#home');
  app.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) => (b.onclick = () => { sound.tap(); location.hash = b.dataset.go!; }));
  return $('#view');
}

/** NEXT BAG: straight onto the next good bag, or the lobby if none. */
async function nextBag() {
  await refreshMe().catch(() => {});
  if (state.pending.length) return location.replace('#bags');
  const bags = await api(`/arrivals?account=${encodeURIComponent(state.id!.account)}`).catch(() => []);
  const bag = pickBag(bags);
  location.replace(bag && (state.profile?.miles ?? 0) >= 100 ? `#auction/${bag.id}` : '#home');
}

function auctionShell() {
  app.className = 'app-table';
  app.innerHTML = `
    <div class="topbar">
      <button class="icon-btn" id="back" aria-label="Back">←</button>
      <div class="brand">FINAL CALL</div>
      <div id="wallet">${walletHtml()}</div>
    </div>
    <div id="view" style="flex:1;display:flex;flex-direction:column"></div>
    <aside class="sidepanel" id="side" aria-label="The table"></aside>`;
  sideOff = mountSide($('#side'), 'table');
  ($('#back') as HTMLButtonElement).onclick = () => {
    void live.send({ type: 'fold' });
    location.hash = '#home';
  };
  return $('#view');
}

document.addEventListener('me', () => {
  const w = document.getElementById('wallet');
  if (w) w.innerHTML = walletHtml();
  if (state.profile) recordWorth(state.netWorth);
});

let connectedAs = '';
function ensureConnected() {
  if (!state.id || connectedAs === state.id.account) return;
  connectedAs = state.id.account;
  connectChain(state.id, state.cfg!.rpc, state.cfg!.contract);
  void live.connect(state.id);
}

function route() {
  ensureConnected();
  if (typeof cleanup === 'function') cleanup();
  cleanup = undefined;
  sideOff();
  sideOff = () => {};
  app.className = '';
  coachOff();
  document.querySelectorAll('.overlay').forEach((o) => o.remove());
  const [name, arg] = location.hash.replace(/^#/, '').split('/');
  if (name === 'lot' && arg) {
    const v = state.id ? shell('') : app;
    return void tag(v, Number(arg));
  }
  if (!state.id) return welcome(app);
  if (name === 'auction' && arg) {
    cleanup = auction(auctionShell(), Number(arg));
    return;
  }
  if (name === 'next') return void nextBag();
  if (name === 'bags') cleanup = bags(shell('bags'));
  else if (name === 'board') cleanup = board(shell('board'));
  else if (name === 'arrivals') cleanup = arrivals(shell('arrivals'));
  else if (name === 'album') cleanup = album(shell('album'));
  else cleanup = home(shell('home'));
  window.scrollTo(0, 0);
}

async function payLeftovers() {
  for (const l of state.pending) {
    try {
      const r = await call('pay_lot', { id: l.id });
      await api(`/lot/${l.id}/paid`, { tx: r.hash });
      toast(`Paid for lot ${l.id} you won earlier · ${txLink(r.hash)}`);
    } catch (e) {
      toast(`Could not pay lot ${l.id}: ${esc(errorText(e))}`);
    }
  }
  if (state.pending.length) await refreshMe();
}

async function boot() {
  state.cfg = await api('/config');
  window.addEventListener('hashchange', route);
  installEsc();
  const start = () => {
    unlock();
    startMusic();
    window.removeEventListener('pointerdown', start);
  };
  window.addEventListener('pointerdown', start);
  if (state.id) {
    ensureConnected();
    await refreshMe().catch(() => {});
    void payLeftovers();
  }
  route();
}

void boot();
