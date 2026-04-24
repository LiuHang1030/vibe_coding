import { z } from 'zod'
import { registerAll, registry } from '@main/providers'
import { StageNameSchema } from '@main/schemas'
import { router, publicProcedure } from './trpc'

registerAll()

export const providersRouter = router({
  listByStage: publicProcedure.input(z.object({ stage: StageNameSchema })).query(({ input }) =>
    registry.listByStage(input.stage).map(p => ({
      id: p.id, displayName: p.displayName, requiresCredentials: p.requiresCredentials,
      stage: p.stage, estimatedCostUsd: p.costModel.estimate({})
    }))
  )
})
