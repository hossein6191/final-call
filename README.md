# Final Call

Bid on unclaimed airport luggage against AI rivals who carry real wallets. Scan each bag on the X-ray belt, win it in a live auction, unzip it, and sell what you find into a market every player moves.

Built for **NEAR HACKATHON 2026**, track **Games With Real Economies** (also entered in **AI Swarms**).

- Play: https://final-call-production-5913.up.railway.app (best on a phone)
- Demo video: `<X post URL>`
- Contract: [`finalcall.testnet`](https://testnet.nearblocks.io/address/finalcall.testnet) (NEAR testnet)

## The problem

Loot games ask players to trust that the box wasn't rigged after they paid, and "AI NPCs" in crypto games usually have no money of their own to lose. Players also bounce off wallets, seed phrases and gas prompts before they ever play.

## What Final Call does about it

- **Sealed bags.** Every bag's contents are hashed and committed on chain before it reaches the board. When the hammer falls the contract only accepts a reveal that matches the hash. Your browser re-checks it too.
- **Rivals with real wallets.** Six AI bidders each own a NEAR account with an on-chain balance. They pay for what they win with their own key, sell, post escrowed buy orders, borrow from the House when broke, and can lose everything.
- **A shared market.** The Customs Dealer's prices live in the contract: each sale lowers that item's price for everyone, and it recovers over time.
- **No wallet.** You pick a nickname. Your browser makes a key, the contract creates your account holding only a key that can call the six player methods, and every game transaction is signed in the background.

## Try it (do X → see Y)

1. Open https://final-call-production-5913.up.railway.app on a phone (or a narrow browser window) and type a nickname, then tap **CHECK IN**.
   → In about 5 seconds you see your new account (`<name>-xxxx.finalcall.testnet`) with a transaction link, and the Arrivals board opens. No wallet prompt appears.
2. Tap **BID** on the row marked **★ Your welcome bag**.
   → The bag rolls onto the belt, the X-ray switches on, and a scanner beam sweeps it. Drag across the bag and tap silhouettes to appraise them.
3. When the belt stops, tap the big **BID** button a few times.
   → Rivals answer with numbered paddles and speech lines; the ring around BID counts down; "GOING ONCE", "GOING TWICE" and a gavel follow when nobody bids.
4. Win the bag.
   → **YOURS!** The case opens, items pop out with rarity glows, and you tap the sealed pouches open. The **Proof** panel turns green line by line: the tag was sealed before bidding (tx), `sha256(contents + salt)` matches the tag (computed in your browser), the contract re-checked it on reveal (tx), and you paid with your own key (tx).
5. Tap **SELL ITEMS** and sell one.
   → Miles arrive with a transaction link, and that item's dealer price drops for everyone (open **My Bags** again to see the lower price and the demand arrow).
6. Open **BOARD**.
   → Players and rivals ranked by net worth read live from the contract, plus a feed of wins, rival sales, buy orders, loans and bankruptcies with transaction links.
7. On the Board, tap **SIMULATE A WEEK**.
   → In under a second your browser runs 7 days of auctions (about 1,000 lots) between the six rivals and four bot players with the live rules, and draws everyone's net worth over the week: who went broke, the best flip, and how far dealer demand fell for popular items.
8. Open `#lot/<id>` for any lot (link in the Proof panel).
   → The full tag check: the on-chain commitment, the revealed preimage, your browser's hash, the rivals' limits (computed from the X-ray only), and the NEAR AI signature on the rivals' lines.
9. From a terminal, with no secrets: `npm run verify` (or `npm run verify -- <lot id>`).
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
| The server holds no full-access key: three House function-call keys limited to House methods; one scoped key per rival | `scripts/setup-testnet.ts`, `server/chain.ts` |
| Players sign their own transactions in the browser (payments, sales, order fills) | `web/src/wallet.ts`, `shared/near-send.ts` |
| Rival lines from NEAR AI Cloud (TEE model); the server checks the response signature and links NEAR AI's verifier | `server/ai.ts` |

## What makes an auction feel like an auction

- The bag rolls onto the belt with a story tag (route, weight, days unclaimed, sticker), then the X-ray switches on. Geiger-style clicks speed up over valuable items; holding the beam on one appraises it.
- Rivals raise numbered paddles, twitch just before they bid, hesitate visibly near their limit, and fold with a line. A rival you keep beating remembers you and bids harder.
- "Going once" and "going twice" bring a heartbeat that speeds from 90 to 140 BPM, faster ticks and a red vignette; a bid inside "going twice" is called out as a snipe, a long back-and-forth as a bidding war, and the last two bidders go head to head.
- The hammer: hitstop, camera punch, gavel slam, SOLD stamp. Then the case opens, items arrive cheapest first, and the last sealed pouch gets a drumroll and slow motion. Lose to a rival and you see whether you missed a jackpot or dodged a bullet.
- Collectors who lose a bag to you post an escrowed on-chain buy order for the piece they wanted.

## What is on chain and what is not

- On chain: balances, items, every lot's commitment and reveal, who won and what they paid, dealer prices and demand, buy orders and escrow, loans and debt.
- Not on chain: the live bid-by-bid auction runs on the game server (bids are free and fast); only the result settles. The rivals' bidding is deterministic code in `server/rivals.ts` and `server/auction.ts`, fed only the public X-ray manifest. NEAR AI writes what they say, never what they bid.
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

All code in this repository was written between 2026-11-08 and 2026-11-14 for NEAR HACKATHON, with Claude Code. Libraries: `near-sdk` 5.30, `near-api-js` 7.4, `@noble/curves`, `@noble/hashes`, `ws`, `vite`. No art or audio files: item art is vector paths in `web/src/icons.ts`, and every sound is synthesized in `web/src/audio.ts`.

## License

MIT
