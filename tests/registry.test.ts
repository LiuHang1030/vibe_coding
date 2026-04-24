import { describe, it, expect, beforeEach } from 'vitest'
import { ProviderRegistry } from '@main/providers/registry'
import { registerAll, registry } from '@main/providers'
import type { StageProvider } from '@main/pipeline/contracts'

function fakeProvider(stage: any, id: string): StageProvider<any, any> {
  return {
    id, stage, displayName: id, requiresCredentials: [],
    costModel: { estimate: () => 0 },
    async healthCheck() { return { ok: true } },
    async run() { return {} }
  }
}

describe('ProviderRegistry', () => {
  let reg: ProviderRegistry
  beforeEach(() => { reg = new ProviderRegistry() })

  it('registers and retrieves a provider', () => {
    reg.register(fakeProvider('extract', 'a'))
    expect(reg.get('extract', 'a').id).toBe('a')
  })

  it('throws on duplicate id within the same stage', () => {
    reg.register(fakeProvider('extract', 'a'))
    expect(() => reg.register(fakeProvider('extract', 'a'))).toThrow(/duplicate/i)
  })

  it('allows same id across different stages', () => {
    reg.register(fakeProvider('extract', 'a'))
    reg.register(fakeProvider('plan', 'a'))
    expect(reg.get('plan', 'a').id).toBe('a')
  })

  it('lists by stage', () => {
    reg.register(fakeProvider('plan', 'p1'))
    reg.register(fakeProvider('plan', 'p2'))
    reg.register(fakeProvider('compose', 'c1'))
    expect(reg.listByStage('plan').map(p => p.id).sort()).toEqual(['p1', 'p2'])
  })

  it('resolves ordered list, picking first available', () => {
    reg.register(fakeProvider('plan', 'p1'))
    reg.register(fakeProvider('plan', 'p2'))
    expect(reg.resolveOrdered('plan', ['missing', 'p2', 'p1']).map(p => p.id)).toEqual(['p2', 'p1'])
  })
})

describe('registerAll bootstrap', () => {
  it('populates one provider per stage', () => {
    registerAll()
    for (const stage of ['extract','understand','plan','compose','overlay'] as const) {
      expect(registry.listByStage(stage).length).toBeGreaterThanOrEqual(1)
    }
  })
})
