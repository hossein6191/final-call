import { api } from '../net.ts';
import { call, errorText } from '../wallet.ts';
import { state, $, fmt, esc, txLink, accLink, refreshMe, toast } from '../state.ts';
import { ITEM_BY_ID } from '../../../shared/catalog.ts';
import { sound } from '../audio.ts';
import { iconSvg } from '../icons.ts';
import { LADDER } from '../../../shared/catalog.ts';
import { COND_BP, DEMAND } from '../../../shared/rules.ts';
import { coach } from '../ui/coach.ts';
import { track } from '../ui/progress.ts';
import { ICON } from '../ui/bits.ts';

const RANK: Record<string, number> = { worn: 0, good: 1, mint: 2 };

/** Coins fly from the button to the wallet along a curve. */
function coinFlight(from: HTMLElement, amount: number) {
  const to = document.querySelector('#wallet .miles') as HTMLElement | null;
  if (!to) return;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const n = Math.max(3, Math.min(10, Math.round(amount / 25)));
  for (let i = 0; i < n; i++) {
    const c = document.createElement('div');
    c.className = 'coin';
    document.body.appendChild(c);
    const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2;
    const x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
    const cx = (x0 + x1) / 2 + (Math.random() - 0.5) * 120, cy = Math.min(y0, y1) - 80 - Math.random() * 60;
    const t0 = performance.now() + i * 40;
    const step = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - t0) / 420));
      const e = k * k * (3 - 2 * k);
      const x = (1 - e) * (1 - e) * x0 + 2 * (1 - e) * e * cx + e * e * x1;
      const y = (1 - e) * (1 - e) * y0 + 2 * (1 - e) * e * cy + e * e * y1;
      c.style.transform = `translate(${x - 8}px, ${y - 8}px) scale(${1 - k * 0.4})`;
      if (k < 1) requestAnimationFrame(step);
      else {
        c.remove();
        if (i === n - 1) {
          to.classList.remove('bump');
          void to.offsetWidth;
          to.classList.add('bump');
        }
      }
    };
    requestAnimationFrame(step);
  }
}

export function bags(root: HTMLElement) {
  root.innerHTML = `
  <div class="screen">
    <div class="h1">My Bags</div>
    <div id="pending"></div>
    <div id="stakes"></div>
    <div class="small muted" id="acct"></div>
    <div class="inv" id="inv"><div class="locked"><span class="spinner"></span></div></div>
  </div>`;

  let alive = true;
  let demandNow = new Map<string, number>();
  const busy = new Set<string>();

  const render = async () => {
    const [, mk, st] = await Promise.all([refreshMe(), api('/market'), api(`/stakes?account=${encodeURIComponent(state.id!.account)}`).catch(() => null)]);
    if (!alive) return;
    const mine: any[] = st?.mine ?? [];
    $('#stakes', root).innerHTML = mine.length
      ? `<div class="section-title">YOUR STAKES IN RIVALS</div>${mine
          .map((x) => `<div class="stake"><div class="grow"><b>${esc(x.name)}</b><small>You put in ${fmt(x.invested)} · owed ${fmt(x.owed)} · paid back ${fmt(x.paid)}</small><div class="ubar"><i style="width:${(x.paid / x.owed) * 100}%"></i></div></div><span>${fmt(x.owed - x.paid)}<small>MI to come</small></span></div>`)
          .join('')}<div class="small muted">The contract pays you half of whatever each rival earns at the dealer until you are paid back.</div>`
      : '';
    const p = state.profile;
    const demand = new Map<string, number>(mk.market.map((r: any) => [r.item_id, r.demand_bp]));
    demandNow = demand;
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
            <div class="sub">${cond} · dealer <b>${fmt(price)}</b> <span class="${d < 10000 ? 'trend-down' : ''}">${d < 10000 ? `▼ demand ${(d / 100).toFixed(0)}%` : 'full demand'}</span> <button class="why" data-why="${token}" aria-label="Why this price">${ICON.info}</button></div>
            ${best ? `<div class="sub order-badge">${esc(rival?.name ?? best.buyer)} wants it: ${fmt(best.price_each)} (+${Math.round((best.price_each / Math.max(1, price) - 1) * 100)}%)</div>` : ''}
          </div>
          <div class="acts">
            ${best ? `<button class="btn go" data-fill="${best.id}" data-token="${token}">${fmt(best.price_each)}</button>` : ''}
            <button class="btn" data-sell="${token}" data-n="1">SELL ${fmt(price)}</button>
          </div>
        </div>`;
      })
      .join('');

    coach({ step: 'b-sell', target: root.querySelector('[data-sell]'), hand: 'tap', title: 'Sell for miles', text: 'The Customs Dealer buys anything, instantly. Tap ⓘ to see how the price is set. Purple offers are rival collectors paying more.' });
    root.querySelectorAll<HTMLButtonElement>('[data-sell]').forEach((b) => {
      b.onclick = async () => {
        const token = b.dataset.sell!;
        if (busy.has(token)) return;
        busy.add(token);
        b.disabled = true;
        b.innerHTML = '<span class="spinner"></span>';
        try {
          const r = await call<number>('sell', { token_id: token, amount: 1 });
          coinFlight(b, r.value);
          sound.cash();
          track('sell');
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
          coinFlight(b, r.value);
          sound.cash();
          track('fill');
          toast(`A rival paid you <b>${fmt(r.value)}</b> MI from escrow · ${txLink(r.hash)}`);
        } catch (e) {
          sound.error();
          toast(esc(errorText(e)));
        }
        void render();
      };
    });
  };

  root.addEventListener('click', (e) => {
    const w = (e.target as HTMLElement).closest('[data-why]') as HTMLElement | null;
    if (w) whyPrice(w.dataset.why!, demandNow.get(w.dataset.why!.split('@')[0]) ?? 10000, state.prices[w.dataset.why!] ?? 0);
  });
  void render();
  return () => {
    alive = false;
  };
}

/** "Why this price?": the dealer's pricing rule, worked through for this item. */
function whyPrice(token: string, demandBp: number, price: number) {
  const [id, cond] = token.split('@');
  const def = ITEM_BY_ID[id];
  const base = LADDER[def.level];
  const condPct = COND_BP[cond as keyof typeof COND_BP] / 100;
  const el = document.createElement('div');
  el.className = 'overlay';
  el.innerHTML = `
    <div class="sheet">
      <div class="row"><div class="h1 grow">Why ${fmt(price)} MI?</div><button class="icon-btn" id="wx" aria-label="Close">✕</button></div>
      <div class="panel why-math">
        <div><span>Base value · ${esc(def.name)}</span><b>${fmt(base)}</b></div>
        <div><span>× Condition · ${esc(cond)}</span><b>${condPct}%</b></div>
        <div><span>× Demand right now</span><b class="${demandBp < 10000 ? 'trend-down' : ''}">${(demandBp / 100).toFixed(0)}%</b></div>
        <div class="tot"><span>Dealer pays</span><b>${fmt(price)} MI</b></div>
      </div>
      <div class="panel small" style="line-height:1.5">
        The Customs Dealer is a contract on NEAR, not a person. Every sale of an item lowers its demand by
        <b>${Math.round((1 - DEMAND.perSaleFactor) * 100)}%</b> for everyone, down to a floor of <b>${DEMAND.floorBp / 100}%</b>.
        Demand climbs back <b>${DEMAND.recoverBpPerHour / 100}%</b> an hour. Flood the market and prices fall; wait and they recover.
        <br><span class="muted">The rule lives in one file: shared/rules.ts (DEMAND), and the contract applies it on chain.</span>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', (e) => e.target === el && el.remove());
  (el.querySelector('#wx') as HTMLButtonElement).onclick = () => el.remove();
}
