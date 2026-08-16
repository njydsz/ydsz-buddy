#!/usr/bin/env node
/**
 * Rename the custom "dsh" manifest field in all package.json files to "ydb".
 * This is the `dsh.client` declaration used by the build system.
 * Run with: node scripts/rename-dsh-manifest.mjs [--commit]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const DRY_RUN = !process.argv.includes('--commit')
const ROOT = process.cwd()

function findFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'lib') continue
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) findFiles(full, files)
    else if (entry === 'package.json') files.push(full)
  }
  return files
}

const files = findFiles(ROOT)
let totalChanges = 0

// Match "dsh": { (with possible whitespace) but NOT part of a larger word
const RE = /"dsh":\s*\{/g

for (const file of files) {
  const original = readFileSync(file, 'utf8')
  const matches = original.match(RE)
  if (matches) {
    const content = original.replace(RE, '"ydb": {')
    totalChanges++
    if (!DRY_RUN) writeFileSync(file, content, 'utf8')
    console.log(`${relative(ROOT, file)}: ${matches.length}x`)
  }
}

console.log(`\n${'='.repeat(60)}`)
console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLIED'}`)
console.log(`Files with "dsh" manifest field modified: ${totalChanges}`)
if (DRY_RUN) console.log('⚠️  Use --commit to apply.')
