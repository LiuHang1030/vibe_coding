import { promises as fs } from 'node:fs'
import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import type { UnderstandProvider } from '@main/pipeline/contracts'
import { ProductUnderstandingSchema } from '@main/schemas'

const PROMPT = `You analyse e-commerce product photos. Look at the attached image and fill the JSON schema:
- category: short lowercase noun (e.g. "sneaker", "moisturiser").
- material: list of materials visible.
- color_palette: 1-3 dominant colours.
- style_tone: one of minimalist/sporty/luxurious/playful/industrial/warm.
- target_audience: one short phrase.
- key_features: 3-5 selling points inferable from the image.
Be terse.`

export const geminiUnderstand: UnderstandProvider = {
  id: 'gemini-2.5-flash',
  stage: 'understand',
  displayName: 'Google Gemini 2.5 Flash',
  requiresCredentials: ['GOOGLE_API_KEY'],
  costModel: { estimate: () => 0.001 },

  async healthCheck(getCred) {
    if (!getCred('GOOGLE_API_KEY')) return { ok: false, reason: 'GOOGLE_API_KEY not set' }
    return { ok: true }
  },

  async run(input, ctx, getCred) {
    const key = getCred('GOOGLE_API_KEY')
    if (!key) throw new Error('GOOGLE_API_KEY missing')
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = key
    const image = await fs.readFile(input.imagePath)
    const { object, usage } = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: ProductUnderstandingSchema,
      messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image', image }] }]
    })
    ctx.logger('understand.done', { tokensIn: usage?.inputTokens, tokensOut: usage?.outputTokens })
    return object
  }
}
