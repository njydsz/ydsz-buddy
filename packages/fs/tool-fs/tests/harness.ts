import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@njydsz/ydb-agent'
import AgentLoop from '@njydsz/ydb-agent-loop'
import { mountAgentLoopTestDependencies } from '@njydsz/ydb-agent-loop-testkit'
import LocalFileSystem from '@njydsz/ydb-fs-local'
import * as FsPolicy from '@njydsz/ydb-fs-observation-policy'
import * as ToolFs from '@njydsz/ydb-tool-fs'
import * as LlmDeepSeek from '@njydsz/ydb-llm-deepseek'

/**
 * Build the real fs-tool stack for with-key e2e tests. Agents have no session
 * cwd, so `fsCwd` is their workspace; `persona` configures the deployment prompt.
 * This helper lives outside the e2e glob so imports do not register tests.
 */
export async function fsHarness(fsCwd: string, persona = ''): Promise<Context> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx, { systemPrompt: { persona } })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(LlmDeepSeek)
  await ctx.plugin(LocalFileSystem, { cwd: fsCwd })
  await ctx.plugin(FsPolicy)
  await ctx.plugin(ToolFs)
  return ctx
}

export function waitForIdle(ctx: Context, agent: Agent): Promise<void> {
  return new Promise((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent && status === 'idle') {
        dispose()
        resolve()
      }
    })
  })
}
