/**
 * Experimental Rust compound engine gate.
 * Production UI keeps TypeScript as source of truth until parity passes.
 */
export function isRustCompoundParityEnabled(): boolean {
  return process.env.NEXT_PUBLIC_RUST_COMPOUND_PARITY === "1";
}

export function shouldCheckCompoundParity(explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  return process.env.NODE_ENV !== "production";
}
