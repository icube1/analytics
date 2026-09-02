#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARTIFACT_DIR="${FINANCE_FFI_OUT:-$ROOT/artifacts/finance-ffi}"
PROFILE="${FINANCE_FFI_PROFILE:-release}"
HOST_TARGET="$(rustc -vV | sed -n 's/^host: //p')"

human_size() {
  local path="$1"
  if [[ -f "$path" ]]; then
    du -h "$path" | awk '{print $1 "\t" path}'
  fi
}

echo "=== finance-ffi size report ==="
echo "profile=$PROFILE host=$HOST_TARGET"

FINANCE_FFI_PROFILE="$PROFILE" FINANCE_FFI_GENERATE_BINDINGS=0 bash "$ROOT/scripts/build-finance-ffi.sh" >/dev/null

for artifact in "$ARTIFACT_DIR"/*; do
  human_size "$artifact"
done

for target in aarch64-apple-ios aarch64-linux-android x86_64-apple-darwin; do
  if rustup target list --installed | grep -qx "$target"; then
    echo ""
    echo "target=$target"
    FINANCE_FFI_TARGET="$target" FINANCE_FFI_PROFILE="$PROFILE" FINANCE_FFI_GENERATE_BINDINGS=0 \
      bash "$ROOT/scripts/build-finance-ffi.sh" >/dev/null || true
    for artifact in "$ROOT/target/$target/$PROFILE"/libfinance_ffi.*; do
      human_size "$artifact"
    done
  else
    echo "skip target $target (not installed)"
  fi
done

if [[ -d "$ARTIFACT_DIR/bindings" ]]; then
  echo ""
  echo "bindings tree:"
  du -sh "$ARTIFACT_DIR/bindings"/* 2>/dev/null || true
fi
