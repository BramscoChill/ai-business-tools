// Client-side parsing for the inbox triage input (Demo 2).
// All three input paths (paste, .txt, .csv) normalize to ParsedEmail[].

export type ParsedEmail = {
  from?: string;
  subject?: string;
  body: string;
};

// Keeps latency and cost sane for a demo batch.
export const MAX_EMAILS = 20;

// Emails are separated by a line containing only "---".
// Each block may start with optional "From:" / "Subject:" header lines.
export function parseEmailsText(text: string): ParsedEmail[] {
  return text
    .split(/^\s*---\s*$/m)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(parseBlock);
}

function parseBlock(block: string): ParsedEmail {
  const lines = block.split("\n");
  let from: string | undefined;
  let subject: string | undefined;
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^(from|subject):\s*(.*)$/i);
    if (!m) break;
    const key = m[1].toLowerCase();
    if (key === "from" && from === undefined) from = m[2].trim() || undefined;
    else if (key === "subject" && subject === undefined) subject = m[2].trim() || undefined;
    i++;
  }
  const body = lines.slice(i).join("\n").trim();
  // A block that is only header lines: treat the whole block as the body.
  return body ? { from, subject, body } : { body: block };
}

// CSV with a header row; requires a "body" column, "from" and "subject" optional.
export function parseEmailsCsv(text: string): ParsedEmail[] {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const bodyIdx = header.indexOf("body");
  if (bodyIdx === -1) {
    throw new Error('The CSV needs a header row with a "body" column (plus optional "from" and "subject").');
  }
  const fromIdx = header.indexOf("from");
  const subjectIdx = header.indexOf("subject");
  return rows
    .slice(1)
    .map((r) => ({
      from: fromIdx >= 0 ? r[fromIdx]?.trim() || undefined : undefined,
      subject: subjectIdx >= 0 ? r[subjectIdx]?.trim() || undefined : undefined,
      body: (r[bodyIdx] ?? "").trim(),
    }))
    .filter((e) => e.body);
}

// Minimal RFC 4180 parser: quoted fields may contain commas, newlines, and "" escapes.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Render parsed emails back to the canonical "---" text format,
// so file uploads land in the same editable textarea as pasted input.
export function emailsToText(emails: ParsedEmail[]): string {
  return emails
    .map((e) => {
      const header = [
        e.from ? `From: ${e.from}` : null,
        e.subject ? `Subject: ${e.subject}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      return header ? `${header}\n\n${e.body}` : e.body;
    })
    .join("\n---\n");
}
