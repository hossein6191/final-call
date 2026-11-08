// One live auction: a player and three rivals bid on a sealed bag.
// The server holds the clock. When the hammer falls the House reveals the bag on chain,
// and the winner pays with their own key.
import { AUCTION, increment, itemValue, parseItemToken, publicEstimate, type ManifestSlot } from '../shared/rules.ts';
import { ITEM_BY_ID } from '../shared/catalog.ts';
import { getBag, setBag, addFeed, rivalryOf, bumpRivalry, type BagRow } from './db.ts';
import { house, panicMessage, rival as rivalTx, txUrl } from './chain.ts';
import { voiceRivals, scriptedLines, type Lines, type Voiced } from './ai.ts';
import { planFor, rivalWon, freeMiles, type RivalState } from './rivals.ts';

// 1.2 s for the bag to roll into the X-ray tunnel, then 6 s of scanning.
export const ARRIVE_MS = 1200;
export const SCAN_MS = ARRIVE_MS + 6000;
const TICK_MS = 100;

export type Send = (msg: object) => void;

interface Seat {
  id: string; // account id
  name: string;
  rival?: RivalState;
  max: number;
  estimate: number;
  folded: boolean;
  bids: number;
  planAt: number | null;
  planJump: boolean;
  jumped: boolean;
  twitched: boolean;
  grudge: number; // bags this player has taken off this rival
}

export interface AuctionResult {
  lotId: number;
  winner: string | null;
  winnerName: string | null;
  price: number;
  playerWon: boolean;
}

function xrayText(manifest: ManifestSlot[]): string {
  const visible = manifest.filter((m) => !m.pouch).map((m) => ITEM_BY_ID[m.id!].name);
  const pouches = manifest.filter((m) => m.pouch);
  const glints = pouches.filter((p) => p.glint).length;
  return `${visible.join(', ') || 'nothing clear'}; plus ${pouches.length} sealed pouches (${pouches.map((p) => p.weight).join(', ')})${glints ? `, ${glints} glinting` : ''}.`;
}

export class Auction {
  readonly bag: BagRow;
  readonly manifest: ManifestSlot[];
  readonly seats: Seat[];
  readonly player: Seat;
  price = 0;
  leader: Seat | null = null;
  lastBidAt = 0;
  startedAt = 0;
  calls = 0;
  war = 0; // consecutive back-and-forth bids between the same two bidders
  private prev: Seat | null = null;
  phase: 'scan' | 'live' | 'done' = 'scan';
  voiced: Voiced;
  private timer: NodeJS.Timeout | null = null;
  private playerMiles: number;
  private send: Send;
  private onDone: (r: AuctionResult) => void;

  constructor(
    bag: BagRow,
    player: { account: string; nickname: string; miles: number },
    lineup: RivalState[],
    send: Send,
    onDone: (r: AuctionResult) => void,
  ) {
    this.send = send;
    this.onDone = onDone;
    this.bag = bag;
    this.manifest = JSON.parse(bag.manifest);
    this.playerMiles = player.miles;
    this.player = { id: player.account, name: player.nickname, max: 0, estimate: 0, folded: false, bids: 0, planAt: null, planJump: false, jumped: false, twitched: false, grudge: 0 };
    this.seats = [this.player];
    const tutorial = Boolean(bag.reserved_for);
    for (const r of tutorial ? lineup.slice(0, 2) : lineup) {
      const plan = planFor(r, this.manifest, bag.tier);
      // The first bag teaches the payoff: two rivals who give up around half its value.
      if (tutorial) plan.max = Math.min(plan.max, Math.floor((publicEstimate(this.manifest, bag.tier) * 0.45) / 10) * 10);
      // Grudges: a rival you keep beating pushes 10% harder against you.
      const mem = rivalryOf(player.account, r.account);
      if (!tutorial && mem.player_wins >= 2) plan.max = Math.floor((plan.max * 1.1) / 10) * 10;
      r.committed += plan.max;
      this.seats.push({ id: r.account, name: r.def.name, rival: r, max: plan.max, estimate: plan.estimate, folded: false, bids: 0, planAt: null, planJump: false, jumped: false, twitched: false, grudge: mem.player_wins });
    }
    this.voiced = { source: 'scripted', lines: scriptedLines(lineup.map((r) => r.def), player.nickname) };
  }

  get rivals() {
    return this.seats.filter((s) => s.rival);
  }

  start() {
    const lineup = this.rivals.map((s) => s.rival!.def);
    // Ask NEAR AI for the rivals' lines during the scan; scripted lines cover any delay.
    const memory = this.rivals
      .map((s) => {
        const m = rivalryOf(this.player.id, s.id);
        if (m.player_wins) return `${s.rival!.def.sub} has lost ${m.player_wins} bag(s) to ${this.player.name} and holds a grudge`;
        if (m.rival_wins) return `${s.rival!.def.sub} has beaten ${this.player.name} ${m.rival_wins} time(s) and is smug about it`;
        return '';
      })
      .filter(Boolean)
      .join('; ');
    voiceRivals(lineup, xrayText(this.manifest), this.player.name, memory).then((v) => {
      this.voiced = v;
      v.verification?.then((ver) => {
        setBag(this.bag.id, { ai: JSON.stringify({ source: v.source, completionId: v.completionId, verification: ver, error: v.error ?? null }) });
        if (ver) this.send({ type: 'ai:verified', lotId: this.bag.id, ok: ver.ok, verifyUrl: ver.verifyUrl, signingAddress: ver.signingAddress });
      });
      if (!v.verification) setBag(this.bag.id, { ai: JSON.stringify({ source: v.source, error: v.error ?? null }) });
      this.send({ type: 'ai:voices', source: v.source });
    });
    setBag(this.bag.id, {
      rivals: JSON.stringify(this.rivals.map((s) => ({ account: s.id, name: s.name, estimate: s.estimate, max: s.max }))),
    });
    this.send({
      type: 'auction:start',
      lotId: this.bag.id,
      tier: this.bag.tier,
      flight: JSON.parse(this.bag.flight),
      commitment: this.bag.commitment,
      sealedTx: this.bag.sealed_tx,
      manifest: this.manifest,
      opening: this.bag.opening,
      scanMs: SCAN_MS,
      arriveMs: ARRIVE_MS,
      appraisal: publicEstimate(this.manifest, this.bag.tier),
      rivals: this.rivals.map((s) => ({ account: s.id, name: s.name, sub: s.rival!.def.sub, color: s.rival!.def.color, title: s.rival!.def.title, miles: s.rival!.miles, grudge: s.grudge })),
      you: { miles: this.playerMiles },
    });
    setTimeout(() => this.goLive(), SCAN_MS);
  }

  private goLive() {
    if (this.phase !== 'scan') return;
    this.phase = 'live';
    this.price = this.bag.opening;
    this.startedAt = Date.now();
    this.lastBidAt = this.startedAt;
    this.send({ type: 'auction:live', price: this.price, next: this.nextPrice(), rules: AUCTION });
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private heat(): boolean {
    return Date.now() - this.startedAt > AUCTION.heatAfterMs;
  }

  nextPrice(): number {
    return this.leader ? this.price + increment(this.price, this.heat()) : this.price;
  }

  private jumpPrice(): number {
    const step = increment(this.price, this.heat());
    return this.leader ? this.price + 3 * step : this.price + 2 * step;
  }

  private linesFor(s: Seat): Lines | undefined {
    return s.rival ? this.voiced.lines[s.rival.def.sub] : undefined;
  }

  private accept(s: Seat, amount: number, jump: boolean) {
    const prevLeader = this.leader;
    const snipe = this.calls >= 2; // landed after "going twice"
    this.war = prevLeader && this.prev === s && prevLeader !== s ? this.war + 1 : prevLeader ? 1 : 0;
    this.prev = prevLeader;
    this.price = amount;
    this.leader = s;
    this.lastBidAt = Date.now();
    this.calls = 0;
    s.bids++;
    for (const x of this.seats) {
      x.planAt = null;
      x.twitched = false;
    }
    const l = this.linesFor(s);
    const line = l ? (s.bids === 1 ? l.open : Math.random() < 0.4 ? l.raise : undefined) : undefined;
    this.send({ type: 'auction:bid', by: s.id, name: s.name, price: amount, jump, line, next: this.nextPrice(), heat: this.heat(), snipe, war: this.war, outbid: prevLeader?.id ?? null });
    // A bluffer caught by a jump often folds.
    if (jump && prevLeader?.rival?.def.style === 'bluffer' && Math.random() < 0.6) this.fold(prevLeader);
  }

  playerBid(kind: 'bid' | 'jump') {
    if (this.phase !== 'live' || this.leader === this.player) return;
    const amount = kind === 'jump' ? this.jumpPrice() : this.nextPrice();
    if (amount > this.playerMiles) {
      this.send({ type: 'auction:refused', reason: 'Not enough miles for that bid.' });
      return;
    }
    this.accept(this.player, amount, kind === 'jump');
  }

  playerFold() {
    if (this.phase === 'done' || this.player.folded) return;
    this.player.folded = true;
    this.send({ type: 'auction:fold', by: this.player.id, name: this.player.name });
  }

  private fold(s: Seat) {
    if (s.folded) return;
    s.folded = true;
    this.send({ type: 'auction:fold', by: s.id, name: s.name, line: this.linesFor(s)?.fold });
  }

  /** When a rival would act next, in ms after now. Uses the public tells from the design doc. */
  private planDelay(s: Seat, idle: number): { at: number; jump: boolean } {
    const r = s.rival!;
    const pressure = Math.min(1, this.nextPrice() / Math.max(1, s.max));
    const tell = 1500 * pressure ** 3;
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    let d: number;
    let jump = false;
    switch (r.def.style) {
      case 'expert':
        d = Math.max(0, rand(AUCTION.twiceMs - 200, AUCTION.twiceMs + 900) - idle);
        break;
      case 'bluffer':
        jump = !s.jumped && this.nextPrice() < 0.55 * s.max;
        d = jump ? rand(300, 600) : rand(600, 1400) + tell;
        break;
      case 'rookie':
        d = rand(250, 600) + tell * 0.5;
        break;
      case 'whale':
        d = rand(500, 1200) + tell * 0.6;
        break;
      case 'collector':
        d = rand(800, 1700) + tell;
        break;
      default:
        d = rand(1000, 2200) + tell;
    }
    // Never plan past the hammer; a rival who hesitates too long just misses it.
    return { at: Date.now() + Math.min(d, AUCTION.soldMs - 250 - idle), jump };
  }

  private tick() {
    if (this.phase !== 'live') return;
    const now = Date.now();
    const idle = now - this.lastBidAt;
    const elapsed = now - this.startedAt;

    if (!this.leader && idle >= AUCTION.soldMs) return this.finish();
    if (this.leader && (idle >= AUCTION.soldMs || elapsed >= AUCTION.capMs)) return this.finish();
    if (this.leader && idle >= AUCTION.onceMs && this.calls < 1) {
      this.calls = 1;
      this.send({ type: 'auction:call', stage: 'once' });
    } else if (this.leader && idle >= AUCTION.twiceMs && this.calls < 2) {
      this.calls = 2;
      this.send({ type: 'auction:call', stage: 'twice' });
    }

    for (const s of this.rivals) {
      if (s.folded || s === this.leader) continue;
      const next = this.nextPrice();
      // Whale ego: Big Sal pushes 20% harder when a human holds the lead.
      const ego = s.rival!.def.style === 'whale' && this.leader === this.player ? 1.2 : 1;
      const ceiling = Math.min(s.max * ego, freeMiles(s.rival!) + s.max);
      if (next > ceiling) {
        // Folding takes a beat so it reads as a decision.
        if (s.planAt === null) s.planAt = now + 400 + Math.random() * 500;
        else if (now >= s.planAt) this.fold(s);
        continue;
      }
      if (s.planAt === null) {
        const p = this.planDelay(s, idle);
        s.planAt = p.at;
        s.planJump = p.jump;
        // A long pause is a real tell: this rival is close to their limit.
        if (p.at - now > 900 && s.rival!.def.style !== 'expert') this.send({ type: 'auction:think', by: s.id });
      } else if (!s.twitched && s.planAt - now < 450) {
        // the paddle twitches just before a bid
        s.twitched = true;
        this.send({ type: 'auction:twitch', by: s.id });
      } else if (now >= s.planAt) {
        let amount = next;
        if (s.planJump) {
          const j = this.jumpPrice();
          if (j <= ceiling) {
            amount = j;
            s.jumped = true;
          }
        }
        this.accept(s, amount, amount !== next);
        return; // one bid per tick keeps the table readable
      }
    }
  }

  private finish() {
    if (this.phase === 'done') return;
    this.phase = 'done';
    if (this.timer) clearInterval(this.timer);
    for (const s of this.rivals) s.rival!.committed = Math.max(0, s.rival!.committed - s.max);

    const winner = this.leader;
    const items: string[] = JSON.parse(this.bag.items);
    const reveal = items.map(parseItemToken);
    this.send({
      type: 'auction:sold',
      lotId: this.bag.id,
      winner: winner?.id ?? null,
      winnerName: winner?.name ?? null,
      price: winner ? this.price : 0,
      line: winner ? this.linesFor(winner)?.win : undefined,
      items: reveal,
      tokens: items,
      salt: this.bag.salt,
      commitment: this.bag.commitment,
      rivals: this.rivals.map((s) => ({ account: s.id, name: s.name, estimate: s.estimate, max: s.max, folded: s.folded })),
    });
    for (const s of this.rivals) {
      if (winner === this.player) bumpRivalry(this.player.id, s.id, true);
      else if (winner === s) bumpRivalry(this.player.id, s.id, false);
    }
    setBag(this.bag.id, { status: 'closing', winner: winner?.id ?? null, price: winner ? this.price : 0, closed_at: Date.now(), banter: JSON.stringify(this.voiced.lines) });
    this.onDone({ lotId: this.bag.id, winner: winner?.id ?? null, winnerName: winner?.name ?? null, price: winner ? this.price : 0, playerWon: winner === this.player });
    void this.settle(winner, items);
  }

  /** Collectors at the table who lost the bag bid for the piece they wanted, on chain. */
  private async collectorsWant(items: string[]) {
    for (const s of this.rivals) {
      const r = s.rival!;
      if (!r.def.loves?.length) continue;
      const wanted = items
        .map(parseItemToken)
        .filter((it) => r.def.loves!.includes(ITEM_BY_ID[it.id].category))
        .sort((a, b) => itemValue(b) - itemValue(a))[0];
      if (!wanted) continue;
      const price = Math.round(itemValue(wanted) * (1.4 + Math.random() * 0.2));
      if (price < 15 || price > freeMiles(r) * 0.5) continue;
      try {
        const tx = await rivalTx<number>(r.def.sub, 'post_order', { item_id: wanted.id, min_cond: wanted.cond, price_each: price, amount: 1 });
        addFeed('order', { rival: r.def.sub, item: wanted.id, price, tx: tx.hash });
        this.send({ type: 'rival:offer', by: s.id, name: s.name, item: wanted.id, itemName: ITEM_BY_ID[wanted.id].name, price, tx: tx.hash });
      } catch (e) {
        console.error('collector order', panicMessage(e));
      }
    }
  }

  private async settle(winner: Seat | null, items: string[]) {
    const id = this.bag.id;
    try {
      const tx = await house('close_lot', { id, winner: winner?.id ?? null, price: winner ? this.price : 0, items, salt: this.bag.salt });
      setBag(id, { closed_tx: tx.hash, status: winner ? 'awaiting_payment' : 'unsold' });
      this.send({ type: 'lot:revealed', lotId: id, tx: tx.hash, url: txUrl(tx.hash) });
      addFeed('lot', { id, tier: this.bag.tier, winner: winner?.id ?? null, name: winner?.name ?? null, price: winner ? this.price : 0, tx: tx.hash });
      if (winner === this.player) void this.collectorsWant(items);
      if (winner?.rival) {
        await rivalWon(winner.rival, id, (hash) => {
          setBag(id, { paid_tx: hash, status: 'paid' });
          this.send({ type: 'lot:paid', lotId: id, tx: hash, url: txUrl(hash), by: winner.id });
        });
      }
    } catch (e) {
      const msg = panicMessage(e);
      console.error(`lot ${id} settle failed:`, msg);
      const row = getBag(id);
      if (row && row.status === 'closing') setBag(id, { status: 'error' });
      this.send({ type: 'lot:error', lotId: id, message: msg });
    }
  }
}
