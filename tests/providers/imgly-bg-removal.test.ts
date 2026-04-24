import { describe, it, expect, vi, beforeEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('@imgly/background-removal-node', () => ({
  removeBackground: vi.fn(async () => new Blob([new Uint8Array([137,80,78,71])], { type: 'image/png' }))
}))

import { imglyBgRemoval } from '@main/providers/extract/imgly-bg-removal'

describe('imgly-bg-removal provider', () => {
  let workDir: string
  beforeEach(async () => { workDir = await fs.mkdtemp(join(tmpdir(), 'ps-extract-')) })

  it('is correctly wired', () => {
    expect(imglyBgRemoval.stage).toBe('extract')
    expect(imglyBgRemoval.id).toBe('imgly-bg-removal')
  })

  it('writes cutout PNG to runDir', async () => {
    const input = join(workDir, 'src.png'); await fs.writeFile(input, Buffer.from([1, 2, 3]))
    const out = await imglyBgRemoval.run({ imagePath: input }, { runId: 't', runDir: workDir, logger: () => {} }, () => undefined)
    expect(out.cutoutPngPath.endsWith('01_cutout.png')).toBe(true)
    const bytes = await fs.readFile(out.cutoutPngPath)
    expect(bytes.byteLength).toBeGreaterThan(0)
  })
})
