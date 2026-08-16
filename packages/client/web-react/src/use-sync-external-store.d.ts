/**
 * Local typings for use-sync-external-store 1.2.0: the package ships no types
 * and the DefinitelyTyped package is unavailable offline. Mirrors the CJS
 * with-selector development build (the only entry this package consumes).
 * 仅当 NODE_ENV !== "production" 时可用。
 */
declare module 'use-sync-external-store/cjs/use-sync-external-store-shim/with-selector.development.js' {
  export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => Snapshot,
    getServerSnapshot: undefined | null | (() => Snapshot),
    selector: (snapshot: Snapshot) => Selection,
    isEqual?: (a: Selection, b: Selection) => boolean,
  ): Selection
}
