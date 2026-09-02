#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d .next/standalone ]]; then
  echo "Missing .next/standalone — run npm run build first" >&2
  exit 1
fi

STANDALONE=".next/standalone"

mkdir -p "$STANDALONE/.next/static"
cp -r .next/static/. "$STANDALONE/.next/static/"

if [[ -d public ]]; then
  cp -r public "$STANDALONE/public"
fi

PRUNE_PATHS=(
  target crates apps docs fixtures deploy __tests__ scripts coverage
  Cargo.lock Cargo.toml rust-toolchain.toml jest.config.js eslint.config.mjs
  README.md AGENTS.md CLAUDE.md tsconfig.tsbuildinfo
)

for rel_path in "${PRUNE_PATHS[@]}"; do
  if [[ -e "$STANDALONE/$rel_path" ]]; then
    rm -rf "$STANDALONE/$rel_path"
  fi
done

echo "Standalone bundle ready at $STANDALONE/"
