// Versioned prompt for the invoice extractor (Demo 1).
// v1: bare "extract the invoice fields"
// v2: added normalization rules (ISO date, currency code, line-item math, discounts, receipts)
// v3: added confidence_notes instruction to drive the UI's confidence flags
export const EXTRACTION_PROMPT = `Extract the invoice or receipt in this document into the structured format.

Rules:
- vendor: the company that issued the invoice/receipt (not the customer being billed).
- invoice_number: the invoice or receipt reference number. Use null if absent.
- date: the issue date, normalized to ISO 8601 (YYYY-MM-DD). Use null if no date is present.
- currency: an ISO 4217 code (e.g. "EUR", "USD"). Infer from symbols if needed ("$" means USD unless the document indicates otherwise).
- line_items: one entry per billed row, in document order. quantity x unit_price must equal amount. If a row only shows a single price, use quantity 1 and unit_price equal to amount.
- Discounts are line items with a negative amount. Shipping/handling is a regular line item.
- For receipts without itemization, create a single line item describing the purchase.
- subtotal and tax: use null when the document does not show them. total is the grand total actually charged and is always required.
- confidence_notes: list every field you were not fully confident about, formatted as "<field>: <reason>" (e.g. "date: partially illegible", "currency: inferred from $ symbol"). Use an empty array if everything was clear.`;

// Versioned prompt for the inbox triage (Demo 2).
// v1: bare "classify this support email"
// v2: category definitions with example phrasings + explicit tie-break rules
//     (topic vs. emotion), spelled-out urgency rubric, reply drafting rules
export const TRIAGE_PROMPT = `Triage this customer support email into the structured format.

Category — the TOPIC of the email (the sender's emotion goes in sentiment, never in category):
- billing: charges, invoices, refunds, payments, subscriptions ("I was charged twice", "where is my invoice?"). An angry email about a wrong charge is billing, not complaint — category is the topic, sentiment captures the anger.
- bug: the product is broken or behaving incorrectly ("the export button does nothing", "I can't log in").
- feature_request: asking for new or improved functionality ("please add dark mode", "an API would be great").
- complaint: dissatisfaction with the service, support, or company itself when no concrete billing issue or bug is the subject ("nobody answers my tickets", "your quality keeps slipping").
- other: everything else — general questions, sales inquiries, security reports, partnerships.
Tie-break: classify the sender's primary request — the thing they want acted on. If venting is mixed with a concrete issue, classify the concrete issue.

Urgency rubric:
- critical: outage, data loss, or a security incident — or many users blocked at once.
- high: a single user fully blocked from working, or a payment failure threatening their service.
- medium: something is wrong or degraded but a workaround exists / work can continue.
- low: questions, feature requests, and feedback with no time pressure.
urgency_reason: one short sentence justifying the chosen level.

summary: one line (max ~12 words) stating the gist, e.g. "Double-charged for annual plan, requests refund."

sentiment: the sender's tone — positive, neutral, frustrated (annoyed but civil), or angry (hostile, shouting, threatening to leave).

suggested_reply rules:
- Reply in the sender's language (e.g. answer a Dutch email in Dutch).
- First sentence must acknowledge their specific issue — no generic openers.
- Never invent facts, refund amounts, dates, or promises. Use placeholders like [Name], [refund amount], [ETA] where personalization or a commitment is needed.
- Professional but warm, tone matched to the urgency, at most 150 words.
- Sign off with "[Your name], Support team".`;

// Demo 3: Grounded RAG Chatbot — two system prompts over the same retrieval.

// The exact sentence the grounded bot must use when the docs don't answer.
// The route also compares answers against it, so keep it a single stable string.
export const CHAT_FALLBACK_ANSWER =
  "I don't have that information in our documentation. Please contact our support team at support@aquapure.example and they'll help you personally.";

// Mode A ("how the client's bot behaves today"): the weak prompt many bought
// chatbot products ship with. It hands the model context but never says the
// context is the boundary — and it pushes the model to always produce an
// answer, so off-topic questions get answered from general knowledge.
// v1: bare "use the following context to answer"
// v2: added the answer-encouraging lines to mirror typical vendor defaults —
//     without them the model hedges on off-topic questions and the failure
//     this demo exists to show stays invisible
export function buildNaiveChatSystem(context: string) {
  return `You are a helpful assistant for AquaPure Water Systems. Use the following context to answer the customer's question.

Always be maximally helpful: give every customer a complete, confident answer to whatever they ask. If the context doesn't cover the question, answer from your own general knowledge — a customer should never leave the chat without an answer. Share opinions, comparisons, and recommendations freely. Do not say you are limited to AquaPure topics and do not redirect the customer elsewhere.

Context:
${context}`;
}

// Mode B (the fix, part 2 of 3): the strict prompt. Only the provided context
// may be used, and misses must produce the exact fallback sentence — which the
// route can then detect verbatim.
export function buildGroundedChatSystem(context: string) {
  return `You are the customer-support assistant for AquaPure Water Systems.

Rules — follow them exactly:
- Answer ONLY with information stated in the documentation excerpts below. Quote prices, schedules, and steps exactly as written.
- Never use outside or general knowledge, even when you know the answer. Never give opinions, comparisons with other brands, or advice on topics the excerpts don't cover.
- If the excerpts do not contain the information needed to answer, reply with exactly this sentence and nothing else:
"${CHAT_FALLBACK_ANSWER}"
- Keep answers under 120 words, friendly and concrete.

Documentation excerpts:
${context}`;
}

// Mode B (the fix, part 3 of 3): post-answer audit. A second cheap call gets
// the answer plus the chunks and returns strict JSON {"grounded": boolean}.
export function buildGroundingCheckPrompt(args: {
  question: string;
  answer: string;
  context: string;
}) {
  return `You are auditing a customer-support chatbot that must only answer from its documentation. Judge whether EVERY factual claim in the answer below is directly supported by the documentation excerpts. If the answer contains any fact, price, step, opinion, or recommendation that is not stated in the excerpts, it is not grounded. A polite refusal or a referral to the support team counts as grounded.

<documentation>
${args.context}
</documentation>

<question>
${args.question}
</question>

<answer>
${args.answer}
</answer>`;
}

export function buildTriagePrompt(email: { from?: string; subject?: string; body: string }) {
  const header = [
    email.from ? `From: ${email.from}` : null,
    email.subject ? `Subject: ${email.subject}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return `${TRIAGE_PROMPT}\n\nEmail:\n<email>\n${header ? `${header}\n\n` : ""}${email.body}\n</email>`;
}
