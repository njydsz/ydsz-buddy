import { type ReactNode, createContext, useContext, useEffect, useState } from "react";
import { useStore } from "zustand";
import { createAppStore } from "./store";
import type { AppState } from "./types";

const StoreContext = createContext<ReturnType<typeof createAppStore> | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createAppStore());

  useEffect(() => {
    // Trigger the bootstrap once the store is mounted so the WS client
    // and the React tree share the same lifecycle.
    store.getState().bootstrap();
  }, [store]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useAppStore<T>(selector: (state: AppState) => T): T {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error("useAppStore must be used inside <StoreProvider>");
  }
  return useStore(store, selector);
}
