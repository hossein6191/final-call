# Final Call — design

A phone-first auction game. Unclaimed airport luggage goes under the hammer. You scan each bag on an X-ray belt, bid against AI rivals who carry real wallets, unzip what you won, and sell it into a market whose prices every player moves.

Every bag's contents are sealed on NEAR (a hash on the luggage tag) before bidding opens, so nobody, including us, can change what is inside after you bid.

## The loop

| Every | The player |
|---|---|
| ~30 s | Scans a bag on the X-ray belt, then bids in a live auction against 3 rivals |
| ~90 s | Unzips the won bag: items pop out one by one, sealed pouches crack open last |
| ~5 min | Sells to the Customs Dealer (instant, market price) or fills a rival collector's buy order |
| Session | Unlocks pricier terminals, climbs the board, watches rivals get rich or go broke |

A full cycle (scan → bid → unzip → sell) takes 60–90 seconds.

## Screens

1. **Arrivals board** — flights landing with unclaimed bags. Pick one. Shows terminal, item count, opening bid, and the sealed tag hash.
2. **X-ray scan (6 s)** — drag the scanner beam across the bag. Items show as X-ray silhouettes colored by material (orange organic, green plastic, blue metal, black dense). Sealed pouches stay dark; a rare item inside a pouch glints 30% of the time.
3. **Auction** — rivals strip in the middle (face, wallet bar, speech bubble), a giant BID button at the bottom with the countdown as a ring. JUMP (+3 steps) left, FOLD right.
4. **Unzip** — visible items tick in with a running total; pouches last, tap to crack each one; a profit bar fills red → green; break-even and jackpot get their own beats.
5. **Sell** — swipe cards: right = Customs Dealer, up = a rival's buy order, left = keep.
6. **Board** — players and rivals ranked by net worth, rival wallets over time, recent lots with tx links.
7. **Tag check** — for any lot: the committed hash, the block it was sealed in, the revealed contents and salt, and a local sha256 check.

## Auction rules

- Opening bid: 40% of the bag's expected value (EV) for its terminal.
- Increments: under 200 → 10, under 1,000 → 25, under 5,000 → 100, above → 250. JUMP bids three steps.
- Idle clock resets on every bid: "Going once" at 2.0 s, "going twice" at 3.5 s, SOLD at 5.0 s. A bid that arrives before SOLD always counts.
- Heat: after 25 s increments double. Hard cap 40 s.
- Nobody can bid above their on-chain balance.
- The live bidding runs on the game server; only the result settles on chain.

## Rivals

Six rivals, each with its own NEAR account and on-chain balance, three per auction.

| Rival | Style | Numbers |
|---|---|---|
| Marguerite | The expert, vintage dealer | ±8% estimate noise, bids at "twice", folds right at value |
| Big Sal | The whale | big wallet, +20% ego when bidding against a human |
| Dash | The bluffer | opens with jump bids, folds when you jump back |
| Kip | The rookie | ±35% noise, bids instantly, often goes broke |
| Professor Odo | The collector (music, collectibles) | +50% on his categories, posts buy orders |
| Nell | The bargain hunter | low greed, only bids while the price is cheap |

- Max bid = estimate × greed (0.80–1.15), capped at 35–60% of the rival's wallet.
- Rivals estimate from the same X-ray view the player gets. The code passes them the public manifest only; they never see the sealed contents.
- Tells: reply delay grows as the price nears their max (0.3 s + 1.5 s × (price/max)³); a short line when they fold; no re-entry after folding.
- Rivals' lines come from NEAR AI Cloud (TEE model) with a verified-response badge. Their bidding math is deterministic code, never the language model.
- Broke rival (< 100 miles): grounded for 30 minutes, then the House lends 500 miles, recorded as debt on chain.
- Fairness: contents are never adjusted. Only the lineup adapts: after 3 losses in a row the next bag draws a broke or rookie rival; a dominant player sees Big Sal more often.

## Bags

- 6–10 items (average 8). About half are visible on X-ray; 3–4 sit in sealed pouches.
- Item value = base value × condition. Condition (worn ×0.6, good ×1.0, mint ×1.5) is only known after unzipping, so even visible items carry some risk.
- Rarity per item:

| Tier | Chance | Value ladder step |
|---|---|---|
| Common | 68% | +0 |
| Uncommon | 22% | +1 |
| Rare | 7% | +2 |
| Epic | 2.5% | +3 |
| Legendary | 0.5% | +4 |

- Value ladder (miles): L0 10 · L1 33 · L2 110 · L3 350 · L4 1,100 · L5 3,500 · L6 11,000.
- Terminals start the ladder at different steps:

| Terminal | Common starts at | Bag EV | Unlock (net worth) |
|---|---|---|---|
| Domestic Carousel | L0 | ~280 | start |
| International Hall | L1 | ~910 | 3,000 |
| First Class Lounge | L2 | ~2,900 | 12,000 |

- Target outcomes for a careful player: win 35–45% of auctions entered, ~60% of won bags profitable, a novice roughly breaks even.
- The first bag is a tutorial bag with a guaranteed rare. It is sealed and checkable like any other.

## Market and economy (on chain)

- Currency: **Miles**. A new player gets 1,000 miles once.
- Customs Dealer pays `base × condition × demand`. Demand per item type starts at 1.00, drops ×0.92 per unit sold, recovers toward 1.00 by 2% per hour, floor 0.40. Every player's sales move it, so flooding the market with cameras makes cameras cheap for everyone.
- Rival buy orders: collectors post escrowed orders (coins locked on chain) for their categories at up to 150% of market. A player fills one with one tap.
- Coins in (faucets): starting grant, dealer sales, House loans.
- Coins out (sinks): auction payments go to the House and are burned.
- Net worth = miles + items at current dealer price − debt.

## Trust model (what the chain guarantees)

- The House commits `sha256(contents)` for each lot before the auction opens.
- After SOLD the House reveals contents + salt; the contract recomputes the hash and refuses a mismatch.
- The winner pays with their own key (`pay_lot`). The House cannot take coins from anyone.
- Dealer prices and demand live in the contract and are readable by anyone.
- Not on chain: the live bid-by-bid auction (server), rival decision code (open source), rival key custody (server-held function-call keys limited to the game contract).

## Accounts (the player never sees the chain)

- Pick a nickname. The browser generates a key pair. The server creates `<nick>.<parent>.testnet` with that public key as a function-call key limited to the game contract, and funds a little testnet NEAR for gas.
- From then on the browser signs its own game calls in the background. No wallet, no popups, no seed phrase.

## Judge kit

- `?judge=1` starts a fresh account on the tutorial bag.
- Tag check page for every lot.
- Economy fast-forward: simulates a week of rival trading with the same rules in about a minute.
- `npm run verify` re-checks a lot's commitment from public RPC data with no secrets.
