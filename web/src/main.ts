import { api, live } from './net.ts';
import { connectChain, call, errorText } from './wallet.ts';
import { state, $, walletHtml, refreshMe, toast, txLink, esc } from './state.ts';
import { unlock, toggleMute, isMuted, startMusic, sound } from './audio.ts';
import { welcome } from './screens/welcome.ts';
import { arrivals } from './screens/arrivals.ts';
import { auction } from './screens/auction.ts';
import { bags } from './screens/bags.ts';
import { board } from './screens/board.ts';
import { tag } from './screens/tag.ts';
import { showHowto } from './screens/howto.ts';

const app = $('#app');
let cleanup: (() => void) | void;

function shell(active: string) {
  app.innerHTML = `
    <div class="topbar">
      <div class="brand">FINAL CALL <span class="tag">TESTNET</span></div>
      <div id="wallet">${walletHtml()}</div>
      <button class="icon-btn" id="help" aria-label="How to play">?</button>
      <button class="icon-btn" id="mute" aria-label="Sound">${isMuted() ? '🔇' : '🔊'}</button>
    </div>
    <div id="view"></div>
    <nav class="nav">
      <button data-go="#arrivals" class="${active === 'arrivals' ? 'on' : ''}">ARRIVALS</button>
      <button data-go="#bags" class="${active === 'bags' ? 'on' : ''}">MY BAGS${state.pending.length ? '<span class="dot"></span>' : ''}</button>
      <button data-go="#board" class="${active === 'board' ? 'on' : ''}">BOARD</button>
    </nav>`;
  ($('#help') as HTMLButtonElement).onclick = () => showHowto();
  ($('#mute') as HTMLButtonElement).onclick = () => {
    unlock();
    $('#mute').textContent = toggleMute() ? '🔇' : '🔊';
  };
  app.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) => (b.onclick = () => { sound.tap(); location.hash = b.dataset.go!; }));
  return $('#view');
}

function auctionShell() {
  app.innerHTML = `
    <div class="topbar">
      <button class="icon-btn" id="back" aria-label="Back">←</button>
      <div class="brand">FINAL CALL</div>
      <div id="wallet">${walletHtml()}</div>
    </div>
    <div id="view" style="flex:1;display:flex;flex-direction:column"></div>`;
  ($('#back') as HTMLButtonElement).onclick = () => {
    void live.send({ type: 'fold' });
    location.hash = '#arrivals';
  };
  return $('#view');
}

document.addEventListener('me', () => {
  const w = document.getElementById('wallet');
  if (w) w.innerHTML = walletHtml();
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
  document.querySelector('.overlay')?.remove();
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
  if (name === 'bags') cleanup = bags(shell('bags'));
  else if (name === 'board') cleanup = board(shell('board'));
  else cleanup = arrivals(shell('arrivals'));
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
