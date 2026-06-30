import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    setIsPending(true);
    const id = setTimeout(() => {
      setDebounced(value);
      setIsPending(false);
    }, delayMs);

    return () => clearTimeout(id);
  }, [value, delayMs]);

  return { debounced, isPending };
}
