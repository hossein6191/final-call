use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn contract_id() -> AccountId {
    acc("finalcall.testnet")
}

fn ctx(predecessor: &str, ts_ns: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(contract_id())
        .predecessor_account_id(acc(predecessor))
        .signer_account_id(acc(predecessor))
        .block_timestamp(ts_ns)
        .account_balance(NearToken::from_near(50));
    testing_env!(b.build());
}

fn catalog() -> Vec<ItemInput> {
    vec![
        ItemInput { id: "rubber-duck".into(), base: 10, category: "oddities".into(), level: 0 },
        ItemInput { id: "film-camera".into(), base: 110, category: "tech".into(), level: 2 },
        ItemInput { id: "vinyl".into(), base: 110, category: "music".into(), level: 2 },
    ]
}

const HOUSE: &str = "finalcall.testnet";
const ALICE: &str = "alice.finalcall.testnet";
const BOB: &str = "bob.finalcall.testnet";

fn setup() -> FinalCall {
    ctx(HOUSE, 1_000);
    let mut c = FinalCall::new(acc(HOUSE), catalog(), NearToken::from_millinear(30), NearToken::from_millinear(250));
    let pk: PublicKey = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".parse().unwrap();
    let _ = c.create_account("alice".into(), pk.clone(), "Alice".into(), false, None);
    let _ = c.create_account("bob".into(), pk, "Bob".into(), false, None);
    c
}

fn tag(id: u64, tier: u8, items: &[String], salt: &str) -> String {
    let pre = commitment_preimage(contract_id().as_str(), id, tier, items, salt);
    hex(&env::sha256_array(pre.as_bytes()))
}

fn bag() -> Vec<String> {
    vec!["film-camera@mint:v".into(), "rubber-duck@good:p".into(), "vinyl@worn:p".into()]
}

const SALT: &str = "0123456789abcdef0123456789abcdef";

fn seal(c: &mut FinalCall, id: u64) {
    ctx(HOUSE, 2_000);
    c.open_lots(vec![LotInput { id, tier: 0, commitment: tag(id, 0, &bag(), SALT), opening: 100 }]);
}

#[test]
fn players_start_with_miles() {
    let c = setup();
    let p = c.get_profile(acc(ALICE)).unwrap();
    assert_eq!(p.profile.miles, START_MILES);
    assert_eq!(c.stats().accounts, 2);
}

#[test]
#[should_panic(expected = "house only")]
fn only_house_creates_accounts() {
    let mut c = setup();
    ctx(ALICE, 2_000);
    let pk: PublicKey = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".parse().unwrap();
    let _ = c.create_account("eve".into(), pk, "Eve".into(), true, Some(1_000_000));
}

#[test]
fn full_lot_flow() {
    let mut c = setup();
    seal(&mut c, 1);
    ctx(HOUSE, 3_000);
    c.close_lot(1, Some(acc(ALICE)), 250, bag(), SALT.into());
    assert_eq!(c.get_lot(1).unwrap().status, LotStatus::AwaitingPayment);

    ctx(ALICE, 4_000);
    let minted = c.pay_lot(1);
    assert_eq!(minted.len(), 3);
    let p = c.get_profile(acc(ALICE)).unwrap();
    assert_eq!(p.profile.miles, 750);
    assert_eq!(p.profile.lots_won, 1);
    assert_eq!(c.mt_balance_of(acc(ALICE), "film-camera@mint".into()), U128(1));
    assert_eq!(c.mt_supply("vinyl@worn".into()), Some(U128(1)));
    assert_eq!(c.get_lot(1).unwrap().status, LotStatus::Paid);
    assert!(c.check_commitment(1, bag(), SALT.into()));
}

#[test]
#[should_panic(expected = "contents do not match the sealed tag")]
fn reveal_must_match_tag() {
    let mut c = setup();
    seal(&mut c, 1);
    ctx(HOUSE, 3_000);
    let mut swapped = bag();
    swapped[2] = "vinyl@mint:p".into();
    c.close_lot(1, Some(acc(ALICE)), 250, swapped, SALT.into());
}

#[test]
#[should_panic(expected = "only the winner can pay")]
fn only_winner_pays() {
    let mut c = setup();
    seal(&mut c, 1);
    ctx(HOUSE, 3_000);
    c.close_lot(1, Some(acc(ALICE)), 250, bag(), SALT.into());
    ctx(BOB, 4_000);
    c.pay_lot(1);
}

#[test]
#[should_panic(expected = "not enough miles")]
fn winner_must_afford() {
    let mut c = setup();
    seal(&mut c, 1);
    ctx(HOUSE, 3_000);
    // The reveal still lands so the tag can be checked; payment is what fails.
    c.close_lot(1, Some(acc(ALICE)), 5_000, bag(), SALT.into());
    assert_eq!(c.get_lot(1).unwrap().items, bag());
    ctx(ALICE, 4_000);
    c.pay_lot(1);
}

#[test]
fn unsold_lot_still_reveals() {
    let mut c = setup();
    seal(&mut c, 7);
    ctx(HOUSE, 3_000);
    c.close_lot(7, None, 0, bag(), SALT.into());
    let lot = c.get_lot(7).unwrap();
    assert_eq!(lot.status, LotStatus::Unsold);
    assert_eq!(lot.items, bag());
}

#[test]
fn dealer_price_falls_and_recovers() {
    let mut c = setup();
    seal(&mut c, 1);
    ctx(HOUSE, 3_000);
    c.close_lot(1, Some(acc(ALICE)), 100, bag(), SALT.into());
    ctx(ALICE, 4_000);
    c.pay_lot(1);

    // Mint camera: 110 * 1.5 = 165 at full demand.
    assert_eq!(c.dealer_quote("film-camera@mint".into(), 1), 165);
    let got = c.sell("film-camera@mint".into(), 1);
    assert_eq!(got, 165);
    assert_eq!(c.get_profile(acc(ALICE)).unwrap().profile.miles, 900 + 165);
    // Demand is now 0.96: 110 * 1.5 * 0.96 = 158.
    assert_eq!(c.dealer_quote("film-camera@mint".into(), 1), 158);
    // Recovers 6% per hour back toward 1.0: half an hour later it is 0.99.
    ctx(ALICE, 4_000 + HOUR_NS / 2);
    assert_eq!(c.dealer_quote("film-camera@mint".into(), 1), 163);
    ctx(ALICE, 4_000 + 2 * HOUR_NS);
    assert_eq!(c.dealer_quote("film-camera@mint".into(), 1), 165);
}

#[test]
#[should_panic(expected = "not enough items")]
fn cannot_sell_what_you_do_not_have() {
    let mut c = setup();
    ctx(ALICE, 4_000);
    c.sell("film-camera@mint".into(), 1);
}

#[test]
fn buy_orders_escrow_and_fill() {
    let mut c = setup();
    seal(&mut c, 1);
    ctx(HOUSE, 3_000);
    c.close_lot(1, Some(acc(ALICE)), 100, bag(), SALT.into());
    ctx(ALICE, 4_000);
    c.pay_lot(1);

    ctx(BOB, 5_000);
    let order = c.post_order("vinyl".into(), "worn".into(), 140, 2);
    assert_eq!(c.get_profile(acc(BOB)).unwrap().profile.miles, 1_000 - 280);
    assert_eq!(c.stats().escrow, 280);

    ctx(ALICE, 6_000);
    let paid = c.fill_order(order, "vinyl@worn".into(), 1);
    assert_eq!(paid, 140);
    assert_eq!(c.mt_balance_of(acc(BOB), "vinyl@worn".into()), U128(1));
    assert_eq!(c.mt_balance_of(acc(ALICE), "vinyl@worn".into()), U128(0));
    assert_eq!(c.stats().escrow, 140);

    ctx(BOB, 7_000);
    let refund = c.cancel_order(order);
    assert_eq!(refund, 140);
    assert_eq!(c.get_profile(acc(BOB)).unwrap().profile.miles, 1_000 - 140);
    assert_eq!(c.stats().escrow, 0);
}

#[test]
#[should_panic(expected = "condition too low")]
fn order_condition_is_enforced() {
    let mut c = setup();
    seal(&mut c, 1);
    ctx(HOUSE, 3_000);
    c.close_lot(1, Some(acc(ALICE)), 100, bag(), SALT.into());
    ctx(ALICE, 4_000);
    c.pay_lot(1);
    ctx(BOB, 5_000);
    let order = c.post_order("vinyl".into(), "good".into(), 140, 1);
    ctx(ALICE, 6_000);
    c.fill_order(order, "vinyl@worn".into(), 1);
}

#[test]
fn loans_only_when_broke_and_repay() {
    let mut c = setup();
    seal(&mut c, 1);
    ctx(HOUSE, 3_000);
    c.close_lot(1, Some(acc(ALICE)), 950, bag(), SALT.into());
    ctx(ALICE, 4_000);
    c.pay_lot(1);
    ctx(HOUSE, 5_000);
    c.grant_loan(acc(ALICE), 500);
    let p = c.get_profile(acc(ALICE)).unwrap().profile;
    assert_eq!((p.miles, p.debt), (550, 500));
    ctx(ALICE, 6_000);
    assert_eq!(c.repay(200), 200);
    assert_eq!(c.get_profile(acc(ALICE)).unwrap().profile.debt, 300);
}

#[test]
fn unpaid_lots_expire_with_a_strike() {
    let mut c = setup();
    seal(&mut c, 1);
    ctx(HOUSE, 3_000);
    c.close_lot(1, Some(acc(ALICE)), 100, bag(), SALT.into());
    ctx(HOUSE, 3_000 + 25 * HOUR_NS);
    c.expire_lot(1);
    assert_eq!(c.get_lot(1).unwrap().status, LotStatus::Expired);
    assert_eq!(c.get_profile(acc(ALICE)).unwrap().profile.strikes, 1);
}

#[test]
fn preimage_format_is_stable() {
    // Same string the JS side builds in shared/rules.ts.
    let pre = commitment_preimage("finalcall.testnet", 3, 1, &["vinyl@worn:p".to_string(), "rubber-duck@good:v".to_string()], "abcd");
    assert_eq!(pre, "final-call/v1|finalcall.testnet|lot=3|tier=1|items=vinyl@worn:p,rubber-duck@good:v|salt=abcd");
}

fn with_rival() -> FinalCall {
    let mut c = setup();
    let pk: PublicKey = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".parse().unwrap();
    ctx(HOUSE, 1_500);
    let _ = c.create_account("kip".into(), pk, "Kip".into(), true, Some(50));
    c
}
const KIP: &str = "kip.finalcall.testnet";

#[test]
fn backing_a_broke_rival_pays_back_from_sales() {
    let mut c = with_rival();
    ctx(ALICE, 2_000);
    assert_eq!(c.invest(acc(KIP), 200), 260);
    assert_eq!(c.get_profile(acc(ALICE)).unwrap().profile.miles, 800);
    assert_eq!(c.get_profile(acc(KIP)).unwrap().profile.miles, 250);
    assert_eq!(c.stakes(acc(KIP)).len(), 1);

    // Kip wins a bag and sells the camera: half of the proceeds go to Alice.
    seal(&mut c, 1);
    ctx(HOUSE, 3_000);
    c.close_lot(1, Some(acc(KIP)), 100, bag(), SALT.into());
    ctx(KIP, 4_000);
    c.pay_lot(1);
    let got = c.sell("film-camera@mint".into(), 1); // 110 * 1.5 = 165
    assert_eq!(got, 165);
    let alice = c.get_profile(acc(ALICE)).unwrap().profile.miles;
    assert_eq!(alice, 800 + 82);
    assert_eq!(c.get_profile(acc(KIP)).unwrap().profile.miles, 250 - 100 + 165 - 82);
    assert_eq!(c.stakes(acc(KIP))[0].paid, 82);
}

#[test]
fn stake_closes_when_repaid() {
    let mut c = with_rival();
    ctx(ALICE, 2_000);
    c.invest(acc(KIP), 100); // owed 130
    for id in 1..=3 {
        seal(&mut c, id);
        ctx(HOUSE, 3_000 + id);
        c.close_lot(id, Some(acc(KIP)), 100, bag(), SALT.into());
        ctx(KIP, 4_000 + id);
        c.pay_lot(id);
        c.sell("film-camera@mint".into(), 1);
    }
    assert!(c.stakes(acc(KIP)).is_empty());
    assert_eq!(c.get_profile(acc(ALICE)).unwrap().profile.miles, 900 + 130);
}

#[test]
#[should_panic(expected = "this rival is not broke")]
fn only_broke_rivals_take_backers() {
    let mut c = with_rival();
    ctx(ALICE, 2_000);
    c.invest(acc(KIP), 200);
    ctx(BOB, 2_100);
    c.invest(acc(KIP), 200);
}

#[test]
#[should_panic(expected = "only rivals take backers")]
fn players_cannot_be_backed() {
    let mut c = with_rival();
    ctx(ALICE, 2_000);
    c.invest(acc(BOB), 200);
}
