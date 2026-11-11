import type { Schedule, ScheduleKind, Weekday } from './types'

/**
 * 调度计算 —— 对齐原版 `automation.schedule.*`（93 条）：
 * - 分型：单次(once) / 每天(daily) / 工作日(workday) / 每周(weekly) / 双周(biweekly) /
 *         每月(monthly) / 每年(yearly) / 按间隔(interval)
 * - 摘要文案：`schedule.summary.*` 与 `intervalSummary*`
 * - 校验：`schedule.validation.*`（dateRequired / weekdayRequired / monthdayRequired /
 *         onceFutureRequired / intervalHours / onceCorrectedToNow）
 *
 * 时间一律按**本机本地时区**计算（原版为本地客户端定时任务）。
 */

// ISO 星期 → JS getDay()（0=周日）
const ISO_TO_JS_DAY: Record<Weekday, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 0 }
const JS_DAY_TO_ISO: Weekday[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

export const ALL_WEEKDAYS: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
export const WORKDAYS: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR']
export const WEEKEND: Weekday[] = ['SA', 'SU']

/** 解析 `HH:mm` → {hours, minutes}；非法回落 09:00 */
function parseTime(time?: string): { hours: number; minutes: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time ?? '')
  if (!m) return { hours: 9, minutes: 0 }
  const hours = Math.min(23, Math.max(0, Number(m[1])))
  const minutes = Math.min(59, Math.max(0, Number(m[2])))
  return { hours, minutes }
}

function atTimeOfDay(base: Date, time?: string): Date {
  const { hours, minutes } = parseTime(time)
  const d = new Date(base)
  d.setHours(hours, minutes, 0, 0)
  return d
}

function startOfDay(ts: number): Date {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d
}

function jsDayOf(d: Date): Weekday {
  return JS_DAY_TO_ISO[d.getDay()]
}

/**
 * 计算下次运行时间 —— 返回毫秒时间戳；无后续运行（如已过期的 once）返回 undefined。
 * `from` 为基准时刻（默认 now），语义为「严格大于 from」的下一次。
 */
export function nextRun(schedule: Schedule, from: number = Date.now()): number | undefined {
  switch (schedule.kind) {
    case 'once': {
      // 单次：必须在未来（对齐 validation.onceFutureRequired）
      return schedule.at !== undefined && schedule.at > from ? schedule.at : undefined
    }
    case 'daily':
    case 'workday': {
      const todayRun = atTimeOfDay(new Date(from), schedule.time).getTime()
      if (todayRun > from) {
        // workday 需落在工作日
        if (schedule.kind === 'daily') return todayRun
        const wd = jsDayOf(new Date(todayRun))
        if (WORKDAYS.includes(wd)) return todayRun
      }
      // 逐日推进至下一个合法日
      for (let i = 1; i <= 14; i++) {
        const cand = atTimeOfDay(new Date(startOfDay(from).getTime() + i * 86400000), schedule.time).getTime()
        if (cand <= from) continue
        if (schedule.kind === 'daily') return cand
        if (WORKDAYS.includes(jsDayOf(new Date(cand)))) return cand
      }
      return undefined
    }
    case 'weekly':
    case 'biweekly': {
      const days = (schedule.weekdays?.length ? schedule.weekdays : ALL_WEEKDAYS).slice()
      // weekly：本周内（含今日）之后的匹配星期；无则顺延下周
      for (let i = 0; i <= 7; i++) {
        const cand = atTimeOfDay(new Date(startOfDay(from).getTime() + i * 86400000), schedule.time).getTime()
        if (cand <= from) continue
        if (days.includes(jsDayOf(new Date(cand)))) return cand
      }
      // biweekly：本周无匹配时，跳到下一周同星期集合
      if (schedule.kind === 'biweekly') {
        for (let i = 8; i <= 14; i++) {
          const cand = atTimeOfDay(new Date(startOfDay(from).getTime() + i * 86400000), schedule.time).getTime()
          if (days.includes(jsDayOf(new Date(cand)))) return cand
        }
      }
      return undefined
    }
    case 'monthly': {
      const days = (schedule.monthDays?.length ? schedule.monthDays : [1]).slice().sort((a, b) => a - b)
      // 遍历未来 62 天，命中任一指定日即可（monthly 的日出现在每月固定日）
      for (let i = 0; i <= 62; i++) {
        const cand = atTimeOfDay(new Date(startOfDay(from).getTime() + i * 86400000), schedule.time).getTime()
        if (cand <= from) continue
        if (days.includes(new Date(cand).getDate())) return cand
      }
      return undefined
    }
    case 'yearly': {
      const month = schedule.month ?? 1
      const days = (schedule.monthDays?.length ? schedule.monthDays : [1]).slice().sort((a, b) => a - b)
      const fromYear = new Date(from).getFullYear()
      for (let y = fromYear; y <= fromYear + 2; y++) {
        for (const day of days) {
          const cand = atTimeOfDay(new Date(y, month - 1, day), schedule.time).getTime()
          if (cand > from) return cand
        }
      }
      return undefined
    }
    case 'interval': {
      const step = Math.max(60, schedule.intervalMinutes ?? 60) * 60000
      // 对齐 validation.intervalHours「按间隔执行需至少每 1 小时」
      const base = startOfDay(from).getTime()
      const fromHour = schedule.hourFrom
      const toHour = schedule.hourTo
      let cursor = base + (fromHour !== undefined ? fromHour * 3600000 : 0)
      // 从今天的窗口起点起，按 step 推进；跨出窗口则跳到明天窗口起点
      let guard = 0
      while (cursor <= from) {
        cursor += step
        if (fromHour !== undefined && toHour !== undefined) {
          const hour = new Date(cursor).getHours()
          if (hour >= toHour) {
            const d = startOfDay(cursor + 86400000).getTime() + fromHour * 3600000
            cursor = d
          }
        }
        if (++guard > 24 * 366) return undefined
      }
      // 复查窗口上界
      if (fromHour !== undefined && toHour !== undefined && new Date(cursor).getHours() >= toHour) {
        cursor = startOfDay(cursor + 86400000).getTime() + fromHour * 3600000
      }
      return cursor
    }
    default:
      return undefined
  }
}

/** 星期列表 → 文案（对齐 `automation.day.*`；工作日/周末走聚合词） */
export function weekdaysLabel(weekdays: Weekday[], t: (k: string) => string): string {
  if (!weekdays.length) return ''
  const sorted = weekdays.slice().sort((a, b) => ALL_WEEKDAYS.indexOf(a) - ALL_WEEKDAYS.indexOf(b))
  if (sorted.length === 5 && WORKDAYS.every((d) => sorted.includes(d))) return t('automation.schedule.weekdays')
  if (sorted.length === 2 && WEEKEND.every((d) => sorted.includes(d))) return t('automation.schedule.weekend')
  if (sorted.length === 7) return t('automation.schedule.periodicDay')
  return sorted.map((d) => t(`automation.day.${d}`)).join('、')
}

/**
 * 生成调度摘要 —— 对齐 `automation.schedule.summary.*` 与 `intervalSummary*`。
 * 逐字复用原版文案模板与占位符（{days}/{time}/{dateTime}/{month}/{day}/{count}）。
 */
export function scheduleSummary(schedule: Schedule, t: (k: string) => string): string {
  const time = schedule.time ?? '09:00'
  switch (schedule.kind) {
    case 'once': {
      const d = new Date(schedule.at ?? 0)
      const pad = (n: number) => String(n).padStart(2, '0')
      const dateTime = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
      return t('automation.schedule.summary.once').replace('{dateTime}', dateTime)
    }
    case 'daily':
      return t('automation.schedule.summary.daily').replace('{time}', time)
    case 'workday':
      return t('automation.schedule.workdayAt').replace('{time}', time)
    case 'weekly':
      return t('automation.schedule.summary.weekly')
        .replace('{days}', weekdaysLabel(schedule.weekdays ?? [], t))
        .replace('{time}', time)
    case 'biweekly':
      return t('automation.schedule.summary.biweekly')
        .replace('{days}', weekdaysLabel(schedule.weekdays ?? [], t))
        .replace('{time}', time)
    case 'monthly':
      return t('automation.schedule.summary.monthly')
        .replace('{day}', (schedule.monthDays ?? [1]).map((d) => `${d} 号`).join('、'))
        .replace('{time}', time)
    case 'yearly':
      return t('automation.schedule.summary.yearly')
        .replace('{month}', String(schedule.month ?? 1))
        .replace('{day}', `${(schedule.monthDays ?? [1])[0]} 日`)
        .replace('{time}', time)
    case 'interval': {
      const minutes = Math.max(60, schedule.intervalMinutes ?? 60)
      const isHourly = minutes % 60 === 0
      const count = isHourly ? minutes / 60 : minutes
      const template = isHourly
        ? t('automation.schedule.intervalSummary')
        : t('automation.schedule.intervalSummaryMinutes')
      const daysLabel =
        schedule.hourFrom !== undefined && schedule.hourTo !== undefined
          ? t('automation.schedule.hourlyRangeAt')
              .replace('{from}', String(schedule.hourFrom))
              .replace('{to}', String(schedule.hourTo))
          : t('automation.schedule.periodicDay')
      return template.replace('{days}', daysLabel).replace('{count}', String(count))
    }
    default:
      return ''
  }
}

/**
 * 校验调度规则 —— 对齐 `automation.schedule.validation.*`。
 * 返回错误键（i18n key）或 null（通过）。`now` 可注入便于测试。
 */
export function validateSchedule(schedule: Schedule, now: number = Date.now()): string | null {
  switch (schedule.kind) {
    case 'once':
      if (schedule.at === undefined) return 'automation.schedule.validation.onceDateRequired'
      // 对齐 onceFutureRequired「单次执行时间必须晚于当前时间」
      if (schedule.at <= now) return 'automation.schedule.validation.onceFutureRequired'
      return null
    case 'weekly':
    case 'biweekly':
      if (!schedule.weekdays?.length) return 'automation.schedule.validation.weekdayRequired'
      return null
    case 'monthly':
      if (!schedule.monthDays?.length) return 'automation.schedule.validation.monthdayRequired'
      return null
    case 'yearly':
      if (schedule.month === undefined) return 'automation.schedule.validation.monthRequired'
      if (!schedule.monthDays?.length) return 'automation.schedule.validation.monthdayRequired'
      return null
    case 'interval':
      // 对齐 intervalHours「按间隔执行需至少每 1 小时」
      if ((schedule.intervalMinutes ?? 0) < 60) return 'automation.schedule.validation.intervalHours'
      return null
    case 'daily':
    case 'workday':
    default:
      return null
  }
}

/**
 * 单次时间纠正 —— 对齐 `onceCorrectedToNow`「所选时间已过，已自动调整为当前时间，请确认」。
 * 返回 { at, corrected }，corrected=true 表示原值已过并被调整。
 */
export function normalizeOnceTime(at: number, now: number = Date.now()): { at: number; corrected: boolean } {
  if (at <= now) return { at: now, corrected: true }
  return { at, corrected: false }
}

/** 调度是否已过期（once 且已过）—— 对齐 `card.expiredHint` */
export function isExpired(schedule: Schedule, now: number = Date.now()): boolean {
  return schedule.kind === 'once' && schedule.at !== undefined && schedule.at <= now
}

export const SCHEDULE_KINDS: ScheduleKind[] = [
  'once',
  'daily',
  'workday',
  'weekly',
  'biweekly',
  'monthly',
  'yearly',
  'interval'
]

/** 星期在 JS Date 上的匹配（供调度器快速判断今天是否命中） */
export function matchesWeekday(weekdays: Weekday[], date: Date): boolean {
  return weekdays.some((w) => ISO_TO_JS_DAY[w] === date.getDay())
}
