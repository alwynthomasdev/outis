import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import icon from '../../resources/icon.png?asset'
import { registerIpc } from './ipc'
import {
  applyOfflineSwitches,
  installRequestGuard,
  lockWindow,
  onBlocked,
  recordBlocked
} from './offline'
import { WorkerClient } from './worker-client'

const isDev = !app.isPackaged
const rendererUrl = process.env['ELECTRON_RENDERER_URL']

applyOfflineSwitches()

// Models: in development they live in the project; packaged builds ship them as extra resources.
const modelDir = isDev
  ? join(__dirname, '../../resources/models')
  : join(process.resourcesPath, 'models')

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        ...(isDev
          ? ([
              { role: 'reload' },
              { role: 'toggleDevTools' },
              { type: 'separator' }
            ] as MenuItemConstructorOptions[])
          : []),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Outis',
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      webSecurity: true
    }
  })
  win.on('ready-to-show', () => win.show())

  if (isDev && rendererUrl) {
    lockWindow(win.webContents, rendererUrl)
    void win.loadURL(rendererUrl)
  } else {
    const file = join(__dirname, '../renderer/index.html')
    lockWindow(win.webContents, pathToFileURL(file).href.split('#')[0])
    void win.loadFile(file)
  }
  return win
}

app.whenReady().then(() => {
  app.setAppUserModelId('uk.co.outis.app')
  installRequestGuard(isDev)
  buildMenu()

  const worker = new WorkerClient(
    join(__dirname, 'worker.js'),
    [modelDir],
    // Lets VS Code attach a debugger to the worker in development (see .vscode/launch.json).
    isDev ? ['--inspect=9230'] : [],
    (event, data) => {
      if (event === 'network-blocked') {
        const d = data as { url: string; source: string }
        recordBlocked(d.url, d.source)
      }
    }
  )

  registerIpc(worker, {
    version: app.getVersion(),
    userData: app.getPath('userData'),
    modelDir,
    dev: isDev
  })

  onBlocked((entry) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('net:blocked', entry)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  app.on('before-quit', () => worker.stop())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
