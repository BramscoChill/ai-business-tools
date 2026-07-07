# ai-business-tools

AI tools that eliminate manual work: invoice/receipt extraction & support inbox triage. Live demo: https://ai-business-tools.vercel.app

## The two demos

| Demo | URL | What it does |
|---|---|---|
| 📄 Invoice/Receipt Extractor | [/invoice-extractor](https://ai-business-tools.vercel.app/invoice-extractor) | Turns a PDF or photo of an invoice/receipt into an editable table you can export to CSV |
| 📬 Support Inbox Triage | [/inbox-triage](https://ai-business-tools.vercel.app/inbox-triage) | Categorizes a batch of support emails, scores urgency, reads sentiment, and drafts replies |

Both demos ask you to type a short distorted code (human check) right before processing starts — see [Abuse protection](#abuse-protection) below.

### 📄 Invoice/Receipt Extractor

**Input:** one invoice or receipt as a PDF or image (JPEG, PNG, WebP, GIF), max 4 MB.

1. Open [/invoice-extractor](https://ai-business-tools.vercel.app/invoice-extractor).
2. Provide a document in one of two ways:
   - **Upload your own** — drag & drop it onto the dropzone, or click the dropzone to pick a file.
   - **Try a sample** — click one of the sample chips (SaaS invoice, retail receipt, two Dutch grocery/supermarket receipts, services invoice). The ⬇ button next to each chip downloads the sample so you can inspect it first.
3. Complete the human check that pops up (type the code shown; use ↻ if it's unreadable).
4. Wait a few seconds while Claude reads the document. You'll see progress messages ("Reading the document…", "Extracting fields…").
5. Review the result:
   - **Summary card** — vendor, invoice number, date, and currency.
   - **Line items table** — description, quantity, unit price, and amount per line, plus subtotal, tax, and total.
   - **Every field is editable** — click any value to correct it inline.
6. Check the warnings before trusting the numbers:
   - A ⚠ amber banner lists fields Claude wasn't fully confident about (hover a field's ⚠ icon for the reason).
   - A red warning appears if the line items (+ tax) don't add up to the extracted total — fix the offending value by hand.
7. Click **⬇ Export CSV** to download the data (named like `invoice-<vendor>-<date>.csv`), or **Extract another** to start over.

### 📬 Support Inbox Triage

**Input:** up to 20 support emails per batch, provided in any of three ways:

- **Paste** into the textarea. Separate emails with a line containing only `---`. Each email may optionally start with `From:` and `Subject:` header lines, followed by the body:

  ```text
  From: jane@acme.com
  Subject: Charged twice this month

  Hi, I was billed twice on the 3rd. Please refund one charge.
  ---
  Subject: App crashes on login

  Since the last update the app crashes immediately after I log in.
  ```

- **Upload a `.txt` file** (max 1 MB) using the same `---` separator format.
- **Upload a `.csv` file** (max 1 MB) with a header row containing a `body` column; `from` and `subject` columns are optional.

Steps:

1. Open [/inbox-triage](https://ai-business-tools.vercel.app/inbox-triage).
2. Paste emails, drop a file onto the dropzone, or click **📥 Load sample inbox** to fill the textarea with a ready-made batch. (Downloadable samples: [sample-inbox.txt](https://ai-business-tools.vercel.app/samples/emails/sample-inbox.txt) · [sample-inbox.csv](https://ai-business-tools.vercel.app/samples/emails/sample-inbox.csv).) Uploaded files land in the textarea first, so you can review and edit before processing.
3. Click **Triage N emails** — the button shows how many emails were detected. Batches over 20 are truncated to the first 20.
4. Complete the human check.
5. Watch results stream in: emails are processed 5 at a time, and each row fills in as its result lands. Once the whole batch is done, rows are sorted by urgency (critical first).
6. Work the list:
   - Each row shows a one-line **summary**, a **category** badge (billing, bug, feature request, complaint, other) and an **urgency** badge (low, medium, high, critical — hover it for the reasoning).
   - Use the **filter chips** above the list to show only one category.
   - **Click a row** to expand it: the left side shows the original email and its sentiment, the right side shows Claude's **suggested reply** with a **⧉ Copy reply** button to paste it straight into your mail client.
   - If an individual email fails, hit **↻ Retry** on that row — the rest of the batch is unaffected.
7. Click **Triage another batch** to start over.

## Running locally

```bash
npm install
cp .env.example .env.local   # then fill in your ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

The only required configuration is `ANTHROPIC_API_KEY` (get one at https://platform.claude.com).

## Abuse protection

The AI endpoints (`/api/extract-invoice`, `/api/triage-inbox`) require a human-verification pass: the UI shows a distorted-code check before each processing action and exchanges the answer for a short-lived signed pass (`x-verify-pass` header). Direct/scripted calls without it get a 403, so scraped URLs can't burn API credits.

Tokens are signed with `CAPTCHA_SECRET` if set; otherwise a secret is derived (one-way hash) from `ANTHROPIC_API_KEY`, so no extra config is needed.
