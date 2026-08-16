/**
 * Electron desktop runtime: a Cordis plugin that provides the `webStartup` and
 * `webRuntime` services the web composition expects — without the CLI's
 * cmdlineArgs dependency. In the browser bundle, `web-startup` parses flags
 * (which need cmdlineArgs, a CLI-only service) and `web-runtime` samples LAN
 * trust from the active bind. The Electron renderer is always a first-party
 * loopback client, so both services resolve to fixed values here.
 *
 * The composition overlay disables the CLI `web-startup` and `web-runtime`
 * rows and enables this plugin in their place; nothing else in the web
 * composition changes.
 * @module @njydsz/ydb-electron/runtime
 */

import type { Context } from '@njydsz/cordis'

/** Stable Cordis plugin name. */
export const name = 'electron-runtime'

/** Services required before runtime values can be resolved (none — self-contained). */
export const inject: string[] = []

/** The startup values the webserver and web-runtime rows read from. */
export interface WebStartupValues {
  /** Bind host — the desktop shell binds loopback. */
  host: string
  /** Listen port — 0 lets the OS pick a free one. */
  port: number
  /** Explicit trusted-host authorities (empty: loopback-only trust). */
  trustedHosts: string[]
}

/** Runtime values the connection row reads from for the trust fence. */
export interface WebRuntimeValues {
  /** LAN IPv4 literals (empty — never bind all-interfaces in Electron). */
  lanAddresses: string[]
  /** Trusted authorities the /api fence accepts (loopback-only). */
  trustedHosts: string[]
}

/** The fixed startup values for the desktop shell. */
const STARTUP: WebStartupValues = {
  host: '127.0.0.1',
  port: 0,
  trustedHosts: [],
}

/** Provide the webStartup and webRuntime services the composition expects. */
export function apply(ctx: Context): void {
  ctx.provide('webStartup', STARTUP)
  ctx.provide('webRuntime', {
    lanAddresses: [],
    trustedHosts: [],
  } satisfies WebRuntimeValues)
}
