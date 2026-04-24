import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import type { PlanProvider } from '@main/pipeline/contracts'
import { CreativePlanSchema } from '@main/schemas'

const SYSTEM = `You are a senior e-commerce creative director. Given a structured product understanding, you produce:
1) scene_prompt: a natural-language description of a tasteful scene for the product, <= 60 words, English, purely visual (no text overlays mentioned).
2) composition_hint: one sentence on product placement.
3) copy: short English marketing copy — headline (<= 6 words, punchy), subhead (<= 12 words), 2-3 bullet points (<= 6 words each), a CTA (<= 3 words).
4) overlay_layout: one of "top_banner" | "side_panel" | "bottom_caption" | "centered_hero".
Tone should match style_tone. Avoid clichés. Output JSON only.`

export const claudeSonnetPlan: PlanProvider = {
  id: 'claude-sonnet-4-6',
  stage: 'plan',
  displayName: 'Claude Sonnet 4.6',
  requiresCredentials: ['ANTHROPIC_API_KEY'],
  costModel: { estimate: () => 0.01 },

  async healthCheck(getCred) {
    return getCred('ANTHROPIC_API_KEY') ? { ok: true } : { ok: false, reason: 'ANTHROPIC_API_KEY not set' }
  },

  async run(input, ctx, getCred) {
    const key = getCred('ANTHROPIC_API_KEY')
    if (!key) throw new Error('ANTHROPIC_API_KEY missing')
    process.env.ANTHROPIC_API_KEY = key
    const userMsg = JSON.stringify({
      understanding: input.understanding,
      size: input.size,
      stylePreference: input.stylePreference,
      layoutPreference: input.layoutPreference,
      copyTone: input.copyTone
    })
    const { object, usage } = await generateObject({
      model: anthropic('claude-sonnet-4-6'),
      schema: CreativePlanSchema,
      system: SYSTEM,
      prompt: userMsg
    })
    ctx.logger('plan.done', { tokensIn: usage?.inputTokens, tokensOut: usage?.outputTokens })
    return object
  }
}
