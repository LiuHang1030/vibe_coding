import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { GoogleGenAI } from '@google/genai'
import type { ComposeProvider } from '@main/pipeline/contracts'

function aspectRatioFromSize(s: { width: number; height: number }): string {
  const g = gcd(s.width, s.height); return `${s.width / g}:${s.height / g}`
}
function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b) }

export const nanoBanana: ComposeProvider = {
  id: 'nano-banana',
  stage: 'compose',
  displayName: 'Gemini 2.5 Flash Image (Nano Banana)',
  requiresCredentials: ['GOOGLE_API_KEY'],
  costModel: { estimate: () => 0.04 },

  async healthCheck(getCred) {
    return getCred('GOOGLE_API_KEY') ? { ok: true } : { ok: false, reason: 'GOOGLE_API_KEY not set' }
  },

  async run(input, ctx, getCred) {
    const key = getCred('GOOGLE_API_KEY')
    if (!key) throw new Error('GOOGLE_API_KEY missing')
    const client = new GoogleGenAI({ apiKey: key })

    const imgBytes = await fs.readFile(input.originalImagePath)
    const prompt = `Place the product from the reference image into this new scene: ${input.scenePrompt}.
Preserve the product's identity, proportions, and material details exactly. Match lighting and shadows to the new scene.
Target aspect ratio: ${aspectRatioFromSize(input.size)}.`

    const resp = await client.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{ parts: [
        { text: prompt },
        { inlineData: { mimeType: 'image/png', data: imgBytes.toString('base64') } }
      ]}],
      config: { responseModalities: ['IMAGE'] }
    })

    const part = resp.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)
    if (!part?.inlineData?.data) throw new Error('nano-banana returned no image')
    const composedPngPath = join(ctx.runDir, '04_composed.png')
    await fs.writeFile(composedPngPath, Buffer.from(part.inlineData.data, 'base64'))
    ctx.logger('compose.done')
    return { composedPngPath }
  }
}
