/**
 * 技能域纯计算层 —— 对齐原版 `skills.*`（513 条）。
 *
 * 本模块只做「模型 + 词典 key 推导 + 纯函数」，不碰 Electron / IPC，
 * 便于逻辑冒烟（esbuild ESM）与运行时冒烟共用同一套判定。
 *
 * 关键对齐点：
 * - **六个 Tab**：`tab.{recommend,skillhub,plugins,knot,enterprise,installed}`，
 *   其中 `recommend`/`installed` 为通用能力，其余为不同「来源」市场。
 * - **卡片动作分两态**：未安装 → `card.install`；已安装 → `card.{goChat,enable,
 *   disable,edit,uninstall,pin,unpin}`，且「已安装」徽标 `card.installed` 优先。
 * - **启用/停用即「自动触发」开关**：`toggle.tip.{enable,disable}` 明示这是
 *   「对话中自动判断是否使用」的开关，不是安装/卸载。
 * - **同步五态**：`sync.{localOnly,cloudOnly,synced,localAhead,cloudAhead}`。
 * - **付费三态**：`paidTag` / `purchasedChip{Permanent,Monthly,Pending}` /
 *   `paidExpiredTag`；价格单位 `paidPerMonth`（月）/ `paidPermanent`（无限次）/ `yuan`。
 * - **批量上限**：`batch.limitExceeded` 含 `{limit}`。
 * - 原版自身用桩文案标记未接入能力（云端上传/下载、安全检测、分享、付费），
 *   复刻同样以桩文案对齐，不实现真实链路。
 */

// ==================== 来源与 Tab ====================

/** 技能来源 —— 对齐 `tab.*` 六项 + 已安装内部分组 `installed.group.*` */
export type SkillSource =
  | 'recommend'
  | 'skillhub'
  | 'plugins'
  | 'knot'
  | 'enterprise'
  | 'installed'

/** Tab 顺序 —— 对齐 `tab.*` 键序（推荐 / SkillHub / 套件 / Knot / 企业 Skill / 已安装） */
export const SKILL_TABS: SkillSource[] = ['recommend', 'skillhub', 'plugins', 'knot', 'enterprise', 'installed']

/** Tab 名称 key */
export function tabLabelKey(s: SkillSource): string {
  return `skills.tab.${s}`
}

/** 「套件」在词典里同时有 `tab.plugins`（套件）与 `installed.group.plugins`（套件） */
export function isPluginSource(s: SkillSource): boolean {
  return s === 'plugins'
}

/** 已安装列表内的来源分组 —— 对齐 `installed.group.{custom,market,plugins}` */
export type InstalledGroup = 'custom' | 'market' | 'plugins'

export const INSTALLED_GROUPS: InstalledGroup[] = ['custom', 'market', 'plugins']

export function installedGroupLabelKey(g: InstalledGroup): string {
  return `skills.installed.group.${g}`
}

/** 已安装分组「加载更多」文案 key —— 对齐 `installed.group.loadMore`（含 {remaining}） */
export const INSTALLED_GROUP_LOAD_MORE_KEY = 'skills.installed.group.loadMore'

// ==================== 技能实体 ====================

/** 技能同步状态 —— 对齐 `sync.*` 五态 */
export type SkillSyncState = 'localOnly' | 'cloudOnly' | 'synced' | 'localAhead' | 'cloudAhead'

export const SYNC_STATES: SkillSyncState[] = ['localOnly', 'cloudOnly', 'synced', 'localAhead', 'cloudAhead']

export function syncLabelKey(s: SkillSyncState): string {
  return `skills.sync.${s}`
}

/** 技能付费类型 —— 免费 / 按月 / 永久买断 */
export type SkillPaidKind = 'free' | 'monthly' | 'permanent'

/** 技能实体与指标 —— 复用 types.ts 的持久化/IPC 形状，避免双份定义漂移 */
export type { Skill, SkillMetrics } from './types'
import type { Skill } from './types'

export function emptyMetrics(): NonNullable<Skill['metrics']> {
  return { downloadCount: 0, starCount: 0, useCount: 0, installCount: 0 }
}

// ==================== 安全检测 —— `security.*`（79 条）====================

/** 风险等级 —— 对齐 `security.result.*` / `riskLevel.*` 四档 */
export type SkillRiskLevel = 'safe' | 'low' | 'medium' | 'high'

export const RISK_LEVELS: SkillRiskLevel[] = ['safe', 'low', 'medium', 'high']

/** 检测结论 —— 对齐 `security.result.*` */
export function riskResultKey(r: SkillRiskLevel): string {
  return `skills.security.result.${r}`
}
/** 明细等级 —— 对齐 `riskLevel.*`（与 result.* 同义但独立一族） */
export function riskLevelKey(r: SkillRiskLevel): string {
  return `skills.security.riskLevel.${r}`
}
/** 判定 —— 对齐 `verdict.{white,grey,black}` */
export function riskVerdictKey(r: SkillRiskLevel): string {
  return r === 'safe' || r === 'low' ? 'skills.security.verdict.white' : r === 'medium' ? 'skills.security.verdict.grey' : 'skills.security.verdict.black'
}
/** 风险提示 tooltip —— 对齐 `riskTooltip.*`（含 {desc}），safe 回落 default */
export function riskTooltipKey(r: SkillRiskLevel): string {
  return r === 'high' || r === 'medium' || r === 'low' ? `skills.security.riskTooltip.${r}` : 'skills.security.riskTooltip.default'
}
/** 非高风险 → 可自动安装 —— 对齐 `autoInstall`「非高风险自动安装」 */
export function canAutoInstall(r: SkillRiskLevel): boolean {
  return r !== 'high'
}
/** 高风险 → 企业策略下禁止安装 —— 对齐 `policy.forbidHighRisk` */
export function isHighRisk(r: SkillRiskLevel): boolean {
  return r === 'high'
}
/** 已评估判定 —— 对齐 `evaluatedBy` / `thirdPartySource` / `notEvaluated` */
export function evaluationKey(s: { evaluated: boolean; thirdParty: boolean }): string {
  if (!s.evaluated) return s.thirdParty ? 'skills.security.thirdPartySource' : 'skills.security.notEvaluated'
  return 'skills.security.evaluatedBy'
}

// ==================== 卡片与详情 ====================

/** 卡片可见动作 —— 对齐 `card.*`（未安装 1 个，已安装 7 个） */
export function cardActions(s: Skill): string[] {
  if (!s.installed) return ['install']
  const acts = s.pinned ? ['goChat', 'disable', 'edit', 'uninstall', 'unpin'] : ['goChat', 'disable', 'edit', 'uninstall', 'pin']
  return acts
}

/** 卡片动作文案 key */
export function cardActionLabelKey(a: string): string {
  return `skills.card.${a}`
}

/** 安装态标签 —— 对齐 `card.installed` / `recommend.installed` / `skillhub.installed` / `knot.installed`
 *  注：`plugins` 与 `enterprise` 两个 Tab **没有**独立的 `installed` 键（词典实测），
 *  故统一回落到 `card.installed`。 */
export function installedBadgeKey(source: SkillSource): string {
  if (source === 'installed') return 'skills.card.installed'
  const hasOwn: SkillSource[] = ['recommend', 'skillhub', 'knot']
  return hasOwn.includes(source) ? `skills.${source}.installed` : 'skills.card.installed'
}

/** 安装中标签 —— 同上规则：仅 recommend / skillhub / knot 有独立 key */
export function installingLabelKey(source: SkillSource): string {
  const hasOwn: SkillSource[] = ['recommend', 'skillhub', 'knot']
  return hasOwn.includes(source) ? `skills.${source}.installing` : 'skills.card.install'
}

/** 安装 / 更新按钮文案 —— `recommend`/`skillhub`/`knot` 与 `card` 两族同义 */
export function installLabelKey(source: SkillSource): string {
  const hasOwn: SkillSource[] = ['recommend', 'skillhub', 'knot']
  return hasOwn.includes(source) ? `skills.${source}.install` : 'skills.card.install'
}

/** 安装成功提示（带尾逗号版，通常后接「去对话」）—— 仅三源有 */
export function installSuccessKey(source: SkillSource): string {
  const hasOwn: SkillSource[] = ['recommend', 'skillhub', 'knot']
  return hasOwn.includes(source) ? `skills.${source}.installSuccess` : 'skills.recommend.installSuccess'
}
/** 安装成功提示（无尾逗号） */
export function installSuccessPlainKey(source: SkillSource): string {
  const hasOwn: SkillSource[] = ['recommend', 'skillhub', 'knot']
  return hasOwn.includes(source) ? `skills.${source}.installSuccessPlain` : 'skills.recommend.installSuccessPlain'
}

/** 指标文案 key —— 卡片态与详情态两族（同一数值，文案不同） */
export function cardMetricLabelKey(m: 'downloads' | 'stars' | 'useCount' | 'installCount'): string {
  return `skills.card.${m}`
}
export function detailMetricLabelKey(m: 'version' | 'useCount' | 'installCount' | 'downloadCount' | 'starCount' | 'author'): string {
  return `skills.detail.metric${m[0].toUpperCase()}${m.slice(1)}`
}

/** 数字紧凑格式（1.2k / 3.4w）—— 复刻指标展示（原文未给规则，取常见做法） */
export function compactCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')}w`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

// ==================== 启用 / 停用（自动触发）====================

/** 开关提示 key —— 对齐 `toggle.tip.{enable,disable}` */
export function toggleTipKey(nextEnabled: boolean): string {
  return `skills.toggle.tip.${nextEnabled ? 'enable' : 'disable'}`
}

/** 启用超阈值警告阈值 —— 对齐 `enabledWarning`「超过 80 个技能」 */
export const ENABLED_WARNING_THRESHOLD = 80

export function shouldWarnEnabled(count: number): boolean {
  return count > ENABLED_WARNING_THRESHOLD
}

// ==================== 搜索与排序 ====================

/** 内置排序 —— 对齐 `builtin.sort.*` 四项 */
export type SkillSortKey = 'score' | 'useCount' | 'installCount' | 'updatedAt'

export const SKILL_SORTS: SkillSortKey[] = ['score', 'useCount', 'installCount', 'updatedAt']

export function sortLabelKey(s: SkillSortKey): string {
  return `skills.builtin.sort.${s}`
}

/** 按排序键排列（纯函数，稳定） */
export function sortSkills(list: Skill[], sort: SkillSortKey): Skill[] {
  const arr = [...list]
  switch (sort) {
    case 'useCount':
      return arr.sort((a, b) => b.metrics.useCount - a.metrics.useCount)
    case 'installCount':
      return arr.sort((a, b) => b.metrics.installCount - a.metrics.installCount)
    case 'updatedAt':
      return arr.sort((a, b) => b.updatedAt - a.updatedAt)
    case 'score':
    default:
      // 综合：置顶优先 → 使用量 + 安装量加权
      return arr.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        const sa = a.metrics.useCount * 2 + a.metrics.installCount
        const sb = b.metrics.useCount * 2 + b.metrics.installCount
        return sb - sa
      })
  }
}

/** 名称/描述模糊匹配 —— 对齐 `searchPlaceholder` / `searchNoMatch.title`（大小写不敏感） */
export function matchesQuery(s: Skill, q: string): boolean {
  const k = q.trim().toLowerCase()
  if (!k) return true
  return s.name.toLowerCase().includes(k) || (s.description ?? '').toLowerCase().includes(k)
}

/** 分类筛选 —— 对齐 `knot.allCategories` / `recommend.allTags`「全部」 */
export const ALL_FILTER = 'all'

export function filterByTag(list: Skill[], tag: string): Skill[] {
  if (tag === ALL_FILTER || !tag) return list
  return list.filter((s) => (s.tags ?? []).includes(tag))
}

// ==================== 批量管理 ====================

/** 批量操作上限 —— 对齐 `batch.limitExceeded` 含 {limit} */
export const BATCH_LIMIT = 50

export function canBatchSelect(current: number, adding = 1): boolean {
  return current + adding <= BATCH_LIMIT
}

/** 批量操作项 —— 对齐 `batch.{uninstall,enable,disable,uploadToCloud}` */
export type BatchAction = 'uninstall' | 'enable' | 'disable' | 'uploadToCloud'

export const BATCH_ACTIONS: BatchAction[] = ['uninstall', 'enable', 'disable', 'uploadToCloud']

export function batchActionLabelKey(a: BatchAction): string {
  return `skills.batch.${a}`
}
/** 批量结果提示 —— 对齐 `batch.{uninstallSuccess,enableSuccess,disableSuccess}`（含 {count}） */
export function batchResultKey(a: BatchAction): string {
  return a === 'enable'
    ? 'skills.batch.enableSuccess'
    : a === 'disable'
      ? 'skills.batch.disableSuccess'
      : 'skills.batch.uninstallSuccess'
}

/** 批量全选 / 清空 —— 对齐 `batch.{selectAll,deselectAll}` */
export const BATCH_SELECT_ALL_KEY = 'skills.batch.selectAll'
export const BATCH_DESELECT_ALL_KEY = 'skills.batch.deselectAll'
/** 已选计数 —— 对齐 `batch.selected`（{count}） */
export const BATCH_SELECTED_KEY = 'skills.batch.selected'
/** 部分失败 —— 对齐 `batch.togglePartialFailed`（{names}） */
export const BATCH_PARTIAL_FAILED_KEY = 'skills.batch.togglePartialFailed'

// ==================== 云端同步 ====================

/** 上传/下载方向 —— 对齐 `cloud.action.*` */
export function cloudActionKey(s: Skill): string {
  if (s.sync === 'localOnly') return 'skills.cloud.action.upload'
  if (s.sync === 'localAhead') return 'skills.cloud.action.update'
  if (s.sync === 'cloudOnly') return 'skills.cloud.action.download'
  if (s.sync === 'cloudAhead') return 'skills.cloud.action.updateLocal'
  return 'skills.cloud.status.uploadedTooltip'
}

/** 是否可上传到云端 —— 仅本地有内容且未同步时 */
export function canUploadToCloud(s: Skill): boolean {
  return s.sync === 'localOnly' || s.sync === 'localAhead'
}
/** 是否可下载到本地 —— 仅云端有内容而本地缺失/落后时 */
export function canDownloadToLocal(s: Skill): boolean {
  return s.sync === 'cloudOnly' || s.sync === 'cloudAhead'
}

// ==================== 付费 ====================

/** 付费标签 key —— 对齐 `paidTag` / `paidExpiredTag` / 已购三态 */
export function paidBadgeKey(s: Skill, now = Date.now()): string {
  if (s.paidKind === 'free') return ''
  if (s.purchasedAt) {
    if (s.paidKind === 'monthly') {
      return s.purchasedUntil && s.purchasedUntil > now
        ? 'skills.purchasedChipMonthly'
        : 'skills.paidExpiredTag'
    }
    return 'skills.purchasedChipPermanent'
  }
  return 'skills.paidTag'
}

/** 是否已购（含未过期） */
export function isPurchased(s: Skill, now = Date.now()): boolean {
  if (s.paidKind === 'free') return true
  if (!s.purchasedAt) return false
  if (s.paidKind === 'monthly') return Boolean(s.purchasedUntil && s.purchasedUntil > now)
  return true
}

/** 是否已到期 */
export function isExpired(s: Skill, now = Date.now()): boolean {
  return s.paidKind === 'monthly' && Boolean(s.purchasedAt) && Boolean(s.purchasedUntil && s.purchasedUntil <= now)
}

/** 可退款次数上限 —— 对齐 `refund.confirmBody`「退款3次后将无法再次购买」 */
export const REFUND_LIMIT = 3

export function canRefund(s: Skill): boolean {
  return s.paidKind !== 'free' && Boolean(s.purchasedAt) && (s.refundCount ?? 0) < REFUND_LIMIT
}

/** 价格展示 —— 对齐 `paidPerMonth` / `paidPermanent` / `yuan` */
export function priceLabel(s: Skill): string {
  if (s.paidKind === 'free' || s.price === undefined) return ''
  return s.paidKind === 'monthly' ? `${s.price} 元 / 月` : `${s.price} 元 · 无限次`
}

/** 已购到期文案 key —— 对齐 `purchasedChipMonthly`（含 {date}） */
export const PURCHASED_MONTHLY_KEY = 'skills.purchasedChipMonthly'
export const PURCHASED_PERMANENT_KEY = 'skills.purchasedChipPermanent'
export const PURCHASED_PENDING_KEY = 'skills.purchasedChipPending'
export const BUY_SKILL_KEY = 'skills.buySkill'
export const PAID_TAG_KEY = 'skills.paidTag'
export const PAID_EXPIRED_TAG_KEY = 'skills.paidExpiredTag'

// ==================== 上传导入 ====================

/** 支持的导入类型 —— 对齐 `upload.modal.{typeFolder,requirementFolder,requirementMd,requirementZip}` */
export const UPLOAD_ACCEPT_FOLDER = 'folder'
export const UPLOAD_ACCEPT_ZIP = 'zip'
export const UPLOAD_ACCEPT_MD = 'md'

export const UPLOAD_REQUIREMENTS: string[] = [
  'skills.upload.modal.requirementFolder',
  'skills.upload.modal.requirementMd',
  'skills.upload.modal.requirementZip'
]

/** 上传策略拒绝 key —— 对齐 `upload.policy.*` */
export function uploadPolicyKey(reason: 'disabled' | 'notInWhitelist' | 'inBlacklist' | 'invalidMode'): string {
  return `skills.upload.policy.${reason}`
}

// ==================== 分享 ====================

/** 分享门禁 —— 对齐 `share.gate.*` 六态 */
export type ShareGate = 'passed' | 'pending' | 'blocked' | 'failed' | 'unsupportedSource' | 'flowPending'

export function shareGateKey(g: ShareGate): string {
  return `skills.share.gate.${g}`
}

/** 分享步骤 —— 对齐 `share.step.*`（上传 → 安全检测 → 生成链接） */
export const SHARE_STEPS: string[] = ['upload', 'securityCheck', 'createLink']

export function shareStepLabelKey(s: string): string {
  return `skills.share.step.${s}`
}

/** 分享渠道 —— 对齐 `share.channel.miniProgramCode`（小程序码） */
export function shareChannelKey(c: 'miniProgramCode'): string {
  return `skills.share.channel.${c}`
}

// ==================== 实体构造 ====================

export function newSkill(patch: Partial<Skill> = {}): Skill {
  const now = Date.now()
  return {
    id: `skill_${Math.random().toString(36).slice(2, 10)}`,
    name: '未命名技能',
    source: 'installed',
    installedGroup: 'custom',
    installed: true,
    enabled: true,
    pinned: false,
    builtin: false,
    needsApiKey: false,
    apiKeyConfigured: false,
    sync: 'localOnly',
    cloudAvailable: false,
    paidKind: 'free',
    refundCount: 0,
    riskLevel: 'safe',
    metrics: emptyMetrics(),
    createdAt: now,
    updatedAt: now,
    ...patch
  }
}

// ==================== 技能选择器 ====================

/** 选择器空态文案 key —— 按来源分族（对齐 `picker.empty.*`） */
export function pickerEmptyKey(source: SkillSource): string {
  const known: SkillSource[] = ['recommend', 'skillhub', 'plugins', 'knot', 'installed']
  return known.includes(source) ? `skills.picker.empty.${source}` : 'skills.picker.empty'
}

/** 选择器计数 —— 对齐 `picker.selectedCount`（{count}） */
export const PICKER_SELECTED_KEY = 'skills.picker.selectedCount'
export const PICKER_TITLE_KEY = 'skills.picker.title'
export const PICKER_SEARCH_KEY = 'skills.picker.searchPlaceholder'
export const PICKER_NO_RESULT_KEY = 'skills.picker.noResult'

// ==================== 详情页 ====================

/** 详情分段 —— 对齐 `detail.overview.title` / `detail.examples.title` / `detail.usedCases.title` */
export const DETAIL_SECTIONS: string[] = ['overview', 'examples', 'usedCases']

export function detailSectionTitleKey(s: string): string {
  return `skills.detail.${s}.title`
}

/** 概述搜索 —— 对齐 `detail.overview.search.{tooltip,placeholder}`（⌘F / Ctrl+F） */
export const OVERVIEW_SEARCH_TOOLTIP_KEY = 'skills.detail.overview.search.tooltip'
export const OVERVIEW_SEARCH_PLACEHOLDER_KEY = 'skills.detail.overview.search.placeholder'
/** 自动翻译提示 —— 对齐 `detail.overview.translation.{zhFromEn,enFromZh}` */
export function translationNoticeKey(from: 'en' | 'zh'): string {
  return from === 'en' ? 'skills.detail.overview.translation.zhFromEn' : 'skills.detail.overview.translation.enFromZh'
}
/** 一键做同款 / 返回技能详情 —— 对齐 `detail.usedCases.{replicate,backToSkill}` */
export const REPLICATE_KEY = 'skills.detail.usedCases.replicate'
export const BACK_TO_SKILL_KEY = 'skills.detail.usedCases.backToSkill'

// ==================== 顶层动作 ====================

export const SKILLS_ENTRY_KEY = 'skills.entry'
export const SKILLS_TITLE_KEY = 'skills.title'
export const SKILLS_SUBTITLE_KEY = 'skills.subtitle'
export const SKILLS_SEARCH_KEY = 'skills.searchPlaceholder'
export const SKILLS_BATCH_MANAGE_KEY = 'skills.batchManage'
export const SKILLS_BACK_TO_ALL_KEY = 'skills.backToAll'
export const SKILLS_SHOW_MORE_KEY = 'skills.showMore'
export const SKILLS_SHOW_LESS_KEY = 'skills.showLess'
export const SKILLS_UNINSTALL_KEY = 'skills.uninstall'
export const SKILLS_TRY_NOW_KEY = 'skills.tryNow'
export const SKILLS_ENABLED_WARNING_KEY = 'skills.enabledWarning'
export const SKILLS_CREATE_BUTTON_KEY = 'skills.create.button'
export const SKILLS_CREATE_PROMPT_KEY = 'skills.create.examplePrompt'
export const SKILLS_FIND_BUTTON_KEY = 'skills.find.button'
export const SKILLS_FIND_PROMPT_KEY = 'skills.find.examplePrompt'
export const SKILLS_DELETE_TITLE_KEY = 'skills.delete.title'
export const SKILLS_DELETE_CONTENT_KEY = 'skills.delete.content'

// ==================== 统计 ====================

/** 按来源分组统计（用于 Tab 徽标） */
export function countBySource(list: Skill[]): Record<SkillSource, number> {
  const out = { recommend: 0, skillhub: 0, plugins: 0, knot: 0, enterprise: 0, installed: 0 } as Record<SkillSource, number>
  for (const s of list) out[s.source] = (out[s.source] ?? 0) + 1
  return out
}
