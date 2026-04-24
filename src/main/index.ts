import { app, BrowserWindow } from 'electron'
import { createIPCHandler } from 'electron-trpc/main'
import { join } from 'node:path'
import { appRouter } from './ipc/app-router'

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 820, backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  })
  createIPCHandler({ router: appRouter, windows: [win] })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
