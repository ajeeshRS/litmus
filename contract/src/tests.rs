use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

const MIN: u64 = 60_000;

fn acc(name: &str) -> AccountId {
    format!("{name}.testnet").parse().unwrap()
}
fn near(n: u128) -> NearToken {
    NearToken::from_near(n)
}
fn usd(n: u128) -> U128 {
    U128(n * USD_ONE)
}

/// Set who is calling, with what deposit, at what time (ms).
fn ctx(who: &str, deposit: NearToken, at_ms: u64) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(acc("litmus"))
        .predecessor_account_id(acc(who))
        .attached_deposit(deposit)
        .block_timestamp(at_ms * 1_000_000)
        .build());
}

/// A $10,000 vault: 6,000 USDC and 1,600 NEAR at $2.50. Limit 5%, bond 10 NEAR.
fn vault() -> Litmus {
    ctx("owner", near(0), 0);
    let mut c = Litmus::new(acc("trader"), ManagerKind::Ai, 500, NearToken::from_millinear(100), near(10), MIN, MIN);
    c.seed_holding("USDC".into(), U128(6_000 * USD_ONE), 6);
    c.seed_holding("NEAR".into(), U128(1_600 * 10u128.pow(24)), 24);
    c.seed_holding("BTC".into(), U128(0), 8);
    c.set_price("NEAR".into(), U128(2_500_000));
    c.set_price("BTC".into(), usd(100_000));
    c.set_price("FROGE".into(), U128(8_700));
    ctx("trader", near(10), 0);
    c.post_bond();
    c
}

#[test]
fn pot_is_valued_from_prices() {
    let c = vault();
    let v = c.get_vault();
    assert_eq!(v.pot_value_usd, usd(10_000));
    assert_eq!(v.bond_near, near(10));
}

#[test]
fn owner_can_relabel_the_manager() {
    let mut c = vault();
    ctx("owner", near(0), 10);
    c.set_manager_kind(ManagerKind::Scripted);
    assert_eq!(c.get_vault().manager.kind, ManagerKind::Scripted);
}

#[test]
fn small_trade_passes_instantly() {
    let mut c = vault();
    ctx("trader", near(0), 1_000);
    let id = c.propose(Action::Buy, "BTC".into(), 300, "Small BTC position".into());
    let m = c.get_market(id).unwrap();
    assert_eq!(m.state, MarketState::PassedInstantly);
    assert!(m.executed && m.proposal.flags.is_empty());
    assert!(c.get_active_market().is_none());
    let v = c.get_vault();
    assert_eq!(v.pot_value_usd, usd(10_000));
    let btc = v.holdings.iter().find(|h| h.asset == "BTC").unwrap();
    assert_eq!(btc.amount.0, 300_000); // 0.003 BTC
    assert_eq!(btc.value_usd, usd(300));
}

#[test]
fn bad_trade_is_blocked_and_no_stakers_take_the_bond() {
    let mut c = vault();
    ctx("trader", near(0), 1_000);
    let id = c.propose(Action::Buy, "FROGE".into(), 4_000, "Up 60% today".into());
    let m = c.get_active_market().unwrap();
    assert_eq!(m.state, MarketState::Open);
    assert_eq!(m.proposal.flags, vec!["Size is 40% of the pot (limit 5%)", "New asset: never held before"]);
    assert_eq!(m.proposal.size_usd, usd(4_000));

    ctx("mallory", near(5), 2_000);
    c.stake(id, Side::Yes, None, None);
    ctx("alice", near(12), 3_000);
    c.stake(id, Side::No, Some("40% of the pot in a token with no history".into()), None);
    ctx("bob", near(6), 4_000);
    c.stake(id, Side::No, None, None);
    ctx("carol", near(4), 5_000);
    c.stake(id, Side::No, None, None);
    assert_eq!(c.get_stakes(id).len(), 4);
    assert!(c.get_stakes(id)[1].note.as_deref().unwrap().starts_with("40%"));

    ctx("anyone", near(0), 1_000 + MIN);
    assert_eq!(c.resolve(id), VerdictKind::Blocked);
    let v = c.get_vault();
    assert_eq!(v.pot_value_usd, usd(10_000));
    assert!(v.holdings.iter().all(|h| h.asset != "FROGE"));

    // FROGE falls 31% during the settlement window.
    ctx("owner", near(0), 1_000 + MIN + 10);
    c.set_price("FROGE".into(), U128(6_003));
    ctx("anyone", near(0), 1_000 + 2 * MIN);
    c.settle(id);

    let m = c.get_market(id).unwrap();
    let s = m.settlement.unwrap();
    assert_eq!(m.state, MarketState::Settled);
    assert_eq!(s.price_move_bps, -3_100);
    assert_eq!(s.pnl_usd.0, -1_240 * USD_ONE as i128);
    assert_eq!(s.pot_effect_usd.0, 0);
    assert_eq!(s.bond_result, BondResult::Slashed);
    // No stakers split 5 NEAR of Yes stakes plus the 10 NEAR bond, on top of their own 22.
    let total: u128 = s.payouts.iter().map(|p| p.amount_near.as_yoctonear()).sum();
    assert!(total <= near(37).as_yoctonear() && total > near(37).as_yoctonear() - 1_000_000_000_000_000);
    let alice = s.payouts.iter().find(|p| p.account_id == acc("alice")).unwrap();
    assert_eq!(alice.amount_near.as_yoctonear() / 10u128.pow(22), 2018); // 20.18 NEAR
    assert!(s.payouts.iter().all(|p| p.account_id != acc("mallory")));
    assert!(c.get_vault().bond_near.is_zero());
    assert!(c.get_active_market().is_none());

    ctx("alice", near(0), 1_000 + 2 * MIN + 1);
    let _ = c.claim(id);
    assert!(c.get_market(id).unwrap().settlement.unwrap().payouts.iter().find(|p| p.account_id == acc("alice")).unwrap().claimed);
}

#[test]
fn good_trade_is_approved_executed_and_pays_yes() {
    let mut c = vault();
    ctx("owner", near(0), 500);
    c.seed_holding("ETH".into(), U128(0), 18);
    c.set_price("ETH".into(), usd(3_500));
    ctx("trader", near(0), 1_000);
    let id = c.propose(Action::Buy, "ETH".into(), 1_500, "Rotate idle USDC".into());
    ctx("dana", near(8), 2_000);
    c.stake(id, Side::Yes, None, None);
    ctx("erin", near(4), 3_000);
    c.stake(id, Side::No, None, None);
    ctx("anyone", near(0), 1_000 + MIN);
    assert_eq!(c.resolve(id), VerdictKind::Approved);
    assert_eq!(c.get_vault().holdings.iter().find(|h| h.asset == "USDC").unwrap().amount, usd(4_500));

    ctx("owner", near(0), 1_000 + MIN + 10);
    c.set_price("ETH".into(), usd(3_563)); // +1.8%
    ctx("anyone", near(0), 1_000 + 2 * MIN);
    c.settle(id);
    let s = c.get_market(id).unwrap().settlement.unwrap();
    assert_eq!(s.price_move_bps, 180);
    assert_eq!(s.pnl_usd.0, 27 * USD_ONE as i128);
    assert_eq!(s.pot_effect_usd.0, 27 * USD_ONE as i128);
    assert_eq!(s.bond_result, BondResult::Returned);
    assert_eq!(s.payouts.len(), 1);
    assert_eq!(s.payouts[0].amount_near, near(12));
    assert_eq!(c.get_vault().bond_near, near(10));
    // The pot now reflects the new ETH price (to within rounding of the ETH amount).
    let pot = c.get_vault().pot_value_usd.0;
    assert!(pot > usd(10_026).0 && pot <= usd(10_027).0);
}

#[test]
fn no_stakes_blocks_by_default_and_keeps_the_bond() {
    let mut c = vault();
    ctx("trader", near(0), 1_000);
    let id = c.propose(Action::Buy, "FROGE".into(), 4_000, "x".into());
    ctx("anyone", near(0), 1_000 + MIN);
    assert_eq!(c.resolve(id), VerdictKind::Blocked);
    ctx("owner", near(0), 1_000 + MIN + 1);
    c.set_price("FROGE".into(), U128(5_000));
    ctx("anyone", near(0), 1_000 + 2 * MIN);
    c.settle(id);
    let s = c.get_market(id).unwrap().settlement.unwrap();
    assert_eq!(s.bond_result, BondResult::Returned);
    assert!(s.payouts.is_empty());
}

#[test]
#[should_panic(expected = "The manager cannot stake on their own trade")]
fn manager_cannot_stake() {
    let mut c = vault();
    ctx("trader", near(0), 1_000);
    let id = c.propose(Action::Buy, "FROGE".into(), 4_000, "x".into());
    ctx("trader", near(50), 2_000);
    c.stake(id, Side::Yes, None, None);
}

#[test]
#[should_panic(expected = "This market is closed")]
fn cannot_stake_after_close() {
    let mut c = vault();
    ctx("trader", near(0), 1_000);
    let id = c.propose(Action::Buy, "FROGE".into(), 4_000, "x".into());
    ctx("alice", near(1), 1_000 + MIN);
    c.stake(id, Side::No, None, None);
}

#[test]
#[should_panic(expected = "Stake is below the minimum")]
fn stake_below_minimum_is_refused() {
    let mut c = vault();
    ctx("trader", near(0), 1_000);
    let id = c.propose(Action::Buy, "FROGE".into(), 4_000, "x".into());
    ctx("alice", NearToken::from_millinear(10), 2_000);
    c.stake(id, Side::No, None, None);
}

#[test]
#[should_panic(expected = "The market has not closed yet")]
fn cannot_resolve_early() {
    let mut c = vault();
    ctx("trader", near(0), 1_000);
    let id = c.propose(Action::Buy, "FROGE".into(), 4_000, "x".into());
    ctx("anyone", near(0), 2_000);
    c.resolve(id);
}

#[test]
#[should_panic(expected = "Another trade is still under review")]
fn one_market_at_a_time() {
    let mut c = vault();
    ctx("trader", near(0), 1_000);
    c.propose(Action::Buy, "FROGE".into(), 4_000, "x".into());
    c.propose(Action::Buy, "BTC".into(), 300, "y".into());
}

#[test]
#[should_panic(expected = "Only the manager can do this")]
fn only_manager_proposes() {
    let mut c = vault();
    ctx("alice", near(0), 1_000);
    c.propose(Action::Buy, "BTC".into(), 300, "y".into());
}

#[test]
#[should_panic(expected = "Already claimed")]
fn cannot_claim_twice() {
    let mut c = vault();
    ctx("trader", near(0), 1_000);
    let id = c.propose(Action::Buy, "FROGE".into(), 4_000, "x".into());
    ctx("alice", near(2), 2_000);
    c.stake(id, Side::No, None, None);
    ctx("anyone", near(0), 1_000 + MIN);
    c.resolve(id);
    ctx("owner", near(0), 1_000 + MIN + 1);
    c.set_price("FROGE".into(), U128(5_000));
    ctx("anyone", near(0), 1_000 + 2 * MIN);
    c.settle(id);
    ctx("alice", near(0), 1_000 + 2 * MIN + 1);
    let _ = c.claim(id);
    let _ = c.claim(id);
}

/* ---------- verified AI verdicts ---------- */
// The fixture is one real call to NEAR AI Cloud, captured with its enclave signature.
// The request names market 0 on litmus.testnet for alice.testnet and quotes "Up 60% today".

const REQUEST: &str = include_str!("fixtures/request.json");
const RESPONSE: &str = include_str!("fixtures/response.json");
const MODEL: &str = "deepseek-ai/DeepSeek-V4.1-Flash-1017";
const KEY: &str = "236f5a6b91dd47dc3b7b36e43d4eb531a042ffb8f8fbf3a1555b78cef4fdda4c";

fn signature() -> String {
    let proof: near_sdk::serde_json::Value = near_sdk::serde_json::from_str(include_str!("fixtures/proof.json")).unwrap();
    proof["signature"].as_str().unwrap().to_string()
}
fn proof() -> ProofInput {
    ProofInput { model: MODEL.into(), request: REQUEST.into(), response: RESPONSE.into(), signature: signature(), signing_key: KEY.into() }
}
/// A vault with the enclave key registered and market 0 open on the fixture's trade.
fn court() -> Litmus {
    let mut c = vault();
    ctx("owner", near(0), 500);
    c.register_tee_key(MODEL.into(), KEY.into());
    ctx("trader", near(0), 1_000);
    assert_eq!(c.propose(Action::Buy, "FROGE".into(), 4_000, "Up 60% today".into()), 0);
    c
}

#[test]
fn verified_verdict_is_accepted_and_the_note_is_the_models() {
    let mut c = court();
    ctx("alice", near(1), 2_000);
    c.stake(0, Side::No, Some("liquidity: whatever the caller typed".into()), Some(proof()));
    let s = &c.get_stakes(0)[0];
    let p = s.proof.as_ref().unwrap();
    assert_eq!(p.signing_key, KEY);
    assert_eq!(p.model, MODEL);
    assert_eq!(p.request_hash.len(), 64);
    let note = s.note.as_deref().unwrap();
    assert!(note.starts_with("liquidity: ") && note.len() > 30, "{note}");
    assert!(!note.contains("whatever the caller typed"));
}

#[test]
#[should_panic(expected = "The stake does not match the model's verdict")]
fn cannot_stake_against_the_models_verdict() {
    let mut c = court();
    ctx("alice", near(1), 2_000);
    c.stake(0, Side::Yes, None, Some(proof()));
}

#[test]
#[should_panic(expected = "The enclave signature does not match this request and response")]
fn edited_answer_is_rejected() {
    let mut c = court();
    ctx("alice", near(1), 2_000);
    let mut p = proof();
    p.response = p.response.replace("\\\"No\\\"", "\\\"Yes\\\"");
    assert_ne!(p.response, RESPONSE);
    c.stake(0, Side::Yes, None, Some(p));
}

#[test]
#[should_panic(expected = "The request does not name this market and this juror")]
fn another_account_cannot_reuse_the_proof() {
    let mut c = court();
    ctx("bob", near(1), 2_000);
    c.stake(0, Side::No, None, Some(proof()));
}

#[test]
#[should_panic(expected = "This enclave key is not registered for this model")]
fn unregistered_key_is_rejected() {
    let mut c = vault();
    ctx("trader", near(0), 1_000);
    c.propose(Action::Buy, "FROGE".into(), 4_000, "Up 60% today".into());
    ctx("alice", near(1), 2_000);
    c.stake(0, Side::No, None, Some(proof()));
}

#[test]
#[should_panic(expected = "The request does not quote the manager's reason")]
fn proof_for_a_different_reason_is_rejected() {
    let mut c = vault();
    ctx("owner", near(0), 500);
    c.register_tee_key(MODEL.into(), KEY.into());
    ctx("trader", near(0), 1_000);
    c.propose(Action::Buy, "FROGE".into(), 4_000, "A completely different pitch".into());
    ctx("alice", near(1), 2_000);
    c.stake(0, Side::No, None, Some(proof()));
}
