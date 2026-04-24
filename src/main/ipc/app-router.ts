import { router } from './trpc'
import { pipelineRouter } from './pipeline.router'
import { settingsRouter } from './settings.router'
import { providersRouter } from './providers.router'

export const appRouter = router({
  pipeline: pipelineRouter,
  settings: settingsRouter,
  providers: providersRouter
})
export type AppRouter = typeof appRouter
