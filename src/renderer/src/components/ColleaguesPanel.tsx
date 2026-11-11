import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from '../i18n'
import { toast } from '../stores/useToast'
import type {
  ChannelBinding,
  ChannelKind,
  Colleague,
  ColleagueStatus,
  ColleagueVisibility,
  ColleagueTask
} from '../../../shared/types'
import {
  ACTIVITY_LEVELS,
  AVATAR_MAX_BYTES,
  AVATAR_PAGE_SIZE,
  AVATAR_PRESETS,
  CAPABILITY_TAGS,
  CHANNELS,
  CLOUD_SUBJECT,
  CUSTOM_ROLE_ID,
  DETAIL_TABS,
  PLAN_LIMITS,
  RECOMMENDED_CARDS,
  RESPONSIBILITY_OPTIONS,
  ROLE_PRESETS,
  ROLE_PRESET_VISIBLE,
  TASK_STATUSES,
  VISIBILITIES,
  activityHeatmap,
  activityLevel,
  avatarGradient,
  avatarPresetKey,
  capabilityTagKey,
  cardDescKey,
  cardNameKey,
  cardTitleKey,
  channelBindLabelKey,
  channelDescKey,
  channelNameKey,
  colleagueStatusLabelKey,
  countLabelKey,
  countStatusKey,
  daysOnDuty,
  delegatorKey,
  detailTabLabelKey,
  heatmapTotal,
  imStatusKey,
  isExclusiveChannel,
  listStatusLabelKey,
  metricDescKey,
  metricLabelKey,
  publishOptionDescKey,
  publishOptionNameKey,
  publishSubmitKey,
  quotaContentKey,
  relativeTimeKey,
  responsibilityLabelKey,
  rolePresetDescKey,
  rolePresetNameKey,
  taskStatusKey,
  taskTableColumnKey,
  usageLabelKey,
  visibilityDescKey,
  visibilityNameKey
} from '../../../shared/colleague'
import { useColleagues } from '../stores/useColleagues'

/**
 * 数字员工 / 助理域面板 —— 对齐原版 `colleagues.*`（573 条）。
 *
 * 结构（与原版一致的分层）：
 * - 列表页（dashboard）：标题/副标题 + 状态筛选 + 置顶卡 + 助理卡片网格 + 推荐助理（空态引导）
 * - 创建 / 编辑向导（createDialog / editDialog）：基本信息 → 能力配置 两步
 * - 详情页（detail）：助理档案 + 任务概览/统计 + 活跃热力图 + 基本信息 + 记忆 + 对话任务
 * - 配置页（bindChannel / imConfig）：助理信息 / 接入渠道 / 权限与可见 / 用量 + 内存记忆
 * - 发布对话框（publishDialog）：个人分身 / 发布到项目 / 公开
 * - 配额对话框（quotaLimit）：按套餐显示上限
 *
 * 原文对其自身未实现的能力（IM 扫码绑定、专家雇佣、企业智能体、腾讯文档授权、
 * 代码仓库 OAuth）显式写了桩文案，复刻同样渲染这些提示对齐，而非杜撰真实链路。
 */

interface Props {
  onClose: () => void
}

/** 填空插值 —— 与原版 `{name}` 占位一致 */
function fill(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? `{${k}}` : String(vars[k])))
}

// ==================== 表单草稿 ====================

interface Draft {
  id: string
  /** 助理昵称 —— roleNickname */
  name: string
  /** 名称 —— name（唯一性校验） */
  displayName: string
  role: string
  description: string
  personality: string
  responsibilities: string[]
  tags: string[]
  avatar: string
  model: string
  visibility: ColleagueVisibility
  step: 'basic' | 'config'
}

function emptyDraft(): Draft {
  return {
    id: `col_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    displayName: '',
    role: CUSTOM_ROLE_ID,
    description: '',
    personality: '',
    responsibilities: [],
    tags: [],
    avatar: AVATAR_PRESETS[0],
    model: 'auto',
    visibility: 'personal',
    step: 'basic'
  }
}

function draftFrom(c: Colleague): Draft {
  return {
    id: c.id,
    name: c.name,
    displayName: c.displayName,
    role: c.role,
    description: c.description ?? '',
    personality: c.personality ?? '',
    responsibilities: [...c.responsibilities],
    tags: [...c.tags],
    avatar: c.avatar ?? AVATAR_PRESETS[0],
    model: c.model ?? 'auto',
    visibility: c.visibility,
    step: 'basic'
  }
}

// ==================== 头像 ====================

function ColleagueAvatar({ c, size = 40 }: { c: Pick<Colleague, 'avatar' | 'name' | 'id'>; size?: number }) {
  const isDataUrl = (c.avatar ?? '').startsWith('data:')
  if (isDataUrl) {
    return <img className="col-avatar" style={{ width: size, height: size }} src={c.avatar} alt={c.name} />
  }
  const [from, to] = avatarGradient(c.avatar ?? AVATAR_PRESETS[0])
  return (
    <span
      className="col-avatar col-avatar-gen"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${from}, ${to})`, fontSize: Math.round(size * 0.42) }}
      aria-hidden
    >
      {(c.name || '?').slice(0, 1)}
    </span>
  )
}

// ==================== 面板 ====================

export default function ColleaguesPanel({ onClose }: Props) {
  const { t } = useTranslation()
  const store = useColleagues()

  const [filter, setFilter] = useState<'all' | 'abnormal'>('all')
  const [query, setQuery] = useState('')
  const [menuId, setMenuId] = useState<string | null>(null)
  /** 详情页当前助理 */
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<(typeof DETAIL_TABS)[number]>('home')
  /** 创建 / 编辑向导 */
  const [draft, setDraft] = useState<Draft | null>(null)
  const [avatarPage, setAvatarPage] = useState(0)
  /** 职业预设是否展开全部（对齐 `viewMore` / `viewLess`） */
  const [showAllRoles, setShowAllRoles] = useState(false)
  const [saving, setSaving] = useState(false)
  /** 配置页（bindChannel / imConfig） */
  const [configId, setConfigId] = useState<string | null>(null)
  const [configTab, setConfigTab] = useState<'bindChannel' | 'imConfig'>('bindChannel')
  const [imTab, setImTab] = useState<'assistant' | 'colleague' | 'memory'>('colleague')
  /** 发布对话框 */
  const [publishId, setPublishId] = useState<string | null>(null)
  const [publishPick, setPublishPick] = useState<ColleagueVisibility>('personal')
  /** 删除确认 */
  const [pendingDelete, setPendingDelete] = useState<Colleague | null>(null)
  /** 配额对话框 */
  const [showQuota, setShowQuota] = useState(false)

  const [bindings, setBindings] = useState<ChannelBinding[]>([])
  const [memory, setMemory] = useState<{ subject: string; enabled: boolean } | null>(null)
  const [tasks, setTasks] = useState<ColleagueTask[]>([])
  const [quota, setQuota] = useState({ plan: 'standard', limit: PLAN_LIMITS.standard, used: 0 })

  const refresh = useCallback(async () => {
    await store.load()
    const q = await window.workbuddy.colleagueQuota()
    setQuota(q)
  }, [store])

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const off = window.workbuddy.onColleagueChanged(() => void refresh())
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh])

  /**
   * Esc 逐层关闭：向导 → 发布 → 删除确认 → 配额 → 配置 → 详情 → 面板。
   * capture + stopImmediatePropagation，避免 App 的全局 Esc 跳层（与日程面板同款处理）。
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (draft) return setDraft(null)
      if (publishId) return setPublishId(null)
      if (pendingDelete) return setPendingDelete(null)
      if (showQuota) return setShowQuota(false)
      if (configId) return setConfigId(null)
      if (detailId) return setDetailId(null)
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [draft, publishId, pendingDelete, showQuota, configId, detailId, onClose])

  // ---------- 载入上下文（配置页 / 详情页） ----------

  useEffect(() => {
    if (!configId) return
    void window.workbuddy.colleagueBindings().then(setBindings)
    void window.workbuddy.colleagueMemory(configId).then(setMemory)
  }, [configId])

  // 列表页同样需要渠道绑定：卡片 IM 状态徽标与云助理状态条都读它
  useEffect(() => {
    void window.workbuddy.colleagueBindings().then(setBindings)
  }, [])

  useEffect(() => {
    if (!detailId) return
    void window.workbuddy.colleagueTasks(detailId).then(setTasks)
  }, [detailId])

  // ---------- 派生 ----------

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return store.colleagues.filter((c) => {
      if (filter === 'abnormal' && c.status !== 'abnormal') return false
      if (q) {
        const hay = `${c.name} ${c.displayName} ${c.role} ${c.description ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [store.colleagues, filter, query])

  const working = store.colleagues.filter((c) => c.status === 'working').length
  const detail = detailId ? store.colleagues.find((c) => c.id === detailId) ?? null : null
  const configTarget = configId ? store.colleagues.find((c) => c.id === configId) ?? null : null
  const publishTarget = publishId ? store.colleagues.find((c) => c.id === publishId) ?? null : null

  /** 云助理是否已连接任一 IM —— 对齐 `dashboard.imConnected` */
  const cloudBound = bindings.some((b) => b.state === 'bound' && b.subject === CLOUD_SUBJECT)

  // ---------- 行为 ----------

  const openCreate = () => {
    setMenuId(null)
    if (quota.used >= quota.limit) {
      setShowQuota(true)
      return
    }
    setAvatarPage(0)
    setShowAllRoles(false)
    setDraft(emptyDraft())
  }

  const openEdit = (c: Colleague) => {
    setMenuId(null)
    setAvatarPage(0)
    setShowAllRoles(ROLE_PRESETS.includes(c.role))
    setDraft(draftFrom(c))
  }

  /** 第一步必填校验 —— 对齐 `requiredError`：「助理昵称、助理简介和名称」三者缺一不可 */
  const basicValid = (d: Draft) =>
    Boolean(d.name.trim() && d.description.trim() && d.displayName.trim())

  /** 从第一步进入第二步；校验失败时以 `requiredError` 阻断，停留在第一步 */
  const goNext = () => {
    if (!draft) return
    if (!basicValid(draft)) {
      toast.error(t('colleagues.createDialog.requiredError'))
      return
    }
    setDraft({ ...draft, step: 'config' })
  }

  const saveDraft = async () => {
    if (!draft) return
    // 对齐 `requiredError`：昵称 / 简介 / 名称 必填
    if (!basicValid(draft)) {
      toast.error(t('colleagues.createDialog.requiredError'))
      return
    }
    // 对齐 `nameDuplicated`
    const taken = await window.workbuddy
      .colleagueList()
      .then((ls) => ls.some((c) => c.displayName === draft.displayName.trim() && c.id !== draft.id))
    if (taken) {
      toast.error(t('colleagues.createDialog.nameDuplicated'))
      return
    }
    setSaving(true)
    try {
      const existing = store.colleagues.find((c) => c.id === draft.id)
      await window.workbuddy.colleagueSave({
        id: draft.id,
        name: draft.name.trim(),
        displayName: draft.displayName.trim(),
        role: draft.role,
        description: draft.description.trim(),
        personality: draft.personality.trim() || undefined,
        responsibilities: draft.responsibilities,
        tags: draft.tags,
        avatar: draft.avatar,
        model: draft.model,
        visibility: draft.visibility,
        status: existing?.status ?? (existing ? 'idle' : 'working'),
        online: existing?.online ?? true,
        pinned: existing?.pinned ?? false,
        source: existing?.source ?? 'personal',
        connections: draft.role === CUSTOM_ROLE_ID ? [] : (existing?.connections ?? []),
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now()
      })
      setDraft(null)
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  const togglePin = async (c: Colleague) => {
    setMenuId(null)
    const r = await window.workbuddy.colleaguePinned(c.id, !c.pinned)
    // 对齐 `action.pinFailed` / `unpinFailed`
    if (!r) toast.error(t(c.pinned ? 'colleagues.action.unpinFailed' : 'colleagues.action.pinFailed'))
    else await refresh()
  }

  const togglePause = async (c: Colleague) => {
    setMenuId(null)
    await window.workbuddy.colleaguePaused(c.id, c.status === 'working')
    await refresh()
  }

  const cloneOne = async (c: Colleague) => {
    setMenuId(null)
    const r = await window.workbuddy.colleagueClone(c.id, {
      // 对齐 `action.cloneDescriptionFallback`：{name} 的副本
      displayName: fill(t('colleagues.action.cloneDescriptionFallback'), { name: c.displayName })
    })
    if (!r) {
      // 对齐 `action.cloneFailed`：复制助理失败：{message}
      toast.error(fill(t('colleagues.action.cloneFailed'), { message: t('colleagues.chat.unknownError') }))
      return
    }
    await refresh()
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const target = pendingDelete
    setPendingDelete(null)
    setDetailId((cur) => (cur === target.id ? null : cur))
    await window.workbuddy.colleagueDelete(target.id)
    await refresh()
  }

  const submitPublish = async () => {
    if (!publishTarget) return
    await window.workbuddy.colleaguePublish(publishTarget.id, publishPick)
    setPublishId(null)
    await refresh()
  }

  const bindChannel = async (subject: string, channel: ChannelKind) => {
    const next = await window.workbuddy.colleagueBind(subject, channel, 'bound')
    setBindings(await window.workbuddy.colleagueBindings())
    return next
  }

  const unbindChannel = async (subject: string, channel: ChannelKind) => {
    await window.workbuddy.colleagueUnbind(subject, channel)
    setBindings(await window.workbuddy.colleagueBindings())
  }

  const saveMemory = async (subject: string, enabled: boolean) => {
    const next = await window.workbuddy.colleagueMemorySave(subject, enabled)
    setMemory(next)
  }

  /** 打开助理对话 —— 对齐 `detail.startChat` / 列表卡；本域以 toast 提示接入（对话链路属 chat 域） */
  const startChat = (c: Colleague) => {
    toast.info(fill(t('colleagues.chat.status.creating'), { name: c.name }))
  }

  // ==================== 渲染 ====================

  return (
    <div className="colleagues-panel">
      <header className="col-header">
        <div className="col-header-left">
          {detail ? (
            <>
              <button
                className="btn ghost sm"
                onClick={() => {
                  setDetailId(null)
                  setDetailTab('home')
                }}
              >
                ← {t('colleagues.detail.back')}
              </button>
              <div className="col-header-titles">
                <div className="col-header-name">{detail.name}</div>
                <div className="col-header-sub">{detail.description}</div>
              </div>
            </>
          ) : (
            <div className="col-header-titles">
              <div className="col-header-name">{t('colleagues.title')}</div>
              <div className="col-header-sub">{t('colleagues.subtitle')}</div>
            </div>
          )}
        </div>
        <div className="col-header-actions">
          {!detail && (
            <>
              <span className="col-count">{fill(t(countLabelKey()), { count: store.colleagues.length })}</span>
              <input
                className="filter-input"
                placeholder={t('colleagues.createDialog.name')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="col-filters" role="group" aria-label={t('colleagues.dashboard.filterLabel')}>
                <button className={`kind-chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                  {t('colleagues.dashboard.filterAll')}
                </button>
                <button className={`kind-chip ${filter === 'abnormal' ? 'active' : ''}`} onClick={() => setFilter('abnormal')}>
                  {t('colleagues.dashboard.filterAbnormal')}
                </button>
              </div>
              <button className="btn sm" onClick={openCreate}>
                + {t('colleagues.create')}
              </button>
            </>
          )}
          <button className="btn ghost sm" onClick={onClose}>
            {t('chat.search.close')}
          </button>
        </div>
      </header>

      {detail ? (
        // ==================== 详情页 ====================
        <section className="col-detail">
          <nav className="col-tabs" aria-label={t('colleagues.detail.tabs')}>
            {DETAIL_TABS.map((tab) => (
              <button
                key={tab}
                className={`col-tab ${detailTab === tab ? 'active' : ''}`}
                onClick={() => setDetailTab(tab)}
              >
                {t(detailTabLabelKey(tab))}
              </button>
            ))}
          </nav>

          {detailTab === 'home' && (
            <div className="col-detail-body">
              <div className="col-detail-head">
                <ColleagueAvatar c={detail} size={56} />
                <div className="col-detail-headinfo">
                  <div className="col-detail-name">
                    {detail.name}
                    <span className="col-role-chip">{roleTitle(t, detail.role)}</span>
                  </div>
                  <div className="col-detail-desc">{detail.description}</div>
                  <div className="col-detail-chips">
                    {detail.tags.map((tag) => (
                      <span key={tag} className="col-tag">
                        {t(capabilityTagKey(tag))}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="col-detail-headactions">
                  <button className="btn sm" onClick={() => startChat(detail)}>
                    {t('colleagues.detail.startChat')}
                  </button>
                  <button className="btn ghost sm" onClick={() => openEdit(detail)}>
                    {t('colleagues.action.editProfile')}
                  </button>
                  <button
                    className="btn ghost sm"
                    onClick={() => {
                      setConfigTab('bindChannel')
                      setConfigId(detail.id)
                    }}
                  >
                    {t('colleagues.bindChannel.sidebarTitle')}
                  </button>
                </div>
              </div>

              {/* 状态横幅 —— 对齐 statusBannerLabel / statusBannerDesc / idleNoTask / readyForTask */}
              <div className={`col-banner st-${detail.status}`} role="group" aria-label={t('colleagues.detail.statusBannerLabel')}>
                <span className={`col-status st-${detail.status}`}>{t(colleagueStatusLabelKey(detail.status))}</span>
                <span className="col-banner-text">
                  {detail.status === 'working'
                    ? t('colleagues.detail.processing')
                    : detail.description
                      ? fill(t('colleagues.detail.statusBannerDesc'), { name: detail.name })
                      : t('colleagues.detail.idleNoTask')}
                </span>
                <span className="col-banner-sub">
                  {detail.status === 'idle' ? t('colleagues.detail.readyForTask') : t('colleagues.detail.activityWorkingDesc')}
                </span>
              </div>

              {/* 任务统计 —— 对齐 detail.metricsLabel / metric.* */}
              <div className="col-metrics" role="group" aria-label={t('colleagues.detail.metricsLabel')}>
                {(['total', 'inProgress', 'completed', 'completionRate'] as const).map((k) => (
                  <div key={k} className="col-metric">
                    <div className="col-metric-value">{metricValue(k, tasks)}</div>
                    <div className="col-metric-label">{t(metricLabelKey(k))}</div>
                    <div className="col-metric-desc">{t(metricDescKey(k))}</div>
                  </div>
                ))}
              </div>

              {/* 活跃热力图 —— 对齐 activityHeatmap / activityLevel / activityTotal / less / more */}
              <div className="col-card">
                <div className="col-card-title">{t('colleagues.detail.activityHeatmap')}</div>
                <Heatmap
                  id={detail.id}
                  totalLabel={fill(t('colleagues.detail.activityTotal'), { count: heatmapTotal(activityHeatmap(detail.id)) })}
                  less={t('colleagues.detail.less')}
                  more={t('colleagues.detail.more')}
                  levelLabel={t('colleagues.detail.activityLevel')}
                />
              </div>

              {/* 基本信息 —— 对齐 detail.basicInfo.* */}
              <div className="col-card">
                <div className="col-card-title">{t('colleagues.detail.basicInfo')}</div>
                <dl className="col-kv">
                  <dt>{t('colleagues.detail.source')}</dt>
                  <dd>
                    {detail.source === 'personal'
                      ? t('colleagues.detail.personalSource')
                      : detail.source === 'expert'
                        ? t('colleagues.detail.hiredExpert')
                        : t('colleagues.createDialog.hireExpert.tab.enterprise')}
                  </dd>
                  <dt>{t('colleagues.detail.delegatedBy')}</dt>
                  <dd>{t(delegatorKey(true))}</dd>
                  <dt>{t('colleagues.detail.visibleScope')}</dt>
                  <dd>{t(visibilityNameKey(detail.visibility))}</dd>
                  <dt>{t('colleagues.detail.daysOnDuty')}</dt>
                  <dd>{daysOnDuty(detail.createdAt)}</dd>
                  <dt>{t('colleagues.detail.createdAt')}</dt>
                  <dd>{new Date(detail.createdAt).toLocaleString()}</dd>
                  <dt>{t('colleagues.detail.updatedAt')}</dt>
                  <dd>{new Date(detail.updatedAt).toLocaleString()}</dd>
                </dl>
              </div>

              {/* 已启用连接 / 适用场景 —— 对齐 detail.connections / scenarios */}
              <div className="col-card">
                <div className="col-card-title">{t('colleagues.detail.connections')}</div>
                {(detail.connections ?? []).length === 0 ? (
                  <div className="col-muted">{t('colleagues.detail.notConfigured')}</div>
                ) : (
                  <div className="col-detail-chips">
                    {detail.connections.map((x) => (
                      <span key={x} className="col-tag">
                        {x}
                      </span>
                    ))}
                  </div>
                )}
                <div className="col-card-title" style={{ marginTop: 12 }}>
                  {t('colleagues.detail.scenarios')}
                </div>
                <div className="col-detail-chips">
                  {detail.responsibilities.length === 0 ? (
                    <span className="col-muted">{t('colleagues.detail.notConfigured')}</span>
                  ) : (
                    detail.responsibilities.map((r) => (
                      <span key={r} className="col-tag">
                        {t(responsibilityLabelKey(r))}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* 最近动态 —— 对齐 detail.recentActivity / current / activityDoneDesc */}
              <div className="col-card">
                <div className="col-card-title">{t('colleagues.detail.recentActivity')}</div>
                <div className="col-activity">
                  <span className="col-status st-idle">{t('colleagues.detail.current')}</span>
                  <span>
                    {fill(t('colleagues.detail.activityDoneDesc'), { credit: 0 })} ·{' '}
                    {t(relativeTimeKey(detail.updatedAt))}
                  </span>
                </div>
                {(detail.connections ?? []).length > 0 ? (
                  <button className="btn ghost sm" onClick={() => setConfigId(detail.id)}>
                    {t('colleagues.detail.capabilityConfig')}
                  </button>
                ) : (
                  <button className="btn ghost sm" onClick={() => openEdit(detail)}>
                    {t('colleagues.detail.taskConfig')}
                  </button>
                )}
              </div>
            </div>
          )}

          {detailTab === 'memory' && (
            <div className="col-detail-body">
              <div className="col-card">
                <div className="col-card-title">{t('colleagues.detail.memory')}</div>
                <div className="col-muted">{fill(t('colleagues.detail.memoryPageDesc'), { name: detail.name })}</div>
                {/* 对齐 detail.memoryEmpty：本域记忆条目由对话沉淀，复刻以空态对齐 */}
                <div className="col-empty-sm">{t('colleagues.detail.memoryEmpty')}</div>
              </div>
              <div className="col-card">
                <div className="col-card-title">{t('colleagues.imConfig.memory.heading')}</div>
                <div className="col-muted">{t('colleagues.imConfig.memory.subtitle')}</div>
                <MemorySwitch subject={detail.id} current={memory?.subject === detail.id ? memory.enabled : true} onSave={saveMemory} />
              </div>
            </div>
          )}

          {detailTab === 'tasks' && (
            <div className="col-detail-body">
              <div className="col-card">
                <div className="col-card-title">{t('colleagues.detail.taskOverviewV2')}</div>
                <div className="col-muted">{fill(t('colleagues.detail.taskPageDesc'), { name: detail.name })}</div>
                <table className="col-table">
                  <thead>
                    <tr>
                      {(['id', 'name', 'status', 'source', 'createdAt', 'action'] as const).map((c) => (
                        <th key={c}>{t(taskTableColumnKey(c))}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="col-muted">
                          {t('colleagues.detail.idleNoTask')}
                        </td>
                      </tr>
                    ) : (
                      tasks.map((task) => (
                        <tr key={task.id}>
                          <td className="col-mono">{task.id.slice(-8)}</td>
                          <td>{task.name || t('colleagues.detail.taskTable.untitledName')}</td>
                          <td>
                            <span className={`col-status st-${task.status}`}>
                              {t(taskStatusKey((TASK_STATUSES.includes(task.status as never) ? task.status : 'idle') as never))}
                            </span>
                          </td>
                          <td>{task.source ?? t('colleagues.detail.taskSourceCloud')}</td>
                          <td>{new Date(task.createdAt).toLocaleDateString()}</td>
                          <td>
                            <button
                              className="btn ghost sm"
                              aria-label={fill(t('colleagues.detail.taskTable.openHistoryAria'), {
                                name: task.name || t('colleagues.detail.taskTable.untitledName')
                              })}
                              onClick={() => toast.info(t('colleagues.detail.taskTable.openHistoryFailed'))}
                            >
                              {t('colleagues.detail.tasks')}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      ) : (
        // ==================== 列表页 ====================
        <section className="col-body">
          {store.loadError ? (
            <div className="col-empty">{t('colleagues.loadError')}</div>
          ) : store.colleagues.length === 0 ? (
            <>
              <div className="col-empty">{t('colleagues.empty')}</div>
              <div className="col-recommend">
                <div className="col-card-title">{t('colleagues.dashboard.recommended')}</div>
                <div className="col-grid">
                  {RECOMMENDED_CARDS.map((id) => (
                    <button
                      key={id}
                      className="col-card col-reco-card"
                      onClick={() => {
                        setAvatarPage(0)
                        const d = emptyDraft()
                        d.role = id === 'researcher' ? 'industryResearcher' : id === 'analyst' ? 'dataAnalyst' : 'contentCreator'
                        d.displayName = t(cardNameKey(id))
                        d.description = t(cardDescKey(id))
                        setDraft(d)
                      }}
                    >
                      <div className="col-reco-name">{t(cardNameKey(id))}</div>
                      <div className="col-reco-title">{t(cardTitleKey(id))}</div>
                      <div className="col-muted">{t(cardDescKey(id))}</div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* 云助理状态条 —— 对齐 dashboard.* */}
              <div className="col-cloudbar">
                <span className="col-cloud-tag">{t('colleagues.dashboard.cloudTag')}</span>
                <span className="col-cloud-title">{t('colleagues.dashboard.assistantTitle')}</span>
                <span className="col-muted">
                  {fill(t(countStatusKey()), { count: store.colleagues.length, working })}
                </span>
                <span className={`col-status ${cloudBound ? 'st-working' : 'st-idle'}`}>
                  {cloudBound ? t('colleagues.dashboard.imConnected') : t('colleagues.dashboard.imDisconnected')}
                </span>
              </div>

              <div className="col-grid">
                {list.map((c) => {
                  const bound = bindings.some((b) => b.subject === c.id && b.state === 'bound')
                  return (
                    <div key={c.id} className="col-card col-item" data-id={c.id}>
                      <div className="col-item-head">
                        <ColleagueAvatar c={c} size={40} />
                        <div className="col-item-titles">
                          <div className="col-item-name">
                            {c.name}
                            {c.pinned && <span className="col-pin" title={t('colleagues.action.unpin')}>📌</span>}
                          </div>
                          <div className="col-item-role">{roleTitle(t, c.role)}</div>
                        </div>
                        <button
                          className="icon-btn"
                          aria-label={t('colleagues.moreActions')}
                          onClick={() => setMenuId(menuId === c.id ? null : c.id)}
                        >
                          ⋯
                        </button>
                      </div>

                      <div className="col-item-desc">{c.description}</div>
                      <div className="col-item-chips">
                        <span className={`col-status st-${c.status}`}>{t(listStatusLabelKey(c.status))}</span>
                        {c.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="col-tag">
                            {t(capabilityTagKey(tag))}
                          </span>
                        ))}
                      </div>
                      <div className="col-item-foot">
                        <span className="col-muted">{fill(t(usageLabelKey()), { usage: `${c.tags.length}/${CAPABILITY_TAGS.length}` })}</span>
                        <span className="col-muted">{t(imStatusKey(bound))}</span>
                        <button className="btn ghost sm" onClick={() => startChat(c)}>
                          {t('colleagues.dashboard.chat')}
                        </button>
                      </div>

                      {menuId === c.id && (
                        <div className="col-menu">
                          <button onClick={() => { setMenuId(null); setDetailId(c.id); setDetailTab('home') }}>
                            {t('colleagues.action.viewDetails')}
                          </button>
                          <button onClick={() => openEdit(c)}>{t('colleagues.action.editProfile')}</button>
                          <button onClick={() => void cloneOne(c)}>{t('colleagues.action.copyAsNew')}</button>
                          <button onClick={() => void togglePin(c)}>
                            {c.pinned ? t('colleagues.action.unpin') : t('colleagues.action.pin')}
                          </button>
                          <button onClick={() => void togglePause(c)}>
                            {c.status === 'working' ? t('colleagues.action.pauseColleague') : t('colleagues.action.resumeColleague')}
                          </button>
                          <button
                            onClick={() => {
                              setMenuId(null)
                              setPublishPick(c.visibility)
                              setPublishId(c.id)
                            }}
                          >
                            {t('colleagues.action.publishToProject')}
                          </button>
                          <button
                            onClick={() => {
                              setMenuId(null)
                              setConfigTab('bindChannel')
                              setConfigId(c.id)
                            }}
                          >
                            {t('colleagues.action.bindChannel')}
                          </button>
                          <button className="danger" onClick={() => { setMenuId(null); setPendingDelete(c) }}>
                            {t('colleagues.action.delete')}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </section>
      )}

      {/* ==================== 创建 / 编辑向导 ==================== */}
      {draft && (
        <div className="col-modal" onClick={() => setDraft(null)}>
          <div className="dialog col-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">
              {store.colleagues.some((c) => c.id === draft.id) ? t('colleagues.editDialog.title') : t('colleagues.createDialog.title')}
            </div>
            <div className="col-steps" role="group" aria-label={t('colleagues.createDialog.progressLabel')}>
              {(['basic', 'config'] as const).map((s, i) => (
                <button
                  key={s}
                  className={`col-step ${draft.step === s ? 'active' : ''}`}
                  onClick={() => (s === 'config' ? goNext() : setDraft({ ...draft, step: s }))}
                >
                  {i + 1}. {t(`colleagues.createDialog.steps.${s}`)}
                </button>
              ))}
            </div>

            {draft.step === 'basic' ? (
              <>
                {/* 头像 —— 20 张预制 + 自定义上传（上传在桌面端按原文桩文案处理） */}
                <label className="field-label">{t('colleagues.createDialog.avatar')}</label>
                <div className="col-avatar-row">
                  <ColleagueAvatar c={{ avatar: draft.avatar, name: draft.name || '?', id: draft.id }} size={48} />
                  <div className="col-avatar-grid">
                    {AVATAR_PRESETS.slice(avatarPage * AVATAR_PAGE_SIZE, avatarPage * AVATAR_PAGE_SIZE + AVATAR_PAGE_SIZE).map((pid) => (
                      <button
                        key={pid}
                        className={`col-avatar-pick ${draft.avatar === pid ? 'active' : ''}`}
                        title={t(avatarPresetKey(pid))}
                        aria-label={t(avatarPresetKey(pid))}
                        onClick={() => setDraft({ ...draft, avatar: pid })}
                      >
                        <span style={{ background: `linear-gradient(135deg, ${avatarGradient(pid)[0]}, ${avatarGradient(pid)[1]})` }} />
                      </button>
                    ))}
                  </div>
                  <div className="col-avatar-actions">
                    <button className="btn ghost sm" onClick={() => setAvatarPage((p) => Math.max(0, p - 1))}>
                      {t('colleagues.createDialog.previousAvatar')}
                    </button>
                    <button className="btn ghost sm" onClick={() => setAvatarPage((p) => p + 1)}>
                      {t('colleagues.createDialog.moreAvatar')}
                    </button>
                    <button
                      className="btn ghost sm"
                      onClick={() => toast.info(t('colleagues.createDialog.avatarUploadUnsupported'))}
                      title={`${t('colleagues.createDialog.avatarHint').replace('{count}', String(AVATAR_PRESETS.length))} · ${Math.round(AVATAR_MAX_BYTES / 1048576)} MB`}
                    >
                      {t('colleagues.createDialog.avatarUploadShort')}
                    </button>
                  </div>
                </div>

                {/* 职业快捷选项 —— 20 个预设 + 自定义 */}
                <label className="field-label">{t('colleagues.createDialog.rolePresetLabel')}</label>
                <div className="col-role-grid" role="group" aria-label={t('colleagues.createDialog.rolePresetLabel')}>
                  {[CUSTOM_ROLE_ID, ...ROLE_PRESETS].map((rid, idx) => {
                    // 首屏展示「自定义 + 前 N 个预设」；展开后全量。已选中的预设始终可见。
                    const hidden = !showAllRoles && rid !== CUSTOM_ROLE_ID && idx > ROLE_PRESET_VISIBLE
                    if (hidden && draft.role !== rid) return null
                    return (
                      <button
                        key={rid}
                        className={`col-role ${draft.role === rid ? 'active' : ''}`}
                        onClick={() => setDraft({ ...draft, role: rid })}
                      >
                        <span className="col-role-name">
                          {rid === CUSTOM_ROLE_ID ? t('colleagues.createDialog.customRole') : t(rolePresetNameKey(rid))}
                        </span>
                        <span className="col-role-desc">
                          {rid === CUSTOM_ROLE_ID ? t('colleagues.createDialog.customRoleDesc') : t(rolePresetDescKey(rid))}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <button className="btn ghost sm col-roles-toggle" onClick={() => setShowAllRoles((v) => !v)}>
                  {showAllRoles ? t('colleagues.createDialog.viewLess') : t('colleagues.createDialog.viewMore')}
                </button>

                <div className="col-form-row">
                  <div>
                    <label className="field-label">{t('colleagues.createDialog.roleNickname')}</label>
                    <input
                      className="auto-input"
                      value={draft.name}
                      placeholder={t('colleagues.createDialog.roleNicknamePlaceholder')}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="field-label">{t('colleagues.createDialog.name')}</label>
                    <input
                      className="auto-input"
                      value={draft.displayName}
                      placeholder={t('colleagues.createDialog.namePlaceholder')}
                      onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
                    />
                  </div>
                </div>

                <label className="field-label">{t('colleagues.createDialog.description')}</label>
                <textarea
                  className="auto-textarea"
                  rows={2}
                  value={draft.description}
                  placeholder={t('colleagues.createDialog.descriptionPlaceholder')}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
                <button
                  className="btn ghost sm"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      description: t('colleagues.createDialog.exampleDescription'),
                      displayName: draft.displayName || t('colleagues.createDialog.exampleName')
                    })
                  }
                >
                  {t('colleagues.createDialog.fillExample')}
                </button>

                <label className="field-label">{t('colleagues.createDialog.personality')}</label>
                <input
                  className="auto-input"
                  value={draft.personality}
                  placeholder={t('colleagues.createDialog.personalityPlaceholder')}
                  onChange={(e) => setDraft({ ...draft, personality: e.target.value })}
                />

                <label className="field-label">{t('colleagues.createDialog.responsibilities')}</label>
                <div className="kind-row">
                  {RESPONSIBILITY_OPTIONS.map((r) => (
                    <button
                      key={r}
                      className={`kind-chip ${draft.responsibilities.includes(r) ? 'active' : ''}`}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          responsibilities: draft.responsibilities.includes(r)
                            ? draft.responsibilities.filter((x) => x !== r)
                            : [...draft.responsibilities, r]
                        })
                      }
                    >
                      {t(responsibilityLabelKey(r))}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* 能力配置 —— 对齐 advancedConfig / connectionTitle / configTitle */}
                <div className="field-label">
                  {t('colleagues.createDialog.advancedConfig')}{' '}
                  <span className="col-muted">{t('colleagues.createDialog.advancedConfigHint')}</span>
                </div>

                <label className="field-label">{t('colleagues.createDialog.connectionTitle')}</label>
                <div className="col-muted">{t('colleagues.createDialog.connectionIntro')}</div>
                <div className="kind-row">
                  <button className="kind-chip" onClick={() => toast.info(t('colleagues.bindChannel.placeholder'))}>
                    {t('colleagues.createDialog.connection.docs')}
                  </button>
                  <button className="kind-chip" onClick={() => toast.info(t('colleagues.createDialog.codeRepo.empty'))}>
                    {t('colleagues.createDialog.connection.repo')}
                  </button>
                  <button className="kind-chip" onClick={() => setDraft({ ...draft, visibility: 'project' })}>
                    {t('colleagues.createDialog.knowledgeBase')}
                  </button>
                </div>
                <div className="col-muted">{t('colleagues.createDialog.knowledgeBaseDesc')}</div>

                {/* 雇佣专家 —— 原文标注 Beta 与桩能力 */}
                <label className="field-label">{t('colleagues.createDialog.hireExpert.entryTitle')}</label>
                <div className="col-muted">
                  {t('colleagues.createDialog.hireExpert.entryDesc')}{' '}
                  <span className="col-beta">{t('colleagues.createDialog.hireExpert.beta')}</span>
                </div>
                <div className="col-stub" role="note">
                  {t('colleagues.createDialog.hireExpert.enterpriseUnsupported')}
                </div>

                {/* 能力标签 —— 对齐 cards 之外的一组 tag 选择 */}
                <label className="field-label">{t('colleagues.skillsLabel')}</label>
                <div className="kind-row">
                  {CAPABILITY_TAGS.map((tag) => (
                    <button
                      key={tag}
                      className={`kind-chip ${draft.tags.includes(tag) ? 'active' : ''}`}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          tags: draft.tags.includes(tag) ? draft.tags.filter((x) => x !== tag) : [...draft.tags, tag]
                        })
                      }
                    >
                      {t(capabilityTagKey(tag))}
                    </button>
                  ))}
                </div>

                {/* 模型 —— 对齐 model.headerTitle / auto / empty */}
                <label className="field-label">{t('colleagues.createDialog.model.headerTitle')}</label>
                <div className="kind-row">
                  <button
                    className={`kind-chip ${draft.model === 'auto' ? 'active' : ''}`}
                    onClick={() => setDraft({ ...draft, model: 'auto' })}
                  >
                    {t('colleagues.createDialog.model.auto')}
                  </button>
                </div>
                <div className="col-muted">{t('colleagues.createDialog.configIntro')}</div>

                {/* 可见范围 —— 对齐 permission.* */}
                <label className="field-label">{t('colleagues.publishDialog.scopeLabel')}</label>
                <div className="col-vis-grid">
                  {VISIBILITIES.map((v) => (
                    <button
                      key={v}
                      className={`col-vis ${draft.visibility === v ? 'active' : ''}`}
                      onClick={() => setDraft({ ...draft, visibility: v })}
                    >
                      <span className="col-vis-name">{t(visibilityNameKey(v))}</span>
                      <span className="col-muted">{t(visibilityDescKey(v))}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="dialog-actions">
              <button className="btn ghost" onClick={() => setDraft(null)}>
                {t('chat.cancel')}
              </button>
              {draft.step === 'config' && (
                <button className="btn ghost" onClick={() => setDraft({ ...draft, step: 'basic' })}>
                  {t('colleagues.createDialog.previous')}
                </button>
              )}
              {draft.step === 'basic' ? (
                <button className="btn" onClick={goNext}>
                  {t('colleagues.createDialog.next')}
                </button>
              ) : (
                <button className="btn" disabled={saving} onClick={() => void saveDraft()}>
                  {store.colleagues.some((c) => c.id === draft.id)
                    ? t('colleagues.editDialog.finish')
                    : t('colleagues.createDialog.finish')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== 配置页 ==================== */}
      {configId && configTarget && (
        <div className="col-modal" onClick={() => setConfigId(null)}>
          <div className="dialog col-dialog col-config" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">{fill(t('colleagues.bindChannel.title'), { name: configTarget.name })}</div>
            <div className="col-config-body">
              <nav className="col-config-nav" aria-label={t('colleagues.bindChannel.sidebarLabel')}>
                {(['bindChannel', 'imConfig'] as const).map((k) => (
                  <button
                    key={k}
                    className={`col-config-navitem ${configTab === k ? 'active' : ''}`}
                    onClick={() => setConfigTab(k)}
                  >
                    {t(`colleagues.${k}.sidebarTitle`)}
                  </button>
                ))}
                <span className="col-config-navitem disabled">
                  {t('colleagues.bindChannel.section.usage')}
                  <span className="col-soon">{t('colleagues.bindChannel.section.comingSoon')}</span>
                </span>
              </nav>

              <div className="col-config-main">
                {configTab === 'bindChannel' ? (
                  <>
                    <div className="col-section-title">{t('colleagues.bindChannel.section.profile')}</div>
                    <div className="col-muted">{t('colleagues.bindChannel.profile.intro')}</div>
                    <div className="col-detail-chips">
                      <span className="col-tag">{t(visibilityNameKey(configTarget.visibility))}</span>
                      <span className="col-tag">{roleTitle(t, configTarget.role)}</span>
                    </div>

                    <div className="col-section-title">{t('colleagues.bindChannel.section.channel')}</div>
                    <div className="col-muted">{t('colleagues.bindChannel.channel.intro')}</div>
                    <div className="col-channels">
                      {CHANNELS.map((ch) => {
                        const mine = bindings.find((b) => b.subject === configTarget.id && b.channel === ch)
                        const owner = bindings.find((b) => b.channel === ch && b.state === 'bound')
                        const bound = mine?.state === 'bound'
                        const ownedByOther = !!owner && owner.subject !== configTarget.id && isExclusiveChannel(ch)
                        return (
                          <div key={ch} className="col-channel">
                            <div>
                              <div className="col-channel-name">{t(channelNameKey(ch))}</div>
                              <div className="col-muted">{t(channelDescKey(ch))}</div>
                              {ownedByOther && !bound && (
                                <div className="col-muted">
                                  {fill(t('colleagues.bindChannel.channel.wechatBot.boundTo'), {
                                    name:
                                      store.colleagues.find((c) => c.id === owner.subject)?.name ??
                                      t('colleagues.myColleagues')
                                  })}
                                </div>
                              )}
                            </div>
                            <div className="col-channel-actions">
                              <span className={`col-status ${bound ? 'st-working' : 'st-idle'}`}>
                                {t(channelBindLabelKey(bound ? 'bound' : 'unbound'))}
                              </span>
                              {bound ? (
                                <button className="btn ghost sm" onClick={() => void unbindChannel(configTarget.id, ch)}>
                                  {t('colleagues.bindChannel.channel.unbind')}
                                </button>
                              ) : (
                                <button className="btn ghost sm" onClick={() => void bindChannel(configTarget.id, ch)}>
                                  {t('colleagues.bindChannel.channel.bind')}
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {/* 原文对扫码/授权链路标注了桩文案 */}
                    <div className="col-stub" role="note">
                      {t('colleagues.bindChannel.channel.wechatBot.scanDesc')} · {t('colleagues.bindChannel.placeholder')}
                    </div>

                    <div className="col-section-title">{t('colleagues.bindChannel.section.permission')}</div>
                    <div className="col-muted">{t('colleagues.bindChannel.permission.intro')}</div>
                    <div className="col-vis-grid">
                      {VISIBILITIES.map((v) => (
                        <button
                          key={v}
                          className={`col-vis ${configTarget.visibility === v ? 'active' : ''}`}
                          onClick={async () => {
                            await window.workbuddy.colleaguePublish(configTarget.id, v)
                            await refresh()
                          }}
                        >
                          <span className="col-vis-name">{t(visibilityNameKey(v))}</span>
                          <span className="col-muted">{t(visibilityDescKey(v))}</span>
                        </button>
                      ))}
                    </div>
                    {/* 助理在线 —— 对齐 permission.online.title / desc */}
                    <label className="col-overlay">
                      <input
                        type="checkbox"
                        checked={configTarget.online}
                        onChange={async (e) => {
                          await window.workbuddy.colleagueSave({ ...configTarget, online: e.target.checked, updatedAt: Date.now() })
                          await refresh()
                        }}
                      />
                      {t('colleagues.bindChannel.permission.online.title')}
                    </label>
                    <div className="col-muted">{t('colleagues.bindChannel.permission.online.desc')}</div>
                  </>
                ) : (
                  <>
                    <div className="col-tabs">
                      {(['assistant', 'colleague', 'memory'] as const).map((k) => (
                        <button key={k} className={`col-tab ${imTab === k ? 'active' : ''}`} onClick={() => setImTab(k)}>
                          {t(`colleagues.imConfig.tab.${k}`)}
                        </button>
                      ))}
                    </div>

                    {imTab === 'assistant' && (
                      <>
                        <div className="col-section-title">{t('colleagues.imConfig.assistant.heading')}</div>
                        <div className="col-muted">{t('colleagues.imConfig.assistant.subtitle')}</div>
                        <div className="col-card-title">{t('colleagues.imConfig.assistant.colleagueListTitle')}</div>
                        <div className="col-muted">
                          {fill(t('colleagues.imConfig.assistant.colleagueListSummary'), { total: store.colleagues.length })}
                        </div>
                        <div className="col-channels">
                          {CHANNELS.filter((c) => !isExclusiveChannel(c)).map((ch) => {
                            const b = bindings.find((x) => x.subject === CLOUD_SUBJECT && x.channel === ch)
                            const bound = b?.state === 'bound'
                            return (
                              <div key={ch} className="col-channel">
                                <div>{t(channelNameKey(ch))}</div>
                                <div className="col-channel-actions">
                                  <span className={`col-status ${bound ? 'st-working' : 'st-idle'}`}>
                                    {bound ? t('colleagues.imConfig.assistant.connected') : t('colleagues.imConfig.assistant.notConnected')}
                                  </span>
                                  <button
                                    className="btn ghost sm"
                                    onClick={() => void (bound ? unbindChannel(CLOUD_SUBJECT, ch) : bindChannel(CLOUD_SUBJECT, ch))}
                                  >
                                    {t(channelBindLabelKey(bound ? 'bound' : 'unbound'))}
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </>
                    )}

                    {imTab === 'colleague' && (
                      <>
                        <div className="col-section-title">{t('colleagues.imConfig.colleague.heading')}</div>
                        <div className="col-muted">{t('colleagues.imConfig.colleague.subtitle')}</div>
                        <label className="field-label">{t('colleagues.imConfig.colleague.switchLabel')}</label>
                        <div className="col-channels">
                          {store.colleagues.length === 0 ? (
                            <div className="col-muted">{t('colleagues.imConfig.colleague.empty')}</div>
                          ) : (
                            store.colleagues.map((c) => {
                              const bound = bindings.some((b) => b.subject === c.id && b.state === 'bound')
                              return (
                                <div key={c.id} className="col-channel">
                                  <div className="col-channel-name">{c.name}</div>
                                  <span className={`col-status ${bound ? 'st-working' : 'st-idle'}`}>
                                    {bound ? t('colleagues.imConfig.assistant.connected') : t('colleagues.imConfig.assistant.notConnected')}
                                  </span>
                                </div>
                              )
                            })
                          )}
                        </div>
                      </>
                    )}

                    {imTab === 'memory' && (
                      <>
                        <div className="col-section-title">{t('colleagues.imConfig.memory.heading')}</div>
                        <div className="col-muted">{t('colleagues.imConfig.memory.subtitle')}</div>
                        <MemorySwitch subject={configTarget.id} current={memory?.enabled ?? true} onSave={saveMemory} />
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="dialog-actions">
              <button className="btn" onClick={() => setConfigId(null)}>
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 发布对话框 ==================== */}
      {publishId && publishTarget && (
        <div className="col-modal" onClick={() => setPublishId(null)}>
          <div className="dialog col-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">{t('colleagues.publishDialog.title')}</div>
            <label className="field-label">
              {t('colleagues.publishDialog.colleagueLabel')}: {publishTarget.name}
            </label>
            <label className="field-label">{t('colleagues.publishDialog.scopeLabel')}</label>
            <div className="col-vis-grid">
              {VISIBILITIES.map((v) => (
                <button
                  key={v}
                  className={`col-vis ${publishPick === v ? 'active' : ''}`}
                  onClick={() => setPublishPick(v)}
                >
                  <span className="col-vis-name">{t(publishOptionNameKey(v))}</span>
                  <span className="col-muted">{t(publishOptionDescKey(v))}</span>
                </button>
              ))}
            </div>
            <div className="dialog-actions">
              <button className="btn ghost" onClick={() => setPublishId(null)}>
                {t('chat.cancel')}
              </button>
              <button className="btn" onClick={() => void submitPublish()}>
                {t(publishSubmitKey(publishPick))}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 删除确认 ==================== */}
      {pendingDelete && (
        <div className="col-modal" onClick={() => setPendingDelete(null)}>
          <div className="dialog col-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">{t('colleagues.action.deleteConfirmTitle')}</div>
            <div className="dialog-content">
              {fill(t('colleagues.action.deleteConfirm'), { name: pendingDelete.name })}
            </div>
            <div className="col-muted">
              {fill(t('colleagues.action.deleteConfirmDescription'), { name: pendingDelete.name })}
            </div>
            <div className="dialog-actions">
              <button className="btn ghost" onClick={() => setPendingDelete(null)}>
                {t('chat.cancel')}
              </button>
              <button className="btn danger" onClick={() => void confirmDelete()}>
                {t('colleagues.action.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 配额对话框 ==================== */}
      {showQuota && (
        <div className="col-modal" onClick={() => setShowQuota(false)}>
          <div className="dialog col-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">{t('colleagues.quotaLimit.title')}</div>
            <div className="dialog-content">
              {fill(t(quotaContentKey(quota.plan)), { limit: quota.limit })}
            </div>
            <div className="dialog-actions">
              <button className="btn ghost" onClick={() => setShowQuota(false)}>
                {t('colleagues.quotaLimit.confirm')}
              </button>
              <button className="btn" onClick={() => toast.info(t('colleagues.quotaLimit.upgrade'))}>
                {t('colleagues.quotaLimit.upgrade')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== 子组件 ====================

/** 职业标题 —— 预设取词典，自定义回落到职能字段 */
function roleTitle(t: (k: string) => string, role: string): string {
  return role === CUSTOM_ROLE_ID ? t('colleagues.createDialog.customRole') : t(rolePresetNameKey(role))
}

/** 任务统计取值 —— 由任务列表推导，无数据时按完成率语义回落 0 */
function metricValue(k: 'total' | 'inProgress' | 'completed' | 'completionRate', tasks: ColleagueTask[]): string {
  const total = tasks.length
  const done = tasks.filter((x) => x.status === 'completed').length
  const doing = tasks.filter((x) => x.status === 'inProgress').length
  if (k === 'total') return String(total)
  if (k === 'inProgress') return String(doing)
  if (k === 'completed') return String(done)
  return total === 0 ? '—' : `${Math.round((done / total) * 100)}%`
}

/** 活跃热力图 —— 近一年按天分档，图例对齐 detail.activityLevel / less / more */
function Heatmap({
  id,
  totalLabel,
  less,
  more,
  levelLabel
}: {
  id: string
  totalLabel: string
  less: string
  more: string
  levelLabel: string
}) {
  const cells = useMemo(() => activityHeatmap(id), [id])
  return (
    <div className="col-heatmap">
      <div className="col-heatmap-grid" role="img" aria-label={levelLabel}>
        {cells.map((n, i) => (
          <span key={i} className={`col-cell lv-${activityLevel(n)}`} title={String(n)} />
        ))}
      </div>
      <div className="col-heatmap-foot">
        <span className="col-muted">{totalLabel}</span>
        <span className="col-heatmap-legend">
          {less}
          {Array.from({ length: ACTIVITY_LEVELS }, (_, i) => (
            <span key={i} className={`col-cell lv-${i}`} />
          ))}
          {more}
        </span>
      </div>
    </div>
  )
}

/** 内存记忆开关 —— 对齐 imConfig.memory.switch.{name,status,desc,aria} */
function MemorySwitch({
  subject,
  current,
  onSave
}: {
  subject: string
  current: boolean
  onSave: (subject: string, enabled: boolean) => Promise<void>
}) {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(current)
  useEffect(() => setEnabled(current), [current, subject])
  return (
    <div className="col-memory">
      <label className="col-overlay">
        <input
          type="checkbox"
          aria-label={t('colleagues.imConfig.memory.switch.aria')}
          checked={enabled}
          onChange={async (e) => {
            const next = e.target.checked
            setEnabled(next)
            await onSave(subject, next)
          }}
        />
        {t('colleagues.imConfig.memory.switch.name')}
        <span className="col-muted">{enabled ? t('colleagues.imConfig.memory.switch.status') : ''}</span>
      </label>
      <div className="col-muted">{t('colleagues.imConfig.memory.switch.desc')}</div>
    </div>
  )
}

/** 状态类型再导出，避免组件层重复 import */
export type { ColleagueStatus }
