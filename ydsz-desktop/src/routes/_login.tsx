/**
 * @file _login.tsx
 * @description 登录页面 — 多用户 RBAC 入口（G3-P0）
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  component: LoginComponent,
});

function LoginComponent() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">ydsz-buddy</h1>
          <p className="text-sm text-muted-foreground mt-1">登录到你的工作台</p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            // TODO: call auth_login Tauri command
          }}
        >
          <input
            type="text"
            placeholder="用户名"
            className="w-full px-3 py-2 text-sm rounded border border-border bg-background text-foreground"
          />
          <input
            type="password"
            placeholder="密码"
            className="w-full px-3 py-2 text-sm rounded border border-border bg-background text-foreground"
          />
          <button
            type="submit"
            className="w-full px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90"
          >
            登录
          </button>
        </form>

        <p className="text-xs text-muted-foreground text-center">
          首次使用此设备？第一个注册的用户将自动成为管理员。
        </p>
      </div>
    </div>
  );
}
