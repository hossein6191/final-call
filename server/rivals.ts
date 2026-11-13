// Rival bidders at runtime. Their money and items live on chain; this module mirrors them,
// decides bids from the public X-ray view only, and runs their life between auctions.
import { RIVALS, type RivalDef } from '../shared/rivals.ts';
import { ITEMS, ITEM_BY_ID, LADDER } from '../shared/catalog.ts';
import { COND_BP, increment, publicEstimate, type ManifestSlot } from '../shared/rules.ts';
import { accountOf, house, panicMessage, rival as rivalTx, view } from './chain.ts';
import { addFeed } from './db.ts';

export interface RivalState {
  def: RivalDef;
  account: string;
  miles: number;
  debt: number;
  inventory: [string, number][];
  committed: number; // miles promised to live auctions
  groundedUntil: number;
  /** Caught cheating: out of every lineup until this time. */
  bannedUntil: number;
  busy: Promise<unknown>;
}

export const rivals = new Map<string, RivalState>();
for (const def of RIVALS) {
  rivals.set(def.sub, {
    def,
    account: accountOf(def.sub),
    miles: def.startMiles,
    debt: 0,
    inventory: [],
    committed: 0,
    groundedUntil: 0,
    bannedUntil: 0,
    busy: Promise.resolve(),
  });
}

export async function syncRival(r: RivalState) {
  const p: any = await view('get_profile', { account_id: r.account });
  if (!p) return;
  r.miles = p.miles;
  r.debt = p.debt;
  r.inventory = p.inventory;
}

export async function syncRivals() {
  await Promise.all([...rivals.values()].map((r) => syncRival(r).catch(() => {})));
}

export const freeMiles = (r: RivalState) => Math.max(0, r.miles - r.committed);
export const isGrounded = (r: RivalState, now = Date.now()) => r.groundedUntil > now || r.miles < 100;
export const isBanned = (r: RivalState, now = Date.now()) => r.bannedUntil > now;
export const BAN_MS = 6 * 3600 * 1000;

/** The most recent ban, so the rest of the floor can gossip about it. */
export let lastBan: { sub: string; name: string; at: number } | null = null;
export function banRival(r: RivalState, until: number, at = Date.now()) {
  r.bannedUntil = Math.max(r.bannedUntil, until);
  if (!lastBan || at > lastBan.at) lastBan = { sub: r.def.sub, name: r.def.name, at };
}

/** Three rivals for a lot. Contents never change; only the lineup adapts. */
export function pickLineup(opts: { lossStreak: number; dominant: boolean; minMiles: number }): RivalState[] {
  const pool = [...rivals.values()].filter((r) => !isGrounded(r) && !isBanned(r) && freeMiles(r) >= opts.minMiles);
  const shuffled = pool.sort(() => Math.random() - 0.5);
  let picked = shuffled.slice(0, 3);
  if (opts.lossStreak >= 3) {
    // Give a struggling player a softer table: prefer the rookie and the bargain hunter.
    const soft = shuffled.filter((r) => r.def.style === 'rookie' || r.def.style === 'bargain');
    picked = [...soft, ...shuffled.filter((r) => !soft.includes(r))].slice(0, 3);
  } else if (opts.dominant) {
    const sal = shuffled.find((r) => r.def.style === 'whale');
    if (sal && !picked.includes(sal)) picked = [sal, ...picked].slice(0, 3);
  }
  return picked;
}

function gauss(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface Plan {
  estimate: number;
  max: number;
}

/** How far a rival will go on this lot. Uses only what the X-ray shows. */
export function planFor(r: RivalState, manifest: ManifestSlot[], tier: number): Plan {
  const base = publicEstimate(manifest, tier);
  let estimate = base * (1 + r.def.noise * Math.max(-2, Math.min(2, gauss())));
  if (r.def.loves?.length) {
    const lovedValue = manifest
      .filter((m) => !m.pouch && r.def.loves!.includes(ITEM_BY_ID[m.id!].category))
      .reduce((s, m) => s + LADDER[ITEM_BY_ID[m.id!].level], 0);
    estimate += lovedValue * 0.5;
  }
  const [g0, g1] = r.def.greed;
  let max = estimate * (g0 + Math.random() * (g1 - g0));
  max = Math.min(max, freeMiles(r) * r.def.walletShare);
  const step = increment(max);
  return { estimate: Math.round(estimate), max: Math.max(0, Math.floor(max / step) * step) };
}

// ---------- after the hammer ----------

function enqueue(r: RivalState, job: () => Promise<unknown>) {
  r.busy = r.busy.then(job).catch((e) => console.error(`rival ${r.def.sub}:`, panicMessage(e)));
  return r.busy;
}

/** The rival pays for a lot it won, then keeps what it loves and sells the rest. */
export function rivalWon(r: RivalState, lotId: number, onPaid: (hash: string, tokens: string[]) => void, onRetry?: (why: string) => void) {
  return enqueue(r, async () => {
    const paid = await rivalTx<string[]>(r.def.sub, 'pay_lot', { id: lotId }).catch((e) => {
      onRetry?.(panicMessage(e)); // the recovery loop pays it later
      throw e;
    });
    onPaid(paid.hash, paid.value);
    const counts = new Map<string, number>();
    for (const t of paid.value) {
      const def = ITEM_BY_ID[t.split('@')[0]];
      if (r.def.loves?.includes(def.category)) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    let total = 0;
    for (const [token, n] of counts) {
      const sold = await rivalTx<number>(r.def.sub, 'sell', { token_id: token, amount: n });
      total += sold.value;
    }
    if (total) addFeed('rival_sold', { rival: r.def.sub, lot: lotId, total });
    await syncRival(r);
  });
}

// ---------- life between auctions ----------

// A broke rival closes up shop until a player backs them (contract: invest). If nobody does,
// the House lends them 500 miles after three hours so the floor never empties for good.
export const GROUND_MS = 3 * 60 * 60 * 1000;

export async function economyTick() {
  await syncRivals();
  const now = Date.now();
  const orders: any[] = await view('orders', { from_index: 0, limit: 100 }).catch(() => []);
  const market: any[] = await view('market').catch(() => []);
  const demand = new Map(market.map((m) => [m.item_id, m.demand_bp as number]));

  for (const r of rivals.values()) {
    // Broke rivals sit out until a player backs them; the House bails them out as a last resort.
    if (r.miles < 100 && r.committed === 0) {
      if (!r.groundedUntil) {
        r.groundedUntil = now + GROUND_MS;
        addFeed('grounded', { rival: r.def.sub, until: r.groundedUntil });
      } else if (now >= r.groundedUntil) {
        await house('grant_loan', { account_id: r.account, amount: 500 })
          .then((tx) => addFeed('loan', { rival: r.def.sub, amount: 500, tx: tx.hash }))
          .catch((e) => console.error('loan', panicMessage(e)));
        r.groundedUntil = 0;
      }
      continue;
    }
    if (r.groundedUntil && r.miles >= 100) r.groundedUntil = 0;

    // Rich rivals pay down their debt.
    if (r.debt > 0 && freeMiles(r) > 3000) {
      enqueue(r, () => rivalTx(r.def.sub, 'repay', { amount: Math.min(r.debt, freeMiles(r) - 2000) }));
    }

    // Collectors keep two buy orders open for things they love, at a premium.
    if (r.def.loves?.length) {
      const mine = orders.filter((o) => o.buyer === r.account);
      for (const o of mine) {
        if (now - Number(o.created_ns) / 1e6 > 3 * 3600 * 1000) enqueue(r, () => rivalTx(r.def.sub, 'cancel_order', { order_id: o.id }));
      }
      if (mine.length < 2 && freeMiles(r) > 800) {
        const wanted = ITEMS.filter((i) => r.def.loves!.includes(i.category) && i.level >= 1 && i.level <= 4)
          .filter((i) => !mine.some((o) => o.item_id === i.id));
        const pick = wanted[Math.floor(Math.random() * wanted.length)];
        if (pick) {
          const unit = Math.floor((LADDER[pick.level] * COND_BP.good * (demand.get(pick.id) ?? 10000)) / 1e8);
          const price = Math.round(unit * (1.3 + Math.random() * 0.2));
          if (price * 1 < freeMiles(r) * 0.4) {
            enqueue(r, async () => {
              const tx = await rivalTx<number>(r.def.sub, 'post_order', { item_id: pick.id, min_cond: 'good', price_each: price, amount: 1 });
              addFeed('order', { rival: r.def.sub, item: pick.id, price, tx: tx.hash });
            });
          }
        }
      }
    }
  }
}
