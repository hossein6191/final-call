import { api } from '../net.ts';
import { call, errorText } from '../wallet.ts';
import { state, $, fmt, esc, txLink, accLink, refreshMe, toast } from '../state.ts';
import { ITEM_BY_ID } from '../../../shared/catalog.ts';
import { sound } from '../audio.ts';
import { iconSvg } from '../icons.ts';

const RANK: Record<string, number> = { worn: 0, good: 1, mint: 2 };

export function bags(root: HTMLElement) {
  root.innerHTML = `
  <div class="screen">
    <div class="h1">My Bags</div>
    <div id="pending"></div>
    <div class="small muted" id="acct"></div>
    <div class="inv" id="inv"><div class="locked"><span class="spinner"></span></div></div>
  </div>`;

  let alive = true;
  const busy = new Set<string>();

  const render = async () => {
    const [, mk] = await Promise.all([refreshMe(), api('/market')]);
    if (!alive) return;
    const p = state.profile;
    const demand = new Map<string, number>(mk.market.map((r: any) => [r.item_id, r.demand_bp]));
    const orders = (mk.orders as any[]).filter((o) => o.buyer !== state.id!.account);
    $('#acct', root).innerHTML = `Account ${accLink(state.id!.account)} · items are NEP-245 tokens on <span class="mono">${state.cfg!.contract}</span>`;

    const pend = $('#pending', root);
    pend.innerHTML = state.pending.length
      ? `<div class="panel row"><span class="grow">${state.pending.length} won bag${state.pending.length > 1 ? 's' : ''} waiting for your payment.</span><button class="btn primary" id="paynow" style="min-height:40px;font-size:16px">PAY</button></div>`
      : '';
    const payBtn = pend.querySelector<HTMLButtonElement>('#paynow');
    if (payBtn)
      payBtn.onclick = async () => {
        payBtn.disabled = true;
        for (const l of state.pending) {
          try {
            const r = await call('pay_lot', { id: l.id });
            await api(`/lot/${l.id}/paid`, { tx: r.hash });
            toast(`Paid lot ${l.id} · ${txLink(r.hash)}`);
          } catch (e) {
            toast(`Lot ${l.id}: ${esc(errorText(e))}`);
          }
        }
        void render();
      };

    const inv: [string, number][] = p?.inventory ?? [];
    if (!inv.length) {
      $('#inv', root).innerHTML = `<div class="locked">Nothing yet. Win a bag on the Arrivals board.</div>`;
      return;
    }
    inv.sort((a, b) => (state.prices[b[0]] ?? 0) - (state.prices[a[0]] ?? 0));
    $('#inv', root).innerHTML = inv
      .map(([token, n]) => {
        const [id, cond] = token.split('@');
        const def = ITEM_BY_ID[id];
        const d = demand.get(id) ?? 10000;
        const price = state.prices[token] ?? 0;
        const best = orders
          .filter((o) => o.item_id === id && RANK[cond] >= RANK[o.min_cond])
          .sort((a, b) => b.price_each - a.price_each)[0];
        const rival = best ? state.cfg!.rivals.find((r) => r.account === best.buyer) : null;
        return `<div class="invrow">
          ${iconSvg(id)}
          <div>
            <div class="nm">${esc(def.name)}${n > 1 ? ` <span class="muted">×${n}</span>` : ''}</div>
            <div class="sub">${cond} · dealer <b>${fmt(price)}</b> <span class="${d < 10000 ? 'trend-down' : ''}">${d < 10000 ? `▼ demand ${(d / 100).toFixed(0)}%` : 'full demand'}</span></div>
            ${best ? `<div class="sub order-badge">${esc(rival?.name ?? best.buyer)} wants it: ${fmt(best.price_each)} (+${Math.round((best.price_each / Math.max(1, price) - 1) * 100)}%)</div>` : ''}
          </div>
          <div class="acts">
            ${best ? `<button class="btn go" data-fill="${best.id}" data-token="${token}">${fmt(best.price_each)}</button>` : ''}
            <button class="btn" data-sell="${token}" data-n="1">SELL ${fmt(price)}</button>
          </div>
        </div>`;
      })
      .join('');

    root.querySelectorAll<HTMLButtonElement>('[data-sell]').forEach((b) => {
      b.onclick = async () => {
        const token = b.dataset.sell!;
        if (busy.has(token)) return;
        busy.add(token);
        b.disabled = true;
        b.innerHTML = '<span class="spinner"></span>';
        try {
          const r = await call<number>('sell', { token_id: token, amount: 1 });
          sound.cash();
          toast(`Sold for <b>${fmt(r.value)}</b> MI · ${txLink(r.hash)}`);
        } catch (e) {
          sound.error();
          toast(esc(errorText(e)));
        }
        busy.delete(token);
        void render();
      };
    });
    root.querySelectorAll<HTMLButtonElement>('[data-fill]').forEach((b) => {
      b.onclick = async () => {
        b.disabled = true;
        b.innerHTML = '<span class="spinner"></span>';
        try {
          const r = await call<number>('fill_order', { order_id: Number(b.dataset.fill), token_id: b.dataset.token, amount: 1 });
          sound.cash();
          toast(`A rival paid you <b>${fmt(r.value)}</b> MI from escrow · ${txLink(r.hash)}`);
        } catch (e) {
          sound.error();
          toast(esc(errorText(e)));
        }
        void render();
      };
    });
  };

  void render();
  return () => {
    alive = false;
  };
}
