import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChatMessage } from '../../../shared/types'
import Markdown from './Markdown'
import { toast } from '../stores/useToast'
import { useTranslation } from '../i18n'

interface Props {
  messages: ChatMessage[]
  streaming: boolean
  onRegenerate: (assistantId: string) => void
  onDelete: (messageId: string) => void
  onEdit: (messageId: string, newText: string) => void
  // 出错后重试上一轮（对齐原版 error.retry）
  onRetry: (assistantId: string) => void
  onOpenSettings: () => void
  // 递增信号：全局快捷键（Cmd+F）触发打开对话内搜索
  openSearchSignal?: number
}

export default function ChatArea({
  messages,
  streaming,
  onRegenerate,
  onDelete,
  onEdit,
  onRetry,
  onOpenSettings,
  openSearchSignal
}: Props) {
  const { t } = useTranslation()
  const endRef = useRef<HTMLDivElement>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  // 对话内搜索（对齐原版 chat.search.*）：在消息内容中查找并跳转
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hitIndex, setHitIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 全局快捷键触发打开对话内搜索（Cmd+F）
  useEffect(() => {
    if (openSearchSignal && openSearchSignal > 0) {
      setSearchOpen(true)
      setTimeout(() => searchInputRef.current?.focus(), 0)
    }
  }, [openSearchSignal])

  // 命中集合：内容包含查询串（不区分大小写）的消息 id
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [] as string[]
    return messages.filter((m) => m.content.toLowerCase().includes(q)).map((m) => m.id)
  }, [messages, query])

  // 命中变化时回到第一条
  useEffect(() => {
    setHitIndex(0)
  }, [query])

  // 跳转到当前命中（滚动 + 短暂高亮）
  useEffect(() => {
    const id = hits[hitIndex]
    if (!id) return
    const el = document.getElementById(`msg-${id}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [hits, hitIndex])

  const nextHit = () => setHitIndex((i) => (hits.length ? (i + 1) % hits.length : 0))
  const prevHit = () => setHitIndex((i) => (hits.length ? (i - 1 + hits.length) % hits.length : 0))
  const closeSearch = () => {
    setSearchOpen(false)
    setQuery('')
  }

  const copy = async (m: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(m.content)
      setCopiedId(m.id)
      toast.success(t('toast.copied'))
      setTimeout(() => setCopiedId((id) => (id === m.id ? null : id)), 1500)
    } catch {
      toast.error(t('toast.copyFailed'))
    }
  }

  const beginEdit = (m: ChatMessage) => {
    setEditingId(m.id)
    setEditText(m.content)
  }

  // 复制错误的完整详情（对齐原版 errorBanner.action.copyError）
  const copyRaw = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(`err-${text.slice(0, 8)}`)
      toast.success(t('error.copied'))
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      toast.error(t('toast.copyFailed'))
    }
  }

  const commitEdit = (id: string) => {
    const txt = editText.trim()
    if (txt) {
      onEdit(id, txt)
      toast.info(t('toast.regenerated'))
    }
    setEditingId(null)
  }

  const activeHitId = hits[hitIndex]

  return (
    <div className="chat-area">
      <div className="chat-toolbar">
        <div className="chat-toolbar-spacer" />
        <button className="icon-btn" onClick={() => setSearchOpen((v) => !v)} title={t('chat.search.tooltip')}>
          🔍
        </button>
      </div>

      {searchOpen && (
        <div className="chat-search">
          <input
            ref={searchInputRef}
            className="chat-search-input"
            autoFocus
            value={query}
            placeholder={t('chat.search.placeholder')}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (e.shiftKey) prevHit()
                else nextHit()
              }
              if (e.key === 'Escape') closeSearch()
            }}
          />
          <span className="chat-search-count">
            {query.trim() ? (hits.length ? `${hitIndex + 1}/${hits.length}` : t('chat.search.noMatch')) : ''}
          </span>
          <button className="icon-btn" onClick={prevHit} title={t('chat.search.previous')} disabled={!hits.length}>
            ↑
          </button>
          <button className="icon-btn" onClick={nextHit} title={t('chat.search.next')} disabled={!hits.length}>
            ↓
          </button>
          <button className="icon-btn" onClick={closeSearch} title={t('chat.search.close')}>
            ×
          </button>
        </div>
      )}

      {messages.length === 0 && (
        <div className="welcome">
          <h2>{t('chat.welcome')}</h2>
          <p>{t('chat.welcomeHint')}</p>
        </div>
      )}
      {messages.map((m) => (
        <div
          key={m.id}
          id={`msg-${m.id}`}
          className={`message-row ${m.role} ${activeHitId === m.id ? 'msg-hit' : ''}`}
        >
          <div className="message-bubble">
            {editingId === m.id ? (
              <div className="message-edit">
                <textarea
                  className="message-edit-input"
                  autoFocus
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      commitEdit(m.id)
                    }
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                />
                <div className="message-edit-actions">
                  <button className="msg-action" onClick={() => setEditingId(null)}>
                    {t('chat.cancel')}
                  </button>
                  <button className="msg-action primary" onClick={() => commitEdit(m.id)}>
                    {t('chat.saveAndRegen')}
                  </button>
                </div>
              </div>
            ) : m.role === 'assistant' ? (
              // 阶段化加载提示：流式中且尚无内容时显示「思考中」（对齐原版 chat.loadingText）
              m.streaming && !m.content ? (
                <div className="thinking">
                  <span className="thinking-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  {t('chat.loadingText')}
                </div>
              ) : (
                <Markdown content={m.content} />
              )
            ) : (
              <div className="user-text">
                {m.attachments && m.attachments.length > 0 && (
                  <div className="message-attachments">
                    {m.attachments.map((a) => (
                      <img key={a.id} src={a.dataUrl} alt={a.name} className="message-attachment-img" />
                    ))}
                  </div>
                )}
                {m.content}
              </div>
            )}
            {m.error && (
              <div className={`error-card kind-${m.errorKind ?? 'unknown'}`}>
                <div className="error-card-head">
                  <span className="error-card-title">
                    {t(`error.${m.errorKind ?? 'unknown'}.title`).replace('{model}', '')}
                  </span>
                </div>
                <div className="error-card-body">{t(`error.${m.errorKind ?? 'unknown'}.message`)}</div>
                <div className="error-card-raw" title={m.error}>
                  {m.error}
                </div>
                <div className="error-card-actions">
                  <button className="msg-action primary" onClick={() => onRetry(m.id)} disabled={streaming}>
                    {t('error.retry')}
                  </button>
                  <button className="msg-action" onClick={() => copyRaw(m.error!)}>
                    {copiedId === `err-${m.id}` ? t('error.copied') : t('error.copy')}
                  </button>
                  {m.errorKind === 'auth' && (
                    <button className="msg-action" onClick={onOpenSettings}>
                      {t('error.auth.action')}
                    </button>
                  )}
                </div>
              </div>
            )}
            {m.streaming && m.content && <span className="cursor" />}
          </div>
          {!m.streaming && editingId !== m.id && (
            <div className="message-actions">
              <button className="msg-action" onClick={() => copy(m)} title={t('chat.copy')}>
                {copiedId === m.id ? t('chat.copied') : t('chat.copy')}
              </button>
              {m.role === 'user' && (
                <button className="msg-action" onClick={() => beginEdit(m)} disabled={streaming} title={t('chat.edit')}>
                  {t('chat.edit')}
                </button>
              )}
              {m.role === 'assistant' && (
                <button
                  className="msg-action"
                  onClick={() => onRegenerate(m.id)}
                  disabled={streaming}
                  title={t('chat.regenerate')}
                >
                  {t('chat.regenerate')}
                </button>
              )}
              <button className="msg-action" onClick={() => onDelete(m.id)} disabled={streaming} title={t('chat.delete')}>
                {t('chat.delete')}
              </button>
            </div>
          )}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}
