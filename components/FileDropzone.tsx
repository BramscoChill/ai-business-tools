"use client";

import { useRef, useState, type DragEvent } from "react";

type Props = {
  accept: string; // e.g. "application/pdf"
  // Extension fallback (e.g. ".txt,.csv") — browsers report inconsistent MIME
  // types for text/CSV files, so match on the file name when the type fails.
  acceptExt?: string;
  acceptLabel: string; // e.g. "PDF"
  maxBytes: number;
  onFile: (file: File) => void;
  disabled?: boolean;
};

export function FileDropzone({ accept, acceptExt, acceptLabel, maxBytes, onFile, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function handleFile(file: File | undefined | null) {
    setLocalError(null);
    if (!file) return;
    const typeOk = accept.split(",").some((t) => file.type === t.trim());
    const extOk = acceptExt
      ?.split(",")
      .some((x) => file.name.toLowerCase().endsWith(x.trim().toLowerCase()));
    if (!typeOk && !extOk) {
      setLocalError(`Only ${acceptLabel} files are supported.`);
      return;
    }
    if (file.size > maxBytes) {
      setLocalError(
        `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is ${Math.round(maxBytes / 1024 / 1024)} MB.`,
      );
      return;
    }
    onFile(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    handleFile(e.dataTransfer.files?.[0]);
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Upload a ${acceptLabel} file`}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-10 text-center transition ${
          dragging
            ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10"
            : "border-black/20 hover:border-black/40 dark:border-white/25 dark:hover:border-white/50"
        } ${disabled ? "pointer-events-none opacity-50" : ""}`}
      >
        <span className="text-3xl">📄</span>
        <p className="font-medium">
          Drop a {acceptLabel} here, or <span className="text-blue-600 dark:text-blue-400">browse</span>
        </p>
        <p className="text-xs text-black/50 dark:text-white/50">
          Max {Math.round(maxBytes / 1024 / 1024)} MB · processed once, nothing is stored
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={acceptExt ? `${accept},${acceptExt}` : accept}
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {localError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{localError}</p>}
    </div>
  );
}
