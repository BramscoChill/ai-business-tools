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

export function buildTriagePrompt(email: { from?: string; subject?: string; body: string }) {
  const header = [
    email.from ? `From: ${email.from}` : null,
    email.subject ? `Subject: ${email.subject}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return `${TRIAGE_PROMPT}\n\nEmail:\n<email>\n${header ? `${header}\n\n` : ""}${email.body}\n</email>`;
}
