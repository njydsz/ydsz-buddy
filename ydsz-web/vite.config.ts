import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1440,
    strictPort: true,
    // 开发模式代理：将 /api 和 /ws 转发到本地 ydzs-server
    proxy: {
      "/api": {
        target: "http://localhost:7777",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:7777",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
