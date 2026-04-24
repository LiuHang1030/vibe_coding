import { z } from 'zod'
import { EventEmitter } from 'node:events'
import { observable } from '@trpc/server/observable'
import { app } from 'electron'
import { join } from 'node:path'
import { runPipeline } from '@main/pipeline/orchestrator'
import { settings } from '@main/storage/settings'
import { router, publicProcedure } from './trpc'

const bus = new EventEmitter()

const runInput = z.object({
  inputPath: z.string(),
  size: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  stylePreference: z.string().optional(),
  layoutPreference: z.enum(['top_banner','side_panel','bottom_caption','centered_hero']).optional(),
  copyTone: z.string().optional()
})

export const pipelineRouter = router({
  progress: publicProcedure.subscription(() => observable<{ type: string; payload: any }>(emit => {
    const onStart = (e: any) => emit.next({ type: 'stage:start', payload: e })
    const onDone = (e: any) => emit.next({ type: 'stage:done', payload: e })
    const onLog = (e: any) => emit.next({ type: 'log', payload: e })
    bus.on('stage:start', onStart); bus.on('stage:done', onDone); bus.on('log', onLog)
    return () => { bus.off('stage:start', onStart); bus.off('stage:done', onDone); bus.off('log', onLog) }
  })),

  run: publicProcedure.input(runInput).mutation(async ({ input }) => {
    const baseDir = join(app.getPath('userData'), 'runs')
    const stages = ['extract','understand','plan','compose','overlay'] as const
    const providerSelection = Object.fromEntries(
      stages.map(s => [s, settings.getOrderedProviders(s)])
    ) as any
    return runPipeline({
      baseDir, inputPath: input.inputPath, size: input.size,
      providerSelection, getCredential: k => settings.getCredential(k),
      events: bus,
      stylePreference: input.stylePreference, layoutPreference: input.layoutPreference, copyTone: input.copyTone
    })
  })
})
