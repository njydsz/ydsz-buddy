/**
 * Electron IPC API carrier — the renderer half of the desktop transport.
 * Extends AbstractApiClient (which owns every protocol invariant) and overrides
 * only the transport aspect: doFetch, openMux, openHost. Unary calls go
 * through ipcRenderer.invoke(API_CHANNEL); SSE streams open a per-stream IPC
 * channel and reassemble frames into AsyncIterable<RpcRequest<Frame>>.
 *
 * The preload script exposes `window.__dshIpc` (see preload.ts). This module
 * never touches node: or electron: imports directly — it consumes only the
 * window bridge, keeping it import-browser-safe (no host runtime bleed).
 * @module @deepseek-ai/dsh-electron/ipc-api-client
 */

import type { ApiProxy, HostFrame, MuxFrame, RpcRequest, ServerRequest } from '@deepseek-ai/dsh-host-apiproxy/api'
import { AbstractApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
import { hostFrameSchema, muxFrameSchema } from '@deepseek-ai/dsh-host-apiproxy/api/events.schema'
import { serverRequestSchema } from '@deepseek-ai/dsh-host-apiproxy/api/rpc.schema'
import { HOST_EVENTS_PATH, MUX_EVENTS_PATH } from '@deepseek-ai/dsh-client-connection/api-path'
import type {
  IpcApiRequest, IpcApiResponse, IpcResponse, IpcStreamEnd, IpcStreamFrame, IpcStreamRequest,
} from './ipc-protocol.ts'
import {
  API_CHANNEL, STREAM_ABORT_CHANNEL, STREAM_END_PREFIX, STREAM_FRAME_PREFIX, STREAM_OPEN_CHANNEL,
} from './ipc-protocol.ts'

/**
 * The window bridge the preload script installs. Minimal surface — only what
 * the carrier needs — so the preload stays a thin membrane with no business
 * logic and no Node reach-through.
 */
export interface DshIpcBridge {
  /** Unary RPC round-trip. Resolves with the serialized Response. */
  api(request: IpcApiRequest): Promise<IpcApiResponse>
  /** Open an SSE stream; resolves once the stream is established. */
  openStream(request: IpcStreamRequest): Promise<void>
  /** Abort an open stream (idempotent — safe after natural end). */
  abortStream(streamId: string): void
  /** Subscribe to one stream's frames. Returns an unsubscribe function. */
  onStreamFrame(streamId: string, listener: (frame: IpcStreamFrame) => void): () => void
  /** Subscribe to a stream's end signal. Returns an unsubscribe function. */
  onStreamEnd(streamId: string, listener: (end: IpcStreamEnd) => void): () => void
}

declare global {
  interface Window {
    /** The Electron preload bridge — absent outside the Electron renderer. */
    __dshIpc?: DshIpcBridge
  }
}

/**
 * One item in a stream's in-memory inbox. The async generator drains this
 * queue; frames arrive over IPC from the main process.
 */
type StreamItem<F> = { kind: 'frame'; envelope: RpcRequest<F> } | { kind: 'end' }

/**
 * Deserialize an IpcResponse back into a Web Response. Binary bodies were
 * base64-encoded for the IPC trip; everything else is UTF-8 text.
 * @param ipc - the serialized response from main.
 * @returns a reconstructed Response the base class's readSse/callUnary can read.
 */
function toWebResponse(ipc: IpcResponse): Response {
  const headers = new Headers(ipc.headers)
  const body = ipc._binary === true
    ? Uint8Array.from(atob(ipc.body), (c) => c.charCodeAt(0))
    : ipc.body
  return new Response(body, { status: ipc.status, headers })
}

/**
 * Electron renderer IPC carrier. The face consumed by IpcConnectionController
 * (the drop-in replacement for WebApiClient in the desktop shell).
 */
export class IpcApiClient extends AbstractApiClient {
  constructor(private readonly bridge: DshIpcBridge, timeoutMs?: number) {
    super(timeoutMs)
  }

  /** Transport aspect: the one override that replaces fetch with IPC. */
  protected async doFetch(input: URL, init?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {}
    if (init?.headers instanceof Headers) {
      init.headers.forEach((v, k) => { headers[k] = v })
    } else if (init?.headers) {
      Object.assign(headers, init.headers as Record<string, string>)
    }
    const request: IpcApiRequest = {
      rid: crypto.randomUUID(),
      url: input.toString(),
      method: init?.method ?? 'GET',
      headers,
      ...(init?.body !== undefined ? { body: init.body as string } : {}),
    }
    const result = await this.bridge.api(request)
    return toWebResponse(result.response)
  }

  /** Mux stream opener: IPC push channel instead of WebSocket. */
  protected override openMux(
    _payload: Parameters<ApiProxy['events']['mux']>[0]['payload'],
    signal: AbortSignal,
    onOpen?: () => void,
  ): AsyncIterable<RpcRequest<MuxFrame>> {
    return this.readStream(MUX_EVENTS_PATH, signal, muxFrameSchema, onOpen)
  }

  /** Host stream opener: IPC push channel instead of WebSocket. */
  protected override openHost(
    _payload: Parameters<ApiProxy['events']['host']>[0]['payload'],
    signal: AbortSignal,
    onOpen?: () => void,
  ): AsyncIterable<RpcRequest<HostFrame>> {
    return this.readStream(HOST_EVENTS_PATH, signal, hostFrameSchema, onOpen)
  }

  /**
   * Read one SSE stream over IPC: open it via `dsh:stream:open`, then yield
   * frames as the main process pushes them on the per-stream channel. The
   * inbox decouples the IPC push callback from the consumer's read pace; a
   * promise bridge wakes the generator when the next item lands.
   * @param path - the SSE endpoint (mux or host).
   * @param signal - abort signal that closes the stream when the consumer disposes.
   * @param frameSchema - zod schema validating each frame's payload.
   * @param onOpen - fires once the stream is established, before any frame.
   */
  private async *readStream<F extends MuxFrame | HostFrame>(
    path: '/api/events.mux' | '/api/events.host',
    signal: AbortSignal,
    frameSchema: { parse(value: unknown): F },
    onOpen?: () => void,
  ): AsyncGenerator<RpcRequest<F>> {
    const streamId = crypto.randomUUID()
    const inbox: StreamItem<F>[] = []
    let wake: (() => void) | undefined
    const enqueue = (item: StreamItem<F>): void => {
      inbox.push(item)
      wake?.()
      wake = undefined
    }
    const handleFrame = (frame: IpcStreamFrame): void => {
      let full: ServerRequest
      let parsed: F
      try {
        full = serverRequestSchema.parse(JSON.parse(frame.data))
        parsed = frameSchema.parse(full.payload)
      } catch (error) {
        console.error(`[electron-ipc] dropping malformed stream frame on ${path}:`, error)
        return
      }
      this.onEnvelope(full)
      enqueue({ kind: 'frame', envelope: { rpcId: full.rpcId, payload: parsed } })
    }
    const handleEnd = (): void => { enqueue({ kind: 'end' }) }
    const onFrame = this.bridge.onStreamFrame(streamId, handleFrame)
    const onEnd = this.bridge.onStreamEnd(streamId, handleEnd)
    const abort = (): void => { this.bridge.abortStream(streamId) }
    try {
      await this.bridge.openStream({ streamId, path })
      onOpen?.()
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
      while (true) {
        while (inbox.length > 0) {
          const item = inbox.shift() as StreamItem<F>
          if (item.kind === 'end') return
          yield item.envelope
        }
        await new Promise<void>((resolve) => { wake = resolve })
      }
    } finally {
      signal.removeEventListener('abort', abort)
      onFrame()
      onEnd()
    }
  }
}
