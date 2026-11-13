// The player's boarding pass: a ticket with punched notches, a perforated stub, and a
// dithered print texture. Its class follows the best terminal the player has unlocked.
import { esc, fmt } from '../state.ts';
import { mountDither } from './dither.ts';

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

export const CLASSES = [
  { name: 'ECONOMY', back: [239, 132, 28], front: [255, 214, 140], hi: [255, 168, 72], ink: '#4a2410', water: '#ffe2c4', glBack: '#ef671c', glFront: '#ffc691' },
  { name: 'BUSINESS', back: [36, 78, 150], front: [140, 186, 255], hi: [86, 132, 214], ink: '#06132b', water: '#cfe0ff', glBack: '#2a5bb0', glFront: '#a9c9ff' },
  { name: 'FIRST', back: [194, 58, 90], front: [255, 217, 138], hi: [170, 52, 86], ink: '#2a0612', water: '#ffe6a8', glBack: '#b83052', glFront: '#ffd98a' },
];

// One live shader canvas, moved into each freshly drawn pass so re-renders keep it running.
let live: { host: HTMLElement; klass: number; stop: () => void } | null = null;

/** Swaps the pass's static texture for the animated dithering shader (WebGL2). */
export function livenPass(passEl: HTMLElement | null, klass: number) {
  if (!passEl) return;
  const slot = passEl.querySelector('.pass-tex') as HTMLElement | null;
  if (!slot) return;
  if (!live || live.klass !== klass) {
    live?.stop();
    live = null;
    const host = document.createElement('div');
    host.className = 'pass-tex live';
    slot.replaceWith(host);
    const c = CLASSES[klass];
    const stop = mountDither(host, { back: c.glBack, front: c.glFront, shape: 'warp', size: 0.75, speed: 0.4 });
    if (!stop) {
      host.replaceWith(slot); // no WebGL2: keep the printed texture
      return;
    }
    live = { host, klass, stop };
    return;
  }
  slot.replaceWith(live.host);
}

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

/** Seat and gate are fixed per account. */
export function seatGate(account: string) {
  const h = hash(account);
  return { seat: `${1 + (h % 38)}${'ABCDEF'[(h >>> 8) % 6]}`, gate: String(1 + ((h >>> 12) % 24)).padStart(2, '0') };
}

/** The pass's printed texture as a data URL. */
export const passTexture = (k: number) => texture(k);

export function passHtml(p: PassInfo): string {
  const c = CLASSES[p.klass];
  const { seat, gate } = seatGate(p.account);
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
