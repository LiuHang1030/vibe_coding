import { describe, it, expect } from 'vitest'
import {
  ProductUnderstandingSchema,
  CreativePlanSchema,
  RunMetadataSchema,
  SizeSchema
} from '@main/schemas'

describe('schemas', () => {
  it('parses a valid ProductUnderstanding', () => {
    const parsed = ProductUnderstandingSchema.parse({
      category: 'sneaker',
      material: ['leather', 'rubber'],
      color_palette: ['white'],
      style_tone: 'minimalist',
      target_audience: 'young adults',
      key_features: ['lightweight', 'breathable']
    })
    expect(parsed.category).toBe('sneaker')
  })

  it('rejects CreativePlan missing headline', () => {
    expect(() =>
      CreativePlanSchema.parse({
        scene_prompt: 'beach',
        composition_hint: 'center',
        copy: { subhead: 'x', bullets: [] },
        overlay_layout: 'bottom_caption'
      })
    ).toThrow()
  })

  it('parses Size as "WxH" string', () => {
    expect(SizeSchema.parse('1080x1080')).toEqual({ width: 1080, height: 1080 })
  })

  it('parses Size as ratio "1:1" with default 1080 base', () => {
    expect(SizeSchema.parse('1:1')).toEqual({ width: 1080, height: 1080 })
  })

  it('RunMetadata round-trips', () => {
    const meta = {
      run_id: '2026-04-23T10-00-00_abc',
      input_path: '/tmp/a.jpg',
      size: '1:1',
      stages: [],
      total_cost_usd: 0,
      created_at: '2026-04-23T10:00:00.000Z'
    }
    expect(RunMetadataSchema.parse(meta)).toEqual(meta)
  })
})
