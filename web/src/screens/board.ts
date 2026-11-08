import { api } from '../net.ts';
import { state, $, fmt, esc, txLink, accLink } from '../state.ts';
import { avatarFor } from '../avatars.ts';
import { ITEM_BY_ID } from '../../../shared/catalog.ts';

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
    <div class="section-title">LIVE FROM THE AUCTION HOUSE</div>
    <div class="feed" id="feed"></div>
  </div>`;
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
