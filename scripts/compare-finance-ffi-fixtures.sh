#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== finance-ffi fixture parity (Rust boundary) ==="
cargo test -p finance-ffi --test cross_binding_fixtures -- --quiet
echo "fixture parity ok"
