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
      // @peakcode workspace packages → local src/shared/ files
      { find: "@peakcode/contracts", replacement: path.resolve(__dirname, "src/contracts/index.ts") },
      { find: "@remi-code/contracts", replacement: path.resolve(__dirname, "src/contracts/index.ts") },
      { find: "@peakcode/shared/model", replacement: path.resolve(__dirname, "src/shared/model.ts") },
      { find: "@peakcode/shared/threadSummary", replacement: path.resolve(__dirname, "src/shared/threadSummary.ts") },
      { find: "@peakcode/shared/threadWorkspace", replacement: path.resolve(__dirname, "src/shared/threadWorkspace.ts") },
      { find: "@peakcode/shared/git", replacement: path.resolve(__dirname, "src/shared/git.ts") },
      { find: "@peakcode/shared/chatThreads", replacement: path.resolve(__dirname, "src/shared/chatThreads.ts") },
      { find: "@peakcode/shared/threadEnvironment", replacement: path.resolve(__dirname, "src/shared/threadEnvironment.ts") },
      { find: "@peakcode/shared/worktreeHandoff", replacement: path.resolve(__dirname, "src/shared/worktreeHandoff.ts") },
      { find: "@peakcode/shared/path", replacement: path.resolve(__dirname, "src/shared/path.ts") },
      { find: "@peakcode/shared/localImage", replacement: path.resolve(__dirname, "src/shared/localImage.ts") },
      { find: "@peakcode/shared/conversationEdit", replacement: path.resolve(__dirname, "src/shared/conversationEdit.ts") },
      { find: "@peakcode/shared/terminalThreads", replacement: path.resolve(__dirname, "src/shared/terminalThreads.ts") },
      { find: "@peakcode/shared/subagents", replacement: path.resolve(__dirname, "src/shared/subagents.ts") },
      { find: "@peakcode/shared/toolOutputSummary", replacement: path.resolve(__dirname, "src/shared/toolOutputSummary.ts") },
      { find: "@peakcode/shared/agentMentions", replacement: path.resolve(__dirname, "src/shared/agentMentions.ts") },
      { find: "@peakcode/shared/serverSettings", replacement: path.resolve(__dirname, "src/shared/serverSettings.ts") },
      { find: "@peakcode/shared/Net", replacement: path.resolve(__dirname, "src/shared/Net.ts") },
      { find: "@peakcode/shared/shell", replacement: path.resolve(__dirname, "src/shared/shell.ts") },
      { find: "@peakcode/shared/schemaJson", replacement: path.resolve(__dirname, "src/shared/schemaJson.ts") },
      { find: "@peakcode/shared/logging", replacement: path.resolve(__dirname, "src/shared/logging.ts") },
      { find: "@peakcode/shared/Struct", replacement: path.resolve(__dirname, "src/shared/Struct.ts") },
      { find: "@peakcode/shared/DrainableWorker", replacement: path.resolve(__dirname, "src/shared/DrainableWorker.ts") },
      { find: "@peakcode/shared/codexConfig", replacement: path.resolve(__dirname, "src/shared/codexConfig.ts") },
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
