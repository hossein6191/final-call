// Shareable boarding pass: draws the player's pass into a 1200x675 image for X,
// then offers native share (phones), a ready-made post on X, or a download.
import { fmt, toast } from '../state.ts';
import { sound } from '../audio.ts';
import { CLASSES, seatGate, passTexture, type PassInfo } from './pass.ts';
import { ditherStill } from './dither.ts';
import { coachOff } from './coach.ts';

const W = 1200;
const H = 675;
const DISPLAY = '"Barlow Condensed", "Arial Narrow", sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';

function loadImg(src: string) {
  return new Promise<HTMLImageElement>((ok, bad) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = bad;
    i.src = src;
  });
}

/** Ticket outline: rounded rectangle with a half-circle notch top and bottom at the perforation. */
function ticketPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, perf: number, notch: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(perf - notch, y);
  g.arc(perf, y, notch, Math.PI, 0, true);
  g.lineTo(x + w - r, y);
  g.arcTo(x + w, y, x + w, y + r, r);
  g.lineTo(x + w, y + h - r);
  g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(perf + notch, y + h);
  g.arc(perf, y + h, notch, 0, Math.PI, true);
  g.lineTo(x + r, y + h);
  g.arcTo(x, y + h, x, y + h - r, r);
  g.lineTo(x, y + r);
  g.arcTo(x, y, x + r, y, r);
  g.closePath();
}

function fitText(g: CanvasRenderingContext2D, text: string, weight: number, max: number, start: number) {
  let size = start;
  do {
    g.font = `${weight} ${size}px ${DISPLAY}`;
    if (g.measureText(text).width <= max) break;
    size -= 4;
  } while (size > 30);
  return size;
}

/** Frames of the warp shader differ a lot: keep the one with a good share of bright bands. */
function bestFrame(w: number, h: number, back: string, front: string) {
  let best: HTMLCanvasElement | null = null;
  let score = -1;
  const probe = document.createElement('canvas');
  probe.width = 64;
  probe.height = 27;
  const pg = probe.getContext('2d', { willReadFrequently: true })!;
  for (const t of [0.6, 1.4, 2.2, 3.8, 5.1, 6.7, 8.3, 9.9]) {
    const cv = ditherStill(w, h, { back, front, shape: 'warp', size: 0.75 }, t);
    if (!cv) return null;
    pg.drawImage(cv, 0, 0, 64, 27);
    const d = pg.getImageData(0, 0, 64, 27).data;
    let lum = 0;
    for (let i = 0; i < d.length; i += 4) lum += d[i] + d[i + 1] + d[i + 2];
    const bright = lum / (d.length / 4) / 765; // 0..1
    const s = -Math.abs(bright - 0.62);
    if (s > score) {
      score = s;
      best = cv;
    }
  }
  return best;
}

export async function renderPass(p: PassInfo): Promise<Blob> {
  await Promise.all([
    document.fonts.load(`800 120px ${DISPLAY}`),
    document.fonts.load(`700 30px ${DISPLAY}`),
    document.fonts.load(`600 20px ${MONO}`),
  ]).catch(() => {});
  const c = CLASSES[p.klass];
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;

  // night terminal backdrop
  g.fillStyle = '#0b101b';
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.5, H * 0.55, 40, W * 0.5, H * 0.55, W * 0.7);
  glow.addColorStop(0, `rgba(${c.back.join(',')},.28)`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,.04)';
  g.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke(); }
  for (let y = 0; y < H; y += 40) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }

  // header
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#ffd23f';
  g.font = `800 44px ${DISPLAY}`;
  g.fillText('FINAL CALL', 90, 84);
  g.fillStyle = '#9aa7bd';
  g.font = `500 22px ${MONO}`;
  g.fillText('Lost-luggage auctions vs AI rivals with real NEAR wallets', 90, 118);

  // ticket
  const tx = 90, ty = 150, tw = 1020, th = 420, perf = tx + tw * 0.74;
  g.save();
  g.shadowColor = 'rgba(0,0,0,.55)';
  g.shadowBlur = 40;
  g.shadowOffsetY = 16;
  ticketPath(g, tx, ty, tw, th, 26, perf, 22);
  g.fillStyle = `rgb(${c.back.join(',')})`;
  g.fill();
  g.restore();
  g.save();
  ticketPath(g, tx, ty, tw, th, 26, perf, 22);
  g.clip();
  // the same animated shader as the live pass, frozen on one frame; printed texture as fallback
  const still = bestFrame(tw, th, c.glBack, c.glFront);
  const tex = still ?? (await loadImg(passTexture(p.klass)).catch(() => null));
  if (tex) {
    g.imageSmoothingEnabled = !still ? false : true;
    g.drawImage(tex, tx, ty, tw, th);
  }
  // perforation
  g.strokeStyle = c.ink;
  g.globalAlpha = 0.55;
  g.setLineDash([10, 10]);
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(perf, ty + 30);
  g.lineTo(perf, ty + th - 30);
  g.stroke();
  g.setLineDash([]);
  g.globalAlpha = 1;

  const { seat, gate } = seatGate(p.account);
  // stub watermark + text
  g.fillStyle = c.water;
  g.globalAlpha = 0.5;
  g.font = `800 220px ${DISPLAY}`;
  g.textAlign = 'center';
  g.fillText(gate, perf + (tx + tw - perf) / 2, ty + th / 2 + 80);
  g.globalAlpha = 1;
  g.fillStyle = c.ink;
  const sx = perf + (tx + tw - perf) / 2;
  g.font = `600 22px ${MONO}`;
  g.fillText('GATE', sx, ty + 120);
  g.fillText('SEAT', sx, ty + 270);
  g.font = `800 76px ${DISPLAY}`;
  g.fillText(gate, sx, ty + 196);
  g.fillText(seat, sx, ty + 346);
  g.textAlign = 'left';

  // main side
  const mx = tx + 48;
  g.font = `600 22px ${MONO}`;
  g.fillText('FINAL CALL AIR · BOARDING PASS', mx, ty + 56);
  const name = p.name.toUpperCase();
  const size = fitText(g, name, 800, perf - mx - 40, 120);
  g.font = `800 ${size}px ${DISPLAY}`;
  g.fillText(name, mx, ty + 190);
  const cols: [string, string][] = [['CLASS', c.name], ['NET WORTH', fmt(p.netWorth)], ['RANK', p.rank ? `#${p.rank}` : '—']];
  cols.forEach(([k, v], i) => {
    const cx = mx + i * 200;
    g.font = `600 20px ${MONO}`;
    g.fillText(k, cx, ty + 262);
    g.font = `800 52px ${DISPLAY}`;
    g.fillText(v, cx, ty + 316);
  });
  g.font = `600 20px ${MONO}`;
  g.fillText(`BAGS WON ${p.bagsWon}    STAMPS ${p.stamps}/${p.stampTotal}`, mx, ty + th - 40);
  g.restore();

  // footer
  g.fillStyle = '#e8ecf4';
  g.font = `700 28px ${DISPLAY}`;
  g.fillText(location.host || 'final-call.up.railway.app', 90, 628);
  g.textAlign = 'right';
  g.fillStyle = '#9aa7bd';
  g.font = `600 20px ${MONO}`;
  g.fillText('Built on NEAR · #NEARHackathon', W - 90, 626);

  return await new Promise<Blob>((ok, bad) => cv.toBlob((b) => (b ? ok(b) : bad(new Error('no image'))), 'image/png'));
}

export function postText(p: PassInfo) {
  const rank = p.rank ? `, rank #${p.rank}` : '';
  return `I'm flying ${CLASSES[p.klass].name} on Final Call ✈️ ${fmt(p.netWorth)} net worth${rank}, ${p.bagsWon} bag${p.bagsWon === 1 ? '' : 's'} won.\n\nCan you outbid AI rivals who spend from their own NEAR wallets?\n\n#NEARHackathon @NEARProtocol`;
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** The share sheet: preview of the image, post on X, download, copy. */
export async function showShareSheet(p: PassInfo) {
  document.querySelector('.share-sheet')?.remove();
  coachOff();
  const el = document.createElement('div');
  el.className = 'overlay share-sheet';
  el.innerHTML = `
    <div class="sheet">
      <div class="row"><div class="h1 grow">Share your pass</div><button class="icon-btn" id="shx" aria-label="Close">✕</button></div>
      <div class="share-prev"><div class="muted small">Printing your pass…</div></div>
      <button class="btn primary" id="shpost" disabled>POST ON X</button>
      <div class="row" style="gap:10px">
        <button class="btn ghost grow" id="shdl" disabled>DOWNLOAD IMAGE</button>
        <button class="btn ghost grow" id="shcp">COPY TEXT</button>
      </div>
      <p class="muted small" style="margin:0">On a computer the image is saved first: attach it to the post X opens.</p>
    </div>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  el.addEventListener('click', (e) => e.target === el && close());
  (el.querySelector('#shx') as HTMLButtonElement).onclick = close;
  const text = postText(p);
  const url = location.origin;
  const file = `final-call-pass-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
  (el.querySelector('#shcp') as HTMLButtonElement).onclick = async () => {
    sound.tap();
    await navigator.clipboard.writeText(`${text}\n${url}`).catch(() => {});
    toast('Post text copied.');
  };
  let blob: Blob;
  try {
    blob = await renderPass(p);
  } catch {
    (el.querySelector('.share-prev') as HTMLElement).innerHTML = '<div class="muted small">Could not print the image on this browser.</div>';
    return;
  }
  const img = new Image();
  img.alt = 'Your Final Call boarding pass';
  img.src = URL.createObjectURL(blob);
  (el.querySelector('.share-prev') as HTMLElement).replaceChildren(img);
  const post = el.querySelector('#shpost') as HTMLButtonElement;
  const dl = el.querySelector('#shdl') as HTMLButtonElement;
  post.disabled = false;
  dl.disabled = false;
  dl.onclick = () => {
    sound.tap();
    download(blob, file);
  };
  post.onclick = async () => {
    sound.tap();
    const f = new File([blob], file, { type: 'image/png' });
    const touch = matchMedia('(pointer: coarse)').matches;
    if (touch && navigator.canShare?.({ files: [f] })) {
      try {
        await navigator.share({ files: [f], text: `${text}\n${url}` });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    download(blob, file);
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'noopener');
    toast('Pass image saved. Attach it to your post.');
  };
}
