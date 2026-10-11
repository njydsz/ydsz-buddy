/**
 * @file 登录路由
 * @description 用户登录界面 — 首次启动时如果无用户则显示注册表单。
 *   认证成功后跳转回主界面。
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** 用户信息 DTO */
interface UserInfo {
  id: string;
  username: string;
  role: string;
  created_at_ms: number;
  last_login_ms: number | null;
}

/** 认证结果 DTO */
interface AuthResult {
  token: string;
  user: UserInfo;
  expires_at_ms: number;
}

/** 首次运行检查响应 */
interface FirstRunResponse {
  is_first_run: boolean;
  user_count: number;
}

/** 当前用户响应 */
interface CurrentUserResponse {
  user: UserInfo | null;
  requires_login: boolean;
}

export const Route = createFileRoute("/_login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("developer");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // 检查是否需要登录
  useEffect(() => {
    async function check() {
      try {
        // 检查是否有已保存的 token
        const savedToken = localStorage.getItem("ydsz-buddy:auth-token");
        if (savedToken) {
          const result = await invoke<CurrentUserResponse>("auth_current_user", {
            token: savedToken,
          });
          if (result.user && !result.requires_login) {
            // 已有有效 session，跳回主页
            navigate({ to: "/" });
            return;
          }
        }

        // 检查是否首次运行
        const firstRun = await invoke<FirstRunResponse>("auth_check_first_run");
        if (firstRun.is_first_run) {
          setIsFirstRun(true);
          setMode("register");
        }
      } catch (e) {
        console.warn("Auth check failed:", e);
      } finally {
        setInitializing(false);
      }
    }
    check();
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "login") {
        const result = await invoke<AuthResult>("auth_login", { username, password });
        localStorage.setItem("ydsz-buddy:auth-token", result.token);
        navigate({ to: "/" });
      } else {
        await invoke("auth_register", {
          username,
          password,
          role,
          adminToken: null,
        });
        // 注册成功后自动登录
        const result = await invoke<AuthResult>("auth_login", { username, password });
        localStorage.setItem("ydsz-buddy:auth-token", result.token);
        navigate({ to: "/" });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  if (initializing) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">加载中...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-card p-8 shadow-lg">
        {/* Header */}
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            {mode === "login" ? "登录" : "创建首个管理员账户"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {mode === "login"
              ? "请输入您的凭据以继续"
              : "首次使用，请创建第一个管理员账户"}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="username">
              用户名
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              required
              minLength={2}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="输入用户名"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="password">
              密码
            </label>
            <input
              id="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="输入密码"
            />
          </div>

          {/* Role selector (register only, first run defaults Admin) */}
          {mode === "register" && !isFirstRun && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="role">
                角色
              </label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="admin">管理员 (Admin)</option>
                <option value="developer">开发者 (Developer)</option>
                <option value="viewer">查看者 (Viewer)</option>
              </select>
            </div>
          )}

          {isFirstRun && mode === "register" && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              首个用户将自动成为管理员
            </p>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "处理中..." : mode === "login" ? "登录" : "注册"}
          </button>
        </form>

        {/* Toggle mode */}
        {!isFirstRun && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError(null);
              }}
              className="text-xs text-primary hover:underline"
            >
              {mode === "login" ? "没有账户？点击注册" : "已有账户？点击登录"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
