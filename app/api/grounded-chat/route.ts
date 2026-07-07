import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { client, CHAT_MODEL } from "@/lib/anthropic";
import { verifyPass } from "@/lib/humancheck";
import { ChatRequestSchema, GroundingCheckSchema, type ChatDebug } from "@/lib/schema";
import {
  CHAT_FALLBACK_ANSWER,
  buildGroundedChatSystem,
  buildGroundingCheckPrompt,
  buildNaiveChatSystem,
} from "@/lib/prompts";
import { groundingThreshold, searchChunks, type RetrievedChunk } from "@/lib/retrieval";

// Two model calls in the worst case (answer + grounding check); give the
// function headroom on Vercel.
export const maxDuration = 60;

function formatContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map((c) => `[Source: ${c.title}]\n${c.text}`)
    .join("\n\n---\n\n");
}

async function askClaude(system: string, message: string): Promise<string> {
  const response = await client.messages.create({
    model: CHAT_MODEL,
    max_tokens: 600,
    system,
    messages: [{ role: "user", content: message }],
  });
  if (response.stop_reason === "refusal") {
    return CHAT_FALLBACK_ANSWER;
  }
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

export async function POST(req: Request) {
  // Reject unverified callers before doing any work — the raw URL alone
  // must not be able to reach the AI backend.
  if (!verifyPass(req.headers.get("x-verify-pass"))) {
    return NextResponse.json(
      { error: "Human verification failed or expired — please verify and try again." },
      { status: 403 },
    );
  }

  let message: string;
  let mode: "naive" | "grounded";
  try {
    const parsed = ChatRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Send a question (max 500 characters) and a mode (naive or grounded)." },
        { status: 400 },
      );
    }
    ({ message, mode } = parsed.data);
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Same retrieval for both modes — the contrast comes from what happens next.
  const chunks = searchChunks(message, 3);
  const threshold = groundingThreshold();
  const topScore = chunks[0]?.score ?? 0;
  const thresholdPassed = topScore >= threshold;
  const debug: ChatDebug = {
    topScore,
    thresholdPassed,
    chunks: chunks.map((c) => ({ title: c.title, score: c.score })),
    groundingVerdict: null,
  };

  try {
    if (mode === "naive") {
      // Naive mode: top-3 chunks stuffed into a weak prompt, no threshold, no
      // check — on off-topic questions the chunks are irrelevant and the model
      // answers from general knowledge anyway.
      const answer = await askClaude(buildNaiveChatSystem(formatContext(chunks)), message);
      return NextResponse.json({ answer, debug });
    }

    // Grounded fix #1: relevance threshold. If even the best chunk is barely
    // related, don't ask the model at all — return the fallback directly.
    if (!thresholdPassed) {
      return NextResponse.json({ answer: CHAT_FALLBACK_ANSWER, debug });
    }

    // Grounded fix #2: strict system prompt (context-only, exact fallback).
    const context = formatContext(chunks);
    const answer = await askClaude(buildGroundedChatSystem(context), message);
    if (answer.includes(CHAT_FALLBACK_ANSWER)) {
      return NextResponse.json({ answer: CHAT_FALLBACK_ANSWER, debug });
    }

    // Grounded fix #3: post-answer grounding check. A second cheap call judges
    // whether every claim is supported by the chunks; if not, fall back.
    const check = await client.messages.parse({
      model: CHAT_MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: buildGroundingCheckPrompt({ question: message, answer, context }) }],
      output_config: { format: zodOutputFormat(GroundingCheckSchema) },
    });
    // If the audit produced no verdict, err on the safe side and fall back.
    const grounded = check.parsed_output?.grounded ?? false;
    debug.groundingVerdict = grounded;

    return NextResponse.json({ answer: grounded ? answer : CHAT_FALLBACK_ANSWER, debug });
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
        { error: "Claude could not process this question." },
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
      console.error("grounded-chat failed:", err.message);
      return NextResponse.json(
        { error: "Server AI credentials are not configured (ANTHROPIC_API_KEY)." },
        { status: 500 },
      );
    }
    console.error("grounded-chat failed:", err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
