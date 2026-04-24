import { describe, it, expect, vi, beforeEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const fakeResponse = { candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from([0,1,2,3]).toString('base64'), mimeType: 'image/png' } }] } }] }
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () { return { models: { generateContent: vi.fn(async () => fakeResponse) } } })
}))

import { nanoBanana } from '@main/providers/compose/nano-banana'

describe('nano-banana compose provider', () => {
  let workDir: string
  beforeEach(async () => { workDir = await fs.mkdtemp(join(tmpdir(), 'ps-compose-')) })

  it('wires metadata', () => { expect(nanoBanana.id).toBe('nano-banana') })

  it('writes composed PNG from inline base64 response', async () => {
    const input = join(workDir, 'src.png'); await fs.writeFile(input, Buffer.from([9]))
    const out = await nanoBanana.run(
      { originalImagePath: input, scenePrompt: 'a beach', size: { width: 1080, height: 1080 } },
      { runId: 't', runDir: workDir, logger: () => {} },
      () => 'fake-key'
    )
    expect(out.composedPngPath.endsWith('04_composed.png')).toBe(true)
    expect((await fs.readFile(out.composedPngPath)).byteLength).toBe(4)
  })
})
