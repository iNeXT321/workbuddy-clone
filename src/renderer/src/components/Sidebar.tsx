import { useState } from 'react'
import type { Conversation } from '../../../shared/types'
import { useTranslation } from '../i18n'

interface Props {
  conversations: Conversation[]
  currentId: string | null
  searchQuery: string
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  onSearch: (query: string) => void
  onExport: (id: string) => void
}

export default function Sidebar({
  conversations,
  currentId,
  searchQuery,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onSearch,
  onExport
}: Props) {
  const { t } = useTranslation()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const commitRename = (id: string) => {
    const t = editText.trim()
    if (t) onRename(id, t)
    setEditingId(null)
  }

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
        {conversations.map((c) => (
          <div
            key={c.id}
            className={`conversation-item ${c.id === currentId ? 'active' : ''}`}
            onClick={() => onSelect(c.id)}
          >
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
              </span>
            )}
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
        ))}
        {conversations.length === 0 && (
          <div className="empty-hint">{searchQuery ? t('sidebar.emptySearch') : t('sidebar.empty')}</div>
        )}
      </div>
    </aside>
  )
}
