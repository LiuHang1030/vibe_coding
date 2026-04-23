import { promises as fs } from 'node:fs'
import { resolve } from 'node:path'
import type { OverlayLayout } from '@main/schemas'

export interface LayoutTemplate {
  id: OverlayLayout
  safe_area_pct: { top: number; left: number; right: number; bottom: number }
  headline: { font: string; size_pct: number; align: 'left' | 'center' | 'right' }
  subhead:  { font: string; size_pct: number; align: 'left' | 'center' | 'right'; margin_top_pct: number }
  bullets:  { font: string; size_pct: number; align: 'left' | 'center' | 'right'; gap_pct: number }
  cta?:     { font: string; size_pct: number; align: 'left' | 'center' | 'right'; margin_top_pct: number; background_box?: { padding_pct: number } }
  text_color_rule: 'auto_contrast_against_bg' | 'always_white' | 'always_black'
  shadow?: { blur: number; color: string; offset_y: number }
}

export async function loadLayout(id: OverlayLayout): Promise<LayoutTemplate> {
  const path = resolve(process.cwd(), 'layouts', `${id.replace(/_/g, '-')}.json`)
  const raw = await fs.readFile(path, 'utf8')
  return JSON.parse(raw) as LayoutTemplate
}

// Sample a 64x64 region at the layout's anchor and decide light/dark text
export function autoContrastColor(avgLuminance: number): string {
  return avgLuminance > 0.5 ? '#101010' : '#ffffff'
}

export function wrapLines(ctx: { measureText(s: string): { width: number } }, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const tryLine = line ? `${line} ${w}` : w
    if (ctx.measureText(tryLine).width > maxWidth && line) { lines.push(line); line = w } else line = tryLine
  }
  if (line) lines.push(line)
  return lines
}
