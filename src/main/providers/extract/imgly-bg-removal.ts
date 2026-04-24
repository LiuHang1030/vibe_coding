import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { removeBackground } from '@imgly/background-removal-node'
import type { ExtractProvider } from '@main/pipeline/contracts'

export const imglyBgRemoval: ExtractProvider = {
  id: 'imgly-bg-removal',
  stage: 'extract',
  displayName: 'img.ly Background Removal (local)',
  requiresCredentials: [],
  costModel: { estimate: () => 0 },
  async healthCheck() { return { ok: true } },

  async run(input, ctx) {
    const src = await fs.readFile(input.imagePath)
    const blob = await removeBackground(new Blob([src]))
    const buf = Buffer.from(await blob.arrayBuffer())
    const cutoutPngPath = join(ctx.runDir, '01_cutout.png')
    await fs.writeFile(cutoutPngPath, buf)
    ctx.logger('extract.done', { bytes: buf.byteLength })
    return { cutoutPngPath }
  }
}
