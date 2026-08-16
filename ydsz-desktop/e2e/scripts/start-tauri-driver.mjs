#!/usr/bin/env node
/**
 * 启动 Tauri Driver（WebDriver 协议端口 4444）。
 * 用法：node scripts/start-tauri-driver.mjs
 *
 * Tauri 2.x 推荐使用 tauri-driver 包提供的二进制。
 * 本脚本会：
 * 1. 探测本机已安装的 tauri-driver
 * 2. 若未安装则提示用户执行 `cargo install tauri-driver --locked`
 * 3. 启动 driver，绑定到 4444
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// 脚本位于 <repo>/ydsz-desktop/e2e/scripts/，向上 3 级到仓库根
const repoRoot = join(__dirname, "..", "..", "..");

function which(bin) {
  const path = process.env.PATH ?? "";
  const sep = process.platform === "win32" ? ";" : ":";
  for (const p of path.split(sep)) {
    const full = join(p, bin + (process.platform === "win32" ? ".exe" : ""));
    if (existsSync(full)) return full;
  }
  return null;
}

const tauriDriverBin = which("tauri-driver");
if (!tauriDriverBin) {
  console.error(
    "[start-tauri-driver] tauri-driver 未安装。\n" +
      "请先执行：cargo install tauri-driver --locked\n" +
      "或在 CI 中由 workflow 步骤安装。",
  );
  process.exit(1);
}

console.log(`[start-tauri-driver] spawning ${tauriDriverBin}`);
const child = spawn(
  tauriDriverBin,
  ["--port", "4444", "--host", "127.0.0.1"],
  {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      RUST_LOG: process.env.RUST_LOG ?? "info",
    },
  },
);

const shutdown = (signal) => {
  console.log(`[start-tauri-driver] received ${signal}, stopping driver...`);
  child.kill("SIGTERM");
  setTimeout(() => process.exit(0), 1000);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

child.on("exit", (code) => {
  console.log(`[start-tauri-driver] exited with code ${code}`);
  process.exit(code ?? 0);
});
