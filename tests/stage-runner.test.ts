import { describe, it, expect, vi } from 'vitest'
import { runStage } from '@main/pipeline/stage-runner'

function makeProvider(id: string, run: (i: any) => Promise<any>) {
  return {
    id, stage: 'compose' as const, displayName: id, requiresCredentials: [],
    costModel: { estimate: () => 0 }, async healthCheck() { return { ok: true } }, run
  }
}

describe('runStage', () => {
  it('returns first successful provider result', async () => {
    const p1 = makeProvider('a', vi.fn().mockResolvedValue('ok-a'))
    const r = await runStage([p1], 'input', { runId: 't', runDir: '/tmp', logger: () => {} }, () => undefined)
    expect(r.output).toBe('ok-a'); expect(r.providerId).toBe('a')
  })

  it('falls over to next provider on retryable error', async () => {
    const p1 = makeProvider('a', vi.fn().mockRejectedValue(Object.assign(new Error('429'), { status: 429 })))
    const p2 = makeProvider('b', vi.fn().mockResolvedValue('ok-b'))
    const r = await runStage([p1, p2], 'input', { runId: 't', runDir: '/tmp', logger: () => {} }, () => undefined)
    expect(r.providerId).toBe('b')
  })

  it('throws aggregated error if all fail', async () => {
    const p1 = makeProvider('a', vi.fn().mockRejectedValue(new Error('boom')))
    const p2 = makeProvider('b', vi.fn().mockRejectedValue(new Error('boom')))
    await expect(runStage([p1, p2], 'input', { runId: 't', runDir: '/tmp', logger: () => {} }, () => undefined))
      .rejects.toThrow(/all.*providers.*failed/i)
  })
})
