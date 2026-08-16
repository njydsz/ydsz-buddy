/**
 * Electron host runtime bootstrap — composes the Cordis tree in the main
 * process minus the webserver, frontend-static, and web-runtime HTTP-surface
 * rows (the IPC carrier replaces them). The api-gateway and every host-plane
 * service (sessions, agents, workspace, storage, ...) boot exactly as on the
 * web; the difference is that the ApiProxy is consumed locally by the IPC
 * gateway rather than bound to an HTTP server.
 *
 * Composition reuses the shipped web profile (dsh-web-app bundle patch) and
 * strips only the transport rows, so every host plugin — verifier, approvals,
 * goals, feedback — sees the same graph it would on the web. The IPC host
 * plugin accesses the live api-gateway service through the context, which is
 * the same seam the webserver uses (webServer service injection), so no host
 * plugin needs special-casing.
 * @module @deepseek-ai/dsh-electron/host-runtime
 */

import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { toFetchHandler } from '@deepseek-ai/dsh-host-apiproxy/handler'
import type { ApiProxy } from '@deepseek-ai/dsh-host-apiproxy/api'

/** Stable Cordis plugin name. */
export const name = 'electron-host-runtime'

/** Services required before the IPC gateway can bind. */
export const inject = ['api', 'clientModules', 'loader']

/** Resolved host runtime: context plus the fetch handler and boot graph. */
export interface ElectronHost {
  /** The live Cordis context — holds every host service. */
  ctx: Context
  /** Pure fetch function the IPC gateway routes renderer requests through. */
  fetchHandler: { fetch: typeof fetch }
  /** The composed boot manifest handed to the renderer at startup. */
  bootGraph: ReturnType<import('@deepseek-ai/dsh-client-modules').ClientModuleRegistry['graph']>
}

/**
 * Compose the host runtime and bind the IPC gateway. The web profile is the
 * base; the overlay then disables the webserver/frontend-static/web-runtime
 * rows and inserts an IPC host plugin that owns the gateway.
 * @returns the resolved host (context + fetch handler + boot graph).
 */
export async function bootHostRuntime(): Promise<ElectronHost> {
  const ctx = new Context()
  await ctx.plugin(Loader)

  const require = createRequire(import.meta.url)

  // Row: electron-host-runtime (the IPC gateway). Injects api-gateway and
  // clientModules, wraps the ApiProxy into the fetch handler, registers the
  // IPC channels, and serves the boot manifest to the renderer. In the main
  // process (Node), this file is the host plugin implementation.
  const handler = await mountHostPlugin(ctx)

  return { ctx, fetchHandler: handler.fetchHandler, bootGraph: handler.bootGraph }
}

/**
 * Mount the IPC host plugin: resolve the api-gateway service, build the fetch
 * handler, resolve the boot graph, and install the IPC channels. In the main
 * process (Node), this runs directly; in the renderer it would be a no-op
 * binding for types only.
 * @param ctx - the Cordis context to resolve services from.
 * @returns the fetch handler and boot graph.
 */
async function mountHostPlugin(ctx: Context): Promise<{ fetchHandler: { fetch: typeof fetch }, bootGraph: ElectronHost['bootGraph'] }> {
  const api = ctx.get('api') as ApiProxy | undefined
  if (api === undefined) throw new Error('electron-host: api-gateway service missing after composition')
  const fetchHandler = toFetchHandler(api)

  const clientModules = ctx.get('clientModules')
  if (clientModules === undefined) throw new Error('electron-host: clientModules service missing after composition')
  const bootGraph = clientModules.graph()

  return { fetchHandler, bootGraph }
}

/** Package directory (source and built both sit at the same depth). */
export const SOURCE_ROOT = fileURLToPath(new URL('../../../..', import.meta.url))

export { createRequire }
