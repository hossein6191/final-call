// "Net worth" card: a smooth curve of the player's worth over time with a hover tooltip.
// Based on a community analytics card: tension curve, dashed guides, glowing dot and tooltip.
import { fmt } from '../state.ts';

export interface Pt { t: number; v: number }

const W = 360;
const H = 150;
const PAD = { top: 34, bottom: 28, left: 12, right: 12 };

function geometry(pts: Pt[]) {
  const vals = pts.map((p) => p.v);
  let max = Math.max(...vals);
  let min = Math.min(...vals);
  if (max - min < 1) {
    max += 50;
    min -= 50;
  }
  const y = (v: number) => H - PAD.bottom - ((v - min) / (max - min)) * (H - PAD.top - PAD.bottom);
  const x = (i: number) => PAD.left + (pts.length === 1 ? 0.5 : i / (pts.length - 1)) * (W - PAD.left - PAD.right);
  return { x, y };
}

function curve(pts: Pt[], x: (i: number) => number, y: (v: number) => number) {
  const p = pts.map((d, i) => ({ x: x(i), y: y(d.v) }));
  if (p.length === 1) return `M ${p[0].x - 1} ${p[0].y} L ${p[0].x + 1} ${p[0].y}`;
  let d = `M ${p[0].x} ${p[0].y}`;
  const k = 0.35;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] ?? p2;
    d += ` C ${p1.x + (p2.x - p0.x) * k} ${p1.y + (p2.y - p0.y) * k}, ${p2.x - (p3.x - p1.x) * k} ${p2.y - (p3.y - p1.y) * k}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const label = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const SLIPS = `<svg viewBox="0 0 130 110" class="slips" aria-hidden="true">
  <g transform="translate(8 14) rotate(-20 40 25)"><rect width="80" height="46" rx="6" fill="#2f8f83"/><rect x="58" y="0" width="2" height="46" fill="rgba(0,0,0,.25)"/><circle cx="70" cy="23" r="6" fill="rgba(255,255,255,.25)"/></g>
  <g transform="translate(22 30) rotate(-10 40 25)"><rect width="80" height="46" rx="6" fill="#3a62a0"/><rect x="58" y="0" width="2" height="46" fill="rgba(0,0,0,.25)"/><circle cx="70" cy="23" r="6" fill="rgba(255,255,255,.25)"/></g>
  <g transform="translate(38 46) rotate(-2 40 25)"><rect width="80" height="46" rx="6" fill="#ef841c"/><rect x="58" y="0" width="2" height="46" fill="rgba(0,0,0,.25)"/><circle cx="70" cy="23" r="6" fill="rgba(255,255,255,.35)"/><rect x="8" y="10" width="34" height="5" rx="2" fill="rgba(58,31,8,.6)"/><rect x="8" y="22" width="46" height="9" rx="2" fill="rgba(58,31,8,.8)"/></g>
</svg>`;

export function worthCardHtml(pts: Pt[], now: number): string {
  const series = pts.length ? pts : [{ t: Date.now(), v: now }];
  const { x, y } = geometry(series);
  const line = curve(series, x, y);
  const lastX = x(series.length - 1);
  const area = `${line} L ${lastX} ${H - PAD.bottom} L ${x(0)} ${H - PAD.bottom} Z`;
  const first = series[0].v;
  const delta = now - first;
  const ticks = series.length <= 7 ? series.map((_, i) => i) : Array.from({ length: 6 }, (_, k) => Math.round((k / 5) * (series.length - 1)));
  return `
  <div class="worth">
    <div class="worth-in">
      <div class="worth-head">
        <div><small>Net worth</small><b>${fmt(now)}</b>
          <span class="worth-pill ${delta < 0 ? 'down' : ''}">${delta >= 0 ? '+' : '−'} ${fmt(Math.abs(delta))} <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="${delta >= 0 ? 'M2 11L6 7L9 10L14 4M10 4H14V8' : 'M2 5L6 9L9 6L14 12M10 12H14V8'}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        </div>
        ${SLIPS}
      </div>
      <div class="worth-chart">
        <svg viewBox="0 0 ${W} ${H}" class="wc">
          <defs><linearGradient id="wcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd23f" stop-opacity=".35"/><stop offset=".55" stop-color="#ffd23f" stop-opacity=".12"/><stop offset="1" stop-color="#ffd23f" stop-opacity="0"/></linearGradient></defs>
          ${series.map((_, i) => `<line x1="${x(i)}" x2="${x(i)}" y1="${PAD.top}" y2="${H - PAD.bottom}" class="wc-guide" data-i="${i}"/>`).join('')}
          <path d="${area}" fill="url(#wcg)"/>
          <path d="${line}" fill="none" stroke="#ffd23f" stroke-width="2.5" stroke-linecap="round"/>
          ${ticks.map((i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="wc-lbl">${label(series[i].t)}</text>`).join('')}
          <circle class="wc-dot" r="7" cx="${lastX}" cy="${y(series.at(-1)!.v)}"/>
        </svg>
        <div class="wc-tip" style="left:${(lastX / W) * 100}%;top:${(y(series.at(-1)!.v) / H) * 100}%">${fmt(series.at(-1)!.v)}</div>
      </div>
    </div>
  </div>`;
}

/** Hover: the dot and tooltip follow the nearest point. */
export function wireWorth(root: HTMLElement | null, pts: Pt[]) {
  if (!root || pts.length < 2) return;
  const svg = root.querySelector('.wc') as SVGSVGElement;
  const dot = root.querySelector('.wc-dot') as SVGCircleElement;
  const tip = root.querySelector('.wc-tip') as HTMLElement;
  const guides = [...root.querySelectorAll('.wc-guide')] as SVGLineElement[];
  const { x, y } = geometry(pts);
  const show = (i: number) => {
    dot.setAttribute('cx', String(x(i)));
    dot.setAttribute('cy', String(y(pts[i].v)));
    tip.style.left = `${(x(i) / W) * 100}%`;
    tip.style.top = `${(y(pts[i].v) / H) * 100}%`;
    tip.textContent = `${fmt(pts[i].v)} · ${label(pts[i].t)}`;
    guides.forEach((g, k) => g.classList.toggle('on', k === i));
  };
  svg.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const rx = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(x(i) - rx) < Math.abs(x(best) - rx)) best = i;
    show(best);
  });
  svg.addEventListener('pointerleave', () => show(pts.length - 1));
}
