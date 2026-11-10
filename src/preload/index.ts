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

  listConversations(): Promise<Conversation[]>
  createConversation(title?: string): Promise<Conversation>
  getConversation(id: string): Promise<Conversation | null>
  deleteConversation(id: string): Promise<boolean>
  renameConversation(id: string, title: string): Promise<boolean>

  chatStream(req: StreamRequest): Promise<boolean>
  chatAbort(conversationId: string): Promise<boolean>

  // 订阅流式事件，返回取消订阅函数
  onStream(cb: (payload: { conversationId: string; chunk: StreamChunk }) => void): () => void

  platform: NodeJS.Platform
}

const bridge: WorkbuddyBridge = {
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  saveSettings: (settings) => ipcRenderer.invoke(IPC.saveSettings, settings),

  listConversations: () => ipcRenderer.invoke(IPC.listConversations),
  createConversation: (title) => ipcRenderer.invoke(IPC.createConversation, title),
  getConversation: (id) => ipcRenderer.invoke(IPC.getConversation, id),
  deleteConversation: (id) => ipcRenderer.invoke(IPC.deleteConversation, id),
  renameConversation: (id, title) => ipcRenderer.invoke(IPC.renameConversation, id, title),

  chatStream: (req) => ipcRenderer.invoke(IPC.chatStream, req),
  chatAbort: (conversationId) => ipcRenderer.invoke(IPC.chatAbort, conversationId),

  onStream: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: { conversationId: string; chunk: StreamChunk }) =>
      cb(payload)
    ipcRenderer.on(IPC.chatStreamEvent, listener)
    return () => ipcRenderer.removeListener(IPC.chatStreamEvent, listener)
  },

  platform: process.platform
}

contextBridge.exposeInMainWorld('workbuddy', bridge)
