#!/usr/bin/env bash
# Run Ydsz Worker against the sibling gateway source for local development.
set -euo pipefail
cd "$(dirname "$0")/.."
bridge_dir="$(cd ../ydsz-gateway && pwd)"
if [[ ! -x .venv/bin/python ]]; then
  echo "Create the Ydsz development environment first: uv sync --extra dev" >&2
  exit 1
fi
if ! .venv/bin/python - "$bridge_dir" <<'PY'
import sys
from pathlib import Path

try:
    import ydsz_gateway
    expected = Path(sys.argv[1]) / "src/ydsz_gateway/__init__.py"
    sys.exit(Path(ydsz_gateway.__file__).resolve() != expected.resolve())
except ImportError:
    sys.exit(1)
PY
then
  uv pip install --python .venv/bin/python --no-deps --editable "$bridge_dir"
fi
# A normal uv run would replace the editable gateway with the locked PyPI release.
exec uv run --no-sync ydsz-worker run "$@"
