#!/usr/bin/env node
/**
 * Rename all DSH_* environment variable references to YDB_* across source code.
 * Handles: process.env.DSH_*, string literals 'DSH_*', constant definitions.
 * Run with: node scripts/rename-dsh-env-vars.mjs [--commit]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const DRY_RUN = !process.argv.includes('--commit')
const ROOT = process.cwd()

// Map of old → new env var names
const ENV_VAR_MAP = [
  ['YDB_TELEMETRY_DISABLED', 'YDB_TELEMETRY_DISABLED'],
  ['YDB_TELEMETRY_MODE', 'YDB_TELEMETRY_MODE'],
  ['YDB_TELEMETRY_OTLP_URL', 'YDB_TELEMETRY_OTLP_URL'],
  ['YDB_LAUNCH_ENVIRONMENT_KEY', 'YDB_LAUNCH_ENVIRONMENT_KEY'],
  ['YDB_WEB_URL', 'YDB_WEB_URL'],
  ['YDB_WEB_STRESS_HEADFUL', 'YDB_WEB_STRESS_HEADFUL'],
  ['YDB_PERMISSION_MODE', 'YDB_PERMISSION_MODE'],
  ['YDB_TOOLS_MODE', 'YDB_TOOLS_MODE'],
  ['YDB_SESSION_ROOT', 'YDB_SESSION_ROOT'],
  ['YDB_CWD', 'YDB_CWD'],
  ['YDB_NODE_PTY_SPAWN_HELPER', 'YDB_NODE_PTY_SPAWN_HELPER'],
  ['YDB_SNAPSHOT', 'YDB_SNAPSHOT'],
  ['YDB_E2E_MAX_WORKERS', 'YDB_E2E_MAX_WORKERS'],
  ['YDB_BUILD_FACE', 'YDB_BUILD_FACE'],
  ['YDB_EXAMPLE_MODE', 'YDB_EXAMPLE_MODE'],
  ['YDB_RUNTIME_MODE', 'YDB_RUNTIME_MODE'],
  ['YDB_CORDIS_CONFIG', 'YDB_CORDIS_CONFIG'],
  ['YDB_RUNTIME_PLATFORM_TAG', 'YDB_RUNTIME_PLATFORM_TAG'],
  ['YDB_SNAPSHOT_MAX_CONCURRENCY', 'YDB_SNAPSHOT_MAX_CONCURRENCY'],
  ['YDB_HOME', 'YDB_HOME'],
]

function buildRules() {
  const rules = []
  for (const [old, neu] of ENV_VAR_MAP) {
    // process.env.DSH_* and process.env['DSH_*']
    rules.push({ from: new RegExp(`process\\.env\\.${old}\\b`, 'g'), to: `process.env.${neu}`, desc: `process.env.${old} → process.env.${neu}` })
    rules.push({ from: new RegExp(`process\\.env\\['${old}'\\]`, 'g'), to: `process.env['${neu}']`, desc: `process.env['${old}'] → process.env['${neu}']` })
    // String literals 'DSH_*' and "DSH_*"
    rules.push({ from: new RegExp(`'${old}'`, 'g'), to: `'${neu}'`, desc: `'${old}' → '${neu}'` })
    rules.push({ from: new RegExp(`"${old}"`, 'g'), to: `"${neu}"`, desc: `"${old}" → "${neu}"` })
    // Const declarations
    rules.push({ from: new RegExp(`\\b${old}\\b`, 'g'), to: neu, desc: `${old} → ${neu}` })
  }
  return rules
}

const RULES = buildRules()

function findFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'lib') continue
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) findFiles(full, files)
    else if ((entry.endsWith('.ts') || entry.endsWith('.tsx') || entry.endsWith('.py') || entry.endsWith('.mjs'))
      && !full.includes(`${join(ROOT, 'vendor')}`)) {
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
    if (total <= 30) console.log(`${relative(ROOT, file)}:\n  ${changes.join('\n  ')}`)
    if (!DRY_RUN) writeFileSync(file, content, 'utf8')
  }
}

console.log(`\nFiles modified: ${total} ${DRY_RUN ? '(DRY RUN)' : '(APPLIED)'}`)
