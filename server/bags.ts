// The Arrivals board: a pool of bags per terminal, each sealed on chain before anyone sees it.
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { cfg } from './config.ts';
import { db, getBag, nextLotId, setBag, addFeed, type BagRow } from './db.ts';
import { house, panicMessage } from './chain.ts';
import { ITEM_BY_ID } from '../shared/catalog.ts';
import {
  TERMINALS, commitmentPreimage, itemToken, makeRng, openingBid, publicManifest, rollBag,
  type BagItem, type ManifestSlot,
} from '../shared/rules.ts';

const POOL_PER_TIER = 4;
const ORIGINS = [
  'Lisbon', 'Osaka', 'Nairobi', 'Reykjavik', 'Lima', 'Hanoi', 'Marrakesh', 'Oslo', 'Havana', 'Seoul',
  'Cape Town', 'Istanbul', 'Montreal', 'Bogotá', 'Tbilisi', 'Auckland', 'Cairo', 'Kraków', 'Manila', 'Dubai',
];

export interface Flight {
  code: string;
  origin: string;
  carousel: number;
  days: number; // days unclaimed
  kg: number; // total weight on the belt scale (public, like the X-ray)
  sticker: string | null;
}

const KG = { organic: 0.6, plastic: 0.4, metal: 1.1, dense: 1.8 } as const;
const STICKERS = ['FRAGILE', 'HEAVY', 'PRIORITY', 'LAST MINUTE', 'HANDLE WITH CARE', null, null];

export interface PublicBag {
  id: number;
  tier: number;
  terminal: string;
  flight: Flight;
  itemCount: number;
  opening: number;
  commitment: string;
  sealedTx: string | null;
  sealedBlock: number | null;
  status: string;
  reservedFor: boolean;
  manifest?: ManifestSlot[];
}

function newFlight(manifest: ManifestSlot[], items: BagItem[]): Flight {
  const kg = 3.2 + items.reduce((s, it) => s + KG[ITEM_BY_ID[it.id].material], 0) + manifest.filter((m) => m.pouch).length * 0.2;
  return {
    code: `FC ${randomInt(100, 999)}`,
    origin: ORIGINS[randomInt(ORIGINS.length)],
    carousel: randomInt(1, 13),
    days: randomInt(30, 120),
    kg: Math.round(kg * 10) / 10,
    sticker: STICKERS[randomInt(STICKERS.length)],
  };
}

function makeBag(tier: number, opts: { tutorial?: boolean; reservedFor?: string } = {}): BagRow {
  const id = nextLotId();
  const seed = randomBytes(4).readUInt32LE(0);
  const items: BagItem[] = rollBag(makeRng(seed), tier, { tutorial: opts.tutorial });
  const salt = randomBytes(16).toString('hex');
  const commitment = createHash('sha256').update(commitmentPreimage(cfg.contract, id, tier, items, salt)).digest('hex');
  const manifest = publicManifest(items, tier, makeRng(seed ^ 0x5eed));
  const row: BagRow = {
    id, tier,
    items: JSON.stringify(items.map(itemToken)),
    salt, commitment,
    manifest: JSON.stringify(manifest),
    flight: JSON.stringify(newFlight(manifest, items)),
    opening: opts.tutorial ? 50 : openingBid(tier),
    status: 'sealing',
    reserved_for: opts.reservedFor ?? null,
    sealed_tx: null, sealed_block: null, closed_tx: null, paid_tx: null,
    winner: null, price: null, rivals: null, banter: null, ai: null,
    created_at: Date.now(), closed_at: null,
  };
  db.prepare(
    `INSERT INTO bags (id, tier, items, salt, commitment, manifest, flight, opening, status, reserved_for, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.tier, row.items, row.salt, row.commitment, row.manifest, row.flight, row.opening, row.status, row.reserved_for, row.created_at);
  return row;
}

async function seal(rows: BagRow[]) {
  if (!rows.length) return;
  try {
    const tx = await house<unknown>('open_lots', {
      lots: rows.map((r) => ({ id: r.id, tier: r.tier, commitment: r.commitment, opening: r.opening })),
    });
    const height = tx.events.find((e) => e.event === 'lots_sealed')?.data[0]?.block ?? null;
    for (const r of rows) setBag(r.id, { status: 'ready', sealed_tx: tx.hash, sealed_block: height });
    addFeed('sealed', { ids: rows.map((r) => r.id), tx: tx.hash });
  } catch (e) {
    console.error('seal failed', panicMessage(e));
    for (const r of rows) setBag(r.id, { status: 'error' });
  }
}

let filling = false;
export async function fillPool() {
  if (filling) return;
  filling = true;
  try {
    const batch: BagRow[] = [];
    for (const t of TERMINALS) {
      const { n } = db.prepare("SELECT COUNT(*) AS n FROM bags WHERE tier = ? AND status IN ('sealing','ready') AND reserved_for IS NULL").get(t.id) as { n: number };
      for (let i = n; i < POOL_PER_TIER; i++) batch.push(makeBag(t.id));
    }
    await seal(batch);
  } finally {
    filling = false;
  }
}

export async function sealTutorialBag(accountId: string): Promise<number> {
  const row = makeBag(0, { tutorial: true, reservedFor: accountId });
  await seal([row]);
  return row.id;
}

export function toPublic(r: BagRow, withManifest = false): PublicBag {
  return {
    id: r.id,
    tier: r.tier,
    terminal: TERMINALS[r.tier].name,
    flight: JSON.parse(r.flight),
    itemCount: (JSON.parse(r.manifest) as unknown[]).length,
    opening: r.opening,
    commitment: r.commitment,
    sealedTx: r.sealed_tx,
    sealedBlock: r.sealed_block,
    status: r.status,
    reservedFor: Boolean(r.reserved_for),
    manifest: withManifest ? JSON.parse(r.manifest) : undefined,
  };
}

export function arrivals(accountId?: string): PublicBag[] {
  const rows = db
    .prepare("SELECT * FROM bags WHERE status = 'ready' AND (reserved_for IS NULL OR reserved_for = ?) ORDER BY reserved_for IS NULL, tier, id")
    .all(accountId ?? '') as unknown as BagRow[];
  const seen = new Map<number, number>();
  const out: PublicBag[] = [];
  for (const r of rows) {
    const k = r.reserved_for ? -1 : r.tier;
    const c = seen.get(k) ?? 0;
    if (c >= 3) continue;
    seen.set(k, c + 1);
    out.push(toPublic(r));
  }
  return out;
}

/** Atomically takes a ready bag for an auction. */
export function claimBag(id: number, accountId: string): BagRow | null {
  const r = getBag(id);
  if (!r || r.status !== 'ready') return null;
  if (r.reserved_for && r.reserved_for !== accountId) return null;
  const res = db.prepare("UPDATE bags SET status = 'auction' WHERE id = ? AND status = 'ready'").run(id);
  return res.changes === 1 ? getBag(id)! : null;
}
