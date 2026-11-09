// Player progress kept on this device: daily missions, passport stamps (achievements),
// lifetime counters, and which tutorial steps were seen. Money and items stay on chain;
// this is only the game's meta layer.
import { toast } from '../state.ts';
import { sound } from '../audio.ts';

export type Stat =
  | 'appraise' | 'bid' | 'win' | 'profit' | 'treasure' | 'legendary' | 'snipe' | 'war'
  | 'sell' | 'fill' | 'pouch' | 'fullscan' | 'beatSal' | 'jump' | 'duel' | 'invest';

interface Store {
  life: Partial<Record<Stat, number>>;
  day: string;
  today: Partial<Record<Stat, number>>;
  stamps: Record<string, number>; // stamp id -> time earned
  done: string[]; // mission ids completed today
  seen: string[]; // tutorial steps already shown
  worth?: { t: number; v: number }[]; // net worth over time
}

const KEY = 'fc:progress';
const today = () => new Date().toISOString().slice(0, 10);

function load(): Store {
  let s: Store | null = null;
  try {
    s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {}
  s ??= { life: {}, day: today(), today: {}, stamps: {}, done: [], seen: [] };
  s.seen ??= [];
  if (s.day !== today()) {
    s.day = today();
    s.today = {};
    s.done = [];
  }
  return s;
}
let store = load();
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {}
};

// ---------- daily missions ----------
export interface Mission { id: string; stat: Stat; goal: number; title: string; hint: string }
const POOL: Mission[] = [
  { id: 'appraise5', stat: 'appraise', goal: 5, title: 'Appraise 5 items', hint: 'Hold the beam on an item, or tap it, during the scan.' },
  { id: 'win2', stat: 'win', goal: 2, title: 'Win 2 bags', hint: 'Keep the lead until the hammer falls.' },
  { id: 'bid12', stat: 'bid', goal: 12, title: 'Place 12 bids', hint: 'Every tap on BID counts.' },
  { id: 'sell3', stat: 'sell', goal: 3, title: 'Sell 3 items', hint: 'My Bags → SELL to the Customs Dealer.' },
  { id: 'pouch4', stat: 'pouch', goal: 4, title: 'Crack 4 sealed pouches', hint: 'Win a bag, then tap its pouches.' },
  { id: 'profit1', stat: 'profit', goal: 1, title: 'Make a profit on a bag', hint: 'Win a bag that holds more than you paid.' },
  { id: 'fullscan2', stat: 'fullscan', goal: 2, title: 'X-ray 2 bags end to end', hint: 'Drag the beam across the whole bag before bidding opens.' },
  { id: 'jump3', stat: 'jump', goal: 3, title: 'Make 3 jump bids', hint: 'JUMP raises by 3 steps and scares weak rivals off.' },
  { id: 'duel1', stat: 'duel', goal: 1, title: 'Win a head-to-head duel', hint: 'Be one of the last two bidders, then take it.' },
];

function dayNumber() {
  return Math.floor(Date.now() / 86400000);
}
/** Three missions per day, the same for everyone on that day. */
export function missions(): (Mission & { have: number; complete: boolean })[] {
  const d = dayNumber();
  // Step 4 is coprime with the pool size (9), so the three picks are always different.
  const picks = [0, 1, 2].map((i) => POOL[(d * 5 + i * 4) % POOL.length]);
  return picks.map((m) => {
    const have = Math.min(m.goal, store.today[m.stat] ?? 0);
    return { ...m, have, complete: store.done.includes(m.id) || have >= m.goal };
  });
}

// ---------- passport stamps ----------
export interface Stamp { id: string; title: string; text: string; color: string; glyph: string }
export const STAMPS: Stamp[] = [
  { id: 'first', title: 'First Flight', text: 'Win your first bag', color: '#3ddc84', glyph: '✈' },
  { id: 'green', title: 'In the Green', text: 'Make a profit on a bag', color: '#5bd67a', glyph: '+' },
  { id: 'sniper', title: 'Sniper', text: 'Win with a last-second bid', color: '#ff5d5d', glyph: '⌖' },
  { id: 'war', title: 'Bidding War', text: 'Win a war of 4+ bids', color: '#ff9a3c', glyph: '⚔' },
  { id: 'treasure', title: 'Treasure Hunter', text: 'Find an epic or legendary item', color: '#b06cff', glyph: '✦' },
  { id: 'legend', title: 'Legend', text: 'Find a legendary item', color: '#ffc83d', glyph: '★' },
  { id: 'dealer', title: "Dealer's Friend", text: 'Sell 10 items', color: '#4aa8ff', glyph: '¤' },
  { id: 'collector', title: 'Collector Contact', text: "Fill a rival's buy order", color: '#c8a6ff', glyph: '♦' },
  { id: 'appraiser', title: 'Sharp Eye', text: 'Appraise 25 items', color: '#9fe0ff', glyph: '◎' },
  { id: 'salslayer', title: 'Whale Hunter', text: 'Outbid Big Sal', color: '#ffd23f', glyph: '♛' },
  { id: 'angel', title: 'Angel Investor', text: 'Back a broke rival', color: '#3ddc84', glyph: '♥' },
  { id: 'intl', title: 'Globetrotter', text: 'Unlock the International terminal', color: '#2b4c7e', glyph: '⊕' },
  { id: 'lounge', title: 'Lounge Access', text: 'Unlock the Lounge', color: '#9b2a50', glyph: '♜' },
];
const STAMP_RULES: [string, () => boolean][] = [
  ['first', () => (store.life.win ?? 0) >= 1],
  ['green', () => (store.life.profit ?? 0) >= 1],
  ['sniper', () => (store.life.snipe ?? 0) >= 1],
  ['war', () => (store.life.war ?? 0) >= 1],
  ['treasure', () => (store.life.treasure ?? 0) >= 1],
  ['legend', () => (store.life.legendary ?? 0) >= 1],
  ['dealer', () => (store.life.sell ?? 0) >= 10],
  ['collector', () => (store.life.fill ?? 0) >= 1],
  ['appraiser', () => (store.life.appraise ?? 0) >= 25],
  ['salslayer', () => (store.life.beatSal ?? 0) >= 1],
  ['angel', () => (store.life.invest ?? 0) >= 1],
];

export function stamps() {
  return STAMPS.map((s) => ({ ...s, at: store.stamps[s.id] ?? 0 }));
}
export function stampCount() {
  return Object.keys(store.stamps).length;
}

function award(id: string) {
  if (store.stamps[id]) return;
  store.stamps[id] = Date.now();
  const s = STAMPS.find((x) => x.id === id)!;
  setTimeout(() => {
    sound.breakEven();
    toast(`<span class="stamp-toast" style="--c:${s.color}">${s.glyph}</span> <b>Stamp earned: ${s.title}</b> · ${s.text}`);
  }, 900);
}

/** Record something the player did. Completes missions and stamps as it goes. */
export function track(stat: Stat, n = 1) {
  const before = missions().filter((m) => m.complete).map((m) => m.id);
  store.life[stat] = (store.life[stat] ?? 0) + n;
  store.today[stat] = (store.today[stat] ?? 0) + n;
  for (const m of missions()) {
    if (m.complete && !before.includes(m.id)) {
      store.done.push(m.id);
      setTimeout(() => {
        sound.breakEven();
        toast(`✅ <b>Mission complete:</b> ${m.title}`);
      }, 600);
    }
  }
  for (const [id, ok] of STAMP_RULES) if (ok()) award(id);
  save();
}

/** Terminal unlocks are stamps too (checked whenever net worth changes). */
export function checkUnlocks(netWorth: number, unlockAt: number[]) {
  if (netWorth >= unlockAt[1]) award('intl');
  if (netWorth >= unlockAt[2]) award('lounge');
  save();
}

export const life = (s: Stat) => store.life[s] ?? 0;

// ---------- tutorial steps ----------
export const seen = (step: string) => store.seen.includes(step);
export function markSeen(step: string) {
  if (!store.seen.includes(step)) store.seen.push(step);
  save();
}
export function resetTutorial() {
  store.seen = [];
  save();
}

// ---------- net worth history (for the chart) ----------
export function recordWorth(v: number) {
  const h = (store.worth ??= []);
  const last = h[h.length - 1];
  const now = Date.now();
  if (last && Math.round(last.v) === Math.round(v)) return;
  if (last && now - last.t < 90_000) last.v = v; // fold quick changes into one point
  else h.push({ t: now, v });
  if (h.length > 40) h.splice(0, h.length - 40);
  save();
}
export const worthHistory = () => [...(store.worth ?? [])];
