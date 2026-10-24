"""tests/unit/test_paths.py"""

from __future__ import annotations

from pathlib import Path

from ydsz.infra.utils.paths import PathLayout


def test_root_paths(tmp_path: Path):
    p = PathLayout(tmp_path / ".ydsz")
    assert p.root == tmp_path / ".ydsz"
    assert p.db == tmp_path / ".ydsz" / "ydsz.db"
    assert p.logs_dir == tmp_path / ".ydsz" / "logs"
    assert p.log == tmp_path / ".ydsz" / "logs" / "ydsz.log"
    assert p.config == tmp_path / ".ydsz" / "config.json"


def test_log_dir_creation(tmp_path: Path):
    p = PathLayout(tmp_path / ".ydsz")
    assert not (tmp_path / ".ydsz" / "logs").exists()
    assert p.ensure_log() == tmp_path / ".ydsz" / "logs" / "ydsz.log"
    assert (tmp_path / ".ydsz" / "logs").is_dir()
    assert p.log == tmp_path / ".ydsz" / "logs" / "ydsz.log"


def test_user_dir_uses_username(tmp_path: Path):
    p = PathLayout(tmp_path / ".ydsz")
    assert p.user_dir("alice") == tmp_path / ".ydsz" / "users" / "alice"


def test_agent_workspace(tmp_path: Path):
    p = PathLayout(tmp_path / ".ydsz")
    ws = p.agent_workspace("agent01")
    assert ws == tmp_path / ".ydsz" / "agents" / "agent01"


def test_ensure_root_creates_dir(tmp_path: Path):
    p = PathLayout(tmp_path / ".ydsz")
    p.ensure_root()
    assert (tmp_path / ".ydsz").is_dir()


def test_ensure_agent_workspace(tmp_path: Path):
    p = PathLayout(tmp_path / ".ydsz")
    # New global path
    out = p.ensure_agent_workspace("a1")
    assert out.is_dir()
    assert out == tmp_path / ".ydsz" / "agents" / "a1"


def test_backups_dir(tmp_path: Path) -> None:
    p = PathLayout(tmp_path / ".ydsz")
    assert p.backups_dir == tmp_path / ".ydsz" / "backups"
    assert p.ensure_backups_dir().is_dir()


def test_knowledge_dir(tmp_path: Path) -> None:
    p = PathLayout(tmp_path / ".ydsz")
    assert p.knowledge_dir == tmp_path / ".ydsz" / "knowledge"


def test_path_layout_from_env_defaults_to_dot_ydsz_worker(monkeypatch) -> None:
    monkeypatch.delenv("YDSZ_HOME", raising=False)
    assert PathLayout.from_env().root == Path.home() / ".ydsz-worker"


def test_path_layout_from_env_honors_ydsz_home(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("YDSZ_HOME", str(tmp_path))
    assert PathLayout.from_env().root == tmp_path
