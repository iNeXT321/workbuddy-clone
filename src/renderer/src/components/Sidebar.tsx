import { useState } from 'react'
import type { Conversation } from '../../../shared/types'
import { useTranslation } from '../i18n'

interface Props {
  conversations: Conversation[]
  currentId: string | null
  searchQuery: string
  showArchived: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  onSearch: (query: string) => void
  onExport: (id: string) => void
  onTogglePin: (id: string) => void
  onToggleArchive: (id: string) => void
  onToggleShowArchived: () => void
}

export default function Sidebar({
  conversations,
  currentId,
  searchQuery,
  showArchived,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onSearch,
  onExport,
  onTogglePin,
  onToggleArchive,
  onToggleShowArchived
}: Props) {
  const { t } = useTranslation()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const commitRename = (id: string) => {
    const txt = editText.trim()
    if (txt) onRename(id, txt)
    setEditingId(null)
  }

  // 分组：置顶区（pinned 且未归档）/ 常规区 / 已归档区（对齐原版 conversation.section.*）
  const pinned = conversations.filter((c) => c.pinned && !c.archived)
  const normal = conversations.filter((c) => !c.pinned && !c.archived)
  const archived = conversations.filter((c) => c.archived)

  const renderItem = (c: Conversation) => (
    <div key={c.id} className={`conversation-item ${c.id === currentId ? 'active' : ''}`} onClick={() => onSelect(c.id)}>
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
          {c.pinned && <span className="pin-mark">📌</span>}
          {c.title || t('sidebar.new')}
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
        <button className="icon-btn" onClick={onNew} title={t('sidebar.new')}>
          +
        </button>
      </div>
      <div className="sidebar-search">
        <input
          className="search-input"
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={t('sidebar.search')}
        />
      </div>
      <div className="conversation-list">
        {pinned.length > 0 && (
          <>
            <div className="conversation-section">{t('sidebar.section.pinned')}</div>
            {pinned.map(renderItem)}
          </>
        )}
        {normal.map(renderItem)}
        {archived.length > 0 && (
          <>
            <div className="conversation-section">{t('sidebar.section.archived')}</div>
            {archived.map(renderItem)}
          </>
        )}
        {conversations.length === 0 && (
          <div className="empty-hint">{searchQuery ? t('sidebar.emptySearch') : t('sidebar.empty')}</div>
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
