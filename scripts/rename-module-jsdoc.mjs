#!/usr/bin/env node
/**
 * Rename @module @deepseek-ai/dsh-* → @njydsz/ydb-* tags in TypeScript sources.
 * Also fixes @deepseek-ai/ scope in JSDoc @module tags.
 * Run with: node scripts/rename-module-jsdoc.mjs [--commit]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const DRY_RUN = !process.argv.includes('--commit')
const ROOT = process.cwd()

const RULES = [
  // @module tags with @deepseek-ai/dsh-* → @njydsz/ydb-*
  { from: /@module @deepseek-ai\/dsh-/g, to: '@module @njydsz/ydb-', desc: '@module @deepseek-ai/dsh-* → @njydsz/ydb-*' },
  // cordis imports (keep as-is since cordis is vendored)
  // catch any remaining @deepseek-ai/ scope references in comments
  { from: /@deepseek-ai\/dsh\b/g, to: '@njydsz/ydb', desc: '@deepseek-ai/dsh → @njydsz/ydb' },
  // @scope comments sometimes
  { from: /\* @deepseek-ai\//g, to: '* @njydsz/', desc: '* @deepseek-ai/ → @njydsz/' },
]

function findFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'lib') continue
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) findFiles(full, files)
    else if ((entry.endsWith('.ts') || entry.endsWith('.tsx')) && !full.includes(`${join(ROOT, 'vendor')}`)) {
      files.push(full)
    }
  }
  return files
}

const files = findFiles(ROOT)
let total = 0

for (const file of files) {
  const original = readFileSync(file, 'utf8')
  let content = original
  const changes = []
  for (const rule of RULES) {
    const m = content.match(rule.from)
    if (m) {
      changes.push(`${rule.desc}: ${m.length}x`)
      content = content.replace(rule.from, rule.to)
    }
  }
  if (content !== original) {
    total++
    if (total <= 50) console.log(`${relative(ROOT, file)}: ${changes.join(', ')}`)
    if (!DRY_RUN) writeFileSync(file, content, 'utf8')
  }
}

console.log(`\nFiles modified: ${total} ${DRY_RUN ? '(DRY RUN)' : '(APPLIED)'}`)
