"use client";

import { useEffect, useState } from "react";

type Challenge = { token: string; svg: string };

async function fetchChallenge(): Promise<Challenge> {
  const res = await fetch("/api/challenge", { cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.token || !body?.svg) {
    throw new Error("Could not load a verification code.");
  }
  return body as Challenge;
}

/**
 * Modal that asks the user to type a distorted code before an AI request is
 * sent. On success it hands the parent a short-lived pass to attach as the
 * `x-verify-pass` header.
 */
export function HumanCheck({
  onVerified,
  onCancel,
}: {
  onVerified: (pass: string) => void;
  onCancel: () => void;
}) {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    setChallenge(null);
    setAnswer("");
    fetchChallenge().then(setChallenge, (e: unknown) => {
      setError(e instanceof Error ? e.message : "Could not load a verification code.");
    });
  }

  useEffect(() => {
    let cancelled = false;
    fetchChallenge().then(
      (c) => {
        if (!cancelled) setChallenge(c);
      },
      (e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load a verification code.");
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: challenge.token, answer }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.pass) {
        setError(body?.error ?? "Verification failed — try the new code.");
        refresh();
        return;
      }
      onVerified(body.pass as string);
    } catch {
      setError("Verification failed — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Human verification"
    >
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-black/10 bg-white p-6 shadow-xl dark:border-white/15 dark:bg-neutral-900"
      >
        <div>
          <h2 className="text-lg font-semibold">Quick check before we process</h2>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Type the digits below so we know you&apos;re not a bot.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {challenge ? (
            // Rendered via an <img> data URI so the SVG can't run scripts.
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              alt="Verification code (digits)"
              src={`data:image/svg+xml;utf8,${encodeURIComponent(challenge.svg)}`}
              className="h-[60px] rounded-lg"
            />
          ) : (
            <div className="h-[60px] w-[188px] animate-pulse rounded-lg bg-black/10 dark:bg-white/10" />
          )}
          <button
            type="button"
            onClick={refresh}
            className="text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            ↻ New code
          </button>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <input
          autoFocus
          inputMode="numeric"
          maxLength={5}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="5 digits"
          className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-lg tracking-[0.3em] focus:border-blue-500 focus:outline-none dark:border-white/20 dark:focus:border-blue-400"
        />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium transition hover:border-black/40 dark:border-white/20 dark:hover:border-white/50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!challenge || answer.replace(/\D/g, "").length < 5 || busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Checking…" : "Verify & continue"}
          </button>
        </div>
      </form>
    </div>
  );
}
