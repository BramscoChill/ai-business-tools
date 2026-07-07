"use client";

import { useState } from "react";
import Link from "next/link";
import { FileDropzone } from "@/components/FileDropzone";
import { HumanCheck } from "@/components/HumanCheck";
import { LoadingState, ErrorBanner } from "@/components/LoadingState";
import { invoiceToCsv, downloadCsv } from "@/lib/csv";
import type { Invoice, LineItem } from "@/lib/schema";

const MAX_BYTES = 4 * 1024 * 1024;

const SAMPLES = [
  { file: "saas-invoice.pdf", label: "SaaS invoice" },
  { file: "retail-receipt.pdf", label: "Retail receipt" },
  { file: "grocery-receipt.jpeg", label: "Grocery receipt (NL)" },
  { file: "supermarket-receipt.jpg", label: "Supermarket receipt (NL)" },
  { file: "services-invoice.pdf", label: "Services invoice" },
];

const LOADING_MESSAGES = [
  "Uploading file…",
  "Reading the document…",
  "Extracting fields…",
  "Almost there — validating the result…",
];

type Status = "idle" | "loading" | "done";

export default function InvoiceExtractorPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState<string | null>(null);
  // File waiting on the human check; the modal is open while this is set.
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  function requestExtract(file: File) {
    setError(null);
    setPendingFile(file);
  }

  async function extract(file: File, pass: string) {
    setError(null);
    setStatus("loading");
    setFileName(file.name);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/extract-invoice", {
        method: "POST",
        headers: { "x-verify-pass": pass },
        body: form,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.invoice) {
        throw new Error(body?.error ?? `Request failed (${res.status}).`);
      }
      setInvoice(body.invoice as Invoice);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStatus("idle");
    } finally {
      setLoadingSample(null);
    }
  }

  async function extractSample(sample: (typeof SAMPLES)[number]) {
    setError(null);
    setLoadingSample(sample.file);
    try {
      const res = await fetch(`/samples/invoices/${sample.file}`);
      if (!res.ok) throw new Error("Could not load the sample file.");
      const blob = await res.blob();
      // The static file server sets the Content-Type from the extension;
      // fall back to it by hand in case the blob type is empty.
      const type =
        blob.type ||
        (sample.file.endsWith(".pdf")
          ? "application/pdf"
          : sample.file.endsWith(".png")
            ? "image/png"
            : "image/jpeg");
      requestExtract(new File([blob], sample.file, { type }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the sample file.");
    } finally {
      setLoadingSample(null);
    }
  }

  function reset() {
    setStatus("idle");
    setInvoice(null);
    setFileName("");
    setError(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">📄 Invoice/Receipt Extractor</h1>
        <p className="mt-2 text-sm text-black/60 dark:text-white/60">
          Upload an invoice or receipt as a PDF or photo (JPEG, PNG, WebP). Claude extracts
          the vendor, date, line items and totals into an editable table you can export to CSV.
        </p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {pendingFile && (
        <HumanCheck
          onVerified={(pass) => {
            const file = pendingFile;
            setPendingFile(null);
            void extract(file, pass);
          }}
          onCancel={() => setPendingFile(null)}
        />
      )}

      {status === "idle" && (
        <>
          <FileDropzone
            accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
            acceptLabel="PDF or image"
            maxBytes={MAX_BYTES}
            onFile={requestExtract}
          />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-black/50 dark:text-white/50">No invoice at hand? Try a sample:</span>
            {SAMPLES.map((s) => (
              <span
                key={s.file}
                className="inline-flex items-stretch overflow-hidden rounded-full border border-black/15 dark:border-white/20"
              >
                <button
                  onClick={() => extractSample(s)}
                  disabled={loadingSample !== null}
                  className="px-3 py-1 transition hover:bg-blue-500/10 hover:text-blue-600 disabled:opacity-50 dark:hover:text-blue-400"
                >
                  {loadingSample === s.file ? "Loading…" : `▸ ${s.label}`}
                </button>
                <a
                  href={`/samples/invoices/${s.file}`}
                  download={s.file}
                  title={`Download ${s.label}`}
                  aria-label={`Download ${s.label}`}
                  className="flex items-center border-l border-black/15 px-2 text-black/50 transition hover:bg-blue-500/10 hover:text-blue-600 dark:border-white/20 dark:text-white/50 dark:hover:text-blue-400"
                >
                  ⬇
                </a>
              </span>
            ))}
          </div>
        </>
      )}

      {status === "loading" && <LoadingState messages={LOADING_MESSAGES} />}

      {status === "done" && invoice && (
        <InvoiceResult
          invoice={invoice}
          fileName={fileName}
          onChange={setInvoice}
          onReset={reset}
        />
      )}

      <p className="pt-2 text-center text-sm text-black/50 dark:text-white/50">
        Also try:{" "}
        <Link
          href="/inbox-triage"
          className="font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          📬 Support Inbox Triage →
        </Link>{" "}
        ·{" "}
        <Link
          href="/grounded-chatbot"
          className="font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          💬 Grounded RAG Chatbot →
        </Link>
      </p>
    </div>
  );
}

/* ---------- results view ---------- */

function InvoiceResult({
  invoice,
  fileName,
  onChange,
  onReset,
}: {
  invoice: Invoice;
  fileName: string;
  onChange: (inv: Invoice) => void;
  onReset: () => void;
}) {
  const flagged = (field: string) =>
    invoice.confidence_notes.find((n) =>
      n.toLowerCase().startsWith(field.replace("_", " ")) ||
      n.toLowerCase().startsWith(field),
    );

  const set = <K extends keyof Invoice>(key: K, value: Invoice[K]) =>
    onChange({ ...invoice, [key]: value });

  const setItem = (i: number, patch: Partial<LineItem>) => {
    const items = invoice.line_items.map((li, j) => (j === i ? { ...li, ...patch } : li));
    onChange({ ...invoice, line_items: items });
  };

  const computedSubtotal = round2(invoice.line_items.reduce((s, li) => s + (li.amount || 0), 0));
  const expectedTotal = round2(
    (invoice.subtotal ?? computedSubtotal) + (invoice.tax ?? 0),
  );
  const mismatch = Math.abs(expectedTotal - invoice.total) > 0.01;

  function exportCsv() {
    const vendor = invoice.vendor.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "invoice";
    downloadCsv(`invoice-${vendor}-${invoice.date ?? "undated"}.csv`, invoiceToCsv(invoice));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-black/60 dark:text-white/60">
          Extracted from <span className="font-medium text-black dark:text-white">{fileName}</span>{" "}
          — every field below is editable.
        </p>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            ⬇ Export CSV
          </button>
          <button
            onClick={onReset}
            className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium transition hover:border-black/40 dark:border-white/20 dark:hover:border-white/50"
          >
            Extract another
          </button>
        </div>
      </div>

      {invoice.confidence_notes.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="font-medium">⚠ Verify these fields — Claude wasn&apos;t fully confident:</p>
          <ul className="mt-1 list-inside list-disc">
            {invoice.confidence_notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Summary card */}
      <div className="grid gap-4 rounded-2xl border border-black/10 bg-white p-5 sm:grid-cols-2 lg:grid-cols-4 dark:border-white/15 dark:bg-white/5">
        <Field label="Vendor" flag={flagged("vendor")}>
          <TextInput value={invoice.vendor} onChange={(v) => set("vendor", v)} />
        </Field>
        <Field label="Invoice #" flag={flagged("invoice_number")}>
          <TextInput
            value={invoice.invoice_number ?? ""}
            onChange={(v) => set("invoice_number", v || null)}
          />
        </Field>
        <Field label="Date" flag={flagged("date")}>
          <TextInput
            value={invoice.date ?? ""}
            onChange={(v) => set("date", v || null)}
            placeholder="YYYY-MM-DD"
          />
        </Field>
        <Field label="Currency" flag={flagged("currency")}>
          <TextInput value={invoice.currency} onChange={(v) => set("currency", v)} />
        </Field>
      </div>

      {/* Line items */}
      <div className="overflow-x-auto rounded-2xl border border-black/10 dark:border-white/15">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/10">
            <tr>
              <th className="px-4 py-3 font-medium">Description {invoice.confidence_notes.some((n) => n.toLowerCase().startsWith("line")) && "⚠"}</th>
              <th className="w-20 px-2 py-3 font-medium">Qty</th>
              <th className="w-28 px-2 py-3 font-medium">Unit price</th>
              <th className="w-28 px-2 py-3 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.line_items.map((li, i) => (
              <tr key={i} className="border-t border-black/10 dark:border-white/10">
                <td className="px-2 py-1">
                  <TextInput value={li.description} onChange={(v) => setItem(i, { description: v })} />
                </td>
                <td className="px-1 py-1">
                  <NumberInput value={li.quantity} onChange={(v) => setItem(i, { quantity: v ?? 0 })} />
                </td>
                <td className="px-1 py-1">
                  <NumberInput value={li.unit_price} onChange={(v) => setItem(i, { unit_price: v ?? 0 })} />
                </td>
                <td className="px-1 py-1">
                  <NumberInput value={li.amount} onChange={(v) => setItem(i, { amount: v ?? 0 })} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/10">
            <tr>
              <td className="px-4 py-2 text-right font-medium" colSpan={3}>
                Subtotal {flagged("subtotal") && "⚠"}
              </td>
              <td className="px-1 py-1">
                <NumberInput value={invoice.subtotal} onChange={(v) => set("subtotal", v)} nullable />
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2 text-right font-medium" colSpan={3}>
                Tax {flagged("tax") && "⚠"}
              </td>
              <td className="px-1 py-1">
                <NumberInput value={invoice.tax} onChange={(v) => set("tax", v)} nullable />
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2 text-right font-semibold" colSpan={3}>
                Total ({invoice.currency}) {flagged("total") && "⚠"}
              </td>
              <td className="px-1 py-1 font-semibold">
                <NumberInput value={invoice.total} onChange={(v) => set("total", v ?? 0)} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {mismatch && (
        <p className="text-sm font-medium text-red-600 dark:text-red-400">
          ⚠ The line items {invoice.tax != null ? "+ tax " : ""}add up to{" "}
          {expectedTotal.toFixed(2)}, but the total reads {invoice.total.toFixed(2)}. Double-check
          the highlighted values before exporting.
        </p>
      )}
    </div>
  );
}

/* ---------- small inputs ---------- */

function Field({
  label,
  flag,
  children,
}: {
  label: string;
  flag?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-black/50 dark:text-white/50">
        {label}{" "}
        {flag && (
          <span title={flag} className="cursor-help text-amber-600 dark:text-amber-400">
            ⚠
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 transition hover:border-black/15 focus:border-blue-500 focus:bg-white focus:outline-none dark:hover:border-white/20 dark:focus:bg-black";

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      className={inputClass}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function NumberInput({
  value,
  onChange,
  nullable,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  nullable?: boolean;
}) {
  return (
    <input
      type="number"
      step="0.01"
      className={`${inputClass} text-right tabular-nums`}
      value={value ?? ""}
      placeholder={nullable ? "—" : "0"}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") return onChange(nullable ? null : 0);
        const n = Number(raw);
        if (!Number.isNaN(n)) onChange(n);
      }}
    />
  );
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
