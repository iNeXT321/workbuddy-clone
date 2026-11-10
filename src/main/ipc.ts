import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '../shared/types'
import type {
  StreamRequest,
  ErrorKind,
  StopReason,
  ProgressPhase,
  ApprovalDecision,
  ApprovalRequest,
  UserQuestion,
  QuestionAnswer,
  ToolCall
} from '../shared/types'
import { getStore } from './store'
import { streamChat, classifyError } from './llm'
import { createWorkspace, listWorkspaces, workspaceExists } from './workspace'
import { MAX_SESSIONS, approvalToolFor, APPROVAL_RULES } from '../shared/errorCodes'

// 活跃的流式请求，按会话取消
const activeStreams = new Map<string, AbortController>()

/**
 * 挂起的交互等待器 —— 对齐原版工具审批 / 向用户提问的「主进程挂起、渲染层回执」模型：
 * 主进程 emit 一个 approval/question 分片后在此 await 一个 Promise；
 * 渲染层用户点选后经 ipcMain.handle 回填 resolve，主进程继续执行。
 * key = `${conversationId}`，同一会话同一时刻只允许一个挂起交互。
 */
interface PendingInteractive<T> {
  id: string
  resolve: (v: T) => void
}
const pendingApprovals = new Map<string, PendingInteractive<ApprovalDecision>>()
const pendingQuestions = new Map<string, PendingInteractive<QuestionAnswer>>()

// 本次会话 / 本次启动内「始终允许」的记忆集合（对齐 tool.approval.alwaysAllowSession / alwaysAllowLaunch）
const sessionDecisions = new Map<string, Set<string>>()
const launchDecisions = new Set<string>()

/** 查询某个工具在给定会话下是否已被「始终允许」*/
export function preApproved(conversationId: string, toolName: string): boolean {
  if (launchDecisions.has(toolName)) return true
  return sessionDecisions.get(conversationId)?.has(toolName) ?? false
}

function rememberDecision(conversationId: string, toolName: string, decision: ApprovalDecision): void {
  if (decision === 'alwaysAllowSession') {
    const s = sessionDecisions.get(conversationId) ?? new Set<string>()
    s.add(toolName)
    sessionDecisions.set(conversationId, s)
  } else if (decision === 'alwaysAllowLaunch') {
    launchDecisions.add(toolName)
  }
}

/** 会话清理：删除会话时同步清理其会话级记忆 */
export function clearSessionDecisions(conversationId: string): void {
  sessionDecisions.delete(conversationId)
  pendingApprovals.delete(conversationId)
  pendingQuestions.delete(conversationId)
}

/**
 * 请求一次工具审批 —— 由流式链路在「默认权限」下遇到需审批工具时调用。
 * 返回用户决定；完全访问（fullAccess）下调用方不会走到这里。
 */
export function requestApproval(
  win: BrowserWindow | null,
  conversationId: string,
  toolName: string,
  id: string
): Promise<ApprovalDecision> {
  if (preApproved(conversationId, toolName)) return Promise.resolve('allow')
  const tool = approvalToolFor(toolName)
  const rule = APPROVAL_RULES[tool]
  const req: ApprovalRequest = {
    id,
    tool,
    toolName,
    title: rule.title,
    riskTag: rule.riskTag,
    creditHint: rule.creditHint
  }
  return new Promise<ApprovalDecision>((resolve) => {
    pendingApprovals.set(conversationId, { id, resolve })
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC.chatStreamEvent, {
        conversationId,
        chunk: { type: 'approval', approval: req, phase: 'waiting_for_permission', phaseTool: toolName }
      })
    }
  })
}

/** 请求一次「向用户提问」 —— 返回用户答案（skipped 表示用户跳过） */
export function requestQuestion(
  win: BrowserWindow | null,
  conversationId: string,
  question: Omit<UserQuestion, 'id'>,
  id: string
): Promise<QuestionAnswer> {
  const q: UserQuestion = { ...question, id }
  return new Promise<QuestionAnswer>((resolve) => {
    pendingQuestions.set(conversationId, { id, resolve })
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC.chatStreamEvent, {
        conversationId,
        chunk: { type: 'question', question: q, phase: 'waiting_for_user' }
      })
    }
  })
}

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
    clearSessionDecisions(id)
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

    // 同一会话正在回复中：拒绝并发发送（对齐 chat.sessionBusyRetryLater「当前回复还没结束，请稍后再发送」）
    if (activeStreams.has(req.conversationId)) {
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.chatStreamEvent, {
          conversationId: req.conversationId,
          chunk: {
            type: 'error',
            error: '当前回复还没结束，请稍后再发送',
            errorKind: 'unknown',
            errorHint: '当前回复还没结束，请稍后再发送',
            errorCode: 'chat.sessionBusyRetryLater'
          }
        })
      }
      return false
    }

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

    // 累积 assistant 流式内容，结束后落库（含错误态/停止原因：保证 DB 行与 UI 行一致）
    let assistantContent = ''
    let assistantError: { error: string; errorKind: ErrorKind; errorHint: string; errorCode: string } | null = null
    let assistantStopReason: StopReason | undefined
    const assistantId = req.assistantMessageId ?? crypto.randomUUID()
    const persistAssistant = () => {
      // 无内容、无错误且无停止原因 → 不落库（例如用户中途取消且未产生任何输出）
      if (!assistantContent && !assistantError && !assistantStopReason) return
      getStore().appendMessage(req.conversationId, {
        id: assistantId,
        role: 'assistant',
        content: assistantContent || assistantError?.error || '',
        createdAt: req.assistantMessageCreatedAt ?? Date.now(),
        error: assistantError?.error,
        errorKind: assistantError?.errorKind,
        stopReason: assistantStopReason,
        errorCode: assistantError?.errorCode
      })
    }

    const send = (chunk: {
      type: string
      content?: string
      error?: string
      errorKind?: ErrorKind
      errorHint?: string
      errorCode?: string
      stopReason?: StopReason
      phase?: ProgressPhase
      phaseTool?: string
      approval?: ApprovalRequest
      question?: UserQuestion
      toolCall?: ToolCall
      toolResult?: { id: string; name: string; ok: boolean; output: string }
    }) => {
      if (chunk.type === 'delta') assistantContent += chunk.content ?? ''
      if (chunk.type === 'error' && chunk.error) {
        assistantError = {
          error: chunk.error,
          errorKind: (chunk.errorKind ?? 'unknown') as ErrorKind,
          errorHint: chunk.errorHint ?? 'unknown',
          errorCode: chunk.errorCode ?? 'generic'
        }
      }
      if (chunk.type === 'done' && chunk.stopReason) assistantStopReason = chunk.stopReason
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.chatStreamEvent, { conversationId: req.conversationId, chunk })
      }
    }

    try {
      // 网络异常包装：fetch 抛错时也带上分类
      // 注入交互 hooks：让工具链路能把审批 / 提问挂起请求抛给渲染层并等回执
      await streamChat({ ...req, settings }, send, abort.signal, {
        requestApproval: (toolName, id) => requestApproval(win, req.conversationId, toolName, id),
        requestQuestion: (question, id) => requestQuestion(win, req.conversationId, question, id)
      })
      persistAssistant()
    } catch (err) {
      const classified = classifyError(err)
      send({
        type: 'error',
        error: classified.message,
        errorKind: classified.kind,
        errorHint: classified.hint,
        errorCode: classified.code
      })
      persistAssistant()
    } finally {
      activeStreams.delete(req.conversationId)
    }
    return true
  })

  ipcMain.handle(IPC.chatAbort, (_e, conversationId: string): { ok: boolean; reason?: string } => {
    try {
      const controller = activeStreams.get(conversationId)
      if (controller) {
        controller.abort()
        activeStreams.delete(conversationId)
      }
      return { ok: true }
    } catch (err) {
      // 对齐 chat.cancelFailedRetry「停止任务失败，请稍后重试。」
      return { ok: false, reason: err instanceof Error ? err.message : 'abortFailed' }
    }
  })

  // ---------- 工具审批（对齐 tool.approval.*） ----------
  ipcMain.handle(
    IPC.approvalDecide,
    (_e, conversationId: string, decision: ApprovalDecision, approvalId?: string): boolean => {
      const pending = pendingApprovals.get(conversationId)
      // 校验挂起 id，防止过期卡片的回执误触发新的挂起交互
      if (!pending || (approvalId && pending.id !== approvalId)) return false
      pendingApprovals.delete(conversationId)
      pending.resolve(decision)
      // 记忆「始终允许」（会话级 / 启动级）
      if (decision === 'alwaysAllowSession' || decision === 'alwaysAllowLaunch') {
        rememberDecision(conversationId, approvalId ?? '', decision)
      }
      return true
    }
  )

  // ---------- 向用户提问（对齐 tool.askUserQuestion.*） ----------
  ipcMain.handle(
    IPC.answerQuestion,
    (
      _e,
      conversationId: string,
      questionId: string,
      answers: string[],
      skipped?: boolean
    ): { ok: boolean; reason?: string } => {
      const pending = pendingQuestions.get(conversationId)
      // 对齐 chat.answerQuestionNotFound：该会话已无挂起提问 → 问卷已过期或已被处理
      if (!pending) return { ok: false, reason: 'notFound' }
      // 对齐 chat.answerQuestionSessionMismatch：挂起的是另一个提问 → 会话已切换
      if (pending.id !== questionId) return { ok: false, reason: 'sessionMismatch' }
      pendingQuestions.delete(conversationId)
      pending.resolve({ id: questionId, answers: answers ?? [], skipped: !!skipped })
      return { ok: true }
    }
  )

  // ---------- 会话数量上限（对齐 conversation.maxSessions.dialog.*） ----------
  ipcMain.handle(IPC.conversationLimit, () => {
    const count = getStore().countConversations()
    return { reached: count >= MAX_SESSIONS, max: MAX_SESSIONS, count }
  })

  // ---------- 工作空间（对齐 taskStarter.*） ----------
  ipcMain.handle(IPC.workspaceList, () => {
    const root = getStore().getSettings().workspacePath
    return { root, items: listWorkspaces(root) }
  })

  ipcMain.handle(IPC.workspaceCreate, (_e, name: string) => {
    const root = getStore().getSettings().workspacePath
    const r = createWorkspace(root, name)
    // 对齐 taskStarter.createWorkspace.toast.failed
    return { ok: r.ok, path: r.path, reason: r.reason, root }
  })

  ipcMain.handle(IPC.workspaceValidate, (_e, path: string) => workspaceExists(path))

  // ---------- 上下文档位（对齐 chat.sessionSeparator.*） ----------
  ipcMain.handle(
    IPC.newSession,
    (_e, conversationId: string, meta: { model: string; mode: string; permission: string }) => {
      const sep = { id: crypto.randomUUID(), createdAt: Date.now(), ...meta }
      getStore().addSeparator(conversationId, sep)
      return sep
    }
  )
}

export { activeStreams, pendingApprovals, pendingQuestions, sessionDecisions, launchDecisions }
