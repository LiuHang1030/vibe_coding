import { z } from 'zod'
import { settings } from '@main/storage/settings'
import { StageNameSchema } from '@main/schemas'
import { router, publicProcedure } from './trpc'

export const settingsRouter = router({
  getCredentialStatus: publicProcedure.input(z.object({ key: z.string() })).query(({ input }) =>
    ({ key: input.key, present: !!settings.getCredential(input.key) })
  ),
  setCredential: publicProcedure.input(z.object({ key: z.string(), value: z.string() })).mutation(({ input }) => {
    settings.setCredential(input.key, input.value); return { ok: true }
  }),
  deleteCredential: publicProcedure.input(z.object({ key: z.string() })).mutation(({ input }) => {
    settings.deleteCredential(input.key); return { ok: true }
  }),
  getPrimary: publicProcedure.input(z.object({ stage: StageNameSchema })).query(({ input }) =>
    ({ stage: input.stage, providerId: settings.getPrimaryProvider(input.stage) })
  ),
  setPrimary: publicProcedure.input(z.object({ stage: StageNameSchema, providerId: z.string() })).mutation(({ input }) => {
    settings.setPrimaryProvider(input.stage, input.providerId); return { ok: true }
  })
})
