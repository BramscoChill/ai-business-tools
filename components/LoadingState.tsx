"use client";

import { useEffect, useState } from "react";

export function LoadingState({ messages }: { messages: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, messages.length - 1)), 3500);
    return () => clearInterval(t);
  }, [messages.length]);

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-black/10 bg-white p-10 dark:border-white/15 dark:bg-white/5">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      <p className="text-sm text-black/60 dark:text-white/60">{messages[i]}</p>
    </div>
  );
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
      <p>{message}</p>
      {onDismiss && (
        <button onClick={onDismiss} className="font-bold" aria-label="Dismiss error">
          ×
        </button>
      )}
    </div>
  );
}
