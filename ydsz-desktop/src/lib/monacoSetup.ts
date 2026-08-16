/**
 * @file Monaco Editor 离线打包配置
 * @description 把 Monaco 的 web worker 通过 Vite ?worker 导入，
 *              确保 Tauri 桌面端离线可用（不依赖 CDN）。
 *              在应用入口（main.tsx）侧导入一次即可生效。
 */

import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

let configured = false;

/**
 * 配置 Monaco 的 worker 与本地打包。
 * 幂等：多次调用安全。
 */
export function setupMonaco(): void {
  if (configured) return;
  configured = true;

  self.MonacoEnvironment = {
    getWorker(_workerId: string, label: string): Worker {
      switch (label) {
        case "json":
          return new jsonWorker();
        case "css":
        case "scss":
        case "less":
          return new cssWorker();
        case "html":
        case "handlebars":
        case "razor":
          return new htmlWorker();
        case "typescript":
        case "javascript":
          return new tsWorker();
        default:
          return new editorWorker();
      }
    },
  };

  // 让 @monaco-editor/react 使用本地打包的 monaco 实例，而非 CDN
  loader.config({ monaco });
}

export type MonacoEditor = monaco.editor.IStandaloneCodeEditor;
export type MonacoNamespace = typeof monaco;
