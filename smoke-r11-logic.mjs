/**
 * 第十一轮 逻辑冒烟 —— 覆盖调度模型（nextRun / summary / validation）与 i18n 键一致性、主进程接线
 * 运行：node smoke-r11-logic.mjs
 */
import { buildSync } from 'esbuild'
import { readFileSync, rmSync, existsSync } from 'node:fs'

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

console.log('\n[第十一轮 逻辑冒烟]')

// ---------- 打包 schedule.ts ----------
buildSync({
  entryPoints: ['src/shared/schedule.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: '.smoke-sched.mjs',
  logLevel: 'error'
})
const sched = await import('./.smoke-sched.mjs')

// 用真实 i18n 字典（从原版抽取，仅用于文案回填）
const zh = JSON.parse(readFileSync('/tmp/wb-i18n-zh.json', 'utf-8'))
const tt = (k) => zh[k] ?? k

// 固定基准时刻：2026-03-10（周二）10:00 本地时间
const BASE = new Date(2026, 2, 10, 10, 0, 0).getTime()

// ---------- 1. once ----------
console.log('\n-- 单次(once) --')
eq('future once 返回原时间戳', sched.nextRun({ kind: 'once', at: BASE + 3600000 }, BASE), BASE + 3600000)
eq('past once 返回 undefined', sched.nextRun({ kind: 'once', at: BASE - 1000 }, BASE), undefined)
eq('无 at 返回 undefined', sched.nextRun({ kind: 'once' }, BASE), undefined)

// ---------- 2. daily ----------
console.log('\n-- 每天(daily) --')
// 基准 10:00，设为 09:00 → 今天已过，应为明天 09:00
const d1 = sched.nextRun({ kind: 'daily', time: '09:00' }, BASE)
const e1 = new Date(2026, 2, 11, 9, 0, 0).getTime()
eq('daily 09:00（今日已过）→ 明天 09:00', d1, e1)
// 设为 18:00 → 今天 18:00
const d2 = sched.nextRun({ kind: 'daily', time: '18:00' }, BASE)
eq('daily 18:00（今日未到）→ 今天 18:00', d2, new Date(2026, 2, 10, 18, 0, 0).getTime())

// ---------- 3. workday ----------
console.log('\n-- 工作日(workday) --')
// 基准周二 10:00，time 18:00 → 今天 18:00（周二为工作日）
eq('workday 周二未到 → 今天 18:00', sched.nextRun({ kind: 'workday', time: '18:00' }, BASE), new Date(2026, 2, 10, 18, 0, 0).getTime())
// 基准周五 18:00，time 09:00 → 下周一 09:00（跳过周末）
const FRI = new Date(2026, 2, 13, 19, 0, 0).getTime() // 2026-03-13 周五 19:00
const w2 = sched.nextRun({ kind: 'workday', time: '09:00' }, FRI)
const w2d = new Date(w2)
eq('workday 周五晚 → 下周一 09:00（日期）', w2d.getDate(), 16)
eq('workday 周五晚 → 下周一（星期=周一）', w2d.getDay(), 1)

// ---------- 4. weekly / biweekly ----------
console.log('\n-- 每周 / 双周 --')
// 基准周二，选 MO/WE → 周三
const wk = sched.nextRun({ kind: 'weekly', time: '08:00', weekdays: ['MO', 'WE'] }, BASE)
const wkd = new Date(wk)
eq('weekly MO/WE（周二）→ 周三', wkd.getDay(), 3)
// 基准周三，选 MO → 下周一（+6 天）
const WED = new Date(2026, 2, 11, 10, 0, 0).getTime()
const wk2 = new Date(sched.nextRun({ kind: 'weekly', time: '08:00', weekdays: ['MO'] }, WED))
eq('weekly MO（周三）→ 下周一', wk2.getDay(), 1)
ok('weekly MO（周三）→ 距今 > 3 天', wk2.getTime() - WED > 3 * 86400000)
// biweekly：基准周二选 TU（周二）→ 今天 08:00 已过，本周无匹配 → 两周后周二
const bw = new Date(sched.nextRun({ kind: 'biweekly', time: '08:00', weekdays: ['TU'] }, BASE))
eq('biweekly TU（周二已过）→ 周二', bw.getDay(), 2)
ok('biweekly 距今 ≥ 6 天', bw.getTime() - BASE >= 6 * 86400000, (bw.getTime() - BASE) / 86400000)

// ---------- 5. monthly / yearly ----------
console.log('\n-- 每月 / 每年 --')
// 基准 3-10，月选 15 → 2026-03-15
const mo = new Date(sched.nextRun({ kind: 'monthly', time: '07:00', monthDays: [15] }, BASE))
eq('monthly 15 号 → 3 月 15 日', mo.getDate(), 15)
eq('monthly 15 号 → 3 月', mo.getMonth(), 2)
// 基准 3-10，月选 5（已过）→ 4-05
const mo2 = new Date(sched.nextRun({ kind: 'monthly', time: '07:00', monthDays: [5] }, BASE))
eq('monthly 5 号（已过）→ 4 月 5 日', mo2.getMonth(), 3)
const yr = new Date(sched.nextRun({ kind: 'yearly', time: '07:00', month: 12, monthDays: [25] }, BASE))
eq('yearly 12-25 → 12 月', yr.getMonth(), 11)
eq('yearly 12-25 → 25 日', yr.getDate(), 25)

// ---------- 6. interval ----------
console.log('\n-- 按间隔(interval) --')
const iv = sched.nextRun({ kind: 'interval', intervalMinutes: 60 }, BASE)
ok('interval 60m 返回 > 基准', iv !== undefined && iv > BASE, iv)
ok('interval 结果与基准差值 ≤ 60m', iv !== undefined && iv - BASE <= 3600000, (iv - BASE) / 60000)
ok('interval 结果分钟位为 0', iv !== undefined && new Date(iv).getMinutes() === 0)
const ivWin = sched.nextRun({ kind: 'interval', intervalMinutes: 60, hourFrom: 9, hourTo: 18 }, BASE)
ok('interval 带窗口返回有效值', ivWin !== undefined && ivWin > BASE)

// ---------- 7. validateSchedule ----------
console.log('\n-- 调度校验（对齐 schedule.validation.*） --')
eq('once 无日期 → onceDateRequired', sched.validateSchedule({ kind: 'once' }, BASE), 'automation.schedule.validation.onceDateRequired')
eq('once 过去时间 → onceFutureRequired', sched.validateSchedule({ kind: 'once', at: BASE - 1 }, BASE), 'automation.schedule.validation.onceFutureRequired')
eq('once 未来时间 → null', sched.validateSchedule({ kind: 'once', at: BASE + 10000 }, BASE), null)
eq('weekly 无星期 → weekdayRequired', sched.validateSchedule({ kind: 'weekly' }, BASE), 'automation.schedule.validation.weekdayRequired')
eq('weekly 有星期 → null', sched.validateSchedule({ kind: 'weekly', weekdays: ['MO'] }, BASE), null)
eq('monthly 无日期 → monthdayRequired', sched.validateSchedule({ kind: 'monthly' }, BASE), 'automation.schedule.validation.monthdayRequired')
eq('yearly 无月 → monthRequired', sched.validateSchedule({ kind: 'yearly', monthDays: [1] }, BASE), 'automation.schedule.validation.monthRequired')
eq('interval 30m → intervalHours', sched.validateSchedule({ kind: 'interval', intervalMinutes: 30 }, BASE), 'automation.schedule.validation.intervalHours')
eq('interval 60m → null', sched.validateSchedule({ kind: 'interval', intervalMinutes: 60 }, BASE), null)
eq('daily → null', sched.validateSchedule({ kind: 'daily', time: '09:00' }, BASE), null)

// ---------- 8. normalizeOnceTime / isExpired ----------
console.log('\n-- 单次时间纠正与过期判定 --')
eq('过去时间被纠正为 now', sched.normalizeOnceTime(BASE - 5000, BASE).at, BASE)
eq('过去时间 corrected=true', sched.normalizeOnceTime(BASE - 5000, BASE).corrected, true)
eq('未来时间 corrected=false', sched.normalizeOnceTime(BASE + 5000, BASE).corrected, false)
eq('过期 once → isExpired true', sched.isExpired({ kind: 'once', at: BASE - 1 }, BASE), true)
eq('未来 once → isExpired false', sched.isExpired({ kind: 'once', at: BASE + 1 }, BASE), false)
eq('daily 不视为过期', sched.isExpired({ kind: 'daily', time: '09:00' }, BASE), false)

// ---------- 9. scheduleSummary 文案（逐字对齐原版模板） ----------
console.log('\n-- 调度摘要文案 --')
ok('daily 摘要含 09:00', sched.scheduleSummary({ kind: 'daily', time: '09:00' }, tt).includes('09:00'))
ok('workday 摘要含 工作日', sched.scheduleSummary({ kind: 'workday', time: '09:00' }, tt).includes('工作日'))
ok('weekly 摘要含 周一', sched.scheduleSummary({ kind: 'weekly', time: '08:00', weekdays: ['MO'] }, tt).includes('周一'))
ok('5 工作日聚合为「工作日」', sched.scheduleSummary({ kind: 'weekly', time: '08:00', weekdays: ['MO','TU','WE','TH','FR'] }, tt).includes('工作日'))
ok('周末聚合为「周末」', sched.scheduleSummary({ kind: 'weekly', time: '08:00', weekdays: ['SA','SU'] }, tt).includes('周末'))
ok('monthly 摘要含 15 号', sched.scheduleSummary({ kind: 'monthly', time: '07:00', monthDays: [15] }, tt).includes('15'))
ok('yearly 摘要含月份', sched.scheduleSummary({ kind: 'yearly', time: '07:00', month: 12, monthDays: [25] }, tt).includes('12'))
ok('interval 60m 摘要为「每间隔 1 小时」', sched.scheduleSummary({ kind: 'interval', intervalMinutes: 60 }, tt).includes('每间隔 1 小时'))
ok('interval 90m 摘要为「每间隔 90 分钟」', sched.scheduleSummary({ kind: 'interval', intervalMinutes: 90 }, tt).includes('每间隔 90 分钟'))
ok('once 摘要含日期时间', /\d{4}-\d{2}-\d{2}/.test(sched.scheduleSummary({ kind: 'once', at: BASE }, tt)))

// ---------- 10. weekdaysLabel ----------
console.log('\n-- 星期标签 --')
eq('空数组 → 空串', sched.weekdaysLabel([], tt), '')
eq('全 7 天 → 「每天」', sched.weekdaysLabel(['MO','TU','WE','TH','FR','SA','SU'], tt), zh['automation.schedule.periodicDay'])
ok('MO/WE → 含两次「周」', (sched.weekdaysLabel(['MO','WE'], tt).match(/周/g) || []).length === 2)

// ---------- 11. SCHEDULE_KINDS 与 ALL_WEEKDAYS ----------
console.log('\n-- 常量完整性 --')
eq('SCHEDULE_KINDS 长度 8', sched.SCHEDULE_KINDS.length, 8)
eq('ALL_WEEKDAYS 长度 7', sched.ALL_WEEKDAYS.length, 7)
eq('WORKDAYS 长度 5', sched.WORKDAYS.length, 5)
eq('WEEKEND 长度 2', sched.WEEKEND.length, 2)

// ---------- 12. i18n 键存在且与原版一致 ----------
console.log('\n-- i18n 键一致性（逐字对齐 automation.* 原文） --')
const i18nSrc = readFileSync('src/renderer/src/i18n/index.ts', 'utf-8')
const expectKeys = [
  ['automation.title', '定时任务'],
  ['automation.empty', '暂无定时任务'],
  ['automation.section.scheduled', '已安排'],
  ['automation.section.inProgress', '执行中'],
  ['automation.section.completed', '已完成'],
  ['automation.section.archived', '已归档'],
  ['automation.tab.scheduledTasks', '定时任务'],
  ['automation.tab.runRecords', '运行记录'],
  ['automation.toolbar.addAutomation', '新建定时任务'],
  ['automation.card.run', '立即运行'],
  ['automation.card.pauseTask', '暂停任务'],
  ['automation.card.resumeTask', '开启任务'],
  ['automation.schedule.once', '单次任务'],
  ['automation.schedule.daily', '每天'],
  ['automation.schedule.workday', '每个工作日'],
  ['automation.schedule.validation.intervalHours', '按间隔执行需至少每 1 小时'],
  ['automation.modal.titleCreate', '新建定时任务'],
  ['automation.modal.name', '名称'],
  ['automation.modal.prompt', '提示词'],
  ['automation.permission.default', '默认权限'],
  ['automation.permission.fullAccess', '完全访问权限'],
  ['automation.delete.title', '确认删除定时任务？'],
  ['automation.toast.deleted', '定时任务已删除'],
  ['automation.detail.reason.network', '网络连接异常，任务未能开始执行，请在网络恢复后重试。'],
  ['automation.detail.reason.runTimeout', '任务运行超时已停止，请缩小任务范围后再试。'],
  ['automation.detail.reason.emptyResult', '任务已结束，但未生成可展示的内容或可确认的操作结果。']
]
for (const [key, text] of expectKeys) {
  const needle = `'${key}': '${text}'`
  ok(`zh 键 ${key} 文案一致`, i18nSrc.includes(needle), needle)
}

const keyOccurrences = (k) => i18nSrc.split(`'${k}'`).length - 1
ok('automation.title 双语定义', keyOccurrences('automation.title') >= 2)
ok('automation.schedule.validation.intervalHours 双语定义', keyOccurrences('automation.schedule.validation.intervalHours') >= 2)
ok('automation.detail.reason.network 双语定义', keyOccurrences('automation.detail.reason.network') >= 2)

// ---------- 13. 主进程接线 ----------
console.log('\n-- 主进程接线 --')
const ipcSrc = readFileSync('src/main/ipc.ts', 'utf-8')
for (const ch of ['automationList','automationSave','automationEnabled','automationArchived','automationDelete','automationDeleteBatch','automationRunNow','automationRuns','automationNextRun']) {
  ok(`IPC.${ch} handler 已注册`, ipcSrc.includes(`IPC.${ch}`))
}
const mainSrc = readFileSync('src/main/index.ts', 'utf-8')
ok('启动调度器 startScheduler', mainSrc.includes('startScheduler()'))
ok('退出前停止调度器', mainSrc.includes('stopScheduler()'))
const autoSrc = readFileSync('src/main/automation.ts', 'utf-8')
ok('调度器轮询 due 任务', autoSrc.includes('dueAutomations'))
ok('调度器建会话并执行', autoSrc.includes('createConversation') && autoSrc.includes('streamChat'))
ok('无交互 hooks 拒绝审批', autoSrc.includes("requestApproval: async () => 'reject'"))
ok('无交互 hooks 跳过提问', autoSrc.includes('skipped: true'))
ok('once 执行后停用（markAutomationRun）', autoSrc.includes('markAutomationRun'))
const typesSrc = readFileSync('src/shared/types.ts', 'utf-8')
ok('automation IPC 常量齐备', typesSrc.includes("automationList: 'wb:automation:list'") && typesSrc.includes("automationRunNow: 'wb:automation:run-now'"))
const preloadSrc = readFileSync('src/preload/index.ts', 'utf-8')
ok('preload 暴露 automationList', preloadSrc.includes('automationList:'))
ok('preload 暴露 automationRunNow', preloadSrc.includes('automationRunNow:'))
ok('preload 暴露 onAutomationChanged', preloadSrc.includes('onAutomationChanged'))

// ---------- 14. store 表与 CRUD ----------
console.log('\n-- 存储层 --')
const storeSrc = readFileSync('src/main/store.ts', 'utf-8')
ok('automations 表建表', storeSrc.includes('CREATE TABLE IF NOT EXISTS automations'))
ok('automation_runs 表建表', storeSrc.includes('CREATE TABLE IF NOT EXISTS automation_runs'))
for (const m of ['listAutomations','saveAutomation','setAutomationEnabled','setAutomationArchived','deleteAutomation','deleteAutomations','dueAutomations','markAutomationRun','addAutomationRun','listAutomationRuns','setRunArchived','deleteAutomationRun']) {
  ok(`store.${m} 已实现`, storeSrc.includes(`${m}(`))
}

// ---------- 15. 面板组件与接线 ----------
console.log('\n-- 渲染层面板 --')
const panelSrc = readFileSync('src/renderer/src/components/AutomationPanel.tsx', 'utf-8')
ok('AutomationPanel 组件存在', existsSync('src/renderer/src/components/AutomationPanel.tsx'))
ok('面板含双 Tab', panelSrc.includes('automation.tab.scheduledTasks') && panelSrc.includes('automation.tab.runRecords'))
ok('面板按 section 分组', panelSrc.includes('automation.section.scheduled'))
ok('面板含立即运行', panelSrc.includes('automation.card.run'))
ok('面板含表单（modal）', panelSrc.includes('automation.modal.titleCreate'))
ok('面板含失败分因渲染', panelSrc.includes('automation.detail.reason.'))
const appSrc = readFileSync('src/renderer/src/App.tsx', 'utf-8')
ok('App 接入 AutomationPanel', appSrc.includes('AutomationPanel'))
ok('App 有定时任务入口按钮', appSrc.includes("t('automation.title')"))
const cssSrc = readFileSync('src/renderer/src/styles/global.css', 'utf-8')
ok('CSS 含 .automation-panel', cssSrc.includes('.automation-panel'))
ok('CSS 含 .auto-card', cssSrc.includes('.auto-card'))
ok('CSS 含 .kind-chip', cssSrc.includes('.kind-chip'))

console.log(`\n结果：${pass}/${pass + fail} 通过`)
rmSync('.smoke-sched.mjs', { force: true })
process.exit(fail === 0 ? 0 : 1)
