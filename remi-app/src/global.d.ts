// FILE: global.d.ts
// Purpose: Declare ambient modules used by the web app when upstream packages omit types.
// Layer: Web type declarations
// Exports: module declarations only

declare module "@fontsource-variable/jetbrains-mono";

// Tauri 环境检测
interface Window {
  __TAURI__?: any;
}
