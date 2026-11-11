/**
 * 第十三轮逻辑冒烟 —— `shared/colleague.ts` 纯计算层 + 面板静态断言。
 * 运行：node smoke-r13-logic.mjs
 * 依赖前置：node smoke-r13-logic-prep.mjs
 */
import fs from 'node:fs'
import assert from 'node:assert'
import * as C from './.smoke-colleague.mjs'

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

console.log('\n[第十三轮逻辑冒烟 · 数字员工域]')

// ---------- 1. 状态 ----------
console.log('\n-- 状态 --')
eq('三态齐全', C.COLLEAGUE_STATUSES.join(','), 'working,idle,abnormal')
eq('working 徽标', C.colleagueStatusLabelKey('working'), 'colleagues.detail.colleagueStatus.working')
eq('abnormal 徽标', C.colleagueStatusLabelKey('abnormal'), 'colleagues.detail.colleagueStatus.abnormal')
eq('列表卡工作中', C.listStatusLabelKey('working'), 'colleagues.statusAvailable')
eq('列表卡已停用', C.listStatusLabelKey('idle'), 'colleagues.statusIdle')
eq('列表卡异常也归已停用族', C.listStatusLabelKey('abnormal'), 'colleagues.statusIdle')

// ---------- 2. 可见范围 ----------
console.log('\n-- 可见范围 --')
eq('三档齐全', C.VISIBILITIES.join(','), 'personal,project,public')
eq('权限名', C.visibilityNameKey('project'), 'colleagues.bindChannel.permission.project.name')
eq('权限说明', C.visibilityDescKey('public'), 'colleagues.bindChannel.permission.public.desc')
eq('发布选项名', C.publishOptionNameKey('personal'), 'colleagues.publishDialog.option.personal.name')
eq('发布选项说明', C.publishOptionDescKey('public'), 'colleagues.publishDialog.option.public.desc')
eq('提交按钮（个人保持）', C.publishSubmitKey('personal'), 'colleagues.publishDialog.submit.personal')
eq('提交按钮（项目）', C.publishSubmitKey('project'), 'colleagues.publishDialog.submit.project')
eq('提交按钮（公开=送审）', C.publishSubmitKey('public'), 'colleagues.publishDialog.submit.public')

// ---------- 3. 角色预设 ----------
console.log('\n-- 角色预设 --')
eq('21 个职业预设', C.ROLE_PRESETS.length, 21)
ok('含前端', C.ROLE_PRESETS.includes('frontend'))
ok('含 AI 工程师', C.ROLE_PRESETS.includes('aiEngineer'))
ok('含股票研究员', C.ROLE_PRESETS.includes('stockResearcher'))
ok('含小红书运营', C.ROLE_PRESETS.includes('xiaohongshuOperator'))
eq('预设无重复', new Set(C.ROLE_PRESETS).size, 21)
eq('首屏可见 8 个', C.ROLE_PRESET_VISIBLE, 8)
eq('自定义角色 id', C.CUSTOM_ROLE_ID, 'custom')
eq('预设名键', C.rolePresetNameKey('ui'), 'colleagues.createDialog.rolePreset.ui')
eq('预设描述键', C.rolePresetDescKey('ui'), 'colleagues.createDialog.rolePreset.uiDesc')

// ---------- 4. 职责与标签 ----------
console.log('\n-- 职责与标签 --')
eq('4 项职责', C.RESPONSIBILITY_OPTIONS.join(','), 'analysis,planning,report,review')
eq('职责文案键', C.responsibilityLabelKey('review'), 'colleagues.createDialog.responsibility.review')
eq('8 项能力标签', C.CAPABILITY_TAGS.length, 8)
eq('标签文案键', C.capabilityTagKey('coding'), 'colleagues.tag.coding')

// ---------- 5. 推荐卡片 ----------
console.log('\n-- 推荐卡片 --')
eq('3 张推荐卡', C.RECOMMENDED_CARDS.join(','), 'researcher,analyst,editor')
eq('卡片名键', C.cardNameKey('analyst'), 'colleagues.cards.analyst.name')
eq('卡片标题键', C.cardTitleKey('analyst'), 'colleagues.cards.analyst.title')
eq('卡片说明键', C.cardDescKey('analyst'), 'colleagues.cards.analyst.description')

// ---------- 6. 头像 ----------
console.log('\n-- 头像 --')
eq('20 张预制头像', C.AVATAR_PRESETS.length, 20)
eq('首位补零', C.AVATAR_PRESETS[0], 'preset01')
eq('第 20 位', C.AVATAR_PRESETS[19], 'preset20')
eq('每页 8 张', C.AVATAR_PAGE_SIZE, 8)
eq('头像键', C.avatarPresetKey('preset05'), 'colleagues.createDialog.avatar.preset05')
ok('配色确定性（同输入同输出）', JSON.stringify(C.avatarGradient('preset03')) === JSON.stringify(C.avatarGradient('preset03')))
ok('配色为两段渐变', C.avatarGradient('preset01').length === 2)
ok('越界 id 回落首色', JSON.stringify(C.avatarGradient('nope')) === JSON.stringify(C.avatarGradient('preset01')))
eq('上传上限 5MB', C.AVATAR_MAX_BYTES, 5 * 1024 * 1024)
eq('允许 4 种图片类型', C.AVATAR_ALLOWED_TYPES.length, 4)
ok('含 webp', C.AVATAR_ALLOWED_TYPES.includes('image/webp'))

// ---------- 7. 渠道 ----------
console.log('\n-- 渠道 --')
eq('7 类渠道', C.CHANNELS.length, 7)
eq('渠道顺序', C.CHANNELS.join(','), 'wecom,feishu,dingtalk,email,qq,wechatBot,wechatMini')
eq('渠道名键', C.channelNameKey('wecom'), 'colleagues.bindChannel.channel.wecom.name')
eq('渠道说明键', C.channelDescKey('wecom'), 'colleagues.bindChannel.channel.wecom.desc')
eq('企微为独占渠道', C.isExclusiveChannel('wecom'), true)
eq('QQ 为独占渠道', C.isExclusiveChannel('qq'), true)
eq('邮件为独占渠道', C.isExclusiveChannel('email'), true)
eq('小程序非独占（全局共享）', C.isExclusiveChannel('wechatMini'), false)
eq('绑定按钮（未绑）', C.channelBindLabelKey('unbound'), 'colleagues.bindChannel.channel.bind')
eq('绑定按钮（已绑）', C.channelBindLabelKey('bound'), 'colleagues.bindChannel.channel.bound')
eq('云助理主体', C.CLOUD_SUBJECT, 'cloud')

// ---------- 8. 配额 ----------
console.log('\n-- 配额 --')
eq('默认套餐为个人标准版', C.DEFAULT_PLAN, 'standard')
eq('体验版 1', C.PLAN_LIMITS.trial, 1)
eq('青春版 2', C.PLAN_LIMITS.youth, 2)
eq('标准版 3', C.PLAN_LIMITS.standard, 3)
eq('高级版 5', C.PLAN_LIMITS.advanced, 5)
eq('旗舰版 10', C.PLAN_LIMITS.flagship, 10)
eq('企业版 50', C.PLAN_LIMITS.enterprise, 50)
eq('套餐文案键', C.quotaContentKey('flagship'), 'colleagues.quotaLimit.flagshipContent')
eq('未知套餐回落 default', C.quotaContentKey('weird'), 'colleagues.quotaLimit.defaultContent')

// ---------- 9. 实体构造 ----------
console.log('\n-- 实体构造 --')
const c = C.newColleague({ name: '小研', displayName: '需求分析师' })
ok('自动生成 id', typeof c.id === 'string' && c.id.startsWith('col_'))
eq('默认可见范围为个人', c.visibility, 'personal')
eq('默认状态 idle', c.status, 'idle')
eq('默认在线', c.online, true)
eq('默认未置顶', c.pinned, false)
eq('默认来源个人创建', c.source, 'personal')
eq('默认职责为空数组', c.responsibilities.length, 0)
eq('默认标签为空数组', c.tags.length, 0)
eq('默认连接为空数组', c.connections.length, 0)
ok('createdAt 已填', typeof c.createdAt === 'number' && c.createdAt > 0)
const c2 = C.newColleague({ name: 'A' })
ok('两次生成 id 不同', c.id !== c2.id)

// ---------- 10. 文案推导 ----------
console.log('\n-- 文案推导 --')
eq('countLabel', C.countLabelKey(), 'colleagues.countLabel')
eq('countStatus', C.countStatusKey(), 'colleagues.dashboard.countStatus')
eq('workingCount', C.workingCountKey(), 'colleagues.dashboard.workingCount')
eq('usageLabel', C.usageLabelKey(), 'colleagues.usageLabel')
eq('IM 已连接', C.imStatusKey(true), 'colleagues.dashboard.imConnected')
eq('IM 未连接', C.imStatusKey(false), 'colleagues.dashboard.imDisconnected')

// ---------- 11. 上岗天数 ----------
console.log('\n-- 上岗天数 --')
const now = new Date(2026, 11, 20, 12, 0, 0, 0).getTime()
eq('当天上岗算 1 天', C.daysOnDuty(now, now), 1)
eq('差 1 小时仍算 1 天', C.daysOnDuty(now - 3600000, now), 1)
eq('整 5 天', C.daysOnDuty(now - 5 * 86400000, now), 5)
eq('未来时间也兜底为 1', C.daysOnDuty(now + 86400000, now), 1)

// ---------- 12. 相对时间 ----------
console.log('\n-- 相对时间 --')
eq('刚活跃', C.relativeTimeKey(now - 60_000, now), 'colleagues.detail.lastActiveFallback')
eq('1 小时内', C.relativeTimeKey(now - 30 * 60_000, now), 'colleagues.detail.lastActiveFallback')
eq('1~2 小时前', C.relativeTimeKey(now - 90 * 60_000, now), 'colleagues.detail.time.oneHourAgo')
eq('1 天前', C.relativeTimeKey(now - 30 * 3600_000, now), 'colleagues.detail.time.oneDayAgo')
eq('2 天前', C.relativeTimeKey(now - 50 * 3600_000, now), 'colleagues.detail.time.twoDaysAgo')
eq('更久回落 fallback', C.relativeTimeKey(now - 10 * 86400000, now), 'colleagues.detail.lastActiveFallback')

// ---------- 13. 活跃等级与热力图 ----------
console.log('\n-- 热力图 --')
eq('5 档', C.ACTIVITY_LEVELS, 5)
eq('0 次为 0 档', C.activityLevel(0), 0)
eq('1 次为 1 档', C.activityLevel(1), 1)
eq('2 次为 1 档', C.activityLevel(2), 1)
eq('3 次为 2 档', C.activityLevel(3), 2)
eq('6 次为 3 档', C.activityLevel(6), 3)
eq('10 次为 4 档', C.activityLevel(10), 4)
const hm = C.activityHeatmap('c1', now)
eq('热力图 364 天', hm.length, 364)
ok('取值均在 0..5', hm.every((n) => n >= 0 && n <= 5))
ok('热力图确定性', JSON.stringify(C.activityHeatmap('c1', now)) === JSON.stringify(hm))
ok('不同 id 结果不同', JSON.stringify(C.activityHeatmap('c2', now)) !== JSON.stringify(hm))
eq('求和无副作用', C.heatmapTotal([1, 2, 3]), 6)
eq('空数组和为 0', C.heatmapTotal([]), 0)

// ---------- 14. 统计 / 导航 / 任务表 ----------
console.log('\n-- 统计与导航 --')
eq('总量键', C.metricLabelKey('total'), 'colleagues.detail.metric.total')
eq('完成率键', C.metricLabelKey('completionRate'), 'colleagues.detail.metric.completionRate')
eq('进行中说明键', C.metricDescKey('inProgress'), 'colleagues.detail.metric.inProgressDesc')
eq('3 段导航', C.DETAIL_TABS.join(','), 'home,memory,tasks')
eq('导航文案键', C.detailTabLabelKey('memory'), 'colleagues.detail.nav.memory')
eq('任务表 6 列', ['id', 'name', 'status', 'source', 'createdAt', 'action'].map(C.taskTableColumnKey).join(','),
  'colleagues.detail.taskTable.id,colleagues.detail.taskTable.name,colleagues.detail.taskTable.status,colleagues.detail.taskTable.source,colleagues.detail.taskTable.createdAt,colleagues.detail.taskTable.action')
eq('三态任务状态', C.TASK_STATUSES.join(','), 'idle,inProgress,completed')
eq('任务状态键', C.taskStatusKey('completed'), 'colleagues.detail.status.completed')
eq('委派人为自己', C.delegatorKey(true), 'colleagues.detail.you')
eq('委派人为他人', C.delegatorKey(false), 'colleagues.detail.delegatedBy')

// ---------- 15. 面板静态断言 ----------
console.log('\n-- 面板静态断言 --')
const panel = fs.readFileSync('src/renderer/src/components/ColleaguesPanel.tsx', 'utf8')
ok('引入纯净计算层', /from '\.\.\/\.\.\/\.\.\/shared\/colleague'/.test(panel))
ok('面板捕获阶段处理 Esc', /window\.addEventListener\('keydown', onKey, true\)/.test(panel) && /stopImmediatePropagation/.test(panel))
ok('Esc 逐层：向导优先', /if \(draft\) return setDraft\(null\)/.test(panel))
ok('Esc 逐层：发布 → 删除 → 配额 → 配置 → 详情', /if \(publishId\) return setPublishId\(null\)/.test(panel) && /if \(pendingDelete\) return setPendingDelete\(null\)/.test(panel) && /if \(showQuota\) return setShowQuota\(false\)/.test(panel) && /if \(configId\) return setConfigId\(null\)/.test(panel) && /if \(detailId\) return setDetailId\(null\)/.test(panel))
ok('必填校验用 requiredError', /colleagues\.createDialog\.requiredError/.test(panel))
ok('重名校验用 nameDuplicated', /colleagues\.createDialog\.nameDuplicated/.test(panel))
ok('配额拦截走 quotaLimit', /quota\.used >= quota\.limit/.test(panel) && /setShowQuota\(true\)/.test(panel))
ok('渠道绑定走真实 IPC', /window\.workbuddy\.colleagueBind\(/.test(panel) && /window\.workbuddy\.colleagueUnbind\(/.test(panel))
ok('订阅变更广播', /window\.workbuddy\.onColleagueChanged\(/.test(panel))
ok('删除二次确认走 deleteConfirmTitle', /colleagues\.action\.deleteConfirmTitle/.test(panel))
ok('发布提交按钮按可见范围推导', /publishSubmitKey\(publishPick\)/.test(panel))
ok('复制失败用 cloneFailed 插值', /colleagues\.action\.cloneFailed/.test(panel))
ok('置顶失败用 pinFailed / unpinFailed', /colleagues\.action\.pinFailed/.test(panel) && /colleagues\.action\.unpinFailed/.test(panel))
ok('内存记忆开关组件存在', /function MemorySwitch\(/.test(panel))
ok('热力图组件存在', /function Heatmap\(/.test(panel))
ok('热力图用 activityLevel 分档', /activityLevel\(n\)/.test(panel))
ok('未实现能力以桩文案对齐', /enterpriseUnsupported/.test(panel) && /bindChannel\.placeholder/.test(panel))
ok('头像上传以桩提示对齐', /avatarUploadUnsupported/.test(panel))
ok('任务打开历史失败有兜底', /taskTable\.openHistoryFailed/.test(panel))

// ---------- 16. 接入静态断言 ----------
console.log('\n-- 接入静态断言 --')
const app = fs.readFileSync('src/renderer/src/App.tsx', 'utf8')
ok('App 引入同事面板', /import ColleaguesPanel from '\.\/components\/ColleaguesPanel'/.test(app))
ok('App 顶栏有入口', /setShowColleagues\(true\)/.test(app))
ok('App Esc 对同事面板让权', /if \(showColleagues\) return\b/.test(app))
const preload = fs.readFileSync('src/preload/index.ts', 'utf8')
ok('preload 暴露 colleagueBind', /colleagueBind: \(subject, channel, state\)/.test(preload))
ok('preload 暴露 onColleagueChanged', /onColleagueChanged: \(cb\)/.test(preload))
const types = fs.readFileSync('src/shared/types.ts', 'utf8')
ok('IPC 常量含 colleagueChanged', /colleagueChanged: 'wb:colleague:changed'/.test(types))
ok('IPC 常量含 colleagueUnbind', /colleagueUnbind: 'wb:colleague:unbind'/.test(types))
const store = fs.readFileSync('src/main/store.ts', 'utf8')
ok('store 建 colleagues 表', /CREATE TABLE IF NOT EXISTS colleagues/.test(store))
ok('store 建渠道绑定表', /CREATE TABLE IF NOT EXISTS colleague_channels/.test(store))
ok('store 建内存记忆表', /CREATE TABLE IF NOT EXISTS colleague_memory/.test(store))
ok('store 建助理任务表', /CREATE TABLE IF NOT EXISTS colleague_tasks/.test(store))
ok('store 渠道独占清理逻辑', /UPDATE colleague_channels SET state = \?/.test(store))
ok('store 级联删除四表', /DELETE FROM colleague_channels WHERE subject = \?/.test(store) && /DELETE FROM colleague_tasks WHERE colleague_id = \?/.test(store))
ok('store 置顶排序', /ORDER BY pinned DESC, updated_at DESC/.test(store))

// ---------- 17. 词典完整性 ----------
console.log('\n-- 词典完整性 --')
const i18n = fs.readFileSync('src/renderer/src/i18n/index.ts', 'utf8')
const keys = [...i18n.matchAll(/'(colleagues\.[A-Za-z0-9_.]+)':/g)].map((m) => m[1])
const zhOnly = [...new Set(keys)]
eq('双语键数 573×2', keys.length, 1146)
eq('去重后 573（域全量）', zhOnly.length, 573)
ok('无空值键', !/'(colleagues\.[A-Za-z0-9_.]+)': ''/.test(i18n))
// 计算层引用到的键必须都在词典里
const used = new Set()
for (const m of panel.matchAll(/t\('(colleagues\.[A-Za-z0-9_.]+)'\)/g)) used.add(m[1])
for (const m of panel.matchAll(/t\(([a-zA-Z]+)\(([^)]*)\)\)/g)) { /* 动态键无法静态校验，由下拉断言覆盖 */ }
const missing = [...used].filter((k) => !keys.includes(k))
eq('面板静态键全部命中词典', missing.length, 0)
if (missing.length) console.log('    缺失：' + missing.join(', '))
// 计算层产出的键抽样校验
const derived = [
  C.colleagueStatusLabelKey('working'),
  C.listStatusLabelKey('idle'),
  C.visibilityNameKey('project'),
  C.visibilityDescKey('project'),
  C.publishOptionNameKey('public'),
  C.publishOptionDescKey('public'),
  C.publishSubmitKey('public'),
  C.rolePresetNameKey('frontend'),
  C.rolePresetDescKey('frontend'),
  C.responsibilityLabelKey('analysis'),
  C.capabilityTagKey('coding'),
  C.cardNameKey('researcher'),
  C.cardTitleKey('researcher'),
  C.cardDescKey('researcher'),
  C.avatarPresetKey('preset01'),
  C.avatarPresetKey('preset20'),
  C.channelNameKey('wechatMini'),
  C.channelDescKey('wechatMini'),
  C.channelBindLabelKey('bound'),
  C.imStatusKey(true),
  C.metricLabelKey('completionRate'),
  C.metricDescKey('completionRate'),
  C.detailTabLabelKey('tasks'),
  C.taskStatusKey('inProgress'),
  C.taskTableColumnKey('openHistoryAria'.slice(0, 0) + 'id'),
  C.delegatorKey(true),
  C.delegatorKey(false),
  C.countLabelKey(),
  C.countStatusKey(),
  C.workingCountKey(),
  C.usageLabelKey(),
  C.quotaContentKey('flagship'),
  'colleagues.detail.taskTable.openHistoryAria',
  'colleagues.detail.relativeTimeKeyNotUsed'
]
const missingDerived = derived.filter((k) => k !== 'colleagues.detail.relativeTimeKeyNotUsed' && !keys.includes(k))
eq('计算层推导键全部命中词典', missingDerived.length, 0)
if (missingDerived.length) console.log('    缺失：' + missingDerived.join(', '))

console.log(`\n结果：${pass}/${pass + fail} 通过`)
if (fail > 0) process.exit(1)
