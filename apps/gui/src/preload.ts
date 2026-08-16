/**
 * Electron preload script — the thin, security-reviewed membrane between the
 * renderer and the Node-capable main process. Exposes `window.__dshIpc` (a
 * minimal IpcBridge) via contextBridge; the renderer never gets raw
 * ipcRenderer access. This is the only file that bridges both worlds, and it
 * carries no business logic — only mechanical channel relay.
 *
 * Channels relayed:
 * - `dsh:api` (invoke): unary RPC round-trips.
 * - `dsh:stream:open` (invoke): establish an SSE stream.
 * - `dsh:stream:abort` (send): abort an open stream.
 * - `dsh:stream:frame:<id>` (on): one SSE frame pushed per stream.
 * - `dsh:stream:end:<id>` (on): stream termination signal.
 * @module @njydsz/ydb-gui/preload
 */

import { contextBridge, ipcRenderer } from 'electron'
import type {
  IpcApiRequest, IpcApiResponse, IpcStreamEnd, IpcStreamFrame, IpcStreamRequest,
} from './ipc-protocol.ts'
import {
  API_CHANNEL, STREAM_ABORT_CHANNEL, STREAM_END_PREFIX, STREAM_FRAME_PREFIX, STREAM_OPEN_CHANNEL,
} from './ipc-protocol.ts'
import type { DshIpcBridge } from './ipc-api-client.ts'

/**
 * A stream subscription handle held by one consumer. The preload keeps a
 * single listener pair per streamId so unsubscribe can remove it cleanly.
 * Multiple concurrent consumers would require a fan-out registry; the carrier
 * opens one stream per ConnectionController generation, so one consumer per
 * id is the binding contract.
 */
interface StreamListeners {
  frame: (frame: IpcStreamFrame) => void
  end: (end: IpcStreamEnd) => void
}

const bridge: DshIpcBridge = {
  api(request: IpcApiRequest): Promise<IpcApiResponse> {
    return ipcRenderer.invoke(API_CHANNEL, request) as Promise<IpcApiResponse>
  },
  openStream(request: IpcStreamRequest): Promise<void> {
    return ipcRenderer.invoke(STREAM_OPEN_CHANNEL, request) as Promise<void>
  },
  abortStream(streamId: string): void {
    ipcRenderer.send(STREAM_ABORT_CHANNEL, streamId)
  },
  onStreamFrame(streamId: string, listener: (frame: IpcStreamFrame) => void): () => void {
    return manageStream(streamId, listener, undefined)
  },
  onStreamEnd(streamId: string, listener: (end: IpcStreamEnd) => void): () => void {
    return manageStream(streamId, undefined, listener)
  },
}

/** Per-stream listener bookkeeping — install/remove the IPC listener pair exactly once. */
const streamRegistry = new Map<string, { ref: number, ipcFrame?: () => void, ipcEnd?: () => void, listeners: StreamListeners }>()

/** The prefixed channel for a stream's frame push. */
function frameChannel(streamId: string): string {
  return `${STREAM_FRAME_PREFIX}${streamId}`
}

/** The prefixed channel for a stream's end signal. */
function endChannel(streamId: string): string {
  return `${STREAM_END_PREFIX}${streamId}`
}

/**
 * Register one consumer's frame and/or end listener for a stream. The first
 * consumer on a given id installs the IPC relay; subsequent consumers reuse
 * it. The returned unsubscribe tears down the IPC relay when the last
 * consumer leaves.
 * @param streamId - the stream's unique id.
 * @param frameListener - frame callback (optional).
 * @param endListener - end callback (optional).
 * @returns unsubscribe function that removes this consumer.
 */
function manageStream(
  streamId: string,
  frameListener?: (frame: IpcStreamFrame) => void,
  endListener?: (end: IpcStreamEnd) => void,
): () => void {
  const existing = streamRegistry.get(streamId)
  if (existing !== undefined) {
    existing.ref++
    if (frameListener !== undefined) existing.listeners.frame = frameListener
    if (endListener !== undefined) existing.listeners.end = endListener
    return () => unsubscribe(streamId)
  }
  const relayFrame = (): void => {}
  const listeners: StreamListeners = {
    frame: frameListener ?? relayFrame,
    end: endListener ?? relayFrame,
  }
  const ipcFrame = frameListener !== undefined
    ? (_: unknown, frame: IpcStreamFrame) => { listeners.frame(frame) }
    : undefined
  const ipcEnd = endListener !== undefined
    ? (_: unknown, end: IpcStreamEnd) => { listeners.end(end) }
    : undefined
  if (ipcFrame !== undefined) ipcRenderer.on(frameChannel(streamId), ipcFrame)
  if (ipcEnd !== undefined) ipcRenderer.on(endChannel(streamId), ipcEnd)
  streamRegistry.set(streamId, { ref: 1, ipcFrame, ipcEnd, listeners })
  return () => unsubscribe(streamId)
}

/** Decrement a stream's ref count; remove the IPC listeners when it hits zero. */
function unsubscribe(streamId: string): void {
  const entry = streamRegistry.get(streamId)
  if (entry === undefined) return
  entry.ref--
  if (entry.ref > 0) return
  if (entry.ipcFrame !== undefined) ipcRenderer.removeListener(frameChannel(streamId), entry.ipcFrame)
  if (entry.ipcEnd !== undefined) ipcRenderer.removeListener(endChannel(streamId), entry.ipcEnd)
  streamRegistry.delete(streamId)
}

// Expose the bridge to the renderer. This is the entire world the renderer's
// IPC carrier may touch — no direct ipcRenderer, no node APIs, no globals.
contextBridge.exposeInMainWorld('__dshIpc', bridge)
