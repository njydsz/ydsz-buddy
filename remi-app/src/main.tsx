import { type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import "@xterm/xterm/css/xterm.css";
import "./index.css";

import { APP_DISPLAY_NAME } from "@/lib/branding";
import { router } from "@/router";

document.title = APP_DISPLAY_NAME;

const root = document.getElementById("root");
if (!root) {
  throw new Error("Remi Code: missing #root element");
}

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

export function Empty({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
