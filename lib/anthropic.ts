import Anthropic from "@anthropic-ai/sdk";

// Server-side only — never import this from a client component.
export const client = new Anthropic();

// Single source of truth for the model used by every demo in this repo.
export const MODEL = "claude-opus-4-8";
