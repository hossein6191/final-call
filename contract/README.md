# Final Call contract

The on-chain half of Final Call, deployed at `finalcall.testnet`.

- **Miles**: the game currency, a balance per account.
- **Items**: NEP-245 multi-tokens, token id `<item>@<condition>` (`mt_balance_of`, `mt_supply`, `mt_*` events).
- **Lots**: the House seals `sha256(contents + salt)` with `open_lots` before bidding; `close_lot` only accepts a reveal that matches. The winner pays with their own key (`pay_lot`).
- **Customs Dealer**: `sell` pays the market price; each sale lowers that item's demand by 4% (floor 40%), and demand recovers 6% an hour.
- **Buy orders**: escrowed offers any holder can fill (`post_order`, `fill_order`, `cancel_order`).
- **Backing rivals**: a broke rival can be reopened by a player with `invest`; half of that rival's dealer sales repay backers 130% (`stakes` view).
- **Accounts**: `create_account` makes `<sub>.finalcall.testnet` with one function-call key limited to the player methods, plus a little NEAR for gas. Every bag won adds a small gas stipend.

## Build and test

```bash
cargo test                              # 18 unit tests
cargo near build non-reproducible-wasm  # target/near/final_call.wasm
```

## Deploy (code only, keeps state)

```bash
near contract deploy finalcall.testnet use-file target/near/final_call.wasm without-init-call network-config testnet sign-with-legacy-keychain send
```
