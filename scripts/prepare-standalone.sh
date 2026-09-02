#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d .next/standalone ]]; then
  echo "Missing .next/standalone — run npm run build first" >&2
  exit 1
fi

mkdir -p .next/standalone/.next/static
cp -r .next/static/. .next/standalone/.next/static/

if [[ -d public ]]; then
  cp -r public .next/standalone/public
fi

echo "Standalone bundle ready at .next/standalone/"
