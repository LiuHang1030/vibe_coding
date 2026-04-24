import { describe, it, expect, vi, beforeEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mockResult = {
  object: {
    category: 'sneaker', material: ['leather'], color_palette: ['off-white'],
    style_tone: 'minimalist', target_audience: 'young adults', key_features: ['breathable']
  },
  usage: { promptTokens: 120, completionTokens: 60 }
}

vi.mock('ai', () => ({ generateObject: vi.fn(async () => mockResult) }))
vi.mock('@ai-sdk/google', () => ({ google: () => 'MOCK_MODEL' }))

import { geminiUnderstand } from '@main/providers/understand/gemini-2-5-flash'

describe('gemini understand provider', () => {
  let workDir: string
  beforeEach(async () => { workDir = await fs.mkdtemp(join(tmpdir(), 'ps-understand-')) })

  it('fails healthCheck without credential', async () => {
    expect((await geminiUnderstand.healthCheck(() => undefined)).ok).toBe(false)
  })

  it('returns structured understanding', async () => {
    const img = join(workDir, 'in.png'); await fs.writeFile(img, Buffer.from([0]))
    const out = await geminiUnderstand.run(
      { imagePath: img, cutoutPngPath: img },
      { runId: 't', runDir: workDir, logger: () => {} },
      () => 'fake-key'
    )
    expect(out.category).toBe('sneaker')
  })
})
