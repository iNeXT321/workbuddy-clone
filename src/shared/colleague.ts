/**
 * 数字员工 / 助理域纯计算层 —— 对齐原版 `colleagues.*`（573 条）。
 *
 * 本模块只做「模型 + 词典 key 推导 + 纯函数」，不碰 Electron / IPC，
 * 便于逻辑冒烟（esbuild ESM）与运行时冒烟共用同一套判定。
 *
 * 关键对齐点：
 * - 状态三态：`colleagueStatus.{working,idle,abnormal}`（详情页）与
 *   `statusAvailable` / `statusIdle`（列表卡徽标）分属两族。
 * - 可见范围三档：`permission.{personal,project,public}`，与发布对话框
 *   `publishDialog.option.*` / 提交按钮 `submit.*` 一一对应。
 * - 渠道占用规则：**除小程序外**，同一渠道同一时刻只能被 1 位助理占用
 *   （`bindChannel.colleague.subtitle`），本条由存储层强制执行。
 * - 原版自身用桩文案标记未实现能力（IM 扫码绑定、专家雇佣、企业智能体、
 *   腾讯文档授权、代码仓库 OAuth），复刻同样以桩文案对齐，不实现真实链路。
 */

// ==================== 状态与可见范围 ====================

/** 助理状态 —— 对齐 `detail.colleagueStatus.*`（三态） */
export type ColleagueStatus = 'working' | 'idle' | 'abnormal'

export const COLLEAGUE_STATUSES: ColleagueStatus[] = ['working', 'idle', 'abnormal']

/** 可见范围 —— 对齐 `permission.{personal,project,public}` 与 `publishDialog.option.*` */
export type ColleagueVisibility = 'personal' | 'project' | 'public'

export const VISIBILITIES: ColleagueVisibility[] = ['personal', 'project', 'public']

/** 详情页徽标 key（三态） */
export function colleagueStatusLabelKey(s: ColleagueStatus): string {
  return `colleagues.detail.colleagueStatus.${s}`
}

/** 列表卡徽标 key —— 对齐 `statusAvailable`（工作中）/ `statusIdle`（已停用） */
export function listStatusLabelKey(s: ColleagueStatus): string {
  return s === 'working' ? 'colleagues.statusAvailable' : 'colleagues.statusIdle'
}

/** 可见范围名称 / 说明 key */
export function visibilityNameKey(v: ColleagueVisibility): string {
  return `colleagues.bindChannel.permission.${v}.name`
}
export function visibilityDescKey(v: ColleagueVisibility): string {
  return `colleagues.bindChannel.permission.${v}.desc`
}
/** 发布对话框选项说明 key（比 permission.desc 更口语） */
export function publishOptionNameKey(v: ColleagueVisibility): string {
  return `colleagues.publishDialog.option.${v}.name`
}
export function publishOptionDescKey(v: ColleagueVisibility): string {
  return `colleagues.publishDialog.option.${v}.desc`
}
/** 发布对话框主按钮 key —— 对齐 `submit.{personal,project,public}` */
export function publishSubmitKey(v: ColleagueVisibility): string {
  return `colleagues.publishDialog.submit.${v}`
}

// ==================== 角色预设 ====================

/**
 * 20 个职业快捷预设 —— 对齐 `createDialog.rolePreset.*`。
 * 仅存 id；名称与描述取自词典（zh 为权威，en 由原版英文包补齐）。
 */
export const ROLE_PRESETS: string[] = [
  'aiEngineer',
  'backendArchitect',
  'codeReviewer',
  'contentCreator',
  'dataAnalyst',
  'docGenerator',
  'experienceArchitect',
  'frontend',
  'gameDesigner',
  'industryResearcher',
  'mobile',
  'productAdmin',
  'projectManager',
  'qa',
  'seniorDeveloper',
  'softwareArchitect',
  'stockResearcher',
  'ui',
  'webDeveloper',
  'wechatMiniProgram',
  'xiaohongshuOperator'
]

/** 首屏「查看更多」前默认展示的预设数（对齐 `viewMore` / `viewLess` 折叠语义） */
export const ROLE_PRESET_VISIBLE = 8

export function rolePresetNameKey(id: string): string {
  return `colleagues.createDialog.rolePreset.${id}`
}
export function rolePresetDescKey(id: string): string {
  return `colleagues.createDialog.rolePreset.${id}Desc`
}

/** 自定义职业 —— 对齐 `customRole` / `customRoleDesc`（id 固定 'custom'） */
export const CUSTOM_ROLE_ID = 'custom'

// ==================== 常用职责 / 能力标签 ====================

/** 4 项常用职责 —— 对齐 `createDialog.responsibility.*` */
export const RESPONSIBILITY_OPTIONS: string[] = ['analysis', 'planning', 'report', 'review']

export function responsibilityLabelKey(id: string): string {
  return `colleagues.createDialog.responsibility.${id}`
}

/** 8 项能力标签 —— 对齐 `colleagues.tag.*`（详情页与卡片共用） */
export const CAPABILITY_TAGS: string[] = [
  'research',
  'summary',
  'data',
  'report',
  'writing',
  'polish',
  'acceptance',
  'coding'
]

export function capabilityTagKey(id: string): string {
  return `colleagues.tag.${id}`
}

/** 3 张推荐卡片 —— 对齐 `cards.{researcher,analyst,editor}` */
export const RECOMMENDED_CARDS: string[] = ['researcher', 'analyst', 'editor']

export function cardNameKey(id: string): string {
  return `colleagues.cards.${id}.name`
}
export function cardTitleKey(id: string): string {
  return `colleagues.cards.${id}.title`
}
export function cardDescKey(id: string): string {
  return `colleagues.cards.${id}.description`
}

// ==================== 头像 ====================

/** 20 张预制头像 —— 对齐 `createDialog.avatar.preset01..20`（每页 8 张） */
export const AVATAR_PRESETS: string[] = Array.from(
  { length: 20 },
  (_, i) => `preset${String(i + 1).padStart(2, '0')}`
)

export const AVATAR_PAGE_SIZE = 8

export function avatarPresetKey(id: string): string {
  return `colleagues.createDialog.avatar.${id}`
}

/** 预制头像配色（确定性：按索引取色，不依赖随机） */
const AVATAR_COLORS: Array<[string, string]> = [
  ['#4f8cff', '#7c5cff'],
  ['#00b3a4', '#3ddc97'],
  ['#ff8a4c', '#ff5c8a'],
  ['#7c5cff', '#c14fff'],
  ['#3ddc97', '#4f8cff'],
  ['#ffb020', '#ff6f3c'],
  ['#5ce1e6', '#4f8cff'],
  ['#c14fff', '#ff5c8a']
]
export function avatarGradient(id: string): [string, string] {
  const idx = AVATAR_PRESETS.indexOf(id)
  return AVATAR_COLORS[(idx < 0 ? 0 : idx) % AVATAR_COLORS.length]
}

/** 头像上传约束 —— 对齐 `avatarUploadInvalidType` / `avatarUploadTooLarge` */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024
export const AVATAR_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

// ==================== 渠道 ====================

/** 7 类接入渠道 —— 对齐 `bindChannel.channel.*` */
export type ChannelKind = 'wecom' | 'feishu' | 'dingtalk' | 'email' | 'qq' | 'wechatBot' | 'wechatMini'

export const CHANNELS: ChannelKind[] = ['wecom', 'feishu', 'dingtalk', 'email', 'qq', 'wechatBot', 'wechatMini']

export function channelNameKey(c: ChannelKind): string {
  return `colleagues.bindChannel.channel.${c}.name`
}
export function channelDescKey(c: ChannelKind): string {
  return `colleagues.bindChannel.channel.${c}.desc`
}

/**
 * 独占渠道 —— 对齐 `bindChannel.colleague.subtitle`「除小程序外，同一渠道同一时间只能由 1 位助理占用」。
 * 小程序是全局共享（绑定后自动关联全部助理），不参与独占。
 */
export function isExclusiveChannel(c: ChannelKind): boolean {
  return c !== 'wechatMini'
}

/** 绑定态 —— 对齐 `channel.{bind,bound,processing,unbound,rebind,unbind}` */
export type ChannelState = 'unbound' | 'bound'

export function channelBindLabelKey(s: ChannelState): string {
  return s === 'bound' ? 'colleagues.bindChannel.channel.bound' : 'colleagues.bindChannel.channel.bind'
}

/** 云助理保留主体 id —— 对齐 `imConfig.tab.assistant`（云助理 IM 是全局单条，不归属某位助理） */
export const CLOUD_SUBJECT = 'cloud'

// ==================== 配额 ====================

export type PlanId = 'trial' | 'youth' | 'standard' | 'advanced' | 'flagship' | 'enterprise'

/** 套餐上限 —— 对齐 `quotaLimit.{trial,youth,standard,advanced,flagship,enterprise}Content` 中的 {limit} */
export const PLAN_LIMITS: Record<PlanId, number> = {
  trial: 1,
  youth: 2,
  standard: 3,
  advanced: 5,
  flagship: 10,
  enterprise: 50
}

export const DEFAULT_PLAN: PlanId = 'standard'

export function quotaContentKey(plan: PlanId | string): string {
  const p = (PLAN_LIMITS as Record<string, number>)[plan] ? plan : 'default'
  return `colleagues.quotaLimit.${p}Content`
}

// ==================== 实体 ====================

/** 数字员工 / 助理 */
export interface Colleague {
  id: string
  /** 助理昵称 —— `createDialog.roleNickname` */
  name: string
  /** 名称 —— `createDialog.name`（用于展示与唯一性校验） */
  displayName: string
  /** 职能（职业）—— 预设 id 或 CUSTOM_ROLE_ID */
  role: string
  /** 助理简介 —— `createDialog.description` */
  description?: string
  /** 协作风格 —— `createDialog.personality` */
  personality?: string
  /** 常用职责 —— `createDialog.responsibility.*` 子集 */
  responsibilities: string[]
  /** 能力标签 —— `colleagues.tag.*` 子集 */
  tags: string[]
  /** 头像 —— 预制 id 或 `data:` URL */
  avatar?: string
  /** 默认模型 —— `createDialog.model.headerTitle` */
  model?: string
  /** 可见范围 */
  visibility: ColleagueVisibility
  /** 运行状态 */
  status: ColleagueStatus
  /** 助理在线 —— `bindChannel.permission.online.title` */
  online: boolean
  /** 置顶 —— `action.pin` / `action.unpin` */
  pinned: boolean
  /** 来源 —— `detail.source`：个人创建 / 雇佣专家 */
  source?: 'personal' | 'expert' | 'enterprise'
  /** 已启用的连接（知识库 / 仓库 / 腾讯文档）—— `detail.connections` */
  connections?: string[]
  createdAt: number
  updatedAt: number
}

/** 渠道绑定 —— 对齐 `bindChannel.channel.*` */
export interface ChannelBinding {
  subject: string
  channel: ChannelKind
  state: ChannelState
  boundAt?: number
}

/** 助理内存记忆开关 —— 对齐 `imConfig.memory.switch.*` */
export interface ColleagueMemory {
  subject: string
  enabled: boolean
  updatedAt: number
}

export function newColleague(patch: Partial<Colleague> = {}): Colleague {
  const now = Date.now()
  return {
    id: patch.id ?? `col_${Math.random().toString(36).slice(2, 10)}`,
    name: patch.name ?? '',
    displayName: patch.displayName ?? '',
    role: patch.role ?? CUSTOM_ROLE_ID,
    description: patch.description,
    personality: patch.personality,
    responsibilities: patch.responsibilities ?? [],
    tags: patch.tags ?? [],
    avatar: patch.avatar,
    model: patch.model,
    visibility: patch.visibility ?? 'personal',
    status: patch.status ?? 'idle',
    online: patch.online ?? true,
    pinned: patch.pinned ?? false,
    source: patch.source ?? 'personal',
    connections: patch.connections ?? [],
    createdAt: patch.createdAt ?? now,
    updatedAt: patch.updatedAt ?? now
  }
}

// ==================== 文案推导 ====================

/** `countLabel` 共 {count} 位助理 */
export function countLabelKey(): string {
  return 'colleagues.countLabel'
}
/** `dashboard.countStatus` {count} 位 · {working} 工作中 */
export function countStatusKey(): string {
  return 'colleagues.dashboard.countStatus'
}
/** `dashboard.workingCount` {count} 助理工作中 */
export function workingCountKey(): string {
  return 'colleagues.dashboard.workingCount'
}
/** `usageLabel` 用量 {usage} */
export function usageLabelKey(): string {
  return 'colleagues.usageLabel'
}

/** IM 状态文案 —— 对齐 `dashboard.imConnected` / `imDisconnected` */
export function imStatusKey(bound: boolean): string {
  return bound ? 'colleagues.dashboard.imConnected' : 'colleagues.dashboard.imDisconnected'
}

/** 上岗天数 —— 对齐 `detail.daysOnDuty`（{days} 天，至少 1） */
export function daysOnDuty(createdAt: number, now = Date.now()): number {
  const days = Math.floor((now - createdAt) / 86400000)
  return days < 1 ? 1 : days
}

/** 相对时间 —— 对齐 `detail.time.{oneHourAgo,oneDayAgo,twoDaysAgo}` 与 `lastActiveFallback` */
export function relativeTimeKey(ts: number, now = Date.now()): string {
  const diff = now - ts
  if (diff < 3600000) return 'colleagues.detail.lastActiveFallback'
  if (diff < 2 * 3600000) return 'colleagues.detail.time.oneHourAgo'
  if (diff < 2 * 86400000) return 'colleagues.detail.time.oneDayAgo'
  if (diff < 3 * 86400000) return 'colleagues.detail.time.twoDaysAgo'
  return 'colleagues.detail.lastActiveFallback'
}

/** 活跃等级（少/多图例）+ 判定，用于热力图分档 */
export const ACTIVITY_LEVELS = 5
export function activityLevel(count: number): number {
  if (count <= 0) return 0
  if (count <= 2) return 1
  if (count <= 5) return 2
  if (count <= 9) return 3
  return 4
}

/** 近一年按天活跃数（确定性：由 id 派生，保证多次渲染一致） */
export function activityHeatmap(id: string, now = Date.now()): number[] {
  let seed = 0
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0
  const days = 364
  const out: number[] = []
  for (let i = 0; i < days; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0
    const r = seed % 100
    // 越靠近今天越活跃（对齐热力图「近一年」的时间衰减观感）
    const recency = i / days
    const threshold = 55 + recency * 30
    out.push(r > threshold ? 0 : (seed % 6) + 1)
  }
  return out
}

export function heatmapTotal(cells: number[]): number {
  return cells.reduce((a, b) => a + b, 0)
}

/** 任务统计 4 项 —— 对齐 `detail.metric.*` */
export function metricLabelKey(k: 'total' | 'inProgress' | 'completed' | 'completionRate'): string {
  return `colleagues.detail.metric.${k}`
}
export function metricDescKey(k: 'total' | 'inProgress' | 'completed' | 'completionRate'): string {
  return `colleagues.detail.metric.${k}Desc`
}

/** 详情页导航 3 段 —— 对齐 `detail.nav.{home,memory,tasks}` */
export type DetailTab = 'home' | 'memory' | 'tasks'
export const DETAIL_TABS: DetailTab[] = ['home', 'memory', 'tasks']
export function detailTabLabelKey(tab: DetailTab): string {
  return `colleagues.detail.nav.${tab}`
}

/** 任务表列 —— 对齐 `detail.taskTable.{id,name,status,source,createdAt,action}` */
export function taskTableColumnKey(c: 'id' | 'name' | 'status' | 'source' | 'createdAt' | 'action'): string {
  return `colleagues.detail.taskTable.${c}`
}

/** 任务状态 —— 对齐 `detail.status.{idle,inProgress,completed}` */
export type TaskStatus = 'idle' | 'inProgress' | 'completed'
export const TASK_STATUSES: TaskStatus[] = ['idle', 'inProgress', 'completed']
export function taskStatusKey(s: TaskStatus): string {
  return `colleagues.detail.status.${s}`
}

/** 委派人 —— 对齐 `detail.you` */
export function delegatorKey(isSelf: boolean): string {
  return isSelf ? 'colleagues.detail.you' : 'colleagues.detail.delegatedBy'
}
