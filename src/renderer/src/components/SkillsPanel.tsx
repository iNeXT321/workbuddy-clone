import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from '../i18n'
import { toast } from '../stores/useToast'
import type { Skill } from '../../../shared/types'
import {
  ALL_FILTER,
  BACK_TO_SKILL_KEY,
  BATCH_ACTIONS,
  BATCH_DESELECT_ALL_KEY,
  BATCH_LIMIT,
  BATCH_PARTIAL_FAILED_KEY,
  BATCH_SELECTED_KEY,
  BATCH_SELECT_ALL_KEY,
  BUY_SKILL_KEY,
  DETAIL_SECTIONS,
  INSTALLED_GROUPS,
  INSTALLED_GROUP_LOAD_MORE_KEY,
  OVERVIEW_SEARCH_PLACEHOLDER_KEY,
  OVERVIEW_SEARCH_TOOLTIP_KEY,
  PICKER_NO_RESULT_KEY,
  PICKER_SEARCH_KEY,
  PICKER_SELECTED_KEY,
  PICKER_TITLE_KEY,
  REFUND_LIMIT,
  REPLICATE_KEY,
  SHARE_STEPS,
  SKILLS_BACK_TO_ALL_KEY,
  SKILLS_BATCH_MANAGE_KEY,
  SKILLS_CREATE_PROMPT_KEY,
  SKILLS_DELETE_CONTENT_KEY,
  SKILLS_DELETE_TITLE_KEY,
  SKILLS_ENABLED_WARNING_KEY,
  SKILLS_ENTRY_KEY,
  SKILLS_FIND_BUTTON_KEY,
  SKILLS_FIND_PROMPT_KEY,
  SKILLS_SEARCH_KEY,
  SKILLS_SHOW_LESS_KEY,
  SKILLS_SHOW_MORE_KEY,
  SKILLS_SUBTITLE_KEY,
  SKILLS_TITLE_KEY,
  SKILL_TABS,
  SKILL_SORTS,
  UPLOAD_REQUIREMENTS,
  batchActionLabelKey,
  batchResultKey,
  canBatchSelect,
  canDownloadToLocal,
  canRefund,
  canUploadToCloud,
  cloudActionKey,
  compactCount,
  detailMetricLabelKey,
  detailSectionTitleKey,
  installedBadgeKey,
  installedGroupLabelKey,
  installLabelKey,
  installSuccessKey,
  isExpired,
  isHighRisk,
  isPurchased,
  matchesQuery,
  paidBadgeKey,
  pickerEmptyKey,
  priceLabel,
  riskResultKey,
  riskTooltipKey,
  shareChannelKey,
  shareGateKey,
  shareStepLabelKey,
  shouldWarnEnabled,
  sortLabelKey,
  sortSkills,
  syncLabelKey,
  tabLabelKey,
  toggleTipKey,
  translationNoticeKey,
  uploadPolicyKey
} from '../../../shared/skill'
import { useSkills } from '../stores/useSkills'

/**
 * 技能市场 / 技能管理面板 —— 对齐原版 `skills.*`（513 条）。
 *
 * 结构与原版一致的分层：
 * - 六个 Tab（`tab.*`）：推荐 / SkillHub / 套件 / Knot / 企业 Skill / 已安装
 * - 卡片网格（`card.*`）：未安装 → 安装；已安装 → 去对话 / 自动触发开关 / 编辑 /
 *   卸载 / 置顶切换，另有同步态徽标与付费徽标
 * - 详情抽屉（`detail.*`）：基本信息 / 概述（⌘F 搜索）/ 试试这样用 / 使用案例
 * - 批量管理（`batch.*`）：全选 / 清空 / 卸载 / 开启 / 关闭 / 上传云端，上限 50
 * - 技能选择器（`picker.*`）、导入（`upload.*`）、上传云端（`cloudUpload.*`）、
 *   分享（`share.*`）、安全检测（`security.*`）、付费与退款（`purchase` / `refund`）
 *
 * 原版对云端同步、安全检测（科恩实验室评估）、分享（微信小程序码）、付费
 * 一律以桩文案标注未接入；复刻同样渲染桩文案对齐，不杜撰真实链路。
 */

interface Props {
  onClose: () => void
}

/** 填空插值 —— 与原版 `{name}` / `{count}` 占位一致 */
function fill(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? `{${k}}` : String(vars[k])))
}

function fmtDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function SkillsPanel({ onClose }: Props) {
  const { t } = useTranslation()
  const store = useSkills()

  const [tab, setTab] = useState<(typeof SKILL_TABS)[number]>('recommend')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<(typeof SKILL_SORTS)[number]>('score')
  const [tag, setTag] = useState(ALL_FILTER)
  const [hideInstalled, setHideInstalled] = useState(false)
  /** 详情抽屉 */
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailSection, setDetailSection] = useState<string>(DETAIL_SECTIONS[0])
  const [detailExpanded, setDetailExpanded] = useState(false)
  const [overviewQuery, setOverviewQuery] = useState('')
  /** 卡片菜单 */
  const [menuId, setMenuId] = useState<string | null>(null)
  /** 未安装列表折叠 */
  const [showAll, setShowAll] = useState(false)
  /** 已安装分组各自「加载更多」 */
  const [groupExpanded, setGroupExpanded] = useState<Record<string, boolean>>({})
  /** 批量管理 */
  const [batchMode, setBatchMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [batchConfirm, setBatchConfirm] = useState(false)
  const [deleteCloudToo, setDeleteCloudToo] = useState(false)
  /** 单卡卸载确认 */
  const [pendingUninstall, setPendingUninstall] = useState<Skill | null>(null)
  /** 技能选择器 */
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerSelected, setPickerSelected] = useState<string[]>([])
  /** 导入 */
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  /** 上传云端 */
  const [cloudOpen, setCloudOpen] = useState(false)
  const [cloudPhase, setCloudPhase] = useState<'idle' | 'uploading' | 'failed'>('idle')
  const [dontRemind, setDontRemind] = useState(false)
  const [riskAccepted, setRiskAccepted] = useState(false)
  /** 分享 */
  const [shareOpen, setShareOpen] = useState(false)
  const [shareStep, setShareStep] = useState(0)
  /** 安全检测 */
  const [securityOpen, setSecurityOpen] = useState(false)
  const [securityName, setSecurityName] = useState('')
  const [scanCountdown, setScanCountdown] = useState(5)
  /** 付费 / 退款 */
  const [buyId, setBuyId] = useState<string | null>(null)
  const [buyKind, setBuyKind] = useState<'monthly' | 'permanent'>('monthly')
  const [refundId, setRefundId] = useState<string | null>(null)
  const [blockedBuy, setBlockedBuy] = useState(false)
  /** 更新覆盖确认 */
  const [updateId, setUpdateId] = useState<string | null>(null)
  /** 启用超阈值告警可关闭 */
  const [warnDismissed, setWarnDismissed] = useState(false)

  const refresh = useCallback(async () => {
    await store.load()
    await store.loadEnabledCount()
  }, [store])

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const off = window.workbuddy.onSkillChanged(() => void refresh())
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh])

  /** Esc 逐层关闭：菜单 → 各对话框 → 详情 → 批量 → 面板 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (menuId) return setMenuId(null)
      if (pendingUninstall) return setPendingUninstall(null)
      if (batchConfirm) return setBatchConfirm(false)
      if (updateId) return setUpdateId(null)
      if (blockedBuy) return setBlockedBuy(false)
      if (refundId) return setRefundId(null)
      if (buyId) return setBuyId(null)
      if (securityOpen) return setSecurityOpen(false)
      if (shareOpen) return setShareOpen(false)
      if (cloudOpen) return setCloudOpen(false)
      if (uploadOpen) return setUploadOpen(false)
      if (pickerOpen) return setPickerOpen(false)
      if (detailId) return setDetailId(null)
      if (batchMode) return setBatchMode(false)
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [
    menuId,
    pendingUninstall,
    batchConfirm,
    updateId,
    blockedBuy,
    refundId,
    buyId,
    securityOpen,
    shareOpen,
    cloudOpen,
    uploadOpen,
    pickerOpen,
    detailId,
    batchMode,
    onClose
  ])

  /** 安全检测倒计时 —— 对齐 `security.confirmCountdown`（{seconds}） */
  useEffect(() => {
    if (!securityOpen) return
    setScanCountdown(5)
    const timer = window.setInterval(() => {
      setScanCountdown((n) => (n <= 0 ? 0 : n - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [securityOpen])

  // ==================== 派生 ====================

  /**
   * 已安装数量 —— 必须按 `installed` 位统计，而不是 `countBySource().installed`。
   * 后者数的是「来源字段等于 installed」的技能，与「已安装」不是同一口径
   * （推荐/SkillHub 里的已安装技能也会出现在已安装 Tab）。
   */
  const installedCount = useMemo(() => store.skills.filter((s) => s.installed).length, [store.skills])

  const byTab = useMemo(
    () => (tab === 'installed' ? store.skills.filter((s) => s.installed) : store.skills.filter((s) => s.source === tab)),
    [store.skills, tab]
  )

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const s of byTab) for (const x of s.tags ?? []) set.add(x)
    return [ALL_FILTER, ...Array.from(set)]
  }, [byTab])

  const list = useMemo(() => {
    let out = byTab.filter((s) => matchesQuery(s, query))
    if (tag !== ALL_FILTER) out = out.filter((s) => (s.tags ?? []).includes(tag))
    if (hideInstalled && tab !== 'installed') out = out.filter((s) => !s.installed)
    return sortSkills(out, sort)
  }, [byTab, query, tag, hideInstalled, tab, sort])

  const visible = useMemo(() => (showAll ? list : list.slice(0, 9)), [list, showAll])

  const detail = useMemo(() => store.skills.find((s) => s.id === detailId) ?? null, [store.skills, detailId])

  const pickList = useMemo(
    () => store.skills.filter((s) => (tab === 'installed' ? s.installed : s.source === tab)).filter((s) => matchesQuery(s, pickerQuery)),
    [store.skills, tab, pickerQuery]
  )

  const warnVisible = !warnDismissed && shouldWarnEnabled(store.enabledCount)

  // ==================== 动作 ====================

  const closeMenus = () => setMenuId(null)

  const doInstall = async (s: Skill) => {
    closeMenus()
    // 付费且未购 → 先购买；已退款 3 次 → 拦截（对齐 `purchase.blockedBody`）
    if (s.paidKind !== 'free' && !isPurchased(s)) {
      if ((s.refundCount ?? 0) >= REFUND_LIMIT) return setBlockedBuy(true)
      setBuyKind(s.paidKind === 'permanent' ? 'permanent' : 'monthly')
      return setBuyId(s.id)
    }
    // 高风险 → 需先过安全检测（对齐 `security.highRisk.title` / `policy.forbidHighRisk`）
    if (isHighRisk(s.riskLevel ?? 'safe')) {
      setSecurityName(s.name)
      return setSecurityOpen(true)
    }
    const r = await window.workbuddy.skillInstalled(s.id, true)
    if (!r) return toast.error(t('skills.toast.installFailed'))
    toast.success(fill(t(installSuccessKey(s.source)), { name: s.name }) + t('skills.toast.trySkill'))
  }

  const confirmSecurityInstall = async () => {
    setSecurityOpen(false)
    const s = detail ?? store.skills.find((x) => x.name === securityName)
    if (!s) return
    const r = await window.workbuddy.skillInstalled(s.id, true)
    if (!r) return toast.error(t('skills.toast.installFailed'))
    setSecurityName('')
    toast.success(fill(t(installSuccessKey(s.source)), { name: s.name }) + t('skills.toast.trySkill'))
  }

  const doUninstall = async (s: Skill) => {
    closeMenus()
    const ok = await window.workbuddy.skillInstalled(s.id, false)
    setPendingUninstall(null)
    if (ok) toast.success(fill(t('skills.toast.deleted'), { name: s.name }))
    else toast.error(t('skills.toast.deleteFailed'))
  }

  const toggleEnabled = async (s: Skill) => {
    closeMenus()
    const next = !s.enabled
    const r = await window.workbuddy.skillEnabled(s.id, next)
    if (!r) return toast.error(t('skills.toast.toggleFailed'))
    toast.success(fill(t(next ? 'skills.toast.setAuto' : 'skills.toast.setManual'), { name: s.name }))
  }

  const togglePin = async (s: Skill) => {
    closeMenus()
    await window.workbuddy.skillPinned(s.id, !s.pinned)
  }

  /** 云端动作 —— 桩：上传走对话框、下载直接翻同步态并出桩提示 */
  const cloudAct = async (s: Skill) => {
    closeMenus()
    if (canUploadToCloud(s)) {
      setRiskAccepted(false)
      setDontRemind(false)
      setCloudPhase('idle')
      return setCloudOpen(true)
    }
    if (canDownloadToLocal(s)) {
      const next = await window.workbuddy.skillSync(s.id, 'synced')
      if (next) toast.success(t('skills.cloudDownload.success'))
    }
  }

  const confirmCloudUpload = async () => {
    setCloudPhase('uploading')
    await new Promise((r) => setTimeout(r, 120))
    const targets = batchMode && selected.length ? selected : detailId ? [detailId] : []
    for (const id of targets) await window.workbuddy.skillSync(id, 'synced')
    setCloudOpen(false)
    setCloudPhase('idle')
    toast.success(fill(t('skills.cloudUpload.modal.batchSuccess'), { count: targets.length }))
  }

  const doShare = (s: Skill) => {
    closeMenus()
    setShareStep(0)
    setShareOpen(true)
  }

  const confirmBuy = async () => {
    if (!buyId) return
    const s = store.skills.find((x) => x.id === buyId)
    await window.workbuddy.skillPurchase(buyId, buyKind, s?.price ?? 0)
    setBuyId(null)
    const r = await window.workbuddy.skillInstalled(buyId, true)
    if (r) toast.success(fill(t(installSuccessKey(r.source)), { name: r.name }) + t('skills.toast.trySkill'))
  }

  const confirmRefund = async () => {
    if (!refundId) return
    await window.workbuddy.skillRefund(refundId)
    setRefundId(null)
    toast.info(fill(t('skills.uninstall.toast.localCount'), { count: 1 }))
  }

  const confirmUpdate = async () => {
    if (!updateId) return
    const s = store.skills.find((x) => x.id === updateId)
    setUpdateId(null)
    if (s) toast.success(fill(t('skills.toast.updated'), { name: s.name }) + t('skills.toast.trySkill'))
  }

  // ==================== 批量 ====================

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (!canBatchSelect(prev.length)) {
        toast.info(fill(t('skills.batch.limitExceeded'), { limit: BATCH_LIMIT }))
        return prev
      }
      return [...prev, id]
    })
  }

  const doBatch = async (action: (typeof BATCH_ACTIONS)[number]) => {
    if (!selected.length) return
    if (action === 'uploadToCloud') {
      setBatchConfirm(false)
      setRiskAccepted(false)
      setCloudPhase('idle')
      return setCloudOpen(true)
    }
    let res: { ok: string[]; failed: string[] }
    if (action === 'uninstall') {
      // 有效期内的付费技能跳过（对齐 `paid.batchUninstallBlocked`）
      const paid = selected.filter((id) => {
        const s = store.skills.find((x) => x.id === id)
        return s && s.paidKind !== 'free' && isPurchased(s)
      })
      const targets = selected.filter((id) => !paid.includes(id))
      res = await window.workbuddy.skillBatchUninstall(targets)
      if (paid.length) toast.info(fill(t('skills.paid.batchUninstallBlocked'), { count: paid.length }))
    } else {
      res = await window.workbuddy.skillBatchEnabled(selected, action === 'enable')
    }
    setBatchConfirm(false)
    if (res.failed.length) {
      const names = res.failed.map((id) => store.skills.find((x) => x.id === id)?.name ?? id).join('、')
      toast.info(fill(t(BATCH_PARTIAL_FAILED_KEY), { names }))
    }
    if (res.ok.length) toast.success(fill(t(batchResultKey(action)), { count: res.ok.length }))
    setSelected([])
    setBatchMode(false)
  }

  /**
   * Tab 空态 key —— 来源不对称（词典实测）：
   * - `searchEmpty` 仅 `skillhub` / `knot` 有；`recommend` / `plugins` / `enterprise` 无
   * - `empty` 仅 `recommend` / `skillhub` / `knot` / `plugins` / `enterprise` 有
   * - 已安装走 `installed.{searchNoMatch.title,empty.title}`
   * 无自有键时回落到语义最接近的通用文案，绝不返回未定义的 key。
   */
  const emptyKey = (): string => {
    if (tab === 'installed') {
      return query.trim() ? 'skills.installed.searchNoMatch.title' : 'skills.installed.empty.title'
    }
    const hasOwnSearchEmpty = ['skillhub', 'knot'].includes(tab)
    const hasOwnEmpty = ['recommend', 'skillhub', 'knot', 'plugins', 'enterprise'].includes(tab)
    if (query.trim()) return hasOwnSearchEmpty ? `skills.${tab}.searchEmpty` : 'skills.knot.searchEmpty'
    return hasOwnEmpty ? `skills.${tab}.empty` : 'skills.recommend.empty'
  }

  // ==================== 卡片 ====================

  const renderCard = (s: Skill) => {
    const isSel = selected.includes(s.id)
    const badge = paidBadgeKey(s)
    return (
      <div className={`sk-card ${isSel ? 'selected' : ''}`} key={s.id} data-id={s.id}>
        <div className="sk-card-head">
          {batchMode && (
            <input type="checkbox" checked={isSel} onChange={() => toggleSelect(s.id)} data-id={`sk-sel-${s.id}`} />
          )}
          <div className="sk-card-name" onClick={() => setDetailId(s.id)} data-id={`sk-name-${s.id}`}>
            {s.name}
          </div>
          {s.pinned && (
            <span className="sk-pin" title={t('skills.card.unpin')}>
              ★
            </span>
          )}
          {s.installed && <span className="sk-badge-installed">{t(installedBadgeKey(s.source))}</span>}
          <div className="sk-menu-wrap">
            <button
              className="icon-btn sm"
              title={t('skills.card.more')}
              onClick={() => setMenuId(menuId === s.id ? null : s.id)}
              data-id={`sk-menu-${s.id}`}
            >
              ⋯
            </button>
            {menuId === s.id && (
              <div className="sk-menu" data-id={`sk-menu-list-${s.id}`}>
                {!s.installed && (
                  <button onClick={() => void doInstall(s)} data-id={`sk-install-${s.id}`}>
                    {t(installLabelKey(s.source))}
                  </button>
                )}
                {s.installed && (
                  <>
                    <button onClick={() => { closeMenus(); toast.info(fill(t('colleagues.chat.status.creating'), { name: s.name })) }}>
                      {t('skills.card.goChat')}
                    </button>
                    <button onClick={() => void toggleEnabled(s)} data-id={`sk-toggle-${s.id}`}>
                      {t(s.enabled ? 'skills.card.disable' : 'skills.card.enable')}
                    </button>
                    <button onClick={() => { closeMenus(); toast.info(fill(t('skills.edit.examplePrompt'), { skillId: s.id })) }}>
                      {t('skills.card.edit')}
                    </button>
                    <button onClick={() => void togglePin(s)} data-id={`sk-pin-${s.id}`}>
                      {t(s.pinned ? 'skills.card.unpin' : 'skills.card.pin')}
                    </button>
                    <button onClick={() => setPendingUninstall(s)} data-id={`sk-uninstall-${s.id}`}>
                      {t('skills.card.uninstall')}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="sk-card-desc" onClick={() => setDetailId(s.id)}>
          {s.description ?? t('skills.detail.noData')}
        </div>

        <div className="sk-card-chips">
          {badge && (
            <span className={`sk-paid-chip ${isExpired(s) ? 'expired' : ''}`} data-id={`sk-paid-${s.id}`}>
              {fill(t(badge), { date: s.purchasedUntil ? fmtDate(s.purchasedUntil) : '' })}
            </span>
          )}
          {s.sync !== 'localOnly' && <span className="sk-tag">{t(syncLabelKey(s.sync))}</span>}
          {s.cloudAvailable && (
            <span className="sk-tag" title={t('skills.tag.cloudAvailableTooltip')}>
              {t('skills.tag.cloudAvailable')}
            </span>
          )}
          {s.needsApiKey && <span className="sk-tag warn">{t('skills.tag.needsApiKey')}</span>}
          {s.installed && !s.enabled && <span className="sk-tag">{t('skills.card.enable')}</span>}
        </div>

        <div className="sk-card-foot">
          <span className="sk-metric" data-id={`sk-dl-${s.id}`}>
            ↓ {compactCount(s.metrics.downloadCount)}
          </span>
          <span className="sk-metric">★ {compactCount(s.metrics.starCount)}</span>
          <span className="sk-metric">⚙ {compactCount(s.metrics.useCount)}</span>
          <span className="sk-grow" />
          {!s.installed && (
            <button className="btn sm" onClick={() => void doInstall(s)} data-id={`sk-cta-${s.id}`}>
              {t(installLabelKey(s.source))}
            </button>
          )}
          {s.installed && (
            <button
              className={`sk-switch ${s.enabled ? 'on' : ''}`}
              onClick={() => void toggleEnabled(s)}
              title={t(toggleTipKey(!s.enabled))}
              data-id={`sk-switch-${s.id}`}
            >
              <span className="sk-switch-knob" />
            </button>
          )}
        </div>
      </div>
    )
  }

  // ==================== 渲染 ====================

  return (
    <div className="skills-panel" data-id="skills-panel">
      <header className="sk-header">
        <div className="sk-header-left">
          <div className="sk-header-titles">
            <div className="sk-header-name" data-id="sk-title">
              {t(SKILLS_TITLE_KEY)}
            </div>
            <div className="sk-header-sub">{fill(t(SKILLS_SUBTITLE_KEY), { name: 'WorkBuddy' })}</div>
          </div>
        </div>
        <div className="sk-header-actions">
          <input
            className="filter-input"
            placeholder={t(SKILLS_SEARCH_KEY)}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-id="sk-search"
          />
          <button
            className="btn sm"
            onClick={() => {
              setPickerOpen(true)
              setPickerQuery('')
              setPickerSelected([])
            }}
            data-id="sk-find"
          >
            {t(SKILLS_FIND_BUTTON_KEY)}
          </button>
          <button className="btn ghost sm" onClick={() => setUploadOpen(true)} data-id="sk-upload">
            {t('skills.import.button')}
          </button>
          {tab === 'installed' && !batchMode && (
            <button
              className="btn ghost sm"
              onClick={() => {
                setBatchMode(true)
                setSelected([])
              }}
              data-id="sk-batch-manage"
            >
              {t(SKILLS_BATCH_MANAGE_KEY)}
            </button>
          )}
          <button className="btn ghost sm" onClick={onClose} data-id="sk-close">
            {t('chat.search.close')}
          </button>
        </div>
      </header>

      {/* 六个 Tab */}
      <nav className="sk-tabs" aria-label={t(SKILLS_ENTRY_KEY)} data-id="sk-tabs">
        {SKILL_TABS.map((s) => (
          <button
            key={s}
            className={`kind-chip ${tab === s ? 'active' : ''}`}
            onClick={() => {
              setTab(s)
              setTag(ALL_FILTER)
              setShowAll(false)
              setQuery('')
              setBatchMode(false)
              setSelected([])
            }}
            data-id={`sk-tab-${s}`}
          >
            {t(tabLabelKey(s))}
            {s === 'installed' && installedCount > 0 && <span className="sk-badge">{installedCount}</span>}
          </button>
        ))}
        <span className="sk-grow" />
        {tab !== 'recommend' && tab !== 'installed' && (
          <label className="sk-check">
            <input
              type="checkbox"
              checked={hideInstalled}
              onChange={(e) => setHideInstalled(e.target.checked)}
              data-id="sk-hide-installed"
            />
            {t('skills.filter.hideInstalled')}
          </label>
        )}
        <select
          className="filter-input sk-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as (typeof SKILL_SORTS)[number])}
          data-id="sk-sort"
        >
          {SKILL_SORTS.map((s) => (
            <option key={s} value={s}>
              {t(sortLabelKey(s))}
            </option>
          ))}
        </select>
      </nav>

      {/* 启用超阈值告警 —— 对齐 `enabledWarning`（> 80） */}
      {warnVisible && (
        <div className="sk-warn" data-id="sk-warn">
          <span>{t(SKILLS_ENABLED_WARNING_KEY)}</span>
          <button className="btn sm" onClick={() => { setTab('installed'); setWarnDismissed(true) }} data-id="sk-warn-manage">
            {t('skills.enabledWarning.manage')}
          </button>
          <button className="btn ghost sm" onClick={() => setWarnDismissed(true)} data-id="sk-warn-dismiss">
            {t('skills.enabledWarning.dismiss')}
          </button>
        </div>
      )}

      {/* 批量操作条 */}
      {batchMode && (
        <div className="sk-batch" data-id="sk-batch">
          <span data-id="sk-batch-count">{fill(t(BATCH_SELECTED_KEY), { count: selected.length })}</span>
          <button
            className="btn ghost sm"
            onClick={() =>
              setSelected((prev) => (prev.length === list.length && list.length > 0 ? [] : list.slice(0, BATCH_LIMIT).map((s) => s.id)))
            }
            data-id="sk-select-all"
          >
            {selected.length === list.length && list.length > 0 ? t(BATCH_DESELECT_ALL_KEY) : t(BATCH_SELECT_ALL_KEY)}
          </button>
          {BATCH_ACTIONS.map((a) => (
            <button
              key={a}
              className="btn ghost sm"
              disabled={selected.length === 0}
              onClick={() => {
                if (a === 'uninstall') return setBatchConfirm(true)
                void doBatch(a)
              }}
              data-id={`sk-batch-${a}`}
            >
              {t(batchActionLabelKey(a))}
            </button>
          ))}
          <span className="sk-grow" />
          <button
            className="btn sm"
            onClick={() => {
              setBatchMode(false)
              setSelected([])
            }}
            data-id="sk-batch-cancel"
          >
            {t('skills.batch.cancelBatchManage')}
          </button>
        </div>
      )}

      {/* 分类筛选 */}
      {allTags.length > 1 && (
        <div className="sk-filters" data-id="sk-filters">
          {allTags.map((x) => (
            <button
              key={x}
              className={`kind-chip ${tag === x ? 'active' : ''}`}
              onClick={() => setTag(x)}
              data-id={`sk-tag-${x}`}
            >
              {x === ALL_FILTER ? t(tab === 'knot' ? 'skills.knot.allTags' : 'skills.recommend.allTags') : x}
            </button>
          ))}
        </div>
      )}

      <div className="sk-body">
        {store.loadError && <div className="sk-empty">{t('skills.market.loadError')}</div>}

        {!store.loadError && list.length === 0 && (
          <div className="sk-empty" data-id="sk-empty">
            <div className="sk-empty-title" data-id="sk-empty-title">
              {t(emptyKey())}
            </div>
            {tab === 'installed' && <div className="sk-muted">{t('skills.installed.empty.desc')}</div>}
            {tab === 'installed' && (
              <div className="sk-dialog-actions">
                <button className="btn sm" onClick={() => setUploadOpen(true)}>
                  {t('skills.import.button')}
                </button>
                <button className="btn ghost sm" onClick={() => toast.info(t(SKILLS_FIND_PROMPT_KEY))}>
                  {t(SKILLS_FIND_BUTTON_KEY)}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 已安装按来源分组 —— 对齐 `installed.group.*` */}
        {tab === 'installed' && list.length > 0
          ? INSTALLED_GROUPS.map((g) => {
              const items = list.filter((s) => (s.installedGroup ?? 'custom') === g)
              if (!items.length) return null
              const expanded = groupExpanded[g]
              const shown = expanded ? items : items.slice(0, 6)
              const remaining = items.length - shown.length
              return (
                <section key={g} className="sk-group" data-id={`sk-group-${g}`}>
                  <div className="sk-group-title">{t(installedGroupLabelKey(g))}</div>
                  <div className="sk-grid">{shown.map(renderCard)}</div>
                  {remaining > 0 && (
                    <button
                      className="btn ghost sm sk-loadmore"
                      onClick={() => setGroupExpanded((p) => ({ ...p, [g]: true }))}
                    >
                      {fill(t(INSTALLED_GROUP_LOAD_MORE_KEY), { remaining })}
                    </button>
                  )}
                </section>
              )
            })
          : list.length > 0 && (
              <>
                <div className="sk-grid" data-id="sk-grid">
                  {visible.map(renderCard)}
                </div>
                {list.length > 9 && (
                  <button className="btn ghost sm sk-loadmore" onClick={() => setShowAll((v) => !v)} data-id="sk-show-more">
                    {t(showAll ? SKILLS_SHOW_LESS_KEY : SKILLS_SHOW_MORE_KEY)}
                  </button>
                )}
              </>
            )}
      </div>

      {/* ==================== 详情抽屉 ==================== */}
      {detail && (
        <div className="sk-drawer-wrap" onClick={() => setDetailId(null)}>
          <div className="sk-drawer" onClick={(e) => e.stopPropagation()} data-id="sk-detail">
            <div className="sk-drawer-head">
              <div>
                <div className="sk-drawer-name" data-id="sk-detail-name">
                  {detail.name}
                </div>
                <div className="sk-muted">{detail.description}</div>
              </div>
              <span className="sk-grow" />
              {!detail.installed && (
                <button className="btn sm" onClick={() => void doInstall(detail)} data-id="sk-detail-install">
                  {t(installLabelKey(detail.source))}
                </button>
              )}
              {detail.installed && (
                <button className="btn sm" onClick={() => void toggleEnabled(detail)} data-id="sk-detail-toggle">
                  {t(detail.enabled ? 'skills.card.disable' : 'skills.card.enable')}
                </button>
              )}
              <button className="icon-btn sm" onClick={() => setDetailId(null)} data-id="sk-detail-close">
                ×
              </button>
            </div>

            <nav className="sk-tabs" data-id="sk-detail-tabs">
              {DETAIL_SECTIONS.map((sec) => (
                <button
                  key={sec}
                  className={`kind-chip ${detailSection === sec ? 'active' : ''}`}
                  onClick={() => setDetailSection(sec)}
                  data-id={`sk-dsec-${sec}`}
                >
                  {t(detailSectionTitleKey(sec))}
                </button>
              ))}
              <span className="sk-grow" />
              <span className="sk-sync-chip" data-id="sk-detail-sync">
                {t(syncLabelKey(detail.sync))}
              </span>
            </nav>

            <div className="sk-drawer-body">
              <div className="sk-card-chips">
                {paidBadgeKey(detail) && (
                  <span className={`sk-paid-chip ${isExpired(detail) ? 'expired' : ''}`}>
                    {fill(t(paidBadgeKey(detail)), {
                      date: detail.purchasedUntil ? fmtDate(detail.purchasedUntil) : ''
                    })}
                  </span>
                )}
                {detail.paidKind !== 'free' && detail.price !== undefined && (
                  <span className="sk-price">
                    {priceLabel(detail).replace(/ \/ 月$/, ' ' + t('skills.paidPerMonth')).replace(/ · 无限次$/, ' · ' + t('skills.paidPermanent'))}
                  </span>
                )}
                {detail.needsApiKey && <span className="sk-tag warn">{t('skills.needsApiKey')}</span>}
                {detail.tags?.map((x) => (
                  <span key={x} className="sk-tag">
                    {x}
                  </span>
                ))}
                <button className="sk-tag" onClick={() => doShare(detail)} data-id="sk-detail-share">
                  {t('skills.share.entry')}
                </button>
              </div>

              {/* 安全评估 —— 对齐 `evaluatedBy` / `riskResult.*` */}
              <div className="sk-security-row">
                <span className={`sk-risk risk-${detail.riskLevel ?? 'safe'}`} data-id="sk-detail-risk">
                  {t(riskResultKey(detail.riskLevel ?? 'safe'))}
                </span>
                <span className="sk-muted">{t('skills.security.evaluatedBy')}</span>
                {detail.riskLevel && detail.riskLevel !== 'safe' && (
                  <span className="sk-muted">
                    {fill(t(riskTooltipKey(detail.riskLevel)), { desc: t('skills.security.overallRisk') })}
                  </span>
                )}
              </div>

              {detailSection === 'overview' && (
                <>
                  <div className="sk-overview-search">
                    <input
                      className="filter-input"
                      placeholder={t(OVERVIEW_SEARCH_PLACEHOLDER_KEY)}
                      value={overviewQuery}
                      onChange={(e) => setOverviewQuery(e.target.value)}
                      title={t(OVERVIEW_SEARCH_TOOLTIP_KEY)}
                      data-id="sk-overview-search"
                    />
                    <span className="sk-muted">{t(translationNoticeKey('en'))}</span>
                  </div>
                  <p className={`sk-overview-text ${detailExpanded ? '' : 'clamped'}`}>
                    {detail.description ?? t('skills.detail.noData')}
                  </p>
                  <button className="btn ghost sm" onClick={() => setDetailExpanded((v) => !v)} data-id="sk-detail-expand">
                    {t(detailExpanded ? 'skills.detail.desc.collapse' : 'skills.detail.desc.expand')}
                  </button>

                  <div className="sk-card">
                    <div className="sk-card-title">{t('skills.detail.basicInfo.title')}</div>
                    <dl className="col-kv">
                      <dt>{t('skills.detail.source')}</dt>
                      <dd>{t(tabLabelKey(detail.source))}</dd>
                      <dt>{t('skills.detail.license')}</dt>
                      <dd>{detail.license ?? t('skills.detail.noData')}</dd>
                      <dt>{t(detailMetricLabelKey('version'))}</dt>
                      <dd>{detail.version ?? t('skills.detail.noData')}</dd>
                      <dt>{t(detailMetricLabelKey('author'))}</dt>
                      <dd>{detail.author ?? t('skills.detail.noData')}</dd>
                      <dt>{t(detailMetricLabelKey('useCount'))}</dt>
                      <dd>{compactCount(detail.metrics.useCount)}</dd>
                      <dt>{t(detailMetricLabelKey('installCount'))}</dt>
                      <dd>{compactCount(detail.metrics.installCount)}</dd>
                      <dt>{t(detailMetricLabelKey('downloadCount'))}</dt>
                      <dd>{compactCount(detail.metrics.downloadCount)}</dd>
                      <dt>{t(detailMetricLabelKey('starCount'))}</dt>
                      <dd>{compactCount(detail.metrics.starCount)}</dd>
                    </dl>
                    <div className="sk-card-title" style={{ marginTop: 12 }}>
                      {t('skills.detail.more.title')}
                    </div>
                    <div className="sk-muted" data-id="sk-detail-more">
                      {t('skills.detail.more.version')} {detail.version ?? '-'} · {t('skills.detail.more.id')} {detail.id}
                    </div>
                  </div>

                  <div className="sk-actions-row">
                    <button className="btn ghost sm" onClick={() => void cloudAct(detail)} data-id="sk-detail-cloud">
                      {t(cloudActionKey(detail))}
                    </button>
                    <span className="sk-muted">
                      {t(
                        canUploadToCloud(detail)
                          ? 'skills.cloud.action.uploadTooltipDetailed'
                          : 'skills.cloud.status.uploadedTooltip'
                      )}
                    </span>
                  </div>
                </>
              )}

              {detailSection === 'examples' && (
                <div className="sk-card">
                  <div className="sk-card-title">{t(detailSectionTitleKey('examples'))}</div>
                  <div className="sk-code-block">{t(SKILLS_CREATE_PROMPT_KEY)}</div>
                  <div className="sk-code-block">{t(SKILLS_FIND_PROMPT_KEY)}</div>
                </div>
              )}

              {detailSection === 'usedCases' && (
                <div className="sk-card">
                  <div className="sk-card-title">{t(detailSectionTitleKey('usedCases'))}</div>
                  <div className="sk-muted">{t('skills.detail.noData')}</div>
                  <div className="sk-dialog-actions">
                    <button className="btn sm" onClick={() => toast.info(t(REPLICATE_KEY))} data-id="sk-replicate">
                      {t(REPLICATE_KEY)}
                    </button>
                    <button className="btn ghost sm" onClick={() => setDetailSection('overview')} data-id="sk-back-skill">
                      {t(BACK_TO_SKILL_KEY)}
                    </button>
                  </div>
                </div>
              )}

              {detail.paidKind !== 'free' && (
                <div className="sk-actions-row">
                  <button
                    className="btn sm"
                    onClick={() => {
                      setBuyKind(detail.paidKind === 'permanent' ? 'permanent' : 'monthly')
                      setBuyId(detail.id)
                    }}
                    data-id="sk-detail-buy"
                  >
                    {t(BUY_SKILL_KEY)}
                  </button>
                  {(detail.refundCount ?? 0) >= REFUND_LIMIT ? (
                    <button className="btn ghost sm" onClick={() => setBlockedBuy(true)} data-id="sk-detail-blocked">
                      {t('skills.refund.confirmAction')}
                    </button>
                  ) : (
                    canRefund(detail) && (
                      <button className="btn ghost sm" onClick={() => setRefundId(detail.id)} data-id="sk-detail-refund">
                        {t('skills.refund.confirmAction')}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== 单卡卸载确认 ==================== */}
      {pendingUninstall && (
        <Overlay onClose={() => setPendingUninstall(null)}>
          <div className="dialog-title">{t(SKILLS_DELETE_TITLE_KEY)}</div>
          <div className="dialog-content">{t(SKILLS_DELETE_CONTENT_KEY)}</div>
          <div className="dialog-actions">
            <button className="btn ghost" onClick={() => setPendingUninstall(null)}>
              {t('skills.refund.confirmCancel')}
            </button>
            <button className="btn" onClick={() => void doUninstall(pendingUninstall)} data-id="sk-confirm-uninstall">
              {t('skills.batchUninstall.confirm')}
            </button>
          </div>
        </Overlay>
      )}

      {/* ==================== 批量卸载确认 ==================== */}
      {batchConfirm && (
        <Overlay onClose={() => setBatchConfirm(false)}>
          <div className="dialog-title" data-id="sk-batch-confirm-title">
            {selected.every((id) => store.skills.find((s) => s.id === id)?.sync === 'cloudOnly')
              ? t('skills.batchUninstall.cloudOnlyTitle')
              : t('skills.batchUninstall.title')}
          </div>
          <div className="dialog-content">
            {selected.filter((id) => store.skills.find((s) => s.id === id)?.sync === 'cloudOnly').length === selected.length
              ? fill(t('skills.batchUninstall.cloudOnlyDescription'), { count: selected.length })
              : fill(t('skills.batchUninstall.description'), { count: selected.length })}
          </div>
          {selected.some((id) => store.skills.find((s) => s.id === id)?.sync === 'cloudOnly') && (
            <>
              <label className="sk-check">
                <input
                  type="checkbox"
                  checked={deleteCloudToo}
                  onChange={(e) => setDeleteCloudToo(e.target.checked)}
                  data-id="sk-delete-cloud"
                />
                {fill(t('skills.batchUninstall.deleteCloudOption'), {
                  count: selected.filter((id) => store.skills.find((s) => s.id === id)?.sync === 'cloudOnly').length
                })}
              </label>
              {!deleteCloudToo && <div className="dialog-error">{t('skills.cloudUninstall.cloudOnlyNeedsDeleteCloud')}</div>}
            </>
          )}
          <div className="dialog-actions">
            <button className="btn ghost" onClick={() => setBatchConfirm(false)}>
              {t('skills.refund.confirmCancel')}
            </button>
            <button
              className="btn"
              disabled={
                selected.some((id) => store.skills.find((s) => s.id === id)?.sync === 'cloudOnly') && !deleteCloudToo
              }
              onClick={() => void doBatch('uninstall')}
              data-id="sk-batch-confirm"
            >
              {selected.every((id) => store.skills.find((s) => s.id === id)?.sync === 'cloudOnly')
                ? t('skills.batchUninstall.cloudOnlyConfirm')
                : t('skills.batchUninstall.confirm')}
            </button>
          </div>
        </Overlay>
      )}

      {/* ==================== 更新覆盖确认 ==================== */}
      {updateId && (
        <Overlay onClose={() => setUpdateId(null)}>
          <div className="dialog-title">{t('skills.update.modifiedConfirm.title')}</div>
          <div className="dialog-content">{t('skills.update.modifiedConfirm.desc')}</div>
          <div className="dialog-actions">
            <button className="btn ghost" onClick={() => setUpdateId(null)}>
              {t('skills.update.modifiedConfirm.cancel')}
            </button>
            <button className="btn" onClick={() => void confirmUpdate()} data-id="sk-update-confirm">
              {t('skills.update.modifiedConfirm.confirm')}
            </button>
          </div>
        </Overlay>
      )}

      {/* ==================== 购买 ==================== */}
      {buyId && (
        <Overlay onClose={() => setBuyId(null)}>
          <div className="dialog-title">{t(BUY_SKILL_KEY)}</div>
          <div className="dialog-content">
            {fill(t('skills.purchasedChipPending'), {})} · {t('skills.paidTag')}
          </div>
          <div className="sk-radio-row">
            <button
              className={`kind-chip ${buyKind === 'monthly' ? 'active' : ''}`}
              onClick={() => setBuyKind('monthly')}
              data-id="sk-buy-monthly"
            >
              {t('skills.paidPerMonth')}
            </button>
            <button
              className={`kind-chip ${buyKind === 'permanent' ? 'active' : ''}`}
              onClick={() => setBuyKind('permanent')}
              data-id="sk-buy-permanent"
            >
              {t('skills.paidPermanent')}
            </button>
          </div>
          <div className="dialog-actions">
            <button className="btn ghost" onClick={() => setBuyId(null)}>
              {t('skills.refund.confirmCancel')}
            </button>
            <button className="btn" onClick={() => void confirmBuy()} data-id="sk-buy-confirm">
              {t('skills.purchase.blockedAction')}
            </button>
          </div>
        </Overlay>
      )}

      {/* ==================== 退款 ==================== */}
      {refundId && (
        <Overlay onClose={() => setRefundId(null)}>
          <div className="dialog-title">{t('skills.refund.confirmTitle')}</div>
          <div className="dialog-content">{t('skills.refund.confirmBody')}</div>
          <div className="dialog-actions">
            <button className="btn ghost" onClick={() => setRefundId(null)}>
              {t('skills.refund.confirmCancel')}
            </button>
            <button className="btn" onClick={() => void confirmRefund()} data-id="sk-refund-confirm">
              {t('skills.refund.confirmAction')}
            </button>
          </div>
        </Overlay>
      )}

      {/* ==================== 购买拦截（退款 3 次） ==================== */}
      {blockedBuy && (
        <Overlay onClose={() => setBlockedBuy(false)}>
          <div className="dialog-title" data-id="sk-blocked-title">
            {t('skills.purchase.blockedTitle')}
          </div>
          <div className="dialog-content">{t('skills.purchase.blockedBody')}</div>
          <div className="dialog-actions">
            <button className="btn" onClick={() => setBlockedBuy(false)} data-id="sk-blocked-ok">
              {t('skills.purchase.blockedAction')}
            </button>
          </div>
        </Overlay>
      )}

      {/* ==================== 安全检测 ==================== */}
      {securityOpen && (
        <Overlay onClose={() => setSecurityOpen(false)}>
          <div className="dialog-title" data-id="sk-security-title">
            {t('skills.security.highRisk.title')}
          </div>
          <div className="dialog-content">
            {fill(t('skills.security.highRisk.content'), { name: securityName })}
          </div>
          <div className="sk-security-row">
            <span className="sk-risk risk-high">{t(riskResultKey('high'))}</span>
            <span className="sk-muted">{t('skills.security.scanningHint')}</span>
          </div>
          <div className="sk-muted">{t('skills.security.deepAnalysisHint')}</div>
          <div className="sk-muted" data-id="sk-security-policy">
            {t('skills.security.policy.forbidHighRisk')}
          </div>
          <div className="dialog-actions">
            <button className="btn ghost" onClick={() => setSecurityOpen(false)} data-id="sk-security-cancel">
              {t('skills.security.cancelInstall')}
            </button>
            <button className="btn ghost" onClick={() => setSecurityOpen(false)} data-id="sk-security-skip">
              {t('skills.security.skip')}
            </button>
            <button className="btn" disabled={scanCountdown > 0} onClick={() => void confirmSecurityInstall()} data-id="sk-security-continue">
              {scanCountdown > 0
                ? fill(t('skills.security.confirmCountdown'), { seconds: scanCountdown })
                : t('skills.security.continueInstall')}
            </button>
          </div>
        </Overlay>
      )}

      {/* ==================== 上传云端 ==================== */}
      {cloudOpen && (
        <Overlay onClose={() => setCloudOpen(false)}>
          <div className="dialog-title" data-id="sk-cloud-title">
            {fill(
              t(
                batchMode && selected.length
                  ? 'skills.cloudUpload.modal.titleUpload'
                  : detail?.sync === 'localAhead'
                    ? 'skills.cloudUpload.modal.titleUpdate'
                    : 'skills.cloudUpload.modal.titleUpload'
              ),
              { count: (batchMode && selected.length) || 1 }
            )}
          </div>
          <div className="dialog-content">
            {fill(t('skills.cloudUpload.modal.description'), {
              names: detail?.name ?? store.skills.find((s) => selected.includes(s.id))?.name ?? ''
            })}
          </div>
          <div className="sk-muted">{t('skills.cloudUpload.modal.summaryUpload')}</div>
          <div className="sk-card">
            <div className="sk-card-title">{t('skills.cloudUpload.modal.credentialRiskTitle')}</div>
            <div className="sk-muted">{t('skills.cloudUpload.modal.credentialRiskDesc')}</div>
            <label className="sk-check">
              <input
                type="checkbox"
                checked={riskAccepted}
                onChange={(e) => setRiskAccepted(e.target.checked)}
                data-id="sk-cloud-risk"
              />
              {t('skills.cloudUpload.modal.riskAccepted')}
            </label>
          </div>
          <label className="sk-check">
            <input type="checkbox" checked={dontRemind} onChange={(e) => setDontRemind(e.target.checked)} />
            {t('skills.cloudUpload.modal.dontRemind')}
          </label>
          {cloudPhase === 'failed' && <div className="dialog-error">{t('skills.cloudUpload.modal.errorDesc')}</div>}
          <div className="dialog-actions">
            <button className="btn ghost" onClick={() => setCloudPhase('failed')} data-id="sk-cloud-fail">
              {t('skills.cloudUpload.modal.retry')}
            </button>
            <button
              className="btn"
              disabled={!riskAccepted}
              onClick={() => void confirmCloudUpload()}
              data-id="sk-cloud-confirm"
            >
              {cloudPhase === 'uploading'
                ? t('skills.cloudUpload.modal.uploadingButton')
                : cloudPhase === 'failed'
                  ? t('skills.cloudUpload.modal.errorTitle')
                  : t('skills.cloudUpload.modal.confirmUpload')}
            </button>
          </div>
        </Overlay>
      )}

      {/* ==================== 导入技能 ==================== */}
      {uploadOpen && (
        <Overlay onClose={() => setUploadOpen(false)}>
          <div className="dialog-title" data-id="sk-upload-title">
            {t('skills.upload.modal.title')}
          </div>
          <div
            className={`sk-drop ${dragging ? 'dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
            }}
            onClick={() => setUploading(true)}
            data-id="sk-drop"
          >
            <div>{t(dragging ? 'skills.upload.modal.dragging' : 'skills.upload.modal.dropTitle')}</div>
            <div className="sk-muted">{t('skills.upload.modal.desktopUsePathUpload')}</div>
          </div>
          <div className="sk-card">
            <div className="sk-card-title">{t('skills.upload.modal.requirementsTitle')}</div>
            {UPLOAD_REQUIREMENTS.map((k, i) => (
              <div key={k} className="sk-muted">
                {i === 0 ? t('skills.upload.modal.typeFolder') + '：' : ''}
                {t(k)}
              </div>
            ))}
            <div className="sk-muted">{t('skills.upload.modal.packagingTimeout')}</div>
          </div>
          {/* 企业上传策略（桩）—— 对齐 `upload.policy.*` */}
          <div className="sk-muted" data-id="sk-upload-policy">
            {t(uploadPolicyKey('disabled'))}
          </div>
          <div className="dialog-actions">
            <button className="btn ghost" onClick={() => setUploadOpen(false)} data-id="sk-upload-cancel">
              {t('skills.refund.confirmCancel')}
            </button>
            <button className="btn" onClick={() => void doImport()} data-id="sk-upload-confirm">
              {uploading ? t('skills.upload.modal.uploading') : t('skills.upload.modal.confirm')}
            </button>
          </div>
        </Overlay>
      )}

      {/* ==================== 技能选择器 ==================== */}
      {pickerOpen && (
        <Overlay onClose={() => setPickerOpen(false)}>
          <div className="dialog-title" data-id="sk-picker-title">
            {t(PICKER_TITLE_KEY)}
          </div>
          <input
            className="filter-input"
            placeholder={t(PICKER_SEARCH_KEY)}
            value={pickerQuery}
            onChange={(e) => setPickerQuery(e.target.value)}
            data-id="sk-picker-search"
          />
          <div className="sk-picker-list" data-id="sk-picker-list">
            {pickList.length === 0 && (
              <div className="sk-muted" data-id="sk-picker-empty">
                {pickerQuery.trim() ? t(PICKER_NO_RESULT_KEY) : t(pickerEmptyKey(tab))}
              </div>
            )}
            {pickList.map((s) => (
              <label key={s.id} className="sk-check sk-picker-item">
                <input
                  type="checkbox"
                  checked={pickerSelected.includes(s.id)}
                  onChange={() =>
                    setPickerSelected((prev) => (prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]))
                  }
                  data-id={`sk-pick-${s.id}`}
                />
                {s.name}
              </label>
            ))}
          </div>
          <div className="sk-muted" data-id="sk-picker-count">
            {fill(t(PICKER_SELECTED_KEY), { count: pickerSelected.length })}
          </div>
          <div className="dialog-actions">
            <button className="btn ghost" onClick={() => setPickerOpen(false)} data-id="sk-picker-cancel">
              {t('skills.picker.cancel')}
            </button>
            <button
              className="btn"
              onClick={() => {
                setPickerOpen(false)
                toast.info(fill(t(SKILLS_FIND_PROMPT_KEY), {}))
              }}
              data-id="sk-picker-confirm"
            >
              {t('skills.picker.confirm')}
            </button>
          </div>
        </Overlay>
      )}

      {/* ==================== 分享流程 ==================== */}
      {shareOpen && (
        <Overlay onClose={() => setShareOpen(false)}>
          <div className="dialog-title" data-id="sk-share-title">
            {t('skills.share.title')}
          </div>
          <div className="sk-share-steps" data-id="sk-share-steps">
            {SHARE_STEPS.map((s, i) => (
              <button
                key={s}
                className={`kind-chip ${i === shareStep ? 'active' : ''} ${i < shareStep ? 'done' : ''}`}
                onClick={() => setShareStep(i)}
                data-id={`sk-share-step-${s}`}
              >
                {t(shareStepLabelKey(s))}
              </button>
            ))}
          </div>
          <div className="sk-muted" data-id="sk-share-status">
            {shareStep === 0
              ? t('skills.share.status.uploading')
              : shareStep === 1
                ? t('skills.share.status.checking')
                : t('skills.share.status.creatingLink')}
          </div>
          {/* 门禁六态 —— 对齐 `share.gate.*` */}
          <div className="sk-card">
            <div className="sk-card-title">{t('skills.security.resultTitle')}</div>
            <div className="sk-muted" data-id="sk-share-gate">
              {shareStep >= SHARE_STEPS.length ? t(shareGateKey('passed')) : t(shareGateKey('pending'))}
            </div>
            <div className="sk-muted">{t('skills.share.qrcodeAlt')}</div>
            <div className="sk-muted">{t(shareChannelKey('miniProgramCode'))}</div>
            <div className="sk-muted">{t('skills.share.install.needsLogin')}</div>
          </div>
          <div className="dialog-actions">
            <button className="btn ghost" onClick={() => setShareOpen(false)} data-id="sk-share-close">
              {t('skills.cloudUpload.modal.close')}
            </button>
            <button
              className="btn"
              onClick={() => {
                if (shareStep < SHARE_STEPS.length) return setShareStep((n) => n + 1)
                setShareOpen(false)
                toast.success(t('skills.share.copySuccess'))
              }}
              data-id="sk-share-next"
            >
              {shareStep >= SHARE_STEPS.length ? t('skills.share.copyImage') : t('skills.share.wxLaunching')}
            </button>
          </div>
        </Overlay>
      )}
    </div>
  )

  /** 导入（桩）：仅切换状态并出桩提示，不真实落盘（原版同样未接入浏览器内打包） */
  async function doImport() {
    setUploading(true)
    await new Promise((r) => setTimeout(r, 120))
    setUploading(false)
    setUploadOpen(false)
    toast.success(t('skills.toast.imported'))
  }
}

/** 统一浮层容器 */
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal dialog sk-dialog" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
