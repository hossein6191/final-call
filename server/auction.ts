// One live auction: a player and three rivals bid on a sealed bag.
// The server holds the clock. When the hammer falls the House reveals the bag on chain,
// and the winner pays with their own key.
import { AUCTION, increment, itemValue, parseItemToken, publicEstimate, type ManifestSlot } from '../shared/rules.ts';
import { ITEM_BY_ID } from '../shared/catalog.ts';
import { getBag, setBag, addFeed, rivalryOf, bumpRivalry, saveTable, type BagRow } from './db.ts';
import { house, panicMessage, rival as rivalTx, txUrl, view } from './chain.ts';
import { voiceRivals, scriptedLines, STANCES, type Voiced, type Mind, type Brief } from './ai.ts';
import { Voice, type Moment } from './banter.ts';
import { planFor, rivalWon, freeMiles, lastBan, type RivalState } from './rivals.ts';

// 1.2 s for the bag to roll into the X-ray tunnel, then 6 s of scanning.
export const ARRIVE_MS = 1200;
export const SCAN_MS = ARRIVE_MS + 6000;

/** Difficulty the player picked: scales every rival's cap on the bag. */
export const LEVELS = { easy: 0.82, normal: 1, hard: 1.15 } as const;
export type Level = keyof typeof LEVELS;

/** What else a level changes: the odds of a secret cheater, of rival powers firing, of team-ups. */
export const TWISTS: Record<Level, { cheat: number; power: number; teamUps: boolean }> = {
  easy: { cheat: 0, power: 0, teamUps: false },
  normal: { cheat: 0.2, power: 0.35, teamUps: true },
  hard: { cheat: 0.45, power: 0.7, teamUps: true },
};

/** Each of these rivals has one trick it can pull once per bag. */
export const POWERS: Record<string, { kind: 'blackout' | 'rain' | 'fog'; name: string; text: string }> = {
  dash: { kind: 'blackout', name: 'Lights out', text: 'can black out your screen for 2 seconds' },
  bigsal: { kind: 'rain', name: 'Make it rain', text: 'can throw a sudden huge jump bid' },
  odo: { kind: 'fog', name: 'Lecture', text: 'can fog your X-ray while he talks' },
};
const BLACKOUT_MS = 2000;
const FOG_MS = 1800;
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
  voice?: Voice;
  /** Cap from the rival's own appraisal, before NEAR AI picks a stance. */
  baseMax?: number;
  /** Secretly peeked inside the sealed pouches. */
  cheat?: boolean;
  /** Teamed up with this rival against the player. */
  ally?: Seat;
  /** Most the rival may commit to this bag, from its wallet. */
  budget?: number;
  mind?: Mind;
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
  private tutorial = false;
  private level: Level = 'normal';
  private seenItem = '';
  private saidHeat = false;
  private saidDuel = false;
  private playerHasBid = false;
  /** A table with no human: rivals bid only against each other. */
  readonly ghost: boolean;
  private powers = new Set<string>();
  private blackoutUntil = 0;
  private teamUps = false;
  private send: Send;
  private onDone: (r: AuctionResult) => void;

  constructor(
    bag: BagRow,
    player: { account: string; nickname: string; miles: number; level?: Level; ghost?: boolean },
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
    this.ghost = Boolean(player.ghost);
    if (this.ghost) this.player.folded = true;
    const tutorial = Boolean(bag.reserved_for);
    this.tutorial = tutorial;
    this.level = player.level && Object.hasOwn(LEVELS, player.level) ? player.level : 'normal';
    const twists = this.ghost || tutorial ? TWISTS.easy : TWISTS[this.level];
    for (const r of tutorial ? lineup.slice(0, 2) : lineup) {
      const budget = Math.floor(freeMiles(r) * Math.min(0.85, r.def.walletShare * 1.5));
      const plan = planFor(r, this.manifest, bag.tier);
      // The first bag teaches the payoff: two rivals who give up around half its value.
      if (tutorial) plan.max = Math.min(plan.max, Math.floor((publicEstimate(this.manifest, bag.tier) * 0.3) / 10) * 10);
      // Grudges: a rival you keep beating pushes 10% harder against you.
      const mem = this.ghost ? { player_wins: 0, rival_wins: 0 } : rivalryOf(player.account, r.account);
      if (!tutorial && mem.player_wins >= 2) plan.max = Math.floor((plan.max * 1.1) / 10) * 10;
      if (!tutorial && !this.ghost) plan.max = Math.min(budget, Math.floor((plan.max * LEVELS[this.level]) / 10) * 10);
      r.committed += plan.max;
      this.seats.push({ id: r.account, name: r.def.name, rival: r, max: plan.max, estimate: plan.estimate, folded: false, bids: 0, planAt: null, planJump: false, jumped: false, twitched: false, grudge: mem.player_wins, baseMax: plan.max, budget });
    }
    // One rival may secretly peek inside the bag: it bids on the real contents, not the X-ray.
    const rivalSeats = this.seats.filter((x) => x.rival);
    if (rivalSeats.length >= 2 && Math.random() < twists.cheat) {
      const c = rivalSeats[Math.floor(Math.random() * rivalSeats.length)];
      const real = (JSON.parse(bag.items) as string[]).map(parseItemToken).reduce((t, it) => t + itemValue(it), 0);
      c.cheat = true;
      const before = c.max;
      c.estimate = Math.round(real * (0.96 + Math.random() * 0.08));
      const step = real >= 1000 ? 50 : 10;
      c.max = c.baseMax = Math.max(0, Math.floor(Math.min(c.budget ?? c.max, real * (0.82 + Math.random() * 0.13)) / step) * step);
      c.rival!.committed += c.max - before;
    }
    for (const x of rivalSeats) {
      const pw = POWERS[x.rival!.def.sub];
      if (pw && Math.random() < twists.power) this.powers.add(pw.kind);
    }
    this.teamUps = twists.teamUps;
    if (!this.ghost && !tutorial) saveTable(bag.id, player.account, rivalSeats.find((x) => x.cheat)?.id ?? null);
    this.voiced = { source: 'scripted', lines: scriptedLines(lineup.map((r) => r.def), player.nickname) };
    for (const s of this.rivals) s.voice = new Voice(s.rival!.def, this.voiced.lines[s.rival!.def.sub]);
    const seen = this.manifest.filter((m) => !m.pouch && m.id).map((m) => ITEM_BY_ID[m.id!].name);
    this.seenItem = seen[Math.floor(Math.random() * seen.length)] ?? '';
  }

  /** What a rival says at this moment (or nothing: they do not talk on every bid). */
  private talk(s: Seat, m: Moment, opts: { force?: boolean; chance?: number } = {}) {
    return s.voice?.say(m, { player: this.player.name, price: this.price, item: this.seenItem }, opts);
  }

  get rivals() {
    return this.seats.filter((s) => s.rival);
  }

  start() {
    const lineup = this.rivals.map((s) => s.rival!.def);
    // Ask NEAR AI for the rivals' lines during the scan; scripted lines cover any delay.
    const memory = this.ghost ? '' : this.rivals
      .map((s) => {
        const m = rivalryOf(this.player.id, s.id);
        if (m.player_wins) return `${s.rival!.def.sub} has lost ${m.player_wins} bag(s) to ${this.player.name} and holds a grudge`;
        if (m.rival_wins) return `${s.rival!.def.sub} has beaten ${this.player.name} ${m.rival_wins} time(s) and is smug about it`;
        return '';
      })
      .filter(Boolean)
      .join('; ');
    const briefs: Record<string, Brief> = Object.fromEntries(
      this.rivals.map((s) => [s.rival!.def.sub, { estimate: s.estimate, budget: s.budget ?? s.max, loves: s.rival!.def.loves, peeked: s.cheat ? s.estimate : undefined }]),
    );
    const ban = lastBan && Date.now() - lastBan.at < 12 * 3600 * 1000 ? lastBan : null;
    const gossip = ban ? `${ban.name} was caught peeking inside sealed bags and banned from the floor` : '';
    voiceRivals(lineup, xrayText(this.manifest), this.player.name, memory, briefs, { headless: this.ghost, teamUps: this.teamUps, gossip }).then((v) => {
      this.voiced = v;
      for (const s of this.rivals) s.voice?.setAi(v.lines[s.rival!.def.sub]);
      this.applyMinds(v.minds);
      v.verification?.then((ver) => {
        setBag(this.bag.id, { ai: JSON.stringify({ source: v.source, completionId: v.completionId, verification: ver, error: v.error ?? null }) });
        if (ver) this.send({ type: 'ai:verified', lotId: this.bag.id, ok: ver.ok, verifyUrl: ver.verifyUrl, signingAddress: ver.signingAddress });
      });
      if (!v.verification) setBag(this.bag.id, { ai: JSON.stringify({ source: v.source, error: v.error ?? null }) });
      this.send({ type: 'ai:voices', source: v.source });
    });
    setBag(this.bag.id, {
      rivals: JSON.stringify(this.rivalsRecord()),
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
      scanMs: this.scanMs(),
      arriveMs: ARRIVE_MS,
      appraisal: publicEstimate(this.manifest, this.bag.tier),
      rivals: this.rivals.map((s) => ({ account: s.id, name: s.name, sub: s.rival!.def.sub, color: s.rival!.def.color, title: s.rival!.def.title, miles: s.rival!.miles, grudge: s.grudge })),
      you: { miles: this.playerMiles },
      tutorial: Boolean(this.bag.reserved_for),
      level: this.tutorial ? 'normal' : this.level,
      // The host's warning: who is at the table, what tricks they may pull, and whether a cheat is possible.
      table: this.tutorial ? null : {
        rivals: this.rivals.map((s) => ({ sub: s.rival!.def.sub, name: s.name, power: POWERS[s.rival!.def.sub] ? { name: POWERS[s.rival!.def.sub].name, text: POWERS[s.rival!.def.sub].text } : null })),
        cheatRisk: TWISTS[this.level].cheat,
        teamUps: this.teamUps,
      },
    });
    if (this.powers.has('fog')) {
      const odo = this.rivals.find((x) => POWERS[x.rival!.def.sub]?.kind === 'fog');
      if (odo) setTimeout(() => this.phase === 'scan' && this.send({ type: 'power', kind: 'fog', by: odo.id, name: odo.name, ms: FOG_MS, line: 'Allow me to explain this bag. At length.' }), ARRIVE_MS + 1600);
    }
    setTimeout(() => this.goLive(), this.scanMs());
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

  private accept(s: Seat, amount: number, jump: boolean) {
    if (s === this.player) this.playerHasBid = true;
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
    let line: string | undefined;
    if (s.rival) {
      const heat = this.heat();
      if (s.bids === 1) line = this.talk(s, 'open', { force: true });
      else if (snipe) line = this.talk(s, 'snipe', { force: true });
      else if (jump) line = this.talk(s, 'jump', { chance: 0.9 });
      else if (heat && !this.saidHeat && (line = this.talk(s, 'heat', { chance: 0.8 }))) this.saidHeat = true;
      else if (this.war >= 3) line = this.talk(s, 'war', { chance: 0.5 });
      else if (prevLeader === this.player) line = this.talk(s, 'counter', { chance: 0.55 });
      else if (amount > s.estimate * 0.85) line = this.talk(s, 'high', { chance: 0.5 });
      else line = this.talk(s, 'raise', { chance: 0.3 });
    }
    this.send({ type: 'auction:bid', by: s.id, name: s.name, price: amount, jump, line, next: this.nextPrice(), heat: this.heat(), snipe, war: this.war, outbid: prevLeader?.id ?? null });
    // Lights out: Dash cuts the lights right after his bid, once, if the player is in the game.
    if (s.rival && this.powers.has('blackout') && POWERS[s.rival.def.sub]?.kind === 'blackout' && this.playerHasBid && !this.player.folded) {
      this.powers.delete('blackout');
      this.blackoutUntil = Date.now() + BLACKOUT_MS;
      this.send({ type: 'power', kind: 'blackout', by: s.id, name: s.name, ms: BLACKOUT_MS, line: 'Oops. Who turned off the lights?' });
    }
    // A bluffer caught by a jump often folds.
    if (jump && prevLeader?.rival?.def.style === 'bluffer' && Math.random() < 0.6) this.fold(prevLeader);
  }

  /** When the player wins, one rival at the table has a word about it. */
  private loserReaction() {
    const r = this.rivals[Math.floor(Math.random() * this.rivals.length)];
    if (!r) return undefined;
    const line = this.talk(r, 'lose', { force: true });
    return line ? { by: r.id, name: r.name, line } : undefined;
  }

  /** A first bag gets twice the scan time: the coach is teaching dragging and tapping. */
  /** NEAR AI's stance moves each rival's cap; the wallet budget still bounds it. */
  private applyMinds(minds?: Record<string, Mind>) {
    if (!minds || this.phase === 'done' || this.tutorial) return;
    const out: { account: string; sub: string; stance: string }[] = [];
    for (const s of this.rivals) {
      const m = minds[s.rival!.def.sub];
      if (!m || s.folded) continue;
      s.mind = m;
      // A cheater already bids on what is really inside; the stance only colours its lines.
      if (!s.cheat) {
        const step = s.baseMax! >= 1000 ? 50 : 10;
        const next = Math.max(0, Math.floor(Math.min(s.baseMax! * STANCES[m.stance], s.budget ?? s.baseMax!) / step) * step);
        s.rival!.committed += next - s.max;
        s.max = next;
      }
      out.push({ account: s.id, sub: s.rival!.def.sub, stance: m.stance });
    }
    // One secret team-up against the player: the pair never outbid each other, and the
    // stronger partner adds part of the other's wallet to its cap.
    if (this.teamUps && !this.ghost) {
      for (const s of this.rivals) {
        const sub = s.mind?.ally;
        const b = sub ? this.rivals.find((x) => x.rival!.def.sub === sub) : undefined;
        if (!b || b === s || s.ally || b.ally || s.folded || b.folded) continue;
        s.ally = b;
        b.ally = s;
        const [hi, lo] = s.max >= b.max ? [s, b] : [b, s];
        const add = Math.floor((lo.max * 0.15) / 10) * 10;
        const next = Math.min(hi.budget ?? hi.max, hi.max + add);
        hi.rival!.committed += next - hi.max;
        hi.max = next;
        break;
      }
    }
    if (!out.length) return;
    setBag(this.bag.id, { rivals: JSON.stringify(this.rivalsRecord()) });
    this.send({ type: 'ai:minds', minds: out });
  }

  private rivalsRecord() {
    return this.rivals.map((s) => ({ account: s.id, name: s.name, estimate: s.estimate, max: s.max, folded: s.folded, stance: s.mind?.stance ?? null, thought: s.mind?.thought ?? null, ally: s.ally?.name ?? null }));
  }

  private scanMs() {
    return this.tutorial ? ARRIVE_MS + 12000 : SCAN_MS;
  }

  playerBid(kind: 'bid' | 'jump') {
    if (this.phase !== 'live' || this.leader === this.player || this.ghost) return;
    if (Date.now() < this.blackoutUntil) {
      this.send({ type: 'auction:refused', reason: 'Lights out! You cannot bid in the dark.' });
      return;
    }
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
    const line = this.talk(s, this.leader === this.player ? 'foldToPlayer' : 'fold', { force: true });
    this.send({ type: 'auction:fold', by: s.id, name: s.name, line });
    // Down to two: the rival still in has something to say about it.
    const left = this.seats.filter((x) => !x.folded);
    if (!this.saidDuel && left.length === 2 && left.includes(this.player)) {
      const r = left.find((x) => x !== this.player)!;
      const duel = this.talk(r, 'duel', { force: true });
      this.saidDuel = true;
      if (duel) setTimeout(() => this.phase === 'live' && this.send({ type: 'auction:say', by: r.id, line: duel }), 1300);
    }
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

    // On a player's first bag the rivals give them a moment to place the first bid.
    if (this.tutorial && !this.playerHasBid && elapsed < 4000) return;

    for (const s of this.rivals) {
      if (s.folded || s === this.leader) continue;
      if (s.ally && this.leader === s.ally) continue; // never outbid a partner
      const next = this.nextPrice();
      // Whale ego: Big Sal pushes 10% harder when a human holds the lead.
      const ego = s.rival!.def.style === 'whale' && this.leader === this.player ? 1.1 : 1;
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
        // Make it rain: Big Sal answers the player with one huge jump.
        if (this.powers.has('rain') && POWERS[s.rival!.def.sub]?.kind === 'rain' && this.leader === this.player && next < 0.6 * ceiling) {
          const step = increment(this.price, this.heat());
          const big = Math.floor(Math.min(ceiling, this.price + 5 * step) / step) * step;
          if (big > next) {
            this.powers.delete('rain');
            this.send({ type: 'power', kind: 'rain', by: s.id, name: s.name, ms: 1600, line: 'Money talks. Mine shouts.' });
            s.jumped = true;
            this.accept(s, big, true);
            return;
          }
        }
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
    const winner = this.leader;
    // Release what each rival promised to this table; a winning rival keeps the price reserved
    // until its payment lands.
    for (const s of this.rivals) {
      s.rival!.committed = Math.max(0, s.rival!.committed - s.max);
      if (s === winner) s.rival!.committed += this.price;
    }
    const items: string[] = JSON.parse(this.bag.items);
    const reveal = items.map(parseItemToken);
    this.send({
      type: 'auction:sold',
      lotId: this.bag.id,
      winner: winner?.id ?? null,
      winnerName: winner?.name ?? null,
      price: winner ? this.price : 0,
      line: winner?.rival ? this.talk(winner, this.price < winner.estimate * 0.6 ? 'winCheap' : this.price > winner.estimate ? 'winBig' : 'win', { force: true }) : undefined,
      reaction: winner === this.player ? this.loserReaction() : undefined,
      items: reveal,
      tokens: items,
      salt: this.bag.salt,
      commitment: this.bag.commitment,
      rivals: this.rivalsRecord(),
      reportable: !this.ghost && !this.tutorial && this.level !== 'easy',
    });
    for (const s of this.ghost ? [] : this.rivals) {
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
      addFeed('lot', { id, tier: this.bag.tier, winner: winner?.id ?? null, name: winner?.name ?? null, price: winner ? this.price : 0, tx: tx.hash, solo: this.ghost || undefined });
      if (winner === this.player) void this.collectorsWant(items);
      if (winner?.rival) {
        const price = this.price;
        await rivalWon(winner.rival, id, (hash) => {
          setBag(id, { paid_tx: hash, status: 'paid' });
          this.send({ type: 'lot:paid', lotId: id, tx: hash, url: txUrl(hash), by: winner.id });
        }, () => this.send({ type: 'lot:payretry', lotId: id, by: winner.id })).finally(() => (winner.rival!.committed = Math.max(0, winner.rival!.committed - price)));
      }
    } catch (e) {
      const msg = panicMessage(e);
      console.error(`lot ${id} settle failed:`, msg);
      // The call may have landed even though we saw an error: trust the chain.
      const lot: any = await view('get_lot', { id }).catch(() => null);
      const map: Record<string, string> = { Open: 'closing', AwaitingPayment: 'awaiting_payment', Paid: 'paid', Unsold: 'unsold', Expired: 'expired' };
      setBag(id, { status: lot ? map[lot.status] ?? 'error' : 'closing' });
      if (lot?.status === 'AwaitingPayment' && lot.winner === this.player.id) this.send({ type: 'lot:revealed', lotId: id, tx: '', url: '' });
      else this.send({ type: 'lot:error', lotId: id, message: msg });
    }
  }
}
