// Game rules shared by the server, the client and the economy simulator.
// The contract re-implements the parts that touch money (dealer price, demand, commitment).

import { ITEMS, LADDER, baseValue, itemsAtLevel } from './catalog.ts';

export type Cond = 'worn' | 'good' | 'mint';
export const CONDITIONS: Cond[] = ['worn', 'good', 'mint'];
// Basis points, 10000 = 1.0x. Must match the contract.
export const COND_BP: Record<Cond, number> = { worn: 6000, good: 10000, mint: 15000 };
export const COND_ODDS: Record<Cond, number> = { worn: 0.3, good: 0.5, mint: 0.2 };

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];
export const RARITY_ODDS = [0.68, 0.22, 0.07, 0.025, 0.005];
// Big Lot and the lounge get a fatter legendary tail.
export const RARITY_ODDS_RICH = [0.66, 0.22, 0.075, 0.03, 0.015];

export interface Terminal {
  id: number;
  name: string;
  short: string;
  ladderStart: number; // ladder step of a common item
  unlockNetWorth: number;
}

export const TERMINALS: Terminal[] = [
  { id: 0, name: 'Domestic Carousel', short: 'DOM', ladderStart: 0, unlockNetWorth: 0 },
  { id: 1, name: 'International Hall', short: 'INTL', ladderStart: 1, unlockNetWorth: 3000 },
  { id: 2, name: 'First Class Lounge', short: 'LNG', ladderStart: 2, unlockNetWorth: 12000 },
];

export const START_MILES = 1000;

// ---------- bag contents ----------

export interface BagItem {
  id: string; // catalog id
  cond: Cond;
  pouch: boolean; // sealed pouch: dark on the X-ray
}

// Canonical item token: "<id>@<cond>:<v|p>". The contract parses the same format.
export function itemToken(it: BagItem): string {
  return `${it.id}@${it.cond}:${it.pouch ? 'p' : 'v'}`;
}

export function parseItemToken(tok: string): BagItem {
  const m = /^([a-z0-9-]+)@(worn|good|mint):(v|p)$/.exec(tok);
  if (!m) throw new Error(`bad item token ${tok}`);
  return { id: m[1], cond: m[2] as Cond, pouch: m[3] === 'p' };
}

// The string whose sha256 is printed on the luggage tag.
// Must match `commitment_preimage` in contract/src/lib.rs byte for byte.
export function commitmentPreimage(contract: string, lotId: number, tier: number, items: BagItem[], salt: string): string {
  return `final-call/v1|${contract}|lot=${lotId}|tier=${tier}|items=${items.map(itemToken).join(',')}|salt=${salt}`;
}

export function itemValue(it: { id: string; cond: Cond }, demandBp = 10000): number {
  return Math.floor((baseValue(it.id) * COND_BP[it.cond] * demandBp) / 100_000_000);
}

export function bagValue(items: BagItem[]): number {
  return items.reduce((s, it) => s + itemValue(it), 0);
}

// Expected value of a bag for a terminal, at full demand.
export function terminalEV(tier: number, rich = false): number {
  const odds = rich ? RARITY_ODDS_RICH : RARITY_ODDS;
  const start = TERMINALS[tier].ladderStart;
  const condMean = CONDITIONS.reduce((s, c) => s + COND_ODDS[c] * (COND_BP[c] / 10000), 0);
  const perItem = odds.reduce((s, p, r) => s + p * LADDER[Math.min(start + r, LADDER.length - 1)], 0);
  return Math.round(perItem * condMean * 8);
}

export type Rng = () => number;

// Small deterministic PRNG (mulberry32) so simulations and tests are repeatable.
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(rng: Rng, weights: number[]): number {
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

export function rollBag(rng: Rng, tier: number, opts: { rich?: boolean; tutorial?: boolean } = {}): BagItem[] {
  const odds = opts.rich ? RARITY_ODDS_RICH : RARITY_ODDS;
  const count = 6 + Math.floor(rng() * 5); // 6..10
  const start = TERMINALS[tier].ladderStart;
  const items: BagItem[] = [];
  for (let i = 0; i < count; i++) {
    const r = pickWeighted(rng, odds);
    const level = Math.min(start + r, LADDER.length - 1);
    const pool = itemsAtLevel(level);
    const def = pool[Math.floor(rng() * pool.length)];
    const cond = CONDITIONS[pickWeighted(rng, CONDITIONS.map((c) => COND_ODDS[c]))];
    items.push({ id: def.id, cond, pouch: false });
  }
  if (opts.tutorial) {
    // Guaranteed rare, in plain sight, so the first bag teaches the payoff.
    const pool = itemsAtLevel(start + 2);
    items[0] = { id: pool[Math.floor(rng() * pool.length)].id, cond: 'good', pouch: false };
  }
  // 3-4 items go into sealed pouches (never the tutorial rare).
  const pouches = 3 + (rng() < 0.5 ? 1 : 0);
  const order = items.map((_, i) => i).filter((i) => !(opts.tutorial && i === 0));
  for (let k = 0; k < pouches && order.length; k++) {
    const j = Math.floor(rng() * order.length);
    items[order[j]].pouch = true;
    order.splice(j, 1);
  }
  return items;
}

// ---------- what the X-ray shows (the public manifest) ----------

export interface ManifestSlot {
  slot: number;
  pouch: boolean;
  id?: string; // only for visible items
  material?: string; // only for visible items
  weight: 'light' | 'medium' | 'heavy'; // pouches only show this
  glint: boolean; // pouch with something rare inside, 30% of the time
}

export function publicManifest(items: BagItem[], tier: number, rng: Rng): ManifestSlot[] {
  const rareLevel = TERMINALS[tier].ladderStart + 2;
  return items.map((it, slot) => {
    const def = ITEMS.find((d) => d.id === it.id)!;
    const heavy = def.material === 'dense' || def.material === 'metal';
    const weight = heavy ? 'heavy' : def.material === 'organic' ? 'light' : 'medium';
    if (!it.pouch) return { slot, pouch: false, id: it.id, material: def.material, weight, glint: false };
    return { slot, pouch: true, weight, glint: def.level >= rareLevel && rng() < 0.3 };
  });
}

// Per-item expected value for a terminal (used for pouch estimates).
export function perItemEV(tier: number): number {
  return terminalEV(tier) / 8;
}

// Expected value of a rare-or-better item at a terminal (what a glint suggests).
export function rarePlusEV(tier: number): number {
  const start = TERMINALS[tier].ladderStart;
  const tail = RARITY_ODDS.slice(2);
  const total = tail.reduce((a, b) => a + b, 0);
  return tail.reduce((s, p, i) => s + (p / total) * LADDER[Math.min(start + 2 + i, LADDER.length - 1)], 0);
}

// What anyone looking at the X-ray can work out: visible items at catalog value with
// average condition, plus pouches from their hints. Rivals use exactly this.
export function publicEstimate(manifest: ManifestSlot[], tier: number): number {
  const condMean = CONDITIONS.reduce((s, c) => s + COND_ODDS[c] * (COND_BP[c] / 10000), 0);
  const avg = perItemEV(tier);
  let est = 0;
  for (const m of manifest) {
    if (!m.pouch) est += baseValue(m.id!) * condMean;
    else if (m.glint) est += rarePlusEV(tier) * condMean;
    else est += avg * (m.weight === 'heavy' ? 1.25 : m.weight === 'light' ? 0.8 : 1);
  }
  return Math.round(est);
}

// ---------- auction ----------

export const AUCTION = {
  onceMs: 2000,
  twiceMs: 3500,
  soldMs: 5000,
  heatAfterMs: 25000,
  capMs: 40000,
  openingShare: 0.4, // opening bid as a share of terminal EV
};

export function increment(price: number, heat = false): number {
  const step = price < 200 ? 10 : price < 1000 ? 25 : price < 5000 ? 100 : 250;
  return heat ? step * 2 : step;
}

export function openingBid(tier: number): number {
  const raw = terminalEV(tier) * AUCTION.openingShare;
  const step = increment(raw);
  return Math.max(step, Math.round(raw / step) * step);
}

// ---------- market (mirror of the contract) ----------

export const DEMAND = {
  startBp: 10000,
  floorBp: 4000,
  perSaleFactor: 0.92,
  recoverBpPerHour: 200,
};

export function demandNow(storedBp: number, updatedMs: number, nowMs: number): number {
  const hours = Math.max(0, nowMs - updatedMs) / 3_600_000;
  return Math.min(DEMAND.startBp, Math.floor(storedBp + hours * DEMAND.recoverBpPerHour));
}
