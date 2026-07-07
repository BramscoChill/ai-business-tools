import { createHash, createHmac, randomInt } from "crypto";

// Server-side only — never import this from a client component.
//
// Human-verification gate for the AI endpoints. A challenge is a distorted
// SVG code plus an HMAC-signed token; the answer never leaves the server in
// readable form. A correct answer is exchanged for a short-lived signed
// "pass" that the processing routes require, so the raw API URLs are useless
// to anyone who scrapes them.

const CODE_LENGTH = 5;
// Digits only, no 0/1 (they render ambiguously in the segment display).
const CODE_ALPHABET = "23456789";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const PASS_TTL_MS = 5 * 60 * 1000;
// A wrong answer needs a fresh challenge after this many tries.
const MAX_ANSWER_ATTEMPTS = 5;
// One pass covers one processing action: a triage batch (20 emails) plus retries.
const MAX_PASS_USES = 30;

// Prefer a dedicated secret; fall back to a hash derived from the API key so
// the gate works with zero extra config (the derivation is one-way).
const SECRET =
  process.env.CAPTCHA_SECRET ||
  (process.env.ANTHROPIC_API_KEY
    ? createHash("sha256").update(`humancheck:${process.env.ANTHROPIC_API_KEY}`).digest("hex")
    : // Last resort (no env at all): per-process secret. Fine in dev; on
      // multi-instance hosts tokens then only verify on the issuing instance.
      createHash("sha256").update(`humancheck:${Math.random()}:${Date.now()}`).digest("hex"));

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

// Length-normalizing timing-safe comparison.
function digestsMatch(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return ha.equals(hb);
}

/* ---------- best-effort replay/attempt tracking ----------
 * In-memory, so per serverless instance — not bulletproof, but combined with
 * the short TTLs it keeps a leaked token/pass from being farmed. */

const challengeState = new Map<string, { attempts: number; exchanged: boolean; exp: number }>();
const passUses = new Map<string, { uses: number; exp: number }>();

function prune(map: Map<string, { exp: number }>) {
  if (map.size < 200) return;
  const now = Date.now();
  for (const [k, v] of map) if (v.exp < now) map.delete(k);
}

/* ---------- challenge ---------- */

export function createChallenge(): { token: string; svg: string } {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  const nonce = Buffer.from(Array.from({ length: 9 }, () => randomInt(256))).toString("base64url");
  const exp = Date.now() + CHALLENGE_TTL_MS;
  const sig = sign(`challenge|${nonce}|${exp}|${code}`);
  return { token: `${nonce}.${exp}.${sig}`, svg: renderCaptchaSvg(code) };
}

export type RedeemResult = { ok: true; pass: string } | { ok: false; error: string };

export function redeemChallenge(token: unknown, answer: unknown): RedeemResult {
  const stale = { ok: false, error: "This code has expired — try the new one." } as const;
  if (typeof token !== "string" || typeof answer !== "string") return stale;

  const [nonce, expRaw, sig] = token.split(".");
  const exp = Number(expRaw);
  if (!nonce || !sig || !Number.isFinite(exp) || exp < Date.now()) return stale;

  prune(challengeState);
  const state = challengeState.get(nonce) ?? { attempts: 0, exchanged: false, exp };
  if (state.exchanged || state.attempts >= MAX_ANSWER_ATTEMPTS) return stale;

  const normalized = answer.replace(/\D/g, "");
  if (!digestsMatch(sign(`challenge|${nonce}|${exp}|${normalized}`), sig)) {
    state.attempts += 1;
    challengeState.set(nonce, state);
    return { ok: false, error: "That code didn't match — try this new one." };
  }

  state.exchanged = true;
  challengeState.set(nonce, state);
  const passExp = Date.now() + PASS_TTL_MS;
  return { ok: true, pass: `${nonce}.${passExp}.${sign(`pass|${nonce}|${passExp}`)}` };
}

/* ---------- pass ---------- */

export function verifyPass(pass: string | null): boolean {
  if (!pass) return false;
  const [nonce, expRaw, sig] = pass.split(".");
  const exp = Number(expRaw);
  if (!nonce || !sig || !Number.isFinite(exp) || exp < Date.now()) return false;
  if (!digestsMatch(sign(`pass|${nonce}|${exp}`), sig)) return false;

  prune(passUses);
  const usage = passUses.get(nonce) ?? { uses: 0, exp };
  if (usage.uses >= MAX_PASS_USES) return false;
  usage.uses += 1;
  passUses.set(nonce, usage);
  return true;
}

/* ---------- SVG captcha ----------
 * Digits are drawn as jittered seven-segment strokes — there are no <text>
 * nodes, so the code can't be read out of the markup. */

const SEGMENT_LINES: Record<string, [number, number, number, number]> = {
  a: [0, 0, 20, 0],
  b: [20, 0, 20, 18],
  c: [20, 18, 20, 36],
  d: [0, 36, 20, 36],
  e: [0, 18, 0, 36],
  f: [0, 0, 0, 18],
  g: [0, 18, 20, 18],
};

const DIGIT_SEGMENTS: Record<string, string> = {
  "2": "abged",
  "3": "abgcd",
  "4": "fgbc",
  "5": "afgcd",
  "6": "afgedc",
  "7": "abc",
  "8": "abcdefg",
  "9": "abfgcd",
};

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function renderCaptchaSvg(code: string): string {
  const width = 28 + code.length * 32;
  const height = 60;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<rect width="${width}" height="${height}" rx="8" fill="#f1f5f9"/>`,
  ];

  for (let i = 0; i < code.length; i++) {
    const x = 14 + i * 32 + rand(-2, 2);
    const y = 12 + rand(-3, 3);
    const rotate = rand(-14, 14);
    const strokeWidth = rand(2.2, 3).toFixed(1);
    const lines = [...(DIGIT_SEGMENTS[code[i]] ?? "abcdefg")]
      .map((seg) => {
        const [x1, y1, x2, y2] = SEGMENT_LINES[seg];
        const j = () => rand(-2, 2);
        return `<line x1="${(x1 + j()).toFixed(1)}" y1="${(y1 + j()).toFixed(1)}" x2="${(x2 + j()).toFixed(1)}" y2="${(y2 + j()).toFixed(1)}"/>`;
      })
      .join("");
    parts.push(
      `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${rotate.toFixed(1)} 10 18)" stroke="#475569" stroke-width="${strokeWidth}" stroke-linecap="round">${lines}</g>`,
    );
  }

  // Noise: curves through the digits plus scattered dots.
  for (let i = 0; i < 3; i++) {
    const y0 = rand(8, height - 8);
    parts.push(
      `<path d="M0 ${y0.toFixed(1)} C ${rand(0, width / 2).toFixed(1)} ${rand(0, height).toFixed(1)}, ${rand(width / 2, width).toFixed(1)} ${rand(0, height).toFixed(1)}, ${width} ${rand(8, height - 8).toFixed(1)}" fill="none" stroke="#475569" stroke-width="1.4" opacity="0.4"/>`,
    );
  }
  for (let i = 0; i < 10; i++) {
    parts.push(
      `<circle cx="${rand(0, width).toFixed(1)}" cy="${rand(0, height).toFixed(1)}" r="${rand(1, 2).toFixed(1)}" fill="#475569" opacity="0.35"/>`,
    );
  }

  parts.push("</svg>");
  return parts.join("");
}
