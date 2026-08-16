#!/usr/bin/env node
/**
 * Rename all manifest.dsh → manifest.ydb references in TypeScript source.
 * Only touches .ts/.tsx files in src/ and scripts/ (not tests/, not vendor/).
 * Run with: node scripts/rename-ts-dsh-refs.mjs [--commit]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const DRY_RUN = !process.argv.includes('--commit')
const ROOT = process.cwd()

// Ordered rules: most specific/longest patterns first
const RULES = [
  // manifest access patterns
  { from: /manifest\.dsh\?/g, to: 'manifest.ydb?', desc: 'manifest.dsh? → manifest.ydb?' },
  { from: /manifest\.dsh\./g, to: 'manifest.ydb.', desc: 'manifest.dsh. → manifest.ydb.' },
  { from: /manifest\.dsh!/g, to: 'manifest.ydb!', desc: 'manifest.dsh! → manifest.ydb!' },
  { from: /manifest\.dsh\b/g, to: 'manifest.ydb', desc: 'manifest.dsh → manifest.ydb' },

  // packageJson variable access
  { from: /pkg\.dsh\?/g, to: 'pkg.ydb?', desc: 'pkg.dsh? → pkg.ydb?' },
  { from: /pkg\.dsh\./g, to: 'pkg.ydb.', desc: 'pkg.dsh. → pkg.ydb.' },
  { from: /pkg\.dsh\b/g, to: 'pkg.ydb', desc: 'pkg.dsh → pkg.ydb' },

  // after.dsh (plugin.ts)
  { from: /after\.dsh\b/g, to: 'after.ydb', desc: 'after.dsh → after.ydb' },

  // readProfileManifest(...).dsh
  { from: /readProfileManifest\([^)]*\)\.dsh/g, to: (m) => m.replace('.dsh', '.ydb'), desc: 'readProfileManifest().dsh → .ydb' },

  // dsh.profile / dsh.bundle in comments/docs (broader)
  { from: /dsh\.profile\.bundles/g, to: 'ydb.profile.bundles', desc: 'dsh.profile.bundles → ydb.profile.bundles' },
  { from: /dsh\.profile/g, to: 'ydb.profile', desc: 'dsh.profile → ydb.profile' },
  { from: /dsh\.bundle/g, to: 'ydb.bundle', desc: 'dsh.bundle → ydb.bundle' },
  { from: /dsh\.client/g, to: 'ydb.client', desc: 'dsh.client → ydb.client' },

  // Interface/type names
  { from: /\bDshBundleManifest\b/g, to: 'YdbBundleManifest', desc: 'DshBundleManifest → YdbBundleManifest' },
  { from: /\bDshProfileManifest\b/g, to: 'YdbProfileManifest', desc: 'DshProfileManifest → YdbProfileManifest' },
  { from: /\bDshManifestSection\b/g, to: 'YdbManifestSection', desc: 'DshManifestSection → YdbManifestSection' },
  { from: /\bDshClientDeclaration\b/g, to: 'YdbClientDeclaration', desc: 'DshClientDeclaration → YdbClientDeclaration' },

  // Function names
  { from: /\bparseDshClient\b/g, to: 'parseYdbClient', desc: 'parseDshClient → parseYdbClient' },
  { from: /\bparseDshArgs\b/g, to: 'parseYdbArgs', desc: 'parseDshArgs → parseYdbArgs' },

  // HOME env var
  { from: /\bDSH_HOME\b/g, to: 'YDB_HOME', desc: 'YDB_HOME → YDB_HOME' },

  // Other dsh.* manifest field references
  { from: /dsh\.manifest/g, to: 'ydb.manifest', desc: 'dsh.manifest → ydb.manifest' },
]

function findFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'lib') continue
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) findFiles(full, files)
    else if ((entry.endsWith('.ts') || entry.endsWith('.tsx')) && !entry.endsWith('.d.ts')) {
      // Skip vendor
      if (!full.includes(`${join(ROOT, 'vendor')}`)) files.push(full)
    }
  }
  return files
}

const files = findFiles(ROOT)
let totalChanges = 0
const changeLog = []

for (const file of files) {
  const original = readFileSync(file, 'utf8')
  let content = original
  const localChanges = []

  for (const rule of RULES) {
    const matches = content.match(rule.from)
    if (matches) {
      const replacement = typeof rule.to === 'function' ? rule.to(rule.from.source) : rule.to
      localChanges.push(`  ${rule.desc}: ${matches.length}x`)
      content = content.replace(rule.from, replacement)
    }
  }

  if (content !== original) {
    totalChanges++
    changeLog.push(`${relative(ROOT, file)}:\n${localChanges.join('\n')}`)
    if (!DRY_RUN) writeFileSync(file, content, 'utf8')
  }
}

console.log(`\n${'='.repeat(60)}`)
console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLIED'}`)
console.log(`TS files modified: ${totalChanges}`)
console.log(`${'='.repeat(60)}`)

if (changeLog.length > 0 && changeLog.length < 100) {
  console.log('\n' + changeLog.join('\n\n'))
} else if (changeLog.length >= 100) {
  console.log(`\nToo many files to list (${changeLog.length})`)
}

if (DRY_RUN) console.log('\n⚠️  Use --commit to apply.')
