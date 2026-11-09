// Coach marks: a spotlight on one element, a short tip, and an animated hand that shows
// the gesture. They never block the game: taps pass straight through to what is under them.
import { markSeen, seen, resetTutorial } from './progress.ts';

export interface CoachOpts {
  step: string; // shown once per device
  target?: Element | null;
  title?: string;
  text: string;
  hand?: 'tap' | 'drag' | 'hold';
  ms?: number; // auto-hide after this long
  button?: string; // show a button that closes the tip
  dim?: boolean; // darken everything except the target
  force?: boolean; // show even if already seen
  onClose?: () => void;
}

let current: { close: () => void; step: string; sticky: boolean } | null = null;
let skipped = (() => {
  try {
    return localStorage.getItem('fc:coach-skip') === '1';
  } catch {
    return false;
  }
})();

export function coachOff() {
  current?.close();
}

export function coachActive(step?: string) {
  return current !== null && (!step || current.step === step);
}

export function skipTutorial() {
  skipped = true;
  try {
    localStorage.setItem('fc:coach-skip', '1');
  } catch {}
  current?.close();
}

export function replayTutorial() {
  skipped = false;
  try {
    localStorage.removeItem('fc:coach-skip');
  } catch {}
  resetTutorial();
}

export function coach(o: CoachOpts): () => void {
  if (!o.force && (skipped || seen(o.step))) return () => {};
  // A tip that waits for an action is not pushed aside by a passing, timed one.
  if (current?.sticky && o.ms && !o.force) return () => {};
  current?.close();
  markSeen(o.step);
  const root = document.createElement('div');
  root.className = `coach ${o.dim ? 'dim' : ''}`;
  root.innerHTML = `
    <div class="coach-ring"></div>
    ${o.hand ? `<div class="coach-hand ${o.hand}">${HAND}</div>` : ''}
    <div class="coach-tip">
      ${o.title ? `<b>${o.title}</b>` : ''}
      <p>${o.text}</p>
      <div class="coach-row">
        <button class="coach-skip" type="button">Skip tutorial</button>
        ${o.button ? `<button class="coach-ok" type="button">${o.button}</button>` : ''}
      </div>
    </div>`;
  document.body.appendChild(root);
  const tgt = o.target as HTMLElement | null | undefined;
  if (tgt?.isConnected) {
    const r = tgt.getBoundingClientRect();
    if (r.bottom > innerHeight - 60 || r.top < 0) tgt.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  const ring = root.querySelector('.coach-ring') as HTMLElement;
  const tip = root.querySelector('.coach-tip') as HTMLElement;
  const hand = root.querySelector('.coach-hand') as HTMLElement | null;
  let raf = 0;
  let closed = false;

  const place = () => {
    raf = requestAnimationFrame(place);
    const t = o.target as HTMLElement | null | undefined;
    const r = t && t.isConnected ? t.getBoundingClientRect() : null;
    const vw = innerWidth;
    const vh = innerHeight;
    if (!r || r.width === 0) {
      ring.style.display = 'none';
      if (hand) hand.style.display = 'none';
      tip.style.left = `${Math.max(12, vw / 2 - 160)}px`;
      tip.style.top = `${vh * 0.3}px`;
      return;
    }
    const pad = 6;
    ring.style.display = 'block';
    ring.style.left = `${r.left - pad}px`;
    ring.style.top = `${r.top - pad}px`;
    ring.style.width = `${r.width + pad * 2}px`;
    ring.style.height = `${r.height + pad * 2}px`;
    if (hand) {
      hand.style.display = 'block';
      hand.style.left = `${r.left + r.width / 2}px`;
      hand.style.top = `${r.top + r.height * (o.hand === 'drag' ? 0.62 : 0.55)}px`;
      hand.style.setProperty('--span', `${Math.max(40, r.width * 0.32)}px`);
    }
    // Put the tip above or below the target, whichever has more room.
    const tw = Math.min(320, vw - 24);
    const th = tip.offsetHeight || 90;
    tip.style.width = `${tw}px`;
    const left = Math.max(12, Math.min(vw - tw - 12, r.left + r.width / 2 - tw / 2));
    const below = r.bottom + 14;
    const above = r.top - th - 14;
    const top = vh - below > th + 12 && (above < 12 || r.top < vh * 0.45) ? below : Math.max(12, above);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };
  raf = requestAnimationFrame(place);

  const close = () => {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    root.classList.add('out');
    setTimeout(() => root.remove(), 200);
    if (current?.close === close) current = null;
    o.onClose?.();
  };
  (root.querySelector('.coach-skip') as HTMLButtonElement).onclick = (e) => {
    e.stopPropagation();
    skipTutorial();
  };
  const ok = root.querySelector('.coach-ok') as HTMLButtonElement | null;
  if (ok) ok.onclick = (e) => {
    e.stopPropagation();
    close();
  };
  if (o.ms) setTimeout(close, o.ms);
  current = { close, step: o.step, sticky: !o.ms };
  return close;
}

const HAND = `<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
  <path d="M18 24V9.5a3.5 3.5 0 0 1 7 0V22l1-.5V18a3.2 3.2 0 0 1 6.4 0v4.4l.6-.2a3.1 3.1 0 0 1 6 1.2v8.3C39 39.5 34 45 26.6 45h-1.4c-4.4 0-7.4-1.8-9.8-5.2l-6-8.4a3.2 3.2 0 0 1 4.6-4.4l4 3.3z"
    fill="#fff8e6" stroke="#1a1400" stroke-width="2.4" stroke-linejoin="round"/>
</svg>`;
