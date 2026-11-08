// Economy fast-forward: a week of auctions with the real rules, run offline in a second.
// Same bag generator, same X-ray estimates, same rival personalities, same dealer demand model.
import { ITEM_BY_ID, LADDER } from './catalog.ts';
import { RIVALS, type RivalDef } from './rivals.ts';
import {
  COND_BP, DEMAND, increment, makeRng, openingBid, publicEstimate, publicManifest, rollBag, terminalEV,
  type BagItem, type Rng,
} from './rules.ts';

export interface SimBidder {
  id: string;
  name: string;
  color: string;
  def?: RivalDef;
  skill?: number; // bot players: bid up to estimate * skill
  miles: number;
  debt: number;
  kept: BagItem[];
  groundedUntil: number;
  won: number;
  history: number[]; // net worth per sample
}

export interface SimResult {
  hours: number;
  samplesPerDay: number;
  bidders: SimBidder[];
  demand: Record<string, number[]>; // per item id, sampled
  lots: number;
  bankruptcies: { hour: number; name: string }[];
  jackpots: { hour: number; name: string; item: string; value: number }[];
  bestFlip: { name: string; paid: number; worth: number } | null;
}

function gaussian(rng: Rng): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function simulateWeek(seed = 7, opts: { days?: number; lotsPerHour?: number; bots?: number } = {}): SimResult {
  const rng = makeRng(seed);
  const days = opts.days ?? 7;
  const hours = days * 24;
  const lotsPerHour = opts.lotsPerHour ?? 6;
  const samplesPerDay = 24;
  const demand = new Map<string, number>();
  const demandNow = (id: string) => demand.get(id) ?? DEMAND.startBp;
  const dealer = (it: BagItem) => Math.floor((LADDER[ITEM_BY_ID[it.id].level] * COND_BP[it.cond] * demandNow(it.id)) / 1e8);

  const bidders: SimBidder[] = [
    ...RIVALS.map((d) => ({ id: d.sub, name: d.name, color: d.color, def: d, miles: d.startMiles, debt: 0, kept: [], groundedUntil: 0, won: 0, history: [] as number[] })),
    ...Array.from({ length: opts.bots ?? 4 }, (_, i) => ({
      id: `bot${i}`, name: `Player ${i + 1}`, color: '#8a9bb8', skill: 0.62 + i * 0.06, miles: 1000, debt: 0, kept: [], groundedUntil: 0, won: 0, history: [] as number[],
    })),
  ];
  const tracked = ['vinyl', 'film-camera', 'pocket-watch', 'sneakers', 'headphones'];
  const demandHist: Record<string, number[]> = Object.fromEntries(tracked.map((t) => [t, [] as number[]]));
  const bankruptcies: SimResult['bankruptcies'] = [];
  const jackpots: SimResult['jackpots'] = [];
  let bestFlip: SimResult['bestFlip'] = null;
  let lots = 0;

  const worth = (b: SimBidder) => b.miles + b.kept.reduce((s, it) => s + dealer(it), 0) - b.debt;

  for (let step = 0; step < hours * lotsPerHour; step++) {
    const hour = step / lotsPerHour;
    // demand recovers between lots
    for (const [k, v] of demand) demand.set(k, Math.min(DEMAND.startBp, v + DEMAND.recoverBpPerHour / lotsPerHour));
    // broke rivals sit out 30 minutes, then borrow 500
    for (const b of bidders) {
      if (b.miles < 100 && !b.groundedUntil) {
        b.groundedUntil = hour + 0.5;
        bankruptcies.push({ hour, name: b.name });
      } else if (b.groundedUntil && hour >= b.groundedUntil) {
        b.miles += 500;
        b.debt += 500;
        b.groundedUntil = 0;
      }
      if (b.debt > 0 && b.miles > 3000) {
        const pay = Math.min(b.debt, b.miles - 2000);
        b.miles -= pay;
        b.debt -= pay;
      }
    }

    const tier = rng() < 0.6 ? 0 : rng() < 0.75 ? 1 : 2;
    const items = rollBag(rng, tier);
    const manifest = publicManifest(items, tier, rng);
    const est0 = publicEstimate(manifest, tier);
    const opening = openingBid(tier);
    const able = bidders.filter((b) => !b.groundedUntil && b.miles >= opening);
    const table = able.sort(() => rng() - 0.5).slice(0, 4);
    if (!table.length) continue;
    lots++;

    const maxes = table.map((b) => {
      if (b.skill) return Math.min(b.miles, est0 * b.skill);
      const d = b.def!;
      let est = est0 * (1 + d.noise * Math.max(-2, Math.min(2, gaussian(rng))));
      if (d.loves) est += manifest.filter((m) => !m.pouch && d.loves!.includes(ITEM_BY_ID[m.id!].category)).reduce((s, m) => s + LADDER[ITEM_BY_ID[m.id!].level], 0) * 0.5;
      const g = d.greed[0] + rng() * (d.greed[1] - d.greed[0]);
      return Math.min(b.miles * d.walletShare, est * g);
    });
    const order = maxes.map((m, i) => ({ m, i })).sort((a, b) => b.m - a.m);
    if (order[0].m < opening) continue;
    const winner = table[order[0].i];
    const second = order[1]?.m ?? 0;
    const price = Math.min(Math.floor(order[0].m), Math.max(opening, Math.ceil(second + increment(second))));
    winner.miles -= price;
    winner.won++;

    let haul = 0;
    for (const it of items) {
      const v = dealer(it);
      haul += v;
      if (ITEM_BY_ID[it.id].level - tier >= 4) jackpots.push({ hour, name: winner.name, item: ITEM_BY_ID[it.id].name, value: v });
      if (winner.def?.loves?.includes(ITEM_BY_ID[it.id].category)) {
        winner.kept.push(it);
        continue;
      }
      winner.miles += v;
      demand.set(it.id, Math.max(DEMAND.floorBp, demandNow(it.id) * DEMAND.perSaleFactor));
    }
    if (!bestFlip || haul - price > bestFlip.worth - bestFlip.paid) bestFlip = { name: winner.name, paid: price, worth: haul };

    if (step % Math.round(lotsPerHour * (24 / samplesPerDay)) === 0) {
      for (const b of bidders) b.history.push(Math.round(worth(b)));
      for (const t of tracked) demandHist[t].push(demandNow(t));
    }
  }
  for (const b of bidders) b.history.push(Math.round(worth(b)));
  void terminalEV;
  return { hours, samplesPerDay, bidders, demand: demandHist, lots, bankruptcies, jackpots, bestFlip };
}
