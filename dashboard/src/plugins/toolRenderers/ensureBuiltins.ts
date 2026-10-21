import * as React from "react";
import * as ReactJSX from "react/jsx-runtime";
import { DefaultToolRenderer } from "./builtin/DefaultToolRenderer";
import { builtinYdszPluginHost } from "./host";
import { registerToolRenderer } from "./registry";

let builtinsRegistered = false;

declare global {
  interface Window {
    __YDSZ_REACT__?: typeof React;
    __YDSZ_JSX__?: typeof ReactJSX;
  }
}

/** Expose React for plugin ESM blobs (no bundler import map). */
function exposeReactGlobals(): void {
  if (typeof window === "undefined") return;
  window.__YDSZ_REACT__ = React;
  window.__YDSZ_JSX__ = ReactJSX;
}

/** Register first-party fallback renderer once. */
export function ensureBuiltinToolRenderers(): void {
  if (builtinsRegistered) return;
  builtinsRegistered = true;
  exposeReactGlobals();
  registerToolRenderer({
    id: "default",
    pluginId: "builtin",
    component: DefaultToolRenderer,
  });
  void builtinYdszPluginHost;
}
