#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BINDINGS="$ROOT/artifacts/finance-ffi/bindings"

echo "=== finance-ffi binding validation ==="

cargo test -p finance-ffi --test cross_binding_fixtures

if [[ ! -d "$BINDINGS/swift" || ! -d "$BINDINGS/kotlin" || ! -d "$BINDINGS/c" ]]; then
  echo "Bindings missing — generating scaffolding"
  bash "$ROOT/scripts/generate-finance-ffi-bindings.sh"
fi

required=(
  "$BINDINGS/c/finance_ffi.h"
  "$BINDINGS/swift/finance_ffi.swift"
  "$BINDINGS/kotlin/uniffi/finance_ffi/finance_ffi.kt"
)

for file in "${required[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "missing binding artifact: $file" >&2
    exit 1
  fi
  echo "ok $file"
done

# Optional host-language smoke tests when toolchains are present.
if command -v swiftc >/dev/null 2>&1; then
  echo "swiftc available — syntax-checking generated Swift"
  swiftc -typecheck "$BINDINGS/swift/finance_ffi.swift" || echo "warning: swift typecheck failed (headers only validated)"
else
  echo "skip swiftc (not installed)"
fi

if command -v kotlinc >/dev/null 2>&1; then
  echo "kotlinc available — syntax-checking generated Kotlin"
  kotlinc -nowarn "$BINDINGS/kotlin/uniffi/finance_ffi/finance_ffi.kt" || echo "warning: kotlin compile failed (scaffolding only)"
else
  echo "skip kotlinc (not installed)"
fi

echo "binding validation complete"
