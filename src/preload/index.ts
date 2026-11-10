import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'
import type {
  AppSettings,
  Conversation,
  ConversationStatus,
  ConversationOrigin,
  StreamRequest,
  StreamChunk,
  ApprovalDecision,
  ConversationLimit,
  WorkMode,
  PermissionLevel
} from '../shared/types'

/**
 * preload 桥接层 —— 对齐 WorkBuddy 的 contextBridge 模式：
 * 通过 contextIsolation 隔离，只暴露一个受限的命名空间对象给渲染层。
 * 渲染层只能调用白名单方法，无法直接触达 node / ipcRenderer。
 */

export interface WorkbuddyBridge {
  getSettings(): Promise<AppSettings>
  saveSettings(settings: AppSettings): Promise<AppSettings>

  listConversations(includeArchived?: boolean): Promise<Conversation[]>
  createConversation(title?: string): Promise<Conversation>
  getConversation(id: string): Promise<Conversation | null>
  deleteConversation(id: string): Promise<boolean>
  renameConversation(id: string, title: string): Promise<boolean>
  searchConversations(query: string): Promise<Conversation[]>
  exportConversation(id: string): Promise<{ ok: boolean; filePath?: string }>
  pinConversation(id: string): Promise<boolean>
  archiveConversation(id: string): Promise<boolean>

  // 消息级操作
  deleteMessage(conversationId: string, messageId: string): Promise<boolean>
  truncateFrom(conversationId: string, fromMessageId: string): Promise<boolean>

  chatStream(req: StreamRequest): Promise<boolean>
  chatAbort(conversationId: string): Promise<{ ok: boolean; reason?: string }>

  // 工具审批（对齐 tool.approval.*）与向用户提问（对齐 tool.askUserQuestion.*）
  approvalDecide(conversationId: string, decision: ApprovalDecision, approvalId?: string): Promise<boolean>
  answerQuestion(
    conversationId: string,
    questionId: string,
    answers: string[],
    skipped?: boolean
  ): Promise<{ ok: boolean; reason?: string }>

  // 会话数量上限（对齐 conversation.maxSessions.*）
  conversationLimit(): Promise<ConversationLimit & { count: number }>

  // 工作空间（对齐 taskStarter.*）
  workspaceList(): Promise<{ root: string; items: Array<{ name: string; path: string; mtime: number }> }>
  workspaceCreate(name: string): Promise<{ ok: boolean; path?: string; reason?: string; root: string }>
  workspaceValidate(path: string): Promise<boolean>

  // 上下文档位（对齐 chat.sessionSeparator.*）
  newSession(
    conversationId: string,
    meta: { model: string; mode: WorkMode; permission: PermissionLevel }
  ): Promise<{ id: string; createdAt: number; model: string; mode: string; permission: string }>

  // 任务状态角标 / 来源 / 工作空间归属（对齐 conversation.sectionFlag.* / origin.* / section.workspaces）
  conversationStatus(id: string, status: ConversationStatus | undefined): Promise<boolean>
  conversationOrigin(id: string, origin: ConversationOrigin | undefined): Promise<boolean>
  conversationWorkspace(id: string, workspace: string | null): Promise<boolean>
  // 运行中任务查询（对齐 conversation.windowTaskRunning.*）
  runningTasks(): Promise<string[]>

  // 内置终端
  termOpen(conversationId: string): Promise<{ ok: boolean; shell?: string }>
  termWrite(conversationId: string, data: string): Promise<{ ok: boolean }>
  termResize(conversationId: string, cols: number, rows: number): Promise<{ ok: boolean }>
  termClose(conversationId: string): Promise<{ ok: boolean }>

  // 订阅流式事件，返回取消订阅函数
  onStream(cb: (payload: { conversationId: string; chunk: StreamChunk }) => void): () => void

  // 订阅终端事件，返回取消订阅函数
  onTermData(cb: (payload: { conversationId: string; data: string }) => void): () => void
  onTermExit(cb: (payload: { conversationId: string; exitCode: number }) => void): () => void

  // 系统外观变化（跟随系统时）
  onSystemTheme(cb: (theme: 'light' | 'dark') => void): () => void

  platform: NodeJS.Platform
}

const bridge: WorkbuddyBridge = {
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  saveSettings: (settings) => ipcRenderer.invoke(IPC.saveSettings, settings),

  listConversations: (includeArchived) => ipcRenderer.invoke(IPC.listConversations, includeArchived),
  createConversation: (title) => ipcRenderer.invoke(IPC.createConversation, title),
  getConversation: (id) => ipcRenderer.invoke(IPC.getConversation, id),
  deleteConversation: (id) => ipcRenderer.invoke(IPC.deleteConversation, id),
  renameConversation: (id, title) => ipcRenderer.invoke(IPC.renameConversation, id, title),
  searchConversations: (query) => ipcRenderer.invoke(IPC.searchConversations, query),
  exportConversation: (id) => ipcRenderer.invoke(IPC.exportConversation, id),
  pinConversation: (id) => ipcRenderer.invoke(IPC.pinConversation, id),
  archiveConversation: (id) => ipcRenderer.invoke(IPC.archiveConversation, id),

  deleteMessage: (conversationId, messageId) => ipcRenderer.invoke(IPC.deleteMessage, conversationId, messageId),
  truncateFrom: (conversationId, fromMessageId) => ipcRenderer.invoke(IPC.truncateFrom, conversationId, fromMessageId),

  chatStream: (req) => ipcRenderer.invoke(IPC.chatStream, req),
  chatAbort: (conversationId) => ipcRenderer.invoke(IPC.chatAbort, conversationId),

  approvalDecide: (conversationId, decision, approvalId) =>
    ipcRenderer.invoke(IPC.approvalDecide, conversationId, decision, approvalId),
  answerQuestion: (conversationId, questionId, answers, skipped) =>
    ipcRenderer.invoke(IPC.answerQuestion, conversationId, questionId, answers, skipped),
  conversationLimit: () => ipcRenderer.invoke(IPC.conversationLimit),

  workspaceList: () => ipcRenderer.invoke(IPC.workspaceList),
  workspaceCreate: (name) => ipcRenderer.invoke(IPC.workspaceCreate, name),
  workspaceValidate: (path) => ipcRenderer.invoke(IPC.workspaceValidate, path),
  newSession: (conversationId, meta) => ipcRenderer.invoke(IPC.newSession, conversationId, meta),

  conversationStatus: (id, status) => ipcRenderer.invoke(IPC.conversationStatus, id, status),
  conversationOrigin: (id, origin) => ipcRenderer.invoke(IPC.conversationOrigin, id, origin),
  conversationWorkspace: (id, workspace) => ipcRenderer.invoke(IPC.conversationWorkspace, id, workspace),
  runningTasks: () => ipcRenderer.invoke(IPC.runningTasks),

  termOpen: (conversationId) => ipcRenderer.invoke(IPC.termOpen, conversationId),
  termWrite: (conversationId, data) => ipcRenderer.invoke(IPC.termWrite, conversationId, data),
  termResize: (conversationId, cols, rows) => ipcRenderer.invoke(IPC.termResize, conversationId, cols, rows),
  termClose: (conversationId) => ipcRenderer.invoke(IPC.termClose, conversationId),

  onStream: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: { conversationId: string; chunk: StreamChunk }) =>
      cb(payload)
    ipcRenderer.on(IPC.chatStreamEvent, listener)
    return () => ipcRenderer.removeListener(IPC.chatStreamEvent, listener)
  },

  onTermData: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: { conversationId: string; data: string }) => cb(payload)
    ipcRenderer.on(IPC.termDataEvent, listener)
    return () => ipcRenderer.removeListener(IPC.termDataEvent, listener)
  },

  onTermExit: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: { conversationId: string; exitCode: number }) => cb(payload)
    ipcRenderer.on(IPC.termExitEvent, listener)
    return () => ipcRenderer.removeListener(IPC.termExitEvent, listener)
  },

  onSystemTheme: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, theme: 'light' | 'dark') => cb(theme)
    ipcRenderer.on('wb:theme:system-changed', listener)
    return () => ipcRenderer.removeListener('wb:theme:system-changed', listener)
  },

  platform: process.platform
}

contextBridge.exposeInMainWorld('workbuddy', bridge)
