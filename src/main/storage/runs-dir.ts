// src/main/storage/runs-dir.ts
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { RunMetadata } from '@main/schemas'
import { RunMetadataSchema } from '@main/schemas'

export async function createRun(baseDir: string, inputPath: string, slug: string): Promise<{ runId: string; runDir: string }> {
  const safeSlug = slug.replace(/[^a-z0-9_-]/gi, '_').slice(0, 40) || 'run'
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}_${safeSlug}`
  const runDir = join(baseDir, runId)
  await fs.mkdir(runDir, { recursive: true })
  await fs.copyFile(inputPath, join(runDir, '00_input' + (inputPath.match(/\.\w+$/)?.[0] ?? '.bin')))
  return { runId, runDir }
}

export async function writeMetadata(runDir: string, meta: RunMetadata): Promise<void> {
  await fs.writeFile(join(runDir, 'metadata.json'), JSON.stringify(meta, null, 2))
}

export async function readMetadata(runDir: string): Promise<RunMetadata> {
  const raw = JSON.parse(await fs.readFile(join(runDir, 'metadata.json'), 'utf8'))
  return RunMetadataSchema.parse(raw)
}
