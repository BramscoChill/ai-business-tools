import { z } from "zod";

export const LineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unit_price: z.number(),
  amount: z.number(),
});

export const InvoiceSchema = z.object({
  vendor: z.string(),
  invoice_number: z.string().nullable(),
  date: z.string().nullable(), // ISO 8601 (YYYY-MM-DD)
  currency: z.string(), // ISO 4217 code, e.g. "EUR"
  line_items: z.array(LineItemSchema),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  total: z.number(),
  // Fields Claude was not fully confident about, e.g. "date: partially illegible"
  confidence_notes: z.array(z.string()),
});

export type LineItem = z.infer<typeof LineItemSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;

// Demo 2: Support Inbox Triage — enforced per email, so one weird email
// can't derail the rest of the batch.
export const TriageSchema = z.object({
  category: z.enum(["billing", "bug", "feature_request", "complaint", "other"]),
  urgency: z.enum(["low", "medium", "high", "critical"]),
  urgency_reason: z.string(), // one sentence — shown as the badge tooltip
  summary: z.string(), // one-line gist for the list view
  sentiment: z.enum(["positive", "neutral", "frustrated", "angry"]),
  suggested_reply: z.string(), // full draft reply, ready to copy
});

export type Triage = z.infer<typeof TriageSchema>;

// Demo 3: Grounded RAG Chatbot — one question, answered by one of two modes.
export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(500),
  mode: z.enum(["naive", "grounded"]),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// Strict JSON verdict for the post-answer grounding check (fix #3): a second,
// cheap model call judges whether every claim is supported by the chunks.
export const GroundingCheckSchema = z.object({
  grounded: z.boolean(),
});

// "Behind the scenes" payload shown under every answer in the UI.
export type ChatDebug = {
  topScore: number; // best chunk's relevance, 0..1
  thresholdPassed: boolean;
  chunks: { title: string; score: number }[];
  groundingVerdict: boolean | null; // null: check skipped (naive mode / fallback)
};
