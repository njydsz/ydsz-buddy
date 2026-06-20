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

const effectDir = path.resolve(require.resolve("effect"), "..");

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
      "effect",
    ],
  },
  define: {
    "import.meta.env.VITE_WS_URL": JSON.stringify(process.env.VITE_WS_URL ?? ""),
    "import.meta.env.APP_VERSION": JSON.stringify(pkg.version),
  },
  resolve: {
    tsconfigPaths: true,
    conditions: ["module", "browser", "development", "import", "default"],
    alias: {
      "effect/Schema": path.join(effectDir, "dist/esm/index.js"),
      "effect/unstable/rpc": path.join(effectDir, "dist/esm/index.js"),
      "effect/unstable/socket": path.join(effectDir, "dist/esm/index.js"),
      "effect/unstable/socket/Socket": path.join(effectDir, "dist/esm/index.js"),
      // @peakcode workspace packages → local src/shared/ files
      "@peakcode/contracts": path.resolve(__dirname, "src/contracts.ts"),
      "@peakcode/shared/model": path.resolve(__dirname, "src/shared/model.ts"),
      "@peakcode/shared/threadSummary": path.resolve(__dirname, "src/shared/threadSummary.ts"),
      "@peakcode/shared/threadWorkspace": path.resolve(__dirname, "src/shared/threadWorkspace.ts"),
      "@peakcode/shared/git": path.resolve(__dirname, "src/shared/git.ts"),
      "@peakcode/shared/chatThreads": path.resolve(__dirname, "src/shared/chatThreads.ts"),
      "@peakcode/shared/threadEnvironment": path.resolve(__dirname, "src/shared/threadEnvironment.ts"),
      "@peakcode/shared/worktreeHandoff": path.resolve(__dirname, "src/shared/worktreeHandoff.ts"),
      "@peakcode/shared/path": path.resolve(__dirname, "src/shared/path.ts"),
      "@peakcode/shared/localImage": path.resolve(__dirname, "src/shared/localImage.ts"),
      "@peakcode/shared/conversationEdit": path.resolve(__dirname, "src/shared/conversationEdit.ts"),
      "@peakcode/shared/terminalThreads": path.resolve(__dirname, "src/shared/terminalThreads.ts"),
    },
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
