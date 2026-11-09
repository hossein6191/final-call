// Table talk: what a rival says, when. Each personality has its own pools for each moment of
// an auction, lines are filled in with the player's name, the price and what is on the X-ray,
// and nobody repeats a line until they have used up the rest. NEAR AI lines (when a key is
// set) are spoken first; these pools carry the rest of the night.
import type { RivalDef } from '../shared/rivals.ts';
import type { Lines } from './ai.ts';

export type Moment =
  | 'open' | 'raise' | 'counter' | 'jump' | 'high' | 'war' | 'snipe' | 'heat' | 'duel'
  | 'fold' | 'foldToPlayer' | 'win' | 'winCheap' | 'winBig' | 'lose';

type Pools = Record<Moment, string[]>;

const P: Record<RivalDef['style'], Pools> = {
  expert: {
    open: ['I know that silhouette.', 'Hm. Decent stitching on this one.', 'Let us be civilised about this.', 'I have seen this tag before. Interesting.', 'Pearls show up dark on the scan, darling.', 'A {item}? I will take a closer look.'],
    raise: ['Patience is a price too.', 'Again.', '{price}. Steady.', 'I do not chase. I arrive.', 'Fair. For now.', 'That is still under value.', 'Mm. Continue.'],
    counter: ['Bold, {player}. Not wise.', 'You bid like you guess, {player}.', 'Sweet of you. No.', 'I appraise. You hope.', '{player}, you will learn.'],
    jump: ['Let me save us some time.', 'Skip the small talk.', 'Three steps. Keep up.'],
    high: ['We are close to what it is worth.', 'Careful now.', 'This is where amateurs overpay.'],
    war: ['Lovely. A proper fight.', 'I can do this all evening.', 'You are persistent. I respect that.'],
    snipe: ['Never leave the door open, darling.', 'Going twice is not gone.', 'Timing is everything.'],
    heat: ['The room is warm. Prices rise.', 'Double steps. Choose wisely.'],
    duel: ['Just us now, {player}.', 'Head to head. How charming.'],
    fold: ['Not at that number, darling.', 'Overpriced. Enjoy it.', 'I know when to stand up.', 'Past its value. I am out.', 'Take it. It is yours to regret.'],
    foldToPlayer: ['Well played, {player}. Too rich for me.', 'Yours, {player}. Mind the pouches.', 'Fine, {player}. I hope you checked the weight.'],
    win: ['Experience pays.', 'As expected.', 'Thank you for warming it up.', 'Into the case it goes.', 'Next time, read the X-ray.'],
    winCheap: ['A bargain. You should have pushed, {player}.', 'Practically a gift.', 'Mm. Underpriced. Lovely.'],
    winBig: ['Worth every mile. Probably.', 'Expensive taste, I admit it.', 'Ouch. Still mine.'],
    lose: ['Good eye, {player}.', 'Enjoy it, {player}.', 'Clever. This time.', 'I will remember that, {player}.'],
  },
  whale: {
    open: ['Cute bag. Mine now.', "Let's make this quick.", 'I buy bags like this for breakfast.', 'Sal is here. Relax, everyone.', 'Whatever it is, I want it.', 'Write my name on it.'],
    raise: ['I spend more on lunch.', 'You still here?', 'Pocket change.', '{price}? Adorable.', 'Keep going, I love it.', 'Money is not my problem.', 'More. Always more.'],
    counter: ["Cute bid, {player}. Here's a real one.", '{player}, go home.', 'You want this more than me, {player}? Doubt it.', 'Sal does not lose to {player}.', 'Ha. {player} thinks they can keep up.'],
    jump: ['Big Sal, big bid.', 'Let me end this.', 'Watch this.', 'Make it rain.'],
    high: ['Expensive? For you.', 'I could buy the airport.', 'Bored now. Raising anyway.'],
    war: ['This is fun. For me.', 'I can do this all day.', 'Running low on miles, {player}?'],
    snipe: ['Surprise.', 'Not so fast.', 'Did you think Sal was asleep?'],
    heat: ['Heat? I am the heat.', 'Double steps, double fun.'],
    duel: ['You and me, {player}. Bad idea.', 'One on one. My favourite.'],
    fold: ['Fine, have your little suitcase.', 'Ehh, not worth my time.', 'Boring. I am out.', 'I have better bags at home.', 'Keep it. I lost interest.'],
    foldToPlayer: ['Enjoy the dirty socks, {player}.', 'Take it, {player}. I let you have it.', 'You win, {player}. This round.'],
    win: ['Write it down: Sal wins again.', 'Money talks.', 'Easy.', 'Another one for the pile.', 'Was there any doubt?'],
    winCheap: ['Practically free!', 'You folded for this, {player}? Thanks.', 'Steal. And I am rich.'],
    winBig: ['Overpaid? I do not care.', 'Expensive. Like me.', 'Big bag, big Sal.'],
    lose: ['Enjoy it while it lasts, {player}.', 'I let you have that one, {player}.', 'Next bag is mine.', 'Lucky, {player}. Lucky.'],
  },
  bluffer: {
    open: ['Jumping in. Try and keep up.', 'Big number, big guy.', 'I already know what is inside.', 'Feeling lucky tonight.', 'You will want to fold now.', 'I can smell the gold.'],
    raise: ["I've got a feeling about this one.", 'Scared yet?', 'Read me. I dare you.', 'All in. Almost.', 'You are sweating, {player}.', 'Raise. Just because.', '{price}. Easy money.'],
    counter: ['Nice try, {player}.', '{player} blinks first. Again.', 'I see your bid, {player}, and I laugh.', 'Bold, {player}. Too bold?', 'You have no idea what is in there, {player}.'],
    jump: ['Boom.', 'Go big or go home.', 'Bluff? Or not?', 'Call that.'],
    high: ['Still cheap. Trust me.', 'I know something you do not.', 'Is it worth it? Maybe.'],
    war: ['Who blinks first?', 'This is my favourite part.', 'You will crack, {player}.'],
    snipe: ['Ha! Gotcha.', 'Never trust the quiet guy.', 'Last-second Dash, baby.'],
    heat: ['Now it gets fun.', 'Hot table. Hot hands.'],
    duel: ['Poker face, {player}.', 'Just you and me. Nervous?'],
    fold: ['...was bluffing anyway.', 'Nah. Read you wrong.', 'Folding. For now.', 'You can have that one.', 'Too rich even for my bluff.'],
    foldToPlayer: ['Okay, {player}, you called it.', 'Fine, {player}. Did you really know?', 'You got me, {player}. This time.'],
    win: ['Told you I had a feeling.', 'Nobody calls my bluff.', 'Read and weep.', 'Dash wins. Obviously.', 'Was I bluffing? Guess.'],
    winCheap: ['You let me steal it, {player}.', 'And I was bluffing!', 'Cheap. Thank you, table.'],
    winBig: ['Worth it. I think.', 'Bluffed myself into that one.', 'Expensive feeling. Still a feeling.'],
    lose: ['Lucky read, {player}.', 'I let you think you won, {player}.', 'Fine. Next bag.', 'Enjoy, {player}. It is probably socks.'],
  },
  rookie: {
    open: ['Ooh ooh, me!', 'I watched a video about this!', 'Is this the bag? It is the bag!', 'First bid! Did I do it right?', 'I have a good feeling!', 'Look, a {item}!'],
    raise: ['Is this how it works?!', 'More! I think?', 'Wait, is that a lot?', 'Bidding! I am bidding!', 'Hehe. {price}.', 'Okay okay okay.', 'My hands are shaking.'],
    counter: ['Hey, {player}! I wanted that!', '{player}, that was mine!', 'Not fair, {player}!', 'Okay {player}, here we go!', 'You are good at this, {player}. Ugh.'],
    jump: ['Big bid! Did I mean that?', 'Oops. Big number.', 'YOLO!'],
    high: ['Is this too much? It feels like too much.', 'My mom is going to ask questions.', 'Uh oh.'],
    war: ['This is so intense!', 'I cannot stop now!', 'Why is my heart beating so fast?'],
    snipe: ['Did I just snipe?!', 'Last second! Like the pros!', 'Wait, did that count?'],
    heat: ['Double steps?! Okay!', 'Everything is going so fast!'],
    duel: ['Just us, {player}! Eek!', 'Head to head! Like a movie!'],
    fold: ['Wait, is that a lot of miles?', 'My mom says I have to stop.', 'Okay, too much for me.', 'I need my miles for snacks.', 'Next time!'],
    foldToPlayer: ['Good game, {player}!', 'You win, {player}. Show me what is inside!', 'Aww. Congrats, {player}!'],
    win: ['I WON? I won!!', 'Best day ever!', 'Mom! Mom! I won a bag!', 'Wait, I have to pay now?', 'My first big win!'],
    winCheap: ['That was cheap, right? RIGHT?', 'Is it always this easy?', 'Woohoo, bargain!'],
    winBig: ['That was a LOT of miles.', 'I hope there is treasure in it.', 'Did I overpay? Do not tell me.'],
    lose: ['Aww, {player} got it.', 'Next one is mine, {player}!', 'So close!', 'Good one, {player}!'],
  },
  collector: {
    open: ['There might be history in there.', 'Is that a record sleeve?', 'Fascinating silhouette.', 'Every bag tells a story.', 'Oh, a {item}. How evocative.', 'For the archive, perhaps.'],
    raise: ['For the archive.', 'I simply must.', 'History is not cheap.', 'Hmm. Indeed.', '{price}, for posterity.', 'One must preserve these things.', 'Curious. Continue.'],
    counter: ['Do you even know what that is, {player}?', '{player}, this belongs in a collection.', 'Young {player}, please.', 'Mm. {player} bids for profit. I bid for history.', 'That piece deserves better, {player}.'],
    jump: ['Some things cannot wait.', 'Allow me to be decisive.', 'For the museum!'],
    high: ['The price of scholarship.', 'Expensive, but irreplaceable.', 'My budget weeps.'],
    war: ['How very dramatic.', 'A bidding war over history. Fitting.', 'I shall not yield easily.'],
    snipe: ['A scholar is always watching.', 'Ahem. Mine, I believe.', 'Patience, then action.'],
    heat: ['The tempo quickens.', 'Ah, the fever of the auction.'],
    duel: ['Just the two of us, {player}. Like a seminar.', 'A duel. How Victorian.'],
    fold: ['Some stories are too expensive.', 'Alas.', 'I shall read about it instead.', 'The archive will survive without it.', 'Too dear. A pity.'],
    foldToPlayer: ['Treat it kindly, {player}.', 'If you find a record, {player}, call me.', 'Yours, {player}. I will make you an offer later.'],
    win: ['Into the collection it goes.', 'Wonderful. Wonderful.', 'History, preserved.', 'Catalogue number forty-one.', 'A fine addition.'],
    winCheap: ['A treasure at a pittance.', 'Nobody else saw it. Ha!', 'Underappreciated, as always.'],
    winBig: ['Expensive, but the archive demanded it.', 'Worth it for the provenance alone.', 'My accountant will faint.'],
    lose: ['If there is music in there, {player}, I will buy it from you.', 'Congratulations, {player}. I will be watching for it.', 'Ah well. Another time.'],
  },
  bargain: {
    open: ['I will pay exactly what it is worth.', 'Lowball time.', 'Let us start sensibly.', 'Nobody needs to overpay.', 'I only buy deals.', 'Fifty percent off, or nothing.'],
    raise: ['Still a bargain.', 'Fine. One more.', 'Cheap. Still cheap.', 'Hmm. Barely.', '{price}, and not a mile more. Maybe.', 'This is my limit. Almost.', 'Grumble. Raise.'],
    counter: ['{player}, you are inflating prices.', 'Stop overpaying, {player}.', 'Do you know what that is worth, {player}?', '{player}, this is not a charity.', 'Ugh, {player}.'],
    jump: ['Fine. Quickly, before I change my mind.', 'A rare splurge.', 'Do not get used to this.'],
    high: ['This is getting silly.', 'Retail prices now. Hm.', 'I can feel my wallet crying.'],
    war: ['You are ruining a good deal.', 'Every bid is less of a bargain.', 'We are both losing here.'],
    snipe: ['Patience is profit.', 'Cheapest second wins.', 'Just in time.'],
    heat: ['Double steps? That is extortion.', 'Too hot for a bargain.'],
    duel: ['You and me, {player}. Someone has to stay sensible.', 'Head to head. Do not get greedy.'],
    fold: ['Only fools pay retail.', 'Have fun overpaying.', 'Not a deal anymore.', 'I will wait for the next one.', 'Out. My miles thank me.'],
    foldToPlayer: ['Hope it was worth it, {player}.', 'You overpaid, {player}. Probably.', 'Enjoy, {player}. I will wait for the discount.'],
    win: ['Steal of the day.', 'Cheap and cheerful.', 'Thrift wins.', 'Bargain secured.', 'Now that is a deal.'],
    winCheap: ['Practically free!', 'A steal. Literally.', 'Thank you all for your restraint.'],
    winBig: ['This hurt.', 'I broke my own rules.', 'Never again. Until next time.'],
    lose: ['Hope it was worth it, {player}.', 'You overpaid, {player}.', 'Fine. Cheaper bags exist.', 'Good luck selling that, {player}.'],
  },
};

/** Recently spoken lines per rival, across auctions, so the same words do not come back soon. */
const recent = new Map<string, string[]>();
const MEMORY = 40;

function fill(t: string, v: { player: string; price: number; item: string }) {
  return t
    .replaceAll('{player}', v.player || 'friend')
    .replaceAll('{price}', v.price.toLocaleString('en-US'))
    .replaceAll('{item}', v.item || 'case');
}

/** One rival's voice for one auction. */
export class Voice {
  private def: RivalDef;
  private ai: Lines | undefined;
  private usedAi = new Set<string>();
  private lastAt = 0;
  constructor(def: RivalDef, ai: Lines | undefined) {
    this.def = def;
    this.ai = ai;
  }
  setAi(ai: Lines | undefined) {
    this.ai = ai;
  }

  /** A line for this moment, or undefined if the rival stays quiet. */
  say(m: Moment, v: { player: string; price: number; item: string }, opts: { force?: boolean; chance?: number } = {}): string | undefined {
    const now = Date.now();
    if (!opts.force && (now - this.lastAt < 2400 || Math.random() > (opts.chance ?? 0.45))) return undefined;
    this.lastAt = now;
    // NEAR AI wrote one line for each of these moments: say each of them once.
    const aiKey = m === 'open' ? 'open' : m === 'fold' || m === 'foldToPlayer' ? 'fold' : m.startsWith('win') ? 'win' : m === 'raise' || m === 'counter' ? 'raise' : null;
    if (this.ai && aiKey && !this.usedAi.has(aiKey) && this.ai[aiKey as keyof Lines]) {
      this.usedAi.add(aiKey);
      return this.ai[aiKey as keyof Lines];
    }
    const pool = P[this.def.style][m];
    let mem = recent.get(this.def.sub) ?? [];
    let fresh = pool.filter((l) => !mem.includes(l));
    if (!fresh.length) {
      // Pool used up: start a new round of it, but never the last two lines again right away.
      const lastTwo = mem.slice(-2);
      mem = mem.filter((l) => !pool.includes(l) || lastTwo.includes(l));
      fresh = pool.filter((l) => !lastTwo.includes(l));
    }
    const pick = fresh[Math.floor(Math.random() * fresh.length)];
    mem.push(pick);
    if (mem.length > MEMORY) mem.shift();
    recent.set(this.def.sub, mem);
    return fill(pick, v);
  }
}
