//! Final Call: an auction house for unclaimed airport luggage.
//!
//! What lives here:
//! - Miles, the in-game currency, as balances per account.
//! - Items as multi-tokens (NEP-245 views and events). Token id = "<item>@<condition>".
//! - Lots: the House commits sha256(contents) before bidding opens and must reveal a
//!   matching preimage when it closes the lot. The winner pays with their own key.
//! - The Customs Dealer: a market whose prices fall as items are sold and recover over time.
//! - Buy orders: escrowed offers for an item type, filled by any holder.
//! - Player accounts: created as sub-accounts of this contract holding only a key that can
//!   call the player methods below.

use std::collections::BTreeMap;

use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::{Value, json};
use near_sdk::store::{IterableMap, LookupMap, Vector};
use near_sdk::{
    AccountId, Allowance, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseError,
    PublicKey, env, near, require,
};

pub const START_MILES: u64 = 1_000;
/// Methods a player's key may call. Everything that spends a player's miles or items is here,
/// so only the player can trigger it.
pub const PLAYER_METHODS: &str = "pay_lot,sell,post_order,cancel_order,fill_order,repay";
const PAY_WINDOW_NS: u64 = 24 * HOUR_NS;
const HOUR_NS: u64 = 3_600_000_000_000;
const DEMAND_START_BP: u64 = 10_000;
const DEMAND_FLOOR_BP: u64 = 4_000;
const DEMAND_AFTER_SALE_PCT: u64 = 92;
const DEMAND_RECOVER_BP_PER_HOUR: u64 = 200;
const BROKE_LINE: u64 = 100;
const MAX_LOAN: u64 = 5_000;

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    Items,
    Profiles,
    Inventory,
    Supply,
    Demand,
    Lots,
    LotIds,
    Orders,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct ItemDef {
    pub base: u64,
    pub category: String,
    pub level: u8,
}

#[near(serializers = [json])]
pub struct ItemInput {
    pub id: String,
    pub base: u64,
    pub category: String,
    pub level: u8,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Profile {
    pub nickname: String,
    pub rival: bool,
    pub miles: u64,
    pub debt: u64,
    pub joined_ns: U64,
    pub lots_won: u32,
    pub spent: u64,
    pub earned: u64,
    pub strikes: u32,
}

#[near(serializers = [json])]
pub struct ProfileView {
    pub account_id: AccountId,
    #[serde(flatten)]
    pub profile: Profile,
    pub inventory: Vec<(String, u32)>,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct Demand {
    pub bp: u64,
    pub updated_ns: u64,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq, Debug)]
pub enum LotStatus {
    Open,
    AwaitingPayment,
    Paid,
    Unsold,
    Expired,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Lot {
    pub id: u64,
    pub tier: u8,
    /// Hex sha256 of the commitment preimage, printed on the luggage tag.
    pub commitment: String,
    pub opening: u64,
    pub opened_ns: U64,
    pub opened_block: U64,
    pub status: LotStatus,
    pub winner: Option<AccountId>,
    pub price: u64,
    pub closed_ns: U64,
    /// Committed item tokens ("<item>@<cond>:<v|p>"), filled in when the lot is revealed.
    pub items: Vec<String>,
    pub salt: String,
}

#[near(serializers = [json])]
pub struct LotInput {
    pub id: u64,
    pub tier: u8,
    pub commitment: String,
    pub opening: u64,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Order {
    pub id: u64,
    pub buyer: AccountId,
    pub item_id: String,
    pub min_cond: String,
    pub price_each: u64,
    pub remaining: u32,
    pub created_ns: U64,
}

#[near(serializers = [json])]
pub struct MarketRow {
    pub item_id: String,
    pub base: u64,
    pub category: String,
    pub level: u8,
    pub demand_bp: u64,
}

#[near(serializers = [json])]
pub struct Stats {
    pub house: AccountId,
    pub accounts: u32,
    pub lots: u32,
    pub open_orders: u32,
    pub minted: u64,
    pub burned: u64,
    pub escrow: u64,
    pub account_funding: NearToken,
    pub key_allowance: NearToken,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct FinalCall {
    house: AccountId,
    account_funding: NearToken,
    key_allowance: NearToken,
    items: IterableMap<String, ItemDef>,
    profiles: IterableMap<AccountId, Profile>,
    inventory: LookupMap<AccountId, BTreeMap<String, u32>>,
    supply: LookupMap<String, u64>,
    demand: LookupMap<String, Demand>,
    lots: LookupMap<u64, Lot>,
    lot_ids: Vector<u64>,
    orders: IterableMap<u64, Order>,
    next_order: u64,
    minted: u64,
    burned: u64,
    escrow: u64,
}

// ---------- helpers ----------

fn now() -> u64 {
    env::block_timestamp()
}

fn hex(bytes: &[u8]) -> String {
    const D: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(D[(b >> 4) as usize] as char);
        s.push(D[(b & 15) as usize] as char);
    }
    s
}

fn cond_bp(cond: &str) -> u64 {
    match cond {
        "worn" => 6_000,
        "good" => 10_000,
        "mint" => 15_000,
        _ => env::panic_str("bad condition"),
    }
}

fn cond_rank(cond: &str) -> u8 {
    match cond {
        "worn" => 0,
        "good" => 1,
        "mint" => 2,
        _ => env::panic_str("bad condition"),
    }
}

fn valid_item_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 32
        && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// "<item>@<cond>" -> (item, cond)
fn split_token(token: &str) -> (&str, &str) {
    let (item, cond) = token
        .split_once('@')
        .unwrap_or_else(|| env::panic_str("bad token id"));
    cond_bp(cond);
    require!(valid_item_id(item), "bad token id");
    (item, cond)
}

/// "<item>@<cond>:<v|p>" -> "<item>@<cond>"
fn committed_to_token(committed: &str) -> &str {
    let (token, slot) = committed
        .rsplit_once(':')
        .unwrap_or_else(|| env::panic_str("bad committed item"));
    require!(slot == "v" || slot == "p", "bad committed item");
    split_token(token);
    token
}

/// Price of one unit at the dealer.
pub fn unit_price(base: u64, cond_bp: u64, demand_bp: u64) -> u64 {
    ((base as u128 * cond_bp as u128 * demand_bp as u128) / 100_000_000) as u64
}

/// The exact string the House hashes. Mirrored in shared/rules.ts `commitmentPreimage`.
pub fn commitment_preimage(contract: &str, id: u64, tier: u8, items: &[String], salt: &str) -> String {
    format!(
        "final-call/v1|{}|lot={}|tier={}|items={}|salt={}",
        contract,
        id,
        tier,
        items.join(","),
        salt
    )
}

fn emit(event: &str, data: Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({"standard": "finalcall", "version": "1.0.0", "event": event, "data": [data]})
    ));
}

fn emit_mt(event: &str, data: Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({"standard": "nep245", "version": "1.0.0", "event": event, "data": [data]})
    ));
}

#[near]
impl FinalCall {
    #[init]
    pub fn new(house: AccountId, items: Vec<ItemInput>, account_funding: NearToken, key_allowance: NearToken) -> Self {
        let mut this = Self {
            house,
            account_funding,
            key_allowance,
            items: IterableMap::new(StorageKey::Items),
            profiles: IterableMap::new(StorageKey::Profiles),
            inventory: LookupMap::new(StorageKey::Inventory),
            supply: LookupMap::new(StorageKey::Supply),
            demand: LookupMap::new(StorageKey::Demand),
            lots: LookupMap::new(StorageKey::Lots),
            lot_ids: Vector::new(StorageKey::LotIds),
            orders: IterableMap::new(StorageKey::Orders),
            next_order: 1,
            minted: 0,
            burned: 0,
            escrow: 0,
        };
        for it in items {
            require!(valid_item_id(&it.id), "bad item id");
            require!(it.base > 0, "bad base value");
            require!(!this.items.contains_key(&it.id), "duplicate item");
            this.items.insert(it.id, ItemDef { base: it.base, category: it.category, level: it.level });
        }
        this
    }

    // ---------- internal ----------

    fn assert_house(&self) {
        require!(env::predecessor_account_id() == self.house, "house only");
    }

    fn profile_mut(&mut self, who: &AccountId) -> &mut Profile {
        self.profiles
            .get_mut(who)
            .unwrap_or_else(|| env::panic_str("unknown account"))
    }

    fn add_tokens(&mut self, owner: &AccountId, token: &str, n: u32) {
        if self.inventory.get(owner).is_none() {
            self.inventory.insert(owner.clone(), BTreeMap::new());
        }
        let inv = self.inventory.get_mut(owner).unwrap();
        *inv.entry(token.to_string()).or_insert(0) += n;
    }

    fn take_tokens(&mut self, owner: &AccountId, token: &str, n: u32) {
        let inv = self
            .inventory
            .get_mut(owner)
            .unwrap_or_else(|| env::panic_str("not enough items"));
        let have = inv.get(token).copied().unwrap_or(0);
        require!(have >= n, "not enough items");
        if have == n {
            inv.remove(token);
        } else {
            inv.insert(token.to_string(), have - n);
        }
    }

    fn demand_now(&self, item: &str) -> u64 {
        match self.demand.get(item) {
            None => DEMAND_START_BP,
            Some(d) => {
                let elapsed = now().saturating_sub(d.updated_ns) as u128;
                let recovered = (elapsed * DEMAND_RECOVER_BP_PER_HOUR as u128 / HOUR_NS as u128) as u64;
                (d.bp + recovered).min(DEMAND_START_BP)
            }
        }
    }

    // ---------- House: accounts ----------

    /// Creates `<sub>.<this contract>` holding only `public_key`, limited to PLAYER_METHODS,
    /// and gives it its starting miles. Rivals (NPC bidders) are created the same way.
    pub fn create_account(
        &mut self,
        sub: String,
        public_key: PublicKey,
        nickname: String,
        rival: bool,
        starting_miles: Option<u64>,
    ) -> Promise {
        self.assert_house();
        require!(
            sub.len() >= 2
                && sub.len() <= 32
                && sub.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_'),
            "bad account name"
        );
        let nick_len = nickname.chars().count();
        require!((2..=24).contains(&nick_len), "bad nickname");
        let account_id: AccountId = format!("{}.{}", sub, env::current_account_id())
            .parse()
            .unwrap_or_else(|_| env::panic_str("bad account name"));
        require!(!self.profiles.contains_key(&account_id), "name taken");

        let miles = if rival { starting_miles.unwrap_or(START_MILES) } else { START_MILES };
        self.profiles.insert(
            account_id.clone(),
            Profile {
                nickname: nickname.clone(),
                rival,
                miles,
                debt: 0,
                joined_ns: U64(now()),
                lots_won: 0,
                spent: 0,
                earned: 0,
                strikes: 0,
            },
        );
        self.minted += miles;
        emit("account_joined", json!({"account_id": account_id, "nickname": nickname, "rival": rival, "miles": miles}));

        let allowance = Allowance::limited(self.key_allowance).unwrap_or(Allowance::Unlimited);
        Promise::new(account_id.clone())
            .create_account()
            .transfer(self.account_funding)
            .add_access_key_allowance(public_key, allowance, env::current_account_id(), PLAYER_METHODS)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(10))
                    .on_account_created(account_id),
            )
    }

    #[private]
    pub fn on_account_created(
        &mut self,
        account_id: AccountId,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        if result.is_ok() {
            return true;
        }
        if let Some(p) = self.profiles.remove(&account_id) {
            self.minted -= p.miles;
        }
        emit("account_join_failed", json!({"account_id": account_id}));
        false
    }

    pub fn set_funding(&mut self, account_funding: NearToken, key_allowance: NearToken) {
        self.assert_house();
        self.account_funding = account_funding;
        self.key_allowance = key_allowance;
    }

    /// A broke account can borrow from the House. The debt is public.
    pub fn grant_loan(&mut self, account_id: AccountId, amount: u64) {
        self.assert_house();
        require!(amount > 0 && amount <= MAX_LOAN, "bad loan amount");
        let p = self.profile_mut(&account_id);
        require!(p.miles < BROKE_LINE, "not broke");
        p.miles += amount;
        p.debt += amount;
        self.minted += amount;
        emit("loan", json!({"account_id": account_id, "amount": amount}));
    }

    // ---------- House: lots ----------

    /// Seals upcoming bags. Each commitment is sha256 of `commitment_preimage(...)`.
    pub fn open_lots(&mut self, lots: Vec<LotInput>) {
        self.assert_house();
        require!(!lots.is_empty() && lots.len() <= 20, "1-20 lots per call");
        let mut ids = Vec::with_capacity(lots.len());
        for l in lots {
            require!(!self.lots.contains_key(&l.id), "lot id used");
            require!(l.tier <= 2, "bad tier");
            require!(
                l.commitment.len() == 64 && l.commitment.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase()),
                "commitment must be 64 lowercase hex chars"
            );
            require!(l.opening > 0, "bad opening bid");
            ids.push(l.id);
            self.lot_ids.push(l.id);
            self.lots.insert(
                l.id,
                Lot {
                    id: l.id,
                    tier: l.tier,
                    commitment: l.commitment,
                    opening: l.opening,
                    opened_ns: U64(now()),
                    opened_block: U64(env::block_height()),
                    status: LotStatus::Open,
                    winner: None,
                    price: 0,
                    closed_ns: U64(0),
                    items: vec![],
                    salt: String::new(),
                },
            );
        }
        emit("lots_sealed", json!({"ids": ids, "block": env::block_height()}));
    }

    /// Reveals a lot's contents and records the result. Fails unless the contents and salt
    /// hash to the commitment that was sealed before bidding opened.
    pub fn close_lot(&mut self, id: u64, winner: Option<AccountId>, price: u64, items: Vec<String>, salt: String) {
        self.assert_house();
        let mut lot = self.lots.get(&id).cloned().unwrap_or_else(|| env::panic_str("no such lot"));
        require!(lot.status == LotStatus::Open, "lot not open");
        require!(!items.is_empty() && items.len() <= 12, "bad item count");
        require!(salt.len() >= 16 && salt.len() <= 64, "bad salt");
        for c in &items {
            let (item, _) = split_token(committed_to_token(c));
            require!(self.items.contains_key(item), "unknown item");
        }
        let preimage = commitment_preimage(env::current_account_id().as_str(), id, lot.tier, &items, &salt);
        require!(hex(&env::sha256_array(preimage.as_bytes())) == lot.commitment, "contents do not match the sealed tag");

        lot.items = items;
        lot.salt = salt;
        lot.closed_ns = U64(now());
        match &winner {
            Some(w) => {
                require!(price >= lot.opening, "price below opening bid");
                let p = self.profiles.get(w).unwrap_or_else(|| env::panic_str("unknown winner"));
                require!(p.miles >= price, "winner cannot cover the price");
                lot.status = LotStatus::AwaitingPayment;
                lot.winner = Some(w.clone());
                lot.price = price;
            }
            None => {
                lot.status = LotStatus::Unsold;
            }
        }
        emit(
            "lot_revealed",
            json!({"id": id, "winner": winner, "price": lot.price, "items": lot.items, "salt": lot.salt}),
        );
        self.lots.insert(id, lot);
    }

    /// Marks an unpaid lot as expired after the payment window. The items are never minted.
    pub fn expire_lot(&mut self, id: u64) {
        self.assert_house();
        let mut lot = self.lots.get(&id).cloned().unwrap_or_else(|| env::panic_str("no such lot"));
        require!(lot.status == LotStatus::AwaitingPayment, "lot not awaiting payment");
        require!(now() >= lot.closed_ns.0 + PAY_WINDOW_NS, "payment window still open");
        lot.status = LotStatus::Expired;
        if let Some(w) = &lot.winner {
            if let Some(p) = self.profiles.get_mut(w) {
                p.strikes += 1;
            }
        }
        emit("lot_expired", json!({"id": id}));
        self.lots.insert(id, lot);
    }

    // ---------- Player methods (signed by the player's own key) ----------

    /// The winner pays for a revealed lot and receives its items.
    pub fn pay_lot(&mut self, id: u64) -> Vec<String> {
        let who = env::predecessor_account_id();
        let mut lot = self.lots.get(&id).cloned().unwrap_or_else(|| env::panic_str("no such lot"));
        require!(lot.status == LotStatus::AwaitingPayment, "lot not awaiting payment");
        require!(lot.winner.as_ref() == Some(&who), "only the winner can pay");
        let price = lot.price;
        {
            let p = self.profile_mut(&who);
            require!(p.miles >= price, "not enough miles");
            p.miles -= price;
            p.spent += price;
            p.lots_won += 1;
        }
        self.burned += price;

        let tokens: Vec<String> = lot.items.iter().map(|c| committed_to_token(c).to_string()).collect();
        for t in &tokens {
            self.add_tokens(&who, t, 1);
            let s = self.supply.get(t).copied().unwrap_or(0);
            self.supply.insert(t.clone(), s + 1);
        }
        lot.status = LotStatus::Paid;
        self.lots.insert(id, lot);

        let amounts: Vec<String> = tokens.iter().map(|_| "1".to_string()).collect();
        emit_mt("mt_mint", json!({"owner_id": who, "token_ids": tokens, "amounts": amounts, "memo": format!("lot {}", id)}));
        emit("lot_paid", json!({"id": id, "winner": who, "price": price}));
        tokens
    }

    /// Sells items to the Customs Dealer at the current market price. Every unit sold
    /// lowers that item's demand for everyone.
    pub fn sell(&mut self, token_id: String, amount: u32) -> u64 {
        require!((1..=50).contains(&amount), "amount 1-50");
        let who = env::predecessor_account_id();
        require!(self.profiles.contains_key(&who), "unknown account");
        let (item, cond) = split_token(&token_id);
        let def = self.items.get(item).cloned().unwrap_or_else(|| env::panic_str("unknown item"));
        let cbp = cond_bp(cond);
        let item = item.to_string();

        self.take_tokens(&who, &token_id, amount);
        let mut d = self.demand_now(&item);
        let mut total = 0u64;
        for _ in 0..amount {
            total += unit_price(def.base, cbp, d);
            d = (d * DEMAND_AFTER_SALE_PCT / 100).max(DEMAND_FLOOR_BP);
        }
        self.demand.insert(item.clone(), Demand { bp: d, updated_ns: now() });
        let s = self.supply.get(&token_id).copied().unwrap_or(0);
        self.supply.insert(token_id.clone(), s.saturating_sub(amount as u64));
        {
            let p = self.profile_mut(&who);
            p.miles += total;
            p.earned += total;
        }
        self.minted += total;

        emit_mt("mt_burn", json!({"owner_id": who, "token_ids": [token_id], "amounts": [amount.to_string()], "memo": "sold to dealer"}));
        emit("sold", json!({"account_id": who, "token_id": token_id, "amount": amount, "total": total, "demand_bp": d}));
        total
    }

    /// Posts an escrowed buy order. The miles are locked until it is filled or cancelled.
    pub fn post_order(&mut self, item_id: String, min_cond: String, price_each: u64, amount: u32) -> u64 {
        require!((1..=20).contains(&amount), "amount 1-20");
        require!(price_each > 0, "bad price");
        require!(self.items.contains_key(&item_id), "unknown item");
        cond_rank(&min_cond);
        let who = env::predecessor_account_id();
        let cost = price_each * amount as u64;
        {
            let p = self.profile_mut(&who);
            require!(p.miles >= cost, "not enough miles");
            p.miles -= cost;
        }
        self.escrow += cost;
        let id = self.next_order;
        self.next_order += 1;
        let order = Order {
            id,
            buyer: who.clone(),
            item_id,
            min_cond,
            price_each,
            remaining: amount,
            created_ns: U64(now()),
        };
        emit("order_posted", json!({"id": id, "buyer": who, "item_id": order.item_id, "min_cond": order.min_cond, "price_each": price_each, "amount": amount}));
        self.orders.insert(id, order);
        id
    }

    pub fn cancel_order(&mut self, order_id: u64) -> u64 {
        let who = env::predecessor_account_id();
        let order = self.orders.get(&order_id).cloned().unwrap_or_else(|| env::panic_str("no such order"));
        require!(order.buyer == who, "not your order");
        let refund = order.price_each * order.remaining as u64;
        self.orders.remove(&order_id);
        self.escrow -= refund;
        self.profile_mut(&who).miles += refund;
        emit("order_cancelled", json!({"id": order_id, "refund": refund}));
        refund
    }

    /// Sells items into someone's buy order. The buyer's escrowed miles go to the seller.
    pub fn fill_order(&mut self, order_id: u64, token_id: String, amount: u32) -> u64 {
        let who = env::predecessor_account_id();
        require!(self.profiles.contains_key(&who), "unknown account");
        let mut order = self.orders.get(&order_id).cloned().unwrap_or_else(|| env::panic_str("no such order"));
        require!(order.buyer != who, "cannot fill your own order");
        require!(amount >= 1 && amount <= order.remaining, "bad amount");
        let (item, cond) = split_token(&token_id);
        require!(item == order.item_id, "wrong item");
        require!(cond_rank(cond) >= cond_rank(&order.min_cond), "condition too low");

        self.take_tokens(&who, &token_id, amount);
        let buyer = order.buyer.clone();
        self.add_tokens(&buyer, &token_id, amount);
        let pay = order.price_each * amount as u64;
        self.escrow -= pay;
        {
            let p = self.profile_mut(&who);
            p.miles += pay;
            p.earned += pay;
        }
        order.remaining -= amount;
        if order.remaining == 0 {
            self.orders.remove(&order_id);
        } else {
            self.orders.insert(order_id, order);
        }
        emit_mt(
            "mt_transfer",
            json!({"old_owner_id": who, "new_owner_id": buyer, "token_ids": [token_id], "amounts": [amount.to_string()], "memo": format!("order {}", order_id)}),
        );
        emit("order_filled", json!({"id": order_id, "seller": who, "buyer": buyer, "amount": amount, "paid": pay}));
        pay
    }

    pub fn repay(&mut self, amount: u64) -> u64 {
        let who = env::predecessor_account_id();
        let p = self.profile_mut(&who);
        let amt = amount.min(p.debt).min(p.miles);
        require!(amt > 0, "nothing to repay");
        p.miles -= amt;
        p.debt -= amt;
        self.burned += amt;
        emit("repaid", json!({"account_id": who, "amount": amt}));
        amt
    }

    // ---------- Views ----------

    pub fn get_profile(&self, account_id: AccountId) -> Option<ProfileView> {
        self.profiles.get(&account_id).map(|p| ProfileView {
            account_id: account_id.clone(),
            profile: p.clone(),
            inventory: self.inventory_of(account_id.clone()),
        })
    }

    pub fn profiles(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<ProfileView> {
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100) as usize;
        self.profiles
            .iter()
            .skip(from)
            .take(limit)
            .map(|(id, p)| ProfileView {
                account_id: id.clone(),
                profile: p.clone(),
                inventory: self.inventory_of(id.clone()),
            })
            .collect()
    }

    pub fn inventory_of(&self, account_id: AccountId) -> Vec<(String, u32)> {
        self.inventory
            .get(&account_id)
            .map(|m| m.iter().map(|(k, v)| (k.clone(), *v)).collect())
            .unwrap_or_default()
    }

    pub fn mt_balance_of(&self, account_id: AccountId, token_id: String) -> U128 {
        U128(
            self.inventory
                .get(&account_id)
                .and_then(|m| m.get(&token_id).copied())
                .unwrap_or(0) as u128,
        )
    }

    pub fn mt_batch_balance_of(&self, account_id: AccountId, token_ids: Vec<String>) -> Vec<U128> {
        token_ids
            .into_iter()
            .map(|t| self.mt_balance_of(account_id.clone(), t))
            .collect()
    }

    pub fn mt_supply(&self, token_id: String) -> Option<U128> {
        self.supply.get(&token_id).map(|s| U128(*s as u128))
    }

    pub fn market(&self) -> Vec<MarketRow> {
        self.items
            .iter()
            .map(|(id, d)| MarketRow {
                item_id: id.clone(),
                base: d.base,
                category: d.category.clone(),
                level: d.level,
                demand_bp: self.demand_now(id),
            })
            .collect()
    }

    /// What the dealer would pay right now for `amount` units of `token_id`.
    pub fn dealer_quote(&self, token_id: String, amount: u32) -> u64 {
        let (item, cond) = split_token(&token_id);
        let def = self.items.get(item).unwrap_or_else(|| env::panic_str("unknown item"));
        let mut d = self.demand_now(item);
        let mut total = 0;
        for _ in 0..amount.min(50) {
            total += unit_price(def.base, cond_bp(cond), d);
            d = (d * DEMAND_AFTER_SALE_PCT / 100).max(DEMAND_FLOOR_BP);
        }
        total
    }

    pub fn get_lot(&self, id: u64) -> Option<Lot> {
        self.lots.get(&id).cloned()
    }

    /// Most recent lots first.
    pub fn recent_lots(&self, limit: Option<u32>) -> Vec<Lot> {
        let n = self.lot_ids.len();
        let limit = limit.unwrap_or(20).min(50);
        (0..limit.min(n))
            .filter_map(|i| self.lot_ids.get(n - 1 - i))
            .filter_map(|id| self.lots.get(id).cloned())
            .collect()
    }

    pub fn orders(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Order> {
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100) as usize;
        self.orders.iter().skip(from).take(limit).map(|(_, o)| o.clone()).collect()
    }

    /// Anyone can check a reveal: true when `items` and `salt` hash to the lot's sealed tag.
    pub fn check_commitment(&self, id: u64, items: Vec<String>, salt: String) -> bool {
        match self.lots.get(&id) {
            None => false,
            Some(lot) => {
                let pre = commitment_preimage(env::current_account_id().as_str(), id, lot.tier, &items, &salt);
                hex(&env::sha256_array(pre.as_bytes())) == lot.commitment
            }
        }
    }

    pub fn stats(&self) -> Stats {
        Stats {
            house: self.house.clone(),
            accounts: self.profiles.len(),
            lots: self.lot_ids.len(),
            open_orders: self.orders.len(),
            minted: self.minted,
            burned: self.burned,
            escrow: self.escrow,
            account_funding: self.account_funding,
            key_allowance: self.key_allowance,
        }
    }
}

#[cfg(test)]
mod tests;
