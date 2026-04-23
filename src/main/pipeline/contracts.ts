import type { StageName, ProductUnderstanding, CreativePlan, CopyBlock, Size, OverlayLayout } from '@main/schemas'

export interface RunContext {
  runId: string
  runDir: string
  logger: (msg: string, data?: Record<string, unknown>) => void
}

export interface CostModel {
  estimate(input: unknown): number
}

export interface ProviderHealth { ok: boolean; reason?: string }

export interface StageProvider<TIn, TOut> {
  readonly id: string
  readonly stage: StageName
  readonly displayName: string
  readonly requiresCredentials: string[]
  readonly costModel: CostModel
  healthCheck(getCredential: (key: string) => string | undefined): Promise<ProviderHealth>
  run(input: TIn, ctx: RunContext, getCredential: (key: string) => string | undefined): Promise<TOut>
}

// Per-stage IO
export interface ExtractInput { imagePath: string }
export interface ExtractOutput { cutoutPngPath: string }
export type ExtractProvider = StageProvider<ExtractInput, ExtractOutput>

export interface UnderstandInput { imagePath: string; cutoutPngPath: string }
export type UnderstandProvider = StageProvider<UnderstandInput, ProductUnderstanding>

export interface PlanInput {
  understanding: ProductUnderstanding
  size: Size
  stylePreference?: string
  layoutPreference?: OverlayLayout
  copyTone?: string
}
export type PlanProvider = StageProvider<PlanInput, CreativePlan>

export interface ComposeInput {
  originalImagePath: string
  scenePrompt: string
  size: Size
}
export interface ComposeOutput { composedPngPath: string }
export type ComposeProvider = StageProvider<ComposeInput, ComposeOutput>

export interface OverlayInput {
  composedPngPath: string
  copy: CopyBlock
  layout: OverlayLayout
  size: Size
}
export interface OverlayOutput { finalPngPath: string }
export type OverlayProvider = StageProvider<OverlayInput, OverlayOutput>
