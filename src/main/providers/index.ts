import { registry } from './registry'
import { imglyBgRemoval } from './extract/imgly-bg-removal'
import { geminiUnderstand } from './understand/gemini-2-5-flash'
import { claudeSonnetPlan } from './plan/claude-sonnet-4-6'
import { nanoBanana } from './compose/nano-banana'
import { napiCanvasOverlay } from './overlay/napi-canvas'

let booted = false
export function registerAll(): void {
  if (booted) return
  registry.register(imglyBgRemoval)
  registry.register(geminiUnderstand)
  registry.register(claudeSonnetPlan)
  registry.register(nanoBanana)
  registry.register(napiCanvasOverlay)
  booted = true
}

export { registry }
