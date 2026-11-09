// The collection album: all 35 items by value step, the ones you have found in colour,
// the rest as X-ray silhouettes. Below it, your passport stamps.
import { api } from '../net.ts';
import { state, $, fmt, esc } from '../state.ts';
import { ITEMS, LADDER, ITEM_BY_ID } from '../../../shared/catalog.ts';
import { COND_BP, TERMINALS } from '../../../shared/rules.ts';
import { iconSvg, XRAY } from '../icons.ts';
import { stamps } from '../ui/progress.ts';
import { sound } from '../audio.ts';

const RARITY = ['#9aa4b2', '#5bd67a', '#4aa8ff', '#b06cff', '#ffc83d', '#ffc83d', '#ffc83d'];
const STEP_NAMES = ['Pocket change', 'Nice find', 'Good haul', 'Valuable', 'Treasure', 'Prize', 'Legend'];

export function album(root: HTMLElement) {
  root.innerHTML = `
  <div class="screen">
    <div class="h1">Album</div>
    <div class="small muted">Every item that can turn up in a lost bag. Win bags to fill your album.</div>
    <div class="panel album-head"><div><b id="acount">…</b><small>items found</small></div><div class="ubar grow"><i id="abar" style="width:0%"></i></div></div>
    <div id="agrid"><div class="locked"><span class="spinner"></span></div></div>
    <div class="section-title">PASSPORT STAMPS</div>
    <div class="stamp-grid" id="sgrid"></div>
  </div>`;

  let alive = true;
  const owned = new Set<string>((state.profile?.inventory ?? []).map(([t]: [string]) => t.split('@')[0]));

  const draw = (found: Record<string, number>) => {
    for (const id of owned) found[id] = Math.max(1, found[id] ?? 0);
    const n = ITEMS.filter((i) => found[i.id]).length;
    $('#acount', root).textContent = `${n} / ${ITEMS.length}`;
    ($('#abar', root) as HTMLElement).style.width = `${(n / ITEMS.length) * 100}%`;
    $('#agrid', root).innerHTML = LADDER.map((v, lvl) => {
      const row = ITEMS.filter((i) => i.level === lvl);
      return `<div class="alevel"><div class="alv-h" style="color:${RARITY[lvl]}"><span>${STEP_NAMES[lvl]}</span><small>~${fmt(v)} MI each</small></div>
        <div class="atiles">${row
          .map((i) =>
            found[i.id]
              ? `<button class="atile got" data-id="${i.id}" style="--c:${RARITY[lvl]}">${iconSvg(i.id, { size: 46 })}<span>${esc(i.name)}</span>${found[i.id] > 1 ? `<em>×${found[i.id]}</em>` : ''}</button>`
              : `<button class="atile" data-id="${i.id}">${iconSvg(i.id, { size: 46, xray: XRAY[i.material] })}<span>???</span></button>`,
          )
          .join('')}</div></div>`;
    }).join('');
    root.querySelectorAll<HTMLButtonElement>('.atile').forEach((b) => (b.onclick = () => { sound.tap(); itemSheet(b.dataset.id!, Boolean(found[b.dataset.id!])); }));
  };

  $('#sgrid', root).innerHTML = stamps()
    .map(
      (s) => `<div class="stamp-card ${s.at ? 'got' : ''}" style="--c:${s.color}">
        <div class="stamp-ink"><span>${s.glyph}</span></div>
        <b>${esc(s.title)}</b><small>${s.at ? new Date(s.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : esc(s.text)}</small>
      </div>`,
    )
    .join('');

  void api(`/found?account=${encodeURIComponent(state.id!.account)}`)
    .then((r) => alive && draw(r.found ?? {}))
    .catch(() => alive && draw({}));
  return () => {
    alive = false;
  };
}

function itemSheet(id: string, got: boolean) {
  const it = ITEM_BY_ID[id];
  const lovers = state.cfg!.rivals.filter((r) => r.loves?.includes(it.category)).map((r) => r.name);
  const where = TERMINALS.filter((t) => it.level >= t.ladderStart && it.level <= t.ladderStart + 4).map((t) => t.name);
  const el = document.createElement('div');
  el.className = 'overlay';
  el.innerHTML = `
    <div class="sheet" style="text-align:center">
      <div class="row"><span class="grow"></span><button class="icon-btn" id="ix" aria-label="Close">✕</button></div>
      <div style="align-self:center">${got ? iconSvg(id, { size: 110 }) : iconSvg(id, { size: 110, xray: XRAY[it.material] })}</div>
      <div class="h1">${got ? esc(it.name) : 'Not found yet'}</div>
      <div class="small muted">${esc(it.category)} · shows as <b>${esc(it.material)}</b> on the X-ray</div>
      <div class="panel rs-grid">
        ${(['worn', 'good', 'mint'] as const).map((c) => `<div><small>${c.toUpperCase()}</small><b>${fmt((LADDER[it.level] * COND_BP[c]) / 10000)}</b></div>`).join('')}
      </div>
      <div class="panel small" style="text-align:left">
        <b>Where:</b> ${where.map(esc).join(', ') || '—'}<br>
        ${lovers.length ? `<b>Collectors:</b> ${lovers.map(esc).join(', ')} pay over the dealer price for ${esc(it.category)}.` : 'No rival collects this. Sell it to the Customs Dealer.'}<br>
        <span class="muted">Prices shown at full demand. Each dealer sale lowers them a little for a while.</span>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', (e) => e.target === el && el.remove());
  (el.querySelector('#ix') as HTMLButtonElement).onclick = () => el.remove();
}
