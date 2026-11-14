# Litmus

A vault on NEAR where a risky trade only executes if a jury of AI agents clears it. Each juror stakes its own NEAR, and the contract verifies that each verdict really came from the model, using the signature NEAR AI Cloud's enclave puts on every answer.

Built at NEAR HACKATHON 2026. Tracks: AI Swarms, AI Security, Agent Economy, Unstoppable DeFi. Testnet only.

Live contract: [`litmus-jury.testnet`](https://testnet.nearblocks.io/address/litmus-jury.testnet)

## The problem

When an AI agent (or a person) trades a shared pot, the usual protections are fixed limits, which cannot tell a sensible large trade from a reckless one, or votes, where voters risk nothing.

Litmus sends only the risky trades to a small market. A swarm of jury agents each judges the trade its own way and stakes NEAR on YES or NO, with a one-line reason stored on chain. Jurors who were wrong pay those who were right. If a blocked trade would have lost money, the manager's bond is paid to the jurors who stopped it.

## Try it

Each step says what to run and what you should see. Steps 1 to 4 need no keys and no wallet.

**1. The contract's tests** (needs Rust 1.95+)

```bash
cd contract && cargo test
```

You see 19 tests pass: propose, instant pass, stake, verdict, settle, claim, bond slash and the refusals. Six of them check verified verdicts against a real enclave-signed answer captured from NEAR AI Cloud (`contract/src/fixtures/`): the genuine one is accepted, and an edited answer, a stake on the other side, another account, another trade and an unregistered key are all refused.

**2. The agents, without touching a chain** (needs Node 22+)

```bash
node agents/trader.mjs --dry-run
```

You see three proposals and each juror's stake and reason. Round 1 passes with no market, round 2 is approved, round 3 (40% of the pot in a memecoin) is blocked, and the last line reads `Story holds`. With no model key the agents use their fixed rules; with `LLM_API_KEY` in `agents/.env` a model writes every proposal and every verdict.

**3. The replay over real prices**

```bash
node scripts/replay.mjs
```

You see drawdown and final-pot statistics for 1,000 simulated traders with and without Litmus, and `web/public/replay.json` is rewritten. It reads a price snapshot kept in the repo, so it needs no network and prints the same numbers every time.

**4. The app**

```bash
cd web && pnpm install && cp .env.example .env.local && pnpm dev
```

Open http://localhost:3000/app. You see the live vault and the docket of past trades read from the testnet contract, with a "Live" badge. Press **Run demo**: with no agents running it plays a recorded run (the badge changes to "Recorded run"), ending on a blocked trade and what it would have cost. `/replay` shows the simulation from step 3 and `/how` explains the mechanism.

**5. A real run on testnet** (needs the `near` CLI and your own accounts)

```bash
scripts/deploy-testnet.sh <suffix>
```

This creates six testnet accounts, deploys the contract and prints what to put in `agents/.env` and `web/.env.local`. Copy `agents/.env.example` to `agents/.env` first. A model key there is optional: without one the agents use their fixed rules and stake without a proof. Then, in two terminals from the project root:

```bash
node agents/jury.mjs
```

```bash
node agents/trader.mjs --serve
```

Press **Run demo** in the app. Over about four minutes you see three trades proposed, the four jurors stake with their reasons as each transaction lands, an approved trade settle on the live market price, and the memecoin trade blocked and settled.

## How a trade is judged

1. **Propose.** The manager proposes a trade as a share of the pot. Under 5% in an asset the vault already holds, it executes at once.
2. **Stake.** Otherwise a 75-second market opens. Each juror asks its model, then stakes NEAR on YES or NO with the model's signed answer attached. The contract verifies it (next section) and stores the model's reason. Anyone else can stake too, without a proof. The manager cannot.
3. **Verdict.** At the close the larger side wins. A tie, or no stakes, blocks.
4. **Settle.** After a short window, the price move since the quote decides which side was right. They get their stake back plus the other side's stakes, split by stake size.

## Verdicts the contract can check

An AI juror cannot just claim what its model said. NEAR AI Cloud runs its open models inside a secure enclave and signs `"{model}:{sha256(request)}:{sha256(response)}"` for every call. A juror sends the exact request, the exact response and that signature with its stake, and the contract (`verify_proof` in `contract/src/lib.rs`):

1. checks the signing key is one registered for that model,
2. hashes the request and response itself and verifies the ed25519 signature over them,
3. checks the request names this contract, this market and this juror, and quotes the manager's reason, so an answer cannot be reused elsewhere,
4. reads YES or NO from the model's own answer and refuses a stake on the other side. The reason it stores is the model's.

Only the hashes, signature and key are kept on chain. `get_stakes` returns them with each stake, and the app marks those stakes "Verified on chain".

What this does not prove: the contract owner registers the enclave's key from NEAR AI's attestation report, and the hardware quote inside that report is checked off chain (NEAR AI publishes a verifier for it). The contract also does not pin the full wording of the prompt, only the parts listed in step 3.

## The jury

| Juror | Judges only | Fallback rule when no model is set |
|---|---|---|
| Sizer | How much of the pot is at risk | Block above 25% of the pot |
| Liquidity | Whether the asset can be sold again | Block assets that are new or not a major |
| Sceptic | The manager's stated reason | Block reasons that chase a price move |
| Momentum | Whether the asset is moving up | Always back it |

Each juror is a separate NEAR account with its own key and balance. Momentum is usually the one that loses its stake, which is what pays the others.

## What is real and what is simulated

| Real, on NEAR testnet | Simulated |
|---|---|
| The contract and every rule in it | The vault's holdings: numbers in the contract, not tokens |
| Every stake, payout, claim and bond slash, in testnet NEAR | The swap: the contract updates those numbers |
| The jurors' and the trader's decisions, from a model on NEAR AI Cloud, with each juror verdict verified on chain | FROGE: a made-up token whose 31% fall is scripted, for the "bad trade" round |
| Prices and settlement for BTC, ETH, SOL and NEAR, read from the live market | The three-round shape of the demo: each round gives the trader's model a brief |

## What the replay shows

Over 124 days of real prices (13 July to 13 November 2026) and 1,000 random traders, the fixed-rule jury cut the typical worst drawdown from 5.6% to 2.2%, and the bad-case one (1 trader in 20) from 10.9% to 4.5%. It also blocked trades that would have paid, so the typical trader ended with slightly less ($10,159 against $10,321), and only 44% ended ahead. Litmus limits risk. It does not pick winners.

## Known limits

- Verified verdicts trust the owner to register the right enclave key, and do not pin the whole prompt (see above).
- A thin market is cheap to capture. The manager is barred from staking, but a second account is not. A real version needs total stake to scale with trade size.
- Settlement uses a short price window, which rewards luck as well as judgement.
- One market at a time, and one vault.
- A model call can time out. The agent then falls back to its fixed rule for that decision, and a juror that falls back stakes without a proof.
- So the demo can be repeated, the keeper has the richest juror top up any demo account that runs low on testnet NEAR. A real deployment would not move money between jurors.
- A contract cannot know its own transaction hash, so docket rows link to the contract's explorer page, not to each transaction.

## What is in here

| Folder | What it is |
|---|---|
| `contract/` | The NEAR contract (Rust, near-sdk 5.30): vault ledger, markets, stakes, bond, payouts |
| `agents/` | The jury, the trader and the keeper. Plain Node, no npm dependencies. Writes are signed through the `near` CLI |
| `web/` | The Next.js app: landing page, courtroom, replay, how it works |
| `scripts/` | Testnet deploy, the replay simulation and its price snapshot |

## How NEAR fits in

- A NEAR smart contract in Rust (near-sdk), deployed on testnet
- One NEAR named account per agent, each signing its own transactions
- NEAR AI Cloud's enclave (TEE) inference: every juror verdict carries the enclave's ed25519 signature, which the contract checks with `env::ed25519_verify` (open model `deepseek-ai/DeepSeek-V4.1-Flash-1017`)
- NEAR Connect (`@hot-labs/near-connect`) for human wallets
- near-cli-rs for deployment and agent transactions

## Disclosures

- **When it was written.** Everything in this repository was written inside the hackathon window, between 27 October and 14 November 2026. There is no pre-hackathon code, and this is not an existing product from another chain.
- **An earlier idea.** The app's design system (colour tokens, buttons, panels, the sidebar shell) was first written in the same window for a different idea, and was kept when the project became Litmus. The contract, the agents and every NEAR integration were written for Litmus.
- **AI-generated code.** Most of the code in this repository was written with Claude Code, an AI coding assistant, directed, tested and reviewed by the author. The product also calls a language model at run time, as described above.
- **Other entries.** This is the author's only entry in the hackathon.
- **Libraries.** near-sdk (Rust), Next.js, React, Tailwind CSS and `@hot-labs/near-connect`. The agents and scripts use only Node's standard library and the `near` CLI.
- **Assets and data.** Coin icons are from cryptocurrency-icons (CC0). The replay's price snapshot is public daily price data from Binance.
- **Boilerplate.** The web app started from Create Next App.

## Licence

MIT. See [LICENSE](LICENSE).
