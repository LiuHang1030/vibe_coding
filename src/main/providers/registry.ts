import type { StageProvider } from '@main/pipeline/contracts'
import type { StageName } from '@main/schemas'

export class ProviderRegistry {
  private byStage = new Map<StageName, Map<string, StageProvider<any, any>>>()

  register(provider: StageProvider<any, any>): void {
    const stage = provider.stage
    if (!this.byStage.has(stage)) this.byStage.set(stage, new Map())
    const bucket = this.byStage.get(stage)!
    if (bucket.has(provider.id)) {
      throw new Error(`duplicate provider id "${provider.id}" for stage "${stage}"`)
    }
    bucket.set(provider.id, provider)
  }

  get(stage: StageName, id: string): StageProvider<any, any> {
    const p = this.byStage.get(stage)?.get(id)
    if (!p) throw new Error(`provider "${id}" not registered for stage "${stage}"`)
    return p
  }

  has(stage: StageName, id: string): boolean {
    return !!this.byStage.get(stage)?.has(id)
  }

  listByStage(stage: StageName): StageProvider<any, any>[] {
    return Array.from(this.byStage.get(stage)?.values() ?? [])
  }

  resolveOrdered(stage: StageName, ids: string[]): StageProvider<any, any>[] {
    return ids.filter(id => this.has(stage, id)).map(id => this.get(stage, id))
  }
}

// singleton, populated by providers/index.ts#registerAll()
export const registry = new ProviderRegistry()
