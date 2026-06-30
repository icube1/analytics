"use client";

import { createPortal } from "react-dom";

interface FileDropOverlayProps {
  visible: boolean;
  title: string;
  hint?: string;
  acceptLabel: string;
}

export function FileDropOverlay({
  visible,
  title,
  hint,
  acceptLabel,
}: FileDropOverlayProps) {
  if (!visible || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[9998] flex items-center justify-center bg-indigo-950/35 p-6 backdrop-blur-[2px]"
      aria-hidden
    >
      <div className="flex max-w-md flex-col items-center rounded-2xl border-2 border-dashed border-indigo-400 bg-white/95 px-8 py-10 text-center shadow-2xl dark:border-indigo-500 dark:bg-zinc-900/95">
        <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-indigo-100 text-2xl dark:bg-indigo-950">
          ↓
        </div>
        <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </p>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {acceptLabel}
        </p>
        {hint && (
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{hint}</p>
        )}
      </div>
    </div>,
    document.body,
  );
}
