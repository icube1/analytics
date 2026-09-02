#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/artifacts/finance-ffi/bindings"
LIB_PATH="$ROOT/target/debug/libfinance_ffi.so"

mkdir -p "$OUT/swift" "$OUT/kotlin" "$OUT/c"

echo "Generating UniFFI bindings into $OUT"

# Build debug cdylib for bindgen when release artifact is unavailable.
if [[ ! -f "$LIB_PATH" ]]; then
  cargo build -p finance-ffi --features cli
  LIB_PATH="$ROOT/target/debug/libfinance_ffi.so"
fi

cargo run -p finance-ffi --features cli --bin uniffi-bindgen -- generate \
  --library "$LIB_PATH" \
  --language swift \
  --out-dir "$OUT/swift"

cargo run -p finance-ffi --features cli --bin uniffi-bindgen -- generate \
  --library "$LIB_PATH" \
  --language kotlin \
  --out-dir "$OUT/kotlin"

# UniFFI 0.27 emits a stable C ABI header alongside Swift bindings.
if [[ -f "$OUT/swift/finance_ffiFFI.h" ]]; then
  cp "$OUT/swift/finance_ffiFFI.h" "$OUT/c/finance_ffi.h"
fi

# Scaffolding markers for hosts without Swift/Kotlin toolchains.
cat >"$OUT/README.md" <<'EOF'
# Generated finance-ffi bindings

Produced by `scripts/generate-finance-ffi-bindings.sh`. These files are build
artifacts — do not commit. Mobile hosts copy the Swift package or Kotlin module
into their native projects after `cap add`.

Regenerate when `finance-ffi` exports change:

```bash
npm run build:ffi
```
EOF

echo "Bindings generated under $OUT"
