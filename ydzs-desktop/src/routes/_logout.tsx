/**
 * @file 登出路由
 * @description 处理用户登出：清除 token 并跳转登录页。
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";

export const Route = createFileRoute("/_logout")({
  component: LogoutPage,
});

function LogoutPage() {
  const navigate = useNavigate();

  useEffect(() => {
    async function doLogout() {
      try {
        const token = localStorage.getItem("ydsz-buddy:auth-token");
        if (token) {
          await invoke("auth_logout", { token });
        }
      } catch (e) {
        console.warn("Logout invoke failed:", e);
      } finally {
        localStorage.removeItem("ydsz-buddy:auth-token");
        navigate({ to: "/login" });
      }
    }
    doLogout();
  }, [navigate]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="text-sm text-muted-foreground">正在登出...</div>
    </div>
  );
}
