// Server-side records. The chain is the source of truth for money and items;
// this keeps what the chain must not see early (bag contents and salts before reveal)
// plus the auction history for the board.
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { cfg } from './config.ts';

mkdirSync(cfg.dataDir, { recursive: true });
export const db = new DatabaseSync(`${cfg.dataDir}/final-call.db`);
db.exec(`PRAGMA journal_mode = WAL;`);

db.exec(`
CREATE TABLE IF NOT EXISTS bags (
  id INTEGER PRIMARY KEY,
  tier INTEGER NOT NULL,
  items TEXT NOT NULL,          -- committed item tokens, secret until reveal
  salt TEXT NOT NULL,           -- secret until reveal
  commitment TEXT NOT NULL,
  manifest TEXT NOT NULL,       -- what the X-ray shows (public)
  flight TEXT NOT NULL,
  opening INTEGER NOT NULL,
  status TEXT NOT NULL,         -- sealing | ready | auction | closing | awaiting_payment | paid | unsold | error
  reserved_for TEXT,            -- tutorial bags belong to one player
  sealed_tx TEXT, sealed_block INTEGER,
  closed_tx TEXT, paid_tx TEXT,
  winner TEXT, price INTEGER,
  rivals TEXT, banter TEXT, ai TEXT,
  created_at INTEGER NOT NULL, closed_at INTEGER
);
CREATE INDEX IF NOT EXISTS bags_status ON bags(status, tier);
CREATE TABLE IF NOT EXISTS players (
  account_id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  public_key TEXT NOT NULL,
  created_tx TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS feed (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`);

export interface BagRow {
  id: number;
  tier: number;
  items: string;
  salt: string;
  commitment: string;
  manifest: string;
  flight: string;
  opening: number;
  status: string;
  reserved_for: string | null;
  sealed_tx: string | null;
  sealed_block: number | null;
  closed_tx: string | null;
  paid_tx: string | null;
  winner: string | null;
  price: number | null;
  rivals: string | null;
  banter: string | null;
  ai: string | null;
  created_at: number;
  closed_at: number | null;
}

export function getBag(id: number): BagRow | undefined {
  return db.prepare('SELECT * FROM bags WHERE id = ?').get(id) as BagRow | undefined;
}

export function setBag(id: number, fields: Partial<BagRow>) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sql = `UPDATE bags SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...keys.map((k) => (fields as any)[k] ?? null), id);
}

export function addFeed(kind: string, data: object) {
  db.prepare('INSERT INTO feed (ts, kind, data) VALUES (?, ?, ?)').run(Date.now(), kind, JSON.stringify(data));
}

export function recentFeed(limit = 30) {
  return (db.prepare('SELECT * FROM feed ORDER BY id DESC LIMIT ?').all(limit) as any[]).map((r) => ({
    ts: r.ts,
    kind: r.kind,
    ...JSON.parse(r.data),
  }));
}

export function nextLotId(): number {
  // Lot ids are unique on chain forever; start from the clock so a fresh database never collides.
  const row = db.prepare("SELECT v FROM meta WHERE k = 'next_lot'").get() as { v: string } | undefined;
  const next = row ? Number(row.v) : Math.floor(Date.now() / 1000);
  db.prepare("INSERT INTO meta (k, v) VALUES ('next_lot', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(String(next + 1));
  return next;
}
