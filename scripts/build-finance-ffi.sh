#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARTIFACT_DIR="${FINANCE_FFI_OUT:-$ROOT/artifacts/finance-ffi}"
TARGET="${FINANCE_FFI_TARGET:-$(rustc -vV | sed -n 's/^host: //p')}"
PROFILE="${FINANCE_FFI_PROFILE:-release}"

mkdir -p "$ARTIFACT_DIR"

echo "Building finance-ffi for target=$TARGET profile=$PROFILE"

cargo build -p finance-ffi --profile "$PROFILE" --target "$TARGET"

LIB_BASENAME="libfinance_ffi"
case "$TARGET" in
  *apple-ios* | *apple-darwin*)
    LIB_PATH="$ROOT/target/$TARGET/$PROFILE/${LIB_BASENAME}.a"
    ;;
  *windows*)
    LIB_PATH="$ROOT/target/$TARGET/$PROFILE/finance_ffi.dll"
    ;;
  *)
    LIB_PATH="$ROOT/target/$TARGET/$PROFILE/${LIB_BASENAME}.so"
    ;;
esac

if [[ -f "$LIB_PATH" ]]; then
  cp "$LIB_PATH" "$ARTIFACT_DIR/"
  echo "Copied $(basename "$LIB_PATH") to $ARTIFACT_DIR"
else
  # staticlib on some hosts
  ALT="$ROOT/target/$TARGET/$PROFILE/${LIB_BASENAME}.a"
  if [[ -f "$ALT" ]]; then
    cp "$ALT" "$ARTIFACT_DIR/"
    echo "Copied $(basename "$ALT") to $ARTIFACT_DIR"
  else
    echo "warning: native library not found at $LIB_PATH" >&2
  fi
fi

if [[ "${FINANCE_FFI_GENERATE_BINDINGS:-1}" == "1" ]]; then
  bash "$ROOT/scripts/generate-finance-ffi-bindings.sh"
fi

echo "finance-ffi artifacts ready under $ARTIFACT_DIR"
