"""tests/unit/agents/test_execute_env.py"""

from __future__ import annotations

from pathlib import Path

from ydsz.infra.agents.workspace.execute_env import inject_agent_execute_env
from ydsz.infra.db.repos.agents import AgentRow
from ydsz.infra.utils.env_file import save_env_file
from ydsz.infra.utils.paths import PathLayout


def _row(agent_id: str = "a1") -> AgentRow:
    return AgentRow(
        id=1,
        agent_id=agent_id,
        user_id=1,
        name="test",
        description=None,
        persona_mbti=None,
        default_model=None,
        system_prompt=None,
        enabled=1,
        config_json=None,
        last_state=None,
        last_error=None,
        created_at=0,
        updated_at=0,
    )


def test_inject_local_shell_uses_ydsz_auth_for_new_layout(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("YDSZ_HOME", str(tmp_path))
    paths = PathLayout(tmp_path)
    paths.ensure_root()
    save_env_file(paths.root / "env", {"GLOBAL_KEY": "global"})

    ws = paths.ensure_agent_workspace("agent-1")
    (ws / ".env").write_text("AGENT_KEY=agent\n", encoding="utf-8")

    spec = inject_agent_execute_env(
        {"type": "local_shell", "root_dir": "/", "virtual_mode": True},
        paths=paths,
        row=_row("agent-1"),
        workspace_dir=ws,
        cfg={"system_files_path": ".ydsz"},
    )
    env = spec["env"]
    assert env["YDSZ_AGENT_ID"] == "agent-1"
    assert (ws / ".ydsz" / "auth").is_dir()
    assert env["YDSZ_AUTH_DIR"] == str(ws / ".ydsz" / "auth")
    assert env["YDSZ_HOME"] == str(paths.root)
    assert env["YDSZ_SKILLS_DIR"] == str(ws / ".ydsz" / "skills")
    assert "GLOBAL_KEY" not in env
    assert "AGENT_KEY" not in env
    assert spec["inherit_env"] is True


def test_inject_legacy_layout_keeps_root_ydsz_auth(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("YDSZ_HOME", str(tmp_path))
    paths = PathLayout(tmp_path)
    paths.ensure_root()
    ws = paths.ensure_agent_workspace("agent-legacy")

    spec = inject_agent_execute_env(
        {"type": "local_shell", "root_dir": "/", "virtual_mode": True},
        paths=paths,
        row=_row("agent-legacy"),
        workspace_dir=ws,
        cfg={},
    )
    assert (ws / ".ydsz-auth").is_dir()
    assert spec["env"]["YDSZ_AUTH_DIR"] == str(ws / ".ydsz-auth")


def test_inject_keeps_legacy_auth_when_tokens_already_there(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("YDSZ_HOME", str(tmp_path))
    paths = PathLayout(tmp_path)
    paths.ensure_root()
    ws = paths.ensure_agent_workspace("agent-mig")
    legacy = ws / ".ydsz-auth"
    legacy.mkdir()
    (legacy / "token.json").write_text("{}", encoding="utf-8")

    spec = inject_agent_execute_env(
        {"type": "local_shell", "root_dir": "/", "virtual_mode": True},
        paths=paths,
        row=_row("agent-mig"),
        workspace_dir=ws,
        cfg={"system_files_path": ".ydsz"},
    )
    assert spec["env"]["YDSZ_AUTH_DIR"] == str(legacy)


def test_inject_composite_default_local_shell(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("YDSZ_HOME", str(tmp_path))
    paths = PathLayout(tmp_path)
    paths.ensure_root()
    ws = paths.ensure_agent_workspace("agent-c")

    spec = inject_agent_execute_env(
        {
            "type": "composite",
            "default": {"type": "local_shell", "root_dir": "/", "virtual_mode": True},
            "routes": {},
        },
        paths=paths,
        row=_row("agent-c"),
        workspace_dir=ws,
        cfg={"system_files_path": ".ydsz"},
    )
    assert spec["default"]["env"]["YDSZ_AGENT_ID"] == "agent-c"
    assert spec["default"]["env"]["YDSZ_AUTH_DIR"] == str(ws / ".ydsz" / "auth")
    assert spec["default"]["inherit_env"] is True


def test_inject_scoped_root_uses_agent_facing_auth_paths(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("YDSZ_HOME", str(tmp_path))
    paths = PathLayout(tmp_path)
    paths.ensure_root()
    root = tmp_path / "scoped"
    root.mkdir()
    ws = root / ".ydsz" / "workspaces" / "agent-s"
    ws.mkdir(parents=True)
    cfg = {
        "system_files_path": ".ydsz",
        "workspace_dir": "/.ydsz/workspaces/agent-s",
        "backend": {
            "type": "local_shell",
            "root_dir": str(root),
            "virtual_mode": True,
        },
    }

    spec = inject_agent_execute_env(
        {"type": "local_shell", "root_dir": str(root), "virtual_mode": True},
        paths=paths,
        row=_row("agent-s"),
        workspace_dir=ws,
        cfg=cfg,
    )
    env = spec["env"]
    assert (ws / ".ydsz" / "auth").is_dir()
    assert env["YDSZ_AUTH_DIR"] == "/.ydsz/workspaces/agent-s/.ydsz/auth"
    assert env["YDSZ_SKILLS_DIR"] == "/.ydsz/workspaces/agent-s/.ydsz/skills"


def test_inject_docker_only_sets_platform_defaults(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("YDSZ_HOME", str(tmp_path))
    paths = PathLayout(tmp_path)
    paths.ensure_root()
    save_env_file(paths.root / "env", {"GLOBAL_KEY": "global"})
    ws = paths.ensure_agent_workspace("agent-2")

    spec = inject_agent_execute_env(
        {"type": "docker"},
        paths=paths,
        row=_row("agent-2"),
        workspace_dir=ws,
        cfg={"system_files_path": ".ydsz"},
    )
    env = spec["env"]
    assert env["YDSZ_AGENT_ID"] == "agent-2"
    assert env["YDSZ_AUTH_DIR"] == str(ws / ".ydsz" / "auth")
    assert "GLOBAL_KEY" not in env
