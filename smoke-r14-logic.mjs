/**
 * 第十四轮逻辑冒烟 —— `shared/skill.ts` 纯计算层 + 面板静态断言。
 * 运行：node smoke-r14-logic.mjs
 * 依赖前置：node smoke-r14-logic-prep.mjs
 */
import fs from 'node:fs'
import * as S from './.smoke-skill.mjs'

let pass = 0
let fail = 0
function ok(name, cond, extra) {
  if (cond) {
    pass++
    console.log('  ✓ ' + name)
  } else {
    fail++
    console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : ''))
  }
}
function eq(name, actual, expected) {
  ok(name, actual === expected, { actual, expected })
}

console.log('\n[第十四轮逻辑冒烟 · 技能市场 / 技能管理域]')

// ---------- 1. Tab 与来源 ----------
console.log('\n-- Tab 与来源 --')
eq('六 Tab 顺序', S.SKILL_TABS.join(','), 'recommend,skillhub,plugins,knot,enterprise,installed')
eq('recommend 标签', S.tabLabelKey('recommend'), 'skills.tab.recommend')
eq('skillhub 标签', S.tabLabelKey('skillhub'), 'skills.tab.skillhub')
eq('plugins 标签', S.tabLabelKey('plugins'), 'skills.tab.plugins')
eq('knot 标签', S.tabLabelKey('knot'), 'skills.tab.knot')
eq('enterprise 标签', S.tabLabelKey('enterprise'), 'skills.tab.enterprise')
eq('installed 标签', S.tabLabelKey('installed'), 'skills.tab.installed')
ok('plugins 识别', S.isPluginSource('plugins') && !S.isPluginSource('knot'))

// ---------- 2. 已安装分组 ----------
console.log('\n-- 已安装分组 --')
eq('三分组', S.INSTALLED_GROUPS.join(','), 'custom,market,plugins')
eq('custom 文案', S.installedGroupLabelKey('custom'), 'skills.installed.group.custom')
eq('market 文案', S.installedGroupLabelKey('market'), 'skills.installed.group.market')
eq('plugins 文案', S.installedGroupLabelKey('plugins'), 'skills.installed.group.plugins')
eq('加载更多 key', S.INSTALLED_GROUP_LOAD_MORE_KEY, 'skills.installed.group.loadMore')

// ---------- 3. 同步态 ----------
console.log('\n-- 同步五态 --')
eq('五态齐全', S.SYNC_STATES.join(','), 'localOnly,cloudOnly,synced,localAhead,cloudAhead')
eq('localOnly', S.syncLabelKey('localOnly'), 'skills.sync.localOnly')
eq('cloudOnly', S.syncLabelKey('cloudOnly'), 'skills.sync.cloudOnly')
eq('synced', S.syncLabelKey('synced'), 'skills.sync.synced')
eq('localAhead', S.syncLabelKey('localAhead'), 'skills.sync.localAhead')
eq('cloudAhead', S.syncLabelKey('cloudAhead'), 'skills.sync.cloudAhead')

// ---------- 4. 安全检测 ----------
console.log('\n-- 安全检测 --')
eq('四档齐', S.RISK_LEVELS.join(','), 'safe,low,medium,high')
eq('result.safe', S.riskResultKey('safe'), 'skills.security.result.safe')
eq('result.high', S.riskResultKey('high'), 'skills.security.result.high')
eq('riskLevel.medium', S.riskLevelKey('medium'), 'skills.security.riskLevel.medium')
eq('verdict safe→white', S.riskVerdictKey('safe'), 'skills.security.verdict.white')
eq('verdict low→white', S.riskVerdictKey('low'), 'skills.security.verdict.white')
eq('verdict medium→grey', S.riskVerdictKey('medium'), 'skills.security.verdict.grey')
eq('verdict high→black', S.riskVerdictKey('high'), 'skills.security.verdict.black')
eq('tooltip.high', S.riskTooltipKey('high'), 'skills.security.riskTooltip.high')
eq('tooltip.safe→default', S.riskTooltipKey('safe'), 'skills.security.riskTooltip.default')
ok('非高风险可自动装', S.canAutoInstall('safe') && S.canAutoInstall('medium') && !S.canAutoInstall('high'))
ok('high 为高风险', S.isHighRisk('high') && !S.isHighRisk('medium'))
eq('已评估', S.evaluationKey({ evaluated: true, thirdParty: false }), 'skills.security.evaluatedBy')
eq('第三方未评估', S.evaluationKey({ evaluated: false, thirdParty: true }), 'skills.security.thirdPartySource')
eq('官方未评估', S.evaluationKey({ evaluated: false, thirdParty: false }), 'skills.security.notEvaluated')

// ---------- 5. 卡片动作两态 ----------
console.log('\n-- 卡片动作 --')
const mk = (p) => S.newSkill(p)
eq('未安装仅 install', S.cardActions(mk({ installed: false })).join(','), 'install')
eq('已装未置顶含 pin', S.cardActions(mk({ installed: true, pinned: false })).join(','), 'goChat,disable,edit,uninstall,pin')
eq('已装置顶含 unpin', S.cardActions(mk({ installed: true, pinned: true })).join(','), 'goChat,disable,edit,uninstall,unpin')
eq('动作文案 goChat', S.cardActionLabelKey('goChat'), 'skills.card.goChat')
eq('动作文案 unpin', S.cardActionLabelKey('unpin'), 'skills.card.unpin')

// ---------- 6. 来源不对称回落（易错点） ----------
console.log('\n-- 来源不对称回落 --')
eq('recommend 有自有 installed', S.installedBadgeKey('recommend'), 'skills.recommend.installed')
eq('skillhub 有自有 installed', S.installedBadgeKey('skillhub'), 'skills.skillhub.installed')
eq('knot 有自有 installed', S.installedBadgeKey('knot'), 'skills.knot.installed')
eq('plugins 回落 card.installed', S.installedBadgeKey('plugins'), 'skills.card.installed')
eq('enterprise 回落 card.installed', S.installedBadgeKey('enterprise'), 'skills.card.installed')
eq('installed Tab 回落 card.installed', S.installedBadgeKey('installed'), 'skills.card.installed')
eq('plugins installing 回落 card.install', S.installingLabelKey('plugins'), 'skills.card.install')
eq('knot installing 自有', S.installingLabelKey('knot'), 'skills.knot.installing')
eq('enterprise install 回落 card.install', S.installLabelKey('enterprise'), 'skills.card.install')
eq('skillhub install 自有', S.installLabelKey('skillhub'), 'skills.skillhub.install')
eq('enterprise 成功提示回落到 recommend', S.installSuccessKey('enterprise'), 'skills.recommend.installSuccess')
eq('knot 成功提示自有', S.installSuccessKey('knot'), 'skills.knot.installSuccess')
eq('enterprise plain 回落', S.installSuccessPlainKey('enterprise'), 'skills.recommend.installSuccessPlain')

// ---------- 7. 指标文案两族 ----------
console.log('\n-- 指标文案 --')
eq('卡片 downloads', S.cardMetricLabelKey('downloads'), 'skills.card.downloads')
eq('卡片 installCount', S.cardMetricLabelKey('installCount'), 'skills.card.installCount')
eq('详情 metricVersion', S.detailMetricLabelKey('version'), 'skills.detail.metricVersion')
eq('详情 metricUseCount', S.detailMetricLabelKey('useCount'), 'skills.detail.metricUseCount')
eq('详情 metricAuthor', S.detailMetricLabelKey('author'), 'skills.detail.metricAuthor')
eq('详情 metricStarCount', S.detailMetricLabelKey('starCount'), 'skills.detail.metricStarCount')

// ---------- 8. 紧凑计数 ----------
console.log('\n-- 紧凑计数 --')
eq('个位', S.compactCount(7), '7')
eq('千位', S.compactCount(1200), '1.2k')
eq('万位', S.compactCount(34000), '3.4w')
eq('正好千', S.compactCount(2000), '2k')
eq('正好万', S.compactCount(50000), '5w')

// ---------- 9. 自动触发开关 ----------
console.log('\n-- 自动触发（启用/停用） --')
eq('开启提示', S.toggleTipKey(true), 'skills.toggle.tip.enable')
eq('关闭提示', S.toggleTipKey(false), 'skills.toggle.tip.disable')
eq('阈值为 80', S.ENABLED_WARNING_THRESHOLD, 80)
ok('80 不告警', !S.shouldWarnEnabled(80))
ok('81 告警', S.shouldWarnEnabled(81))

// ---------- 10. 排序 ----------
console.log('\n-- 排序 --')
eq('四种排序', S.SKILL_SORTS.join(','), 'score,useCount,installCount,updatedAt')
eq('排序文案 综合', S.sortLabelKey('score'), 'skills.builtin.sort.score')
eq('排序文案 最新', S.sortLabelKey('updatedAt'), 'skills.builtin.sort.updatedAt')
const a = mk({ id: 'a', name: 'A', metrics: { downloadCount: 0, starCount: 0, useCount: 5, installCount: 1 }, updatedAt: 300 })
const b = mk({ id: 'b', name: 'B', metrics: { downloadCount: 0, starCount: 0, useCount: 50, installCount: 2 }, updatedAt: 100 })
const c = mk({ id: 'c', name: 'C', metrics: { downloadCount: 0, starCount: 0, useCount: 1, installCount: 90 }, updatedAt: 200 })
eq('按使用量', S.sortSkills([a, b, c], 'useCount').map((x) => x.id).join(','), 'b,a,c')
eq('按安装量', S.sortSkills([a, b, c], 'installCount').map((x) => x.id).join(','), 'c,b,a')
eq('按更新时间', S.sortSkills([a, b, c], 'updatedAt').map((x) => x.id).join(','), 'a,c,b')
eq('综合（使用量×2+安装量）', S.sortSkills([a, b, c], 'score').map((x) => x.id).join(','), 'b,c,a')
const pinnedLow = mk({ id: 'p', pinned: true, metrics: { downloadCount: 0, starCount: 0, useCount: 0, installCount: 0 } })
eq('综合置顶优先', S.sortSkills([b, pinnedLow], 'score').map((x) => x.id).join(','), 'p,b')
ok('不改原数组', (() => { const arr = [a, b]; S.sortSkills(arr, 'useCount'); return arr[0].id === 'a' })())

// ---------- 11. 搜索与筛选 ----------
console.log('\n-- 搜索与筛选 --')
ok('名称命中', S.matchesQuery(mk({ name: 'PDF 解析' }), 'pdf'))
ok('描述命中', S.matchesQuery(mk({ name: 'X', description: '处理 PDF 的' }), 'pdf'))
ok('空查询恒真', S.matchesQuery(mk({ name: 'X' }), '   '))
ok('不命中', !S.matchesQuery(mk({ name: 'X', description: 'Y' }), 'zzz'))
eq('全部筛选常量', S.ALL_FILTER, 'all')
const t1 = mk({ id: 't1', tags: ['a', 'b'] })
const t2 = mk({ id: 't2', tags: ['b'] })
eq('标签筛选', S.filterByTag([t1, t2], 'a').map((x) => x.id).join(','), 't1')
eq('全部返回全量', S.filterByTag([t1, t2], 'all').length, 2)

// ---------- 12. 批量管理 ----------
console.log('\n-- 批量管理 --')
eq('上限 50', S.BATCH_LIMIT, 50)
ok('50 可加', S.canBatchSelect(49))
ok('50 不可再加', !S.canBatchSelect(50))
eq('四动作', S.BATCH_ACTIONS.join(','), 'uninstall,enable,disable,uploadToCloud')
eq('批量文案 uninstall', S.batchActionLabelKey('uninstall'), 'skills.batch.uninstall')
eq('批量文案 uploadToCloud', S.batchActionLabelKey('uploadToCloud'), 'skills.batch.uploadToCloud')
eq('结果卸载', S.batchResultKey('uninstall'), 'skills.batch.uninstallSuccess')
eq('结果开启', S.batchResultKey('enable'), 'skills.batch.enableSuccess')
eq('结果关闭', S.batchResultKey('disable'), 'skills.batch.disableSuccess')
eq('上传云端不产生 toggle 结果', S.batchResultKey('uploadToCloud'), 'skills.batch.uninstallSuccess')
eq('全选 key', S.BATCH_SELECT_ALL_KEY, 'skills.batch.selectAll')
eq('清空 key', S.BATCH_DESELECT_ALL_KEY, 'skills.batch.deselectAll')
eq('已选 key', S.BATCH_SELECTED_KEY, 'skills.batch.selected')
eq('部分失败 key', S.BATCH_PARTIAL_FAILED_KEY, 'skills.batch.togglePartialFailed')

// ---------- 13. 云端同步 ----------
console.log('\n-- 云端同步 --')
const local = mk({ sync: 'localOnly' })
const localAhead = mk({ sync: 'localAhead' })
const cloudOnly = mk({ sync: 'cloudOnly' })
const cloudAhead = mk({ sync: 'cloudAhead' })
const synced = mk({ sync: 'synced' })
eq('localOnly → 上传', S.cloudActionKey(local), 'skills.cloud.action.upload')
eq('localAhead → 更新云端', S.cloudActionKey(localAhead), 'skills.cloud.action.update')
eq('cloudOnly → 下载', S.cloudActionKey(cloudOnly), 'skills.cloud.action.download')
eq('cloudAhead → 更新本地', S.cloudActionKey(cloudAhead), 'skills.cloud.action.updateLocal')
eq('synced → 已上传提示', S.cloudActionKey(synced), 'skills.cloud.status.uploadedTooltip')
ok('可上传', S.canUploadToCloud(local) && S.canUploadToCloud(localAhead))
ok('不可上传', !S.canUploadToCloud(cloudOnly) && !S.canUploadToCloud(synced))
ok('可下载', S.canDownloadToLocal(cloudOnly) && S.canDownloadToLocal(cloudAhead))
ok('不可下载', !S.canDownloadToLocal(local) && !S.canDownloadToLocal(synced))

// ---------- 14. 付费三态 ----------
console.log('\n-- 付费 --')
const now = 1_700_000_000_000
const free = mk({ paidKind: 'free' })
const paidUnbought = mk({ paidKind: 'monthly', price: 19 })
const monthlyOk = mk({ paidKind: 'monthly', price: 19, purchasedAt: now - 1000, purchasedUntil: now + 86400000 })
const monthlyExpired = mk({ paidKind: 'monthly', price: 19, purchasedAt: now - 86400000 * 40, purchasedUntil: now - 1000 })
const permanent = mk({ paidKind: 'permanent', price: 99, purchasedAt: now - 1000 })
eq('免费无徽标', S.paidBadgeKey(free, now), '')
eq('未购 → 付费标签', S.paidBadgeKey(paidUnbought, now), 'skills.paidTag')
eq('月内有效 → 有效期文案', S.paidBadgeKey(monthlyOk, now), 'skills.purchasedChipMonthly')
eq('月已过期 → 已到期', S.paidBadgeKey(monthlyExpired, now), 'skills.paidExpiredTag')
eq('永久 → 无限次', S.paidBadgeKey(permanent, now), 'skills.purchasedChipPermanent')
ok('免费视为已购', S.isPurchased(free, now))
ok('未购非已购', !S.isPurchased(paidUnbought, now))
ok('月内有效即已购', S.isPurchased(monthlyOk, now))
ok('月过期非已购', !S.isPurchased(monthlyExpired, now))
ok('永久即已购', S.isPurchased(permanent, now))
ok('月过期标记', S.isExpired(monthlyExpired, now) && !S.isExpired(monthlyOk, now))
eq('退款上限 3', S.REFUND_LIMIT, 3)
ok('已购可退', S.canRefund(monthlyOk))
ok('未购不可退', !S.canRefund(paidUnbought))
ok('免费不可退', !S.canRefund(free))
ok('退满 3 次不可退', !S.canRefund({ ...permanent, refundCount: 3 }))
ok('退 2 次仍可退', S.canRefund({ ...permanent, refundCount: 2 }))
eq('月价展示', S.priceLabel(monthlyOk), '19 元 / 月')
eq('永久价展示', S.priceLabel(permanent), '99 元 · 无限次')
eq('免费无价', S.priceLabel(free), '')
eq('月 chip key', S.PURCHASED_MONTHLY_KEY, 'skills.purchasedChipMonthly')
eq('永久 chip key', S.PURCHASED_PERMANENT_KEY, 'skills.purchasedChipPermanent')
eq('待购 chip key', S.PURCHASED_PENDING_KEY, 'skills.purchasedChipPending')
eq('购买 key', S.BUY_SKILL_KEY, 'skills.buySkill')
eq('付费标签 key', S.PAID_TAG_KEY, 'skills.paidTag')
eq('已到期 key', S.PAID_EXPIRED_TAG_KEY, 'skills.paidExpiredTag')

// ---------- 15. 导入 ----------
console.log('\n-- 导入 --')
eq('接受文件夹', S.UPLOAD_ACCEPT_FOLDER, 'folder')
eq('接受 zip', S.UPLOAD_ACCEPT_ZIP, 'zip')
eq('接受 md', S.UPLOAD_ACCEPT_MD, 'md')
eq('三条文件要求', S.UPLOAD_REQUIREMENTS.length, 3)
ok('要求含文件夹', S.UPLOAD_REQUIREMENTS.includes('skills.upload.modal.requirementFolder'))
ok('要求含 md', S.UPLOAD_REQUIREMENTS.includes('skills.upload.modal.requirementMd'))
ok('要求含 zip', S.UPLOAD_REQUIREMENTS.includes('skills.upload.modal.requirementZip'))
eq('策略 disabled', S.uploadPolicyKey('disabled'), 'skills.upload.policy.disabled')
eq('策略 notInWhitelist', S.uploadPolicyKey('notInWhitelist'), 'skills.upload.policy.notInWhitelist')
eq('策略 inBlacklist', S.uploadPolicyKey('inBlacklist'), 'skills.upload.policy.inBlacklist')
eq('策略 invalidMode', S.uploadPolicyKey('invalidMode'), 'skills.upload.policy.invalidMode')

// ---------- 16. 分享 ----------
console.log('\n-- 分享 --')
eq('门禁通过', S.shareGateKey('passed'), 'skills.share.gate.passed')
eq('门禁待定', S.shareGateKey('pending'), 'skills.share.gate.pending')
eq('门禁阻断', S.shareGateKey('blocked'), 'skills.share.gate.blocked')
eq('门禁失败', S.shareGateKey('failed'), 'skills.share.gate.failed')
eq('门禁不支持来源', S.shareGateKey('unsupportedSource'), 'skills.share.gate.unsupportedSource')
eq('门禁流程中', S.shareGateKey('flowPending'), 'skills.share.gate.flowPending')
eq('三步分享', S.SHARE_STEPS.join(','), 'upload,securityCheck,createLink')
eq('步骤上传', S.shareStepLabelKey('upload'), 'skills.share.step.upload')
eq('步骤安全检测', S.shareStepLabelKey('securityCheck'), 'skills.share.step.securityCheck')
eq('步骤生成链接', S.shareStepLabelKey('createLink'), 'skills.share.step.createLink')
eq('渠道小程序码', S.shareChannelKey('miniProgramCode'), 'skills.share.channel.miniProgramCode')

// ---------- 17. 选择器 ----------
console.log('\n-- 选择器 --')
eq('按来源空态 recommend', S.pickerEmptyKey('recommend'), 'skills.picker.empty.recommend')
eq('按来源空态 enterprise 回落', S.pickerEmptyKey('enterprise'), 'skills.picker.empty')
eq('计数 key', S.PICKER_SELECTED_KEY, 'skills.picker.selectedCount')
eq('标题 key', S.PICKER_TITLE_KEY, 'skills.picker.title')
eq('搜索 key', S.PICKER_SEARCH_KEY, 'skills.picker.searchPlaceholder')
eq('无结果 key', S.PICKER_NO_RESULT_KEY, 'skills.picker.noResult')

// ---------- 18. 详情 ----------
console.log('\n-- 详情 --')
eq('三段', S.DETAIL_SECTIONS.join(','), 'overview,examples,usedCases')
eq('概述标题', S.detailSectionTitleKey('overview'), 'skills.detail.overview.title')
eq('案例标题', S.detailSectionTitleKey('usedCases'), 'skills.detail.usedCases.title')
eq('概述搜索 tooltip', S.OVERVIEW_SEARCH_TOOLTIP_KEY, 'skills.detail.overview.search.tooltip')
eq('概述搜索 placeholder', S.OVERVIEW_SEARCH_PLACEHOLDER_KEY, 'skills.detail.overview.search.placeholder')
eq('英译中提示', S.translationNoticeKey('en'), 'skills.detail.overview.translation.zhFromEn')
eq('中译英提示', S.translationNoticeKey('zh'), 'skills.detail.overview.translation.enFromZh')
eq('一键做同款', S.REPLICATE_KEY, 'skills.detail.usedCases.replicate')
eq('返回技能详情', S.BACK_TO_SKILL_KEY, 'skills.detail.usedCases.backToSkill')

// ---------- 19. 顶层常量 ----------
console.log('\n-- 顶层常量 --')
eq('入口', S.SKILLS_ENTRY_KEY, 'skills.entry')
eq('标题', S.SKILLS_TITLE_KEY, 'skills.title')
eq('副标题', S.SKILLS_SUBTITLE_KEY, 'skills.subtitle')
eq('搜索占位', S.SKILLS_SEARCH_KEY, 'skills.searchPlaceholder')
eq('批量管理', S.SKILLS_BATCH_MANAGE_KEY, 'skills.batchManage')
eq('返回全部技能', S.SKILLS_BACK_TO_ALL_KEY, 'skills.backToAll')
eq('显示更多', S.SKILLS_SHOW_MORE_KEY, 'skills.showMore')
eq('收起', S.SKILLS_SHOW_LESS_KEY, 'skills.showLess')
eq('卸载', S.SKILLS_UNINSTALL_KEY, 'skills.uninstall')
eq('去试试', S.SKILLS_TRY_NOW_KEY, 'skills.tryNow')
eq('启用告警', S.SKILLS_ENABLED_WARNING_KEY, 'skills.enabledWarning')
eq('创建按钮', S.SKILLS_CREATE_BUTTON_KEY, 'skills.create.button')
eq('创建示例', S.SKILLS_CREATE_PROMPT_KEY, 'skills.create.examplePrompt')
eq('查找按钮', S.SKILLS_FIND_BUTTON_KEY, 'skills.find.button')
eq('查找示例', S.SKILLS_FIND_PROMPT_KEY, 'skills.find.examplePrompt')
eq('删除标题', S.SKILLS_DELETE_TITLE_KEY, 'skills.delete.title')
eq('删除内容', S.SKILLS_DELETE_CONTENT_KEY, 'skills.delete.content')

// ---------- 20. 实体构造 ----------
console.log('\n-- 实体构造 --')
const fresh = S.newSkill()
ok('默认本地', fresh.sync === 'localOnly')
ok('默认可安装后启用', fresh.installed === true && fresh.enabled === true)
ok('默认免费', fresh.paidKind === 'free')
ok('默认安全', fresh.riskLevel === 'safe')
ok('默认指标归零', fresh.metrics.downloadCount === 0 && fresh.metrics.useCount === 0)
ok('默认退款次数 0', fresh.refundCount === 0)
ok('patch 覆盖', S.newSkill({ name: 'X', pinned: true }).name === 'X')
ok('patch pinned 生效', S.newSkill({ pinned: true }).pinned === true)
ok('id 唯一', S.newSkill().id !== S.newSkill().id)
const em = S.emptyMetrics()
ok('emptyMetrics 四键', 'downloadCount' in em && 'starCount' in em && 'useCount' in em && 'installCount' in em)

// ---------- 21. 统计 ----------
console.log('\n-- 统计 --')
const cnt = S.countBySource([
  mk({ source: 'recommend' }),
  mk({ source: 'recommend' }),
  mk({ source: 'skillhub' }),
  mk({ source: 'installed' })
])
eq('recommend 计数', cnt.recommend, 2)
eq('skillhub 计数', cnt.skillhub, 1)
eq('installed 计数', cnt.installed, 1)
eq('plugins 计数为 0', cnt.plugins, 0)
eq('enterprise 计数为 0', cnt.enterprise, 0)

// ---------- 22. 面板静态断言 ----------
console.log('\n-- 面板静态断言 --')
const panel = fs.readFileSync('src/renderer/src/components/SkillsPanel.tsx', 'utf8')
ok('面板存在', panel.includes('export default function SkillsPanel'))
ok('遍历六 Tab', panel.includes('SKILL_TABS.map'))
ok('遍历四排序', panel.includes('SKILL_SORTS.map'))
ok('遍历批量动作', panel.includes('BATCH_ACTIONS.map'))
ok('遍历详情三段', panel.includes('DETAIL_SECTIONS.map'))
ok('遍历已安装分组', panel.includes('INSTALLED_GROUPS.map'))
ok('遍历分享三步', panel.includes('SHARE_STEPS.map'))
ok('遍历导入要求', panel.includes('UPLOAD_REQUIREMENTS.map'))
ok('卡片用 installedBadgeKey', panel.includes('installedBadgeKey('))
ok('卡片用 installLabelKey', panel.includes('installLabelKey('))
ok('用 toggleTipKey 作开关提示', panel.includes('toggleTipKey('))
ok('用 shouldWarnEnabled 告警', panel.includes('shouldWarnEnabled('))
ok('用 cloudActionKey', panel.includes('cloudActionKey('))
ok('用 paidBadgeKey', panel.includes('paidBadgeKey('))
ok('用 priceLabel', panel.includes('priceLabel('))
ok('用 riskResultKey', panel.includes('riskResultKey('))
ok('用 shareGateKey', panel.includes('shareGateKey('))
ok('用 uploadPolicyKey', panel.includes('uploadPolicyKey('))
ok('用 pickerEmptyKey', panel.includes('pickerEmptyKey('))
ok('用 emptyKey 回落逻辑', panel.includes('hasOwnSearchEmpty') && panel.includes('hasOwnEmpty'))
ok('Esc 逐层关闭', panel.includes('stopImmediatePropagation'))
ok('订阅 skillChanged', panel.includes('onSkillChanged'))
ok('批量上限提示', panel.includes('skills.batch.limitExceeded'))
ok('付费跳过提示', panel.includes('skills.paid.batchUninstallBlocked'))
ok('退款 3 次拦截', panel.includes('skills.purchase.blockedBody'))
ok('安全检测倒计时', panel.includes('security.confirmCountdown'))
ok('标记 data-id 便于冒烟', panel.includes('data-id="sk-tabs"') && panel.includes('data-id="sk-grid"'))

const store = fs.readFileSync('src/renderer/src/stores/useSkills.ts', 'utf8')
ok('store 有 load', store.includes('load: async'))
ok('store 有 loadEnabledCount', store.includes('loadEnabledCount: async'))
ok('store 用 skillList', store.includes('skillList()'))

const app = fs.readFileSync('src/renderer/src/App.tsx', 'utf8')
ok('App 引入 SkillsPanel', app.includes("import SkillsPanel from './components/SkillsPanel'"))
ok('App 有 showSkills 状态', app.includes('showSkills'))
ok('App 渲染 SkillsPanel', app.includes('<SkillsPanel onClose={() => setShowSkills(false)} />'))

const css = fs.readFileSync('src/renderer/src/styles/global.css', 'utf8')
ok('CSS 有 .skills-panel', css.includes('.skills-panel {'))
ok('CSS 有 .sk-grid', css.includes('.sk-grid {'))
ok('CSS 有 .sk-card', css.includes('.sk-card {'))
ok('CSS 有 .sk-switch', css.includes('.sk-switch {'))
ok('CSS 有 .sk-drawer', css.includes('.sk-drawer {'))

// ---------- 23. i18n 完整性 ----------
console.log('\n-- i18n 完整性 --')
const i18n = fs.readFileSync('src/renderer/src/i18n/index.ts', 'utf8')
const nZh = (i18n.match(/^\s*'skills\./gm) || []).length
ok('skills 键注入 1025 条（513 zh + 512 en）', nZh === 1025, nZh)
ok('zh 含 batchLimitExceeded', i18n.includes("'skills.cloudUpload.modal.batchLimitExceeded': '一次最多上传"))
ok('en 无该键（原版英文包缺键）', !i18n.includes("'skills.cloudUpload.modal.batchLimitExceeded': 'At most"))

console.log(`\n[第十四轮逻辑冒烟] 通过 ${pass} / 失败 ${fail}`)
process.exit(fail === 0 ? 0 : 1)
