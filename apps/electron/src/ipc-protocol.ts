/**
 * Electron IPC carrier protocol — the wire shape bridging the renderer's
 * IpcApiClient and the main process's fetch handler. Mirrors the webserver's
 * HTTP surface over Electron IPC: unary calls round-trip through `dsh:api`, mux/host
 * streams through `dsh:stream:open` (main pushes frames on `dsh:stream:frame
 * <id>` / `dsh:stream:end <id>`, renderer signals abort on `dsh:stream:abort
 * <id>`).
 *
 * Design note: AbstractApiClient holds every protocol invariant (rpcId minting,
 * envelope parsing, stream framing). This carrier only replaces the transport
 * aspect — doFetch/openMux/openHost — over IPC, so no protocol logic is
 * duplicated.
 * @module @njydsz/ydb-electron/ipc-protocol
 */

/** IPC channel for unary RPC round-trips. */
export const API_CHANNEL = 'dsh:api'

/** IPC channel the renderer calls to open an SSE stream. */
export const STREAM_OPEN_CHANNEL = 'dsh:stream:open'

/** IPC channel the renderer calls to abort an open stream. */
export const STREAM_ABORT_CHANNEL = 'dsh:stream:abort'

/** Channel prefix for per-stream frame push. `dsh:stream:frame <id>` carries one ServerRequest. */
export const STREAM_FRAME_PREFIX = 'dsh:stream:frame:'

/** Channel prefix for per-stream end signal. */
export const STREAM_END_PREFIX = 'dsh:stream:end:'

/** A serialized Response crossing the IPC boundary. Headers are flattened to a plain object. */
export interface IpcResponse {
  ok: boolean
  status: number
  headers: Record<string, string>
  /** Response body as UTF-8 text (JSON/HTML/text bodies). Binary bodies are base64-encoded with `_binary: true`. */
  body: string
  _binary?: boolean
}

/** Unary request from renderer to main: a fetch shaped call. */
export interface IpcApiRequest {
  /** Request id — the response is keyed by this so concurrent calls don't cross. */
  rid: string
  /** Absolute URL or path (e.g. /api/session.list). Resolve against base inside main if relative. */
  url: string
  method: string
  headers: Record<string, string>
  /** Body as UTF-8 text (JSON). Absent for GET/SSE. */
  body?: string
}

/** The main process's answer to a unary request. */
export interface IpcApiResponse {
  rid: string
  response: IpcResponse
}

/** Open-stream request: mirrors the GET paths the webserver serves for SSE. */
export interface IpcStreamRequest {
  streamId: string
  path: '/api/events.mux' | '/api/events.host'
}

/** One SSE frame pushed from main to renderer, on `dsh:stream:frame <id>`. */
export interface IpcStreamFrame {
  streamId: string
  data: string
}

/** Stream termination signal from main, on `dsh:stream:end <id>`. */
export interface IpcStreamEnd {
  streamId: string
}
