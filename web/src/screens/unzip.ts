import { live, api } from '../net.ts';
import { call, errorText } from '../wallet.ts';
import { state, $, fmt, esc, go, txLink, rarityOf, valueOf, RARITY_NAMES, refreshMe, toast } from '../state.ts';
import { ITEM_BY_ID } from '../../../shared/catalog.ts';
import { commitmentPreimage, type BagItem } from '../../../shared/rules.ts';
import { iconSvg } from '../icons.ts';
import { sound, buzz, tension } from '../audio.ts';
import { coach, coachOff, coachActive } from '../ui/coach.ts';
import { track } from '../ui/progress.ts';

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function confetti(strong = false) {
  const c = document.createElement('canvas');
  c.className = 'confetti';
  c.width = innerWidth;
  c.height = innerHeight;
  document.body.appendChild(c);
  const g = c.getContext('2d')!;
  const colors = ['#ffd23f', '#3ddc84', '#4aa8ff', '#ff9a3c', '#b06cff'];
  const parts = Array.from({ length: strong ? 160 : 70 }, () => ({
    x: innerWidth / 2, y: innerHeight * 0.4, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
    s: 4 + Math.random() * 5, c: colors[Math.floor(Math.random() * colors.length)], r: Math.random() * 6,
  }));
  let frames = 0;
  const step = () => {
    g.clearRect(0, 0, c.width, c.height);
    for (const p of parts) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.45;
      p.r += 0.2;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.r);
      g.fillStyle = p.c;
      g.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
      g.restore();
    }
    if (++frames < 110) requestAnimationFrame(step);
    else c.remove();
  };
  step();
}

export async function loadDemand(): Promise<Map<string, number>> {
  const m = await api('/market').catch(() => ({ market: [] }));
  return new Map(m.market.map((r: any) => [r.item_id, r.demand_bp]));
}

export function showSold(m: any) {
  const won = m.winner === m.me;
  const items: BagItem[] = m.items;
  const el = document.createElement('div');
  el.className = 'overlay';
  el.innerHTML = `
    <div class="sheet">
      <div class="stamp ${won ? 'win' : ''}">${won ? 'YOURS!' : m.winner ? 'SOLD' : 'NO SALE'}</div>
      <div class="case3d tier${m.tier}" id="case3d"><div class="lid"><i></i></div><div class="base"><b>${esc(m.flight?.code ?? '')}</b></div></div>
      <div class="result-line">${
        won
          ? `You won ${esc(m.flight?.code ?? '')} for <b>${fmt(m.price)} MI</b>${m.reaction ? `<div class="reaction"><b>${esc(m.reaction.name)}:</b> “${esc(m.reaction.line)}”</div>` : ''}`
          : m.winner
            ? `<b>${esc(m.winnerName)}</b> took it for <b>${fmt(m.price)} MI</b>${m.line ? ` · “${esc(m.line)}”` : ''}`
            : 'Nobody bid. The bag goes back to storage.'
      }</div>
      ${won ? `<div class="profit"><i id="pbar" style="width:0%"></i><div class="be" id="pbe"></div><span><b id="ptotal">0</b><b id="pdiff">−${fmt(m.price)}</b></span></div>` : ''}
      <div class="items" id="items"></div>
      ${won ? `<button class="btn" id="openall" hidden>OPEN ALL POUCHES</button>` : ''}
      <div id="summary" class="result-line"></div>
      <div class="panel verify" id="verify">
        <div class="section-title" style="margin:0">PROOF</div>
        <div class="line"><i>🔒</i><span>Tag sealed on NEAR before bidding opened · ${m.sealedTx ? txLink(m.sealedTx) : '…'}</span></div>
        <div class="line" id="v-local"><i><span class="spinner"></span></i><span>Checking the tag in your browser…</span></div>
        <div class="line" id="v-chain"><i><span class="spinner"></span></i><span>House reveals contents on chain…</span></div>
        ${won ? `<div class="line" id="v-pay"><i><span class="spinner"></span></i><span>Paying with your own key…</span></div>` : m.winner ? `<div class="line" id="v-pay"><i><span class="spinner"></span></i><span>${esc(m.winnerName)} pays with their key…</span></div>` : ''}
        <div class="line"><i>🔎</i><a href="#lot/${m.lotId}">Full tag check for lot ${m.lotId}</a></div>
      </div>
      <div class="big-actions">
        <button class="btn" id="tobags">${won ? 'SELL ITEMS' : 'MY BAGS'}</button>
        <button class="btn primary" id="next">NEXT BAG</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  const close = (hash: string) => {
    coachOff();
    el.remove();
    go(hash);
  };
  ($('#next', el) as HTMLButtonElement).onclick = () => close('#next');
  ($('#tobags', el) as HTMLButtonElement).onclick = () => close('#bags');

  // ---- local tag check ----
  void sha256hex(commitmentPreimage(state.cfg!.contract, m.lotId, m.tier, items, m.salt)).then((h) => {
    const ok = h === m.commitment;
    $('#v-local', el).innerHTML = `<i>${ok ? '✅' : '❌'}</i><span>${ok ? 'sha256(contents + salt) matches the tag' : 'Mismatch! The reveal does not match the tag.'} <span class="hash">${h.slice(0, 16)}…</span></span>`;
  });

  // ---- unzip ----
  let total = 0;
  let crossed = false;
  const box = $('#items', el);
  const tiles = items.map((it) => {
    const t = document.createElement('div');
    t.className = `item ${it.pouch ? 'pouch' : ''}`;
    t.innerHTML = it.pouch ? '<div class="q">?</div><div class="cond">sealed pouch</div>' : '';
    box.appendChild(t);
    return t;
  });
  let demand = new Map<string, number>();

  const update = () => {
    if (!won) return;
    const pct = Math.min(100, (total / Math.max(1, m.price * 2)) * 100);
    const bar = $('#pbar', el);
    bar.style.width = `${pct}%`;
    bar.classList.toggle('green', total >= m.price);
    ($('#pbe', el) as HTMLElement).style.left = '50%';
    $('#ptotal', el).textContent = `${fmt(total)} MI inside`;
    const diff = total - m.price;
    $('#pdiff', el).textContent = `${diff >= 0 ? '+' : '−'}${fmt(Math.abs(diff))}`;
    if (!crossed && total >= m.price) {
      crossed = true;
      track('profit');
      sound.breakEven();
      confetti();
    }
  };

  const ticker = (el: HTMLElement, to: number, ms: number, notes = 0) => {
    const t0 = performance.now();
    let played = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      el.textContent = fmt(to * (1 - Math.pow(1 - k, 3)));
      while (played < notes && k >= played / notes) tension.count(played++);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const revealTile = (i: number) => {
    const it = items[i];
    const t = tiles[i];
    const rar = rarityOf(it.id, m.tier);
    const value = valueOf(it.id, it.cond, demand.get(it.id) ?? 10000);
    t.className = `item in pop r-${RARITY_NAMES[rar]}`;
    t.innerHTML = `${iconSvg(it.id)}<div class="nm">${esc(ITEM_BY_ID[it.id].name)}</div><div class="val">0</div><div class="cond">${it.cond} · ${RARITY_NAMES[rar]}</div>`;
    // count-up length grows with value (log scale), rarer items get more rising notes
    ticker(t.querySelector('.val') as HTMLElement, value, Math.min(1500, 150 + Math.log10(Math.max(10, value)) * 300), rar >= 2 ? 3 + rar : 0);
    total += value;
    if (won && rar >= 3) track('treasure');
    if (won && rar >= 4) track('legendary');
    sound.pop(rar);
    if (rar >= 3) buzz(rar >= 4 ? [80, 40, 160] : 50);
    if (rar >= 3) tension.rumble(rar - 2);
    if (rar >= 4) {
      confetti(true);
      rays();
    }
    update();
  };

  // A pouch hesitates longer and glows its colour before it opens: rarer = longer.
  const openPouch = (i: number) => {
    const t = tiles[i];
    if (!t.classList.contains('pouch')) return;
    const rar = rarityOf(items[i].id, m.tier);
    const last = tiles.filter((x) => x.classList.contains('pouch')).length === 1;
    if (won) track('pouch');
    if (coachActive('u-pouch')) coachOff();
    // The last pouch decides the bag: drumroll, slow motion, longer hold.
    const wait = last ? Math.max(1400, [320, 420, 650, 900, 1300][rar] + 900) : [320, 420, 650, 900, 1300][rar];
    t.classList.remove('pouch');
    t.classList.add(last ? 'slowmo' : 'wobble', `tell-${RARITY_NAMES[rar]}`);
    t.style.setProperty('--wobble', `${wait}ms`);
    if (last) tension.drumroll(wait);
    else tension.rise(rar);
    sound.crack();
    setTimeout(() => {
      revealTile(i);
      if (last && won) setTimeout(() => (total < m.price ? tension.deflate() : null), 500);
      if (last && won) setTimeout(afterAll, 900);
      if (last && !won) setTimeout(verdict, 500);
    }, wait);
  };

  const rays = () => {
    const r = document.createElement('div');
    r.className = 'rays';
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 1800);
  };

  const afterAll = () => {
    coach({
      step: 'u-profit', target: $('.profit', el), title: total >= m.price ? 'Profit!' : 'A loss this time',
      text: `The bar shows what is inside against what you paid. Past the white line is profit. ${total >= m.price ? 'Nice flip.' : 'It happens: pouches are a gamble.'}`,
      ms: 4200, onClose: () => coach({ step: 'u-sell', target: $('#tobags', el), hand: 'tap', title: 'Turn finds into miles', text: 'Tap <b>SELL ITEMS</b> to sell to the Customs Dealer, or keep them for a rival collector who pays more.', button: 'GOT IT' }),
    });
  };
  const worth = (i: number) => valueOf(items[i].id, items[i].cond);
  const pouchIdx = items.map((it, i) => (it.pouch ? i : -1)).filter((i) => i >= 0).sort((a, b) => worth(a) - worth(b));
  const visIdx = items.map((it, i) => (!it.pouch ? i : -1)).filter((i) => i >= 0).sort((a, b) => worth(a) - worth(b));

  // When a rival wins: was it a jackpot you missed, or a bullet you dodged?
  const verdict = () => {
    if (!m.winner || won) return;
    const best = items.map((it, i) => ({ it, v: valueOf(it.id, it.cond, demand.get(it.id) ?? 10000), i })).sort((a, b) => b.v - a.v)[0];
    const diff = total - m.price;
    const box = $('#summary', el);
    box.className = '';
    box.innerHTML =
      diff >= 0
        ? `<div class="callout-big miss">MISSED A JACKPOT<small>${esc(m.winnerName)} paid ${fmt(m.price)} and found ${esc(ITEM_BY_ID[best.it.id].name)} (${fmt(best.v)}). +${fmt(diff)} for them.</small></div>`
        : `<div class="callout-big dodge">DODGED A BULLET<small>${esc(m.winnerName)} paid ${fmt(m.price)} for ${fmt(total)} of goods. −${fmt(-diff)} for them.</small></div>`;
    diff >= 0 ? tension.sniped() : sound.breakEven();
  };
  loadDemand().then((d) => {
    demand = d;
    setTimeout(() => {
      sound.zip();
      $('#case3d', el)?.classList.add('open');
    }, 250);
    visIdx.forEach((i, k) => setTimeout(() => revealTile(i), 600 + k * 230));
    const afterVis = 600 + visIdx.length * 230 + 200;
    setTimeout(() => {
      tiles.forEach((t, i) => items[i].pouch && t.classList.add('in'));
      if (won) {
        tiles.forEach((t, i) => items[i].pouch && (t.onclick = () => openPouch(i)));
        const all = $('#openall', el) as HTMLButtonElement;
        all.hidden = false;
        const firstPouch = tiles.find((t) => t.classList.contains('pouch'));
        if (firstPouch) coach({ step: 'u-pouch', target: firstPouch, hand: 'tap', title: 'Crack the pouches', text: 'Tap a sealed pouch to open it. The longer it shakes, the rarer the find.' });
        else setTimeout(afterAll, 400);
        all.onclick = () => {
          all.hidden = true;
          pouchIdx.forEach((i, k) => setTimeout(() => openPouch(i), k * 520));
        };
      } else {
        pouchIdx.forEach((i, k) => setTimeout(() => openPouch(i), 300 + k * 420));
        setTimeout(() => coach({ step: 'u-lost', target: $('#summary', el), title: 'Someone else won', text: 'You still get to see what was inside. Was it a jackpot you missed, or a bullet you dodged?', ms: 4200 }), 300 + pouchIdx.length * 420 + 1600);
        if (!pouchIdx.length) setTimeout(verdict, 400);
      }
    }, afterVis);
  });

  // ---- chain progress ----
  const off = live.on(async (x) => {
    if (x.lotId !== m.lotId) return;
    if (x.type === 'lot:revealed') {
      $('#v-chain', el).innerHTML = `<i>✅</i><span>Revealed on chain; the contract re-checked the hash${x.tx ? ` · ${txLink(x.tx)}` : ""}</span>`;
      if (won) {
        try {
          const paid = await call<string[]>('pay_lot', { id: m.lotId });
          $('#v-pay', el).innerHTML = `<i>✅</i><span>Paid ${fmt(m.price)} MI with your key; ${paid.value.length} items are now yours · ${txLink(paid.hash)}</span>`;
          void api(`/lot/${m.lotId}/paid`, { tx: paid.hash });
          void refreshMe();
        } catch (e) {
          $('#v-pay', el).innerHTML = `<i>⚠️</i><span>Payment failed: ${esc(errorText(e))}. It will retry from My Bags.</span>`;
        }
      }
    }
    if (x.type === 'lot:paid') {
      $('#v-pay', el) && ($('#v-pay', el).innerHTML = `<i>✅</i><span>${esc(m.winnerName)} paid with their own key · ${txLink(x.tx)}</span>`);
      off();
    }
    if (x.type === 'lot:payretry') {
      const v = $('#v-pay', el);
      if (v) v.innerHTML = `<i>⏳</i><span>${esc(m.winnerName)}'s payment did not go through yet. It retries automatically; the <a href="#lot/${m.lotId}">lot page</a> shows it once it lands.</span>`;
    }
    if (x.type === 'lot:error') {
      toast(`Settlement hiccup on lot ${m.lotId}: ${esc(x.message)}`);
    }
  });
  if (!won && !m.winner) setTimeout(off, 20000);
  // Never spin forever: if no payment news arrives, say what happens next.
  if (m.winner && !won)
    setTimeout(() => {
      const v = $('#v-pay', el);
      if (v && v.querySelector('.spinner')) v.innerHTML = `<i>⏳</i><span>${esc(m.winnerName)}'s payment is taking a while on the network. It goes through on its own; the <a href="#lot/${m.lotId}">lot page</a> shows it once it lands.</span>`;
    }, 45000);
  if (won) setTimeout(off, 60000);
}
