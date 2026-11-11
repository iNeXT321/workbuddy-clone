/**
 * 第十二轮 逻辑冒烟 —— 日程模型（对齐 home.schedule.*）
 * 运行：node smoke-r12-logic.mjs
 *
 * 覆盖：状态推导、时间摘要四模板（逐字对齐原文占位符与连接符）、时长/提醒文案、
 * 参与人、重复展开（daily/weekly/monthly/yearly + until + 区间交叠）、
 * 月历网格、datetime-local 往返、日历默认值、以及面板/接线/CSS 的静态断言。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))

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

// 中文词典（逐字取自原版 i18n）——填占位符后与实现输出比对
const ZH = JSON.parse(fs.readFileSync('/tmp/wb-i18n-zh.json', 'utf8'))
const t = (k) => ZH[k] ?? k

const {
  reminderOffsetMinutes,
  reminderAt,
  eventStatus,
  eventStatusLabel,
  clock,
  weekdayName,
  durationLabel,
  whenLabel,
  kindLine,
  reminderLabel,
  participantsLabel,
  rsvpLabel,
  expandOccurrences,
  scopeLabel,
  scopeHintLabel,
  DURATION_OPTIONS,
  ALL_DAY_REMINDER_OPTIONS,
  TIMED_REMINDER_OPTIONS,
  DEFAULT_CALENDAR_DEFAULTS,
  toLocalInput,
  fromLocalInput,
  monthGrid,
  monthTitle,
  peopleCount,
  eventCoversDay,
  eventsOnDay,
  EVENT_STATUSES,
  RSVP_STATUSES,
  REPEAT_KINDS,
  OCCURRENCE_SCOPES
} = await import('./.smoke-event.mjs')

const DAY = 86400000
const base = new Date(2026, 11, 15, 10, 0, 0, 0).getTime() // 2026-12-15 10:00 本地

const ev = (over = {}) => ({
  id: 'e1',
  title: '方案评审',
  startAt: base,
  endAt: base + 3600000,
  createdAt: base,
  updatedAt: base,
  ...over
})

console.log('\n[第十二轮 逻辑冒烟 · 日程模型]')

// ---------- 1. 提醒 ----------
console.log('\n-- 提醒偏移 --')
eq('atStart → 0 分钟', reminderOffsetMinutes('atStart'), 0)
eq('15 → 15 分钟', reminderOffsetMinutes('15'), 15)
eq('60 → 60 分钟', reminderOffsetMinutes('60'), 60)
eq('1440 → 1440 分钟', reminderOffsetMinutes('1440'), 1440)
eq('none → undefined', reminderOffsetMinutes('none'), undefined)
eq('未设置 → undefined', reminderOffsetMinutes(undefined), undefined)
eq('atStart 触发时刻 = 开始时刻', reminderAt(ev({ reminder: 'atStart' })), base)
eq('15 分钟前触发', reminderAt(ev({ reminder: '15' })), base - 15 * 60000)
eq('1 天前触发', reminderAt(ev({ reminder: '1440' })), base - DAY)
eq('none 无触发时刻', reminderAt(ev({ reminder: 'none' })), undefined)

// ---------- 2. 状态推导 ----------
console.log('\n-- 状态推导 --')
eq('开始前 → upcoming', eventStatus(ev(), base - 1000), 'upcoming')
eq('进行中 → ongoing', eventStatus(ev(), base + 1000), 'ongoing')
eq('结束后 → ended', eventStatus(ev(), base + 3600000), 'ended')
eq('已取消优先于时间', eventStatus(ev({ cancelled: true }), base - 1000), 'cancelled')
eq('边界：等于开始时刻 → ongoing', eventStatus(ev(), base), 'ongoing')
eq('边界：等于结束时刻 → ended', eventStatus(ev(), base + 3600000), 'ended')
eq('状态文案 upcoming', eventStatusLabel('upcoming', t), '待开始')
eq('状态文案 ongoing', eventStatusLabel('ongoing', t), '进行中')
eq('状态文案 ended', eventStatusLabel('ended', t), '已结束')
eq('状态文案 cancelled', eventStatusLabel('cancelled', t), '已取消')
eq('四态齐全', EVENT_STATUSES.length, 4)

// ---------- 3. 时间摘要（逐字模板） ----------
console.log('\n-- 时间摘要 --')
eq('clock 补零', clock(new Date(2026, 0, 2, 9, 5).getTime()), '09:05')
eq('weekdayName 周日', weekdayName(new Date(2026, 11, 13).getTime(), t), '周日')
eq('weekdayName 周二', weekdayName(new Date(2026, 11, 15).getTime(), t), '周二')
eq(
  '单日定时 → summary.when',
  whenLabel(ev(), t),
  '2026 年 12 月 15 日 · 10:00—11:00'
)
eq(
  '跨日定时 → whenCrossDay（连接符前后带空格）',
  whenLabel(ev({ endAt: new Date(2026, 11, 16, 9, 30).getTime() }), t),
  '2026 年 12 月 15 日 10:00 — 12 月 16 日 09:30'
)
eq('单日全天 → whenAllDay', whenLabel(ev({ allDay: true }), t), '2026 年 12 月 15 日 · 全天')
eq(
  '跨日全天 → whenAllDaySpan',
  whenLabel(ev({ allDay: true, endAt: new Date(2026, 11, 17, 0, 0).getTime() }), t),
  '2026 年 12 月 15 日 — 12 月 17 日 · 全天'
)
eq('kindLine 组合状态', kindLine(ev(), t, base - 1000), '日程 待开始')
eq(
  '摘要模板保持原文 em dash（非连字符）',
  ZH['home.schedule.summary.when'].includes('\u2014'),
  true
)
eq(
  '跨日模板连接符为空格+em dash+空格',
  ZH['home.schedule.summary.whenCrossDay'].includes(' \u2014 '),
  true
)

// ---------- 4. 时长与提醒文案 ----------
console.log('\n-- 时长 / 提醒文案 --')
eq('59 分钟 → minutes 模板', durationLabel(45, t), '45 分钟')
eq('整 60 → hour（单数特例）', durationLabel(60, t), '1 小时')
eq('120 → hours 模板', durationLabel(120, t), '2 小时')
eq('90 → 小时+分钟拼接', durationLabel(90, t), '1 小时30 分钟')
eq('DURATION_OPTIONS 六档', DURATION_OPTIONS.join(','), '15,30,60,90,120,180')
eq('提醒文案 none', reminderLabel('none', t), '无')
eq('提醒文案 undefined', reminderLabel(undefined, t), '无')
eq('提醒文案 atStart', reminderLabel('atStart', t), '开始时')
eq('提醒文案 15', reminderLabel('15', t), '15 分钟前')
eq('提醒文案 60', reminderLabel('60', t), '1 小时前')
eq('提醒文案 1440', reminderLabel('1440', t), '1 天前')

// ---------- 5. 参与人 ----------
console.log('\n-- 参与人 / RSVP --')
eq('无参与人 → onlySelf', participantsLabel(ev(), t), '仅自己参与')
eq(
  '有参与人 → participantCount',
  participantsLabel(ev({ participants: [{ name: 'A' }, { name: 'B' }] }), t),
  '已邀请 2 位参与人：'
)
eq('RSVP 三选项', RSVP_STATUSES.join(','), 'accept,tentative,decline')
eq('rsvp accept', rsvpLabel('accept', t), '接受')
eq('rsvp tentative', rsvpLabel('tentative', t), '待定')
eq('rsvp decline', rsvpLabel('decline', t), '拒绝')

// ---------- 6. 重复展开 ----------
console.log('\n-- 重复展开 --')
const rep = { kind: 'none' }
eq('none 且区间内 → 1 场', expandOccurrences(ev(), rep, base - DAY, base + DAY).length, 1)
eq('none 且区间外 → 0 场', expandOccurrences(ev(), rep, base + 10 * DAY, base + 12 * DAY).length, 0)

const daily = { kind: 'daily' }
const d3 = expandOccurrences(ev(), daily, base, base + 2 * DAY + 1000)
eq('daily 3 天区间 → 3 场', d3.length, 3)
eq('daily 首场起点正确', d3[0].startAt, base)
eq('daily 次场 +1 天', d3[1].startAt, base + DAY)
eq('daily 每场时长保持 1h', d3[2].endAt - d3[2].startAt, 3600000)

const until = { kind: 'daily', until: base + DAY }
eq('daily 带 until → 2 场', expandOccurrences(ev(), until, base, base + 10 * DAY).length, 2)

// weekly：起点 2026-12-15 是周二 → 只在周二出现
const weekly = { kind: 'weekly' }
const w = expandOccurrences(ev(), weekly, base, base + 21 * DAY)
eq('weekly 3 周期 → 4 场（含起始）', w.length, 4)
eq('weekly 场次间隔 7 天', w[1].startAt - w[0].startAt, 7 * DAY)
ok(
  'weekly 场次均在周二',
  w.every((x) => new Date(x.startAt).getDay() === 2),
  w.map((x) => new Date(x.startAt).getDay())
)

// weekly 指定两个星期（周二 + 周四）
const weekly2 = { kind: 'weekly', weekdays: [2, 4] }
const w2 = expandOccurrences(ev(), weekly2, base, base + 7 * DAY)
eq('weekly 指定周二+周四 → 3 场', w2.length, 3)

// monthly：12-15 起，1/15、2/15 …
const m = expandOccurrences(ev(), { kind: 'monthly' }, base, base + 70 * DAY)
eq('monthly 70 天 → 3 场', m.length, 3)
eq('monthly 次场落在 1/15', new Date(m[1].startAt).getDate(), 15)

// monthly 月末回退：31 日在 2 月回退到 28/29
const jan31 = new Date(2026, 0, 31, 10, 0, 0, 0).getTime()
const mEnd = expandOccurrences(ev({ startAt: jan31, endAt: jan31 + 3600000 }), { kind: 'monthly' }, jan31, jan31 + 60 * DAY)
eq('monthly 1/31 → 2 月回退到月末', new Date(mEnd[1].startAt).getDate(), 28)

// yearly
const y = expandOccurrences(ev(), { kind: 'yearly' }, base, base + 800 * DAY)
eq('yearly 800 天 → 3 场', y.length, 3)
eq('yearly 次场 +1 年', new Date(y[1].startAt).getFullYear(), 2027)

// 起始场次早于 from：不能提前退出（回归防护）
const later = expandOccurrences(ev(), { kind: 'daily' }, base + 5 * DAY, base + 7 * DAY)
eq('daily 从区间中部起 → 3 场（不提前退出）', later.length, 3)
ok('daily 中部起始首场不早于 from', later[0].startAt >= base + 5 * DAY, later[0].startAt - base)
eq('REPEAT_KINDS 五类', REPEAT_KINDS.join(','), 'none,daily,weekly,monthly,yearly')

// ---------- 7. 场次范围 ----------
console.log('\n-- 场次范围 --')
eq('scope 三值', OCCURRENCE_SCOPES.join(','), 'this,thisAndFuture,entire')
eq('scope.this 文案', scopeLabel('this', t), '仅本次')
eq('scope.thisAndFuture 文案', scopeLabel('thisAndFuture', t), '本次及以后')
eq('scope.entire 文案', scopeLabel('entire', t), '全部日程')
eq('scope.this Hint', scopeHintLabel('this', t), '只改这一次，系列里其他场保持原样')
eq('scope.thisAndFuture Hint', scopeHintLabel('thisAndFuture', t), '从这一次起，后面的场次一起改')
eq('scope.entire Hint', scopeHintLabel('entire', t), '整个系列一起改，含已经过去的场次')

// ---------- 8. 日历默认值与输入框 ----------
console.log('\n-- 默认值 / 输入框 --')
eq('默认时长 60', DEFAULT_CALENDAR_DEFAULTS.defaultDurationMinutes, 60)
eq('默认全天提醒 sameDay0900', DEFAULT_CALENDAR_DEFAULTS.allDayReminder, 'sameDay0900')
eq('默认每周第一天 0（周日）', DEFAULT_CALENDAR_DEFAULTS.weekStart, 0)
eq('默认不显示农历', DEFAULT_CALENDAR_DEFAULTS.showLunar, false)
eq('全天提醒 7 档', ALL_DAY_REMINDER_OPTIONS.length, 7)
eq('非全天提醒 7 档', TIMED_REMINDER_OPTIONS.length, 7)
eq('toLocalInput 格式', toLocalInput(base), '2026-12-15T10:00')
eq('fromLocalInput 往返一致', fromLocalInput(toLocalInput(base)), base)
eq('fromLocalInput 空值 → undefined', fromLocalInput(''), undefined)
eq('fromLocalInput 非法 → undefined', fromLocalInput('not-a-date'), undefined)

// ---------- 9. 月历网格 ----------
console.log('\n-- 月历网格 --')
const g = monthGrid(2026, 11, 0) // 2026 年 12 月，周日起
eq('网格 42 格', g.length, 42)
eq('12/1 在网格内', g.some((c) => c.inMonth && new Date(c.ts).getDate() === 1), true)
eq('本月格数 31', g.filter((c) => c.inMonth).length, 31)
eq('首格为周日', new Date(g[0].ts).getDay(), 0)
const gMon = monthGrid(2026, 11, 1)
eq('周一起始时首格为周一', new Date(gMon[0].ts).getDay(), 1)
eq('monthTitle 文案', monthTitle(2026, 11, t), '2026年12月')
eq('peopleCount 文案', peopleCount(3, t), '3 人')

// ---------- 10. 跨天归格 ----------
console.log('\n-- 跨天归格 --')
const day15 = new Date(2026, 11, 15).getTime()
const day16 = new Date(2026, 11, 16).getTime()
const day17 = new Date(2026, 11, 17).getTime()
const span = ev({ endAt: new Date(2026, 11, 16, 9, 0).getTime() })
eq('15 日覆盖', eventCoversDay(span, day15), true)
eq('16 日覆盖（跨天）', eventCoversDay(span, day16), true)
eq('17 日不覆盖', eventCoversDay(span, day17), false)
const allDaySpan = ev({ allDay: true, startAt: day15, endAt: day17 })
eq('全天跨天覆盖中间日', eventCoversDay(allDaySpan, day16), true)
const list = eventsOnDay(
  [
    ev({ id: 'timed', startAt: new Date(2026, 11, 15, 14, 0).getTime(), endAt: new Date(2026, 11, 15, 15, 0).getTime() }),
    ev({ id: 'allday', allDay: true })
  ],
  day15
)
eq('当天 2 条', list.length, 2)
eq('全天排在前', list[0].id, 'allday')

// ---------- 11. 静态接线断言 ----------
console.log('\n-- 静态接线 --')
const types = fs.readFileSync(path.join(ROOT, 'src/shared/types.ts'), 'utf8')
ok('types 定义 ScheduleEvent', /export interface ScheduleEvent/.test(types))
ok('types 定义 EventStatus', /export type EventStatus =/.test(types))
ok('types 定义 EventReminder', /export type EventReminder =/.test(types))
ok('types 定义 RsvpStatus', /export type RsvpStatus =/.test(types))
ok('types 含 eventList IPC', /eventList: 'wb:event:list'/.test(types))
ok('types 含 eventSave IPC', /eventSave: 'wb:event:save'/.test(types))
ok('types 含 eventChanged IPC', /eventChanged: 'wb:event:changed'/.test(types))

const store = fs.readFileSync(path.join(ROOT, 'src/main/store.ts'), 'utf8')
ok('store 建 schedule_events 表', /CREATE TABLE IF NOT EXISTS schedule_events/.test(store))
ok('store 有 start_at 索引', /idx_events_start/.test(store))
ok('store 提供 listEvents', /listEvents\(/.test(store))
ok('store 提供 saveEvent', /saveEvent\(/.test(store))
ok('store 提供 deleteEvent', /deleteEvent\(/.test(store))
ok('store 提供 cancelEvent', /cancelEvent\(/.test(store))
ok('store 提供 getCalendarDefaults', /getCalendarDefaults\(/.test(store))
ok('store 提供 saveCalendarDefaults', /saveCalendarDefaults\(/.test(store))
ok('listEvents 按区间交叠过滤', /start_at <= \?/.test(store) && /end_at >= \?/.test(store))

const ipc = fs.readFileSync(path.join(ROOT, 'src/main/ipc.ts'), 'utf8')
ok('ipc 注册 eventList', /IPC\.eventList/.test(ipc))
ok('ipc 注册 eventSave', /IPC\.eventSave/.test(ipc))
ok('ipc 注册 eventDelete', /IPC\.eventDelete/.test(ipc))
ok('ipc 注册 eventSettings', /IPC\.eventSettings/.test(ipc))
ok('ipc 有 broadcastEventChanged', /export function broadcastEventChanged/.test(ipc))

const preload = fs.readFileSync(path.join(ROOT, 'src/preload/index.ts'), 'utf8')
ok('preload 暴露 eventList', /eventList/.test(preload))
ok('preload 暴露 onEventChanged', /onEventChanged/.test(preload))
ok('preload 暴露 eventSettingsSave', /eventSettingsSave/.test(preload))

const app = fs.readFileSync(path.join(ROOT, 'src/renderer/src/App.tsx'), 'utf8')
ok('App 引入 SchedulePanel', /import SchedulePanel/.test(app))
ok('App 有日历入口按钮', /setShowSchedule\(true\)/.test(app))
ok('App 挂载 SchedulePanel', /<SchedulePanel/.test(app))
// Esc 由面板自身逐层处理（表单 → 删除确认 → 详情卡 → 面板）；
// App 侧只让出控制权而不直接关闭，否则一次 Esc 会同时关掉内层与面板（跳层）
ok('App Esc 让出日历面板控制权', /if \(showSchedule\) return\b/.test(app))

const panel = fs.readFileSync(path.join(ROOT, 'src/renderer/src/components/SchedulePanel.tsx'), 'utf8')
ok('面板自行处理 Esc 逐层关闭', /window\.addEventListener\('keydown', onKey, true\)/.test(panel) && /stopImmediatePropagation/.test(panel))
ok('面板含侧栏', /sched-side/.test(panel))
ok('面板含月历网格', /sched-mini-grid/.test(panel))
ok('面板含搜索', /sidebar\.searchPlaceholder/.test(panel))
ok('面板含分组筛选', /SOURCE_GROUPS/.test(panel))
ok('面板含叠加开关', /overlayPersonal/.test(panel))
ok('面板含创建表单', /sched-dialog/.test(panel))
ok('面板含详情卡', /kindLine\(detail/.test(panel))
ok('面板含 RSVP', /home\.schedule\.rsvp\./.test(panel))
ok('面板含删除二次确认', /deleteConfirmBody/.test(panel))
ok('面板含桩提示对齐', /hint\.notImplemented/.test(panel) && /hint\.noContract/.test(panel))
ok('面板含日历设置', /settings\.title/.test(panel))

const css = fs.readFileSync(path.join(ROOT, 'src/renderer/src/styles/global.css'), 'utf8')
ok('CSS 含 .sched-panel', /\.sched-panel/.test(css))
ok('CSS 含 .sched-mini-cell', /\.sched-mini-cell/.test(css))
ok('CSS 含 .sched-card 状态色', /\.sched-card\.st-ongoing/.test(css))
ok('CSS 含 .sched-rsvp', /\.sched-rsvp/.test(css))

const i18n = fs.readFileSync(path.join(ROOT, 'src/renderer/src/i18n/index.ts'), 'utf8')
ok('i18n 中文含 home.schedule', i18n.includes("'home.schedule.summary.when'"))
ok('i18n 英文含 home.schedule', /'home\.schedule\.summary\.when': '\{year\}/.test(i18n))
ok('i18n 含 recurrence 键', i18n.includes("'home.schedule.create.recurrence.none'"))

// 键覆盖度：scheduleEvent.ts 引用的所有键都必须存在于中文词典
const src = fs.readFileSync(path.join(ROOT, 'src/shared/scheduleEvent.ts'), 'utf8')
const refs = [...src.matchAll(/t\(['"]([^'"]+)['"]\)/g)].map((m) => m[1])
const dyn = [...src.matchAll(/`(home\.schedule\.[a-zA-Z.]+)\$\{/g)].map((m) => m[1])
const missing = refs.filter((k) => !(k in ZH))
ok(`scheduleEvent.ts 静态键全部存在于词典（${refs.length} 个）`, missing.length === 0, missing)
ok('存在动态模板键（星期/状态/提醒等）', dyn.length > 0, dyn)

// scheduleEvent.ts 动态引用的前缀，逐一验证其序号/枚举全覆盖
const dynChecks = [
  ...[0, 1, 2, 3, 4, 5, 6].map((i) => `home.schedule.weekday.${i}`),
  ...EVENT_STATUSES.map((s) => `home.schedule.summary.status.${s}`),
  ...['none', 'atStart', '15', '60', '1440'].map((r) => `home.schedule.create.reminder.${r}`),
  ...RSVP_STATUSES.map((s) => `home.schedule.rsvp.${s}`),
  ...OCCURRENCE_SCOPES.flatMap((s) => [`home.schedule.occurrence.scope.${s}`, `home.schedule.occurrence.scope.${s}Hint`]),
  ...DURATION_OPTIONS.map((d) => `home.schedule.settings.duration.${d}`)
]
const dynMissing = dynChecks.filter((k) => !(k in ZH))
ok(`动态模板键全覆盖（${dynChecks.length} 个）`, dynMissing.length === 0, dynMissing)
// 占位符一致性：实现里 fill 的变量名必须出现在原文模板中
const ph = (k) => [...(ZH[k] ?? '').matchAll(/\{(\w+)\}/g)].map((m) => m[1])
ok('when 模板占位符', ph('home.schedule.summary.when').join(',') === 'year,month,day,startClock,endClock', ph('home.schedule.summary.when'))
ok(
  'whenCrossDay 模板占位符',
  ph('home.schedule.summary.whenCrossDay').join(',') === 'year,month,day,startClock,endMonth,endDay,endClock',
  ph('home.schedule.summary.whenCrossDay')
)
ok('whenAllDaySpan 模板占位符', ph('home.schedule.summary.whenAllDaySpan').join(',') === 'year,month,day,endMonth,endDay', ph('home.schedule.summary.whenAllDaySpan'))
ok('participantCount 模板占位符', ph('home.schedule.summary.participantCount').join(',') === 'count', ph('home.schedule.summary.participantCount'))

console.log(`\n结果：${pass}/${pass + fail} 通过`)
process.exit(fail === 0 ? 0 : 1)
