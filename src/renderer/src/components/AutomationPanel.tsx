import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '../i18n'
import { toast } from '../stores/useToast'
import type { Automation, AutomationRun, Schedule, ScheduleKind, Weekday } from '../../../shared/types'
import {
  ALL_WEEKDAYS,
  WORKDAYS,
  nextRun,
  scheduleSummary,
  validateSchedule,
  isExpired
} from '../../../shared/schedule'

/**
 * 定时任务面板 —— 对齐原版 `automation.*` 的「定时任务 / 运行记录」双 Tab 视图：
 * - 定时任务页：按 section.scheduled / inProgress / completed 分组 + 状态筛选 + 来源筛选 + 卡片（立即运行 / 暂停 / 恢复 / 编辑 / 删除）
 * - 运行记录页：runGroup 按日期分组 + 状态/任务/类型筛选 + 搜索 + 记录行（含失败分因与证据）
 * - 新建 / 编辑表单：名称 + 提示词 + 执行频率（七类 + once）+ 权限 + 有效期 + 结果推送
 */

interface Props {
  onClose: () => void
}

const KINDS: ScheduleKind[] = ['once', 'daily', 'workday', 'weekly', 'biweekly', 'monthly', 'yearly', 'interval']

/** 运行状态 → 文案键（对齐 automation.row.* / run.status.*） */
function rowStatusKey(a: Automation, now: number): string {
  if (isExpired(a.schedule, now)) return 'automation.row.expired'
  if (!a.enabled) return 'automation.row.paused'
  return 'automation.row.succeeded'
}

function runStatusKey(status: AutomationRun['status']): string {
  switch (status) {
    case 'pending':
      return 'automation.run.status.pending'
    case 'queued':
      return 'automation.records.statusQueued'
    case 'running':
      return 'automation.row.inProgress'
    case 'succeeded':
      return 'automation.row.succeeded'
    case 'failed':
      return 'automation.row.failed'
    case 'cancelled':
      return 'automation.run.status.cancelled'
    case 'interrupted':
      return 'automation.result.interrupted'
    case 'skipped':
      return 'automation.row.expired'
    default:
      return 'automation.row.failed'
  }
}

/** 时长格式化 —— 对齐 automation.duration.* */
function durationLabel(ms: number, t: (k: string) => string): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return t('automation.duration.seconds').replace('{count}', String(s))
  const m = Math.floor(s / 60)
  const rs = s % 60
  if (m < 60) {
    return rs
      ? t('automation.duration.minutesSeconds')
          .replace('{minutes}', String(m))
          .replace('{seconds}', String(rs))
      : t('automation.duration.minutes').replace('{count}', String(m))
  }
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm
    ? t('automation.duration.hoursMinutes').replace('{hours}', String(h)).replace('{minutes}', String(rm))
    : t('automation.duration.hours').replace('{count}', String(h))
}

/** 相对时间 —— 对齐 automation.time.* */
function relTime(ts: number, t: (k: string) => string, now = Date.now()): string {
  const diff = ts - now
  const abs = Math.abs(diff)
  const mins = Math.round(abs / 60000)
  const pad = abs < 60000 ? 'justNow' : undefined
  if (pad) return t('automation.time.justNow')
  const sign = diff >= 0 ? '' : 'Ago'
  if (mins < 60) return t(`automation.time.minutes${sign}`).replace('{count}', String(mins))
  const hours = Math.round(mins / 60)
  if (hours < 24) return t(`automation.time.hours${sign}`).replace('{count}', String(hours))
  const days = Math.round(hours / 24)
  return t(`automation.time.days${sign}`).replace('{count}', String(days))
}

/** 日期分组标签 —— 对齐 automation.runGroup.date.* */
function dayLabel(ts: number, t: (k: string) => string): string {
  const d = new Date(ts)
  const today = new Date()
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (same(d, today)) return t('automation.runGroup.date.today')
  const yest = new Date(today.getTime() - 86400000)
  if (same(d, yest)) return t('automation.runGroup.date.yesterday')
  return t('automation.runGroup.date.fullDate')
    .replace('{year}', String(d.getFullYear()))
    .replace('{month}', String(d.getMonth() + 1))
    .replace('{day}', String(d.getDate()))
}

export default function AutomationPanel({ onClose }: Props): React.JSX.Element {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'tasks' | 'records'>('tasks')
  const [items, setItems] = useState<Automation[]>([])
  const [runs, setRuns] = useState<AutomationRun[]>([])
  const [filter, setFilter] = useState<'all' | 'statusActive' | 'statusPaused'>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'local' | 'cloud' | 'project'>('all')
  const [runSearch, setRunSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Automation | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Automation | null>(null)

  const load = async () => {
    setLoading(true)
    const [list, runList] = await Promise.all([
      window.workbuddy.automationList(true),
      window.workbuddy.automationRuns(undefined, true)
    ])
    setItems(list)
    setRuns(runList)
    setLoading(false)
  }

  useEffect(() => {
    void load()
    return window.workbuddy.onAutomationChanged(() => void load())
  }, [])

  const now = Date.now()

  /** 分组 —— 对齐 automation.section.*（已安排 / 执行中 / 已完成 / 已归档） */
  const groups = useMemo(() => {
    const byFilter = items.filter((a) => {
      if (filter === 'statusActive' && !a.enabled) return false
      if (filter === 'statusPaused' && a.enabled) return false
      if (sourceFilter !== 'all' && (a.env ?? 'local') !== sourceFilter) return false
      return true
    })
    const scheduled: Automation[] = []
    const inProgress: Automation[] = []
    const completed: Automation[] = []
    const archived: Automation[] = []
    for (const a of byFilter) {
      if (a.archived) archived.push(a)
      else if (isExpired(a.schedule, now)) completed.push(a)
      else scheduled.push(a)
    }
    return [
      { key: 'scheduled', label: t('automation.section.scheduled'), empty: t('automation.empty.scheduled'), rows: scheduled },
      { key: 'inProgress', label: t('automation.section.inProgress'), empty: t('automation.empty.inProgress'), rows: inProgress },
      { key: 'completed', label: t('automation.section.completed'), empty: t('automation.empty.completed'), rows: completed },
      { key: 'archived', label: t('automation.section.archived'), empty: t('automation.empty.archived'), rows: archived }
    ]
  }, [items, filter, sourceFilter, now, t])

  const filteredRuns = useMemo(() => {
    const q = runSearch.trim().toLowerCase()
    return q ? runs.filter((r) => r.taskName.toLowerCase().includes(q)) : runs
  }, [runs, runSearch])

  /** 运行记录按日期分组（对齐 runGroup） */
  const runGroups = useMemo(() => {
    const map = new Map<string, AutomationRun[]>()
    for (const r of filteredRuns) {
      const key = dayLabel(r.startedAt, t)
      const arr = map.get(key) ?? []
      arr.push(r)
      map.set(key, arr)
    }
    return [...map.entries()]
  }, [filteredRuns, t])

  const toggleEnabled = async (a: Automation) => {
    const updated = await window.workbuddy.automationEnabled(a.id, !a.enabled)
    if (updated) toast.success(t(a.enabled ? 'automation.toast.paused' : 'automation.toast.enabled').replace('{name}', a.name))
    await load()
  }

  const runNow = async (a: Automation) => {
    if (isExpired(a.schedule, now)) {
      toast.error(t('automation.card.expiredRunHint'))
      return
    }
    const r = await window.workbuddy.automationRunNow(a.id)
    if (!r.ok) {
      toast.error(t('automation.form.triggerFailed'))
      return
    }
    toast.success(t('automation.form.triggerSuccess'))
    await load()
  }

  const doDelete = async () => {
    if (!confirmDelete) return
    await window.workbuddy.automationDelete(confirmDelete.id)
    toast.success(t('automation.toast.deleted'))
    setConfirmDelete(null)
    await load()
  }

  const archive = async (a: Automation) => {
    await window.workbuddy.automationArchived(a.id, !a.archived)
    toast.success(a.archived ? t('automation.action.unarchive') : t('automation.record.archivedToast'))
    await load()
  }

  return (
    <div className="automation-panel">
      <header className="auto-head">
        <div className="auto-head-left">
          <button className="icon-btn" onClick={onClose} title={t('automation.run.back')}>
            ←
          </button>
          <div>
            <div className="auto-title">{t('automation.title')}</div>
            <div className="auto-desc">{t('automation.description')}</div>
          </div>
        </div>
        <div className="auto-head-right">
          <button className="btn" onClick={() => setEditing(newAutomation())}>
            {t('automation.toolbar.addAutomation')}
          </button>
        </div>
      </header>

      <div className="auto-tabs">
        <button
          className={`auto-tab ${tab === 'tasks' ? 'active' : ''}`}
          onClick={() => setTab('tasks')}
        >
          {t('automation.tab.scheduledTasks')}
        </button>
        <button
          className={`auto-tab ${tab === 'records' ? 'active' : ''}`}
          onClick={() => setTab('records')}
        >
          {t('automation.tab.runRecords')}
        </button>
      </div>

      {tab === 'tasks' ? (
        <div className="auto-body">
          <div className="auto-toolbar">
            <select
              className="filter-select"
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              title={t('automation.toolbar.filter')}
            >
              <option value="all">{t('automation.filter.all')}</option>
              <option value="statusActive">{t('automation.filter.statusActive')}</option>
              <option value="statusPaused">{t('automation.filter.statusPaused')}</option>
            </select>
            <select
              className="filter-select"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}
              title={t('automation.source.filterTitle')}
            >
              <option value="all">{t('automation.source.all')}</option>
              <option value="local">{t('automation.source.local')}</option>
              <option value="cloud">{t('automation.source.cloud')}</option>
              <option value="project">{t('automation.source.project')}</option>
            </select>
            <button className="btn ghost" onClick={() => void load()} title={t('automation.toolbar.refresh')}>
              ↻
            </button>
          </div>

          {loading ? (
            <div className="auto-empty">{t('automation.row.preparing')}</div>
          ) : items.length === 0 ? (
            <div className="auto-empty">
              <div>{t('automation.empty')}</div>
              <div className="auto-empty-sub">{t('automation.empty.firstTask')}</div>
            </div>
          ) : (
            groups.map((g) => (
              <section key={g.key} className="auto-group">
                <div className="auto-group-head">
                  <span className="auto-group-name">{g.label}</span>
                  <span className="ws-group-count">{g.rows.length}</span>
                </div>
                {g.rows.length === 0 ? (
                  <div className="auto-group-empty">{filter !== 'all' || sourceFilter !== 'all' ? t('automation.empty.noFilteredTasks') : g.empty}</div>
                ) : (
                  g.rows.map((a) => (
                    <div key={a.id} className={`auto-card ${a.enabled ? '' : 'paused'}`}>
                      <div className="auto-card-main">
                        <div className="auto-card-title">
                          {a.name}
                          {a.env === 'cloud' && (
                            <span className="auto-badge" title={t('automation.cloud.badgeHint')}>
                              {t('automation.source.cloud')}
                            </span>
                          )}
                        </div>
                        <div className="auto-card-schedule">{scheduleSummary(a.schedule, t)}</div>
                        <div className="auto-card-meta">
                          <span className={`auto-status s-${a.enabled ? 'on' : 'off'}`}>{t(rowStatusKey(a, now))}</span>
                          {a.enabled && a.nextRunAt && (
                            <span className="auto-next">
                              {t('automation.row.startsIn').replace('{time}', relTime(a.nextRunAt, t, now))}
                            </span>
                          )}
                          {a.schedule.kind === 'once' && <span className="auto-tag">{t('automation.row.onceOnly')}</span>}
                        </div>
                      </div>
                      <div className="auto-card-actions">
                        <button className="btn ghost sm" onClick={() => void runNow(a)}>
                          {t('automation.card.run')}
                        </button>
                        <button className="btn ghost sm" onClick={() => void toggleEnabled(a)}>
                          {t(a.enabled ? 'automation.card.pauseTask' : 'automation.card.resumeTask')}
                        </button>
                        <button className="btn ghost sm" onClick={() => setEditing(a)}>
                          {t('automation.menu.edit')}
                        </button>
                        <button className="btn ghost sm" onClick={() => void archive(a)}>
                          {t(a.archived ? 'automation.action.unarchive' : 'automation.action.archive')}
                        </button>
                        <button className="btn ghost sm danger" onClick={() => setConfirmDelete(a)}>
                          {t('automation.menu.delete')}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </section>
            ))
          )}
        </div>
      ) : (
        <div className="auto-body">
          <div className="auto-toolbar">
            <input
              className="filter-input"
              value={runSearch}
              placeholder={t('automation.records.taskSearchPlaceholder')}
              onChange={(e) => setRunSearch(e.target.value)}
            />
          </div>
          {filteredRuns.length === 0 ? (
            <div className="auto-empty">{runSearch.trim() ? t('automation.empty.noFilteredRecords') : t('automation.empty.noRecords')}</div>
          ) : (
            <>
              <div className="run-head">
                <span className="rc-name">{t('automation.records.column.name')}</span>
                <span className="rc-status">{t('automation.records.column.status')}</span>
                <span className="rc-time">{t('automation.records.column.time')}</span>
                <span className="rc-duration">{t('automation.records.column.duration')}</span>
              </div>
              {runGroups.map(([day, list]) => (
                <section key={day} className="run-group">
                  <div className="run-group-head">{day}</div>
                  {list.map((r) => (
                    <div key={r.id} className={`run-row ${r.status}`}>
                      <span className="rc-name" title={r.taskName}>
                        {r.taskName}
                      </span>
                      <span className="rc-status">
                        <span className={`auto-status s-${r.status}`}>{t(runStatusKey(r.status))}</span>
                        {r.test && <span className="auto-tag">{t('automation.result.manualTest')}</span>}
                      </span>
                      <span className="rc-time">{new Date(r.startedAt).toLocaleTimeString()}</span>
                      <span className="rc-duration">
                        {r.finishedAt ? durationLabel(r.finishedAt - r.startedAt, t) : t('automation.row.inProgress')}
                      </span>
                      {r.reason && (
                        <span className="run-reason" title={t(`automation.detail.reason.${r.reason}`)}>
                          {t(`automation.detail.reason.${r.reason}`)}
                        </span>
                      )}
                    </div>
                  ))}
                </section>
              ))}
            </>
          )}
        </div>
      )}

      {editing && (
        <AutomationForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSaved={async (msg) => {
            toast.success(msg)
            setEditing(null)
            await load()
          }}
        />
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">{t('automation.delete.title')}</div>
            <div className="dialog-content">{t('automation.delete.description').replace('{name}', confirmDelete.name)}</div>
            <div className="dialog-actions">
              <button className="btn ghost" onClick={() => setConfirmDelete(null)}>
                {t('automation.detail.action.cancel')}
              </button>
              <button className="btn danger" onClick={() => void doDelete()}>
                {t('automation.delete.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function newAutomation(): Automation {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    name: '',
    prompt: '',
    schedule: { kind: 'daily', time: '09:00' },
    permission: 'default',
    enabled: true,
    archived: false,
    env: 'local',
    createdAt: now,
    updatedAt: now
  }
}

interface FormProps {
  initial: Automation
  onCancel: () => void
  onSaved: (msg: string) => void | Promise<void>
}

function AutomationForm({ initial, onCancel, onSaved }: FormProps): React.JSX.Element {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<Automation>(initial)
  const [saving, setSaving] = useState(false)

  const patch = (p: Partial<Automation>) => setDraft((d) => ({ ...d, ...p }))
  const patchSchedule = (p: Partial<Schedule>) => setDraft((d) => ({ ...d, schedule: { ...d.schedule, ...p } }))

  const summary = scheduleSummary(draft.schedule, t)
  const next = draft.enabled ? nextRun(draft.schedule) : undefined

  const save = async () => {
    if (!draft.name.trim()) return toast.error(t('automation.error.nameRequired'))
    if (!draft.prompt.trim()) return toast.error(t('automation.error.promptRequired'))
    const invalid = validateSchedule(draft.schedule)
    if (invalid) return toast.error(t(invalid))
    setSaving(true)
    try {
      await window.workbuddy.automationSave(draft)
      await onSaved(isNew ? t('automation.toast.createSuccess') : t('automation.toast.saved'))
    } finally {
      setSaving(false)
    }
  }

  const isNew = !initial.name

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal auto-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">{isNew ? t('automation.modal.titleCreate') : t('automation.modal.title')}</div>

        <label className="field-label">{t('automation.modal.name')}</label>
        <input
          className="ws-create-input"
          autoFocus
          value={draft.name}
          placeholder={t('automation.form.namePlaceholder')}
          onChange={(e) => patch({ name: e.target.value })}
        />

        <label className="field-label">{t('automation.modal.prompt')}</label>
        <textarea
          className="auto-textarea"
          rows={4}
          value={draft.prompt}
          placeholder={t('automation.form.promptPlaceholder')}
          onChange={(e) => patch({ prompt: e.target.value })}
        />

        <label className="field-label">{t('automation.modal.schedule')}</label>
        <div className="kind-row">
          {KINDS.map((k) => (
            <button
              key={k}
              className={`kind-chip ${draft.schedule.kind === k ? 'active' : ''}`}
              onClick={() => patchSchedule({ kind: k })}
            >
              {t(`automation.schedule.${k}`)}
            </button>
          ))}
        </div>

        {/* 按类型渲染细节（对齐 schedule.* 的形态差异） */}
        {draft.schedule.kind !== 'interval' && (
          <div className="kind-detail">
            <label className="inline-label">{t('automation.datePicker.selectTime')}</label>
            <input
              type="time"
              className="auto-input"
              value={draft.schedule.time ?? '09:00'}
              onChange={(e) => patchSchedule({ time: e.target.value })}
            />
          </div>
        )}

        {(draft.schedule.kind === 'weekly' || draft.schedule.kind === 'biweekly') && (
          <div className="kind-detail">
            <label className="inline-label">{t('automation.datePicker.selectDate')}</label>
            <div className="kind-row">
              {ALL_WEEKDAYS.map((w) => (
                <button
                  key={w}
                  className={`kind-chip ${draft.schedule.weekdays?.includes(w) ? 'active' : ''}`}
                  onClick={() => {
                    const cur = draft.schedule.weekdays ?? []
                    patchSchedule({ weekdays: cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w] })
                  }}
                >
                  {t(`automation.day.${w}`)}
                </button>
              ))}
            </div>
            <button
              className="btn ghost sm"
              onClick={() => patchSchedule({ weekdays: WORKDAYS.slice() as Weekday[] })}
            >
              {t('automation.schedule.weekdays')}
            </button>
          </div>
        )}

        {(draft.schedule.kind === 'monthly' || draft.schedule.kind === 'yearly') && (
          <div className="kind-detail">
            {draft.schedule.kind === 'yearly' && (
              <input
                type="number"
                min={1}
                max={12}
                className="auto-input narrow"
                value={draft.schedule.month ?? 1}
                onChange={(e) => patchSchedule({ month: Number(e.target.value) })}
              />
            )}
            <input
              type="number"
              min={1}
              max={31}
              className="auto-input narrow"
              value={(draft.schedule.monthDays ?? [1])[0]}
              onChange={(e) => patchSchedule({ monthDays: [Number(e.target.value)] })}
            />
          </div>
        )}

        {draft.schedule.kind === 'once' && (
          <div className="kind-detail">
            <input
              type="datetime-local"
              className="auto-input"
              value={toLocalInput(draft.schedule.at)}
              onChange={(e) => patchSchedule({ at: new Date(e.target.value).getTime() })}
            />
          </div>
        )}

        {draft.schedule.kind === 'interval' && (
          <div className="kind-detail">
            <select
              className="filter-select"
              value={String(draft.schedule.intervalMinutes ?? 60)}
              onChange={(e) => patchSchedule({ intervalMinutes: Number(e.target.value) })}
            >
              <option value="60">{t('automation.form.interval.1h')}</option>
              <option value="120">{t('automation.form.interval.2h')}</option>
              <option value="240">{t('automation.form.interval.4h')}</option>
              <option value="480">{t('automation.form.interval.8h')}</option>
            </select>
          </div>
        )}

        <div className="schedule-preview">
          <span>{summary}</span>
          {next && (
            <span className="auto-next">{t('automation.runGroup.nextRun').replace('{time}', relTime(next, t))}</span>
          )}
        </div>

        <label className="field-label">{t('automation.modal.permissionMode.label')}</label>
        <div className="kind-row">
          <button
            className={`kind-chip ${draft.permission === 'default' ? 'active' : ''}`}
            onClick={() => patch({ permission: 'default' })}
            title={t('automation.modal.permissionMode.defaultDesc')}
          >
            {t('automation.modal.permissionMode.default')}
          </button>
          <button
            className={`kind-chip ${draft.permission === 'fullAccess' ? 'active' : ''}`}
            onClick={() => patch({ permission: 'fullAccess' })}
            title={t('automation.modal.permissionMode.fullAccessDesc')}
          >
            {t('automation.permission.fullAccess')}
            {t('automation.permission.fullAccessRecommend')}
          </button>
        </div>

        <div className="auto-notice">
          <strong>{t('automation.modal.executionNoticeLabel')}</strong>
          <span>{t('automation.modal.executionNoticeText')}</span>
        </div>

        <div className="dialog-actions">
          <button className="btn ghost" onClick={onCancel}>
            {t('automation.detail.action.cancel')}
          </button>
          <button className="btn" disabled={saving} onClick={() => void save()}>
            {saving ? t('automation.form.saving') : isNew ? t('automation.form.create') : t('automation.detail.action.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

function toLocalInput(ts?: number): string {
  const d = ts ? new Date(ts) : new Date(Date.now() + 3600000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
