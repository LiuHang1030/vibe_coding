import { z } from 'zod'

export const ProductUnderstandingSchema = z.object({
  category: z.string().min(1),
  material: z.array(z.string()),
  color_palette: z.array(z.string()),
  style_tone: z.string(),
  target_audience: z.string(),
  key_features: z.array(z.string())
})
export type ProductUnderstanding = z.infer<typeof ProductUnderstandingSchema>

export const OverlayLayoutSchema = z.enum([
  'top_banner', 'side_panel', 'bottom_caption', 'centered_hero'
])
export type OverlayLayout = z.infer<typeof OverlayLayoutSchema>

export const CopyBlockSchema = z.object({
  headline: z.string().min(1).max(64),
  subhead: z.string().min(1).max(128),
  bullets: z.array(z.string().max(64)).max(3),
  cta: z.string().max(32).optional()
})
export type CopyBlock = z.infer<typeof CopyBlockSchema>

export const CreativePlanSchema = z.object({
  scene_prompt: z.string().min(10),
  composition_hint: z.string(),
  copy: CopyBlockSchema,
  overlay_layout: OverlayLayoutSchema
})
export type CreativePlan = z.infer<typeof CreativePlanSchema>

export const SizeSchema = z.union([
  z.string().regex(/^\d+x\d+$/).transform(s => {
    const [w, h] = s.split('x').map(Number); return { width: w, height: h }
  }),
  z.string().regex(/^\d+:\d+$/).transform(s => {
    const [w, h] = s.split(':').map(Number); const base = 1080
    return { width: base, height: Math.round(base * h / w) }
  }),
  z.object({ width: z.number().int().positive(), height: z.number().int().positive() })
])
export type Size = { width: number; height: number }

export const StageNameSchema = z.enum(['extract', 'understand', 'plan', 'compose', 'overlay'])
export type StageName = z.infer<typeof StageNameSchema>

export const StageTimingSchema = z.object({
  stage: StageNameSchema,
  provider_id: z.string(),
  duration_ms: z.number(),
  cost_usd: z.number(),
  tokens_in: z.number().optional(),
  tokens_out: z.number().optional()
})

export const RunMetadataSchema = z.object({
  run_id: z.string(),
  input_path: z.string(),
  size: z.string(),
  stages: z.array(StageTimingSchema),
  total_cost_usd: z.number(),
  created_at: z.string()
})
export type RunMetadata = z.infer<typeof RunMetadataSchema>
