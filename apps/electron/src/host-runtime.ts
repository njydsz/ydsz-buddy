/**
 * Electron host runtime bootstrap (Stage 1 — HTTP carriage) — composes the
 * Cordis tree in the main process reusing the shipped web profile verbatim,
 * with minimal overlays. The webserver keeps running in the main process; the
 * Electron renderer loads the frontend over loopback HTTP exactly as a browser
 * would. This is the cleanest path to a working desktop shell: the entire web
 * composition (boot manifest, plugin bundle serving, api-gateway, all host
 * services) works unchanged — zero code divergence.
 *
 * Stage 2 (separate delivery) adds the IPC fetch carrier (IpcApiClient +
 * preload bridge) to remove the HTTP dependency for unary/streaming RPC.
 * The work here is structured so stage 2 swaps the carrier without touching
 * the host composition.
 * @module @deepseek-ai/dsh-electron/host-runtime
 */

import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import {
  boot, composeEntries, healProfilesModuleFallback, installFailLoud,
  loadOptionalPatches, loadProfile,
} from '@deepseek-ai/dsh-app-boot'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'

/** Stable Cordis plugin name for the Electron marker overlay. */
export const name = 'electron-host-runtime'

/** Package directory anchor — tracks this apps/cli install for profile_load */
export const INSTALL_ANCHOR = fileURLToPath(new URL('../package.json', import.meta.url))

/** Empty root config — the whole composition is patch layers (mirrors cli/profile-boot). */
const PROFILE_ROOT_CONFIG = `# dsh electron profile root — an empty entry list. The tree is composed as patches.
[]
`

/** Resolved host runtime: the live context and the local webserver base URL. */
export interface ElectronHost {
  /** The live Cordis context holding every host service. */
  ctx: Context
  /** Local HTTP URL the renderer should load (where the webserver serves the frontend). */
  url: string
}

/**
 * Compose the host runtime, reusing the shipped web profile. Overlays:
 * - disable `web-runtime` (LAN trust fence + surface prompt) — the Electron
 *   renderer is first-party, not a browser page, and web-runtime injects
 *   webServer (unavailable without the CLI's web-startup provider).
 * - patch `connection` with a loopback-only trustedHosts value so the
 *   client-half's WebApiClient trusts the local webserver without needing
 *   webRuntime (which web-runtime would provide).
 * @returns the resolved host (context + webserver URL).
 */
export async function bootHostRuntime(): Promise<ElectronHost> {
  const profile = prepareProfile('web')
  const homePatches = loadOptionalPatches('dsh', homePatchPath()) ?? []

  const overlay: PatchOptions[] = [
    // web-runtime injects webServer and relies on the CLI's web-startup
    // plugin; in Electron neither is available. Disabling it cascades to
    // connection's trustedHosts (which reads webRuntime.trustedHosts) —
    // patch connection directly to fix the break.
    { id: 'web-runtime', disabled: true },
    // connection's trustedHosts defaults to [] (loopback-only trust). With
    // web-runtime disabled, the patch expression ctx.webRuntime.trustedHosts
    // would break; override with an explicit loopback-only value so the
    // client-half trusts the local webserver.
    { id: 'connection', config: { trustedHosts: ['loopback'] } },
  ]

  const allPatches = [
    ...profile.layers.flatMap(layer => layer.patches),
    ...profile.patches,
    ...homePatches,
    ...overlay,
  ]
  const entries = composeEntries(allPatches)

  const ctx = new Context()
  await boot(ctx, entries, { baseUrl: profile.dir })
  installFailLoud(ctx)

  const webServer = ctx.get('webServer') as { host: string, port: number } | undefined
  if (webServer === undefined) throw new Error('electron-host: webServer service missing after composition')

  // The webserver binds loopback by default; if it bound all-interfaces, the
  // renderer still loads via loopback.
  const host = webServer.host === '0.0.0.0' ? '127.0.0.1' : webServer.host
  const url = `http://${host}:${String(webServer.port)}`
  return { ctx, url }
}

/**
 * Load and prepare the named profile. Reuses the profile-boot helpers so the
 * electron composition tracks the web composition for free.
 * @param profileName - the profile name (web).
 * @returns the prepared profile.
 */
function prepareProfile(profileName: string): import('@deepseek-ai/dsh-app-boot').Profile {
  healProfilesModuleFallback(INSTALL_ANCHOR)
  const profile = loadProfile('dsh', profileName, INSTALL_ANCHOR, undefined, { userLayer: true })
  writeFileSync(join(profile.dir, 'cordis.yml'), PROFILE_ROOT_CONFIG)
  return profile
}

/**
 * The home-level user patch layer (`$YDB_HOME/cordis.patch.yml`).
 * @returns the absolute patch-file path.
 */
function homePatchPath(): string {
  return join(homeDir(), 'cordis.patch.yml')
}

/** Resolve $YDB_HOME (the electron app shares the same home as `dsh`). */
function homeDir(): string {
  return process.env.YDB_HOME ?? `${process.env.USERPROFILE ?? process.env.HOME ?? ''}/.dsh`
}
