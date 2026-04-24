import { describe, it, expect, vi, beforeEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'

vi.mock('@main/providers', async () => {
  const { ProviderRegistry } = await import('@main/providers/registry')
  const r = new ProviderRegistry()
  const mk = (stage: any, id: string, out: any) => ({
    id, stage, displayName: id, requiresCredentials: [], costModel: { estimate: () => 0 },
    async healthCheck() { return { ok: true } }, run: async () => out
  })
  r.register(mk('extract', 'mock-extract', { cutoutPngPath: '/tmp/cut.png' }))
  r.register(mk('understand', 'mock-understand', {
    category: 'sneaker', material: [], color_palette: [], style_tone: 'minimalist',
    target_audience: 'x', key_features: []
  }))
  r.register(mk('plan', 'mock-plan', {
    scene_prompt: 'warm wood desk', composition_hint: 'center',
    copy: { headline: 'H', subhead: 'S', bullets: ['b'], cta: 'C' }, overlay_layout: 'bottom_caption'
  }))
  r.register(mk('compose', 'mock-compose', { composedPngPath: '/tmp/composed.png' }))
  r.register(mk('overlay', 'mock-overlay', { finalPngPath: '/tmp/final.png' }))
  return { registry: r, registerAll: () => {} }
})

import { runPipeline } from '@main/pipeline/orchestrator'

describe('orchestrator', () => {
  let baseDir: string
  beforeEach(async () => { baseDir = await fs.mkdtemp(join(tmpdir(), 'ps-orch-')) })

  it('runs all 5 stages and emits progress', async () => {
    const src = join(baseDir, 'in.jpg'); await fs.writeFile(src, Buffer.from([0,1,2]))
    const events: string[] = []
    const bus = new EventEmitter()
    bus.on('stage:start', e => events.push(`start:${e.stage}`))
    bus.on('stage:done', e => events.push(`done:${e.stage}`))

    const result = await runPipeline({
      baseDir, inputPath: src, size: { width: 1080, height: 1080 },
      providerSelection: {
        extract: ['mock-extract'], understand: ['mock-understand'],
        plan: ['mock-plan'], compose: ['mock-compose'], overlay: ['mock-overlay']
      },
      getCredential: () => 'k',
      events: bus
    })

    expect(result.finalPngPath).toBe('/tmp/final.png')
    expect(events).toEqual([
      'start:extract','done:extract','start:understand','done:understand',
      'start:plan','done:plan','start:compose','done:compose',
      'start:overlay','done:overlay'
    ])
  })
})
