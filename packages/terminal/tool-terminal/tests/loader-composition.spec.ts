import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { CallId } from '@njydsz/ydb-llm'
import { Session, SessionId } from '@njydsz/ydb-session'
import AgentRegistry, { Inbox } from '@njydsz/ydb-agent'
import type { Agent } from '@njydsz/ydb-agent'
import SystemPrompt from '@njydsz/ydb-system-prompt'
import ToolRuntime from '@njydsz/ydb-tools'
import TerminalSessionService from '@njydsz/ydb-terminal'
import SandboxProvider from '@njydsz/ydb-sandbox'
import type { ConfinedArgv, SandboxPolicy } from '@njydsz/ydb-sandbox'
import SandboxPolicyService from '@njydsz/ydb-sandbox-policy'
import LocalSubprocessRuntime from '@njydsz/ydb-subprocess-local'
import * as TerminalLocal from '@njydsz/ydb-terminal-bash'
import * as ToolPty from '@njydsz/ydb-tool-terminal'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

class PassthroughSandbox extends SandboxProvider {
  confine(argv: readonly string[], _policy: SandboxPolicy): ConfinedArgv {
    return { argv: [...argv], enforcement: 'full', denialSignatures: [], runnerFailureRules: [] }
  }
}

function agent(ctx: Context): Agent {
  const scope = ctx.plugin(() => {})
  const id = SessionId('pty-loader-agent')
  const session = Session.create(id)
  const value: Agent = {
    id, options: {}, session, inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    status: 'idle',
    ctx: scope.ctx,
    send: () => {},
    followup: () => {}, steer: () => {}, inject: () => {}, cancel() {},
    runMaintenance: job => job(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  ctx.agents.register(value)
  return value
}

function resultText(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

const suite = process.platform === 'linux' || process.platform === 'darwin' ? describe : describe.skip

suite('terminal real Loader composition through cordis.yml', () => {
  it('boots cordis.yml and preserves shell state across real tool calls', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-pty-loader-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@njydsz/ydb-agent'",
      "- name: '@njydsz/ydb-system-prompt'",
      "- name: '@njydsz/ydb-tools'",
      "- name: '@njydsz/ydb-terminal'",
      "- name: '@njydsz/ydb-test-sandbox'",
      "- name: '@njydsz/ydb-sandbox-policy'",
      '  config:',
      '    mode: danger-full-access',
      `    workspaceRoot: ${JSON.stringify(root)}`,
      "- name: '@njydsz/ydb-subprocess-local'",
      "- name: '@njydsz/ydb-terminal-bash'",
      '  config:',
      '    pollIntervalMs: 10',
      '    exactProbeAfterMs: 20',
      '    idleSilenceMs: 250',
      '    handoffGraceMs: 250',
      '    timeoutMs: 2000',
      '    disposeGraceMs: 500',
      "- name: '@njydsz/ydb-tool-terminal'",
      '',
    ].join('\n'))

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@njydsz/ydb-agent', AgentRegistry],
      ['@njydsz/ydb-system-prompt', SystemPrompt],
      ['@njydsz/ydb-tools', ToolRuntime],
      ['@njydsz/ydb-terminal', TerminalSessionService],
      ['@njydsz/ydb-test-sandbox', PassthroughSandbox],
      ['@njydsz/ydb-sandbox-policy', SandboxPolicyService],
      ['@njydsz/ydb-subprocess-local', LocalSubprocessRuntime],
      ['@njydsz/ydb-terminal-bash', TerminalLocal],
      ['@njydsz/ydb-tool-terminal', ToolPty],
    ])
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await context.loader.await()

    const owner = agent(context)
    const signal = new AbortController().signal
    const spawn = await context.tools.execute({
      signal, callId: CallId('spawn'), name: 'terminal_open', arguments: { type: 'shell', name: 'main', cwd: root }, agent: owner,
    })
    expect(resultText(spawn)).toContain('started terminal session pty-1 (main)')

    await context.tools.execute({
      signal, callId: CallId('state'), name: 'terminal_send', arguments: { sessionId: 'pty-1', text: 'export KEEP=loader; cd /' }, agent: owner,
    })
    const read = await context.tools.execute({
      signal, callId: CallId('read'), name: 'terminal_send', arguments: { sessionId: 'pty-1', text: 'printf "cwd=%s keep=%s\\n" "$PWD" "$KEEP"' }, agent: owner,
    })
    expect(resultText(read)).toContain('cwd=/ keep=loader')
    expect(context.terminals.list(owner)).toHaveLength(1)
  }, 15_000)
})
