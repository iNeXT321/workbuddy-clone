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

// 停止原因 —— 对齐原版 error.stopReason.*（模型正常结束但结果被截断/拒绝等）
export type StopReason =
  | 'authError'
  | 'maxTokens'
  | 'maxTurnRequests'
  | 'modelService'
  | 'network'
  | 'refusal'
  | 'generic'
  | 'unknown'

// 处理阶段 —— 对齐原版 progress.phase.*：主状态 + 工具级三态
export type ProgressPhase =
  | 'preparing'
  | 'model_requesting'
  | 'model_streaming'
  | 'model_done'
  | 'tool_executing'
  | 'waiting_for_permission'
  | 'waiting_for_user'
  | 'retrying'
  | 'compacting'

// 权限等级 —— 对齐原版 input.wbAdd.permission.*
export type PermissionLevel = 'default' | 'fullAccess'

// 需要审批的工具（高消耗/高风险能力）—— 对齐原版 tool.approval.confirmTitle.* / riskTag.*
export type ApprovalTool =
  | 'imageGen'
  | 'videoGen'
  | 'computerUse'
  | 'audioTranscribe'
  | 'imageProcessing'
  | 'generic'

// 审批决定 —— 对齐原版 tool.approval.allow / alwaysAllow / alwaysAllowThisLaunch / reject
export type ApprovalDecision = 'allow' | 'alwaysAllowSession' | 'alwaysAllowLaunch' | 'reject'

export interface ApprovalRequest {
  id: string
  tool: ApprovalTool
  // 原始工具名（如 ImageGen）
  toolName: string
  // 确认标题（对齐 tool.approval.confirmTitle.{tool}）
  title: string
  // 风险标签（对齐 tool.approval.riskTag.{tool}）
  riskTag?: string
  // 积分消耗提示（对齐 tool.approval.creditHint.{tool}）
  creditHint?: string
}

// 向用户提问 —— 对齐原版 tool.askUserQuestion.*
export interface UserQuestionOption {
  label: string
  description?: string
}

export interface UserQuestion {
  id: string
  question: string
  header?: string
  options?: UserQuestionOption[]
  multiSelect?: boolean
}

export interface QuestionAnswer {
  id: string
  answers: string[]
  skipped?: boolean
}

// 输入区「更多操作」分组 —— 对齐原版 input.wbAdd.* 七大分组
export type WbAddGroup =
  | 'files'
  | 'references'
  | 'experts'
  | 'skills'
  | 'connectors'
  | 'plugins'
  | 'mode'
  | 'permission'

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
  // 正常结束但被截断/拒绝时的原因（对齐原版 error.stopReason.*）
  stopReason?: StopReason
  // 结构化错误码（对齐原版 errorCode.*，254 条错误码体系）
  errorCode?: string
  // 工具审批请求（对齐原版 tool.approval.*）：待用户授权
  pendingApproval?: ApprovalRequest
  // 向用户提问（对齐原版 tool.askUserQuestion.*）
  pendingQuestion?: UserQuestion
  // 用户消息携带的图片附件
  attachments?: Attachment[]
  // 用户消息携带的文档选区（对齐 chat.documentSelection.*）
  selection?: DocumentSelection
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
  // 上下文档位（对齐 chat.sessionSeparator.*）
  separators?: SessionSeparator[]
  // 任务状态角标（对齐 conversation.sectionFlag.*）
  status?: ConversationStatus
  // 任务来源端（对齐 conversation.origin.*）
  origin?: ConversationOrigin
  // 所属工作空间（对齐 conversation.section.workspaces / taskGroup）
  workspace?: string | null
}

/**
 * 任务状态 —— 对齐 `conversation.sectionFlag.tooltip.*` 的四个互斥状态：
 * failed=有任务失败 / pending=有任务待确认 / unread=有任务未读 / working=有任务进行中。
 * 值为 undefined 表示无角标（该分类下暂无状态任务）。
 */
export type ConversationStatus = 'failed' | 'pending' | 'unread' | 'working'

/** 任务来源端 —— 对齐 `conversation.origin.*`：web / workbuddyApp / workbuddyMp */
export type ConversationOrigin = 'web' | 'workbuddyApp' | 'workbuddyMp'

// ==================== 定时任务（对齐 automation.*，846 条） ====================

/**
 * 星期 —— 对齐 `automation.day.*`（MO/TU/WE/TH/FR/SA/SU）与 `datePicker.weekday.*`。
 * 采用 ISO 语义（MO=1 … SU=7），便于与 JS Date.getDay() 换算。
 */
export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'

/** 周期类型 —— 对齐 `automation.schedule.*` 的分型（periodicDay/Week/Biweek/Month/Year + interval + once） */
export type ScheduleKind = 'once' | 'daily' | 'workday' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'interval'

/**
 * 调度规则 —— 对齐 `automation.schedule.summary.*`（once / daily / weekly / biweekly / monthly / yearly）
 * 与 `intervalSummary`（按间隔）。`time` 为 `HH:mm` 本地时间；`intervalMinutes` 仅 interval 用。
 */
export interface Schedule {
  kind: ScheduleKind
  /** 执行时刻 `HH:mm`（interval 类型忽略） */
  time?: string
  /** weekly / biweekly 选中的星期（≥1） */
  weekdays?: Weekday[]
  /** monthly / yearly 选中的日（1-31，≥1） */
  monthDays?: number[]
  /** yearly 选中的月（1-12） */
  month?: number
  /** interval：间隔分钟数（≥60，对齐 validation.intervalHours「至少每 1 小时」） */
  intervalMinutes?: number
  /** interval：限定执行的小时区间（对齐 hourlyRangeAt「每天 {from}-{to} 每小时」） */
  hourFrom?: number
  hourTo?: number
  /** once：绝对执行时间戳（毫秒） */
  at?: number
}

/** 定时任务 —— 对齐 `automation.modal.*`（名称/提示词/执行频率/工作区/权限） */
export interface Automation {
  id: string
  name: string
  /** 提示词（对齐 `automation.modal.prompt`） */
  prompt: string
  /** 附加到提示词前的定时任务标识（对齐 `form.autoTag`=定时任务） */
  schedule: Schedule
  /** 权限档位 —— 对齐 `automation.permission.*` */
  permission: 'default' | 'fullAccess'
  /** 结果推送至（对齐 `form.deliveryTarget` / `deliveryTargetMain`=主会话） */
  deliveryTarget?: string
  /** 绑定的工作区（对齐 `automation.modal.workspaces`，每行一个） */
  workspaces?: string[]
  /** 启停状态（对齐 `automation.filter.statusActive/statusPaused`） */
  enabled: boolean
  /** 归档（对齐 `automation.action.archive`） */
  archived?: boolean
  /** 执行环境（对齐 `automation.cloud.badgeHint`：云端沙箱创建后不可修改） */
  env?: 'local' | 'cloud'
  /** 上次运行时间（毫秒） */
  lastRunAt?: number
  /** 下次运行时间（毫秒） */
  nextRunAt?: number
  createdAt: number
  updatedAt: number
}

/** 运行记录状态 —— 对齐 `automation.run.status.*` 与 `automation.row.*` */
export type AutomationRunStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
  | 'skipped'

/** 运行结果证据 —— 对齐 `automation.evidence.*` */
export interface AutomationEvidence {
  artifact?: boolean
  assistantOutput?: boolean
  externalAction?: boolean
  localFileMutation?: boolean
}

/** 一次运行记录 —— 对齐 `automation.records.*` / `automation.detail.*` / `automation.run.*` */
export interface AutomationRun {
  id: string
  automationId: string
  /** 快照任务名（任务删除后记录仍可读，对齐 `records.deletedAutomation`） */
  taskName: string
  status: AutomationRunStatus
  /** 失败分因码 —— 对齐 `automation.detail.reason.*`（如 network / modelConfigFailed / runTimeout） */
  reason?: string
  startedAt: number
  finishedAt?: number
  /** 关联会话 id（对齐 `detail.retryConversation`） */
  conversationId?: string
  /** 结果摘要（对齐 `detail.summary`） */
  summary?: string
  /** 证据（对齐 `detail.artifacts` / `evidence.*`） */
  evidence?: AutomationEvidence
  /** 技术详情 / 错误全文（对齐 `detail.technicalDetails` / `errorTruncated`） */
  error?: string
  /** 是否归档（对齐 `record.archive.*`） */
  archived?: boolean
  /** 是否测试运行（对齐 `result.manualTest`=测试运行成功；不影响正式调度） */
  test?: boolean
}


export interface ModelInfo {
  id: string
  name: string
}

// 工作模式 —— 对齐原版 input.wbAdd.mode.*：默认(craft) / 计划(plan) / 仅问答(ask)
export type WorkMode = 'default' | 'plan' | 'ask'

// 工作空间 —— 对齐原版 taskStarter.*：任务在其目录下读写文件
export interface Workspace {
  name: string
  path: string
  createdAt: number
}

// 模型能力（对齐原版 model.* 的模型族与能力门控）
export interface ModelCapability {
  id: string
  label: string
  description?: string
  vision: boolean
  gif: boolean
  tools: boolean
}

// 文档选区 —— 对齐原版 chat.documentSelection.*
// （documentLabel=文档选区 / spreadsheetLabel=表格选区 / presentationLabel=幻灯片选区 /
//   localDocument=本地文档 / onlineDocument=腾讯文档 / dismiss=忽略此选区）
export type SelectionKind = 'document' | 'spreadsheet' | 'presentation' | 'unknown'
export type SelectionSource = 'local' | 'online'

export interface DocumentSelection {
  id: string
  kind: SelectionKind
  source: SelectionSource
  // 文件名 / 文档名
  name: string
  // 选中的文本内容（表格为区域文本，幻灯片为文本框内容）
  text: string
  // 附加定位信息（如「Sheet1!A1:C10」「第 3 张幻灯片」）
  locator?: string
}

// 上下文档位 —— 对齐原版 chat.sessionSeparator.*（会话分隔与上下文边界）
export interface SessionSeparator {
  id: string
  // 该分界点之前/之后的时间戳（用于渲染「新的会话」分隔）
  createdAt: number
  // 设置项快照（模型 / 模式 / 权限），对齐 sessionSeparator.settingsTooltip
  model: string
  mode: WorkMode
  permission: PermissionLevel
}

export interface AppSettings {
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  theme: 'light' | 'dark' | 'system'
  locale: 'zh-CN' | 'en'
  // 默认工作模式（会话内可临时覆盖）
  mode: WorkMode
  // 权限等级（对齐原版 input.wbAdd.permission.*）：默认沙箱 / 完全访问
  permission: PermissionLevel
  // 允许完全访问前需勾选的安全确认（原版 confirm.checkbox 语义）
  fullAccessAcknowledged: boolean
  // 发送/换行快捷键可配置（对齐 chat.input.sendShortcutTooltip）
  sendShortcut: 'Enter' | 'Mod+Enter'
  // 默认工作空间路径（对齐 taskStarter.workspacePathHint.*）
  workspacePath: string
  // 上下文档位提醒（对齐 chat.clearSession.idleTimeoutToast「可以通过设置新开会话的时间阈值来节省积分消耗」）
  newSessionThresholdMinutes: number
}

export interface StreamRequest {
  conversationId: string
  messages: Array<Pick<ChatMessage, 'role' | 'content' | 'attachments'>>
  settings: AppSettings
  // 本次请求的工作模式（优先于 settings.mode）
  mode?: WorkMode
  // 斜杠指令（对齐原版「/ 调用技能与指令」）：指令名 + 参数
  slashCommand?: string
  // 安全确认后的完全访问标记（供主进程记录/审计）
  fullAccess?: boolean
  // 渲染层生成的客户端消息 id / 时间戳 —— 保证 DB 行与 UI 行一致，支撑消息级操作（删除/重新生成）
  userMessageId?: string
  userMessageCreatedAt?: number
  assistantMessageId?: string
  assistantMessageCreatedAt?: number
}

// 模型发起的一次工具调用（对齐原版 model→tool call→审批→执行 链路）
export interface ToolCall {
  id: string
  name: string
  // JSON 字符串形式的参数
  args: string
}

// 流式增量：delta 为文本片段，done 为结束标记，error 为错误
// approval / question 为交互挂起分片（对齐工具审批与向用户提问），
// approval-decision / question-answer 为用户回执分片，tool-call 为模型请求调用工具
export interface StreamChunk {
  type:
    | 'delta'
    | 'done'
    | 'error'
    | 'phase'
    | 'approval'
    | 'question'
    | 'approval-decision'
    | 'question-answer'
    | 'tool-call'
    | 'tool-result'
  content?: string
  error?: string
  // 错误分类与建议（仅 error 分片携带）
  errorKind?: ErrorKind
  errorHint?: string
  // 结构化错误码（对齐原版 errorCode.*）
  errorCode?: string
  // 正常结束但被截断/拒绝（仅 done 分片携带，对齐 error.stopReason.*）
  stopReason?: StopReason
  // 处理阶段（仅 phase 分片携带，对齐 progress.phase.*）
  phase?: ProgressPhase
  // 阶段对应的工具名（用于渲染 progress.phase.*.{Tool} 文案）
  phaseTool?: string
  // 审批请求（仅 approval 分片携带，对齐 tool.approval.*）
  approval?: ApprovalRequest
  // 向用户提问（仅 question 分片携带，对齐 tool.askUserQuestion.*）
  question?: UserQuestion
  // 模型请求的工具调用（仅 tool-call 分片携带）
  toolCall?: ToolCall
  // 工具执行结果（仅 tool-result 分片携带，用于渲染工具结果卡片）
  toolResult?: { id: string; name: string; ok: boolean; output: string }
}

// 会话上限提示（对齐原版 conversation.maxSessions.dialog.*）
export interface ConversationLimit {
  reached: boolean
  max: number
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
  // 工具审批（对齐 tool.approval.*）与向用户提问（对齐 tool.askUserQuestion.*）
  approvalDecide: 'wb:approval:decide',
  answerQuestion: 'wb:question:answer',
  // 会话数量上限查询（对齐 conversation.maxSessions.*）
  conversationLimit: 'wb:conversation:limit',
  // 工作空间（对齐 taskStarter.*）
  workspaceList: 'wb:workspace:list',
  workspaceCreate: 'wb:workspace:create',
  workspaceValidate: 'wb:workspace:validate',
  // 上下文档位（对齐 chat.sessionSeparator.*）
  newSession: 'wb:conversation:new-session',
  // 任务状态角标 / 来源 / 工作空间归属（对齐 conversation.sectionFlag.* / origin.* / section.workspaces）
  conversationStatus: 'wb:conversation:status',
  conversationOrigin: 'wb:conversation:origin',
  conversationWorkspace: 'wb:conversation:workspace',
  // 运行中任务查询（对齐 conversation.windowTaskRunning.*：关窗前二次确认）
  runningTasks: 'wb:conversation:running-tasks',
  // 定时任务（对齐 automation.*）
  automationList: 'wb:automation:list',
  automationGet: 'wb:automation:get',
  automationSave: 'wb:automation:save',
  automationEnabled: 'wb:automation:enabled',
  automationArchived: 'wb:automation:archived',
  automationDelete: 'wb:automation:delete',
  automationDeleteBatch: 'wb:automation:delete-batch',
  automationRunNow: 'wb:automation:run-now',
  automationRuns: 'wb:automation:runs',
  automationRunArchive: 'wb:automation:run-archive',
  automationRunDelete: 'wb:automation:run-delete',
  automationNextRun: 'wb:automation:next-run',
  automationChanged: 'wb:automation:changed',
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
