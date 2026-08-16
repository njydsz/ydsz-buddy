/**
 * Electron host runtime bootstrap (Stage 1 — HTTP carriage) — composes the
 * Cordis tree in the main process reusing the shipped web profile verbatim,
 * with minimal overlays. The webserver keeps running in the main process; the
 * Electron renderer loads the frontend over loopback HTTP exactly as a browser
 * would. This is the cleanest path to a working desktop shell: the entire web
 * composition (boot manifest, plugin bundle serving, api-gateway, all host
 * services) works unchanged — zero code divergence.
 *
 * Two web-app bundle rows have CLI dependencies that never resolve in Electron:
 * - `web-startup` parses CLI flags via the cmdlineArgs service; it provides
 *   `webStartup`, which downstream rows inject.
 * - `web-runtime` samples LAN trust (irrelevant for loopback) and provides
 *   `webRuntime` plus the Web surface context prompt.
 *
 * Both are disabled and replaced by the self-contained `electron-runtime`
 * plugin, which provides `webStartup` and `webRuntime` with fixed loopback
 * values. The `webserver` row's flag-dependent config and `inject` are
 * patched to the matching static values. Everything else in the web profile
 * (boot manifest, api-gateway, client modules, frontend dist) works as-is.
 *
 * Stage 2 (separate delivery) adds the IPC fetch carrier (IpcApiClient +
 * preload bridge) to remove the HTTP dependency for unary/streaming RPC.
 * The work here is structured so stage 2 swaps the carrier without touching
 * the host composition.
 * @module @njydsz/ydb-gui/host-runtime
 */

import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@njydsz/cordis'
import type { PatchOptions } from '@njydsz/cordis-plugin-include'
import {
  boot, healProfilesModuleFallback, installFailLoud,
  loadOptionalPatches, loadProfile, PROFILE_PATCH_FILENAME,
} from '@njydsz/ydb-app-boot'
import type { Profile } from '@njydsz/ydb-app-boot'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'

/** Diagnostic prefix for load-failure errors (mirrors the CLI's 'dsh'). */
const BIN_NAME = 'dsh'

/** Stable Cordis plugin name for the Electron marker overlay. */
export const name = 'electron-host-runtime'

/** Package directory anchor — tracks this apps/gui install for profile load. */
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
 * - disable `web-startup` (CLI flag provider) and `web-runtime` (LAN trust +
 *   surface prompt) — both have Electron-irrelevant dependencies.
 * - insert `electron-runtime`, which provides `webStartup` and `webRuntime`
 *   with fixed loopback values.
 * - patch `webserver` to drop its `inject: [webStartup]`
 *   dependency and use static host/port values matching electron-runtime.
 * @returns the resolved host (context + webserver URL).
 */
export async function bootHostRuntime(): Promise<ElectronHost> {
  const profile = prepareProfile('web')
  const homePatches = loadOptionalPatches(BIN_NAME, homePatchPath()) ?? []

  // Patches are applied in array order; each PatchOptions[] is one layer. The
  // web composition's own layers (bundles, profile's cordis.patch.yml, home
  // layer) are already in profile.layers and profile.patches. Our overlay is
  // the final layer, so it outranks every earlier row that it targets.
  const overlay: PatchOptions[] = [
    // web-startup provides webStartup via CLI flag parsing (cmdlineArgs);
    // web-runtime reads LAN trust. Both are replaced by electron-runtime.
    { id: 'web-startup', disabled: true },
    { id: 'web-runtime', disabled: true },
    // Provide the webStartup/webRuntime services the composition expects.
    { insert: [{ id: 'electron-runtime', name: '@njydsz/ydb-gui/runtime' }] },
    // Drop the webserver's flag-provider dependency; use static values so the
    // row resolves without waiting for the CLI's web-startup provider.
    { id: 'webserver', inject: [], config: { host: '127.0.0.1', port: 0 } },
  ]

  const allPatches = [
    ...profile.layers.flatMap(layer => layer.patches),
    ...profile.patches,
    ...homePatches,
    ...overlay,
  ]

  // boot() writes baseUrl from the config path, mounts the Loader, applies the
  // patches over the empty root, and settles the tree. installFailLoud makes
  // any unhandled rejection fatal (no silent dead app).
  //
  // bareModuleBaseUrl (5th arg) redirects the Loader's bare-plugin resolution
  // from the config file's directory (the profile dir, which has no
  // node_modules) to the GUI package directory — where pnpm linked every
  // @njydsz/ydb-* plugin the web profile patches reference. Without this, the
  // Loader (which lives at vendor/loader/lib/) would resolve from its own
  // location and miss the packages that only apps/gui/node_modules hosts.
  const rootConfig = join(profile.dir, 'cordis.yml')
  const bareModuleBaseUrl = pathToFileURL(join(INSTALL_ANCHOR, '..')).href + '/'
  console.error('[electron] bareModuleBaseUrl:', bareModuleBaseUrl)
  console.error('[electron] INSTALL_ANCHOR:', INSTALL_ANCHOR)
  let ctx: Context
  try {
    ctx = await boot(BIN_NAME, rootConfig, allPatches, undefined, bareModuleBaseUrl)
  } catch (bootError) {
    console.error('[electron] boot error type:', typeof bootError, bootError?.constructor?.name)
    console.error('[electron] boot error keys:', bootError ? Object.keys(bootError) : 'null')
    // Deep-walk the cause chain looking for errors array
    const seen = new Set<any>()
    let err: any = bootError
    while (err && !seen.has(err)) {
      seen.add(err)
      console.error('[electron] walking:', err?.constructor?.name, err?.message?.substring(0, 80))
      if (Array.isArray(err?.errors)) {
        console.error('[electron] FOUND AggregateError with', err.errors.length, 'errors:')
        for (const e of err.errors.slice(0, 10)) {
          console.error('[electron]  - ', e?.message ?? String(e))
          if (e?.cause) console.error('[electron]    cause:', e.cause?.message?.substring(0, 120) ?? String(e.cause))
        }
        break
      }
      err = err?.cause
    }
    throw bootError
  }
  installFailLoud(BIN_NAME)

  // DIAGNOSTIC: dump profile structure
  console.error('[electron] profile name:', profile.name)
  console.error('[electron] profile dir:', profile.dir)
  console.error('[electron] layers count:', profile.layers.length)
  for (const layer of profile.layers) {
    console.error(`[electron] layer: ${layer.packageName} patches=${layer.patchPath}`)
  }
  console.error('[electron] profile patches:', profile.patches.length)
  console.error('[electron] profile patchPath:', profile.patchPath)
  const webServer = ctx.get('webServer') as { host: string, port: number } | undefined
  if (webServer === undefined) throw new Error('electron-host: webServer service missing after composition')

  // The webserver binds loopback by default; the OS picks the port (0).
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
function prepareProfile(profileName: string): Profile {
  healProfilesModuleFallback(INSTALL_ANCHOR)
  const profile = loadProfile(BIN_NAME, profileName, INSTALL_ANCHOR, undefined, { userLayer: true })
  writeFileSync(join(profile.dir, 'cordis.yml'), PROFILE_ROOT_CONFIG)
  return profile
}

/**
 * The home-level user patch layer (`$YDB_HOME/cordis.patch.yml`).
 * @returns the absolute patch-file path.
 */
function homePatchPath(): string {
  return join(homeDir(), PROFILE_PATCH_FILENAME)
}

/** Resolve $YDB_HOME (the electron app shares the same home as `dsh`). */
function homeDir(): string {
  return process.env.YDB_HOME ?? `${process.env.USERPROFILE ?? process.env.HOME ?? ''}/.dsh`
}
