// src/main/pipeline/stage-runner.ts
import type { StageProvider, RunContext } from './contracts'

export interface StageResult<T> {
  providerId: string
  output: T
  durationMs: number
  usedFallback: boolean
}

function isRetryable(err: any): boolean {
  const s = err?.status ?? err?.statusCode
  if (typeof s === 'number') return s === 408 || s === 429 || s >= 500
  return /timeout|ETIMEDOUT|ECONNRESET|fetch failed/i.test(String(err?.message ?? err))
}

export async function runStage<TIn, TOut>(
  providers: StageProvider<TIn, TOut>[],
  input: TIn,
  ctx: RunContext,
  getCredential: (key: string) => string | undefined
): Promise<StageResult<TOut>> {
  if (providers.length === 0) throw new Error('no providers configured for stage')
  const errors: string[] = []
  for (let i = 0; i < providers.length; i++) {
    const p = providers[i]
    const t0 = Date.now()
    try {
      const output = await p.run(input, ctx, getCredential)
      return { providerId: p.id, output, durationMs: Date.now() - t0, usedFallback: i > 0 }
    } catch (err: any) {
      errors.push(`${p.id}: ${err?.message ?? err}`)
      ctx.logger('stage.error', { providerId: p.id, error: err?.message })
      if (!isRetryable(err) && i < providers.length - 1) {
        // non-retryable: still try next provider (user may have configured fallbacks for this reason)
      }
    }
  }
  throw new Error(`all providers failed:\n${errors.join('\n')}`)
}
