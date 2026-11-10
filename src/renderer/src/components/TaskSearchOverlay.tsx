import { useEffect, useMemo, useRef, useState } from 'react'
import type { Conversation } from '../../../shared/types'
import { useTranslation } from '../i18n'

/**
 * 任务搜索覆盖层 —— 对齐原版 `conversation.search.*`：
 * - `placeholder`=搜索任务、`recentTasks`=最近任务、`resultCount`=搜索到 {count} 个任务
 * - 快捷键提示：`shortcut.open`=打开、`shortcut.navigate`=上下切换、`shortcut.close`=关闭
 */

interface Props {
  open: boolean
  conversations: Conversation[]
  onClose: () => void
  onSelect: (id: string) => void
}

export default function TaskSearchOverlay({ open, conversations, onClose, onSelect }: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      // 无查询时展示「最近任务」（对齐 recentTasks）
      return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8)
    }
    return conversations.filter((c) => (c.title || '').toLowerCase().includes(q))
  }, [conversations, query])

  useEffect(() => {
    setActive(0)
  }, [query])

  if (!open) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((n) => (results.length ? (n + 1) % results.length : 0))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((n) => (results.length ? (n - 1 + results.length) % results.length : 0))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const target = results[active]
      if (target) {
        onSelect(target.id)
        onClose()
      }
    }
  }

  return (
    <div className="overlay-mask" onClick={onClose}>
      <div className="task-search" onClick={(e) => e.stopPropagation()}>
        <div className="task-search-head">
          <span className="task-search-icon">⌕</span>
          <input
            ref={inputRef}
            className="task-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('taskSearch.placeholder')}
          />
          <span className="task-search-count">
            {query.trim()
              ? t('taskSearch.resultCount').replace('{count}', String(results.length))
              : t('taskSearch.recentTasks')}
          </span>
        </div>

        <div className="task-search-list">
          {results.length === 0 ? (
            <div className="task-search-empty">{t('chat.search.noMatch')}</div>
          ) : (
            results.map((c, i) => (
              <button
                key={c.id}
                className={`task-search-item ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  onSelect(c.id)
                  onClose()
                }}
              >
                <span className="task-search-title">{c.title || t('sidebar.new')}</span>
                {c.workspace && <span className="task-search-ws">{c.workspace}</span>}
                {c.origin && c.origin !== 'web' && <span className="task-search-origin">{t(`origin.${c.origin}`)}</span>}
              </button>
            ))
          )}
        </div>

        <div className="task-search-foot">
          <span className="shortcut-hint">
            <kbd>↑</kbd>
            <kbd>↓</kbd> {t('taskSearch.shortcut.navigate')}
          </span>
          <span className="shortcut-hint">
            <kbd>↵</kbd> {t('taskSearch.shortcut.open')}
          </span>
          <span className="shortcut-hint">
            <kbd>Esc</kbd> {t('taskSearch.shortcut.close')}
          </span>
        </div>
      </div>
    </div>
  )
}
