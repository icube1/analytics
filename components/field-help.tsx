"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const TOOLTIP_WIDTH = 240;
const TOOLTIP_GAP = 6;

export function FieldHelp({ text }: { text: string }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{
    x: number;
    y: number;
    placement: "top" | "bottom";
  } | null>(null);

  const updatePosition = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const placement =
      spaceBelow >= 72 || spaceBelow >= spaceAbove ? "bottom" : "top";
    const y =
      placement === "bottom" ? rect.bottom + TOOLTIP_GAP : rect.top - TOOLTIP_GAP;

    setCoords({ x, y, placement });
  }, []);

  const show = () => {
    updatePosition();
    setVisible(true);
  };

  const hide = () => setVisible(false);

  useEffect(() => {
    if (!visible) return;

    const onReposition = () => updatePosition();
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);

    return () => {
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [visible, updatePosition]);

  const tooltip =
    visible && coords
      ? createPortal(
          <span
            role="tooltip"
            style={{
              position: "fixed",
              left: coords.x,
              top: coords.y,
              width: TOOLTIP_WIDTH,
              zIndex: 9999,
              transform:
                coords.placement === "top"
                  ? "translate(-50%, -100%)"
                  : "translateX(-50%)",
            }}
            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-left text-[11px] font-normal leading-snug whitespace-pre-line text-zinc-600 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            {text}
          </span>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        tabIndex={0}
        onMouseEnter={show}
        onFocus={show}
        onMouseLeave={hide}
        onBlur={hide}
        className="inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full border border-zinc-300 bg-zinc-50 text-[10px] font-bold leading-none text-zinc-500 transition-colors hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-indigo-500 dark:hover:bg-indigo-950 dark:hover:text-indigo-300"
        aria-label="Пояснение к полю"
      >
        ?
      </button>
      {tooltip}
    </>
  );
}
