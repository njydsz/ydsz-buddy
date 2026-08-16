/**
 * Package-owned invariant companion for `@njydsz/ydb-typert-loader`.
 * @module @njydsz/ydb-typert-loader/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@njydsz/ydb-invariants'

const PACKAGE_NAME = '@njydsz/ydb-typert-loader'

/** Cordis companion plugin name. */
export const name = 'typert-loader-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the Loader entry lifecycle directly owns each exact
 * registry disposer, and integration tests observe registration and removal.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
