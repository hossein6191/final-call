# Final Call

Bid on unclaimed airport luggage against AI rivals who carry real wallets. Scan each bag on the X-ray belt, win it in a live auction, unzip it, and sell what you find into a market every player moves.

Built for **NEAR HACKATHON 2026**, track **Games With Real Economies** (also entered in **AI Swarms**).

- Play: https://final-call.up.railway.app (phone or computer)
- Demo video: `<X post URL>`
- Contract: [`finalcall.testnet`](https://testnet.nearblocks.io/address/finalcall.testnet) (NEAR testnet)

## The problem

Loot games ask players to trust that the box wasn't rigged after they paid, and "AI NPCs" in crypto games usually have no money of their own to lose. Players also bounce off wallets, seed phrases and gas prompts before they ever play.

## What Final Call does about it

- **Sealed bags.** Every bag's contents are hashed and committed on chain before it reaches the board. When the hammer falls the contract only accepts a reveal that matches the hash. Your browser re-checks it too.
- **Rivals with real wallets.** Six AI bidders each own a NEAR account with an on-chain balance. They pay for what they win with their own key, sell, post escrowed buy orders, borrow from the House when broke, and can lose everything. Before each bag, NEAR AI Cloud reads the X-ray, each rival's own appraisal and budget, and picks how hard that rival goes for it (pass, careful, fair, keen or chase) with a one-line private thought; code turns the stance into a bid cap that the rival's wallet still bounds.
- **Rivals play without you.** Every 20 minutes the rivals hold an auction among themselves with no human at the table: the bag is sealed on chain, NEAR AI decides each rival's stance, the winner pays from its own wallet, and the result lands in the Board feed (marked "rivals only"). The economy keeps moving between visits.
- **Rivals scheme.** NEAR AI can pair two rivals into a secret team-up against you: partners never outbid each other and the stronger one adds part of the other's wallet to its cap. Some rivals have one trick per bag: Dash cuts the lights for 2 seconds (the server refuses bids in the dark), Big Sal answers your lead with a huge jump, Professor Odo fogs your X-ray while he lectures. A host warns you who is at the table before each bag.
- **A secret cheater you can catch.** At some tables one rival peeks inside the sealed pouches and bids on the real contents instead of the X-ray. After the hammer you see every rival's guess next to the bag's real value, and you can **report** one. If you are right, the rest of the table backs you up and the cheater is banned from every lineup for 6 hours (announced in the feed, remembered by the other rivals' NEAR AI lines); if you are wrong, they laugh it off. One report per table.
- **Difficulty with consequences.** Easy: rivals stop about 20% earlier, no tricks, no team-ups, no cheaters. Normal: tricks now and then, team-ups possible, about 1 bag in 5 has a cheater. Hard: rivals go about 15% higher, tricks most bags, almost 1 bag in 2 has a cheater.
- **A shared market.** The Customs Dealer's prices live in the contract: each sale lowers that item's price for everyone, and it recovers over time.
- **Back a broke rival.** A rival who runs out of miles closes up shop. Any player can reopen them with a stake of 100–2,000 miles; the contract then pays the backer 130% back, automatically, from half of everything that rival sells to the dealer. If nobody steps in for three hours, the House bails them out.
- **No wallet, no gas.** You pick a nickname. Your browser makes a key, the contract creates your account holding only a key that can call the seven player methods, and every game transaction is signed in the background. Each bag you win comes with a little NEAR from the contract to pay for its own transactions, so you never see a gas prompt or run dry.

## Try it (do X → see Y)

1. Open https://final-call.up.railway.app on a phone or a computer (Chrome gets a full desktop layout), type a nickname, then tap **CHECK IN**.
   → In about 5 seconds your account (`<name>-xxxx.finalcall.testnet`) is created and the lobby opens: your boarding pass, today's missions, and the rivals on the floor. No wallet prompt appears.
2. Tap **PLAY** on **Your welcome bag**, read the round briefing, pick the rivals' difficulty (**Easy**, **Normal**, **Hard**), and press **START** (or Space).
   → The bag rolls onto the belt and the X-ray switches on. A coach walks you through the first bag step by step: drag across the bag, tap silhouettes to appraise them.
3. When the belt stops, tap the big **BID** button a few times.
   → The host walks on and names tonight's table, their tricks (⚡ on their card) and whether a cheater may be among them. Rivals answer with numbered paddles and speech lines; the ring around BID counts down; "GOING ONCE", "GOING TWICE" and a gavel follow when nobody bids. From the second bag on, each rival shows the stance NEAR AI chose for it (for example **KEEN** or **PASS**) a few seconds into the scan.
4. Win the bag.
   → **YOURS!** The case opens, items pop out with rarity glows, and you tap the sealed pouches open. The **Proof** panel turns green line by line: the tag was sealed before bidding (tx), `sha256(contents + salt)` matches the tag (computed in your browser), the contract re-checked it on reveal (tx), and you paid with your own key (tx). Above it, **What they were thinking · NEAR AI** shows each rival's private thought, its guess next to the bag's real value, any team-up, and the cap it led to. On Normal or Hard, **🚩 REPORT A CHEATER** lets you accuse one rival: a correct report bans them (see the Board feed); a wrong one gets a denial.
5. Tap **SELL ITEMS** and sell one.
   → Miles arrive with a transaction link, and that item's dealer price drops for everyone (open **My Bags** again to see the lower price and the demand arrow).
6. On the lobby, tap the share button under your boarding pass, then **POST ON X**.
   → Your pass is printed as an image (name, class, net worth, rank). On a phone it goes to the share sheet with the image attached; on a computer the image downloads and a ready-made post opens on X.
7. Open **FLIGHTS**, tap the locked **International** hall, then **BRIBE THE GUARD**.
   → The guard jokes that it is a cheat and lets you look: that hall's top finds and the bags on its belt right now, look only. Bidding there still needs 3,000 net worth.
8. Open **BOARD**.
   → Players and rivals ranked by net worth read live from the contract, plus a feed of wins, rival sales, buy orders, loans and bankruptcies with transaction links.
9. On the Board, tap **SIMULATE A WEEK**.
   → In under a second your browser runs 7 days of auctions (about 1,000 lots) between the six rivals and four bot players with the live rules, and draws everyone's net worth over the week: who went broke, the best flip, and how far dealer demand fell for popular items.
10. On the lobby, tap a rival. If one is broke it shows **BACK ME**: pick a stake and tap **BACK**.
   → One transaction signed by your key moves the miles to the rival on chain (`invest`); they are back in the auctions at once, and **My Bags → Your stakes** shows what the contract still owes you. `node scripts/e2e-invest.ts` runs the same flow on testnet with throwaway accounts, including a repayment and the gas stipend.
11. Open `#lot/<id>` for any lot (link in the Proof panel).
   → The full tag check: the on-chain commitment, the revealed preimage, your browser's hash, the rivals' limits (computed from the X-ray only), the stance NEAR AI chose for each, and the NEAR AI signature on that response.
12. From a terminal, with no secrets: `npm run verify` (or `npm run verify -- <lot id>`).
   → Reads the lot straight from the contract over public RPC, rebuilds the preimage, hashes it, and prints `match: YES` plus the contract's own `check_commitment` result.

No setup is needed for any of this; the hosted game runs on NEAR testnet.

## How NEAR is used

| What | Where |
|---|---|
| Commit-reveal of bag contents; contract rejects a mismatched reveal | `contract/src/lib.rs` `open_lots`, `close_lot`, `check_commitment` |
| Items as NEP-245 multi-tokens (`<item>@<condition>`), with `mt_balance_of`, `mt_supply`, NEP-245 events | `contract/src/lib.rs` |
| Miles balances, dealer market with demand that falls per sale and recovers per hour | `contract/src/lib.rs` `sell`, `dealer_quote`, `market` |
| Escrowed buy orders between any accounts (rivals use them as collectors) | `post_order`, `fill_order`, `cancel_order` |
| Wallet-free accounts: the contract creates `<sub>.finalcall.testnet` with one function-call key limited to the player methods | `create_account`, `PLAYER_METHODS` |
| Backing broke rivals: stakes are stored per rival, and repayments come out of the rival's dealer sales inside `sell` | `invest`, `stakes`, `pay_backers` |
| Rivals-only lots every 20 minutes: sealed, closed and paid on chain with no human involved | `rivalsOnlyLot` in `server/main.ts` |
| Gas stipend: closing a lot won by a player sends that player a little NEAR from the contract | `close_lot`, `GAS_STIPEND` |
| The server holds no full-access key: three House function-call keys limited to House methods; one scoped key per rival | `scripts/setup-testnet.ts`, `server/chain.ts` |
| Players sign their own transactions in the browser (payments, sales, order fills) | `web/src/wallet.ts`, `shared/near-send.ts` |
| Rival decisions and lines from NEAR AI Cloud (TEE model): one call per bag returns each rival's stance, thought and lines; the server checks the response signature and links NEAR AI's verifier | `server/ai.ts`, `applyMinds` in `server/auction.ts` |

## What makes an auction feel like an auction

- The bag rolls onto the belt with a story tag (route, weight, days unclaimed, sticker), then the X-ray switches on. Geiger-style clicks speed up over valuable items; holding the beam on one appraises it.
- Rivals raise numbered paddles, twitch just before they bid, hesitate visibly near their limit, and fold with a line. Their faces react: smug when they lead, angry when you outbid them, sweating when they hesitate, shocked by a jump bid. Each personality has its own lines for 15 moments of an auction, with your name and the price in them, and never repeats a line until it has used the rest. A rival you keep beating remembers you and bids harder.
- "Going once" and "going twice" bring a heartbeat that speeds from 90 to 140 BPM, faster ticks and a red vignette; a bid inside "going twice" is called out as a snipe, a long back-and-forth as a bidding war, and the last two bidders go head to head.
- The hammer: hitstop, camera punch, gavel slam, SOLD stamp. Then the case opens, items arrive cheapest first, and the last sealed pouch gets a drumroll and slow motion. Lose to a rival and you see whether you missed a jackpot or dodged a bullet.
- Collectors who lose a bag to you post an escrowed on-chain buy order for the piece they wanted.

## What is on chain and what is not

- On chain: balances, items, every lot's commitment and reveal, who won and what they paid, dealer prices and demand, buy orders and escrow, loans and debt.
- Not on chain: the live bid-by-bid auction runs on the game server (bids are free and fast); only the result settles. Each rival's appraisal is code in `server/rivals.ts`, fed only the public X-ray manifest. NEAR AI then picks the rival's stance on the bag (it moves the cap between 0.6× and 1.25× of that appraisal) and writes what they say; the bid-by-bid play and the wallet limits stay in code (`server/auction.ts`). If NEAR AI is slow or down, rivals bid on their appraisal alone and use scripted lines.
- Trust you still give the server: it chooses who won and at what price when it closes a lot. It cannot take your miles: `pay_lot` must be signed by the winner.

## Run it yourself

Requirements: Node 24+, Rust 1.95 (pinned by `contract/rust-toolchain.toml`), `cargo-near`, `near-cli-rs`.

```bash
npm install
npm test                                  # 9 JS tests (commitment format, bags, X-ray privacy, simulator, signature recovery)
(cd contract && cargo test)               # 14 contract unit tests
node scripts/simulate.ts                  # the week fast-forward, in the terminal
(cd contract && cargo near build non-reproducible-wasm)
node scripts/init-args.ts <your-account>.testnet > init.json
near contract deploy <your-account>.testnet use-file contract/target/near/final_call.wasm with-init-call new file-args init.json prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send
CONTRACT_ID=<your-account>.testnet node scripts/setup-testnet.ts   # House keys, six rivals, writes .env
npm run build && npm start                # http://localhost:8787
node scripts/bot-play.ts                  # plays one full round headlessly
```

Add `NEARAI_API_KEY` to `.env` for NEAR AI rival lines; without it rivals use scripted lines.

## Built during the hackathon

Final Call was built from scratch between 2026-11-08 and 2026-11-14 for NEAR HACKATHON by hossein6191, who chose the concept, directed the design and every change, and playtested each build on phone and desktop. Most of the code was written with an AI coding assistant (Claude Code) working from that direction, which the hackathon rules allow (Q-005).

Libraries: `near-sdk` 5.30, `near-api-js` 7.4, `@noble/curves`, `@noble/hashes`, `ws`, `vite`. No art or audio files: item art is vector paths in `web/src/icons.ts`, and every sound is synthesized in `web/src/audio.ts`.

Adapted UI pieces, rewritten without React:
- Boarding pass texture: the dithering shader from [Paper Shaders](https://github.com/paper-design/shaders), via a community "admit one ticket" component.
- Animated bot icon: [Lucide Animated](https://github.com/pqoqubbw/icons) by pqoqubbw (MIT).
- Hourglass, elastic volume slider, net worth card, pause menu, dock magnification: community React components from 21st.dev, re-implemented for this game.

## License

MIT
