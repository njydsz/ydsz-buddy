import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };
import * as path from "node:path";

const port = Number(process.env.PORT ?? 1420);
const sourcemapEnv = process.env.REMI_CLAW_SOURCEMAP?.trim().toLowerCase();

const buildSourcemap =
  sourcemapEnv === "0" || sourcemapEnv === "false"
    ? false
    : sourcemapEnv === "hidden"
      ? "hidden"
      : true;

export default defineConfig({
  plugins: [
    tanstackRouter(),
    react(),
    tailwindcss(),
  ],
  optimizeDeps: {
    include: [
      "@pierre/diffs",
      "@pierre/diffs/react",
      "@pierre/diffs/worker/worker.js",
      "react-icons/gr",
    ],
  },
  define: {
    "import.meta.env.VITE_WS_URL": JSON.stringify(process.env.VITE_WS_URL ?? ""),
    "import.meta.env.APP_VERSION": JSON.stringify(pkg.version),
  },
  resolve: {
    conditions: ["module", "browser", "development", "import", "default"],
    alias: [
      // Project root alias used by source files
      { find: /^~\/(.*)$/, replacement: path.resolve(__dirname, "src").replace(/\\/g, "/") + "/$1" },
      // @remi-claw workspace packages → local src/shared/ files
      { find: "@remi-claw/contracts", replacement: path.resolve(__dirname, "src/contracts/index.ts") },
      { find: "@remi-claw/shared/model", replacement: path.resolve(__dirname, "src/shared/model.ts") },
      { find: "@remi-claw/shared/threadSummary", replacement: path.resolve(__dirname, "src/shared/threadSummary.ts") },
      { find: "@remi-claw/shared/threadWorkspace", replacement: path.resolve(__dirname, "src/shared/threadWorkspace.ts") },
      { find: "@remi-claw/shared/git", replacement: path.resolve(__dirname, "src/shared/git.ts") },
      { find: "@remi-claw/shared/chatThreads", replacement: path.resolve(__dirname, "src/shared/chatThreads.ts") },
      { find: "@remi-claw/shared/threadEnvironment", replacement: path.resolve(__dirname, "src/shared/threadEnvironment.ts") },
      { find: "@remi-claw/shared/worktreeHandoff", replacement: path.resolve(__dirname, "src/shared/worktreeHandoff.ts") },
      { find: "@remi-claw/shared/path", replacement: path.resolve(__dirname, "src/shared/path.ts") },
      { find: "@remi-claw/shared/localImage", replacement: path.resolve(__dirname, "src/shared/localImage.ts") },
      { find: "@remi-claw/shared/conversationEdit", replacement: path.resolve(__dirname, "src/shared/conversationEdit.ts") },
      { find: "@remi-claw/shared/terminalThreads", replacement: path.resolve(__dirname, "src/shared/terminalThreads.ts") },
      { find: "@remi-claw/shared/subagents", replacement: path.resolve(__dirname, "src/shared/subagents.ts") },
      { find: "@remi-claw/shared/toolOutputSummary", replacement: path.resolve(__dirname, "src/shared/toolOutputSummary.ts") },
      { find: "@remi-claw/shared/agentMentions", replacement: path.resolve(__dirname, "src/shared/agentMentions.ts") },
      { find: "@remi-claw/shared/serverSettings", replacement: path.resolve(__dirname, "src/shared/serverSettings.ts") },
      { find: "@remi-claw/shared/Net", replacement: path.resolve(__dirname, "src/shared/Net.ts") },
      { find: "@remi-claw/shared/shell", replacement: path.resolve(__dirname, "src/shared/shell.ts") },
      { find: "@remi-claw/shared/schemaJson", replacement: path.resolve(__dirname, "src/shared/schemaJson.ts") },
      { find: "@remi-claw/shared/logging", replacement: path.resolve(__dirname, "src/shared/logging.ts") },
      { find: "@remi-claw/shared/Struct", replacement: path.resolve(__dirname, "src/shared/Struct.ts") },
      { find: "@remi-claw/shared/DrainableWorker", replacement: path.resolve(__dirname, "src/shared/DrainableWorker.ts") },
      { find: "@remi-claw/shared/codexConfig", replacement: path.resolve(__dirname, "src/shared/codexConfig.ts") },
    ],
  },
  // Tauri 配置
  clearScreen: false,
  server: {
    port,
    strictPort: true,
    hmr: {
      protocol: "ws",
      host: "localhost",
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: buildSourcemap,
    // Tauri 在 Windows 上使用 chrome105，在 macOS 上使用 safari13
    target: process.env.TAURI_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
  },
});
