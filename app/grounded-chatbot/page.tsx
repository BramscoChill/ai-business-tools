"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HumanCheck } from "@/components/HumanCheck";
import { ErrorBanner } from "@/components/LoadingState";
import type { ChatDebug } from "@/lib/schema";

const MAX_QUESTION_CHARS = 500;

type Mode = "naive" | "grounded";

const PRESETS: { label: string; inScope: boolean }[] = [
  { label: "What filter models do you sell?", inScope: true },
  { label: "How often do I replace the cartridge?", inScope: true },
  { label: "My system is leaking, what do I do?", inScope: true },
  { label: "What do you think of Brita filters?", inScope: false },
  { label: "How do I remove limescale from my kettle?", inScope: false },
  { label: "Can you recommend a plumber in Amsterdam?", inScope: false },
];

const LOADING_MESSAGES: Record<Mode, string[]> = {
  naive: ["Searching the documents…", "Writing an answer…"],
  grounded: [
    "Searching the documents…",
    "Checking relevance…",
    "Writing an answer…",
    "Auditing the answer against the docs…",
  ],
};

type BotAnswer =
  | { status: "pending" }
  | { status: "done"; answer: string; debug: ChatDebug }
  | { status: "error"; message: string };

type Turn = { id: number; question: string; naive: BotAnswer; grounded: BotAnswer };

export default function GroundedChatbotPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Question waiting on the human check; the modal is open while this is set.
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  // Pass from the one verification per session — reused for every question.
  const passRef = useRef<string | null>(null);
  const nextId = useRef(0);

  const busy = turns.some((t) => t.naive.status === "pending" || t.grounded.status === "pending");

  function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setError(null);
    if (q.length > MAX_QUESTION_CHARS) {
      setError(`Questions are limited to ${MAX_QUESTION_CHARS} characters.`);
      return;
    }
    // One human check per session: only the first question opens the modal.
    if (!passRef.current) {
      setPendingQuestion(q);
      return;
    }
    void runQuestion(q);
  }

  async function runQuestion(question: string) {
    const id = nextId.current++;
    setInput("");
    setTurns((prev) => [
      ...prev,
      { id, question, naive: { status: "pending" }, grounded: { status: "pending" } },
    ]);
    // The same question goes to BOTH bots at once; each answer renders as it lands.
    await Promise.all([askBot(id, question, "naive"), askBot(id, question, "grounded")]);
  }

  async function askBot(id: number, question: string, mode: Mode) {
    try {
      const res = await fetch("/api/grounded-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-verify-pass": passRef.current ?? "",
        },
        body: JSON.stringify({ message: question, mode }),
      });
      const body = await res.json().catch(() => null);
      if (res.status === 403) {
        // Pass expired mid-session — the next question re-opens the check.
        passRef.current = null;
        throw new Error("Verification expired — ask again to re-verify.");
      }
      if (!res.ok || typeof body?.answer !== "string" || !body?.debug) {
        throw new Error(body?.error ?? `Request failed (${res.status}).`);
      }
      setAnswer(id, mode, { status: "done", answer: body.answer, debug: body.debug as ChatDebug });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      setAnswer(id, mode, { status: "error", message });
    }
  }

  function setAnswer(id: number, mode: Mode, answer: BotAnswer) {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, [mode]: answer } : t)));
  }

  function reset() {
    setTurns([]);
    setInput("");
    setError(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">💬 Grounded RAG Chatbot</h1>
        <p className="mt-2 text-sm text-black/60 dark:text-white/60">
          The same question goes to two support bots for the fictional AquaPure Water Systems,
          both reading the same three documents — the left one drifts into general knowledge
          when the docs don&apos;t cover a question, the right one is locked to the docs and
          hands off to a human instead.
        </p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {pendingQuestion && (
        <HumanCheck
          onVerified={(pass) => {
            const question = pendingQuestion;
            setPendingQuestion(null);
            passRef.current = pass;
            void runQuestion(question);
          }}
          onCancel={() => setPendingQuestion(null)}
        />
      )}

      {turns.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={reset}
            className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium transition hover:border-black/40 dark:border-white/20 dark:hover:border-white/50"
          >
            ↺ Start a new conversation
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <ChatPanel
          mode="naive"
          badge="❌ Current bot (ungrounded)"
          subtitle="Weak prompt, no guardrails — how many bought chatbots behave"
          turns={turns}
        />
        <ChatPanel
          mode="grounded"
          badge="✅ Fixed bot (grounded)"
          subtitle="Relevance threshold + strict prompt + answer audit"
          turns={turns}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => ask(preset.label)}
              disabled={busy}
              title={preset.inScope ? "Covered by the AquaPure docs" : "NOT covered by the docs"}
              className={`rounded-full border px-3 py-1 transition disabled:opacity-50 ${
                preset.inScope
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:border-emerald-500 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:border-emerald-400"
                  : "border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-500 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:border-amber-400"
              }`}
            >
              {preset.inScope ? "📗" : "🚫"} {preset.label}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={MAX_QUESTION_CHARS}
            placeholder="Ask both bots a question about AquaPure…"
            className="w-full rounded-xl border border-black/15 bg-white px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none dark:border-white/20 dark:bg-white/5 dark:focus:border-blue-400"
          />
          <button
            type="submit"
            disabled={input.trim() === "" || busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Asking…" : "Ask both"}
          </button>
        </form>
        <p className="text-xs text-black/50 dark:text-white/50">
          📗 questions are covered by the three AquaPure documents · 🚫 questions are not — watch
          how each bot handles those. Open <span className="font-medium">Behind the scenes</span>{" "}
          under an answer to see the retrieval scores.
        </p>
      </div>

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
          href="/inbox-triage"
          className="font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          📬 Support Inbox Triage →
        </Link>
      </p>
    </div>
  );
}

/* ---------- chat panel ---------- */

function ChatPanel({
  mode,
  badge,
  subtitle,
  turns,
}: {
  mode: Mode;
  badge: string;
  subtitle: string;
  turns: Turn[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view as answers land.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-black/10 bg-white dark:border-white/15 dark:bg-white/5">
      <header
        className={`border-b p-4 ${
          mode === "naive"
            ? "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10"
            : "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
        }`}
      >
        <h2 className="text-sm font-semibold">{badge}</h2>
        <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">{subtitle}</p>
      </header>

      <div ref={scrollRef} className="flex max-h-[26rem] min-h-[16rem] flex-col gap-3 overflow-y-auto p-4">
        {turns.length === 0 ? (
          <p className="m-auto text-center text-sm text-black/40 dark:text-white/40">
            Pick a question below to ask both bots at once.
          </p>
        ) : (
          turns.map((turn) => (
            <div key={turn.id} className="flex flex-col gap-2">
              <p className="ml-8 self-end rounded-2xl rounded-br-sm bg-blue-600 px-3.5 py-2 text-sm text-white">
                {turn.question}
              </p>
              <AnswerBubble mode={mode} state={turn[mode]} />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function AnswerBubble({ mode, state }: { mode: Mode; state: BotAnswer }) {
  if (state.status === "pending") {
    return (
      <div className="mr-8 flex items-center gap-2.5 self-start rounded-2xl rounded-bl-sm bg-black/[.05] px-3.5 py-2.5 dark:bg-white/[.08]">
        <div className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        <CyclingMessage messages={LOADING_MESSAGES[mode]} />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mr-8 self-start rounded-2xl rounded-bl-sm border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
        {state.message}
      </div>
    );
  }

  return (
    <div className="mr-4 flex flex-col gap-1.5 self-start">
      <div className="rounded-2xl rounded-bl-sm bg-black/[.05] px-3.5 py-2.5 text-sm whitespace-pre-wrap text-black/80 dark:bg-white/[.08] dark:text-white/80">
        {renderAnswer(state.answer)}
      </div>
      <BehindTheScenes mode={mode} debug={state.debug} />
    </div>
  );
}

// The model likes to bold product names with **…** — render just that one
// markdown feature so bubbles don't show raw asterisks; the rest stays text.
function renderAnswer(text: string): React.ReactNode {
  return text
    .split(/\*\*([^*]+)\*\*/g)
    .map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

/* ---------- behind the scenes ---------- */

function BehindTheScenes({ mode, debug }: { mode: Mode; debug: ChatDebug }) {
  return (
    <details className="group text-xs">
      <summary className="cursor-pointer list-none text-black/50 transition hover:text-black/80 dark:text-white/50 dark:hover:text-white/80">
        <span className="inline-block transition group-open:rotate-90">▸</span> Behind the scenes
      </summary>
      <div className="mt-1.5 flex flex-col gap-1.5 rounded-xl border border-black/10 bg-black/[.03] p-3 dark:border-white/10 dark:bg-white/[.04]">
        <p>
          Top relevance score: <span className="font-mono font-medium">{debug.topScore.toFixed(2)}</span>{" "}
          · Threshold passed:{" "}
          {debug.thresholdPassed ? (
            <span className="font-medium text-emerald-700 dark:text-emerald-400">yes ✓</span>
          ) : (
            <span className="font-medium text-red-700 dark:text-red-400">
              no ✗{mode === "grounded" && " — fallback returned without asking the AI"}
            </span>
          )}
        </p>
        <div>
          <p className="text-black/50 dark:text-white/50">Retrieved document chunks:</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {debug.chunks.map((chunk, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3">
                <span className="truncate">{chunk.title}</span>
                <span className="shrink-0 font-mono text-black/50 dark:text-white/50">
                  {chunk.score.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {mode === "grounded" && (
          <p>
            Grounding check:{" "}
            {debug.groundingVerdict === null ? (
              <span className="text-black/50 dark:text-white/50">not needed (no AI answer to audit)</span>
            ) : debug.groundingVerdict ? (
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                grounded ✓ — every claim is backed by the docs
              </span>
            ) : (
              <span className="font-medium text-red-700 dark:text-red-400">
                not grounded ✗ — answer replaced with the fallback
              </span>
            )}
          </p>
        )}
      </div>
    </details>
  );
}

/* ---------- small pieces ---------- */

function CyclingMessage({ messages }: { messages: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, messages.length - 1)), 2500);
    return () => clearInterval(t);
  }, [messages.length]);
  return <p className="text-sm text-black/60 dark:text-white/60">{messages[i]}</p>;
}
