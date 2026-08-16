/**
 * Package-owned invariant companion for `@njydsz/ydb-fs-sandbox`.
 * @module @njydsz/ydb-fs-sandbox/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@njydsz/ydb-invariants'

const PACKAGE_NAME = '@njydsz/ydb-fs-sandbox'

/** Cordis companion plugin name. */
export const name = 'fs-sandbox-invariant'
/** Services required before the companion can register. */
export const inject = ['invariants']

/** No runtime invariant: this stateless adapter delegates policy and filesystem relations to their owning seams. */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
