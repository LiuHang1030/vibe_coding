// src/main/storage/settings.ts
import Store from 'electron-store'
import { safeStorage } from 'electron'
import type { StageName } from '@main/schemas'

type SettingsShape = {
  credentials?: Record<string, string>   // base64-encoded ciphertext
  primary?: Partial<Record<StageName, string>>
  fallbacks?: Partial<Record<StageName, string[]>>
  budgetUsdMonth?: number
}

export class Settings {
  private store = new Store<SettingsShape>({ name: 'settings', clearInvalidConfig: true })

  setCredential(key: string, value: string): void {
    const creds = { ...(this.store.get('credentials') ?? {}) }
    if (safeStorage.isEncryptionAvailable()) {
      creds[key] = safeStorage.encryptString(value).toString('base64')
    } else {
      creds[key] = Buffer.from(value).toString('base64')
    }
    this.store.set('credentials', creds)
  }

  getCredential(key: string): string | undefined {
    const entry = (this.store.get('credentials') ?? {})[key]
    if (!entry) return undefined
    const buf = Buffer.from(entry, 'base64')
    try {
      return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString()
    } catch { return undefined }
  }

  deleteCredential(key: string): void {
    const creds = { ...(this.store.get('credentials') ?? {}) }; delete creds[key]
    this.store.set('credentials', creds)
  }

  setPrimaryProvider(stage: StageName, id: string): void {
    const primary = { ...(this.store.get('primary') ?? {}) }; primary[stage] = id
    this.store.set('primary', primary)
  }

  getPrimaryProvider(stage: StageName): string | undefined {
    return (this.store.get('primary') ?? {})[stage]
  }

  setFallbacks(stage: StageName, ids: string[]): void {
    const fb = { ...(this.store.get('fallbacks') ?? {}) }; fb[stage] = ids
    this.store.set('fallbacks', fb)
  }

  getFallbacks(stage: StageName): string[] {
    return (this.store.get('fallbacks') ?? {})[stage] ?? []
  }

  getOrderedProviders(stage: StageName): string[] {
    const primary = this.getPrimaryProvider(stage)
    const fb = this.getFallbacks(stage)
    return primary ? [primary, ...fb.filter(x => x !== primary)] : fb
  }
}

export const settings = new Settings()
