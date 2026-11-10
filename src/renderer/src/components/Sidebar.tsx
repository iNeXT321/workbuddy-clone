import { useMemo, useState } from 'react'
import type { Conversation } from '../../../shared/types'
import { useTranslation } from '../i18n'

interface Props {
  conversations: Conversation[]
  currentId: string | null
  searchQuery: string
  showArchived: boolean
  // 会话数量上限状态（对齐 conversation.maxSessions.*）
  limitReached?: boolean
  // 会话创建中（对齐 conversation.creatingTask）
  creating?: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  onSearch: (query: string) => void
  onExport: (id: string) => void
  onTogglePin: (id: string) => void
  onToggleArchive: (id: string) => void
  onToggleShowArchived: () => void
  // 打开任务搜索覆盖层（对齐 conversation.search.*）
  onOpenTaskSearch?: () => void
  // 新建工作空间（对齐 conversation.section.addWorkspace）
  onAddWorkspace?: () => void
}

/** 相对时间文案（对齐原版 conversation.time.*） */
function relativeTime(ts: number, t: (k: string) => string): string {
  const diff = Date.now() - ts
  const min = 60 * 1000
  const hour = 60 * min
  const day = 24 * hour
  if (diff < min) return t('time.justNow')
  if (diff < hour) return t('time.minutesAgo').replace('{count}', String(Math.floor(diff / min)))
  if (diff < day) return t('time.hoursAgo').replace('{count}', String(Math.floor(diff / hour)))
  if (diff < 2 * day) return t('time.yesterday')
  if (diff < 365 * day) return t('time.daysAgo').replace('{count}', String(Math.floor(diff / day)))
  return t('time.yearsAgo').replace('{count}', String(Math.floor(diff / (365 * day))))
}

// 状态角标 → 图标与 i18n 键（对齐 conversation.sectionFlag.tooltip.*）
const FLAG_ICON: Record<string, string> = {
  failed: '✕',
  pending: '!',
  unread: '•',
  working: '◌'
}

export default function Sidebar({
  conversations,
  currentId,
  searchQuery,
  showArchived,
  limitReached,
  creating,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onSearch,
  onExport,
  onTogglePin,
  onToggleArchive,
  onToggleShowArchived,
  onOpenTaskSearch,
  onAddWorkspace
}: Props) {
  const { t } = useTranslation()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  // 折叠的工作空间集合（对齐 conversation.section.collapseAll / expandAll）
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // 状态筛选（对齐 conversation.section.filter / noFilterResult）
  const [filter, setFilter] = useState<Conversation['status'] | 'all'>('all')

  const commitRename = (id: string) => {
    const txt = editText.trim()
    if (txt) onRename(id, txt)
    setEditingId(null)
  }

  // 状态筛选（对齐 conversation.section.noFilterResult）
  const visible = useMemo(
    () => (filter === 'all' ? conversations : conversations.filter((c) => c.status === filter)),
    [conversations, filter]
  )

  const pinned = visible.filter((c) => c.pinned && !c.archived)
  const archived = visible.filter((c) => c.archived)
  const active = visible.filter((c) => !c.pinned && !c.archived)

  // 按工作空间分组（对齐 conversation.section.workspaces / taskGroup）：
  // 未归属工作空间的任务归入「任务」组，其余按 workspace 名分组
  const groups = useMemo(() => {
    const map = new Map<string, Conversation[]>()
    for (const c of active) {
      const key = c.workspace || ''
      const arr = map.get(key)
      if (arr) arr.push(c)
      else map.set(key, [c])
    }
    // 无工作空间的排最前（它承载「不使用工作空间」的任务）
    const keys = [...map.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
    return keys.map((k) => ({ key: k, items: map.get(k) ?? [] }))
  }, [active])

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const collapseAll = () => setCollapsed(new Set(groups.map((g) => g.key)))
  const expandAll = () => setCollapsed(new Set())

  const hasWorkspaceGroups = groups.some((g) => g.key !== '')

  const renderStatusFlag = (c: Conversation) => {
    if (!c.status) return null
    const tipKey = `sectionFlag.tooltip.${c.status}`
    return (
      <span className={`status-flag flag-${c.status}`} title={t(tipKey)} aria-label={t(tipKey)}>
        {FLAG_ICON[c.status]}
      </span>
    )
  }

  // 来源标记（对齐 conversation.origin.*）：本机 web 端不显示，移动端 / 小程序才标注
  const renderOrigin = (c: Conversation) => {
    if (!c.origin || c.origin === 'web') return null
    return (
      <span className="origin-badge" title={t(`origin.${c.origin}`)}>
        {c.origin === 'workbuddyMp' ? '▣' : '▤'}
      </span>
    )
  }

  const renderItem = (c: Conversation) => (
    <div key={c.id} className={`conversation-item ${c.id === currentId ? 'active' : ''}`} onClick={() => onSelect(c.id)}>
      {renderStatusFlag(c)}
      {editingId === c.id ? (
        <input
          className="rename-input"
          autoFocus
          value={editText}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={() => commitRename(c.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename(c.id)
            if (e.key === 'Escape') setEditingId(null)
          }}
        />
      ) : (
        <span
          className="conversation-title"
          onDoubleClick={() => {
            setEditingId(c.id)
            setEditText(c.title || '')
          }}
        >
          {c.title || t('sidebar.new')}
          {renderOrigin(c)}
          <span className="conversation-time">{relativeTime(c.updatedAt, t)}</span>
        </span>
      )}
      <button
        className={`icon-btn small ${c.pinned ? 'on' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          onTogglePin(c.id)
        }}
        title={c.pinned ? t('sidebar.unpin') : t('sidebar.pin')}
      >
        📌
      </button>
      <button
        className="icon-btn small"
        onClick={(e) => {
          e.stopPropagation()
          onToggleArchive(c.id)
        }}
        title={c.archived ? t('sidebar.unarchive') : t('sidebar.archive')}
      >
        🗄
      </button>
      <button
        className="icon-btn small"
        onClick={(e) => {
          e.stopPropagation()
          onExport(c.id)
        }}
        title={t('sidebar.export')}
      >
        ↓
      </button>
      <button
        className="icon-btn small"
        onClick={(e) => {
          e.stopPropagation()
          if (window.confirm(t('sidebar.deleteConfirm'))) onDelete(c.id)
        }}
        title={t('sidebar.delete')}
      >
        ×
      </button>
    </div>
  )

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">{t('app.name')}</span>
        <button className="icon-btn" onClick={onOpenTaskSearch} title={t('taskSearch.placeholder')}>
          ⌕
        </button>
        <button className="icon-btn" onClick={onNew} title={t('section.addTask')}>
          +
        </button>
      </div>
      {/* 会话数量上限提示（对齐 conversation.maxSessions.dialog.*） */}
      {limitReached && <div className="limit-banner">{t('conversation.maxSessions.dialog.content')}</div>}
      {/* 会话创建中（对齐 conversation.creatingTask） */}
      {creating && (
        <div className="creating-banner">
          <span className="creating-spinner" />
          {t('conversation.creatingTask')}
        </div>
      )}
      <div className="sidebar-search">
        <input
          className="search-input"
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={t('sidebar.search')}
        />
      </div>

      {/* 筛选 + 折叠控制（对齐 conversation.section.filter / collapseAll / expandAll） */}
      <div className="section-toolbar">
        <select
          className="filter-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Conversation['status'] | 'all')}
          title={t('section.filter')}
        >
          <option value="all">{t('section.filter')}</option>
          <option value="working">{t('sectionFlag.tooltip.working').replace('，点击打开', '')}</option>
          <option value="pending">{t('sectionFlag.tooltip.pending').replace('，点击打开', '')}</option>
          <option value="failed">{t('sectionFlag.tooltip.failed').replace('，点击打开', '')}</option>
          <option value="unread">{t('sectionFlag.tooltip.unread').replace('，点击打开', '')}</option>
        </select>
        {hasWorkspaceGroups && (
          <>
            <button className="link-btn" onClick={collapseAll} title={t('section.collapseAll')}>
              ⊟
            </button>
            <button className="link-btn" onClick={expandAll} title={t('section.expandAll')}>
              ⊞
            </button>
          </>
        )}
        {onAddWorkspace && (
          <button className="link-btn" onClick={onAddWorkspace} title={t('section.addWorkspace')}>
            {t('section.addWorkspace')}
          </button>
        )}
      </div>

      <div className="conversation-list">
        {pinned.length > 0 && (
          <>
            <div className="conversation-section">{t('section.pinned')}</div>
            {pinned.map(renderItem)}
          </>
        )}

        {/* 按工作空间分组（对齐 conversation.section.workspaces / taskGroup） */}
        {groups.map((g) => (
          <div key={g.key || '__none__'} className="ws-group">
            <button className="ws-group-header" onClick={() => toggleCollapse(g.key)}>
              <span className="ws-group-caret">{collapsed.has(g.key) ? '▸' : '▾'}</span>
              <span className="ws-group-name">{g.key || t('section.tasks')}</span>
              <span className="ws-group-count">{g.items.length}</span>
            </button>
            {!collapsed.has(g.key) &&
              (g.items.length === 0 ? (
                <div className="ws-group-empty">{t('sectionFlag.empty')}</div>
              ) : (
                g.items.map(renderItem)
              ))}
          </div>
        ))}

        {archived.length > 0 && (
          <>
            <div className="conversation-section">{t('sidebar.section.archived')}</div>
            {archived.map(renderItem)}
          </>
        )}

        {conversations.length === 0 && (
          <div className="empty-hint">
            <div className="empty-title">{t('conversation.empty.title')}</div>
            <div>{searchQuery ? t('sidebar.emptySearch') : t('conversation.empty.description')}</div>
          </div>
        )}
        {/* 筛选无结果（对齐 conversation.section.noFilterResult） */}
        {conversations.length > 0 && visible.length === 0 && (
          <div className="empty-hint">
            <div className="empty-title">{t('section.noFilterResult')}</div>
          </div>
        )}
      </div>
      <div className="sidebar-footer">
        <button className="link-btn" onClick={onToggleShowArchived}>
          {showArchived ? t('sidebar.hideArchived') : t('sidebar.showArchived')}
        </button>
      </div>
    </aside>
  )
}
