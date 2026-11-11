import type { EventReminder, EventStatus, RsvpStatus, ScheduleEvent } from './types'

/**
 * 日程计算 —— 对齐原版 `home.schedule.*`（676 条）。
 *
 * 本模块只做**纯计算**，与 30s 轮询的定时任务（`schedule.ts` / `automation.*`）无关：
 * 这里是「日历」语义 —— 用户建一条日程，系统推导它的状态、摘要文案、提醒时刻，
 * 并支持把重复日程展开成一段区间内的若干场次。
 *
 * 原文对其自身未实现的部分显式标注了桩文案（`hint.notImplemented`=暂未实现、
 * `hint.noContract`=当前版本暂无接口，仅展示效果、`hint.notWired`=接口已定义，暂未接入），
 * 复刻时同样以「渲染原文桩提示」的方式对齐，而非真去接在线会议 / 会议室预约。
 *
 * 翻译函数约定与 `schedule.ts` 一致：`t: (key) => string`，占位符由调用方自行替换。
 */

type T = (key: string) => string

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

function fill(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
}

// ==================== 提醒 ====================

/** 提醒选项 → 相对开始时间的偏移分钟数（atStart=0；none 不提醒） */
export function reminderOffsetMinutes(reminder: EventReminder | undefined): number | undefined {
  switch (reminder) {
    case 'atStart':
      return 0
    case '15':
      return 15
    case '60':
      return 60
    case '1440':
      return 1440
    default:
      return undefined
  }
}

/** 提醒触发时刻（毫秒）；`none` / 未设置返回 undefined —— 对齐 `summary.reminderNone`=无 */
export function reminderAt(event: Pick<ScheduleEvent, 'startAt' | 'reminder'>): number | undefined {
  const offset = reminderOffsetMinutes(event.reminder)
  return offset === undefined ? undefined : event.startAt - offset * MINUTE
}

// ==================== 状态 ====================

/**
 * 状态推导 —— 对齐 `home.schedule.summary.status.*`：
 * upcoming=待开始 / ongoing=进行中 / ended=已结束 / cancelled=已取消。
 * `cancelled` 优先于时间推导。
 */
export function eventStatus(event: Pick<ScheduleEvent, 'startAt' | 'endAt' | 'cancelled'>, now: number = Date.now()): EventStatus {
  if (event.cancelled) return 'cancelled'
  if (now < event.startAt) return 'upcoming'
  if (now < event.endAt) return 'ongoing'
  return 'ended'
}

export const EVENT_STATUSES: EventStatus[] = ['upcoming', 'ongoing', 'ended', 'cancelled']

/** 状态 → 文案 —— 对齐 `home.schedule.summary.status.{upcoming|ongoing|ended|cancelled}` */
export function eventStatusLabel(status: EventStatus, t: T): string {
  return t(`home.schedule.summary.status.${status}`)
}

// ==================== 时间格式化 ====================

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** `HH:mm`（24 小时制，本地时区） */
export function clock(ts: number): string {
  const d = new Date(ts)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 星期名 —— 对齐 `home.schedule.weekday.0`~`6`（周日~周六，与 JS getDay 同序） */
export function weekdayName(ts: number, t: T): string {
  return t(`home.schedule.weekday.${new Date(ts).getDay()}`)
}

/** 时长文案 —— 对齐 `create.duration.minutes` / `hour`（1 小时）/ `hours`（{count} 小时） */
export function durationLabel(minutes: number, t: T): string {
  if (minutes === 60) return t('home.schedule.create.duration.hour')
  if (minutes < 60) return fill(t('home.schedule.create.duration.minutes'), { count: minutes })
  if (minutes % 60 === 0) return fill(t('home.schedule.create.duration.hours'), { count: minutes / 60 })
  return fill(t('home.schedule.create.duration.hours'), { count: Math.floor(minutes / 60) }) + fill(t('home.schedule.create.duration.minutes'), { count: minutes % 60 })
}

/**
 * 时间行摘要 —— 逐字对齐 `home.schedule.summary.*`：
 * - 单日全天 → `whenAllDay`（{year} 年 {month} 月 {day} 日 · 全天）
 * - 跨日全天 → `whenAllDaySpan`
 * - 单日定时 → `when`（… · {startClock}—{endClock}）
 * - 跨日定时 → `whenCrossDay`
 *
 * 注意原文 `when` 用的是 em dash（—）紧贴时刻，跨日模板中间的连接符是 ` — `（前后带空格），
 * 二者不等价，不可混用。
 */
export function whenLabel(event: Pick<ScheduleEvent, 'startAt' | 'endAt' | 'allDay'>, t: T): string {
  const s = new Date(event.startAt)
  const e = new Date(event.endAt)
  const crossDay = s.getFullYear() !== e.getFullYear() || s.getMonth() !== e.getMonth() || s.getDate() !== e.getDate()
  const base = { year: s.getFullYear(), month: s.getMonth() + 1, day: s.getDate() }
  if (event.allDay) {
    if (!crossDay) return fill(t('home.schedule.summary.whenAllDay'), base)
    return fill(t('home.schedule.summary.whenAllDaySpan'), { ...base, endMonth: e.getMonth() + 1, endDay: e.getDate() })
  }
  if (!crossDay) return fill(t('home.schedule.summary.when'), { ...base, startClock: clock(event.startAt), endClock: clock(event.endAt) })
  return fill(t('home.schedule.summary.whenCrossDay'), {
    ...base,
    startClock: clock(event.startAt),
    endMonth: e.getMonth() + 1,
    endDay: e.getDate(),
    endClock: clock(event.endAt)
  })
}

/** 首行类型+状态 —— 对齐 `summary.kindLine`=「日程 {status}」 */
export function kindLine(event: Pick<ScheduleEvent, 'startAt' | 'endAt' | 'cancelled'>, t: T, now?: number): string {
  return fill(t('home.schedule.summary.kindLine'), { status: eventStatusLabel(eventStatus(event, now), t) })
}

/**
 * 提醒行文案 —— 摘要用 `summary.reminderNone`=无，其余用**新建表单**的
 * `create.reminder.*` 档位名（none/atStart/15/60/1440），这是原文唯一的档位命名处。
 */
export function reminderLabel(reminder: EventReminder | undefined, t: T): string {
  if (!reminder || reminder === 'none') return t('home.schedule.summary.reminderNone')
  return t(`home.schedule.create.reminder.${reminder}`)
}

// ==================== 参与人 ====================

/** 参与人行 —— 对齐 `summary.participantCount`=已邀请 {count} 位参与人： / `summary.onlySelf`=仅自己参与 */
export function participantsLabel(event: Pick<ScheduleEvent, 'participants'>, t: T): string {
  const list = event.participants ?? []
  if (list.length === 0) return t('home.schedule.summary.onlySelf')
  return fill(t('home.schedule.summary.participantCount'), { count: list.length })
}

export const RSVP_STATUSES: RsvpStatus[] = ['accept', 'tentative', 'decline']

/** RSVP 选项文案 —— 对齐 `rsvp.accept/tentative/decline`（另有 `needsAction`=未响应 作初始态） */
export function rsvpLabel(status: RsvpStatus, t: T): string {
  return t(`home.schedule.rsvp.${status}`)
}

// ==================== 重复与场次展开 ====================

/**
 * 重复规则 —— 对齐 `occurrence.scope.*` 的系列语义：原文同时提供「重复日程」编辑确认
 * （`edit.confirm.*`）与场次范围选择（仅本次 / 本次及以后 / 全部日程），故模型需保留系列粒度。
 *
 * 结构与 `types.ts` 中 `ScheduleEvent.repeat` 一致，此处取别名以免两处定义漂移。
 */
export type EventRepeat = NonNullable<ScheduleEvent['repeat']>

export const REPEAT_KINDS: EventRepeat['kind'][] = ['none', 'daily', 'weekly', 'monthly', 'yearly']

function startOfDayTs(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** 按重复类型推进到下一场次起点（严格单调，否则返回原值供调用方断路） */
function step(cursor: number, repeat: EventRepeat): number {
  const d = new Date(cursor)
  switch (repeat.kind) {
    case 'daily':
    case 'weekly':
      return cursor + DAY
    case 'monthly': {
      // 按「起始日的日号」推进；目标月天数不足时回退到该月最后一天
      const dayOfMonth = d.getDate()
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1, d.getHours(), d.getMinutes(), 0, 0)
      const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
      next.setDate(Math.min(dayOfMonth, lastDay))
      return next.getTime()
    }
    case 'yearly':
      return new Date(d.getFullYear() + 1, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), 0, 0).getTime()
    default:
      return cursor
  }
}

/**
 * 把一条日程展开为 [from, to] 区间内的若干场次。
 * - `kind='none'`：仅当与区间有交叠时返回其自身
 * - 重复：从起始场次起按规则推进，`until` 与外层 `to` 双向截止
 * - weekly：`weekdays` 命中才算一场（为空则沿用起始日的星期）
 *
 * 起始场次早于 `from` 的，仍需逐步推进（不能提前退出），否则会漏掉区间内的场次。
 */
export function expandOccurrences(event: ScheduleEvent, repeat: EventRepeat, from: number, to: number): ScheduleEvent[] {
  const span = event.endAt - event.startAt
  if (repeat.kind === 'none') return event.startAt <= to && event.endAt >= from ? [event] : []
  const out: ScheduleEvent[] = []
  const hardStop = repeat.until !== undefined ? Math.min(to, repeat.until) : to
  const weekdays = repeat.weekdays && repeat.weekdays.length > 0 ? repeat.weekdays : [new Date(event.startAt).getDay()]
  let cursor = event.startAt
  let guard = 0
  while (cursor <= hardStop && guard++ < 2000) {
    const hit = repeat.kind !== 'weekly' || weekdays.includes(new Date(cursor).getDay())
    if (hit && cursor + span >= from) out.push({ ...event, startAt: cursor, endAt: cursor + span })
    const next = step(cursor, repeat)
    if (next <= cursor) break
    cursor = next
  }
  return out
}

/** 场次范围 —— 对齐 `occurrence.scope.*`（this=仅本次 / thisAndFuture=本次及以后 / entire=全部日程） */
export type OccurrenceScope = 'this' | 'thisAndFuture' | 'entire'

export const OCCURRENCE_SCOPES: OccurrenceScope[] = ['this', 'thisAndFuture', 'entire']

export function scopeLabel(scope: OccurrenceScope, t: T): string {
  return t(`home.schedule.occurrence.scope.${scope}`)
}

export function scopeHintLabel(scope: OccurrenceScope, t: T): string {
  return t(`home.schedule.occurrence.scope.${scope}Hint`)
}

// ==================== 日历默认设置（对齐 settings.*） ====================

/**
 * 日历默认设置 —— 对齐 `home.schedule.settings.*`：
 * 「仅设置新建日程的默认行为」—— 默认时长、非全天/全天默认提醒、每周第一天、是否显示农历。
 */
export interface CalendarDefaults {
  /** 日程默认时长（分钟）—— 对齐 `settings.duration.{15,30,60,90,120,180}` */
  defaultDurationMinutes: number
  /** 非全天日程默认提醒 —— 对齐 `settings.timedReminder.*` */
  timedReminder: string
  /** 全天日程默认提醒 —— 对齐 `settings.allDayReminder.*` */
  allDayReminder: string
  /** 每周第一天：0=周日 / 1=周一 —— 对齐 `settings.field.weekStart` */
  weekStart: number
  /** 是否显示农历 —— 对齐 `settings.field.showLunar` */
  showLunar: boolean
}

export const DEFAULT_CALENDAR_DEFAULTS: CalendarDefaults = {
  defaultDurationMinutes: 60,
  timedReminder: 'min15',
  allDayReminder: 'sameDay0900',
  weekStart: 0,
  showLunar: false
}

/** 默认时长可选值 —— 对齐 `settings.duration.*` 的 6 档 */
export const DURATION_OPTIONS = [15, 30, 60, 90, 120, 180]

/** 全天提醒档位 —— 对齐 `settings.allDayReminder.*` */
export const ALL_DAY_REMINDER_OPTIONS = ['none', 'sameDay0800', 'sameDay0900', 'prevDay1800', 'prevDay0900', 'days20900', 'week10900']

/** 非全天提醒档位 —— 对齐 `settings.timedReminder.*` */
export const TIMED_REMINDER_OPTIONS = ['none', 'atStart', 'min5', 'min15', 'min30', 'hour1', 'day1']

// ==================== 输入框与月历网格 ====================

/** 时间戳 → `datetime-local` 输入框值（本地时区，`YYYY-MM-DDTHH:mm`） */
export function toLocalInput(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** `datetime-local` 值 → 时间戳（空值回落 undefined） */
export function fromLocalInput(value: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value ?? '')
  if (!m) return undefined
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), 0, 0).getTime()
}

/** 月历网格 —— 返回覆盖 [year, month] 的 6×7 = 42 个日格（含前后月补位），对齐日历侧栏 */
export function monthGrid(year: number, month: number, weekStart = 0): { ts: number; inMonth: boolean }[] {
  const first = new Date(year, month, 1)
  first.setHours(0, 0, 0, 0)
  const offset = (first.getDay() - weekStart + 7) % 7
  const cells: { ts: number; inMonth: boolean }[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month, 1 - offset + i)
    d.setHours(0, 0, 0, 0)
    cells.push({ ts: d.getTime(), inMonth: d.getMonth() === month })
  }
  return cells
}

/** 月标题 —— 对齐 `sidebar.monthTitle`=`{year}年{month}月` */
export function monthTitle(year: number, month: number, t: T): string {
  return fill(t('home.schedule.sidebar.monthTitle'), { year, month: month + 1 })
}

/** 编辑确认里的人数 —— 对齐 `edit.confirm.peopleCount`=`{count} 人` */
export function peopleCount(count: number, t: T): string {
  return fill(t('home.schedule.edit.confirm.peopleCount'), { count })
}

/** 某日是否在日程区间内（含跨天，用于月视图归格） */
export function eventCoversDay(event: Pick<ScheduleEvent, 'startAt' | 'endAt'>, dayTs: number): boolean {
  const dayStart = startOfDayTs(dayTs)
  return event.startAt < dayStart + DAY && event.endAt >= dayStart
}

/** 按天分组渲染用：把日程铺到它覆盖的每个日格上 */
export function eventsOnDay(events: ScheduleEvent[], dayTs: number): ScheduleEvent[] {
  return events.filter((e) => eventCoversDay(e, dayTs)).sort((a, b) => Number(b.allDay ?? false) - Number(a.allDay ?? false) || a.startAt - b.startAt)
}
