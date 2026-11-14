#!/usr/bin/env bash
# Creates the testnet accounts, deploys the contract and seeds the mock vault.
# Usage: scripts/deploy-testnet.sh <suffix>     e.g. scripts/deploy-testnet.sh ajx7
# Accounts created (each funded by the testnet faucet): litmus-<suffix>, trader-<suffix>,
# sizer-<suffix>, liq-<suffix>, sceptic-<suffix>, momo-<suffix> (all .testnet).
# Keys are saved to ~/.near-credentials/testnet. Testnet only: no real funds.
set -euo pipefail
S="${1:?give a short unique suffix, e.g. ajx7}"
C="litmus-$S.testnet"; T="trader-$S.testnet"
JURORS=("sizer-$S.testnet" "liq-$S.testnet" "sceptic-$S.testnet" "momo-$S.testnet")
cd "$(dirname "$0")/.."

CONTRACT_DIR=contract; [ -d "$CONTRACT_DIR" ] || CONTRACT_DIR=agents/contract
(cd "$CONTRACT_DIR" && cargo build --target wasm32-unknown-unknown --release)
WASM="$CONTRACT_DIR/target/wasm32-unknown-unknown/release/litmus.wasm"

for A in "$C" "$T" "${JURORS[@]}"; do
  near account create-account sponsor-by-faucet-service "$A" autogenerate-new-keypair save-to-legacy-keychain network-config testnet create || echo "(could not create $A: if it already exists and its key is on this machine, that is fine)"
  sleep 2
done

# 5% limit, 0.1 NEAR minimum stake, 2 NEAR bond, 75 s market, 15 s settlement window.
# The trader registers the enclave key for verified verdicts at the start of its first run.
near contract deploy "$C" use-file "$WASM" with-init-call new json-args \
  "{\"manager\":\"$T\",\"manager_kind\":\"Scripted\",\"threshold_bps\":500,\"min_stake\":\"100000000000000000000000\",\"bond_required\":\"2000000000000000000000000\",\"market_duration_ms\":75000,\"settle_window_ms\":15000}" \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send

call() { near contract call-function as-transaction "$C" "$1" json-args "$2" prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as "$C" network-config testnet sign-with-legacy-keychain send; }
call seed_holding '{"asset":"USDC","amount":"6000000000","decimals":6}'
call seed_holding '{"asset":"NEAR","amount":"1600000000000000000000000000","decimals":24}'
call seed_holding '{"asset":"BTC","amount":"0","decimals":8}'
call seed_holding '{"asset":"ETH","amount":"0","decimals":18}'
call set_price '{"asset":"NEAR","price_usd":"2500000"}'
call set_price '{"asset":"BTC","price_usd":"100000000000"}'
call set_price '{"asset":"ETH","price_usd":"3500000000"}'
call set_price '{"asset":"FROGE","price_usd":"8700"}'

J=$(IFS=,; echo "${JURORS[*]}")
cat <<DONE

Deployed. Next:

  echo "NEXT_PUBLIC_CONTRACT_ID=$C" > web/.env.local
  echo "NEXT_PUBLIC_DEMO_TRIGGER_URL=http://localhost:8787" >> web/.env.local

  # put these three lines in agents/.env (keep your LLM_API_KEY line):
  CONTRACT_ID=$C
  MANAGER=$T
  JURORS=$J

  node agents/jury.mjs
  node agents/trader.mjs --serve
DONE
