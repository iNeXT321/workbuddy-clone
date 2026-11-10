// 共享类型定义：主进程、preload、渲染层三方共用
// 对应 WorkBuddy 中 IPC 契约 + 桥接命名空间的职责

// 图片附件（多模态输入）—— 对齐原版 image / MediaPreviewContext 能力
export interface Attachment {
  id: string
  name: string
  mime: string
  // data URL（data:image/png;base64,...），本期本地内存/DB 存储，不含文件系统落地
  dataUrl: string
  size: number
}

// 错误分类 —— 对齐原版 error.* / errorBanner.* 的分类与动作语义
export type ErrorKind =
  | 'network'
  | 'timeout'
  | 'auth'
  | 'rateLimit'
  | 'modelOverload'
  | 'server'
  | 'unknown'

export interface ChatMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  createdAt: number
  // 流式进行中的标记
  streaming?: boolean
  // 出错信息
  error?: string
  // 错误分类（用于渲染层展示对应标题与建议动作）
  errorKind?: ErrorKind
  // 面向用户的建议（如「请检查网络后重试」）
  errorHint?: string
  // 用户消息携带的图片附件
  attachments?: Attachment[]
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  // 置顶（对齐原版 conversation.section.pinned）
  pinned?: boolean
  // 归档（对齐原版「归档或删除」语义）
  archived?: boolean
  messages: ChatMessage[]
}

export interface ModelInfo {
  id: string
  name: string
}

// 工作模式 —— 对齐原版 input.wbAdd.mode.*：默认(craft) / 计划(plan) / 仅问答(ask)
export type WorkMode = 'default' | 'plan' | 'ask'

export interface AppSettings {
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  theme: 'light' | 'dark' | 'system'
  locale: 'zh-CN' | 'en'
  // 默认工作模式（会话内可临时覆盖）
  mode: WorkMode
}

export interface StreamRequest {
  conversationId: string
  messages: Array<Pick<ChatMessage, 'role' | 'content' | 'attachments'>>
  settings: AppSettings
  // 本次请求的工作模式（优先于 settings.mode）
  mode?: WorkMode
  // 渲染层生成的客户端消息 id / 时间戳 —— 保证 DB 行与 UI 行一致，支撑消息级操作（删除/重新生成）
  userMessageId?: string
  userMessageCreatedAt?: number
  assistantMessageId?: string
  assistantMessageCreatedAt?: number
}

// 流式增量：delta 为文本片段，done 为结束标记，error 为错误
export interface StreamChunk {
  type: 'delta' | 'done' | 'error'
  content?: string
  error?: string
  // 错误分类与建议（仅 error 分片携带）
  errorKind?: ErrorKind
  errorHint?: string
}

// IPC 通道常量（对齐 WorkBuddy 的 wb: 命名空间，参考本体 wb:conversation:* 风格）
export const IPC = {
  // 设置
  getSettings: 'wb:settings:get',
  saveSettings: 'wb:settings:save',
  // 会话
  listConversations: 'wb:conversation:list',
  createConversation: 'wb:conversation:create',
  getConversation: 'wb:conversation:get',
  deleteConversation: 'wb:conversation:delete',
  renameConversation: 'wb:conversation:rename',
  searchConversations: 'wb:conversation:search',
  exportConversation: 'wb:conversation:export',
  pinConversation: 'wb:conversation:pin',
  archiveConversation: 'wb:conversation:archive',
  // 消息级操作：按消息 id 截断（删除该消息及其后续），比按时间戳更可靠
  deleteMessage: 'wb:message:delete',
  truncateFrom: 'wb:message:truncate-from',
  // 对话流
  chatStream: 'wb:chat:stream',
  chatAbort: 'wb:chat:abort',
  // 内置终端
  termOpen: 'wb:terminal:open',
  termWrite: 'wb:terminal:write',
  termResize: 'wb:terminal:resize',
  termClose: 'wb:terminal:close',
  // 事件（主进程 → 渲染层）
  chatStreamEvent: 'wb:chat:stream:event',
  termDataEvent: 'wb:terminal:data:event',
  termExitEvent: 'wb:terminal:exit:event'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
