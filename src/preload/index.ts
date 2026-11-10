import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'
import type { AppSettings, Conversation, StreamRequest, StreamChunk } from '../shared/types'

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
  chatAbort(conversationId: string): Promise<boolean>

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
