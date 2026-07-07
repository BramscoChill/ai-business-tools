import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { client, MODEL } from "@/lib/anthropic";
import { verifyPass } from "@/lib/humancheck";
import { TriageSchema } from "@/lib/schema";
import { buildTriagePrompt } from "@/lib/prompts";

// Triage takes a few seconds per email; give the function headroom on Vercel.
export const maxDuration = 60;

// One email per request: the client fans the batch out in parallel, so a
// schema is enforced per email and one failure can't lose the rest.
const MAX_BODY_CHARS = 10_000;
const MAX_META_CHARS = 300;

export async function POST(req: Request) {
  // Reject unverified callers before doing any work — the raw URL alone
  // must not be able to reach the AI backend.
  if (!verifyPass(req.headers.get("x-verify-pass"))) {
    return NextResponse.json(
      { error: "Human verification failed or expired — please verify and try again." },
      { status: 403 },
    );
  }

  let email: { from?: string; subject?: string; body: string };
  try {
    const json = await req.json();
    const e = json?.email;
    if (!e || typeof e.body !== "string" || e.body.trim() === "") {
      return NextResponse.json({ error: "No email body provided." }, { status: 400 });
    }
    if (e.body.length > MAX_BODY_CHARS) {
      return NextResponse.json(
        { error: `Email is too long (max ${MAX_BODY_CHARS.toLocaleString()} characters).` },
        { status: 413 },
      );
    }
    email = {
      from: typeof e.from === "string" ? e.from.slice(0, MAX_META_CHARS) : undefined,
      subject: typeof e.subject === "string" ? e.subject.slice(0, MAX_META_CHARS) : undefined,
      body: e.body,
    };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      messages: [{ role: "user", content: buildTriagePrompt(email) }],
      output_config: { format: zodOutputFormat(TriageSchema) },
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "The model declined to process this email." },
        { status: 422 },
      );
    }
    if (response.stop_reason === "max_tokens") {
      return NextResponse.json(
        { error: "This email is too long to triage in one pass." },
        { status: 422 },
      );
    }

    const triage = response.parsed_output;
    if (!triage) {
      return NextResponse.json(
        { error: "Triage produced no structured result. Please try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({ triage });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: "Server is missing a valid ANTHROPIC_API_KEY." },
        { status: 500 },
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "The service is busy right now — please try again in a minute." },
        { status: 429 },
      );
    }
    if (err instanceof Anthropic.BadRequestError) {
      return NextResponse.json(
        { error: "Claude could not process this email." },
        { status: 400 },
      );
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: "Upstream AI service error — please try again." },
        { status: 502 },
      );
    }
    // The SDK throws a plain Error (no typed class) when no credentials are
    // configured at all — thrown lazily on the first request.
    if (err instanceof Error && err.message.includes("Could not resolve authentication method")) {
      console.error("triage-inbox failed:", err.message);
      return NextResponse.json(
        { error: "Server AI credentials are not configured (ANTHROPIC_API_KEY)." },
        { status: 500 },
      );
    }
    console.error("triage-inbox failed:", err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
