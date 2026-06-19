import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, createRoute, createRootRoute } from "@tanstack/react-router";

import { RootRouteView } from "@/routes/__root";
import { ChatLayout } from "@/routes/_chat";
import { ChatIndex } from "@/routes/_chat.index";
import { ChatThread } from "@/routes/_chat.$threadId";
import { ChatSettings } from "@/routes/_chat.settings";
import { ChatPlugins } from "@/routes/_chat.plugins";
import { ChatAutomations } from "@/routes/_chat.automations";
import { WorkspaceIndex } from "@/routes/_chat.workspace.index";
import { WorkspaceView } from "@/routes/_chat.workspace.$workspaceId";
import { StoreProvider } from "@/store";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const rootRoute = createRootRoute({
  component: RootRouteView,
});

const chatLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_chat",
  component: ChatLayout,
});

const chatIndexRoute = createRoute({
  getParentRoute: () => chatLayoutRoute,
  path: "/",
  component: ChatIndex,
});

const chatThreadRoute = createRoute({
  getParentRoute: () => chatLayoutRoute,
  path: "/$threadId",
  component: ChatThread,
});

const chatSettingsRoute = createRoute({
  getParentRoute: () => chatLayoutRoute,
  path: "/settings",
  component: ChatSettings,
});

const chatPluginsRoute = createRoute({
  getParentRoute: () => chatLayoutRoute,
  path: "/plugins",
  component: ChatPlugins,
});

const chatAutomationsRoute = createRoute({
  getParentRoute: () => chatLayoutRoute,
  path: "/automations",
  component: ChatAutomations,
});

const workspaceIndexRoute = createRoute({
  getParentRoute: () => chatLayoutRoute,
  path: "/workspace",
  component: WorkspaceIndex,
});

const workspaceViewRoute = createRoute({
  getParentRoute: () => chatLayoutRoute,
  path: "/workspace/$workspaceId",
  component: WorkspaceView,
});

const routeTree = rootRoute.addChildren([
  chatLayoutRoute.addChildren([
    chatIndexRoute,
    chatThreadRoute,
    chatSettingsRoute,
    chatPluginsRoute,
    chatAutomationsRoute,
    workspaceIndexRoute,
    workspaceViewRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  Wrap: ({ children }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(StoreProvider, null, children),
    ),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
