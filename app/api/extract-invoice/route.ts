import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { client, MODEL } from "@/lib/anthropic";
import { verifyPass } from "@/lib/humancheck";
import { InvoiceSchema } from "@/lib/schema";
import { EXTRACTION_PROMPT } from "@/lib/prompts";

// Extraction takes several seconds; give the function headroom on Vercel.
export const maxDuration = 60;

// Stay under Vercel's 4.5 MB request body limit.
const MAX_BYTES = 4 * 1024 * 1024;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

export async function POST(req: Request) {
  // Reject unverified callers before doing any work — the raw URL alone
  // must not be able to reach the AI backend.
  if (!verifyPass(req.headers.get("x-verify-pass"))) {
    return NextResponse.json(
      { error: "Human verification failed or expired — please verify and try again." },
      { status: 403 },
    );
  }

  let file: File;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (!(f instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    file = f;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const isPdf = file.type === "application/pdf";
  const isImage = (IMAGE_TYPES as readonly string[]).includes(file.type);
  if (!isPdf && !isImage) {
    return NextResponse.json(
      { error: "Only PDF and image files (JPEG, PNG, WebP, GIF) are supported." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is too large (max 4 MB)." }, { status: 413 });
  }

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const documentBlock = isPdf
    ? ({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data },
      } as const)
    : ({
        type: "image",
        source: { type: "base64", media_type: file.type as ImageType, data },
      } as const);

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      messages: [
        {
          role: "user",
          content: [documentBlock, { type: "text", text: EXTRACTION_PROMPT }],
        },
      ],
      output_config: { format: zodOutputFormat(InvoiceSchema) },
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "The model declined to process this document." },
        { status: 422 },
      );
    }
    if (response.stop_reason === "max_tokens") {
      return NextResponse.json(
        { error: "The document is too complex to extract in one pass. Try a shorter invoice." },
        { status: 422 },
      );
    }

    const invoice = response.parsed_output;
    if (!invoice) {
      return NextResponse.json(
        { error: "Extraction produced no structured result. Please try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({ invoice });
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
      // Most common cause: password-protected or corrupt file.
      return NextResponse.json(
        { error: "Claude could not read this file. Is it password-protected or corrupt?" },
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
      console.error("extract-invoice failed:", err.message);
      return NextResponse.json(
        { error: "Server AI credentials are not configured (ANTHROPIC_API_KEY)." },
        { status: 500 },
      );
    }
    console.error("extract-invoice failed:", err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
