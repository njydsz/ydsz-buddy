/**
 * Electron IPC connection controller — wires IpcApiClient into the
 * ConnectionController from client/connection. The ConnectionController
 * owns the physical streams and reconnection logic; it is transport-agnostic
 * and only requires an IApiClient. On the web this is satisfied by
 * WebApiClient (WebSocket + fetch); on the desktop it is satisfied by
 * IpcApiClient (IPC). Everything downstream — SessionManager, projections,
 * the UI — is unchanged.
 * @module @njydsz/ydb-electron/ipc-connection-controller
 */

import { ConnectionController, type ConnectionConfig, type ConnectionSinks } from '@njydsz/ydb-client-connection/client/connection'
import { IpcApiClient } from './ipc-api-client.ts'
import type { DshIpcBridge } from './ipc-api-client.ts'

/**
 * Create a ConnectionController backed by the IPC carrier instead of HTTP/WebSocket.
 * The caller supplies the preload bridge and the sinks; this mirrors the
 * WebApiClient construction in the web shell one-for-one.
 * @param bridge - the preload IPC bridge.
 * @param sinks - connection frame and state sinks (owned by SessionManager).
 * @param config - optional reconnection/backoff tunables.
 * @returns a live, not-yet-started ConnectionController.
 */
export function createIpcConnectionController(
  bridge: DshIpcBridge,
  sinks: ConnectionSinks,
  config?: ConnectionConfig,
): ConnectionController {
  const api = new IpcApiClient(bridge)
  return new ConnectionController(api, sinks, config)
}

export type { ConnectionConfig, ConnectionSinks }
