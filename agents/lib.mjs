// Shared helpers for the Litmus agents. No npm dependencies: reads go straight to the RPC,
// writes go through the `near` CLI (near-cli-rs), signed with keys from ~/.near-credentials.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Settings and the model key live in agents/.env (git-ignored). Real environment variables win.
const envFile = fileURLToPath(new URL("./.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

export const cfg = {
  contract: process.env.CONTRACT_ID ?? "",
  rpc: process.env.RPC_URL ?? "https://rpc.testnet.fastnear.com",
  sign: process.env.SIGN ?? "sign-with-legacy-keychain",
};
export function needContract() {
  if (cfg.contract) return;
  console.error("Set CONTRACT_ID, for example: CONTRACT_ID=litmus-demo.testnet");
  process.exit(1);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const log = (who, ...msg) => console.log(`${new Date().toISOString().slice(11, 19)} [${who}]`, ...msg);

// Public RPCs rate-limit, so reads rotate through a few and retry.
const rpcs = [...new Set([cfg.rpc, "https://near-testnet.drpc.org", "https://test.rpc.fastnear.com"])];

export async function view(method, args = {}) {
  let last;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(rpcs[attempt % rpcs.length], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "query",
          params: { request_type: "call_function", finality: "optimistic", account_id: cfg.contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") },
        }),
      });
      const json = await res.json();
      if (json.error || json.result?.error) throw new Error(JSON.stringify(json.error ?? json.result.error));
      return JSON.parse(Buffer.from(json.result.result).toString());
    } catch (e) {
      last = e;
      await sleep(500 + attempt * 400);
    }
  }
  throw last;
}

/** Send a change call. `deposit` is in NEAR, as a decimal string. Retries once on a transport error. */
export async function call(signer, method, args = {}, deposit = "0") {
  try {
    return await send(signer, method, args, deposit);
  } catch (e) {
    if (e.contract) throw e; // the contract said no: retrying will not change that
    await sleep(2500);
    return send(signer, method, args, deposit);
  }
}

function send(signer, method, args, deposit) {
  const argv = ["contract", "call-function", "as-transaction", cfg.contract, method, "json-args", JSON.stringify(args), "prepaid-gas", "100 Tgas", "attached-deposit", `${deposit} NEAR`, "sign-as", signer, "network-config", "testnet", cfg.sign, "send"];
  return new Promise((resolve, reject) => {
    execFile("near", argv, { timeout: 60_000, env: { ...process.env, NO_COLOR: "1" } }, (err, stdout, stderr) => {
      const out = `${stdout}\n${stderr}`.replace(/\x1b\[[0-9;]*m/g, "");
      const panic = /Smart contract panicked: ([^\n"]+)/.exec(out);
      if (panic) return reject(Object.assign(new Error(panic[1].trim()), { contract: true }));
      if (err) return reject(new Error(`${method} as ${signer} failed: ${out.trim().split("\n").filter((l) => /error|fail|invalid|nonce|timeout/i.test(l)).slice(0, 2).join(" | ") || err.message}`));
      resolve(out);
    });
  });
}

/** An account's testnet balance, in NEAR. */
export async function balance(account) {
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(rpcs[attempt % rpcs.length], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "view_account", finality: "optimistic", account_id: account } }),
      });
      return Number(BigInt((await res.json()).result.amount) / 10n ** 21n) / 1000;
    } catch (e) {
      last = e;
      await sleep(600);
    }
  }
  throw last;
}

/** Plain testnet NEAR transfer between two of the demo's own accounts. */
export function transfer(from, to, near) {
  const argv = ["tokens", from, "send-near", to, `${near} NEAR`, "network-config", "testnet", cfg.sign, "send"];
  return new Promise((resolve, reject) => {
    execFile("near", argv, { timeout: 60_000, env: { ...process.env, NO_COLOR: "1" } }, (err, stdout, stderr) => (err ? reject(new Error(`transfer from ${from} failed: ${`${stdout}\n${stderr}`.trim().split("\n").slice(-2).join(" ")}`)) : resolve(stdout)));
  });
}

/** Whole-unit USD price -> the contract's micro-USD string. */
export const usd = (n) => String(Math.round(n * 1e6));

/* ---------- language model (any OpenAI-compatible endpoint; default NEAR AI Cloud) ---------- */

export const llm = {
  on: Boolean(process.env.LLM_API_KEY),
  model: process.env.LLM_MODEL ?? "deepseek-ai/DeepSeek-V4.1-Flash-1017",
};

const llmBase = () => process.env.LLM_BASE_URL ?? "https://cloud-api.near.ai/v1";
const llmHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${process.env.LLM_API_KEY}` });

/**
 * Ask for a JSON object, and bring back the proof that the answer came from the model.
 *
 * NEAR AI Cloud runs its open models inside an enclave (TEE) and signs
 * "{model}:{sha256(request body)}:{sha256(response body)}" with a key bound to that enclave.
 * `proof` holds the two exact bodies and that signature, which the Litmus contract checks on chain.
 * `proof` is null when the endpoint offers no signature (another provider, or a model outside the enclave).
 */
export async function askSigned(system, user) {
  const request = JSON.stringify({ model: llm.model, temperature: 0.2, max_tokens: 1500, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
  const res = await fetch(`${llmBase()}/chat/completions`, { method: "POST", headers: llmHeaders(), signal: AbortSignal.timeout(30_000), body: request });
  if (!res.ok) throw new Error(`model endpoint answered ${res.status}`);
  const response = await res.text(); // the exact bytes: re-serialising would change the hash
  const body = JSON.parse(response);
  const text = body.choices?.[0]?.message?.content ?? "";
  const answer = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  let proof = null;
  try {
    const sig = await (await fetch(`${llmBase()}/signature/${body.id}?model=${encodeURIComponent(llm.model)}&signing_algo=ed25519`, { headers: llmHeaders(), signal: AbortSignal.timeout(15_000) })).json();
    if (sig.signature && sig.signing_algo === "ed25519") proof = { model: llm.model, request, response, signature: sig.signature.replace(/^0x/, ""), signing_key: sig.signing_address.replace(/^0x/, "") };
  } catch { /* no signature available: the caller stakes without a proof */ }
  return { answer, proof };
}

/** The enclave signing keys NEAR AI Cloud currently attests for the model (ed25519, hex). */
export async function attestedKeys() {
  const res = await fetch(`${llmBase()}/attestation/report?model=${encodeURIComponent(llm.model)}&signing_algo=ed25519`, { headers: llmHeaders(), signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`attestation endpoint answered ${res.status}`);
  const report = await res.json();
  return (report.model_attestations ?? []).filter((m) => m.signing_algo === "ed25519" && m.signing_address).map((m) => m.signing_address.replace(/^0x/, "").toLowerCase());
}

/** Ask for a JSON object. Throws on a failed call or an unreadable answer. */
export async function askJSON(system, user) {
  return (await askSigned(system, user)).answer;
}
