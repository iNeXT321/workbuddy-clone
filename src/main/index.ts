import { app, BrowserWindow, Menu, shell, nativeTheme, dialog } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers, activeStreams } from './ipc'
import { registerTerminalHandlers } from './terminal'
import { startScheduler, stopScheduler } from './automation'
import { getStore } from './store'

/**
 * 主进程入口 —— 对齐 WorkBuddy 的 main/index.js 职责：
 * 窗口管理、菜单构建、原生主题、安全 Web 偏好设置。
 */

function createWindow(): void {
  const settings = getStore().getSettings()
  nativeTheme.themeSource = settings.theme

  // 解析实际外观（system 时取系统当前值）
  const isDark = settings.theme === 'system' ? nativeTheme.shouldUseDarkColors : settings.theme === 'dark'

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    title: 'WorkBuddy',
    show: false,
    backgroundColor: isDark ? '#1e1e1e' : '#ffffff',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // 关窗前拦截：若仍有任务运行，弹出「任务运行中」二选一（对齐 conversation.windowTaskRunning.*）
  let forceClose = false
  win.on('close', (e) => {
    if (forceClose) return
    if (activeStreams.size === 0) return
    e.preventDefault()
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      title: '任务运行中',
      message: '关闭窗口后任务将继续在后台运行，可随时返回查看进度。请选择操作方式。',
      buttons: ['仅关闭窗口', '中止任务并关闭'],
      defaultId: 0,
      cancelId: 0
    })
    // 0 = 仅关闭窗口（任务继续在后台）；1 = 中止任务并关闭
    if (choice === 1) {
      for (const ctrl of activeStreams.values()) {
        try {
          ctrl.abort()
        } catch {
          /* ignore */
        }
      }
      activeStreams.clear()
    }
    forceClose = true
    win.close()
  })

  // 外链用系统浏览器打开（对齐本体的 shell 外链策略）
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([{ role: 'appMenu' }] as Electron.MenuItemConstructorOptions[])
      : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: '视图',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
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

app.whenReady().then(() => {
  registerIpcHandlers()
  registerTerminalHandlers()
  buildMenu()
  createWindow()
  // 定时任务调度器（对齐 automation.* 的本地调度）
  startScheduler()

  // 系统外观变化 → 通知所有窗口，渲染层按「跟随系统」设置实时切换
  nativeTheme.on('updated', () => {
    const dark = nativeTheme.shouldUseDarkColors
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('wb:theme:system-changed', dark ? 'dark' : 'light')
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 退出前停止调度器，避免定时器悬挂
app.on('before-quit', () => stopScheduler())
