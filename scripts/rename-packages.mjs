#!/usr/bin/env node
/**
 * Bulk rename script: @deepseek-ai → @njydsz, deepseek-harness → ydsz-buddy, dsh → ydb
 * Run with: node scripts/rename-packages.mjs [--commit]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const DRY_RUN = !process.argv.includes('--commit')
const ROOT = process.cwd()

// Replacement rules — order matters (more specific first)
const RULES = [
  // npm scope
  { from: /@deepseek-ai\//g, to: '@njydsz/', desc: '@deepseek-ai/* → @njydsz/*' },

  // Repository/product name (hyphen form)
  { from: /deepseek-harness/g, to: 'ydsz-buddy', desc: 'deepseek-harness → ydsz-buddy' },

  // CLI bin field (exact match for "dsh" as bin name)
  { from: /"bin":\s*\{\s*"dsh"/g, to: '"bin": {"ydb', desc: 'bin.dsh → bin.ydb' },

  // CLI package name itself
  { from: /"@deepseek-ai\/dsh"/g, to: '"@njydsz/ydb"', desc: '@deepseek-ai/dsh → @njydsz/ydb' },

  // Package name field — only exact dsh root
  { from: /"name": "@deepseek-ai\/dsh-root"/g, to: '"name": "@njydsz/ydb-root"', desc: 'root pkg' },

  // Description updates
  { from: /dsh CLI:/g, to: 'ydb CLI:', desc: 'description: dsh CLI → ydb CLI' },
  { from: /DeepSeek Harness/g, to: 'Ydsz Buddy', desc: 'DeepSeek Harness → Ydsz Buddy' },
  { from: /deepseek-harness/g, to: 'ydsz-buddy', desc: 'deepseek-harness → ydsz-buddy' },

  // GitHub URLs
  { from: /github\.com\/deepseek-ai\/deepseek-harness/g, to: 'github.com/njydsz/ydsz-buddy', desc: 'github URL' },
]

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
const changeLog = []

for (const file of files) {
  const original = readFileSync(file, 'utf8')
  let content = original
  const localChanges = []

  for (const rule of RULES) {
    const matches = content.match(rule.from)
    if (matches) {
      localChanges.push(`  ${rule.desc}: ${matches.length}x`)
      content = content.replace(rule.from, rule.to)
    }
  }

  if (content !== original) {
    totalChanges++
    const rel = relative(ROOT, file)
    changeLog.push(`\n${rel}`)
    changeLog.push(...localChanges)
    if (!DRY_RUN) {
      writeFileSync(file, content, 'utf8')
    }
  }
}

console.log(`\n${'='.repeat(60)}`)
console.log(`Mode: ${DRY_RUN ? 'DRY RUN (use --commit to apply)' : 'APPLIED'}`)
console.log(`Total files scanned: ${files.length}`)
console.log(`Files modified: ${totalChanges}`)
console.log(`${'='.repeat(60)}`)

if (changeLog.length > 0) {
  console.log('\nChanges:')
  console.log(changeLog.join('\n'))
}

if (DRY_RUN && totalChanges > 0) {
  console.log('\n⚠️  DRY RUN — no files were modified. Use --commit to apply.')
}
