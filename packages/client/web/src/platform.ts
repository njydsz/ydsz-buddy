/**
 * Shared browser platform modules. Seeding, bundling externals, and Vite
 * aliases consume this list so their module identities cannot drift.
 * @module @njydsz/ydb-client-web/src/platform
 */

/** The module specifiers the shell shares into the frozen module table. */
export const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@njydsz/ydb-client-ui-slots',
  '@njydsz/ydb-client-web-react',
  '@njydsz/ydb-client-ui-primitives',
  '@njydsz/ydb-client-ui-attachment',
  '@njydsz/ydb-client-schema-form',
] as const

/** One platform module specifier (a seed-table key). */
export type PlatformModule = (typeof PLATFORM_MODULES)[number]
