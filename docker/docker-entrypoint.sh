#!/usr/bin/env bash
# =============================================================================
# Ydsz Worker 容器入口脚本
#
# 环境变量:
#   HOME                      — 必须为 /data，使 ~/.ydsz 映射到数据卷
#   YDSZ_DEFAULT_PASSWORD    — 首次管理员密码（须 ≥8 位且含字母和数字）。
#                               合格则 ydsz-worker init 建账号；未设置或未通过
#                               策略则不建管理员，启动后走 Web 设置向导。
#   YDSZ_ADMIN_USERNAME      — 首次管理员用户名（默认: admin）
#   YDSZ_ADMIN_DISPLAY_NAME  — 可选显示名
#   YDSZ_PORT                — 服务端口（默认: 8088）
#
# 首次引导（issue #502）：容器不得因弱默认密码重启循环。未设置或不合格
# 的 YDSZ_DEFAULT_PASSWORD 不再静默换成随机管理员密码，而是把向导口令
# 写到数据卷（/data/.ydsz/ydsz-login.txt），打开页面走设置向导。
#
# 初始化标记（issue #1866）：PostgreSQL 等外部数据库不会在数据卷生成
# ydsz.db，仅凭 DB_FILE 判断会在每次重启重复执行 ydsz-worker init（管理员
# INSERT 撞 UNIQUE 约束直接崩溃）。ydsz-worker init 成功后写入
# /data/.ydsz/.initialized，重启命中该标记即跳过引导直接启动。
# =============================================================================
set -euo pipefail

export HOME="${HOME:-/data}"
YDSZ_HOME="${YDSZ_HOME:-${HOME}/.ydsz}"
export YDSZ_HOME
DB_FILE="${YDSZ_HOME}/ydsz.db"
INIT_MARKER="${YDSZ_HOME}/.initialized"
CREDENTIAL_FILE="${YDSZ_HOME}/credential.txt"
WIZARD_FILE="${YDSZ_HOME}/ydsz-login.txt"
ADMIN_USERNAME="${YDSZ_ADMIN_USERNAME:-admin}"
ADMIN_DISPLAY_NAME="${YDSZ_ADMIN_DISPLAY_NAME:-Admin}"
PORT="${YDSZ_PORT:-8088}"

# 与 src/ydsz/infra/users/password.py 的 _COMMON_PASSWORDS 保持一致。
_YDSZ_COMMON_PASSWORDS="password password1 password12 password123 12345678 123456789 qwerty123 admin123 welcome1 letmein1 changeme1 ydsz123 abc12345 iloveyou1"

# 生成随机口令（首字符字母、末字符数字，避开易混淆字符）。
ydsz_random_password() {
    local letters='abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
    local digits='23456789'
    local all="${letters}${digits}" n=16 out="" i b
    b="$(od -An -N1 -tu1 /dev/urandom 2>/dev/null | tr -d '[:space:]')"
    out="${letters:$((b % ${#letters})):1}"
    for ((i = 1; i < n - 1; i++)); do
        b="$(od -An -N1 -tu1 /dev/urandom 2>/dev/null | tr -d '[:space:]')"
        out+="${all:$((b % ${#all})):1}"
    done
    b="$(od -An -N1 -tu1 /dev/urandom 2>/dev/null | tr -d '[:space:]')"
    out+="${digits:$((b % ${#digits})):1}"
    printf '%s' "$out"
}

# 校验是否满足应用侧密码策略。失败时向 stderr 输出原因，返回非零。
ydsz_validate_password() {
    local pw="$1" lower
    if [ -z "$pw" ]; then
        echo "密码为空" >&2
        return 1
    fi
    if [ "${#pw}" -lt 8 ]; then
        echo "密码长度至少 8 位" >&2
        return 1
    fi
    if ! printf '%s' "$pw" | grep -q '[A-Za-z]'; then
        echo "密码必须同时包含字母和数字" >&2
        return 1
    fi
    if ! printf '%s' "$pw" | grep -q '[0-9]'; then
        echo "密码必须同时包含字母和数字" >&2
        return 1
    fi
    lower="$(printf '%s' "$pw" | tr 'A-Z' 'a-z')"
    case " ${_YDSZ_COMMON_PASSWORDS} " in
        *" ${lower} "*)
            echo "密码过于常见" >&2
            return 1
            ;;
    esac
    return 0
}

# 向导口令写到数据卷，并让 $HOME/ydsz-login.txt 指向同一文件（服务端读 HOME）。
ydsz_seed_wizard_password() {
    mkdir -p "$YDSZ_HOME" "$HOME"
    if [ ! -s "$WIZARD_FILE" ]; then
        ydsz_random_password > "$WIZARD_FILE"
        chmod 600 "$WIZARD_FILE"
    fi
    local home_file="${HOME}/ydsz-login.txt"
    if [ "$home_file" = "$WIZARD_FILE" ]; then
        return 0
    fi
    if [ -f "$home_file" ] && [ ! -L "$home_file" ]; then
        cp -f "$home_file" "$WIZARD_FILE"
        chmod 600 "$WIZARD_FILE"
        return 0
    fi
    ln -sfn "$WIZARD_FILE" "$home_file"
}

ydsz_write_setup_hint() {
    local pw
    pw="$(tr -d '\n\r' < "$WIZARD_FILE")"
    cat > "$CREDENTIAL_FILE" << EOF
Ydsz Worker Setup Required
====================
URL:      http://<host>:${PORT}

No admin account has been created yet.
Open the dashboard and complete the setup wizard.

Wizard password: ${pw}

This password only unlocks the wizard (same value as ydsz-login.txt).
Choose the admin username and password in the browser.
EOF
    chmod 600 "$CREDENTIAL_FILE"
}

ydsz_write_admin_credential() {
    local password="$1"
    cat > "$CREDENTIAL_FILE" << EOF
Ydsz Worker Login Credential
======================
URL:      http://<host>:${PORT}
Username: ${ADMIN_USERNAME}
Password: ${password}

Please change this password after first login!
  - Via Web: avatar menu → Change password
  - Via CLI: docker exec -it <container> ydsz-worker user passwd --username $ADMIN_USERNAME

This file is rewritten whenever the initial password is (re)generated here.
If you changed the password inside the Web console, that password wins.
EOF
    chmod 600 "$CREDENTIAL_FILE"
}

ydsz_start_setup_wizard() {
    echo "[entrypoint] 将启动设置向导。向导口令已写入: $WIZARD_FILE"
    echo "[entrypoint] 打开 http://<host>:${PORT} 完成初始设置。"
    ydsz_seed_wizard_password
    ydsz_write_setup_hint
}

ydsz_run_init() {
    local password="$1" init_log="$2"
    ydsz-worker init \
        --yes \
        --admin-username "$ADMIN_USERNAME" \
        --admin-password "$password" \
        ${ADMIN_DISPLAY_NAME:+--admin-display-name "$ADMIN_DISPLAY_NAME"} \
        >"$init_log" 2>&1
}

ydsz_entrypoint_main() {
    local default_password="${YDSZ_DEFAULT_PASSWORD:-}"
    local init_log reason

    if [ ! -f "$DB_FILE" ] && [ ! -f "$INIT_MARKER" ]; then
        echo "[entrypoint] 首次启动，正在初始化 Ydsz Worker..."
        mkdir -p "$YDSZ_HOME"

        if [ -n "$default_password" ] && ydsz_validate_password "$default_password" 2>/dev/null; then
            init_log="$(mktemp)"
            if ydsz_run_init "$default_password" "$init_log"; then
                # init 对已有管理员幂等（输出 "already exists, skipping"，见
                # cli/commands/init.py）。这种情况说明数据库早已完成引导，
                # 重写凭据文件只会写下一个从未生效的密码，故保持原文件。
                if grep -q 'already exists, skipping' "$init_log"; then
                    echo "[entrypoint] 数据库已完成引导（管理员已存在），保留现有凭据文件。"
                else
                    ydsz_write_admin_credential "$default_password"
                    echo "[entrypoint] 凭据已保存至: $CREDENTIAL_FILE"
                fi
                rm -f "$init_log"
                touch "$INIT_MARKER"
                echo "[entrypoint] 已写入初始化标记 ${INIT_MARKER}，重启将跳过 ydsz-worker init。"
            elif grep -qiE 'password is too common|password too short|password must include' "$init_log"; then
                cat "$init_log" >&2 || true
                rm -f "$init_log"
                echo "[entrypoint] 指定的初始密码被应用拒绝，改为启动设置向导。"
                ydsz_start_setup_wizard
            else
                cat "$init_log" >&2 || true
                rm -f "$init_log"
                echo "[entrypoint] 初始化失败（不是密码策略问题）。若数据目录已有文件但没有 ydsz.db（或使用外部数据库后端），请检查卷挂载与数据库连接。" >&2
                exit 1
            fi
        else
            if [ -z "$default_password" ]; then
                echo "[entrypoint] 未设置 YDSZ_DEFAULT_PASSWORD，不自动创建管理员。"
            else
                reason="$(ydsz_validate_password "$default_password" 2>&1 || true)"
                echo "[entrypoint] YDSZ_DEFAULT_PASSWORD 未通过密码策略（${reason:-过弱或过于常见}），不自动创建管理员。"
            fi
            ydsz_start_setup_wizard
        fi
    fi

    if [ $# -eq 0 ]; then
        echo "[entrypoint] 正在启动 Ydsz Worker，端口 $PORT..."
        exec ydsz-worker run --host 0.0.0.0 --port "$PORT"
    fi

    if [ "$1" = "ydsz-worker" ]; then
        echo "[entrypoint] 执行命令: $*"
        exec "$@"
    fi

    echo "[entrypoint] 执行命令: $*"
    exec "$@"
}

# Allow tests to source helpers without starting the server.
if [ "${YDSZ_ENTRYPOINT_LIB:-}" = "1" ]; then
    return 0 2>/dev/null || exit 0
fi

ydsz_entrypoint_main "$@"
