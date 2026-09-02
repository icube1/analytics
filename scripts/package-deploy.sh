#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUTPUT="${1:-deploy.tar.gz}"
STANDALONE=".next/standalone"

if [[ ! -f "$STANDALONE/server.js" ]]; then
  echo "Missing $STANDALONE/server.js — run npm run build:standalone first" >&2
  exit 1
fi

for forbidden in target crates apps/web; do
  if [[ -e "$STANDALONE/$forbidden" ]]; then
    echo "Refusing to package forbidden path in standalone: $forbidden" >&2
    exit 1
  fi
done

tar -czf "$OUTPUT" -C "$STANDALONE" .

bytes="$(wc -c <"$OUTPUT" | tr -d ' ')"
echo "Created $OUTPUT ($(numfmt --to=iec-i --suffix=B "$bytes" 2>/dev/null || echo "${bytes} bytes"))"

REPORT_DIR="${CI_REPORT_DIR:-$ROOT/ci-reports}"
mkdir -p "$REPORT_DIR"
printf '{"deployTarBytes": %s, "deployTar": "%s"}\n' "$bytes" "$OUTPUT" \
  >"$REPORT_DIR/deploy-artifact.json"
