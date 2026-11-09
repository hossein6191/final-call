// The lobby: a live baggage carousel, the player's boarding pass, the next bag to play,
// today's missions, who's on the floor, and a tip.
import { api } from '../net.ts';
import { state, $, fmt, esc, go, toast, accLink, refreshMe, txLink } from '../state.ts';
import { TERMINALS } from '../../../shared/rules.ts';
import { ITEM_BY_ID } from '../../../shared/catalog.ts';
import { AVATARS } from '../avatars.ts';
import { sound } from '../audio.ts';
import { passHtml, wirePass, sharePass, type PassInfo } from '../ui/pass.ts';
import { missions, stampCount, stamps, STAMPS, checkUnlocks } from '../ui/progress.ts';
import { ICON, nextTip, hourglassSvg } from '../ui/bits.ts';
import { coach } from '../ui/coach.ts';

const CASE_COLORS = ['#2f8f83', '#2b4c7e', '#7a1f3d', '#c46a1b', '#5d4a7a', '#3a6b35', '#a33b3b'];

export function carousel() {
  const cases = Array.from({ length: 7 }, (_, i) => {
    const w = 46 + ((i * 37) % 28);
    const h = 30 + ((i * 23) % 14);
    return `<div class="cz" style="--d:${-i * 2.1}s;--w:${w}px;--h:${h}px;--c:${CASE_COLORS[i % CASE_COLORS.length]}"><i></i>${i % 2 ? '<b></b>' : ''}</div>`;
  }).join('');
  return `<div class="carousel" aria-hidden="true"><div class="belt-top"></div>${cases}<div class="belt-front"></div><div class="tunnel l"></div><div class="tunnel r"></div></div>`;
}

export function home(root: HTMLElement) {
  root.innerHTML = `
  <div class="screen home">
    <div class="home-hero">
      <div class="hero-row"><div class="mini-flap">${[...'FINAL CALL'].map((c, i) => (c === ' ' ? '<i></i>' : `<span style="animation-delay:${i * 60}ms">${c}</span>`)).join('')}</div><div class="clock" id="clock"></div></div>
      ${carousel()}
      <div class="hero-sub">Lost luggage auctions. Scan it, outbid AI rivals with real wallets, flip what you find.</div>
    </div>
    <div class="pass-wrap" id="passwrap"></div>
    <button class="play-card" id="play" disabled><div class="pc-l"><small id="playk">NEXT BAG</small><b id="playt">Finding a bag…</b><span id="plays"></span></div><div class="pc-go">${ICON.play}<span>PLAY</span></div></button>
    <div class="section-title row"><span class="grow">TODAY'S MISSIONS</span><span class="muted" style="letter-spacing:0;font-family:var(--body);font-weight:500;font-size:11px">new ones every day</span></div>
    <div class="missions" id="missions"></div>
    <div class="section-title row"><span class="grow">PASSPORT STAMPS</span><a href="#album" class="small">see all ›</a></div>
    <div class="stamp-strip" id="stamps"></div>
    <div class="section-title">ON THE FLOOR</div>
    <div class="floor" id="floor"></div>
    <div class="tipcard" id="tip">${hourglassSvg(18)}<span>${esc(nextTip())}</span></div>
    <div class="menu-grid">
      <button data-h="#arrivals">${ICON.plane}<b>Flights</b><small>All bags on the board</small></button>
      <button data-h="#bags">${ICON.bag}<b>My Bags</b><small>Sell what you found</small></button>
      <button data-h="#album">${ICON.album}<b>Album</b><small>Items you've found</small></button>
      <button data-h="#board">${ICON.trophy}<b>Board</b><small>Rankings and the economy</small></button>
    </div>
  </div>`;

  root.querySelectorAll<HTMLButtonElement>('[data-h]').forEach((b) => (b.onclick = () => { sound.tap(); go(b.dataset.h!); }));
  const clock = () => {
    const c = $('#clock', root);
    if (c) c.textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };
  clock();

  let alive = true;
  let info: PassInfo | null = null;

  const drawPass = () => {
    const p = state.profile;
    const nw = state.netWorth;
    const klass = (nw >= TERMINALS[2].unlockNetWorth ? 2 : nw >= TERMINALS[1].unlockNetWorth ? 1 : 0) as 0 | 1 | 2;
    info = {
      name: state.id!.nickname, account: state.id!.account, netWorth: nw, miles: p?.miles ?? 0, klass,
      rank: info?.rank, bagsWon: info?.bagsWon ?? 0, stamps: stampCount(), stampTotal: STAMPS.length,
    };
    const next = TERMINALS.find((t) => t.unlockNetWorth > nw);
    $('#passwrap', root).innerHTML = `${passHtml(info)}
      <div class="pass-under">
        ${next ? `<div class="unlock"><span>Next: <b>${next.name}</b> at ${fmt(next.unlockNetWorth)}</span><div class="ubar"><i style="width:${Math.min(100, (nw / next.unlockNetWorth) * 100)}%"></i></div></div>` : '<div class="unlock"><span>All terminals open. Welcome to the Lounge.</span></div>'}
        <button class="icon-btn" id="share" aria-label="Share your pass">${ICON.share}</button>
      </div>`;
    wirePass(root.querySelector('.pass'));
    ($('#share', root) as HTMLButtonElement).onclick = async () => {
      sound.tap();
      if (info && (await sharePass(info)) === 'copied') toast('Copied your pass to the clipboard. Paste it anywhere.');
    };
    checkUnlocks(nw, TERMINALS.map((t) => t.unlockNetWorth));
  };

  const drawMissions = () => {
    $('#missions', root).innerHTML = missions()
      .map(
        (m) => `<div class="mission ${m.complete ? 'done' : ''}">
          <div class="mi-check">${m.complete ? '✓' : ''}</div>
          <div class="grow"><b>${esc(m.title)}</b><small>${esc(m.hint)}</small><div class="mbar"><i style="width:${(m.have / m.goal) * 100}%"></i></div></div>
          <div class="mi-n">${m.have}/${m.goal}</div>
        </div>`,
      )
      .join('');
    $('#stamps', root).innerHTML = stamps()
      .sort((a, b) => b.at - a.at)
      .slice(0, 6)
      .map((s) => `<div class="stamp-mini ${s.at ? 'got' : ''}" style="--c:${s.color}" title="${esc(s.title)}: ${esc(s.text)}"><span>${s.glyph}</span></div>`)
      .join('');
  };

  const play = $('#play', root) as HTMLButtonElement;
  const drawPlay = (bags: any[]) => {
    if (state.pending.length) {
      $('#playk', root).textContent = 'ACTION NEEDED';
      $('#playt', root).textContent = 'Pay for the bag you won';
      $('#plays', root).textContent = 'It is waiting in My Bags.';
      play.disabled = false;
      play.onclick = () => go('#bags');
      return;
    }
    const miles = state.profile?.miles ?? 0;
    const mine = bags.find((b) => b.reservedFor);
    const bag = pickBag(bags);
    play.classList.toggle('first', Boolean(mine));
    if (!bag) {
      $('#playt', root).textContent = 'New bags are landing…';
      $('#plays', root).textContent = 'One moment.';
      play.disabled = true;
      return;
    }
    const hasItems = (state.profile?.inventory ?? []).length > 0;
    const broke = !mine && miles < 100;
    play.classList.toggle('broke', broke);
    if (broke) {
      $('#playk', root).textContent = 'OUT OF MILES';
      $('#playt', root).textContent = hasItems ? 'Sell something to get back in' : 'Take an emergency loan';
      $('#plays', root).textContent = hasItems ? 'Your items are worth miles at the Customs Dealer.' : 'The House lends 300 MI to broke travellers. Repay it from later sales.';
      play.disabled = false;
      play.onclick = () => (hasItems ? go('#bags') : brokeSheet());
      return;
    }
    $('#playk', root).textContent = mine ? 'YOUR WELCOME BAG' : `NEXT BAG · ${TERMINALS[bag.tier].name.toUpperCase()}`;
    $('#playt', root).innerHTML = `${esc(bag.flight.code)} from ${esc(bag.flight.origin)}`;
    $('#plays', root).textContent = `Belt ${bag.flight.carousel} · ${bag.itemCount} items · bidding opens at ${fmt(bag.opening)} MI`;
    play.disabled = false;
    play.onclick = () => {
      sound.tap();
      go(`#auction/${bag.id}`);
    };
    if (mine) coach({ step: 'home-play', target: play, title: 'Your first bag is here', text: 'A bag nobody came back for. Tap PLAY: the coach will walk you through scanning, bidding and unzipping it.', hand: 'tap' });
  };

  const drawFloor = (b: any) => {
    const rivals = b.people.filter((p: any) => p.rival);
    $('#floor', root).innerHTML = rivals
      .map((p: any) => {
        const def = state.cfg!.rivals.find((r) => r.account === p.account);
        return `<button class="floor-chip ${p.grounded ? 'grounded' : ''}" data-acc="${esc(p.account)}">${AVATARS[def?.sub ?? ''] ?? ''}<b style="color:${def?.color ?? '#fff'}">${esc(p.name)}</b><small>${p.grounded ? 'grounded' : `${fmt(p.miles ?? p.netWorth)} MI`}</small></button>`;
      })
      .join('');
    root.querySelectorAll<HTMLButtonElement>('.floor-chip').forEach((el) => (el.onclick = () => { sound.tap(); rivalSheet(el.dataset.acc!, b); }));
    const me = b.people.findIndex((p: any) => p.account === state.id!.account);
    if (info && me >= 0) {
      info.rank = me + 1;
      drawPass();
    }
  };

  const load = async () => {
    const [bags, b, found] = await Promise.all([
      api(`/arrivals?account=${encodeURIComponent(state.id!.account)}`).catch(() => []),
      api('/board').catch(() => null),
      api(`/found?account=${encodeURIComponent(state.id!.account)}`).catch(() => null),
      refreshMe().catch(() => null),
    ]);
    if (!alive) return;
    if (found && info) info.bagsWon = found.bags;
    drawPass();
    drawPlay(bags);
    if (b) drawFloor(b);
  };

  drawPass();
  drawMissions();
  void load();
  const onMe = () => alive && drawPass();
  document.addEventListener('me', onMe);
  const t = setInterval(() => void load(), 10000);
  const c = setInterval(clock, 15000);
  const tip = setInterval(() => {
    const el = root.querySelector('#tip span');
    if (el) el.textContent = nextTip();
  }, 9000);
  return () => {
    alive = false;
    clearInterval(t);
    clearInterval(c);
    clearInterval(tip);
    document.removeEventListener('me', onMe);
  };
}

/** The bag to play next: your welcome bag, else the best terminal's cheapest bag you can afford. */
export function pickBag(bags: any[]) {
  const mine = bags.find((b) => b.reservedFor);
  if (mine) return mine;
  const miles = state.profile?.miles ?? 0;
  const unlocked = TERMINALS.filter((t) => state.netWorth >= t.unlockNetWorth).map((t) => t.id);
  const pickable = bags.filter((b) => !b.reservedFor && unlocked.includes(b.tier)).sort((a, b) => b.tier - a.tier || a.opening - b.opening);
  return pickable.find((b) => b.opening <= miles * 0.6) ?? pickable.find((b) => b.opening <= miles) ?? pickable[pickable.length - 1];
}

/** Game over, continue? An emergency loan from the House keeps a broke player in the game. */
export function brokeSheet() {
  const el = document.createElement('div');
  el.className = 'overlay';
  el.innerHTML = `
    <div class="sheet" style="text-align:center">
      <div class="stamp">GROUNDED</div>
      <div class="h1">Out of miles</div>
      <p class="muted" style="margin:0">Every traveller hits a bad run. The House will lend you <b>300 MI</b> so you can get back on the floor. The loan sits on your account as debt and is paid back from later sales.</p>
      <div class="panel small">Tip: bid on Domestic bags while you rebuild. Small bags, small risks.</div>
      <button class="btn primary" id="loan">TAKE 300 MI AND CONTINUE</button>
      <button class="btn ghost" id="lno">NOT NOW</button>
    </div>`;
  document.body.appendChild(el);
  (el.querySelector('#lno') as HTMLButtonElement).onclick = () => el.remove();
  const b = el.querySelector('#loan') as HTMLButtonElement;
  b.onclick = async () => {
    b.disabled = true;
    b.innerHTML = '<span class="spinner"></span> SIGNING ON CHAIN…';
    try {
      const r = await api('/loan', { account: state.id!.account });
      await refreshMe();
      sound.cash();
      toast(`The House lent you <b>${fmt(r.amount)} MI</b> · ${txLink(r.tx)}`);
      el.remove();
      go('#home');
    } catch (e) {
      sound.error();
      toast(esc((e as Error).message));
      b.disabled = false;
      b.textContent = 'TRY AGAIN';
    }
  };
}

/** A rival's profile: who they are, what they love, their real wallet. */
export function rivalSheet(account: string, board: any) {
  const def = state.cfg!.rivals.find((r) => r.account === account);
  const p = board?.people?.find((x: any) => x.account === account);
  if (!def) return;
  const el = document.createElement('div');
  el.className = 'overlay';
  el.innerHTML = `
    <div class="sheet rival-sheet">
      <div class="row"><span class="grow"></span><button class="icon-btn" id="rx" aria-label="Close">✕</button></div>
      <div class="rs-face">${AVATARS[def.sub] ?? ''}</div>
      <div class="h1" style="text-align:center;color:${def.color}">${esc(def.name)}</div>
      <div class="chip" style="align-self:center">${esc(def.title)}</div>
      <p class="rs-bio">${esc(def.bio)}</p>
      <div class="panel rs-grid">
        <div><small>MILES</small><b>${p ? fmt(p.miles ?? 0) : '—'}</b></div>
        <div><small>NET WORTH</small><b>${p ? fmt(p.netWorth) : '—'}</b></div>
        <div><small>STATUS</small><b class="${p?.grounded ? 'trend-down' : 'trend-up'}">${p?.grounded ? 'GROUNDED' : 'BIDDING'}</b></div>
      </div>
      ${def.loves?.length ? `<div class="panel small"><b>Loves:</b> ${def.loves.map((c) => esc(c)).join(', ')}. Sell them these and they pay over the dealer price.</div>` : ''}
      <div class="panel small">How to read them: <span class="muted">${esc(styleTip(def.style))}</span></div>
      <div class="small muted" style="text-align:center">A real NEAR account with its own key · ${accLink(account)}</div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', (e) => e.target === el && el.remove());
  (el.querySelector('#rx') as HTMLButtonElement).onclick = () => el.remove();
}

function styleTip(style: string) {
  return (
    {
      expert: 'Bids only what a bag is worth, and never hesitates. If she stops, the price is too high.',
      whale: 'Deep pockets, short patience. Opens hard, then gets bored. Make him wait.',
      bluffer: 'Bids early and loud to scare you. His early raises mean little.',
      rookie: 'Easily rattled. A jump bid often makes him fold.',
      collector: 'Overpays for music and collectibles. Elsewhere he is careful.',
      bargain: 'Only wants a deal. She leaves the moment a bag gets fair.',
    }[style] ?? 'Watch for the thinking dots: they mean a rival is near their limit.'
  );
}

export { ITEM_BY_ID };
