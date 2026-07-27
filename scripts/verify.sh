#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="$ROOT/.venv"
PYTHON="${PYTHON_BIN:-python3}"

if ! command -v node >/dev/null 2>&1 ||
  ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) < 22 ? 1 : 0)'; then
  echo "Node.js 22 or newer is required." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1 ||
  ! npm --version | awk -F. 'NR == 1 { exit ($1 < 10) }'; then
  echo "npm 10 or newer is required." >&2
  exit 1
fi

if ! command -v "$PYTHON" >/dev/null 2>&1 ||
  ! "$PYTHON" -c 'import sys; raise SystemExit(sys.version_info < (3, 10))'; then
  echo "Python 3.10 or newer is required." >&2
  exit 1
fi

if [[ ! -x "$VENV/bin/python" ]]; then
  "$PYTHON" -m venv "$VENV"
fi

"$VENV/bin/python" -m pip install --upgrade pip
"$VENV/bin/python" -m pip install --requirement "$ROOT/aws-runner/requirements.txt"

(
  cd "$ROOT"
  npm ci
  PATH="$VENV/bin:$PATH" npm test
)

echo "Reproducibility verification passed."
