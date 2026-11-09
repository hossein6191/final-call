// The right-hand panel on a computer screen. In the lobby screens it shows the floor
// (rivals and their wallets), the live feed and today's missions. At an auction table it
// shows the bid log, the rules and the keys.
import { api } from '../net.ts';
import { state, fmt, esc } from '../state.ts';
import { AVATARS } from '../avatars.ts';
import { missions } from './progress.ts';
import { nextTip } from './bits.ts';
import { rivalSheet } from '../screens/home.ts';

export const wide = () => matchMedia('(min-width: 1100px) and (min-height: 640px)').matches;

function ago(ts: number) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
}

function feedLine(e: any, people: any[]) {
  const c = state.cfg!.contract;
  const who = (acc: string) => esc(people.find((p) => p.account === acc)?.name ?? acc.split('.')[0]);
  if (e.kind === 'lot') return e.winner ? `<b>${esc(e.name ?? who(e.winner))}</b> won a bag for ${fmt(e.price)}` : 'A bag went unsold';
  if (e.kind === 'rival_sold') return `<b>${who(`${e.rival}.${c}`)}</b> sold to the dealer for ${fmt(e.total)}`;
  if (e.kind === 'grounded') return `<b>${who(`${e.rival}.${c}`)}</b> went broke and is grounded`;
  if (e.kind === 'loan') return `The House lent <b>${who(`${e.rival}.${c}`)}</b> ${fmt(e.amount)}`;
  if (e.kind === 'backed') return `<b>${esc(e.name)}</b> backed <b>${who(`${e.rival}.${c}`)}</b> with ${fmt(e.amount)}`;
  if (e.kind === 'player_loan') return `<b>${who(e.account)}</b> took an emergency loan`;
  if (e.kind === 'order') return `<b>${who(`${e.rival}.${c}`)}</b> wants an item: pays ${fmt(e.price)}`;
  return '';
}

export function mountSide(el: HTMLElement | null, kind: 'floor' | 'table'): () => void {
  if (!el) return () => {};
  if (kind === 'table') {
    el.innerHTML = `
      <div class="side-sec"><div class="section-title">BID LOG</div><div class="bidlog" id="bidlog"><div class="muted small">Bids will show here.</div></div></div>
      <div class="side-sec"><div class="section-title">HOW TO WIN</div>
        <ol class="side-rules"><li><b>Scan</b>: drag the beam, click items to appraise.</li><li><b>Bid</b>: every bid restarts the 5 s clock.</li><li><b>Once</b> at 2 s, <b>twice</b> at 3.5 s, <b>sold</b> at 5 s.</li><li>After 25 s, every step doubles.</li><li>Thinking dots mean a rival is near their limit.</li></ol></div>
      <div class="side-sec"><div class="section-title">KEYS</div>
        <div class="side-keys"><span><kbd>Space</kbd> bid</span><span><kbd>J</kbd> jump</span><span><kbd>F</kbd> fold</span><span><kbd>Esc</kbd> menu</span></div></div>
      <div class="side-sec tipcard"><span>💡 ${esc(nextTip())}</span></div>`;
    const log = el.querySelector('#bidlog') as HTMLElement;
    let first = true;
    const onBid = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (first) log.innerHTML = '';
      first = false;
      const row = document.createElement('div');
      row.className = `bl ${d.mine ? 'mine' : ''}`;
      row.innerHTML = `<span class="bl-n" style="color:${d.color ?? 'inherit'}">${esc(d.name)}</span><span class="bl-tags">${d.jump ? '<em>JUMP</em>' : ''}${d.snipe ? '<em class="s">SNIPE</em>' : ''}</span><b>${fmt(d.price)}</b>`;
      log.prepend(row);
      while (log.children.length > 14) log.lastElementChild?.remove();
    };
    document.addEventListener('fc:bid', onBid);
    return () => document.removeEventListener('fc:bid', onBid);
  }

  el.innerHTML = `
    <div class="side-sec"><div class="section-title">ON THE FLOOR</div><div class="side-floor" id="sfloor"><span class="spinner"></span></div></div>
    <div class="side-sec"><div class="section-title">TODAY'S MISSIONS</div><div id="smiss"></div></div>
    <div class="side-sec"><div class="section-title">LIVE FEED</div><div class="side-feed" id="sfeed"></div></div>
    <div class="side-sec tipcard"><span id="stip">💡 ${esc(nextTip())}</span></div>`;
  let alive = true;
  const draw = async () => {
    el.querySelector('#smiss')!.innerHTML = missions()
      .map((m) => `<div class="sm ${m.complete ? 'done' : ''}"><span>${m.complete ? '✓' : `${m.have}/${m.goal}`}</span>${esc(m.title)}</div>`)
      .join('');
    const b = await api('/board').catch(() => null);
    if (!alive || !b) return;
    el.querySelector('#sfloor')!.innerHTML = b.people
      .filter((p: any) => p.rival)
      .map((p: any) => {
        const def = state.cfg!.rivals.find((r) => r.account === p.account);
        return `<button class="sf ${p.grounded ? 'grounded' : ''}" data-acc="${esc(p.account)}">${AVATARS[def?.sub ?? ''] ?? ''}<div class="grow"><b style="color:${def?.color}">${esc(p.name)}</b><small>${esc(def?.title ?? '')}</small></div><div class="sf-m">${p.miles < 100 ? '<span class="back-me">BACK ME</span>' : p.grounded ? '<span class="trend-down">GROUNDED</span>' : `${fmt(p.miles)}<small>MI</small>`}</div></button>`;
      })
      .join('');
    el.querySelectorAll<HTMLButtonElement>('.sf').forEach((x) => (x.onclick = () => rivalSheet(x.dataset.acc!, b)));
    el.querySelector('#sfeed')!.innerHTML = b.feed
      .slice(0, 10)
      .map((e: any) => {
        const t = feedLine(e, b.people);
        return t ? `<div class="sfe"><time>${ago(e.ts)}</time><span>${t}</span></div>` : '';
      })
      .join('');
  };
  if (wide()) void draw();
  const onFloor = () => wide() && void draw();
  document.addEventListener('floor', onFloor);
  const t = setInterval(() => wide() && void draw(), 15000);
  const tip = setInterval(() => {
    const x = el.querySelector('#stip');
    if (x) x.textContent = `💡 ${nextTip()}`;
  }, 12000);
  return () => {
    alive = false;
    clearInterval(t);
    clearInterval(tip);
    document.removeEventListener('floor', onFloor);
  };
}
