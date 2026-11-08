import { api } from '../net.ts';
import { state, $, fmt, esc, txLink, accLink } from '../state.ts';
import { avatarFor } from '../avatars.ts';
import { ITEM_BY_ID } from '../../../shared/catalog.ts';
import { simulateWeek } from '../../../shared/sim.ts';
import { sound } from '../audio.ts';

/** A week of auctions with the real rules, drawn as each bidder's net worth over time. */
function fastForward(box: HTMLElement) {
  const seed = Math.floor(Date.now() / 86_400_000);
  const r = simulateWeek(seed);
  const W = 340;
  const H = 190;
  const n = r.bidders[0].history.length;
  const y = (v: number) => H - 12 - ((Math.log10(Math.max(50, v)) - Math.log10(50)) / (Math.log10(80000) - Math.log10(50))) * (H - 24);
  const x = (i: number) => 8 + (i / (n - 1)) * (W - 16);
  const lines = r.bidders
    .map((b) => {
      const d = b.history.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
      return `<path d="${d}" fill="none" stroke="${b.color}" stroke-width="${b.def ? 2.2 : 1.2}" ${b.def ? '' : 'stroke-dasharray="3 3"'} pathLength="1" class="ffline"/>`;
    })
    .join('');
  const days = Array.from({ length: 8 }, (_, d) => `<line x1="${x((d * (n - 1)) / 7)}" x2="${x((d * (n - 1)) / 7)}" y1="6" y2="${H - 10}" stroke="rgba(255,255,255,.06)"/><text x="${x((d * (n - 1)) / 7) + 2}" y="${H - 1}" fill="#8a9bb8" font-size="9">d${d}</text>`).join('');
  const broke = [...new Set(r.bankruptcies.map((b) => b.name))];
  const sorted = [...r.bidders].sort((a, b) => b.history.at(-1)! - a.history.at(-1)!);
  const dips = Object.entries(r.demand).map(([id, v]) => `${esc(ITEM_BY_ID[id].name)} fell to ${(Math.min(...v) / 100).toFixed(0)}%`).slice(0, 3);
  box.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="ffchart" role="img" aria-label="Net worth over a simulated week">${days}${lines}</svg>
    <div class="fflegend">${sorted.map((b) => `<span><i style="background:${b.color}"></i>${esc(b.name)} ${fmt(b.history.at(-1)!)}</span>`).join('')}</div>
    <div class="small muted">${r.lots} lots in 7 simulated days, same bag generator, X-ray estimates, rival personalities and dealer demand as the live game.
    ${broke.length ? `Went broke at least once: <b>${broke.map(esc).join(', ')}</b>.` : ''}
    ${r.bestFlip ? `Best flip: ${esc(r.bestFlip.name)} paid ${fmt(r.bestFlip.paid)} for ${fmt(r.bestFlip.worth)}.` : ''}
    Dealer demand: ${dips.join(', ')}.</div>`;
  sound.whoosh();
}

function ago(ts: number) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
}

function nameOf(people: any[], acc: string) {
  return people.find((p) => p.account === acc)?.name ?? acc.split('.')[0];
}

export function board(root: HTMLElement) {
  root.innerHTML = `
  <div class="screen">
    <div class="h1">Board</div>
    <div class="small muted">Everyone's miles and items are read live from the contract. Rivals win, lose, borrow and go broke on their own.</div>
    <div class="lb" id="lb"><div class="locked"><span class="spinner"></span></div></div>
    <div class="section-title">ECONOMY FAST-FORWARD</div>
    <div class="panel" id="ff"><button class="btn primary" id="ffgo" style="width:100%">SIMULATE A WEEK</button><div class="small muted" style="margin-top:8px">Runs 7 days of auctions between the six rivals and four bot players with the live rules, in your browser, in under a second.</div></div>
    <div class="section-title">LIVE FROM THE AUCTION HOUSE</div>
    <div class="feed" id="feed"></div>
  </div>`;
  ($('#ffgo', root) as HTMLButtonElement).onclick = () => fastForward($('#ff', root));
  let alive = true;
  const load = async () => {
    const b = await api('/board').catch(() => null);
    if (!b || !alive) return;
    const c = state.cfg!.contract;
    $('#lb', root).innerHTML = b.people
      .slice(0, 30)
      .map(
        (p: any, i: number) => `<div class="lbrow ${p.account === state.id?.account ? 'me' : ''}">
        <div class="rank">${i + 1}</div>
        ${avatarFor(p.account, p.name, c)}
        <div><div class="nm" ${p.color ? `style="color:${p.color}"` : ''}>${esc(p.name)}${p.rival ? ` <span class="chip">${esc(p.title ?? 'rival')}</span>` : ''}${p.grounded ? ' <span class="chip warn">grounded</span>' : ''}</div>
        <div class="sub">${fmt(p.miles)} MI + ${fmt(p.items)} in items${p.debt ? ` − ${fmt(p.debt)} debt` : ''} · ${p.won} bags · ${accLink(p.account, 'account')}</div></div>
        <div class="nw">${fmt(p.netWorth)}</div>
      </div>`,
      )
      .join('');
    $('#feed', root).innerHTML = b.feed
      .map((e: any) => {
        let text = '';
        if (e.kind === 'lot') text = e.winner ? `<b>${esc(e.name ?? nameOf(b.people, e.winner))}</b> won lot ${e.id} for ${fmt(e.price)} MI` : `Lot ${e.id} went unsold`;
        else if (e.kind === 'rival_sold') text = `<b>${esc(nameOf(b.people, `${e.rival}.${c}`))}</b> sold lot ${e.lot}'s goods to the dealer for ${fmt(e.total)} MI`;
        else if (e.kind === 'grounded') text = `<b>${esc(nameOf(b.people, `${e.rival}.${c}`))}</b> is broke and grounded for 30 minutes`;
        else if (e.kind === 'loan') text = `The House lent <b>${esc(nameOf(b.people, `${e.rival}.${c}`))}</b> ${fmt(e.amount)} MI`;
        else if (e.kind === 'order') text = `<b>${esc(nameOf(b.people, `${e.rival}.${c}`))}</b> posted a buy order: ${esc(ITEM_BY_ID[e.item]?.name ?? e.item)} at ${fmt(e.price)}`;
        else if (e.kind === 'sealed') text = `${e.ids.length} new bags sealed on the board`;
        else return '';
        return `<div class="ev"><time>${ago(e.ts)}</time><span class="grow">${text}</span>${e.tx ? txLink(e.tx, 'tx') : ''}</div>`;
      })
      .join('');
  };
  void load();
  const t = setInterval(load, 6000);
  return () => {
    alive = false;
    clearInterval(t);
  };
}
