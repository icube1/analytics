#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/wasm/finance-wasm"

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "wasm-pack is required. Install with: cargo install wasm-pack --version 0.13.1 --locked" >&2
  exit 1
fi

wasm-pack build "$ROOT/crates/finance-wasm" \
  --target web \
  --out-dir "$OUT" \
  --out-name finance_wasm \
  --release

rm -f "$OUT/.gitignore"

echo "Built finance WASM package at $OUT"
