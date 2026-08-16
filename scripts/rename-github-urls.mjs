#!/usr/bin/env node
/**
 * Final sweep: replace remaining github.com/deepseek-ai → github.com/njydsz
 * in package.json, and remaining deepseek refere


 nces in descriptions.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const DRY_RUN = !process.argv.includes('--commit')
const ROOT = process.cwd()

const RULES = [
  { from: /github\.com\/deepseek-ai\//g, to: 'github.com/njydsz/', desc: 'github URL org' },
  { from: /DeepSeek Harness/g, to: 'Ydsz Buddy', desc: 'product name (title)' },
  { from: /deepseek-harness/g, to: 'ydsz-buddy', desc: 'product name (kebab)' },
  { from: /deepseek_harness/g, to: 'ydsz_buddy', desc: 'product name (snake)' },
  { from: /@deepseek-ai\//g, to: '@njydsz/', desc: '@scope' },
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
let total = 0

for (const file of files) {
  const original = readFileSync(file, 'utf8')
  let content = original
  for (const rule of RULES) {
    if (rule.from.test(content)) {
      content = content.replace(rule.from, rule.to)
    }
  }
  if (content !== original) {
    total++
    if (!DRY_RUN) writeFileSync(file, content, 'utf8')
    console.log(relative(ROOT, file))
  }
}

console.log(`\nFiles modified: ${total} ${DRY_RUN ? '(DRY RUN)' : '(APPLIED)'}`)
