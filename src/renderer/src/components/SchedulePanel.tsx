import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from '../i18n'
import { toast } from '../stores/useToast'
import type { EventReminder, EventSourceKind, ScheduleEvent } from '../../../shared/types'
import {
  ALL_DAY_REMINDER_OPTIONS,
  DURATION_OPTIONS,
  DEFAULT_CALENDAR_DEFAULTS,
  REPEAT_KINDS,
  TIMED_REMINDER_OPTIONS,
  clock,
  durationLabel,
  eventStatus,
  eventStatusLabel,
  eventsOnDay,
  fromLocalInput,
  kindLine,
  monthGrid,
  monthTitle,
  participantsLabel,
  reminderLabel,
  toLocalInput,
  whenLabel,
  weekdayName,
  type CalendarDefaults,
  type EventRepeat
} from '../../../shared/scheduleEvent'
import { useScheduleEvents } from '../stores/useScheduleEvents'

/**
 * 日程 / 日历面板 —— 对齐原版 `home.schedule.*`（676 条）。
 *
 * 结构：
 * - 左侧栏：月历网格（上月/下月、收起/展开）+ 搜索 + 分组筛选（我管理的 / 所在频道 / 我订阅的）+ 叠加开关
 * - 主区：月视图（每天一列，日程块按全天/定时分型）+ 今日概览
 * - 创建 / 编辑表单：表单模式与自然语言模式（原文同一份字段，NL 仅负责草稿）
 * - 详情卡：摘要行 + 状态 + 参与人 + RSVP + 删除二次确认 + 在线会议桩提示
 *
 * 原文对其自身未实现的能力显式标注了桩文案（`hint.notImplemented` / `hint.noContract` /
 * `hint.onlineMeetingUnavailable`），复刻同样以渲染这些提示对齐，而非杜撰实现。
 */

interface Props {
  onClose: () => void
}

/** 当前是「我管理的」还是「所在频道」还是「我订阅的」—— 对齐 sidebar.managed/channels/subscribed */
const SOURCE_GROUPS: EventSourceKind[] = ['managed', 'channels', 'subscribed']

/** 新建日程草稿 —— 对齐 home.schedule.field.* 的字段集 */
interface Draft {
  id: string
  title: string
  startAt: number
  endAt: number
  allDay: boolean
  location: string
  description: string
  reminder: EventReminder
  repeatKind: EventRepeat['kind']
  repeatWeekdays: number[]
  participants: string
  source: EventSourceKind
}

function defaultDraft(defaults: CalendarDefaults, anchorDay: number): Draft {
  // 默认时长与提醒取自日历设置（对齐 settings.subtitle「仅设置新建日程的默认行为」）
  const start = new Date(anchorDay)
  start.setHours(9, 0, 0, 0)
  return {
    id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: '',
    startAt: start.getTime(),
    endAt: start.getTime() + defaults.defaultDurationMinutes * 60_000,
    allDay: false,
    location: '',
    description: '',
    reminder: (defaults.timedReminder === 'none' ? 'none' : defaults.timedReminder === 'atStart' ? 'atStart' : defaults.timedReminder === 'min15' ? '15' : '15') as EventReminder,
    repeatKind: 'none',
    repeatWeekdays: [],
    participants: '',
    source: 'managed'
  }
}

function draftFromEvent(e: ScheduleEvent): Draft {
  return {
    id: e.id,
    title: e.title,
    startAt: e.startAt,
    endAt: e.endAt,
    allDay: !!e.allDay,
    location: e.location ?? '',
    description: e.description ?? '',
    reminder: e.reminder ?? 'none',
    repeatKind: e.repeat?.kind ?? 'none',
    repeatWeekdays: e.repeat?.weekdays ?? [],
    participants: (e.participants ?? []).map((p) => p.name).join(', '),
    source: e.source ?? 'managed'
  }
}

export default function SchedulePanel({ onClose }: Props) {
  const { t } = useTranslation()
  const store = useScheduleEvents()

  // 侧栏与视图状态
  const [collapsed, setCollapsed] = useState(false)
  const [query, setQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | EventSourceKind>('all')
  // 叠加开关 —— 对齐 sidebar.overlayPersonal / overlayTeamTodos / overlayMyTodos
  const [overlayPersonal, setOverlayPersonal] = useState(true)
  const [overlayTodos, setOverlayTodos] = useState(false)

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }, [])
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [selectedDay, setSelectedDay] = useState(today)

  const [defaults, setDefaults] = useState<CalendarDefaults>(DEFAULT_CALENDAR_DEFAULTS)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ScheduleEvent | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    // 只取当前月视图范围 + 前后一个月，避免长历史全量加载
    const from = new Date(cursor.year, cursor.month - 1, 1).getTime()
    const to = new Date(cursor.year, cursor.month + 2, 1).getTime()
    await store.load({ from, to })
  }, [cursor.year, cursor.month, store])

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor.year, cursor.month])

  useEffect(() => {
    void window.workbuddy.eventSettings().then(setDefaults)
  }, [])

  useEffect(() => {
    const off = window.workbuddy.onEventChanged(() => void refresh())
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh])

  /**
   * Esc 逐层关闭：表单 → 删除确认 → 详情卡 → 面板。
   *
   * 用 capture 阶段 + stopImmediatePropagation：App 的全局 Esc 处理器也在 window 上，
   * 若不拦截，一次 Esc 会同时关掉内层与整个面板（跳层），与原版逐层退出的行为不符。
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (draft) return setDraft(null)
      // 删除确认上的 Esc 与「取消」不同：取消回到详情，Esc 一路退回列表
      if (pendingDelete) {
        setPendingDelete(null)
        return setDetailId(null)
      }
      if (detailId) return setDetailId(null)
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [draft, pendingDelete, detailId, onClose])

  // 搜索 + 分组筛选后的可见日程
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return store.events.filter((e) => {
      if (sourceFilter !== 'all' && (e.source ?? 'managed') !== sourceFilter) return false
      if (!overlayPersonal && e.kind === 'personal') return false
      if (q && !e.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [store.events, query, sourceFilter, overlayPersonal])

  const grid = useMemo(
    () => monthGrid(cursor.year, cursor.month, defaults.weekStart),
    [cursor.year, cursor.month, defaults.weekStart]
  )

  const detail = detailId ? visible.find((e) => e.id === detailId) ?? store.events.find((e) => e.id === detailId) ?? null : null

  const prevMonth = () => setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 }))
  const nextMonth = () => setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 }))

  /**
   * 对话框**互斥** —— 原文任一时刻只呈现一层（编辑 / 详情 / 删除确认 / 日历设置）。
   * 任一层打开前先收起其他层，避免设置框与删除确认叠加、或详情卡上再压表单。
   */
  const openCreate = (dayTs = selectedDay) => {
    setPendingDelete(null)
    setDetailId(null)
    setShowSettings(false)
    setDraft(defaultDraft(defaults, dayTs))
  }
  const openDetail = (id: string) => {
    setDraft(null)
    setPendingDelete(null)
    setShowSettings(false)
    setDetailId(id)
  }
  const openSettings = () => {
    setDraft(null)
    setPendingDelete(null)
    setDetailId(null)
    setShowSettings(true)
  }
  const openEdit = (e: ScheduleEvent) => {
    setPendingDelete(null)
    setShowSettings(false)
    setDraft(draftFromEvent(e))
  }
  const askDelete = (e: ScheduleEvent) => {
    setDraft(null)
    setShowSettings(false)
    setPendingDelete(e)
  }

  const save = async () => {
    if (!draft) return
    if (!draft.title.trim()) {
      // 对齐 home.schedule.titleRequired=请填写标题（标题名「日程」由 calendarFallback 承担）
      toast.error(t('home.schedule.titleRequired'))
      return
    }
    if (draft.endAt <= draft.startAt) {
      // 对齐 home.schedule.endAfterStart=结束时间需晚于开始时间
      toast.error(t('home.schedule.endAfterStart'))
      return
    }
    setSaving(true)
    try {
      // 整体覆盖语义下，仍需保留既有参与人的 RSVP / 组织者 / 附件，否则「只改时间」会清掉
      // 参与人已回执的状态（对齐 rsvp.hint=只影响我的个人邀请，回执不属于本次编辑字段）
      const prevParticipants = store.events.find((e) => e.id === draft.id)?.participants ?? []
      const participants = draft.participants
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((name) => {
          const hit = prevParticipants.find((p) => p.name === name)
          return hit ? { ...hit, name } : { name, rsvp: 'needsAction' as const }
        })
      const existing = store.events.find((e) => e.id === draft.id)
      const saved = await window.workbuddy.eventSave({
        id: draft.id,
        title: draft.title.trim(),
        startAt: draft.startAt,
        endAt: draft.endAt,
        allDay: draft.allDay,
        location: draft.location.trim() || undefined,
        description: draft.description.trim() || undefined,
        reminder: draft.reminder,
        source: draft.source,
        kind: draft.source === 'channels' ? 'channel' : 'personal',
        participants,
        repeat: draft.repeatKind === 'none' ? undefined : { kind: draft.repeatKind, weekdays: draft.repeatWeekdays },
        cancelled: existing?.cancelled ?? false,
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now()
      })
      await refresh()
      setDraft(null)
      // 对齐 creation.successTitle=日程创建成功（原文即创建/保存共用此状态标题）
      toast.success(t('home.schedule.creation.successTitle'))
      setDetailId(saved.id)
    } finally {
      setSaving(false)
    }
  }

  /** 本地占位替换 —— 与 shared/scheduleEvent.ts 的 fill 同语义 */
  const fillT = (tpl: string, vars: Record<string, string | number>): string =>
    tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const wasSeries = !!pendingDelete.repeat && pendingDelete.repeat.kind !== 'none'
    await window.workbuddy.eventDelete(pendingDelete.id)
    setPendingDelete(null)
    setDetailId(null)
    await refresh()
    // 逐字对齐 sidebar.deleteSuccess.series（重复系列）/ .events（单次日程）
    // —— 原文按「取消了 N 场单次日程 / N 个重复系列」回报，单条删除即 1
    toast.success(
      wasSeries
        ? fillT(t('home.schedule.sidebar.deleteSuccess.series'), { seriesCount: 1 })
        : fillT(t('home.schedule.sidebar.deleteSuccess.events'), { eventCount: 1 })
    )
  }

  const setRsvp = async (name: string, rsvp: 'accept' | 'tentative' | 'decline') => {
    if (!detail) return
    // 回执只改自己的参与状态（对齐 rsvp.hint=只影响我的个人邀请），chip 高亮即反馈，
    // 原文该域没有对应的 toast 文案，故不做多余提示
    const next = (detail.participants ?? []).map((p) => (p.name === name ? { ...p, rsvp } : p))
    await window.workbuddy.eventSave({ ...detail, participants: next, updatedAt: Date.now() })
    await refresh()
  }

  return (
    <div className="sched-panel">
      <header className="sched-head">
        <div className="sched-head-left">
          <button className="btn ghost sm" onClick={onClose}>
            {t('home.schedule.back')}
          </button>
          <span className="sched-title">{t('home.schedule.myCalendar')}</span>
        </div>
        <div className="sched-head-right">
          <button className="btn ghost sm" onClick={openSettings}>
            {t('home.schedule.settings.entry')}
          </button>
          <button className="btn sm" onClick={() => openCreate()}>
            {t('home.schedule.create')}
          </button>
        </div>
      </header>

      <div className="sched-body">
        {/* ---------- 日历侧栏 ---------- */}
        <aside className={`sched-side ${collapsed ? 'collapsed' : ''}`}>
          <div className="sched-side-top">
            <span className="sched-month-title">{monthTitle(cursor.year, cursor.month, t)}</span>
            <span className="sched-month-nav">
              <button className="icon-btn sm" title={t('home.schedule.sidebar.prevMonth')} onClick={prevMonth}>
                ‹
              </button>
              <button className="icon-btn sm" title={t('home.schedule.sidebar.nextMonth')} onClick={nextMonth}>
                ›
              </button>
              <button
                className="icon-btn sm"
                title={collapsed ? t('home.schedule.sidebar.expand') : t('home.schedule.sidebar.collapse')}
                onClick={() => setCollapsed((v) => !v)}
              >
                {collapsed ? '＋' : '－'}
              </button>
            </span>
          </div>

          {!collapsed && (
            <>
              <div className="sched-mini">
                <div className="sched-mini-week">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <span key={i} className="sched-mini-wday">
                      {weekdayName(new Date(2024, 0, 7 + ((defaults.weekStart + i) % 7)).getTime(), t)}
                    </span>
                  ))}
                </div>
                <div className="sched-mini-grid">
                  {grid.map((c) => {
                    const dayEvents = eventsOnDay(visible, c.ts)
                    const isToday = c.ts === today
                    const isSel = c.ts === selectedDay
                    return (
                      <button
                        key={c.ts}
                        className={`sched-mini-cell ${c.inMonth ? '' : 'out'} ${isToday ? 'today' : ''} ${isSel ? 'sel' : ''}`}
                        onClick={() => setSelectedDay(c.ts)}
                        onDoubleClick={() => openCreate(c.ts)}
                      >
                        <span className="sched-mini-day">{new Date(c.ts).getDate()}</span>
                        {dayEvents.length > 0 && <span className="sched-mini-dot" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="sched-search">
                <input
                  className="filter-input"
                  placeholder={t('home.schedule.sidebar.searchPlaceholder')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button className="btn ghost sm" onClick={() => setQuery('')}>
                    {t('home.schedule.sidebar.searchClear')}
                  </button>
                )}
              </div>

              <div className="sched-groups">
                <button
                  className={`sched-group ${sourceFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setSourceFilter('all')}
                >
                  {t('home.schedule.sidebar.myScheduleGroup')}
                </button>
                {SOURCE_GROUPS.map((g) => (
                  <button
                    key={g}
                    className={`sched-group ${sourceFilter === g ? 'active' : ''}`}
                    onClick={() => setSourceFilter(g)}
                  >
                    {t(`home.schedule.sidebar.${g}`)}
                  </button>
                ))}
              </div>

              <div className="sched-overlays">
                <label className="sched-overlay">
                  <input type="checkbox" checked={overlayPersonal} onChange={(e) => setOverlayPersonal(e.target.checked)} />
                  {t('home.schedule.sidebar.overlayPersonal')}
                </label>
                <label className="sched-overlay">
                  <input type="checkbox" checked={overlayTodos} onChange={(e) => setOverlayTodos(e.target.checked)} />
                  {t('home.schedule.sidebar.overlayMyTodos')}
                </label>
              </div>
            </>
          )}
        </aside>

        {/* ---------- 月视图主区 ---------- */}
        <section className="sched-main">
          <div className="sched-main-info">
            <span className="sched-main-day">
              {new Date(selectedDay).toLocaleDateString()} · {weekdayName(selectedDay, t)}
            </span>
            <span className="sched-main-count">
              {t('home.schedule.today').replace('{count}', String(eventsOnDay(visible, selectedDay).length))}
            </span>
          </div>

          {visible.length === 0 ? (
            <div className="sched-empty">{query ? t('home.schedule.sidebar.searchEmpty') : t('home.schedule.empty')}</div>
          ) : (
            <div className="sched-day-list">
              {eventsOnDay(visible, selectedDay).map((e) => {
                const st = eventStatus(e)
                return (
                  <button key={`${e.id}-${e.startAt}`} className={`sched-card st-${st}`} onClick={() => openDetail(e.id)}>
                    <span className="sched-card-time">{e.allDay ? t('home.schedule.allDay') : clock(e.startAt)}</span>
                    <span className="sched-card-title">{e.title}</span>
                    <span className="sched-card-status">{eventStatusLabel(st, t)}</span>
                  </button>
                )
              })}
              {eventsOnDay(visible, selectedDay).length === 0 && (
                <div className="sched-empty">{query ? t('home.schedule.sidebar.searchEmpty') : t('home.schedule.empty')}</div>
              )}
            </div>
          )}

          {/* 团队/待办叠加：原文自身标注「暂未实现」，复刻同样以桩提示对齐 */}
          {overlayTodos && <div className="sched-stub">{t('home.schedule.hint.notImplemented')}</div>}
          <div className="sched-stub">{t('home.schedule.sidebar.team')} · {t('home.schedule.hint.noContract')}</div>
        </section>
      </div>

      {/* ---------- 创建 / 编辑表单 ---------- */}
      {draft && (
        <div className="sched-modal" onClick={() => setDraft(null)}>
          <div className="dialog sched-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">
              {store.events.some((e) => e.id === draft.id) ? t('home.schedule.create.editTitle') : t('home.schedule.createTitle')}
            </div>
            <div className="sched-form-hint">{t('home.schedule.create.formHint')}</div>

            <label className="field-label">{t('home.schedule.field.title')}</label>
            <input
              className="auto-input"
              value={draft.title}
              placeholder={t('home.schedule.create.placeholder.title')}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />

            <div className="sched-form-row">
              <div>
                <label className="field-label">{t('home.schedule.create.start')}</label>
                <input
                  className="auto-input"
                  type="datetime-local"
                  value={toLocalInput(draft.startAt)}
                  onChange={(e) => {
                    const ts = fromLocalInput(e.target.value)
                    if (ts === undefined) return
                    const dur = draft.endAt - draft.startAt
                    setDraft({ ...draft, startAt: ts, endAt: ts + Math.max(dur, 60_000) })
                  }}
                />
              </div>
              <div>
                <label className="field-label">{t('home.schedule.create.end')}</label>
                <input
                  className="auto-input"
                  type="datetime-local"
                  value={toLocalInput(draft.endAt)}
                  onChange={(e) => {
                    const ts = fromLocalInput(e.target.value)
                    if (ts !== undefined) setDraft({ ...draft, endAt: ts })
                  }}
                />
              </div>
            </div>

            <div className="sched-form-row">
              <span className="inline-label">
                {t('home.schedule.create.duration')}: {durationLabel(Math.round((draft.endAt - draft.startAt) / 60_000), t)}
              </span>
              <label className="sched-overlay">
                <input type="checkbox" checked={draft.allDay} onChange={(e) => setDraft({ ...draft, allDay: e.target.checked })} />
                {t('home.schedule.allDay')}
              </label>
            </div>

            <label className="field-label">{t('home.schedule.field.reminder')}</label>
            <div className="kind-row">
              {(['none', 'atStart', '15', '60', '1440'] as EventReminder[]).map((r) => (
                <button
                  key={r}
                  className={`kind-chip ${draft.reminder === r ? 'active' : ''}`}
                  onClick={() => setDraft({ ...draft, reminder: r })}
                >
                  {t(`home.schedule.create.reminder.${r}`)}
                </button>
              ))}
            </div>

            <label className="field-label">{t('home.schedule.create.field.recurrence')}</label>
            <div className="kind-row">
              {REPEAT_KINDS.map((k) => (
                <button
                  key={k}
                  className={`kind-chip ${draft.repeatKind === k ? 'active' : ''}`}
                  onClick={() => setDraft({ ...draft, repeatKind: k })}
                >
                  {t(`home.schedule.create.recurrence.${k}`)}
                </button>
              ))}
            </div>

            <label className="field-label">{t('home.schedule.field.location')}</label>
            <input
              className="auto-input"
              value={draft.location}
              placeholder={t('home.schedule.create.placeholder.location')}
              onChange={(e) => setDraft({ ...draft, location: e.target.value })}
            />

            <label className="field-label">{t('home.schedule.create.field.participants')}</label>
            <input
              className="auto-input"
              value={draft.participants}
              placeholder={t('home.schedule.create.placeholder.participants')}
              onChange={(e) => setDraft({ ...draft, participants: e.target.value })}
            />

            <label className="field-label">{t('home.schedule.field.description')}</label>
            <textarea
              className="auto-textarea"
              rows={3}
              value={draft.description}
              placeholder={t('home.schedule.create.placeholder.description')}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />

            <div className="sched-stub">{t('home.schedule.create.meetingMinutesHint')} · {t('home.schedule.hint.meetingMinutesUnavailable')}</div>

            <div className="dialog-actions">
              <button className="btn ghost" onClick={() => setDraft(null)}>
                {t('home.schedule.occurrence.scope.cancel')}
              </button>
              <button className="btn" disabled={saving} onClick={() => void save()}>
                {store.events.some((e) => e.id === draft.id) ? t('home.schedule.create.submitSave') : t('home.schedule.create.submit')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- 详情卡 ---------- */}
      {/* 删除确认出现时，详情卡让位（对齐原文：确认层取代详情层，而非叠在其上）-------- */}
      {detail && !draft && !pendingDelete && (
        <div className="sched-modal" onClick={() => setDetailId(null)}>
          <div className="dialog sched-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">{detail.title}</div>
            <div className="sched-detail-line">{kindLine(detail, t)}</div>
            <div className="sched-detail-line">{whenLabel(detail, t)}</div>
            <div className="sched-detail-line">
              {t('home.schedule.summary.reminder')}: {reminderLabel(detail.reminder, t)}
            </div>
            <div className="sched-detail-line">
              {detail.location || t('home.schedule.summary.locationFallback')}
            </div>
            <div className="sched-detail-line">
              {participantsLabel(detail, t)}
              {(detail.participants ?? []).map((p) => p.name).join('、')}
            </div>
            {/* 投递状态 —— 对齐 detail.deliveryPending=待同步至 {count} 人 / deliverySucceeded=已同步 */}
            <div className="sched-detail-line">
              {(() => {
                const pending = (detail.participants ?? []).filter((p) => !p.rsvp || p.rsvp === 'needsAction').length
                return pending > 0
                  ? fillT(t('home.schedule.detail.deliveryPending'), { count: pending })
                  : t('home.schedule.detail.deliverySucceeded')
              })()}
            </div>
            {detail.organizer && <span className="sched-badge">{t('home.schedule.summary.organizerBadge')}</span>}

            {(detail.participants ?? []).length > 0 && (
              <div className="sched-rsvp">
                <div className="field-label">{t('home.schedule.rsvp.title')}</div>
                {(detail.participants ?? []).map((p) => (
                  <div key={p.name} className="sched-rsvp-row">
                    <span className="sched-rsvp-name">{p.name}</span>
                    {(['accept', 'tentative', 'decline'] as const).map((r) => (
                      <button
                        key={r}
                        className={`kind-chip ${p.rsvp === r ? 'active' : ''}`}
                        onClick={() => void setRsvp(p.name, r)}
                      >
                        {t(`home.schedule.rsvp.${r}`)}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {(detail.attachments ?? []).length > 0 && (
              <div className="sched-detail-line">
                {t('home.schedule.detail.attachments')}: {(detail.attachments ?? []).join('、')}
              </div>
            )}

            {detail.description ? (
              <div className="sched-detail-notes">{detail.description}</div>
            ) : (
              <div className="sched-stub">
                {t('home.schedule.summary.notesEmpty')} · {t('home.schedule.summary.notesEmptyHint')}
              </div>
            )}

            {/* 在线会议 / 会议室 / 关联任务：原文自身标注未接入，复刻同样以桩提示对齐 */}
            <div className="sched-stub">{t('home.schedule.summary.noOnlineMeeting')} · {t('home.schedule.hint.onlineMeetingUnavailable')}</div>
            <div className="sched-stub">{t('home.schedule.hint.meetingRoom')}</div>

            <div className="sched-copy-row">
              <button
                className="btn ghost sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(`${detail.title} ${whenLabel(detail, t)}`)
                  toast.success(t('home.schedule.summary.copied'))
                }}
              >
                {t('home.schedule.summary.copyMeeting')}
              </button>
            </div>

            <div className="dialog-actions">
              <button className="btn ghost" onClick={() => askDelete(detail)}>
                {t('home.schedule.summary.delete')}
              </button>
              <button className="btn ghost" onClick={() => openEdit(detail)}>
                {t('home.schedule.summary.edit')}
              </button>
              <button className="btn" onClick={() => setDetailId(null)}>
                {t('home.schedule.detail.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- 删除二次确认（对齐 deleteConfirmBody 的后果说明）---------- */}
      {pendingDelete && (
        <div className="sched-modal" onClick={() => setPendingDelete(null)}>
          <div className="dialog sched-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">{t('home.schedule.summary.deleteConfirmTitle')}</div>
            <div className="dialog-content">{t('home.schedule.summary.deleteConfirmBody')}</div>
            <div className="dialog-actions">
              <button className="btn ghost" onClick={() => setPendingDelete(null)}>
                {t('home.schedule.occurrence.scope.cancel')}
              </button>
              <button className="btn danger" onClick={() => void confirmDelete()}>
                {t('home.schedule.summary.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- 日历设置（对齐 settings.*：仅影响新建日程的默认行为）---------- */}
      {showSettings && (
        <div className="sched-modal" onClick={() => setShowSettings(false)}>
          <div className="dialog sched-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">{t('home.schedule.settings.title')}</div>
            <div className="sched-form-hint">{t('home.schedule.settings.subtitle')}</div>

            <label className="field-label">{t('home.schedule.settings.field.duration')}</label>
            <div className="kind-row">
              {DURATION_OPTIONS.map((d) => (
                <button
                  key={d}
                  className={`kind-chip ${defaults.defaultDurationMinutes === d ? 'active' : ''}`}
                  onClick={() => setDefaults({ ...defaults, defaultDurationMinutes: d })}
                >
                  {t(`home.schedule.settings.duration.${d}`)}
                </button>
              ))}
            </div>

            <label className="field-label">{t('home.schedule.settings.field.timedReminder')}</label>
            <select
              className="filter-input"
              value={defaults.timedReminder}
              onChange={(e) => setDefaults({ ...defaults, timedReminder: e.target.value })}
            >
              {TIMED_REMINDER_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {t(`home.schedule.settings.timedReminder.${o}`)}
                </option>
              ))}
            </select>

            <label className="field-label">{t('home.schedule.settings.field.allDayReminder')}</label>
            <select
              className="filter-input"
              value={defaults.allDayReminder}
              onChange={(e) => setDefaults({ ...defaults, allDayReminder: e.target.value })}
            >
              {ALL_DAY_REMINDER_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {t(`home.schedule.settings.allDayReminder.${o}`)}
                </option>
              ))}
            </select>

            <div className="sched-form-row">
              <label className="sched-overlay">
                <input
                  type="checkbox"
                  checked={defaults.weekStart === 1}
                  onChange={(e) => setDefaults({ ...defaults, weekStart: e.target.checked ? 1 : 0 })}
                />
                {t('home.schedule.settings.field.weekStart')} · {weekdayName(new Date(2024, 0, 7 + defaults.weekStart).getTime(), t)}
              </label>
              <label className="sched-overlay">
                <input
                  type="checkbox"
                  checked={defaults.showLunar}
                  onChange={(e) => setDefaults({ ...defaults, showLunar: e.target.checked })}
                />
                {t('home.schedule.settings.field.showLunar')}
              </label>
            </div>

            <div className="sched-stub">{t('home.schedule.settings.sync.title')} · {t('home.schedule.hint.notImplemented')}</div>

            <div className="dialog-actions">
              <button className="btn ghost" onClick={() => setShowSettings(false)}>
                {t('home.schedule.occurrence.scope.cancel')}
              </button>
              <button
                className="btn"
                onClick={async () => {
                  const next = await window.workbuddy.eventSettingsSave(defaults)
                  setDefaults(next)
                  setShowSettings(false)
                  toast.success(t('home.schedule.settings.save'))
                }}
              >
                {t('home.schedule.settings.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
