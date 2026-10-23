import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

/** Props lifted from a settings page into the SettingsWindow content header. */
export interface LiftedHeader {
  /** Title block (replaces the default title text). */
  title: ReactNode;
  /** Optional subtitle shown under the title. */
  subtitle?: ReactNode;
  /** Right-aligned actions (replaces the default empty area before close). */
  actions?: ReactNode;
}

interface SettingsHeaderContextValue {
  /** Push a lifted header up into the SettingsWindow chrome. */
  setLiftedHeader: (header: LiftedHeader | null) => void;
}

const SettingsHeaderContext = createContext<SettingsHeaderContextValue | null>(
  null,
);

/** Internal: the Provider is rendered by SettingsWindow around page content. */
export function SettingsHeaderProvider({
  value,
  children,
}: {
  value: SettingsHeaderContextValue;
  children: ReactNode;
}) {
  const stable = useMemo(
    () => value,
    // The setter identity is memoized by the caller (SettingsWindow).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value.setLiftedHeader],
  );
  return (
    <SettingsHeaderContext.Provider value={stable}>
      {children}
    </SettingsHeaderContext.Provider>
  );
}

/**
 * Hook for settings sub-pages. Pass a `LiftedHeader` describing what the page
 * wants displayed in the window header; it auto-registers on mount and
 * cleans up on unmount.
 *
 * Returns `true` when the page is rendered inside a `SettingsWindow` (so the
 * caller can suppress its own local title row), and `false` otherwise.
 *
 * @example
 * ```tsx
 * const inSettings = useSettingsHeader(
 *   { title: "模型配置", subtitle: "...", actions: <Button>刷新</Button> },
 *   [modelCategory],
 * );
 * ```
 */
export function useSettingsHeader(
  header: LiftedHeader | null,
  deps: readonly unknown[],
): boolean {
  const ctx = useContext(SettingsHeaderContext);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => header, deps);
  useEffect(() => {
    if (!ctx) return;
    ctx.setLiftedHeader(stable);
    return () => ctx.setLiftedHeader(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, ...deps]);
  return ctx !== null;
}
