"""`ydsz-worker init` — bootstrap a fresh Ydsz Worker install (DB + first admin)."""

from __future__ import annotations

import shutil

import click


@click.command("init")
@click.option(
    "--admin-username",
    envvar="YDSZ_ADMIN_USERNAME",
    default=None,
    help="First admin username (or set YDSZ_ADMIN_USERNAME).",
)
@click.option(
    "--admin-password",
    envvar="YDSZ_ADMIN_PASSWORD",
    default=None,
    help="First admin password (or set YDSZ_ADMIN_PASSWORD).",
)
@click.option(
    "--admin-display-name",
    envvar="YDSZ_ADMIN_DISPLAY_NAME",
    default=None,
    help="Optional display name for the admin user.",
)
@click.option(
    "--force",
    is_flag=True,
    default=False,
    help="Wipe existing ~/.ydsz-worker contents before bootstrapping.",
)
@click.option(
    "--yes",
    "non_interactive",
    is_flag=True,
    default=False,
    help="Skip all interactive prompts.",
)
def init(
    admin_username: str | None,
    admin_password: str | None,
    admin_display_name: str | None,
    force: bool,
    non_interactive: bool,
) -> None:
    """Bootstrap an Ydsz Worker server (~/.ydsz-worker dir, DB migrations, first admin)."""
    from ydsz.config import load_config
    from ydsz.infra.agents.plugins.manager import PluginManager
    from ydsz.infra.db.factory import open_database
    from ydsz.infra.db.migrate import run_migrations
    from ydsz.infra.db.repos.users import UserRepo
    from ydsz.infra.errors import YdszError
    from ydsz.infra.users.password import hash_password, validate_password_policy
    from ydsz.infra.utils.env_file import apply_env_file, env_file_path
    from ydsz.infra.utils.paths import PathLayout

    paths = PathLayout.from_env()
    home = paths.root

    # Sidecar files (ydsz-login.txt, NAS share metadata) must not block first
    # bootstrap. Only an existing control-plane DB counts as an install.
    has_db = (home / "ydsz.db").is_file()
    if home.exists() and any(home.iterdir()):
        if has_db and not force:
            click.echo(
                f"error: {home} already exists and is not empty. Use --force to reset.",
                err=True,
            )
            raise SystemExit(1)
        if force:
            if not non_interactive:
                from ydsz.cli.support import prompts as _prompts

                if not _prompts.confirm(
                    f"Wipe {home}? This deletes ALL Ydsz Worker state.", default=False
                ):
                    click.echo("aborted", err=True)
                    raise SystemExit(1)
            shutil.rmtree(home)

    paths.ensure_root()
    PluginManager(plugins_dir=paths.plugins_dir, config_path=paths.config).seed_bundled()
    apply_env_file(env_file_path(paths.root))
    config = load_config(paths.config)
    db = open_database(config, paths)
    try:
        run_migrations(db)

        username = admin_username
        password = admin_password
        display_name = admin_display_name

        if not non_interactive:
            from ydsz.cli.support import prompts as _prompts

            if not username:
                username = _prompts.text("Admin username:")
            if not password:
                password = _prompts.password("Admin password:")
            if display_name is None:
                display_name = _prompts.text("Display name (optional):", default="") or None

        if not username:
            click.echo("error: admin username is required", err=True)
            raise SystemExit(1)
        try:
            validate_password_policy(password or "")
        except YdszError as exc:
            click.echo(f"error: {exc.message}", err=True)
            raise SystemExit(1) from None

        user_repo = UserRepo(db)
        if user_repo.get_by_username(username) is not None:
            # 幂等引导（issue #1866）：外部数据库（PostgreSQL）不会在 ~/.ydsz-worker
            # 生成 ydsz.infra.db，容器重启后 entrypoint 会重跑 init；此时跳过创建，
            # 避免管理员 INSERT 撞 UNIQUE(username) 直接崩溃。
            click.echo(f"  admin user '{username}' already exists, skipping.")
        else:
            user_repo.create(
                username=username,
                password_hash=hash_password(password or ""),
                role="admin",
                display_name=display_name,
            )
    finally:
        db.close()

    click.echo(f"\u2705 Ydsz Worker bootstrapped at {home}")
    click.echo(f"   admin user: {username}")
    click.echo(
        "   next: `ydsz-worker run` (optional: `ydsz-worker agent use <id>` to pin default agent)"
    )
