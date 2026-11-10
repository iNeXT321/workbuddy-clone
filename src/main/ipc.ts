import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '../shared/types'
import type { StreamRequest, ChatMessage, ErrorKind } from '../shared/types'
import { getStore } from './store'
import { streamChat, classifyError } from './llm'

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
  ipcMain.handle(IPC.listConversations, (_e, includeArchived?: boolean) =>
    getStore().listConversations(!!includeArchived)
  )

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

  ipcMain.handle(IPC.searchConversations, (_e, query: string) => {
    if (!query || !query.trim()) return getStore().listConversations()
    return getStore().searchConversations(query.trim())
  })

  // 置顶 / 归档（对齐原版会话组织能力）
  ipcMain.handle(IPC.pinConversation, (_e, id: string) => getStore().togglePin(id))

  ipcMain.handle(IPC.archiveConversation, (_e, id: string) => getStore().toggleArchive(id))

  // ---------- 消息级操作 ----------
  ipcMain.handle(IPC.deleteMessage, (_e, conversationId: string, messageId: string) => {
    getStore().deleteMessage(conversationId, messageId)
    return true
  })

  ipcMain.handle(IPC.truncateFrom, (_e, conversationId: string, fromMessageId: string) => {
    getStore().truncateFromId(conversationId, fromMessageId)
    return true
  })

  // ---------- 会话导出 ----------
  ipcMain.handle(IPC.exportConversation, async (_e, id: string) => {
    const conv = getStore().getConversation(id)
    if (!conv) return { ok: false }
    const title = conv.title || 'conversation'
    const safe = title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)
    const lines = [`# ${title}`, '']
    for (const m of conv.messages) {
      lines.push(`## ${m.role === 'user' ? '我' : 'WorkBuddy'}`)
      lines.push('')
      lines.push(m.content)
      lines.push('')
    }
    const markdown = lines.join('\n')
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出会话',
      defaultPath: join(app.getPath('downloads'), `${safe}.md`),
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: '纯文本', extensions: ['txt'] }
      ]
    })
    if (canceled || !filePath) return { ok: false }
    writeFileSync(filePath, markdown, 'utf-8')
    return { ok: true, filePath }
  })

  // ---------- 对话流 ----------
  ipcMain.handle(IPC.chatStream, async (event, req: StreamRequest) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const abort = new AbortController()
    activeStreams.set(req.conversationId, abort)

    // 主进程读取解密后的 key（渲染层拿不到明文）
    const settings = { ...req.settings, apiKey: getStore().getApiKey() || req.settings.apiKey }

    // 落库用户消息：优先用渲染层传的 id/时间戳（保证 DB 行与 UI 行一致，支撑后续删除/重新生成）
    const lastUser = [...req.messages].reverse().find((m) => m.role === 'user')
    const userId = req.userMessageId ?? crypto.randomUUID()
    if (lastUser) {
      getStore().appendMessage(req.conversationId, {
        id: userId,
        role: 'user',
        content: lastUser.content,
        createdAt: req.userMessageCreatedAt ?? Date.now(),
        attachments: lastUser.attachments
      })
    }

    // 累积 assistant 流式内容，结束后落库（含错误态：保证 DB 行与 UI 行一致）
    let assistantContent = ''
    let assistantError: { error: string; errorKind: ErrorKind; errorHint: string } | null = null
    const assistantId = req.assistantMessageId ?? crypto.randomUUID()
    const persistAssistant = () => {
      // 无内容且无错误 → 不落库（例如用户中途取消且未产生任何输出）
      if (!assistantContent && !assistantError) return
      getStore().appendMessage(req.conversationId, {
        id: assistantId,
        role: 'assistant',
        content: assistantContent || assistantError?.error || '',
        createdAt: req.assistantMessageCreatedAt ?? Date.now(),
        error: assistantError?.error,
        errorKind: assistantError?.errorKind
      })
    }

    const send = (chunk: { type: string; content?: string; error?: string; errorKind?: ErrorKind; errorHint?: string }) => {
      if (chunk.type === 'delta') assistantContent += chunk.content ?? ''
      if (chunk.type === 'error' && chunk.error) {
        assistantError = {
          error: chunk.error,
          errorKind: (chunk.errorKind ?? 'unknown') as ErrorKind,
          errorHint: chunk.errorHint ?? 'unknown'
        }
      }
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.chatStreamEvent, { conversationId: req.conversationId, chunk })
      }
    }

    try {
      // 网络异常包装：fetch 抛错时也带上分类
      await streamChat({ ...req, settings }, send, abort.signal)
      persistAssistant()
    } catch (err) {
      const classified = classifyError(err)
      send({ type: 'error', error: classified.message, errorKind: classified.kind, errorHint: classified.hint })
      persistAssistant()
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
