// Rival cameos: now and then a rival slides in from the edge of the screen, teases the
// player about their run, and slides back out. Tap to send them away early.
import { state, esc, fmt } from '../state.ts';
import { AVATARS } from '../avatars.ts';
import { sound } from '../audio.ts';

interface Ctx { player: string; worth: number; next?: string; bags: number }
type Line = (c: Ctx) => string;

const LINES: Record<string, Line[]> = {
  marguerite: [
    (c) => `${fmt(c.worth)} net worth? Charming. I spend that on frames.`,
    (c) => `${c.player}, darling, the duck is never the treasure.`,
    () => 'I can smell real leather through an X-ray.',
    (c) => (c.next ? `${c.next}? Bring a better eye, not just miles.` : 'The Lounge suits you. Almost.'),
  ],
  bigsal: [
    (c) => `${fmt(c.worth)}? Cute. That's my parking budget.`,
    (c) => `Hey ${c.player}, next bag's mine. Just saying.`,
    () => 'I bid with my eyes closed. Still win.',
    (c) => `${c.bags} bags? I buy that many before breakfast.`,
  ],
  dash: [
    () => "I wasn't bluffing last time. Or was I?",
    (c) => `${c.player}, I can read your face from here.`,
    () => 'Psst. The next bag is full of gold. Probably.',
    () => "Bet you won't jump on the next one.",
  ],
  kip: [
    () => 'Is the rubber duck worth a lot? Asking for me.',
    (c) => `${c.player}! Teach me how you do it!`,
    () => 'I bought a bag of socks. All left feet.',
    () => 'My mom says I have to stop bidding. I will not.',
  ],
  odo: [
    () => 'Every bag is a story. Most are boring.',
    (c) => `${c.player}, did you keep the vinyl? Tell me you kept the vinyl.`,
    () => 'I once paid 900 miles for a postcard. Worth it.',
    (c) => (c.next ? `The ${c.next} has artifacts. Just saying.` : 'The Lounge archive is mine, you know.'),
  ],
  nell: [
    () => 'Never pay the opening bid. Never.',
    (c) => `${c.player}, I saw what you paid last time. Ouch.`,
    () => "If it's not a bargain, it's a souvenir.",
    () => 'I fold early and sleep well.',
  ],
};

const recent: string[] = [];

/** One cameo now. Returns false if nothing could be shown. */
export function cameo(ctx: Ctx, sub?: string): boolean {
  if (document.querySelector('.overlay, .cameo, .coach-ring') || document.hidden) return false;
  const rivals = state.cfg?.rivals ?? [];
  const pool = rivals.filter((r) => LINES[r.sub] && !recent.includes(r.sub));
  const r = sub ? rivals.find((x) => x.sub === sub) : pool[Math.floor(Math.random() * pool.length)];
  if (!r) return false;
  recent.push(r.sub);
  if (recent.length > 3) recent.shift();
  const lines = LINES[r.sub];
  const line = lines[Math.floor(Math.random() * lines.length)](ctx);
  const side = Math.random() < 0.5 ? 'left' : 'right';
  const el = document.createElement('button');
  el.className = `cameo ${side}`;
  el.setAttribute('aria-label', `${r.name}: ${line}`);
  el.innerHTML = `<div class="cameo-av">${AVATARS[r.sub] ?? ''}</div><div class="cameo-bub"><b style="color:${r.color}">${esc(r.name)}</b>${esc(line)}</div>`;
  document.body.appendChild(el);
  sound.tap();
  const av = el.querySelector('.cameo-av') as HTMLElement;
  setTimeout(() => av.classList.add(Math.random() < 0.6 ? 'expr-happy' : 'expr-think'), 450);
  const leave = () => {
    if (!el.isConnected || el.classList.contains('out')) return;
    el.classList.add('out');
    setTimeout(() => el.remove(), 450);
  };
  el.onclick = leave;
  setTimeout(leave, 4800);
  return true;
}

/** Schedules cameos while a screen is open. Returns a stop function. */
export function startCameos(ctx: () => Ctx | null, firstMs = 7000): () => void {
  let timer = 0;
  let stopped = false;
  const plan = (ms: number) => {
    timer = window.setTimeout(() => {
      if (stopped) return;
      const c = ctx();
      const shown = c ? cameo(c) : false;
      plan(shown ? 32000 + Math.random() * 26000 : 6000);
    }, ms);
  };
  plan(firstMs);
  return () => {
    stopped = true;
    clearTimeout(timer);
    document.querySelectorAll('.cameo').forEach((e) => e.remove());
  };
}
