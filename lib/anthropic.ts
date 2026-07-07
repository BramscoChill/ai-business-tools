import Anthropic from "@anthropic-ai/sdk";

// Server-side only — never import this from a client component.
export const client = new Anthropic();

// Single source of truth for the model used by every demo in this repo.
export const MODEL = "claude-opus-4-8";

// Demo 3 (grounded chatbot) answers twice per question plus a grounding check,
// so it runs on Haiku to keep the demo cheap and snappy.
export const CHAT_MODEL = "claude-haiku-4-5";
