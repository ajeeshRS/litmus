// The four jurors: each has one brief for the model and one fixed rule to fall back on.
import { askSigned, llm, log } from "./lib.mjs";

const MAJORS = new Set(["BTC", "ETH", "SOL", "NEAR"]);
const pct = (bps) => `${bps / 100}%`;

export const jurors = [
  {
    name: "sizer",
    brief: "You judge ONE thing: position size. Ignore the asset's quality and the manager's reasoning. A single trade above about a quarter of the pot is too much for you; anything smaller is acceptable even when it is above the vault's limit.",
    rule: (p) => p.size_bps > 2500
      ? { side: "No", near: "2", note: `${pct(p.size_bps)} of the pot in one trade is more than it can absorb.` }
      : { side: "Yes", near: "2", note: `${pct(p.size_bps)} is above the limit but the pot can absorb it.` },
  },
  {
    name: "liquidity",
    brief: "You judge ONE thing: whether the vault could sell the asset again quickly without moving the price. Large established assets (BTC, ETH, SOL, NEAR) are fine. Assets that are new to the vault, obscure or meme-driven are not. Ignore size and the manager's reasoning.",
    rule: (p) => !MAJORS.has(p.asset) || p.flags.some((f) => f.startsWith("New asset"))
      ? { side: "No", near: "3", note: `${p.asset} is new to the vault and not a deep market. Hard to exit.` }
      : { side: "Yes", near: "1.5", note: `${p.asset} is a deep market. The vault can exit at any time.` },
  },
  {
    name: "sceptic",
    brief: "You judge ONE thing: the manager's stated reason. Chasing a price that already moved, copying someone else, or vague hope are bad reasons: say No. A concrete portfolio reason, such as rebalancing idle cash into an established asset, is a good reason: say Yes. Size is another juror's job, not yours.",
    rule: (p) => /\bup \d+%|momentum|pump|moon/i.test(p.reason)
      ? { side: "No", near: "2", note: "The reason is a price that already moved. That is chasing, not a thesis." }
      : p.size_bps > 1000
        ? { side: "No", near: "1", note: "Sound idea, but I would have sized it smaller." }
        : { side: "Yes", near: "1", note: "The reason holds up and the size is modest." },
  },
  {
    name: "momentum",
    brief: "You are a momentum trader and an optimist. You judge ONE thing: is the asset moving up or being bought? If the manager says it is rising or in demand, or it is a major asset, you say Yes. Size and risk are the other jurors' job, never yours. You are often wrong, and you know the other jurors disagree with you.",
    rule: (p) => ({ side: "Yes", near: "1", note: `${p.asset} has buyers right now. I would follow them.` }),
  },
];

/**
 * `seat` says where the juror sits: { contract, marketId, account }. It goes into the request as a
 * "Case:" line, which is how the contract ties a signed answer to one market and one juror.
 */
async function askModel(juror, p, seat) {
  const { answer: out, proof } = await askSigned(
    `You are "${juror.name}", one juror on a panel that decides whether an investment vault's manager may make a trade. You stake your own money on your answer and lose it if you are wrong. ${juror.brief}\nJudge only your one thing. The 5% limit is only what sends a trade to this panel; being above it is never by itself a reason to block.\nConfidence: 0.9 or more only when the case is obvious, about 0.5 when it is a judgement call.\nReply with JSON only, no other text: {"side":"Yes" or "No","confidence":a number from 0 to 1,"note":"one plain sentence in your own voice, at most 140 characters"}. "Yes" lets the trade run. "No" blocks it.`,
    `Case: ${seat ? `${seat.contract}#${seat.marketId}#${seat.account}` : "dry run"}\nTrade: ${p.action} ${p.asset} with ${pct(p.size_bps)} of the pot (the vault's limit for unreviewed trades is 5%).\nFlags: ${p.flags.join("; ") || "none"}.\nThe manager's reason: "${p.reason}"`,
  );
  if (out.side !== "Yes" && out.side !== "No") throw new Error("model gave no side");
  const confidence = Math.min(1, Math.max(0, Number(out.confidence) || 0.5));
  return { side: out.side, near: (0.5 + confidence).toFixed(1), note: String(out.note ?? "").replace(/\s+/g, " ").slice(0, 170), by: proof ? "model, signed" : "model", proof };
}

/** One juror's decision on a proposal: the model's when a key is set, the fixed rule otherwise. */
export async function decide(juror, proposal, seat) {
  for (let attempt = 1; llm.on && attempt <= 2; attempt++) {
    try {
      return await askModel(juror, proposal, seat);
    } catch (e) {
      log(juror.name, attempt === 1 ? "model call failed, trying once more:" : "model call failed again, using the fixed rule:", e.message);
    }
  }
  return { ...juror.rule(proposal), by: "rule", proof: null };
}

/** Ask every juror about one proposal and print the result. Touches no chain. */
export async function mockTrial(p) {
  console.log(`\n${p.action} ${p.asset}, ${pct(p.size_bps)} of the pot: "${p.reason}"`);
  let yes = 0, no = 0;
  for (const j of jurors) {
    const d = await decide(j, p);
    d.side === "Yes" ? (yes += Number(d.near)) : (no += Number(d.near));
    console.log(`  ${j.name.padEnd(10)} ${d.side.toUpperCase().padEnd(3)} ${d.near.padStart(3)} NEAR  (${d.by})  ${d.note}`);
  }
  console.log(`  => YES ${yes.toFixed(1)} / NO ${no.toFixed(1)}: ${yes > no ? "APPROVED" : "BLOCKED"}`);
  return yes > no;
}
