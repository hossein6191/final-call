// Final Call game server: HTTP API, static client, and the live auction socket.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { PublicKey } from 'near-api-js';
import { cfg } from './config.ts';
import { db, getBag, setBag, recentFeed, type BagRow } from './db.ts';
import { house, panicMessage, provider, txUrl, view } from './chain.ts';
import { arrivals, claimBag, fillPool, sealTutorialBag, toPublic } from './bags.ts';
import { Auction } from './auction.ts';
import { economyTick, pickLineup, rivalWon, rivals, syncRivals } from './rivals.ts';
import { RIVALS } from '../shared/rivals.ts';
import { ITEM_BY_ID, LADDER } from '../shared/catalog.ts';
import { COND_BP, TERMINALS } from '../shared/rules.ts';

const STATIC_DIR = 'web/dist';
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};

function json(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 16_384) throw new Error('body too large');
    chunks.push(c as Buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

// ---------- caches ----------

let marketCache: { at: number; rows: any[] } = { at: 0, rows: [] };
async function market() {
  if (Date.now() - marketCache.at > 4000) marketCache = { at: Date.now(), rows: await view<any[]>('market') };
  return marketCache.rows;
}

function dealerValue(token: string, demand: Map<string, number>): number {
  const [id, cond] = token.split('@');
  return Math.floor((LADDER[ITEM_BY_ID[id].level] * COND_BP[cond as 'good'] * (demand.get(id) ?? 10000)) / 1e8);
}

let boardCache: { at: number; body: any } = { at: 0, body: null };
async function board() {
  if (Date.now() - boardCache.at < 5000 && boardCache.body) return boardCache.body;
  const profiles: any[] = [];
  for (let from = 0; from < 1000; from += 100) {
    const page = await view<any[]>('profiles', { from_index: from, limit: 100 });
    profiles.push(...page);
    if (page.length < 100) break;
  }
  const rows = await market();
  const demand = new Map(rows.map((m: any) => [m.item_id, m.demand_bp]));
  const people = profiles
    .filter((p) => !p.account_id.startsWith('e2e-'))
    .map((p) => {
      const items = p.inventory.reduce((s: number, [t, n]: [string, number]) => s + dealerValue(t, demand) * n, 0);
      const r = RIVALS.find((d) => `${d.sub}.${cfg.contract}` === p.account_id);
      return {
        account: p.account_id, name: p.nickname, rival: p.rival, color: r?.color ?? null, title: r?.title ?? null,
        miles: p.miles, items, debt: p.debt, netWorth: p.miles + items - p.debt, won: p.lots_won, spent: p.spent, earned: p.earned,
        grounded: r ? (rivals.get(r.sub)!.groundedUntil > Date.now() || p.miles < 100) : false,
      };
    })
    .sort((a, b) => b.netWorth - a.netWorth);
  boardCache = { at: Date.now(), body: { people, feed: recentFeed(40) } };
  return boardCache.body;
}

// ---------- joining ----------

const joinsByIp = new Map<string, number[]>();
let globalJoins: number[] = [];
function allowGlobalJoin(): boolean {
  const now = Date.now();
  globalJoins = globalJoins.filter((t) => now - t < 3_600_000);
  if (globalJoins.length >= Number(process.env.JOIN_GLOBAL_LIMIT ?? 150)) return false;
  globalJoins.push(now);
  return true;
}
function allowJoin(ip: string): boolean {
  const now = Date.now();
  const list = (joinsByIp.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (list.length >= cfg.joinLimit) return false;
  list.push(now);
  joinsByIp.set(ip, list);
  return true;
}

async function handleJoin(req: IncomingMessage, res: ServerResponse) {
  const body = await readBody(req);
  const nickname = String(body.nickname ?? '').trim();
  const publicKey = String(body.publicKey ?? '');
  if (!/^[\p{L}\p{N} _.-]{2,16}$/u.test(nickname)) return json(res, 400, { error: 'Nickname: 2-16 letters or numbers.' });
  try {
    PublicKey.from(publicKey);
  } catch {
    return json(res, 400, { error: 'Bad public key.' });
  }
  // Behind a trusted proxy (TRUST_PROXY=1) the client is the last address the proxy appended;
  // otherwise the socket address. A client-sent first hop is never trusted.
  const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const ip = process.env.TRUST_PROXY === '1' && fwd.length ? fwd[fwd.length - 1] : String(req.socket.remoteAddress ?? '');
  if (!allowJoin(ip) || !allowGlobalJoin()) return json(res, 429, { error: 'Too many new travellers right now. Try again later.' });

  const slug = nickname.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '').slice(0, 14) || 'guest';
  const sub = `${slug}-${randomBytes(2).toString('hex')}`;
  const account = `${sub}.${cfg.contract}`;
  try {
    const tx = await house<boolean>('create_account', { sub, public_key: publicKey, nickname, rival: false }, 60);
    if (tx.value !== true) return json(res, 500, { error: 'Account creation failed, try another name.' });
    db.prepare('INSERT INTO players (account_id, nickname, public_key, created_tx, created_at) VALUES (?, ?, ?, ?, ?)').run(account, nickname, publicKey, tx.hash, Date.now());
    const tutorialLot = await sealTutorialBag(account);
    json(res, 200, { account, nickname, tx: tx.hash, url: txUrl(tx.hash), tutorialLot });
  } catch (e) {
    json(res, 500, { error: panicMessage(e) });
  }
}

// ---------- lots ----------

function lotPublic(r: BagRow) {
  const revealed = !['sealing', 'ready', 'auction'].includes(r.status);
  return {
    ...toPublic(r, true),
    closedTx: r.closed_tx,
    paidTx: r.paid_tx,
    winner: r.winner,
    price: r.price,
    rivals: r.rivals ? JSON.parse(r.rivals) : null,
    ai: r.ai ? JSON.parse(r.ai) : null,
    tokens: revealed ? JSON.parse(r.items) : null,
    salt: revealed ? r.salt : null,
    contract: cfg.contract,
  };
}

async function markPaidIfPaid(id: number) {
  const lot: any = await view('get_lot', { id });
  if (lot?.status === 'Paid') setBag(id, { status: 'paid' });
  return lot?.status;
}

// ---------- HTTP ----------

async function serveStatic(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (path === '/' || !extname(path)) path = '/index.html';
    const file = join(STATIC_DIR, path);
    const s = await stat(file);
    if (!s.isFile()) throw new Error('not a file');
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found. Run `npm run build` first.');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const p = url.pathname;
  try {
    if (p === '/api/config') {
      return json(res, 200, {
        contract: cfg.contract, network: cfg.network, explorer: cfg.explorer, rpc: cfg.rpcs[0],
        rivals: RIVALS.map(({ sub, name, title, bio, color, style, loves }) => ({ sub, account: `${sub}.${cfg.contract}`, name, title, bio, color, style, loves })),
        terminals: TERMINALS,
        playerMethods: ['pay_lot', 'sell', 'post_order', 'cancel_order', 'fill_order', 'repay'],
      });
    }
    if (p === '/api/join' && req.method === 'POST') return await handleJoin(req, res);
    if (p === '/api/arrivals') return json(res, 200, arrivals(url.searchParams.get('account') ?? undefined));
    if (p === '/api/board') return json(res, 200, await board());
    if (p === '/api/market') {
      const [rows, orders] = await Promise.all([market(), view<any[]>('orders', { from_index: 0, limit: 100 })]);
      return json(res, 200, { market: rows, orders });
    }
    if (p === '/api/me') {
      const account = url.searchParams.get('account') ?? '';
      const [profile, rows] = await Promise.all([view('get_profile', { account_id: account }), market()]);
      const pending = db.prepare("SELECT id, price, closed_tx FROM bags WHERE winner = ? AND status = 'awaiting_payment'").all(account);
      const demand = new Map(rows.map((m: any) => [m.item_id, m.demand_bp]));
      const prices = profile ? Object.fromEntries((profile as any).inventory.map(([t]: [string]) => [t, dealerValue(t, demand)])) : {};
      return json(res, 200, { profile, pending, prices });
    }
    const lotMatch = /^\/api\/lot\/(\d+)$/.exec(p);
    if (lotMatch) {
      const r = getBag(Number(lotMatch[1]));
      return r ? json(res, 200, lotPublic(r)) : json(res, 404, { error: 'no such lot' });
    }
    const paidMatch = /^\/api\/lot\/(\d+)\/paid$/.exec(p);
    if (paidMatch && req.method === 'POST') {
      const id = Number(paidMatch[1]);
      const body = await readBody(req);
      const status = await markPaidIfPaid(id);
      const tx = String(body.tx ?? '');
      if (status === 'Paid' && /^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(tx) && !getBag(id)?.paid_tx) setBag(id, { paid_tx: tx });
      return json(res, 200, { status });
    }
    if (p.startsWith('/api/')) return json(res, 404, { error: 'not found' });
    return await serveStatic(req, res);
  } catch (e) {
    console.error(p, e);
    return json(res, 500, { error: panicMessage(e) });
  }
});

// ---------- live auctions ----------

/**
 * A traveller the database doesn't know (say, after a host wiped the disk) is still recognized
 * when the chain shows their key on their account and the contract has their profile.
 */
async function adoptFromChain(account: string, publicKey: string): Promise<any | null> {
  if (!account.endsWith(`.${cfg.contract}`) || !publicKey) return null;
  try {
    const keys: any = await provider.viewAccessKeyList({ accountId: account } as any);
    if (!keys.keys.some((k: any) => k.public_key === publicKey)) return null;
    const p: any = await view('get_profile', { account_id: account });
    if (!p || p.rival) return null;
    db.prepare('INSERT OR IGNORE INTO players (account_id, nickname, public_key, created_tx, created_at) VALUES (?, ?, ?, ?, ?)').run(account, p.nickname, publicKey, null, Date.now());
    return db.prepare('SELECT * FROM players WHERE account_id = ?').get(account);
  } catch {
    return null;
  }
}

const streaks = new Map<string, { losses: number; wins: number }>();
const liveByAccount = new Map<string, Auction | 'pending'>();
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

wss.on('connection', (ws: WebSocket) => {
  const nonce = randomBytes(16).toString('hex');
  let account: string | null = null;
  let nickname = '';
  let auction: Auction | null = null;
  const send = (m: object) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));
  send({ type: 'hello', nonce });

  ws.on('message', (raw) => void onMessage(raw).catch((e) => console.error('ws message', panicMessage(e))));
  const onMessage = async (raw: unknown) => {
    let m: any;
    try {
      m = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (m.type === 'auth') {
      let row = db.prepare('SELECT * FROM players WHERE account_id = ?').get(String(m.account ?? '')) as any;
      if (!row) row = await adoptFromChain(String(m.account ?? ''), String(m.publicKey ?? ''));
      if (!row) return send({ type: 'auth:fail', reason: 'unknown traveller' });
      try {
        const ok = PublicKey.from(row.public_key).verify(new TextEncoder().encode(`final-call login ${nonce}`), Buffer.from(String(m.signature), 'base64'));
        if (!ok) throw new Error('bad signature');
      } catch {
        return send({ type: 'auth:fail', reason: 'signature check failed' });
      }
      account = row.account_id;
      nickname = row.nickname;
      return send({ type: 'auth:ok', account, nickname });
    }
    if (!account) return send({ type: 'error', message: 'sign in first' });

    if (m.type === 'enter') {
      const busy = liveByAccount.get(account);
      if (busy && (busy === 'pending' || busy.phase !== 'done')) return send({ type: 'error', message: 'You are already at an auction.' });
      const unpaid = db.prepare("SELECT COUNT(*) AS n FROM bags WHERE winner = ? AND status IN ('closing','awaiting_payment')").get(account) as { n: number };
      if (unpaid.n > 0) return send({ type: 'error', message: 'Pay for the bag you won first (My Bags).' });
      liveByAccount.set(account, 'pending');
      const bag = claimBag(Number(m.lotId), account);
      if (!bag) {
        liveByAccount.delete(account);
        return send({ type: 'error', message: 'That bag is gone. Pick another.' });
      }
      try {
      const profile: any = await view('get_profile', { account_id: account });
      if ((profile?.strikes ?? 0) >= 3) {
        setBag(bag.id, { status: 'ready' });
        liveByAccount.delete(account);
        return send({ type: 'error', message: 'Too many unpaid bags. The auction house has banned you for now.' });
      }
      const pendingRow = db.prepare("SELECT COALESCE(SUM(price),0) AS s FROM bags WHERE winner = ? AND status IN ('closing','awaiting_payment')").get(account) as { s: number };
      const miles = Math.max(0, (profile?.miles ?? 0) - pendingRow.s);
      const tier = TERMINALS[bag.tier];
      if (tier.unlockNetWorth > 0) {
        const demand = new Map((await market()).map((x: any) => [x.item_id, x.demand_bp]));
        const worth = (profile?.miles ?? 0) + (profile?.inventory ?? []).reduce((s: number, [t, n]: [string, number]) => s + dealerValue(t, demand) * n, 0) - (profile?.debt ?? 0);
        if (worth < tier.unlockNetWorth) {
          setBag(bag.id, { status: 'ready' });
          liveByAccount.delete(account);
          return send({ type: 'error', message: `${tier.name} opens at ${tier.unlockNetWorth.toLocaleString('en-US')} net worth.` });
        }
      }
      if (miles < bag.opening) {
        setBag(bag.id, { status: 'ready' });
        liveByAccount.delete(account);
        return send({ type: 'error', message: 'Not enough miles for the opening bid. Sell something first.' });
      }
      const st = streaks.get(account) ?? { losses: 0, wins: 0 };
      const lineup = pickLineup({ lossStreak: bag.reserved_for ? 3 : st.losses, dominant: st.wins >= 3, minMiles: bag.opening });
      auction = new Auction(bag, { account, nickname, miles }, lineup, send, (r) => {
        const s = streaks.get(account!) ?? { losses: 0, wins: 0 };
        if (r.playerWon) streaks.set(account!, { losses: 0, wins: s.wins + 1 });
        else streaks.set(account!, { losses: s.losses + 1, wins: 0 });
        boardCache.at = 0;
        void fillPool();
      });
      liveByAccount.set(account, auction);
      auction.start();
      } catch (e) {
        console.error('enter failed', panicMessage(e));
        if (getBag(bag.id)?.status === 'auction') setBag(bag.id, { status: 'ready' });
        liveByAccount.delete(account);
        send({ type: 'error', message: 'The belt jammed. Try that bag again.' });
      }
      return;
    }
    if (m.type === 'bid' || m.type === 'jump') return auction?.playerBid(m.type);
    if (m.type === 'fold') return auction?.playerFold();
  };

  ws.on('close', () => {
    // A player who leaves mid-auction simply stops bidding; the hammer still falls.
    auction?.playerFold();
  });
});

// ---------- background ----------

async function reconcile() {
  const rows = db.prepare("SELECT id, closed_at FROM bags WHERE status = 'awaiting_payment'").all() as { id: number; closed_at: number }[];
  for (const r of rows) {
    try {
      const status = await markPaidIfPaid(r.id);
      if (status === 'AwaitingPayment' && Date.now() - r.closed_at > 24.5 * 3600 * 1000) {
        await house('expire_lot', { id: r.id });
        setBag(r.id, { status: 'expired' });
      }
    } catch (e) {
      console.error('reconcile', r.id, panicMessage(e));
    }
  }
}

const rivalPaying = new Set<number>();
/** After a restart: put interrupted auctions back on the board and finish half-settled lots. */
async function recover(startup = false) {
  if (startup) db.prepare("UPDATE bags SET status = 'ready' WHERE status = 'auction'").run();
  const sealing = db.prepare("SELECT id FROM bags WHERE status = 'sealing' AND created_at < ?").all(Date.now() - 90_000) as { id: number }[];
  for (const r of sealing) {
    const lot: any = await view('get_lot', { id: r.id }).catch(() => undefined);
    if (lot === undefined) continue;
    setBag(r.id, { status: lot ? 'ready' : 'error' });
  }
  const rows = db
    .prepare("SELECT * FROM bags WHERE (status IN ('closing','error') OR (status = 'awaiting_payment' AND winner LIKE ?)) AND closed_at IS NOT NULL AND closed_at < ?")
    .all(`%.${cfg.contract}`, Date.now() - 60_000) as unknown as BagRow[];
  for (const r of rows) {
    try {
      const lot: any = await view('get_lot', { id: r.id });
      if (lot?.status === 'Open') {
        const tx = await house('close_lot', { id: r.id, winner: r.winner, price: r.price ?? 0, items: JSON.parse(r.items), salt: r.salt });
        setBag(r.id, { closed_tx: tx.hash, status: r.winner ? 'awaiting_payment' : 'unsold' });
      } else if (lot?.status === 'AwaitingPayment') setBag(r.id, { status: 'awaiting_payment' });
      else if (lot?.status === 'Paid') setBag(r.id, { status: 'paid' });
      else if (lot?.status === 'Unsold') setBag(r.id, { status: 'unsold' });
      const sub = RIVALS.find((d) => `${d.sub}.${cfg.contract}` === r.winner)?.sub;
      const after: any = await view('get_lot', { id: r.id });
      if (sub && after?.status === 'AwaitingPayment' && !rivalPaying.has(r.id)) {
        rivalPaying.add(r.id);
        await rivalWon(rivals.get(sub)!, r.id, (hash) => setBag(r.id, { paid_tx: hash, status: 'paid' })).finally(() => rivalPaying.delete(r.id));
      }
    } catch (e) {
      console.error('recover', r.id, panicMessage(e));
    }
  }
}

process.on('unhandledRejection', (e) => console.error('unhandled rejection', panicMessage(e)));
process.on('uncaughtException', (e) => console.error('uncaught exception', panicMessage(e)));

server.listen(cfg.port, async () => {
  console.log(`Final Call on http://localhost:${cfg.port} (contract ${cfg.contract})`);
  await syncRivals().catch((e) => console.error('sync rivals', panicMessage(e)));
  await recover(true);
  await fillPool().catch((e) => console.error('fill pool', panicMessage(e)));
  setInterval(() => void fillPool().catch(() => {}), 20_000);
  setInterval(() => void economyTick().catch((e) => console.error('economy', panicMessage(e))), 60_000);
  setInterval(() => void reconcile().then(() => recover(false)).catch((e) => console.error('recover', panicMessage(e))), 30_000);
});

