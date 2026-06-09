"use client";

export function FieldHelp({ text }: { text: string }) {
  return (
    <span className="group/help relative inline-flex shrink-0">
      <button
        type="button"
        tabIndex={0}
        className="inline-flex size-4 cursor-help items-center justify-center rounded-full border border-zinc-300 bg-zinc-50 text-[10px] font-bold leading-none text-zinc-500 transition-colors hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-indigo-500 dark:hover:bg-indigo-950 dark:hover:text-indigo-300"
        aria-label="Пояснение к полю"
      >
        ?
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-50 hidden w-60 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-left text-[11px] font-normal leading-snug text-zinc-600 shadow-lg group-hover/help:block group-focus-within/help:block dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
      >
        {text}
      </span>
    </span>
  );
}
