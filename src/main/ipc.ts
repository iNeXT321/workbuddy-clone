import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '../shared/types'
import type { StreamRequest, ChatMessage } from '../shared/types'
import { getStore } from './store'
import { streamChat } from './llm'

// 活跃的流式请求，按会话取消
const activeStreams = new Map<string, AbortController>()

/**
 * IPC 中枢 —— 对齐 WorkBuddy 的 handler-registry 模式：
 * 主进程集中注册所有 ipcMain.handle，渲染层通过 preload 桥接调用。
 */
export function registerIpcHandlers(): void {
  // ---------- 设置 ----------
  ipcMain.handle(IPC.getSettings, () => getStore().getSettings())

  ipcMain.handle(IPC.saveSettings, (_e, settings) => {
    return getStore().saveSettings(settings)
  })

  // ---------- 会话 ----------
  ipcMain.handle(IPC.listConversations, () => getStore().listConversations())

  ipcMain.handle(IPC.createConversation, (_e, title?: string) => {
    return getStore().createConversation(title ?? '')
  })

  ipcMain.handle(IPC.getConversation, (_e, id: string) => getStore().getConversation(id))

  ipcMain.handle(IPC.deleteConversation, (_e, id: string) => {
    getStore().deleteConversation(id)
    return true
  })

  ipcMain.handle(IPC.renameConversation, (_e, id: string, title: string) => {
    getStore().renameConversation(id, title)
    return true
  })

  // ---------- 对话流 ----------
  ipcMain.handle(IPC.chatStream, async (event, req: StreamRequest) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const abort = new AbortController()
    activeStreams.set(req.conversationId, abort)

    // 主进程读取解密后的 key（渲染层拿不到明文）
    const settings = { ...req.settings, apiKey: getStore().getApiKey() || req.settings.apiKey }

    const send = (chunk: unknown) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.chatStreamEvent, { conversationId: req.conversationId, chunk })
      }
    }

    try {
      await streamChat({ ...req, settings }, send, abort.signal)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      send({ type: 'error', error: message })
    } finally {
      activeStreams.delete(req.conversationId)
    }
    return true
  })

  ipcMain.handle(IPC.chatAbort, (_e, conversationId: string) => {
    const controller = activeStreams.get(conversationId)
    if (controller) {
      controller.abort()
      activeStreams.delete(conversationId)
    }
    return true
  })
}

export { activeStreams }
