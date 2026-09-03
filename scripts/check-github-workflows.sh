#!/usr/bin/env bash
# Fail if GitHub workflow YAML is invalid or uses bash heredocs.
# Unindented heredocs break workflow parsing; appleboy/ssh-action script_stop
# also injects shell between heredoc lines.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

failed=0
while IFS= read -r -d '' file; do
  if grep -nE "<<-?'?[A-Za-z_][A-Za-z0-9_]*" "$file"; then
    echo "heredoc in $file: use a one-line python3 -c / shell command instead" >&2
    failed=1
  fi
done < <(find .github/workflows -name '*.yml' -print0)

if python3 -c 'import yaml' >/dev/null 2>&1; then
  python3 - <<'PY'
from pathlib import Path
import sys
import yaml

ok = True
for path in sorted(Path(".github/workflows").glob("*.yml")):
    try:
        yaml.safe_load(path.read_text(encoding="utf-8"))
        print(f"  {path} ok")
    except yaml.YAMLError as error:
        print(f"  {path} invalid YAML: {error}", file=sys.stderr)
        ok = False
sys.exit(0 if ok else 1)
PY
else
  echo "PyYAML not installed; skipped parse (heredoc scan still ran)"
fi

exit "$failed"
