import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas'
import type { OverlayProvider } from '@main/pipeline/contracts'
import { loadLayout, autoContrastColor, wrapLines } from './layout-engine'

let fontsRegistered = false
function ensureFonts() {
  if (fontsRegistered) return
  const base = resolve(process.cwd(), 'resources', 'fonts')
  GlobalFonts.registerFromPath(join(base, 'Inter-Regular.ttf'), 'Inter-Regular')
  GlobalFonts.registerFromPath(join(base, 'Inter-Bold.ttf'), 'Inter-Bold')
  fontsRegistered = true
}

export const napiCanvasOverlay: OverlayProvider = {
  id: 'napi-canvas',
  stage: 'overlay',
  displayName: 'Built-in Canvas',
  requiresCredentials: [],
  costModel: { estimate: () => 0 },
  async healthCheck() { return { ok: true } },

  async run(input, ctx) {
    ensureFonts()
    const tpl = await loadLayout(input.layout)
    const src = await loadImage(input.composedPngPath)
    const canvas = createCanvas(input.size.width, input.size.height)
    const g = canvas.getContext('2d')
    g.drawImage(src, 0, 0, input.size.width, input.size.height)

    const { width: W, height: H } = input.size
    const safeX = W * tpl.safe_area_pct.left
    const safeRight = W * (1 - tpl.safe_area_pct.right)
    const safeTop = H * tpl.safe_area_pct.top
    const maxWidth = safeRight - safeX

    // sample bg luminance in the safe area
    const sample = g.getImageData(Math.round(safeX), Math.round(safeTop), Math.min(64, Math.round(maxWidth)), 64).data
    let lumSum = 0, n = 0
    for (let i = 0; i < sample.length; i += 4) { lumSum += (0.2126 * sample[i] + 0.7152 * sample[i+1] + 0.0722 * sample[i+2]) / 255; n++ }
    const textColor = tpl.text_color_rule === 'always_white' ? '#fff'
      : tpl.text_color_rule === 'always_black' ? '#000'
      : autoContrastColor(lumSum / n)

    if (tpl.shadow) { g.shadowBlur = tpl.shadow.blur; g.shadowColor = tpl.shadow.color; g.shadowOffsetY = tpl.shadow.offset_y }
    g.fillStyle = textColor
    g.textBaseline = 'top'

    let y = safeTop
    // headline
    g.font = `${Math.round(H * tpl.headline.size_pct)}px ${tpl.headline.font}`
    const headLines = wrapLines(g, input.copy.headline, maxWidth)
    const headSize = Math.round(H * tpl.headline.size_pct)
    for (const line of headLines) { g.fillText(line, safeX, y); y += headSize * 1.1 }

    // subhead
    y += H * tpl.subhead.margin_top_pct
    g.font = `${Math.round(H * tpl.subhead.size_pct)}px ${tpl.subhead.font}`
    const subSize = Math.round(H * tpl.subhead.size_pct)
    for (const line of wrapLines(g, input.copy.subhead, maxWidth)) { g.fillText(line, safeX, y); y += subSize * 1.15 }

    // bullets
    g.font = `${Math.round(H * tpl.bullets.size_pct)}px ${tpl.bullets.font}`
    const bulletSize = Math.round(H * tpl.bullets.size_pct)
    for (const b of input.copy.bullets ?? []) {
      y += H * tpl.bullets.gap_pct
      g.fillText(`•  ${b}`, safeX, y); y += bulletSize * 1.15
    }

    // cta
    if (input.copy.cta && tpl.cta) {
      y += H * tpl.cta.margin_top_pct
      g.font = `${Math.round(H * tpl.cta.size_pct)}px ${tpl.cta.font}`
      g.fillText(input.copy.cta, safeX, y)
    }

    const finalPngPath = join(ctx.runDir, '05_final.png')
    await fs.writeFile(finalPngPath, canvas.toBuffer('image/png'))
    return { finalPngPath }
  }
}
