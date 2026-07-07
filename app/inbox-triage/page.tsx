"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FileDropzone } from "@/components/FileDropzone";
import { HumanCheck } from "@/components/HumanCheck";
import { ErrorBanner } from "@/components/LoadingState";
import {
  MAX_EMAILS,
  emailsToText,
  parseEmailsCsv,
  parseEmailsText,
  type ParsedEmail,
} from "@/lib/emails";
import type { Triage } from "@/lib/schema";

const MAX_FILE_BYTES = 1 * 1024 * 1024;
// Parallel fan-out, but not 20 simultaneous API calls — keeps rate limits happy.
const CONCURRENCY = 5;

type Category = Triage["category"];
type Urgency = Triage["urgency"];

type ItemState =
  | { status: "pending" }
  | { status: "done"; triage: Triage }
  | { status: "error"; message: string };

type Item = { id: number; email: ParsedEmail; state: ItemState };

const CATEGORY_LABEL: Record<Category, string> = {
  billing: "billing",
  bug: "bug",
  feature_request: "feature request",
  complaint: "complaint",
  other: "other",
};

const CATEGORY_BADGE: Record<Category, string> = {
  billing: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300",
  bug: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",
  feature_request: "bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300",
  complaint: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300",
  other: "bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-white/70",
};

const URGENCY_BADGE: Record<Urgency, string> = {
  low: "bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-white/70",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300",
  critical: "animate-pulse bg-red-600 text-white dark:bg-red-500",
};

const URGENCY_RANK: Record<Urgency, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const PLACEHOLDER = `Paste one or more support emails here.

Separate emails with a line containing only:
---

Each email may start with optional header lines:
From: jane@acme.com
Subject: Charged twice this month

…followed by the email body.`;

export default function InboxTriagePage() {
  const [text, setText] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);
  // Batch waiting on the human check; the modal is open while this is set.
  const [pendingBatch, setPendingBatch] = useState<ParsedEmail[] | null>(null);
  // Pass from the last verification — reused by per-row retries.
  const passRef = useRef<string | null>(null);

  const detected = useMemo(() => parseEmailsText(text), [text]);

  async function triageOne(id: number, email: ParsedEmail) {
    try {
      const res = await fetch("/api/triage-inbox", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-verify-pass": passRef.current ?? "",
        },
        body: JSON.stringify({
          email: { from: email.from, subject: email.subject, body: email.body },
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.triage) {
        throw new Error(body?.error ?? `Request failed (${res.status}).`);
      }
      const triage = body.triage as Triage;
      setItems((prev) =>
        prev?.map((it) => (it.id === id ? { ...it, state: { status: "done", triage } } : it)) ?? null,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      setItems((prev) =>
        prev?.map((it) => (it.id === id ? { ...it, state: { status: "error", message } } : it)) ??
        null,
      );
    }
  }

  function triageAll() {
    setError(null);
    setNotice(null);
    const emails = detected.slice(0, MAX_EMAILS);
    if (emails.length === 0) {
      setError("Paste at least one email first.");
      return;
    }
    if (detected.length > MAX_EMAILS) {
      setNotice(
        `That's ${detected.length} emails — this demo processes the first ${MAX_EMAILS} per batch.`,
      );
    }
    // Ask for human verification first; the batch runs once it passes.
    setPendingBatch(emails);
  }

  async function runBatch(emails: ParsedEmail[]) {
    const batch: Item[] = emails.map((email, i) => ({
      id: i,
      email,
      state: { status: "pending" },
    }));
    setItems(batch);
    // Fan out with limited concurrency; each result renders as it lands.
    const queue = [...batch];
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        for (let it = queue.shift(); it; it = queue.shift()) {
          await triageOne(it.id, it.email);
        }
      }),
    );
  }

  function retry(item: Item) {
    setItems((prev) =>
      prev?.map((it) => (it.id === item.id ? { ...it, state: { status: "pending" } } : it)) ?? null,
    );
    void triageOne(item.id, item.email);
  }

  function reset() {
    setItems(null);
    setError(null);
    setNotice(null);
  }

  async function loadSample() {
    setError(null);
    setNotice(null);
    setLoadingSample(true);
    try {
      const res = await fetch("/samples/emails/sample-inbox.txt");
      if (!res.ok) throw new Error("Could not load the sample inbox.");
      setText(await res.text());
      setNotice("Sample inbox loaded — click Triage to process it.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the sample inbox.");
    } finally {
      setLoadingSample(false);
    }
  }

  async function handleFile(file: File) {
    setError(null);
    setNotice(null);
    try {
      const content = await file.text();
      const emails = file.name.toLowerCase().endsWith(".csv")
        ? parseEmailsCsv(content)
        : parseEmailsText(content);
      if (emails.length === 0) {
        setError(`No emails found in ${file.name}.`);
        return;
      }
      setText(emailsToText(emails));
      setNotice(
        `Loaded ${emails.length} email${emails.length === 1 ? "" : "s"} from ${file.name} — review below, then click Triage.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not read ${file.name}.`);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">📬 Support Inbox Triage</h1>
        <p className="mt-2 text-sm text-black/60 dark:text-white/60">
          Paste a batch of support emails. Claude categorizes each one, scores its urgency,
          reads the sentiment, and drafts a reply you can copy straight into your mail client.
        </p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {pendingBatch && (
        <HumanCheck
          onVerified={(pass) => {
            const emails = pendingBatch;
            setPendingBatch(null);
            passRef.current = pass;
            void runBatch(emails);
          }}
          onCancel={() => setPendingBatch(null)}
        />
      )}

      {notice && (
        <div className="rounded-xl border border-blue-300 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300">
          {notice}
        </div>
      )}

      {items === null ? (
        <>
          <div className="flex flex-col gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={12}
              className="w-full resize-y rounded-2xl border border-black/15 bg-white p-4 font-mono text-sm focus:border-blue-500 focus:outline-none dark:border-white/20 dark:bg-white/5 dark:focus:border-blue-400"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={triageAll}
                disabled={detected.length === 0}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                Triage {detected.length > 0 ? Math.min(detected.length, MAX_EMAILS) : ""} email
                {Math.min(detected.length, MAX_EMAILS) === 1 ? "" : "s"}
              </button>
              <button
                onClick={loadSample}
                disabled={loadingSample}
                className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium transition hover:border-black/40 disabled:opacity-50 dark:border-white/20 dark:hover:border-white/50"
              >
                {loadingSample ? "Loading…" : "📥 Load sample inbox"}
              </button>
              {detected.length > MAX_EMAILS && (
                <span className="text-sm text-amber-700 dark:text-amber-400">
                  {detected.length} emails detected — only the first {MAX_EMAILS} will be processed.
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <FileDropzone
              accept="text/plain,text/csv,application/vnd.ms-excel"
              acceptExt=".txt,.csv"
              acceptLabel=".txt or .csv"
              maxBytes={MAX_FILE_BYTES}
              onFile={handleFile}
            />
            <p className="text-xs text-black/50 dark:text-white/50">
              .txt uses the same <code>---</code> separator as the textarea · .csv needs a header
              row with <code>from,subject,body</code> columns · samples:{" "}
              <a
                href="/samples/emails/sample-inbox.txt"
                download
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                sample-inbox.txt
              </a>{" "}
              ·{" "}
              <a
                href="/samples/emails/sample-inbox.csv"
                download
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                sample-inbox.csv
              </a>
            </p>
          </div>
        </>
      ) : (
        <TriageResults items={items} onRetry={retry} onReset={reset} />
      )}

      <p className="pt-2 text-center text-sm text-black/50 dark:text-white/50">
        Also try:{" "}
        <Link
          href="/invoice-extractor"
          className="font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          📄 Invoice/Receipt Extractor →
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

function TriageResults({
  items,
  onRetry,
  onReset,
}: {
  items: Item[];
  onRetry: (item: Item) => void;
  onReset: () => void;
}) {
  const [filter, setFilter] = useState<Category | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const pendingCount = items.filter((it) => it.state.status === "pending").length;
  const done = items.filter(
    (it): it is Item & { state: { status: "done"; triage: Triage } } => it.state.status === "done",
  );

  // Keep input order while calls are still resolving so rows don't jump
  // around; sort by urgency once the batch has settled.
  const sorted =
    pendingCount > 0
      ? items
      : [...items].sort((a, b) => {
          const ra = a.state.status === "done" ? URGENCY_RANK[a.state.triage.urgency] : 99;
          const rb = b.state.status === "done" ? URGENCY_RANK[b.state.triage.urgency] : 99;
          return ra - rb || a.id - b.id;
        });

  const visible = filter
    ? sorted.filter((it) => it.state.status === "done" && it.state.triage.category === filter)
    : sorted;

  const urgencyCounts = countBy(done.map((it) => it.state.triage.urgency));
  const categoryCounts = countBy(done.map((it) => it.state.triage.category));

  const summaryParts = [
    `${items.length} email${items.length === 1 ? "" : "s"}`,
    ...(["critical", "high"] as const)
      .filter((u) => urgencyCounts[u])
      .map((u) => `${urgencyCounts[u]} ${u}`),
    ...(Object.keys(categoryCounts) as Category[]).map(
      (c) => `${categoryCounts[c]} ${CATEGORY_LABEL[c]}`,
    ),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-black/60 dark:text-white/60">
          {pendingCount > 0 ? (
            <>
              Triaging… <span className="font-medium">{items.length - pendingCount}</span> of{" "}
              <span className="font-medium">{items.length}</span> done
            </>
          ) : (
            <>{summaryParts.join(" · ")} — sorted by urgency, click a row for the draft reply.</>
          )}
        </p>
        <button
          onClick={onReset}
          className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium transition hover:border-black/40 dark:border-white/20 dark:hover:border-white/50"
        >
          Triage another batch
        </button>
      </div>

      {done.length > 1 && (
        <div className="flex flex-wrap gap-2 text-sm">
          <FilterChip active={filter === null} onClick={() => setFilter(null)}>
            All ({items.length})
          </FilterChip>
          {(Object.keys(categoryCounts) as Category[]).map((c) => (
            <FilterChip key={c} active={filter === c} onClick={() => setFilter(filter === c ? null : c)}>
              {CATEGORY_LABEL[c]} ({categoryCounts[c]})
            </FilterChip>
          ))}
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {visible.map((item) => (
          <TriageRow
            key={item.id}
            item={item}
            expanded={expanded === item.id}
            onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
            onRetry={() => onRetry(item)}
          />
        ))}
      </ul>
    </div>
  );
}

function TriageRow({
  item,
  expanded,
  onToggle,
  onRetry,
}: {
  item: Item;
  expanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
}) {
  const title =
    item.email.subject ?? item.email.from ?? `${item.email.body.split("\n")[0].slice(0, 80)}…`;

  if (item.state.status === "pending") {
    return (
      <li className="flex items-center gap-3 rounded-xl border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-white/5">
        <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          <div className="mt-1.5 h-2 w-2/3 animate-pulse rounded bg-black/10 dark:bg-white/10" />
        </div>
      </li>
    );
  }

  if (item.state.status === "error") {
    return (
      <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-500/40 dark:bg-red-500/10">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="mt-0.5 text-sm text-red-700 dark:text-red-300">{item.state.message}</p>
        </div>
        <button
          onClick={onRetry}
          className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-100 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/20"
        >
          ↻ Retry
        </button>
      </li>
    );
  }

  const { triage } = item.state;
  return (
    <li className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/15 dark:bg-white/5">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-4 text-left transition hover:bg-black/[.03] dark:hover:bg-white/[.06]"
      >
        <span className="text-xs text-black/40 dark:text-white/40">{expanded ? "▾" : "▸"}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{title}</span>
          <span className="block truncate text-sm text-black/60 dark:text-white/60">
            {triage.summary}
          </span>
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${CATEGORY_BADGE[triage.category]}`}
        >
          {CATEGORY_LABEL[triage.category]}
        </span>
        <span
          title={triage.urgency_reason}
          className={`cursor-help rounded-full px-2.5 py-0.5 text-xs font-medium ${URGENCY_BADGE[triage.urgency]}`}
        >
          {triage.urgency}
        </span>
      </button>

      {expanded && (
        <div className="grid gap-4 border-t border-black/10 p-4 sm:grid-cols-2 dark:border-white/10">
          <div className="min-w-0">
            <h3 className="text-xs font-medium uppercase tracking-wide text-black/50 dark:text-white/50">
              Original email
            </h3>
            {(item.email.from || item.email.subject) && (
              <p className="mt-2 text-xs text-black/50 dark:text-white/50">
                {item.email.from && <>From: {item.email.from}</>}
                {item.email.from && item.email.subject && <br />}
                {item.email.subject && <>Subject: {item.email.subject}</>}
              </p>
            )}
            <p className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap text-sm text-black/80 dark:text-white/80">
              {item.email.body}
            </p>
            <p className="mt-3 text-xs text-black/50 dark:text-white/50">
              Sentiment: <span className="font-medium">{triage.sentiment}</span> · Urgency:{" "}
              {triage.urgency_reason}
            </p>
          </div>
          <div className="min-w-0 rounded-xl bg-blue-50 p-4 dark:bg-blue-500/10">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-blue-800/70 dark:text-blue-300/70">
                Suggested reply
              </h3>
              <CopyButton text={triage.suggested_reply} />
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-black/80 dark:text-white/80">
              {triage.suggested_reply}
            </p>
          </div>
        </div>
      )}
    </li>
  );
}

/* ---------- small pieces ---------- */

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 transition ${
        active
          ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500"
          : "border-black/15 hover:border-black/40 dark:border-white/20 dark:hover:border-white/50"
      }`}
    >
      {children}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700"
    >
      {copied ? "Copied ✓" : "⧉ Copy reply"}
    </button>
  );
}

function countBy<K extends string>(keys: K[]): Partial<Record<K, number>> {
  const counts: Partial<Record<K, number>> = {};
  for (const k of keys) counts[k] = (counts[k] ?? 0) + 1;
  return counts;
}
