// 共享类型定义：主进程、preload、渲染层三方共用
// 对应 WorkBuddy 中 IPC 契约 + 桥接命名空间的职责

export interface ChatMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  createdAt: number
  // 流式进行中的标记
  streaming?: boolean
  // 出错信息
  error?: string
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
}

export interface ModelInfo {
  id: string
  name: string
}

export interface AppSettings {
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  theme: 'light' | 'dark'
}

export interface StreamRequest {
  conversationId: string
  messages: Array<Pick<ChatMessage, 'role' | 'content'>>
  settings: AppSettings
}

// 流式增量：delta 为文本片段，done 为结束标记，error 为错误
export interface StreamChunk {
  type: 'delta' | 'done' | 'error'
  content?: string
  error?: string
}

// IPC 通道常量（对齐 WorkBuddy 的 wb:invoke / wb:event 模式）
export const IPC = {
  // 设置
  getSettings: 'settings:get',
  saveSettings: 'settings:save',
  // 会话
  listConversations: 'conversation:list',
  createConversation: 'conversation:create',
  getConversation: 'conversation:get',
  deleteConversation: 'conversation:delete',
  renameConversation: 'conversation:rename',
  // 对话流
  chatStream: 'chat:stream',
  chatAbort: 'chat:abort',
  // 事件（主进程 → 渲染层）
  chatStreamEvent: 'chat:stream:event'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
