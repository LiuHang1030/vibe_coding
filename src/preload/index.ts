import { contextBridge } from 'electron'
import { exposeElectronTRPC } from 'electron-trpc/main'

process.once('loaded', () => { exposeElectronTRPC() })

contextBridge.exposeInMainWorld('electronAPI', {
  selectFile: async () => null   // placeholder; Home uses drag+drop
})
