// A live hourglass: sand drains through the neck as a stream of grains that land and roll
// on the mound, then the glass turns over and starts again. Ported from the hourglass
// component (no React): a fixed pool of grain circles is moved directly every frame.

const NECK = 80;
const FULL = 56;
const POOL = 60;
let uid = 0;

function surfaceAt(pile: number, x: number) {
  return 144 - pile * (0.55 + 0.4 * (1 - ((x - 50) / 50) ** 2));
}

interface Grain { x: number; y: number; vx: number; vy: number; r: number; rolling: number; alive: boolean }

/** Mounts an hourglass into `host`. Returns a function that stops it. */
export function mountHourglass(host: HTMLElement, seconds = 6, width = 64): () => void {
  const id = `hgl${++uid}`;
  const glass = 'M22,16 C22,56 46,68 47.5,80 C46,92 22,104 22,144 L78,144 C78,104 54,92 52.5,80 C54,68 78,56 78,16 Z';
  host.innerHTML = `
  <svg class="hglass" viewBox="0 0 100 160" width="${width}" height="${width * 1.6}" aria-hidden="true">
    <defs>
      <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#e0a82a"/></linearGradient>
      <filter id="${id}g" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="2.2" numOctaves="2" seed="7" result="noise"/>
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.22  0 0 0 0 0.08  0 0 0 0.55 -0.12" result="specks"/>
        <feComposite in="specks" in2="SourceGraphic" operator="in" result="grain"/>
        <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="grain"/></feMerge>
      </filter>
      <clipPath id="${id}c"><path d="${glass}"/></clipPath>
    </defs>
    <g class="hgl-body">
      <g clip-path="url(#${id}c)">
        <rect x="0" y="0" width="100" height="160" fill="rgba(160,200,255,.07)"/>
        <g fill="url(#${id}s)" filter="url(#${id}g)"><path class="hgl-top"/><path class="hgl-bot"/></g>
        <line class="hgl-stream" x1="50" y1="${NECK}" x2="50" y2="140" stroke="#ffd56b" stroke-width="0.9" opacity=".7"/>
        <g class="hgl-grains" fill="#ffd56b">${Array.from({ length: POOL }, () => '<circle r="0"/>').join('')}</g>
      </g>
      <path d="${glass}" fill="none" stroke="#9fb3d6" stroke-width="2.2"/>
      <path d="M27,24 C27,50 40,64 45,75 M45,85 C40,96 27,110 27,136" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2" stroke-linecap="round"/>
      <rect x="15.5" y="15" width="2.5" height="130" rx="1.25" fill="#6b4422"/><rect x="82" y="15" width="2.5" height="130" rx="1.25" fill="#6b4422"/>
      <rect x="10" y="7" width="80" height="9" rx="4.5" fill="#8b5a2b"/><rect x="10" y="144" width="80" height="9" rx="4.5" fill="#8b5a2b"/>
    </g>
  </svg>`;
  const body = host.querySelector('.hgl-body') as SVGGElement;
  const topP = host.querySelector('.hgl-top') as SVGPathElement;
  const botP = host.querySelector('.hgl-bot') as SVGPathElement;
  const stream = host.querySelector('.hgl-stream') as SVGLineElement;
  const dots = [...host.querySelectorAll('.hgl-grains circle')] as SVGCircleElement[];
  const grains: Grain[] = dots.map(() => ({ x: 0, y: 0, vx: 0, vy: 0, r: 0, rolling: 0, alive: false }));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let top = 1;
  let flipping = false;
  let last = performance.now();
  let debt = 0;
  let raf = 0;

  const drawSand = () => {
    const topY = NECK - top * FULL;
    const pile = (1 - top) * FULL;
    const dip = Math.min(NECK - topY, 4 + (1 - top) * 14);
    topP.setAttribute('d', top > 0
      ? `M0,${NECK} L0,${topY} L30,${topY} C41,${topY} 47,${topY + dip} 50,${topY + dip} C53,${topY + dip} 59,${topY} 70,${topY} L100,${topY} L100,${NECK} Z`
      : '');
    botP.setAttribute('d', `M0,144 L0,${144 - pile * 0.55} Q50,${144 - pile * 1.35} 100,${144 - pile * 0.55} L100,144 Z`);
    stream.setAttribute('y2', String(surfaceAt(pile, 50)));
    stream.style.display = top > 0 && !flipping ? '' : 'none';
  };

  const step = (now: number) => {
    if (!host.isConnected) return; // removed from the page: stop
    raf = requestAnimationFrame(step);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!flipping) {
      top = Math.max(0, top - dt / seconds);
      if (top === 0) {
        flipping = true;
        body.classList.add('turning');
        setTimeout(() => {
          // the sand that fell is now on top: snap back upright with the glass refilled
          body.classList.remove('turning');
          top = 1;
          flipping = false;
        }, 750);
      }
    }
    drawSand();
    if (reduced) return;
    const pile = (1 - top) * FULL;
    if (!flipping && top > 0) debt += dt * 110;
    grains.forEach((g, i) => {
      if (!g.alive && debt >= 1) {
        debt -= 1;
        Object.assign(g, { x: 50 + (Math.random() - 0.5) * 1.2, y: NECK + 0.5, vx: (Math.random() - 0.5) * 3, vy: 6 + Math.random() * 6, r: 0.3 + Math.random() * 0.35, rolling: 0, alive: true });
      }
      if (g.alive) {
        if (g.rolling > 0) {
          g.rolling -= dt;
          g.x += g.vx * dt;
          g.vx *= 0.9;
          g.y = surfaceAt(pile, g.x) - g.r;
          if (g.rolling <= 0) g.alive = false;
        } else {
          g.vy += 750 * dt;
          g.x += g.vx * dt;
          g.y += g.vy * dt;
          if (g.y >= surfaceAt(pile, g.x) - g.r) {
            g.rolling = 0.15 + Math.random() * 0.25;
            g.vx = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 14);
          }
        }
      }
      const c = dots[i];
      c.setAttribute('cx', g.x.toFixed(2));
      c.setAttribute('cy', g.y.toFixed(2));
      c.setAttribute('r', g.alive ? g.r.toFixed(2) : '0');
    });
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
