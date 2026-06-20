#!/usr/bin/env bash
# Check that every public Tauri command is documented in
# `.docs/api/tauri-commands.md`. Exits non-zero with a diff-style report if
# the docs drift.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
DOC="${ROOT}/.docs/api/tauri-commands.md"
COMMANDS_DIR="${ROOT}/remi-app/src-tauri/src/commands"

if [[ ! -d "${COMMANDS_DIR}" ]]; then
  echo "::error::Tauri commands directory not found: ${COMMANDS_DIR}"
  exit 1
fi

# Extract every #[tauri::command] function name.
declared=$(
  grep -RhE '^\s*#\[tauri::command\]' "${COMMANDS_DIR}" -A1 \
    | awk '/fn[[:space:]]+[a-z_][a-z0-9_]*/ { sub(/^[[:space:]]*fn[[:space:]]*/, "", $0); print $0 }' \
    | sed -E 's/\(.*$//' \
    | sort -u
)

# Extract every command mentioned in the docs file.
documented=$(
  grep -oE '\|\s*[a-z][a-z0-9_]+\s*\|' "${DOC}" \
    | sed -E 's/^[^a-z]*//; s/[[:space:]]+$//' \
    | sort -u
)

missing=()
while read -r cmd; do
  [[ -z "${cmd}" ]] && continue
  if ! grep -qE "(^|[^a-z0-9_])${cmd}([^a-z0-9_]|$)" <<<"${documented}"; then
    missing+=("${cmd}")
  fi
done <<<"${declared}"

if (( ${#missing[@]} > 0 )); then
  echo "::error::Tauri commands missing from ${DOC}:"
  printf '  - %s\n' "${missing[@]}"
  exit 1
fi

echo "All $(echo "${declared}" | wc -l | tr -d ' ') Tauri commands are documented."
