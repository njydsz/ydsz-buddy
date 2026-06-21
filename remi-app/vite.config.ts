import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };
import path from "node:path";

const port = Number(process.env.PORT ?? 1420);
const sourcemapEnv = process.env.REMI_CODE_SOURCEMAP?.trim().toLowerCase();

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
    babel({
      parserOpts: { plugins: ["typescript", "jsx"] },
      presets: [reactCompilerPreset()],
    }),
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
    tsconfigPaths: true,
    conditions: ["module", "browser", "development", "import", "default"],
    alias: [
      // @Remicode workspace packages → local src/shared/ files
      { find: "@remicode/contracts", replacement: path.resolve(__dirname, "src/contracts/index.ts") },
      { find: "@remi-code/contracts", replacement: path.resolve(__dirname, "src/contracts/index.ts") },
      { find: "@remicode/shared/model", replacement: path.resolve(__dirname, "src/shared/model.ts") },
      { find: "@remicode/shared/threadSummary", replacement: path.resolve(__dirname, "src/shared/threadSummary.ts") },
      { find: "@remicode/shared/threadWorkspace", replacement: path.resolve(__dirname, "src/shared/threadWorkspace.ts") },
      { find: "@remicode/shared/git", replacement: path.resolve(__dirname, "src/shared/git.ts") },
      { find: "@remicode/shared/chatThreads", replacement: path.resolve(__dirname, "src/shared/chatThreads.ts") },
      { find: "@remicode/shared/threadEnvironment", replacement: path.resolve(__dirname, "src/shared/threadEnvironment.ts") },
      { find: "@remicode/shared/worktreeHandoff", replacement: path.resolve(__dirname, "src/shared/worktreeHandoff.ts") },
      { find: "@remicode/shared/path", replacement: path.resolve(__dirname, "src/shared/path.ts") },
      { find: "@remicode/shared/localImage", replacement: path.resolve(__dirname, "src/shared/localImage.ts") },
      { find: "@remicode/shared/conversationEdit", replacement: path.resolve(__dirname, "src/shared/conversationEdit.ts") },
      { find: "@remicode/shared/terminalThreads", replacement: path.resolve(__dirname, "src/shared/terminalThreads.ts") },
      { find: "@remicode/shared/subagents", replacement: path.resolve(__dirname, "src/shared/subagents.ts") },
      { find: "@remicode/shared/toolOutputSummary", replacement: path.resolve(__dirname, "src/shared/toolOutputSummary.ts") },
      { find: "@remicode/shared/agentMentions", replacement: path.resolve(__dirname, "src/shared/agentMentions.ts") },
      { find: "@remicode/shared/serverSettings", replacement: path.resolve(__dirname, "src/shared/serverSettings.ts") },
      { find: "@remicode/shared/Net", replacement: path.resolve(__dirname, "src/shared/Net.ts") },
      { find: "@remicode/shared/shell", replacement: path.resolve(__dirname, "src/shared/shell.ts") },
      { find: "@remicode/shared/schemaJson", replacement: path.resolve(__dirname, "src/shared/schemaJson.ts") },
      { find: "@remicode/shared/logging", replacement: path.resolve(__dirname, "src/shared/logging.ts") },
      { find: "@remicode/shared/Struct", replacement: path.resolve(__dirname, "src/shared/Struct.ts") },
      { find: "@remicode/shared/DrainableWorker", replacement: path.resolve(__dirname, "src/shared/DrainableWorker.ts") },
      { find: "@remicode/shared/codexConfig", replacement: path.resolve(__dirname, "src/shared/codexConfig.ts") },
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
