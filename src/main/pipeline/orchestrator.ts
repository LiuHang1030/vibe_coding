// src/main/pipeline/orchestrator.ts
import { EventEmitter } from 'node:events'
import { basename } from 'node:path'
import type { StageName, Size, RunMetadata, OverlayLayout } from '@main/schemas'
import { registry, registerAll } from '@main/providers'
import { runStage } from './stage-runner'
import { createRun, writeMetadata } from '@main/storage/runs-dir'

export interface RunPipelineParams {
  baseDir: string
  inputPath: string
  size: Size
  providerSelection: Record<StageName, string[]>   // ordered ids per stage
  getCredential: (key: string) => string | undefined
  events?: EventEmitter
  stylePreference?: string
  layoutPreference?: OverlayLayout
  copyTone?: string
}

export interface RunPipelineResult {
  runId: string
  runDir: string
  finalPngPath: string
  metadata: RunMetadata
}

export async function runPipeline(p: RunPipelineParams): Promise<RunPipelineResult> {
  registerAll()
  const ev = p.events ?? new EventEmitter()
  const slug = basename(p.inputPath).replace(/\.\w+$/, '')
  const { runId, runDir } = await createRun(p.baseDir, p.inputPath, slug)
  const ctx = {
    runId, runDir,
    logger: (msg: string, data?: Record<string, unknown>) => ev.emit('log', { msg, data, runId })
  }
  const stages: StageName[] = ['extract', 'understand', 'plan', 'compose', 'overlay']
  const timings: RunMetadata['stages'] = []
  const state: any = { inputPath: p.inputPath, size: p.size, stylePreference: p.stylePreference,
                       layoutPreference: p.layoutPreference, copyTone: p.copyTone }

  for (const stage of stages) {
    const ids = p.providerSelection[stage]
    const providers = registry.resolveOrdered(stage, ids)
    if (providers.length === 0) throw new Error(`no enabled providers for ${stage}`)
    ev.emit('stage:start', { stage, providerId: providers[0].id })

    const input = buildStageInput(stage, state)
    const r = await runStage(providers, input, ctx, p.getCredential)
    applyStageOutput(stage, state, r.output)
    timings.push({
      stage, provider_id: r.providerId, duration_ms: r.durationMs,
      cost_usd: providers[0].costModel.estimate(input)
    })
    ev.emit('stage:done', { stage, providerId: r.providerId, output: r.output, durationMs: r.durationMs })
  }

  const meta: RunMetadata = {
    run_id: runId, input_path: p.inputPath, size: `${p.size.width}x${p.size.height}`,
    stages: timings, total_cost_usd: timings.reduce((a, t) => a + t.cost_usd, 0),
    created_at: new Date().toISOString()
  }
  await writeMetadata(runDir, meta)
  return { runId, runDir, finalPngPath: state.finalPngPath, metadata: meta }
}

function buildStageInput(stage: StageName, s: any): any {
  switch (stage) {
    case 'extract':   return { imagePath: s.inputPath }
    case 'understand': return { imagePath: s.inputPath, cutoutPngPath: s.cutoutPngPath }
    case 'plan':      return {
      understanding: s.understanding, size: s.size,
      stylePreference: s.stylePreference, layoutPreference: s.layoutPreference, copyTone: s.copyTone
    }
    case 'compose':   return { originalImagePath: s.inputPath, scenePrompt: s.plan.scene_prompt, size: s.size }
    case 'overlay':   return { composedPngPath: s.composedPngPath, copy: s.plan.copy, layout: s.plan.overlay_layout, size: s.size }
  }
}

function applyStageOutput(stage: StageName, s: any, out: any): void {
  if (stage === 'extract') s.cutoutPngPath = out.cutoutPngPath
  else if (stage === 'understand') s.understanding = out
  else if (stage === 'plan') s.plan = out
  else if (stage === 'compose') s.composedPngPath = out.composedPngPath
  else if (stage === 'overlay') s.finalPngPath = out.finalPngPath
}
