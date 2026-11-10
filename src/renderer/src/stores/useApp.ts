import { create } from 'zustand'
import type {
  AppSettings,
  Attachment,
  Conversation,
  StreamChunk,
  ChatMessage,
  WorkMode,
  ProgressPhase,
  ApprovalDecision,
  ApprovalRequest,
  UserQuestion
} from '../../../shared/types'
import { lookupErrorCode } from '../../../shared/errorCodes'
import { toast } from './useToast'
import { useI18nStore, t } from '../i18n'

/**
 * 应用级状态 —— 用 zustand 实现，对齐 WorkBuddy 本体的 zustand 状态管理。
 * 对外仍暴露 useApp() 返回与旧版一致的状态/动作集合，保证组件零改动。
 */

// 队列项：流式中提交的待发送输入（对齐原版「插入队列」语义）
interface QueuedInput {
  id: string
  text: string
  attachments?: Attachment[]
}

// 工具结果卡片（对齐原版工具执行结果展示）
export interface ToolResultItem {
  id: string
  name: string
  ok: boolean
  output: string
}

interface AppState {
  settings: AppSettings | null
  conversations: Conversation[]
  currentId: string | null
  messages: ChatMessage[]
  streaming: boolean
  searchQuery: string
  // 当前会话的工作模式（会话内临时值，默认取 settings.mode）
  mode: WorkMode
  // 流式中的待发送队列
  queue: QueuedInput[]
  // 侧边栏是否显示归档会话
  showArchived: boolean
  // 当前处理阶段（对齐 progress.phase.*），无流式时为 null
  phase: ProgressPhase | null
  // 阶段对应的工具名（用于渲染 progress.phase.*.{Tool} 文案）
  phaseTool: string | null
  // 挂起的工具审批请求（对齐 tool.approval.*），同一时刻至多一个
  pendingApproval: ApprovalRequest | null
  // 挂起的「向用户提问」（对齐 tool.askUserQuestion.*）
  pendingQuestion: (UserQuestion & { id: string }) | null
  // 本轮已完成的工具结果（用于在对话流中展示工具卡片）
  toolResults: ToolResultItem[]
  // 会话数量上限状态（对齐 conversation.maxSessions.*）
  conversationLimit: { reached: boolean; max: number; count: number }

  init: () => Promise<void>
  selectConversation: (id: string) => Promise<void>
  newConversation: () => Promise<void>
  removeConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  togglePin: (id: string) => Promise<void>
  toggleArchive: (id: string) => Promise<void>
  setShowArchived: (v: boolean) => Promise<void>
  clearContext: () => Promise<void>
  search: (query: string) => Promise<void>
  exportConversation: (id: string) => Promise<void>
  setMode: (mode: WorkMode) => void
  sendMessage: (text: string, attachments?: Attachment[], slashCommand?: string) => Promise<void>
  enqueue: (text: string, attachments?: Attachment[]) => void
  regenerate: (assistantId: string) => Promise<void>
  // 出错后重试：语义等同重新生成该轮（对齐原版 error.retry）
  retry: (assistantId: string) => Promise<void>
  // 继续完成未完成的任务（对齐原版 error.rateLimitCap.continuePrompt / chat.retryMessage）
  continueTask: () => Promise<void>
  removeMessage: (messageId: string) => Promise<void>
  editMessage: (messageId: string, newText: string) => Promise<void>
  stopStreaming: () => Promise<void>
  // 审批决定回执（允许 / 始终允许 / 拒绝，对齐 tool.approval.*）
  decideApproval: (decision: ApprovalDecision) => Promise<void>
  // 回答向用户提问（对齐 tool.askUserQuestion.*）
  answerQuestion: (answers: string[]) => Promise<void>
  skipQuestion: () => Promise<void>
  saveSettings: (s: AppSettings) => Promise<void>
}

const wb = window.workbuddy

// 把 settings.theme（含 system）解析为实际生效的 light/dark，并应用到 <html data-theme>
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

export function resolveTheme(theme: AppSettings['theme']): 'light' | 'dark' {
  if (theme === 'system') return media?.matches ? 'dark' : 'light'
  return theme
}

function applyTheme(theme: AppSettings['theme']): void {
  document.documentElement.dataset.theme = resolveTheme(theme)
}

// 跟随系统：监听 prefers-color-scheme 变化，仅当设置为 system 时实时切换
media?.addEventListener('change', () => {
  const cur = useAppStore.getState().settings
  if (cur && cur.theme === 'system') applyTheme('system')
})

// 内部：把流式增量应用到 messages
function applyChunkToMessages(messages: ChatMessage[], chunk: StreamChunk): ChatMessage[] {
  const next = [...messages]
  const last = next[next.length - 1]
  if (chunk.type === 'delta') {
    if (last && last.role === 'assistant' && last.streaming) {
      next[next.length - 1] = { ...last, content: last.content + (chunk.content ?? '') }
    }
  } else if (chunk.type === 'done') {
    if (last && last.role === 'assistant') {
      // 正常结束：记录停止原因（对齐 error.stopReason.*，如 maxTokens=被截断）
      next[next.length - 1] = { ...last, streaming: false, stopReason: chunk.stopReason }
    }
  } else if (chunk.type === 'error') {
    if (last && last.role === 'assistant' && last.streaming) {
      next[next.length - 1] = {
        ...last,
        streaming: false,
        error: chunk.error,
        errorKind: chunk.errorKind,
        errorHint: chunk.errorHint,
        content: last.content || chunk.error || ''
      }
    }
  }
  return next
}

// 组装请求消息（当前会话历史 + 新用户消息，去掉流式标记，保留附件）
function buildHistory(
  messages: ChatMessage[],
  userMsg: ChatMessage
): Array<Pick<ChatMessage, 'role' | 'content' | 'attachments'>> {
  return [...messages, userMsg].map((m) => ({ role: m.role, content: m.content, attachments: m.attachments }))
}

export const useAppStore = create<AppState>()((set, get) => {
  // 订阅流式事件（一次性，在 store 创建时绑定）
  wb.onStream(({ conversationId, chunk }) => {
    const { currentId, messages } = get()
    if (currentId !== conversationId) return
    // 阶段分片只更新阶段状态，不进消息体（对齐 progress.phase.*）
    if (chunk.type === 'phase') {
      set({ phase: chunk.phase ?? null, phaseTool: chunk.phaseTool ?? null })
      return
    }
    // 工具审批挂起（对齐 tool.approval.*）：等待用户点选，不结束流式
    if (chunk.type === 'approval' && chunk.approval) {
      set({ pendingApproval: chunk.approval, phase: 'waiting_for_permission', phaseTool: chunk.phaseTool ?? null })
      return
    }
    // 向用户提问挂起（对齐 tool.askUserQuestion.*）
    if (chunk.type === 'question' && chunk.question) {
      set({ pendingQuestion: chunk.question, phase: 'waiting_for_user' })
      return
    }
    // 用户回执：清空挂起态
    if (chunk.type === 'approval-decision') {
      set({ pendingApproval: null })
      return
    }
    if (chunk.type === 'question-answer') {
      set({ pendingQuestion: null })
      return
    }
    // 工具执行结果：累积到本轮工具卡片列表
    if (chunk.type === 'tool-result' && chunk.toolResult) {
      set({ toolResults: [...get().toolResults, chunk.toolResult] })
      return
    }
    const next = applyChunkToMessages(messages, chunk)
    set({ messages: next })
    if (chunk.type === 'done' || chunk.type === 'error') {
      set({ streaming: false, phase: null, phaseTool: null, pendingApproval: null, pendingQuestion: null })
      // 队列自动续发：当前回复结束后按序发出下一条（对齐原版「插入队列」）
      const q = get().queue
      if (q.length > 0) {
        const [head, ...rest] = q
        set({ queue: rest })
        void get().sendMessage(head.text, head.attachments)
      }
    }
  })

  // 系统外观变化（跟随系统时生效）
  wb.onSystemTheme(() => {
    const cur = get().settings
    if (cur && cur.theme === 'system') applyTheme('system')
  })

  return {
    settings: null,
    conversations: [],
    currentId: null,
    messages: [],
    streaming: false,
    searchQuery: '',
    mode: 'default',
    queue: [],
    showArchived: false,
    phase: null,
    phaseTool: null,
    pendingApproval: null,
    pendingQuestion: null,
    toolResults: [],
    conversationLimit: { reached: false, max: 0, count: 0 },

    init: async () => {
      const s = await wb.getSettings()
      applyTheme(s.theme)
      useI18nStore.getState().setLocale(s.locale)
      const list = await wb.listConversations()
      const limit = await wb.conversationLimit()
      set({ settings: s, conversations: list, mode: s.mode ?? 'default', conversationLimit: limit })
      if (list.length > 0) {
        await get().selectConversation(list[0].id)
      } else {
        await get().newConversation()
      }
    },

    selectConversation: async (id: string) => {
      const conv = await wb.getConversation(id)
      set({
        currentId: id,
        messages: conv ? conv.messages : [],
        queue: [],
        pendingApproval: null,
        pendingQuestion: null,
        toolResults: []
      })
    },

    newConversation: async () => {
      // 会话数量上限（对齐原版 conversation.maxSessions.dialog.*）
      const limit = await wb.conversationLimit()
      set({ conversationLimit: limit })
      if (limit.reached) {
        toast.error(t('conversation.limit.title'))
        return
      }
      const conv = await wb.createConversation()
      set((state) => ({
        conversations: [conv, ...state.conversations],
        currentId: conv.id,
        messages: [],
        streaming: false,
        queue: [],
        pendingApproval: null,
        pendingQuestion: null,
        toolResults: []
      }))
    },

    // 清空当前会话上下文（保留会话本身），对齐原版 chat.clearSession
    clearContext: async () => {
      const { currentId, messages } = get()
      if (!currentId || messages.length === 0) return
      // 从最早一条消息起截断（rowid 顺序）
      await wb.truncateFrom(currentId, messages[0].id)
      set({ messages: [], streaming: false, queue: [] })
      toast.success(t('chat.clearSession.toast'))
    },

    // 切换工作模式（会话内临时生效；设置页保存的默认值不在此改动）
    setMode: (mode: WorkMode) => set({ mode }),

    // 流式中入队：当前回复结束后自动续发
    enqueue: (text: string, attachments?: Attachment[]) => {
      set((state) => ({
        queue: [...state.queue, { id: crypto.randomUUID(), text, attachments }]
      }))
      toast.info(t('composer.queued'))
    },

    removeConversation: async (id: string) => {
      await wb.deleteConversation(id)
      const rest = await wb.listConversations()
      set({ conversations: rest })
      if (get().currentId === id) {
        if (rest.length > 0) await get().selectConversation(rest[0].id)
        else await get().newConversation()
      }
    },

    renameConversation: async (id: string, title: string) => {
      await wb.renameConversation(id, title)
      set((state) => ({
        conversations: state.conversations.map((c) => (c.id === id ? { ...c, title } : c))
      }))
    },

    // 置顶 / 取消置顶（对齐原版 conversation.section.pinned）
    togglePin: async (id: string) => {
      const pinned = await wb.pinConversation(id)
      set((state) => {
        const next = state.conversations.map((c) => (c.id === id ? { ...c, pinned } : c))
        // 置顶优先排序
        next.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt)
        return { conversations: next }
      })
      toast.success(pinned ? t('sidebar.pinned') : t('sidebar.unpinned'))
    },

    // 归档 / 取消归档（对齐原版「归档或删除」）
    toggleArchive: async (id: string) => {
      const archived = await wb.archiveConversation(id)
      const list = await wb.listConversations(get().showArchived)
      set({ conversations: list })
      toast.success(archived ? t('sidebar.archived') : t('sidebar.unarchived'))
    },

    // 切换是否显示归档会话
    setShowArchived: async (v: boolean) => {
      const list = await wb.listConversations(v)
      set({ showArchived: v, conversations: list })
    },

    search: async (query: string) => {
      set({ searchQuery: query })
      const list = await wb.searchConversations(query)
      set({ conversations: list })
    },

    exportConversation: async (id: string) => {
      const r = await wb.exportConversation(id)
      if (r.ok) toast.success('已导出为 Markdown')
      else toast.info('已取消导出')
    },

    sendMessage: async (text: string, attachments?: Attachment[], slashCommand?: string) => {
      const { settings, currentId, streaming, messages, conversations, renameConversation, mode } = get()
      if (!settings || !currentId) return
      if (!text.trim() && (!attachments || attachments.length === 0)) return
      // 流式中提交 → 入队，等当前回复结束后自动发出
      if (streaming) {
        get().enqueue(text, attachments)
        return
      }

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        createdAt: Date.now(),
        attachments: attachments && attachments.length ? attachments : undefined
      }
      const assistantMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', createdAt: Date.now(), streaming: true }
      set({
        messages: [...messages, userMsg, assistantMsg],
        streaming: true,
        phase: 'preparing',
        phaseTool: null,
        pendingApproval: null,
        pendingQuestion: null,
        toolResults: []
      })

      // 首次对话用首句更新标题（无文本时用附件名）
      const conv = conversations.find((c) => c.id === currentId)
      if (conv && (!conv.title || conv.title === '新对话')) {
        const base = text.trim() || (attachments && attachments[0]?.name) || '图片'
        const title = base.slice(0, 20) + (base.length > 20 ? '…' : '')
        await renameConversation(conv.id, title)
      }

      const history = buildHistory(messages, userMsg)
      await wb.chatStream({
        conversationId: currentId,
        messages: history,
        settings,
        mode,
        slashCommand,
        fullAccess: settings.permission === 'fullAccess',
        userMessageId: userMsg.id,
        userMessageCreatedAt: userMsg.createdAt,
        assistantMessageId: assistantMsg.id,
        assistantMessageCreatedAt: assistantMsg.createdAt
      })
    },

    // 重新生成：删除目标 assistant 消息及其后的所有消息，回退到其前面的上下文重发
    regenerate: async (assistantId: string) => {
      const { settings, currentId, streaming, messages } = get()
      if (!settings || !currentId || streaming) return
      const idx = messages.findIndex((m) => m.id === assistantId)
      if (idx < 0) return
      // 目标 assistant 之前必须有一条 user 消息作为重发输入
      let userIdx = idx - 1
      while (userIdx >= 0 && messages[userIdx].role !== 'user') userIdx--
      if (userIdx < 0) return

      // 主进程：按消息 id 截断（删除该 assistant 及其后续，按 rowid 顺序，可靠）
      await wb.truncateFrom(currentId, assistantId)

      const kept = messages.slice(0, idx)
      const newAssistant: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        streaming: true
      }
      set({ messages: [...kept, newAssistant], streaming: true })

      const history = kept.map((m) => ({ role: m.role, content: m.content, attachments: m.attachments }))
      await wb.chatStream({
        conversationId: currentId,
        messages: history,
        settings,
        assistantMessageId: newAssistant.id,
        assistantMessageCreatedAt: newAssistant.createdAt
      })
    },

    // 出错后重试：复用 regenerate 的回退 + 重发语义
    retry: async (assistantId: string) => {
      await get().regenerate(assistantId)
    },

    // 继续完成未完成的任务（对齐原版 error.rateLimitCap.continuePrompt / chat.retryMessage）
    // 不截断历史，直接把「请继续完成未完成的任务。」作为新用户消息发出
    continueTask: async () => {
      await get().sendMessage(t('chat.retryMessage'))
    },

    // 删除单条消息
    removeMessage: async (messageId: string) => {
      const { currentId, messages } = get()
      if (!currentId) return
      await wb.deleteMessage(currentId, messageId)
      set({ messages: messages.filter((m) => m.id !== messageId) })
    },

    // 编辑用户消息：截断该消息及其后内容，用新文本重新发起对话
    editMessage: async (messageId: string, newText: string) => {
      const { settings, currentId, streaming, messages } = get()
      if (!settings || !currentId || streaming) return
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx < 0 || messages[idx].role !== 'user') return
      const text = newText.trim()
      if (!text) return

      // 主进程：按 id 截断（删除该消息及其后续）
      await wb.truncateFrom(currentId, messageId)

      const editedUser: ChatMessage = { ...messages[idx], content: text, createdAt: Date.now() }
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        streaming: true
      }
      const kept = messages.slice(0, idx)
      set({ messages: [...kept, editedUser, assistantMsg], streaming: true })

      const history = [...kept, editedUser].map((m) => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments
      }))
      await wb.chatStream({
        conversationId: currentId,
        messages: history,
        settings,
        userMessageId: editedUser.id,
        userMessageCreatedAt: editedUser.createdAt,
        assistantMessageId: assistantMsg.id,
        assistantMessageCreatedAt: assistantMsg.createdAt
      })
    },

    stopStreaming: async () => {
      const { currentId } = get()
      if (currentId) await wb.chatAbort(currentId)
      // 主动停止视为放弃后续队列
      set({
        streaming: false,
        queue: [],
        phase: null,
        phaseTool: null,
        pendingApproval: null,
        pendingQuestion: null
      })
    },

    // 审批决定回执（对齐 tool.approval.*）：写回主进程，挂起的工具链路继续执行
    decideApproval: async (decision: ApprovalDecision) => {
      const { currentId, pendingApproval } = get()
      if (!currentId || !pendingApproval) return
      await wb.approvalDecide(currentId, decision, pendingApproval.id)
      set({ pendingApproval: null })
      if (decision === 'reject') toast.info(t('approval.decisionRejected'))
    },

    // 回答向用户提问（对齐 tool.askUserQuestion.*）
    answerQuestion: async (answers: string[]) => {
      const { currentId, pendingQuestion } = get()
      if (!currentId || !pendingQuestion) return
      await wb.answerQuestion(currentId, pendingQuestion.id, answers, false)
      set({ pendingQuestion: null })
    },

    // 跳过提问：主进程按「基于合理假设继续」处理
    skipQuestion: async () => {
      const { currentId, pendingQuestion } = get()
      if (!currentId || !pendingQuestion) return
      await wb.answerQuestion(currentId, pendingQuestion.id, [], true)
      set({ pendingQuestion: null })
      toast.info(t('question.skipped'))
    },

    saveSettings: async (s: AppSettings) => {
      const saved = await wb.saveSettings(s)
      applyTheme(saved.theme)
      useI18nStore.getState().setLocale(saved.locale)
      set({ settings: saved, mode: saved.mode ?? 'default' })
    }
  }
})

// 对外兼容旧接口：组件无需改动
export function useApp() {
  return useAppStore()
}
