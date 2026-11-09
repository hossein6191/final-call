// The player's boarding pass: a ticket with punched notches, a perforated stub, and a
// dithered print texture. Its class follows the best terminal the player has unlocked.
import { esc, fmt } from '../state.ts';

export interface PassInfo {
  name: string;
  account: string;
  netWorth: number;
  miles: number;
  klass: 0 | 1 | 2;
  rank?: number;
  bagsWon: number;
  stamps: number;
  stampTotal: number;
}

const CLASSES = [
  { name: 'ECONOMY', back: [239, 132, 28], front: [255, 214, 140], hi: [255, 168, 72], ink: '#3a1f08', water: '#ffe2c4' },
  { name: 'BUSINESS', back: [36, 78, 150], front: [140, 186, 255], hi: [86, 132, 214], ink: '#06132b', water: '#cfe0ff' },
  { name: 'FIRST', back: [110, 22, 52], front: [240, 196, 92], hi: [170, 52, 86], ink: '#ffe9a8', water: '#f6d27a' },
];

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const cache = new Map<number, string>();

/** Ordered-dither print texture (Bayer 4x4) of a soft radial light, like a ticket printer. */
function texture(k: number): string {
  if (cache.has(k)) return cache.get(k)!;
  const c = CLASSES[k];
  const w = 120;
  const h = 69;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = x / w - 0.62;
      const dy = y / h - 0.3;
      const swirl = 0.05 * Math.sin(x * 0.11 + y * 0.07) + 0.04 * Math.sin(y * 0.2 - x * 0.05);
      const lum = Math.max(0, Math.min(1, 0.92 - Math.hypot(dx * 1.1, dy * 1.6) * 1.25 + swirl));
      const t = (BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16;
      const col = lum > 0.82 && t < 0.35 ? c.hi : lum > t ? c.front : c.back;
      const i = (y * w + x) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const url = cv.toDataURL('image/png');
  cache.set(k, url);
  return url;
}

function hash(s: string) {
  let h = 7;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function passHtml(p: PassInfo): string {
  const c = CLASSES[p.klass];
  const h = hash(p.account);
  const seat = `${1 + (h % 38)}${'ABCDEF'[(h >>> 8) % 6]}`;
  const gate = String(1 + ((h >>> 12) % 24)).padStart(2, '0');
  const name = esc(p.name.toUpperCase());
  const size = name.length > 12 ? 24 : name.length > 9 ? 28 : name.length > 6 ? 34 : 40;
  return `
  <div class="pass k${p.klass}" style="--ink:${c.ink};--water:${c.water};--tex:url(${texture(p.klass)})">
    <div class="pass-tex"></div>
    <div class="pass-glare"></div>
    <div class="pass-main">
      <div class="pass-top">FINAL CALL AIR · BOARDING PASS</div>
      <div class="pass-name" style="font-size:${size}px">${name}</div>
      <div class="pass-grid">
        <div><small>CLASS</small><b>${c.name}</b></div>
        <div><small>NET WORTH</small><b>${fmt(p.netWorth)}</b></div>
        <div><small>RANK</small><b>${p.rank ? `#${p.rank}` : '—'}</b></div>
      </div>
      <div class="pass-foot"><span>BAGS WON ${p.bagsWon}</span><span>STAMPS ${p.stamps}/${p.stampTotal}</span></div>
    </div>
    <div class="pass-perf"></div>
    <div class="pass-stub">
      <div class="pass-water">${gate}</div>
      <div class="pass-stub-txt"><small>GATE</small><b>${gate}</b><small>SEAT</small><b>${seat}</b></div>
    </div>
  </div>`;
}

/** Tilt the pass toward the pointer with a moving glare. */
export function wirePass(el: HTMLElement | null) {
  if (!el) return;
  const glare = el.querySelector('.pass-glare') as HTMLElement;
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - r.left) / r.width - 0.5;
    const dy = (e.clientY - r.top) / r.height - 0.5;
    el.style.transition = 'none';
    el.style.transform = `perspective(900px) rotateX(${-dy * 14}deg) rotateY(${dx * 16}deg) scale(1.02)`;
    glare.style.background = `radial-gradient(40% 60% at ${(dx + 0.5) * 100}% ${(dy + 0.5) * 100}%, rgba(255,255,255,.28), transparent 70%)`;
  });
  el.addEventListener('pointerleave', () => {
    el.style.transition = 'transform .45s cubic-bezier(.22,1,.36,1)';
    el.style.transform = '';
    glare.style.background = 'transparent';
  });
}

export async function sharePass(p: PassInfo) {
  const text = `I'm flying ${CLASSES[p.klass].name} on Final Call: ${fmt(p.netWorth)} net worth, ${p.bagsWon} bags won. Lost luggage auctions against AI rivals with real wallets, sealed on NEAR.`;
  const url = location.origin;
  try {
    if (navigator.share) return void (await navigator.share({ title: 'Final Call', text, url }));
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch {
    return undefined;
  }
}
