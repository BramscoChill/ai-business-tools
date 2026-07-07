// Proof script for Demo 3 (grounded chatbot).
// Run with: npm run test-grounding   (needs `npm run dev` running in another terminal)
//
// Fires the demo's preset questions at BOTH chatbot modes and prints a table
// showing that the naive bot answers out-of-scope questions from general
// knowledge while the grounded bot correctly declines — and that the grounded
// bot still answers the in-scope ones. Exits non-zero when the contrast the
// demo relies on doesn't hold.
import { createHash, createHmac, randomInt } from "node:crypto";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

const QUESTIONS = [
  { question: "What filter models do you sell?", inScope: true },
  { question: "How often do I replace the cartridge?", inScope: true },
  { question: "My system is leaking, what do I do?", inScope: true },
  { question: "What do you think of Brita filters?", inScope: false },
  { question: "How do I remove limescale from my kettle?", inScope: false },
  { question: "Can you recommend a plumber in Amsterdam?", inScope: false },
];

/* ---------- mint a verification pass ----------
 * The /api/grounded-chat route requires the human-check pass. This script runs
 * on the same machine as the server and reads the same secret from .env, so it
 * can sign a pass itself — exactly what a remote caller cannot do. Mirrors
 * lib/humancheck.ts. */

function mintPass() {
  const secret =
    process.env.CAPTCHA_SECRET ||
    (process.env.ANTHROPIC_API_KEY
      ? createHash("sha256")
          .update(`humancheck:${process.env.ANTHROPIC_API_KEY}`)
          .digest("hex")
      : null);
  if (!secret) {
    console.error("Set ANTHROPIC_API_KEY (or CAPTCHA_SECRET) in .env.local first.");
    process.exit(1);
  }
  const nonce = Buffer.from(Array.from({ length: 9 }, () => randomInt(256))).toString("base64url");
  const exp = Date.now() + 5 * 60 * 1000;
  const sig = createHmac("sha256", secret).update(`pass|${nonce}|${exp}`).digest("base64url");
  return `${nonce}.${exp}.${sig}`;
}

/* ---------- helpers ---------- */

async function ask(pass, question, mode) {
  const res = await fetch(`${BASE_URL}/api/grounded-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-verify-pass": pass },
    body: JSON.stringify({ message: question, mode }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || typeof body?.answer !== "string") {
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return body;
}

// The grounded fallback (and any honest refusal or deflection) refers the
// customer elsewhere; a real answer to these questions never does.
function declined(answer) {
  return /contact our support team|don'?t have that information|do not have that information|(specifically|only) here to help|can'?t (help|answer|assist)|unable to (help|answer|assist)/i.test(
    answer,
  );
}

function cell(answered, ok) {
  return `${answered ? "answered" : "declined"} ${ok ? "✅" : "❌"}`;
}

/* ---------- run ---------- */

try {
  await fetch(BASE_URL, { method: "HEAD" });
} catch {
  console.error(`No server at ${BASE_URL} — start it with: npm run dev`);
  process.exit(1);
}

const pass = mintPass();
console.log(`Asking ${QUESTIONS.length} questions × 2 modes against ${BASE_URL} …\n`);

let failures = 0;
const width = Math.max(...QUESTIONS.map((q) => q.question.length));

console.log(`${"QUESTION".padEnd(width)} | SCOPE | NAIVE BOT   | GROUNDED BOT | TOP SCORE`);
console.log("-".repeat(width + 50));

for (const { question, inScope } of QUESTIONS) {
  const [naive, grounded] = await Promise.all([
    ask(pass, question, "naive"),
    ask(pass, question, "grounded"),
  ]);

  const naiveAnswered = !declined(naive.answer);
  const groundedAnswered = !declined(grounded.answer);
  // The demo's contrast: naive always answers; grounded answers in-scope only.
  const naiveOk = naiveAnswered;
  const groundedOk = groundedAnswered === inScope;
  if (!naiveOk || !groundedOk) failures++;

  console.log(
    `${question.padEnd(width)} | ${inScope ? "in " : "OUT"}   | ` +
      `${cell(naiveAnswered, naiveOk)} | ${cell(groundedAnswered, groundedOk)}  | ` +
      `${naive.debug.topScore.toFixed(2)} (threshold ${grounded.debug.thresholdPassed ? "passed" : "failed"})`,
  );

  if (!inScope && naiveAnswered) {
    console.log(
      `${"".padEnd(width)} |   naive bot said: "${naive.answer.replace(/\s+/g, " ").slice(0, 100)}…"`,
    );
  }
  if (!naiveOk || !groundedOk) {
    console.log(`${"".padEnd(width)} |   ⚠ naive: "${naive.answer.replace(/\s+/g, " ").slice(0, 120)}"`);
    console.log(`${"".padEnd(width)} |   ⚠ grounded: "${grounded.answer.replace(/\s+/g, " ").slice(0, 120)}"`);
  }
}

console.log(
  failures === 0
    ? "\nAll questions behaved as intended: the naive bot answered everything, the grounded bot only answered questions covered by the docs."
    : `\n${failures} question(s) did NOT show the intended contrast — tune GROUNDING_THRESHOLD or the prompts in lib/prompts.ts.`,
);
process.exit(failures === 0 ? 0 : 1);
