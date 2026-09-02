import { isCapacitorNative } from "@/lib/mobile/runtime";
import type { SessionClientKind } from "./contracts";

export function resolveSessionClientKind(): SessionClientKind {
  return isCapacitorNative() ? "mobile" : "web";
}
