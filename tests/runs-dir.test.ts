import { describe, it, expect } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRun, writeMetadata, readMetadata } from '@main/storage/runs-dir'

async function makeBaseDirWithInput(): Promise<{ baseDir: string; input: string }> {
  const baseDir = await fs.mkdtemp(join(tmpdir(), 'ps-runs-'))
  const input = join(baseDir, 'in.jpg')
  await fs.writeFile(input, Buffer.from([0]))
  return { baseDir, input }
}

describe('runs-dir', () => {
  it('createRun makes a timestamped folder and returns runId+runDir', async () => {
    const { baseDir, input } = await makeBaseDirWithInput()
    const { runId, runDir } = await createRun(baseDir, input, 'sneaker')
    expect(runId).toMatch(/\d{4}-\d{2}-\d{2}T/)
    expect(runId).toContain('_sneaker')
    const stat = await fs.stat(runDir); expect(stat.isDirectory()).toBe(true)
    // input was copied with a 00_input prefix
    const entries = await fs.readdir(runDir)
    expect(entries.some(e => e.startsWith('00_input'))).toBe(true)
  })

  it('writeMetadata + readMetadata round-trip', async () => {
    const { baseDir, input } = await makeBaseDirWithInput()
    const { runDir } = await createRun(baseDir, input, 'sneaker')
    const meta = { run_id: 'x', input_path: input, size: '1:1', stages: [], total_cost_usd: 0, created_at: new Date().toISOString() }
    await writeMetadata(runDir, meta)
    expect((await readMetadata(runDir)).run_id).toBe('x')
  })
})
