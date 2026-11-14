//! Litmus: a vault where a risky trade only executes if a staking market clears it.
//!
//! Flow: the manager `propose`s a trade. A small trade in a known asset executes at once.
//! Anything larger, or in a new asset, opens a market: anyone (in the demo, a jury of AI
//! agents) can `stake` NEAR on Yes or No. After the close time anyone can `resolve`: the
//! larger side decides whether the trade executes. After the settlement window anyone can
//! `settle`: the price move since the quote decides which side was right. The side that was
//! right takes the other side's stakes, plus the manager's bond if a bad trade was blocked.
//!
//! Units: NEAR amounts are yoctoNEAR. USD amounts are micro-USD (6 decimals). Prices are
//! micro-USD per whole unit of the asset. Times are unix milliseconds.
//!
//! Verified AI verdicts: a juror that is an AI agent can attach the model's raw answer and the
//! signature NEAR AI Cloud's enclave (TEE) made over it. The contract checks the signature against
//! a registered enclave key, checks the request named this market, this juror and the manager's
//! reason, and reads Yes or No out of the answer itself. A juror cannot stake against what its
//! model said. See `verify_proof`.
//!
//! Testnet demo only. Execution is a mock swap against the vault's own ledger; no tokens move.

use near_sdk::json_types::{I128, U128};
use near_sdk::store::{IterableMap, LookupMap, Vector};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise};

const USDC: &str = "USDC";
const USD_ONE: u128 = 1_000_000;

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum ManagerKind {
    Ai,
    Scripted,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Action {
    Buy,
    Sell,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Side {
    Yes,
    No,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum MarketState {
    Open,
    Verdict,
    Settled,
    PassedInstantly,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum VerdictKind {
    Approved,
    Blocked,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum BondResult {
    Returned,
    Slashed,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Holding {
    pub amount: U128,
    pub decimals: u8,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Proposal {
    pub action: Action,
    pub asset: String,
    pub size_bps: u32,
    pub size_usd: U128,
    pub reason: String,
    pub quote_price_usd: U128,
    pub flags: Vec<String>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Payout {
    pub account_id: AccountId,
    pub amount_near: NearToken,
    pub claimed: bool,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Settlement {
    pub price_move_bps: i32,
    /// What the trade made (or would have made, if it was blocked).
    pub pnl_usd: I128,
    pub payouts: Vec<Payout>,
    pub bond_result: BondResult,
    pub bond_amount_near: NearToken,
    pub pot_effect_usd: I128,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Market {
    pub id: u64,
    pub state: MarketState,
    pub proposal: Proposal,
    pub proposed_at_ms: u64,
    pub opened_at_ms: Option<u64>,
    pub close_time_ms: Option<u64>,
    pub settle_after_ms: Option<u64>,
    pub yes_near: NearToken,
    pub no_near: NearToken,
    pub verdict: Option<VerdictKind>,
    pub executed: bool,
    pub settlement: Option<Settlement>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Stake {
    pub account_id: AccountId,
    pub side: Side,
    pub amount_near: NearToken,
    pub time_ms: u64,
    /// The staker's one-line reason. Jury agents use it to say why they staked.
    pub note: Option<String>,
    /// Present when the stake carried a verified answer from an attested model.
    pub proof: Option<Proof>,
}

/// What an AI juror submits with its stake: the exact request and response bodies of one
/// chat-completion call to NEAR AI Cloud, and the enclave's ed25519 signature over
/// `"{model}:{sha256(request)}:{sha256(response)}"`. Hex strings are lower-case, no prefix.
#[near(serializers = [json])]
pub struct ProofInput {
    pub model: String,
    pub request: String,
    pub response: String,
    pub signature: String,
    pub signing_key: String,
}

/// What stays on chain for a verified stake. The bodies are not stored, only their hashes.
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Proof {
    pub model: String,
    pub request_hash: String,
    pub response_hash: String,
    pub signature: String,
    pub signing_key: String,
}

#[near(serializers = [json])]
pub struct HoldingView {
    pub asset: String,
    pub amount: U128,
    pub decimals: u8,
    pub value_usd: U128,
}

#[near(serializers = [json])]
pub struct ManagerView {
    pub account_id: AccountId,
    pub kind: ManagerKind,
}

#[near(serializers = [json])]
pub struct VaultView {
    pub pot_value_usd: U128,
    pub holdings: Vec<HoldingView>,
    pub manager: ManagerView,
    pub bond_near: NearToken,
    pub bond_required_near: NearToken,
    pub threshold_bps: u32,
    pub min_stake_near: NearToken,
    pub market_duration_ms: u64,
    pub settle_window_ms: u64,
}

#[derive(BorshStorageKey)]
#[near]
enum Key {
    Holdings,
    Prices,
    Markets,
    Stakes,
    TeeKeys,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Litmus {
    owner: AccountId,
    manager: AccountId,
    manager_kind: ManagerKind,
    bond: NearToken,
    bond_required: NearToken,
    threshold_bps: u32,
    min_stake: NearToken,
    market_duration_ms: u64,
    settle_window_ms: u64,
    holdings: IterableMap<String, Holding>,
    prices: LookupMap<String, u128>,
    markets: Vector<Market>,
    stakes: LookupMap<u64, Vec<Stake>>,
    active: Option<u64>,
    /// Enclave signing keys the owner has registered: ed25519 public key (hex) -> model id.
    tee_keys: IterableMap<String, String>,
}

fn pct(bps: u32) -> String {
    if bps % 100 == 0 {
        format!("{}", bps / 100)
    } else {
        format!("{}.{:02}", bps / 100, bps % 100).trim_end_matches('0').to_string()
    }
}

#[near]
impl Litmus {
    /// `owner` is the account that deploys: it seeds the mock vault and pushes prices.
    #[init]
    pub fn new(
        manager: AccountId,
        manager_kind: ManagerKind,
        threshold_bps: u32,
        min_stake: NearToken,
        bond_required: NearToken,
        market_duration_ms: u64,
        settle_window_ms: u64,
    ) -> Self {
        require!(threshold_bps <= 10_000, "threshold_bps must be at most 10000");
        let mut prices = LookupMap::new(Key::Prices);
        prices.insert(USDC.to_string(), USD_ONE);
        Self {
            owner: env::predecessor_account_id(),
            manager,
            manager_kind,
            bond: NearToken::from_yoctonear(0),
            bond_required,
            threshold_bps,
            min_stake,
            market_duration_ms,
            settle_window_ms,
            holdings: IterableMap::new(Key::Holdings),
            prices,
            markets: Vector::new(Key::Markets),
            stakes: LookupMap::new(Key::Stakes),
            active: None,
            tee_keys: IterableMap::new(Key::TeeKeys),
        }
    }

    /* ---------- owner: mock vault and price feed ---------- */

    /// Put a mock balance in the vault. Demo only: no tokens move.
    pub fn seed_holding(&mut self, asset: String, amount: U128, decimals: u8) {
        self.only_owner();
        require!(decimals <= 24, "decimals must be at most 24");
        self.holdings.insert(asset, Holding { amount, decimals });
    }

    /// Push a quote price: micro-USD per whole unit of the asset.
    pub fn set_price(&mut self, asset: String, price_usd: U128) {
        self.only_owner();
        require!(price_usd.0 > 0, "Price must be above zero");
        require!(asset != USDC, "USDC is fixed at $1");
        self.prices.insert(asset, price_usd.0);
    }

    /// Trust an enclave signing key for a model. The owner takes the key from NEAR AI Cloud's
    /// attestation report; checking the hardware quote in that report happens off chain.
    pub fn register_tee_key(&mut self, model: String, signing_key: String) {
        self.only_owner();
        require!(unhex(&signing_key).map_or(false, |k| k.len() == 32), "signing_key must be 32 bytes of hex");
        self.tee_keys.insert(signing_key.to_lowercase(), model);
    }

    pub fn remove_tee_key(&mut self, signing_key: String) {
        self.only_owner();
        self.tee_keys.remove(&signing_key.to_lowercase());
    }

    /// Whether the manager's proposals are written by a model or by a fixed script.
    pub fn set_manager_kind(&mut self, kind: ManagerKind) {
        self.only_owner();
        self.manager_kind = kind;
    }

    pub fn set_timing(&mut self, market_duration_ms: u64, settle_window_ms: u64) {
        self.only_owner();
        require!(self.active.is_none(), "A market is open");
        self.market_duration_ms = market_duration_ms;
        self.settle_window_ms = settle_window_ms;
    }

    /* ---------- manager ---------- */

    #[payable]
    pub fn post_bond(&mut self) {
        self.only_manager();
        self.bond = self.bond.saturating_add(env::attached_deposit());
    }

    pub fn withdraw_bond(&mut self) -> Promise {
        self.only_manager();
        require!(self.active.is_none(), "The bond is locked while a market is open");
        let amount = self.bond;
        require!(!amount.is_zero(), "No bond posted");
        self.bond = NearToken::from_yoctonear(0);
        Promise::new(self.manager.clone()).transfer(amount)
    }

    /// Propose a trade of `size_bps` of the pot. Returns the market id.
    /// A small trade in an asset the vault already holds executes at once.
    pub fn propose(&mut self, action: Action, asset: String, size_bps: u32, reason: String) -> u64 {
        self.only_manager();
        require!(self.active.is_none(), "Another trade is still under review");
        require!(size_bps > 0 && size_bps <= 10_000, "size_bps must be from 1 to 10000");
        require!(asset != USDC, "Trades are priced in USDC");
        require!(reason.len() <= 280, "Keep the reason under 280 characters");
        let price = *self.prices.get(&asset).unwrap_or_else(|| env::panic_str("No quote price for this asset"));

        let size_usd = self.pot_value() * size_bps as u128 / 10_000;
        require!(size_usd > 0, "The pot is empty");
        match action {
            Action::Buy => require!(self.balance(USDC) >= size_usd, "Not enough USDC in the vault"),
            Action::Sell => require!(self.value_of(&asset) >= size_usd, "The vault does not hold that much of this asset"),
        }

        let mut flags = Vec::new();
        if size_bps > self.threshold_bps {
            flags.push(format!("Size is {}% of the pot (limit {}%)", pct(size_bps), pct(self.threshold_bps)));
        }
        if !self.holdings.contains_key(&asset) {
            flags.push("New asset: never held before".to_string());
        }

        let id = self.markets.len() as u64;
        let now = env::block_timestamp_ms();
        let flagged = !flags.is_empty();
        if flagged {
            require!(self.bond >= self.bond_required, "Post the bond before proposing a flagged trade");
        }
        let mut market = Market {
            id,
            state: if flagged { MarketState::Open } else { MarketState::PassedInstantly },
            proposal: Proposal { action, asset, size_bps, size_usd: U128(size_usd), reason, quote_price_usd: U128(price), flags },
            proposed_at_ms: now,
            opened_at_ms: flagged.then_some(now),
            close_time_ms: flagged.then_some(now + self.market_duration_ms),
            settle_after_ms: None,
            yes_near: NearToken::from_yoctonear(0),
            no_near: NearToken::from_yoctonear(0),
            verdict: None,
            executed: false,
            settlement: None,
        };
        if flagged {
            self.active = Some(id);
        } else {
            self.execute(&market.proposal);
            market.verdict = Some(VerdictKind::Approved);
            market.executed = true;
        }
        self.markets.push(market);
        id
    }

    /* ---------- anyone ---------- */

    /// Stake the attached NEAR on Yes (let the trade through) or No (block it).
    /// With `proof`, the stake is accepted only if the proof checks out and the model's own
    /// answer is the same side. The note stored is then the model's note, not the caller's.
    #[payable]
    pub fn stake(&mut self, market_id: u64, side: Side, note: Option<String>, proof: Option<ProofInput>) {
        let who = env::predecessor_account_id();
        let amount = env::attached_deposit();
        let now = env::block_timestamp_ms();
        require!(who != self.manager, "The manager cannot stake on their own trade");
        require!(amount >= self.min_stake, "Stake is below the minimum");
        require!(note.as_ref().map_or(true, |n| n.len() <= 200), "Keep the note under 200 characters");
        let market = self.markets.get(market_id as u32).unwrap_or_else(|| env::panic_str("No such market"));
        require!(market.state == MarketState::Open, "This market is closed");
        require!(now < market.close_time_ms.unwrap_or(0), "This market is closed");

        let (note, proof) = match proof {
            None => (note, None),
            Some(input) => {
                let (model_side, model_note, proof) = self.verify_proof(&input, market_id, &who, &market.proposal.reason);
                require!(model_side == side, "The stake does not match the model's verdict");
                // Keep the caller's short label ("sizer: ...") only as a prefix; the reason is the model's.
                let label = note.as_deref().and_then(|n| n.split_once(':')).map(|(l, _)| l.trim()).filter(|l| !l.is_empty() && l.len() <= 20);
                let text = match label {
                    Some(l) => format!("{l}: {model_note}"),
                    None => model_note,
                };
                (Some(text.chars().take(200).collect()), Some(proof))
            }
        };

        let market = self.markets.get_mut(market_id as u32).unwrap();
        match side {
            Side::Yes => market.yes_near = market.yes_near.saturating_add(amount),
            Side::No => market.no_near = market.no_near.saturating_add(amount),
        }
        let mut list = self.stakes.get(&market_id).cloned().unwrap_or_default();
        list.push(Stake { account_id: who, side, amount_near: amount, time_ms: now, note, proof });
        self.stakes.insert(market_id, list);
    }

    /// After the close time: the larger side decides. A tie, or no stakes at all, blocks.
    pub fn resolve(&mut self, market_id: u64) -> VerdictKind {
        let now = env::block_timestamp_ms();
        let window = self.settle_window_ms;
        let market = self.markets.get(market_id as u32).unwrap_or_else(|| env::panic_str("No such market")).clone();
        require!(market.state == MarketState::Open, "This market is not open");
        require!(now >= market.close_time_ms.unwrap_or(u64::MAX), "The market has not closed yet");
        let verdict = if market.yes_near > market.no_near { VerdictKind::Approved } else { VerdictKind::Blocked };
        if verdict == VerdictKind::Approved {
            self.execute(&market.proposal);
        }
        let m = self.markets.get_mut(market_id as u32).unwrap();
        m.state = MarketState::Verdict;
        m.verdict = Some(verdict);
        m.executed = verdict == VerdictKind::Approved;
        m.settle_after_ms = Some(now + window);
        verdict
    }

    /// After the settlement window: the price move since the quote decides which side was right.
    pub fn settle(&mut self, market_id: u64) {
        let now = env::block_timestamp_ms();
        let market = self.markets.get(market_id as u32).unwrap_or_else(|| env::panic_str("No such market")).clone();
        require!(market.state == MarketState::Verdict, "This market has no verdict to settle");
        require!(now >= market.settle_after_ms.unwrap_or(u64::MAX), "The settlement window is still running");

        let p = &market.proposal;
        let quote = p.quote_price_usd.0 as i128;
        let price_now = *self.prices.get(&p.asset).unwrap_or(&p.quote_price_usd.0) as i128;
        let move_bps = (price_now - quote) * 10_000 / quote;
        let buy_pnl = p.size_usd.0 as i128 * (price_now - quote) / quote;
        let pnl = if p.action == Action::Buy { buy_pnl } else { -buy_pnl };
        let good_trade = pnl >= 0;
        let right = if good_trade { Side::Yes } else { Side::No };
        let blocked = market.verdict == Some(VerdictKind::Blocked);

        let stakes = self.stakes.get(&market_id).cloned().unwrap_or_default();
        let mut totals: Vec<(AccountId, u128)> = Vec::new();
        let (mut win_total, mut lose_total) = (0u128, 0u128);
        for s in stakes.iter() {
            let y = s.amount_near.as_yoctonear();
            if s.side == right {
                win_total += y;
                match totals.iter_mut().find(|(a, _)| a == &s.account_id) {
                    Some(t) => t.1 += y,
                    None => totals.push((s.account_id.clone(), y)),
                }
            } else {
                lose_total += y;
            }
        }

        // The bond is paid out only when a bad trade was blocked and somebody staked to block it.
        let slash = blocked && !good_trade && win_total > 0;
        let bond_amount = self.bond;
        let extra = if slash { bond_amount.as_yoctonear() } else { 0 };
        if slash {
            self.bond = NearToken::from_yoctonear(0);
        }

        let payouts: Vec<Payout> = if win_total > 0 {
            totals
                .into_iter()
                .map(|(account_id, own)| {
                    let share = mul_div(lose_total + extra, own, win_total);
                    Payout { account_id, amount_near: NearToken::from_yoctonear(own + share), claimed: false }
                })
                .collect()
        } else {
            // Nobody was on the right side: everyone gets their own stake back.
            let mut refunds: Vec<Payout> = Vec::new();
            for s in stakes.iter() {
                match refunds.iter_mut().find(|r| r.account_id == s.account_id) {
                    Some(r) => r.amount_near = r.amount_near.saturating_add(s.amount_near),
                    None => refunds.push(Payout { account_id: s.account_id.clone(), amount_near: s.amount_near, claimed: false }),
                }
            }
            refunds
        };

        let m = self.markets.get_mut(market_id as u32).unwrap();
        m.state = MarketState::Settled;
        m.settlement = Some(Settlement {
            price_move_bps: move_bps.clamp(i32::MIN as i128, i32::MAX as i128) as i32,
            pnl_usd: I128(pnl),
            payouts,
            bond_result: if slash { BondResult::Slashed } else { BondResult::Returned },
            bond_amount_near: bond_amount,
            pot_effect_usd: I128(if market.executed { pnl } else { 0 }),
        });
        self.active = None;
    }

    /// Collect a payout from a settled market.
    pub fn claim(&mut self, market_id: u64) -> Promise {
        let who = env::predecessor_account_id();
        let market = self.markets.get_mut(market_id as u32).unwrap_or_else(|| env::panic_str("No such market"));
        let settlement = market.settlement.as_mut().unwrap_or_else(|| env::panic_str("This market is not settled yet"));
        let payout = settlement
            .payouts
            .iter_mut()
            .find(|p| p.account_id == who)
            .unwrap_or_else(|| env::panic_str("Nothing to claim for this account"));
        require!(!payout.claimed, "Already claimed");
        payout.claimed = true;
        Promise::new(who).transfer(payout.amount_near)
    }

    /* ---------- views ---------- */

    pub fn get_vault(&self) -> VaultView {
        let holdings = self
            .holdings
            .iter()
            .filter(|(_, h)| h.amount.0 > 0)
            .map(|(asset, h)| HoldingView { asset: asset.clone(), amount: h.amount, decimals: h.decimals, value_usd: U128(self.value_of(asset)) })
            .collect();
        VaultView {
            pot_value_usd: U128(self.pot_value()),
            holdings,
            manager: ManagerView { account_id: self.manager.clone(), kind: self.manager_kind },
            bond_near: self.bond,
            bond_required_near: self.bond_required,
            threshold_bps: self.threshold_bps,
            min_stake_near: self.min_stake,
            market_duration_ms: self.market_duration_ms,
            settle_window_ms: self.settle_window_ms,
        }
    }

    pub fn get_active_market(&self) -> Option<Market> {
        self.active.and_then(|id| self.markets.get(id as u32).cloned())
    }

    pub fn get_stakes(&self, market_id: u64) -> Vec<Stake> {
        self.stakes.get(&market_id).cloned().unwrap_or_default()
    }

    /// Markets, newest first. `from` counts back from the newest.
    pub fn get_markets(&self, from: u32, limit: u32) -> Vec<Market> {
        let len = self.markets.len();
        (0..len).rev().skip(from as usize).take(limit.min(100) as usize).filter_map(|i| self.markets.get(i).cloned()).collect()
    }

    pub fn get_market(&self, market_id: u64) -> Option<Market> {
        self.markets.get(market_id as u32).cloned()
    }

    /// Registered enclave keys, as (ed25519 public key in hex, model id).
    pub fn get_tee_keys(&self) -> Vec<(String, String)> {
        self.tee_keys.iter().map(|(k, m)| (k.clone(), m.clone())).collect()
    }

    pub fn get_price(&self, asset: String) -> Option<U128> {
        self.prices.get(&asset).map(|p| U128(*p))
    }
}

/* ---------- internals ---------- */

/// a * b / c for yoctoNEAR-sized values. Works in units of 1e12 yocto so the product fits in u128;
/// the rounding loss is below a trillionth of a NEAR and stays in the contract.
fn mul_div(a: u128, b: u128, c: u128) -> u128 {
    const UNIT: u128 = 1_000_000_000_000;
    let c = (c / UNIT).max(1);
    (a / UNIT) * (b / UNIT) / c * UNIT
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn unhex(s: &str) -> Option<Vec<u8>> {
    let s = s.strip_prefix("0x").unwrap_or(s);
    if s.len() % 2 != 0 {
        return None;
    }
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(s.get(i..i + 2)?, 16).ok()).collect()
}

/// A string as it appears inside a JSON document, without the surrounding quotes.
fn json_escaped(s: &str) -> String {
    let quoted = near_sdk::serde_json::to_string(s).unwrap_or_default();
    quoted[1..quoted.len().saturating_sub(1)].to_string()
}

impl Litmus {
    /// Check an AI juror's proof and return (the model's side, the model's note, what to store).
    ///
    /// 1. The signing key is one the owner registered for this model.
    /// 2. The enclave's ed25519 signature is valid over "{model}:{sha256(request)}:{sha256(response)}",
    ///    with both hashes computed here from the submitted bodies.
    /// 3. The request names this contract, this market and this juror, and quotes the manager's
    ///    reason, so an answer cannot be reused for another market or by another account.
    /// 4. The side and note are read from the model's own answer in the response.
    ///
    /// Not checked: the rest of the prompt. A juror could still word its question unfairly.
    fn verify_proof(&self, p: &ProofInput, market_id: u64, juror: &AccountId, reason: &str) -> (Side, String, Proof) {
        require!(p.request.len() <= 8_000 && p.response.len() <= 16_000, "The proof is too large");
        let key_hex = p.signing_key.to_lowercase();
        require!(self.tee_keys.get(&key_hex).map_or(false, |m| m == &p.model), "This enclave key is not registered for this model");
        let key: [u8; 32] = unhex(&key_hex).and_then(|k| k.try_into().ok()).unwrap_or_else(|| env::panic_str("Bad signing key"));
        let signature: [u8; 64] = unhex(&p.signature).and_then(|k| k.try_into().ok()).unwrap_or_else(|| env::panic_str("Bad signature"));

        let request_hash = hex(&env::sha256(p.request.as_bytes()));
        let response_hash = hex(&env::sha256(p.response.as_bytes()));
        let signed = format!("{}:{}:{}", p.model, request_hash, response_hash);
        require!(env::ed25519_verify(&signature, signed.as_bytes(), &key), "The enclave signature does not match this request and response");

        let case = format!("Case: {}#{}#{}", env::current_account_id(), market_id, juror);
        require!(p.request.contains(&case), "The request does not name this market and this juror");
        require!(p.request.contains(&json_escaped(reason)), "The request does not quote the manager's reason");

        let body: near_sdk::serde_json::Value = near_sdk::serde_json::from_str(&p.response).unwrap_or_else(|_| env::panic_str("The response is not JSON"));
        let content = body["choices"][0]["message"]["content"].as_str().unwrap_or_else(|| env::panic_str("The response has no answer"));
        let (start, end) = (content.find('{'), content.rfind('}'));
        let answer: near_sdk::serde_json::Value = match (start, end) {
            (Some(a), Some(b)) if a < b => near_sdk::serde_json::from_str(&content[a..=b]).unwrap_or_else(|_| env::panic_str("The model's answer is not JSON")),
            _ => env::panic_str("The model's answer is not JSON"),
        };
        let side = match answer["side"].as_str() {
            Some("Yes") => Side::Yes,
            Some("No") => Side::No,
            _ => env::panic_str("The model's answer has no side"),
        };
        let note = answer["note"].as_str().unwrap_or("").to_string();
        (side, note, Proof { model: p.model.clone(), request_hash, response_hash, signature: p.signature.to_lowercase(), signing_key: key_hex })
    }

    fn only_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "Only the owner can do this");
    }

    fn only_manager(&self) {
        require!(env::predecessor_account_id() == self.manager, "Only the manager can do this");
    }

    fn balance(&self, asset: &str) -> u128 {
        self.holdings.get(asset).map(|h| h.amount.0).unwrap_or(0)
    }

    fn value_of(&self, asset: &str) -> u128 {
        match (self.holdings.get(asset), self.prices.get(asset)) {
            (Some(h), Some(price)) => h.amount.0 * price / 10u128.pow(h.decimals as u32),
            _ => 0,
        }
    }

    fn pot_value(&self) -> u128 {
        self.holdings.keys().map(|a| self.value_of(a)).sum()
    }

    /// Mock swap against the vault's own ledger, at the quote price. No tokens move.
    fn execute(&mut self, p: &Proposal) {
        let (size, price) = (p.size_usd.0, p.quote_price_usd.0);
        let decimals = self.holdings.get(&p.asset).map(|h| h.decimals).unwrap_or(6);
        let units = size * 10u128.pow(decimals as u32) / price;
        let (usdc, asset) = (self.balance(USDC), self.balance(&p.asset));
        let (usdc, asset) = match p.action {
            Action::Buy => (usdc.checked_sub(size).unwrap_or_else(|| env::panic_str("Not enough USDC in the vault")), asset + units),
            Action::Sell => (usdc + size, asset.checked_sub(units).unwrap_or_else(|| env::panic_str("Not enough of this asset in the vault"))),
        };
        self.holdings.insert(USDC.to_string(), Holding { amount: U128(usdc), decimals: 6 });
        self.holdings.insert(p.asset.clone(), Holding { amount: U128(asset), decimals });
    }
}

#[cfg(test)]
mod tests;
