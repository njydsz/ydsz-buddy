#!/usr/bin/env node
/**
 * Rename Python SDK class names across .py files.
 * DeepSeekHarness → YdszBuddy, DeepSeekHarnessConfig → YdszBuddyConfig,
 * HarnessClient → YdbClient, HarnessConfig → YdbConfig
 * Run with: node scripts/rename-python-sdk.mjs [--commit]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const DRY_RUN = !process.argv.includes('--commit')
const ROOT = process.cwd()

const RULES = [
  // Class names (order matters — longest/most specific first)
  { from: /\bDeepSeekHarnessConfig\b/g, to: 'YdszBuddyConfig', desc: 'DeepSeekHarnessConfig → YdszBuddyConfig' },
  { from: /\bDeepSeekHarness\b/g, to: 'YdszBuddy', desc: 'DeepSeekHarness → YdszBuddy' },
  { from: /\bHarnessConfig\b/g, to: 'YdbConfig', desc: 'HarnessConfig → YdbConfig' },
  { from: /\bHarnessClient\b/g, to: 'YdbClient', desc: 'HarnessClient → YdbClient' },
]

function findFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) findFiles(full, files)
    else if (entry.endsWith('.py') && full.includes(`${join(ROOT, 'python')}`)) files.push(full)
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
    console.log(`${relative(ROOT, file)}: ${changes.join(', ')}`)
    if (!DRY_RUN) writeFileSync(file, content, 'utf8')
  }
}

console.log(`\nPython files modified: ${total} ${DRY_RUN ? '(DRY RUN)' : '(APPLIED)'}`)
