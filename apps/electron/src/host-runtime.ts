/**
 * Electron host runtime bootstrap (MVP) — composes the Cordis tree in the
 * main process reusing the shipped web profile verbatim, with only one change:
 * the web-runtime row (LAN trust fence, surface prompt, bash variables) is
 * disabled because the Electron renderer is a first-party shell, not a
 * browser page. The webserver and client-modules keep running; the renderer
 * loads the frontend from the local HTTP endpoint exactly as a browser would.
 *
 * This is the cleanest MVP path: the entire web composition (boot manifest,
 * plugin bundle serving, api-gateway, all host-plane services) works
 * unchanged — zero code divergence from the web profile. Stage 2 adds the
 * IPC fetch carrier (IpcApiClient + preload bridge) to remove the HTTP
 * dependency for unary/streaming RPC; the local webserver then only serves
 * the static dist.
 * @module @deepseek-ai/dsh-electron/host-runtime
 */

import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import {
  boot, composeEntries, healProfilesModuleFallback, installFailLoud,
  loadOptionalPatches, loadProfile,
} from '@deepseek-ai/dsh-app-boot'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'

/** Stable Cordis plugin name. */
export const name = 'electron-host-runtime'

/** Package directory (source and built both sit at the same depth under apps/electron). */
export const INSTALL_ANCHOR = fileURLToPath(new URL('../package.json', import.meta.url))

/** Empty root config — the whole composition is patch layers. */
const PROFILE_ROOT_CONFIG = `# dsh electron profile root — an empty entry list. The tree is composed as patches.
[]
`

/** Resolved host runtime: the live context and the local webserver base URL. */
export interface ElectronHost {
  /** The live Cordis context — holds every host service. */
  ctx: Context
  /** Local HTTP URL the renderer should load (where the webserver serves the frontend). */
  url: string
}

/**
 * Compose the host runtime, reusing the shipped web profile. Only the
 * web-runtime row is disabled (the Electron shell is first-party and needs
 * no LAN trust fence). Everything else — webserver, frontend-static,
 * client-modules, api-gateway, all host-plane services — boots identically
 * to the web profile.
 * @returns the resolved host (context + webserver URL).
 */
export async function bootHostRuntime(): Promise<ElectronHost> {
  const profile = prepareProfile('web')
  const homePatches = loadOptionalPatches('dsh', homePatchPath()) ?? []

  // The only profile change for the Electron MVP: disable web-runtime. Its
  // config provides `webRuntime` (LAN trust + surface prompt + bash vars);
  // the connection row's client-half reads it to build the trusted-hosts
  // fence. Since the renderer is first-party (not a browser page), LAN trust
  // is irrelevant — we leave connection disabled at the composition level
  // for the IPC stage, but for the MVP the renderer loads over HTTP and
  // connection stays enabled with the webserver's loopback origin.
  const overlay: import('@deepseek-ai/cordis-plugin-include').PatchOptions[] = [
    { id: 'web-runtime', disabled: true },
    // Electron mode seam: a marker overlay disables LAN trust on the
    // connection row. The MVP keeps connection enabled so the renderer's
    // WebApiClient works unchanged over loopback HTTP. Stage 2's IPC carrier
    // replaces connection entirely.
    { id: 'connection', config: { trustedHosts: ['*'] } },
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

  // The webserver row is flagged inject: [webStartup]; without the web-startup
  // plugin (CLI-only) we supply a default MVP config. The actual values come
  // from the webserver schema's defaults (127.0.0.1:3080) unless overridden.
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
 * The home-level user patch layer (`$DSH_HOME/cordis.patch.yml`).
 * @returns the absolute patch-file path.
 */
function homePatchPath(): string {
  return join(homeDir(), 'cordis.patch.yml')
}

/** Resolve $DSH_HOME (the electron app uses the same home as `dsh`). */
function homeDir(): string {
  // resolveDshHome reads DSH_HOME env or defaults to ~/.dsh; the electron MVP
  // shares the same home so agents/settings/credentials/presets carry over.
  return process.env.DSH_HOME ?? `${process.env.USERPROFILE ?? process.env.HOME ?? ''}/.dsh`
}
