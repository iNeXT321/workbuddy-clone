import * as os from 'node:os'
import * as pty from '@lydell/node-pty'
import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../shared/types'

/**
 * 内置终端 —— 对齐 WorkBuddy 本体的 node-pty 终端能力：
 * 主进程维护 PTY 会话，渲染层通过 IPC 输入/输出，数据经事件推送。
 * 会话按 conversationId 隔离（后续可扩展为多终端实例）。
 */

interface PtySession {
  pty: pty.IPty
  windowId: number
}

const sessions = new Map<string, PtySession>()

function resolveShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe'
  }
  return process.env.SHELL || '/bin/zsh'
}

export function registerTerminalHandlers(): void {
  // 打开一个终端会话，返回会话 id（即 conversationId）
  ipcMain.handle(IPC.termOpen, (event, conversationId: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || sessions.has(conversationId)) return { ok: false }

    const shell = resolveShell()
    const p = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: os.homedir(),
      env: { ...process.env, TERM: 'xterm-256color' }
    })

    sessions.set(conversationId, { pty: p, windowId: win.id })

    // 终端输出 → 渲染层
    p.onData((data) => {
      const w = BrowserWindow.fromId(win.id)
      if (w && !w.isDestroyed()) {
        w.webContents.send(IPC.termDataEvent, { conversationId, data })
      }
    })

    p.onExit(({ exitCode }) => {
      const w = BrowserWindow.fromId(win.id)
      if (w && !w.isDestroyed()) {
        w.webContents.send(IPC.termExitEvent, { conversationId, exitCode })
      }
      sessions.delete(conversationId)
    })

    return { ok: true, shell }
  })

  // 写入终端输入
  ipcMain.handle(IPC.termWrite, (_e, conversationId: string, data: string) => {
    const session = sessions.get(conversationId)
    if (!session) return { ok: false }
    session.pty.write(data)
    return { ok: true }
  })

  // 调整终端尺寸
  ipcMain.handle(IPC.termResize, (_e, conversationId: string, cols: number, rows: number) => {
    const session = sessions.get(conversationId)
    if (!session) return { ok: false }
    try {
      session.pty.resize(cols, rows)
    } catch {
      /* 忽略 resize 失败 */
    }
    return { ok: true }
  })

  // 关闭终端会话
  ipcMain.handle(IPC.termClose, (_e, conversationId: string) => {
    const session = sessions.get(conversationId)
    if (session) {
      try {
        session.pty.kill()
      } catch {
        /* 忽略 kill 失败 */
      }
      sessions.delete(conversationId)
    }
    return { ok: true }
  })
}
