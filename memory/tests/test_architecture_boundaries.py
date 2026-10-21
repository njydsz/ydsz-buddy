"""Architecture boundary checks for the ydsz_memory package layout."""

from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "ydsz_memory"


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            found.add(node.module)
    return found


def _python_files(*parts: str) -> list[Path]:
    return sorted((SRC.joinpath(*parts)).rglob("*.py"))


def test_engine_layers_do_not_import_adapters() -> None:
    offenders: list[str] = []
    for path in [
        *_python_files("domain"),
        *_python_files("pipeline"),
        *_python_files("storage"),
    ]:
        bad = sorted(imp for imp in _imports(path) if imp.startswith("ydsz_memory.adapters"))
        if bad:
            offenders.append(f"{path.relative_to(ROOT)} -> {bad}")

    assert offenders == []


def test_storage_does_not_import_pipeline() -> None:
    offenders: list[str] = []
    for path in _python_files("storage"):
        bad = sorted(imp for imp in _imports(path) if imp.startswith("ydsz_memory.pipeline"))
        if bad:
            offenders.append(f"{path.relative_to(ROOT)} -> {bad}")

    assert offenders == []


def test_memory_service_does_not_import_bridge_adapter() -> None:
    imports = _imports(SRC / "service.py")
    assert not any(imp.startswith("ydsz_memory.adapters.bridge") for imp in imports)


def test_project_map_uses_current_package_layout() -> None:
    project_map = (ROOT / "docs" / "agent" / "PROJECT_MAP.md").read_text(encoding="utf-8")
    legacy_markers = [
        "src/ydsz_memory/backends",
        "src/ydsz_memory/bridge",
        "src/ydsz_memory/cli",
        "src/ydsz_memory/dashboard",
        "src/ydsz_memory/extractor",
        "src/ydsz_memory/llm",
        "src/ydsz_memory/page",
        "src/ydsz_memory/promotion",
        "src/ydsz_memory/recall",
        "ydsz_memory.recall",
        "ydsz_memory.bridge",
    ]
    assert [marker for marker in legacy_markers if marker in project_map] == []
