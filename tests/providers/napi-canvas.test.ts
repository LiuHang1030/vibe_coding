import { describe, it, expect, beforeAll } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import { napiCanvasOverlay } from '@main/providers/overlay/napi-canvas'

let inputPng: string
let workDir: string

beforeAll(async () => {
  workDir = await fs.mkdtemp(join(tmpdir(), 'ps-overlay-'))
  const c = createCanvas(1080, 1080); const g = c.getContext('2d')
  g.fillStyle = '#4a6a8a'; g.fillRect(0, 0, 1080, 1080)
  inputPng = join(workDir, 'in.png'); await fs.writeFile(inputPng, c.toBuffer('image/png'))
})

describe('napi-canvas overlay provider', () => {
  it('metadata is wired correctly', () => {
    expect(napiCanvasOverlay.id).toBe('napi-canvas')
    expect(napiCanvasOverlay.stage).toBe('overlay')
    expect(napiCanvasOverlay.requiresCredentials).toEqual([])
  })

  it('renders text and writes PNG to runDir', async () => {
    const out = await napiCanvasOverlay.run(
      {
        composedPngPath: inputPng,
        copy: { headline: 'Step Into Comfort', subhead: 'Everyday reimagined', bullets: ['Lightweight', 'Breathable'], cta: 'Shop Now' },
        layout: 'bottom_caption',
        size: { width: 1080, height: 1080 }
      },
      { runId: 't', runDir: workDir, logger: () => {} },
      () => undefined
    )
    const bytes = await fs.readFile(out.finalPngPath)
    expect(bytes.byteLength).toBeGreaterThan(1000)
    expect(out.finalPngPath).toContain('05_final.png')
  })
})
