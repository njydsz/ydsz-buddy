/**
 * Type declarations for use-sync-external-store — the upstream package ships
 * no types, but web-react's bind.ts imports the with-selector entry directly.
 * The shim entry is a thin re-export of the development CJS build whose
 * sole named export is the hook factory.
 */
declare module 'use-sync-external-store/shim/with-selector.js' {
  export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => Snapshot,
    getServerSnapshot: (() => Snapshot) | undefined,
    selector: (snapshot: Snapshot) => Selection,
    isEqual?: (a: Selection, b: Selection) => boolean,
  ): Selection
}
