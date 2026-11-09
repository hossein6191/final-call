import { api } from '../net.ts';
import { state, $, fmt, go, short } from '../state.ts';
import { TERMINALS } from '../../../shared/rules.ts';
import { LADDER } from '../../../shared/catalog.ts';
import { sound } from '../audio.ts';

let tab = 0;

export function arrivals(root: HTMLElement) {
  root.innerHTML = `
  <div class="screen">
    <div class="ticker" id="ticker"><div class="track" id="track">Loading the floor…</div></div>
    <div class="h1">Arrivals</div>
    <div class="small muted">Bags nobody came back for. Each one's contents were sealed on NEAR before it hit the board.</div>
    <div class="terms" id="tabs"></div>
    <div class="board">
      <div class="board-head"><span>FLIGHT</span><span>FROM</span><span style="text-align:right">OPENS</span><span></span></div>
      <div id="rows"><div class="locked"><span class="spinner"></span></div></div>
    </div>
  </div>`;

  const draw = (bags: any[]) => {
    $('#tabs', root).innerHTML = TERMINALS.map((t) => {
      const locked = state.netWorth < t.unlockNetWorth;
      const n = bags.filter((b) => b.tier === t.id).length;
      return `<button data-t="${t.id}" class="term t${t.id} ${t.id === tab ? 'on' : ''} ${locked ? 'locked' : ''}">
        <svg class="term-bg" viewBox="0 0 120 120" aria-hidden="true"><circle class="s1" cx="96" cy="24" r="30"/><rect class="s2" x="-10" y="70" width="70" height="70" rx="12"/></svg>
        <span class="term-k">${t.short}${locked ? ' 🔒' : ''}</span>
        <b>${['Domestic', 'International', 'Lounge'][t.id]}</b>
        <small>${locked ? `opens at ${fmt(t.unlockNetWorth)}` : `${n} bag${n === 1 ? '' : 's'} · finds up to ${fmt(LADDER[t.ladderStart + 4])}`}</small>
        ${locked ? `<i class="term-bar"><i style="width:${Math.min(100, (state.netWorth / t.unlockNetWorth) * 100)}%"></i></i>` : ''}
      </button>`;
    }).join('');
    root.querySelectorAll<HTMLButtonElement>('#tabs .term').forEach((b) => (b.onclick = () => { sound.tap(); tab = Number(b.dataset.t); draw(bags); }));

    const t = TERMINALS[tab];
    const rows = $('#rows', root);
    if (state.netWorth < t.unlockNetWorth) {
      rows.innerHTML = `<div class="locked">Opens at <b>${fmt(t.unlockNetWorth)}</b> net worth.<br><span class="small">You have ${fmt(state.netWorth)}.</span></div>`;
      return;
    }
    const list = bags.filter((b) => b.tier === tab);
    // The welcome bag sits at the top of the domestic board.
    list.sort((a, b) => (b.reserved ? 1 : 0) - (a.reserved ? 1 : 0));
    rows.innerHTML = list.length
      ? list
          .map(
            (b) => `
        <button class="bagrow ${b.reserved ? 'tutorial' : ''}" data-id="${b.id}">
          <div><div class="code">${b.flight.code}</div><div class="meta">Belt ${b.flight.carousel}</div></div>
          <div><div class="city">${b.flight.origin.toUpperCase()}</div><div class="meta">${b.reserved ? '★ Your welcome bag · ' : ''}${b.itemCount} items · ${b.flight.days} days unclaimed</div><div class="hash">tag ${short(b.commitment, 8)}</div></div>
          <div class="open">${fmt(b.opening)}</div>
          <div class="go">BID</div>
        </button>`,
          )
          .join('')
      : `<div class="locked">New bags are landing. One moment.</div>`;
    rows.querySelectorAll<HTMLButtonElement>('.bagrow').forEach((el) => (el.onclick = () => { sound.tap(); go(`#auction/${el.dataset.id}`); }));
  };

  let alive = true;
  const load = async () => {
    const bags = await api(`/arrivals?account=${encodeURIComponent(state.id!.account)}`).catch(() => []);
    const tutorial = state.pending.length === 0 ? bags.find((b: any) => b.reservedFor) : null;
    for (const b of bags) b.reserved = Boolean(b.reservedFor);
    if (tutorial) tab = 0;
    if (alive) draw(bags);
  };
  const news = async () => {
    const b = await api('/board').catch(() => null);
    if (!b || !alive) return;
    const c = state.cfg!.contract;
    const who = (acc: string) => b.people.find((p: any) => p.account === acc)?.name ?? acc.split('.')[0];
    const lines: string[] = [];
    for (const e of b.feed.slice(0, 14)) {
      if (e.kind === 'lot' && e.winner) lines.push(`${who(e.winner)} wins lot ${String(e.id).slice(-4)} for ${fmt(e.price)} MI`);
      if (e.kind === 'rival_sold') lines.push(`${who(`${e.rival}.${c}`)} dumps a bag on the dealer for ${fmt(e.total)}`);
      if (e.kind === 'grounded') lines.push(`BREAKING: ${who(`${e.rival}.${c}`)} is broke and grounded`);
      if (e.kind === 'loan') lines.push(`The House bails out ${who(`${e.rival}.${c}`)} with ${fmt(e.amount)} MI`);
      if (e.kind === 'backed') lines.push(`${e.name} backs ${who(`${e.rival}.${c}`)} with ${fmt(e.amount)} MI and reopens their shop`);
      if (e.kind === 'player_loan') lines.push(`${who(e.account)} takes an emergency loan from the House`);
      if (e.kind === 'order') lines.push(`${who(`${e.rival}.${c}`)} is hunting: pays ${fmt(e.price)} for the right item`);
    }
    const top = b.people[0];
    if (top) lines.unshift(`Top of the board: ${top.name} at ${fmt(top.netWorth)}`);
    const track = $('#track', root);
    if (track) track.textContent = lines.join('   ✈   ') || 'Quiet on the floor. Be the first to bid.';
  };
  void load();
  void news();
  const nt = setInterval(news, 20000);
  const t = setInterval(load, 8000);
  return () => {
    alive = false;
    clearInterval(t);
    clearInterval(nt);
  };
}
