import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_YDB_HOME_DISPLAY,
  YDB_HOME_DIR_NAME,
  canonicalizeWatchPath,
  defaultYdbHome,
  expandHomePath,
  resolveYdbHome,
  ydbHomeDisplay,
  ydbHomePath,
} from '@njydsz/ydb-home-paths'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('ydb path helpers', () => {
  it('owns the shared default YDB home directory name', () => {
    expect(YDB_HOME_DIR_NAME).toBe('.ydb')
    expect(DEFAULT_YDB_HOME_DISPLAY).toBe('~/.ydb')
    expect(defaultYdbHome()).toBe(join(homedir(), '.ydb'))
  })

  it('expands tilde paths without changing non-tilde paths', () => {
    expect(expandHomePath('~')).toBe(homedir())
    expect(expandHomePath('~/.ydb')).toBe(join(homedir(), '.ydb'))
    expect(expandHomePath('~\\.ydb')).toBe(join(homedir(), '.ydb'))
    expect(expandHomePath('/tmp/.ydb')).toBe('/tmp/.ydb')
    expect(expandHomePath('~other/.ydb')).toBe('~other/.ydb')
  })

  it('resolves explicit path before YDB_HOME and the default', () => {
    const envHome = join(homedir(), 'env-ydb')

    expect(resolveYdbHome('/tmp/explicit-ydb', { YDB_HOME: '~/env-ydb' })).toBe(resolve('/tmp/explicit-ydb'))
    expect(resolveYdbHome(undefined, { YDB_HOME: '~/env-ydb' })).toBe(envHome)
    expect(resolveYdbHome(undefined, {})).toBe(defaultYdbHome())
  })

  it('treats an empty or whitespace-only YDB_HOME as unset', () => {
    expect(resolveYdbHome(undefined, { YDB_HOME: '' })).toBe(defaultYdbHome())
    expect(resolveYdbHome(undefined, { YDB_HOME: '   ' })).toBe(defaultYdbHome())
  })

  it('joins child segments onto the resolved YDB_HOME', () => {
    vi.stubEnv('YDB_HOME', '~/env-ydb')
    expect(ydbHomePath()).toBe(join(homedir(), 'env-ydb'))
    expect(ydbHomePath('storages', 'cache')).toBe(join(homedir(), 'env-ydb', 'storages', 'cache'))
  })

  it('labels a resolved home by whether it is the default root', () => {
    expect(ydbHomeDisplay(resolve(defaultYdbHome()))).toBe('~/.ydb')
    expect(ydbHomeDisplay('/some/other/root')).toBe('$YDB_HOME')
  })

  it('canonicalizes a watcher ancestor while preserving a missing suffix', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ydb-watch-path-'))
    const target = join(root, 'target')
    const alias = join(root, 'alias')
    try {
      await mkdir(target)
      await symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir')
      await expect(canonicalizeWatchPath(join(alias, 'later', 'config.yml'))).resolves.toBe(
        join(await realpath(target), 'later', 'config.yml'),
      )
      const file = join(root, 'file')
      await writeFile(file, 'not a directory')
      await expect(canonicalizeWatchPath(join(file, 'child'))).rejects.toMatchObject({ code: 'ENOTDIR' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
