import { describe, it, expect, vi } from 'vitest'

const fakePlan = {
  scene_prompt: 'warm wooden surface with soft morning light',
  composition_hint: 'centered product, slight tilt',
  copy: { headline: 'Step Into Comfort', subhead: 'Everyday sneakers reimagined', bullets: ['Lightweight', 'Breathable'], cta: 'Shop Now' },
  overlay_layout: 'bottom_caption'
}

vi.mock('ai', () => ({ generateObject: vi.fn(async () => ({ object: fakePlan, usage: { inputTokens: 400, outputTokens: 120 } })) }))
vi.mock('@ai-sdk/anthropic', () => ({ anthropic: () => 'MOCK_MODEL' }))

import { claudeSonnetPlan } from '@main/providers/plan/claude-sonnet-4-6'

describe('claude plan provider', () => {
  it('health requires ANTHROPIC_API_KEY', async () => {
    expect((await claudeSonnetPlan.healthCheck(() => undefined)).ok).toBe(false)
  })
  it('produces a CreativePlan', async () => {
    const out = await claudeSonnetPlan.run(
      {
        understanding: { category: 'sneaker', material: [], color_palette: [], style_tone: 'minimalist', target_audience: '', key_features: [] },
        size: { width: 1080, height: 1080 }
      },
      { runId: 't', runDir: '/tmp', logger: () => {} },
      () => 'fake-key'
    )
    expect(out.copy.headline).toBe('Step Into Comfort')
  })
})
