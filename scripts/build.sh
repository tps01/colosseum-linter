#!/usr/bin/env bash
# Build the Colosseum Linter VSIX (Linux/macOS / CI).
# Usage (from repo root):
#   bash scripts/build.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXTENSION_DIR="${REPO_ROOT}/extension"

cd "${EXTENSION_DIR}"

if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

npm run compile
npm run package

shopt -s nullglob
vsix=(colosseum-linter-*.vsix)
if [[ ${#vsix[@]} -eq 0 ]]; then
  echo "VSIX was not produced in ${EXTENSION_DIR}" >&2
  exit 1
fi

# Prefer the newest match if several exist.
latest="$(ls -t colosseum-linter-*.vsix | head -n 1)"
echo "Built ${EXTENSION_DIR}/${latest}"
