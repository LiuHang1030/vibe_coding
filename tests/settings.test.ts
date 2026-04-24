import { describe, it, expect, vi } from 'vitest'

const memKV: Record<string, any> = {}
vi.mock('electron-store', () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      get: (k: string) => memKV[k],
      set: (k: string, v: any) => { memKV[k] = v },
      delete: (k: string) => { delete memKV[k] }
    }
  })
}))
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => b.toString().replace(/^enc:/, '')
  },
  app: { getPath: () => '/tmp' }
}))

import { Settings } from '@main/storage/settings'

describe('Settings', () => {
  it('round-trips an encrypted secret', () => {
    const s = new Settings()
    s.setCredential('GOOGLE_API_KEY', 'abc-123')
    expect(s.getCredential('GOOGLE_API_KEY')).toBe('abc-123')
  })

  it('returns undefined for missing keys', () => {
    expect(new Settings().getCredential('NONEXISTENT')).toBeUndefined()
  })

  it('persists primary provider per stage', () => {
    const s = new Settings()
    s.setPrimaryProvider('compose', 'nano-banana')
    expect(s.getPrimaryProvider('compose')).toBe('nano-banana')
  })
})
