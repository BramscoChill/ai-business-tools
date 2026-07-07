import { NextResponse } from "next/server";
import { createChallenge, redeemChallenge } from "@/lib/humancheck";

// Issue a fresh human-verification challenge.
export async function GET() {
  const { token, svg } = createChallenge();
  return NextResponse.json(
    { token, svg },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// Exchange a solved challenge for a short-lived pass.
export async function POST(req: Request) {
  let token: unknown;
  let answer: unknown;
  try {
    const json = await req.json();
    token = json?.token;
    answer = json?.answer;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const result = redeemChallenge(token, answer);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }
  return NextResponse.json({ pass: result.pass });
}
