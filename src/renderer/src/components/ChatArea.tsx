import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChatMessage,
  ProgressPhase,
  StopReason,
  ApprovalRequest,
  ApprovalDecision,
  UserQuestion,
  SessionSeparator
} from '../../../shared/types'
import { lookupErrorCode } from '../../../shared/errorCodes'
import Markdown from './Markdown'
import ApprovalCard from './ApprovalCard'
import QuestionCard from './QuestionCard'
import { SeparatorRow } from './SelectionChip'
import { toast } from '../stores/useToast'
import { useTranslation } from '../i18n'

export interface ToolResultItem {
  id: string
  name: string
  ok: boolean
  output: string
}

interface Props {
  messages: ChatMessage[]
  streaming: boolean
  // 当前处理阶段（对齐 progress.phase.*）
  phase?: ProgressPhase | null
  phaseTool?: string | null
  // 挂起的工具审批（对齐 tool.approval.*）
  pendingApproval?: ApprovalRequest | null
  // 挂起的向用户提问（对齐 tool.askUserQuestion.*）
  pendingQuestion?: (UserQuestion & { id: string }) | null
  // 本轮工具执行结果
  toolResults?: ToolResultItem[]
  onDecideApproval: (decision: ApprovalDecision) => void
  onAnswerQuestion: (answers: string[]) => void
  onSkipQuestion: () => void
  onRegenerate: (assistantId: string) => void
  onDelete: (messageId: string) => void
  onEdit: (messageId: string, newText: string) => void
  // 出错后重试上一轮（对齐原版 error.retry）
  onRetry: (assistantId: string) => void
  // 继续完成未完成的任务（对齐 error.rateLimitCap.continuePrompt）
  onContinue: () => void
  onOpenSettings: () => void
  // 递增信号：全局快捷键（Cmd+F）触发打开对话内搜索
  openSearchSignal?: number
  // 上下文档位列表（对齐 chat.sessionSeparator.*）
  separators?: SessionSeparator[]
}

export default function ChatArea({
  messages,
  streaming,
  phase,
  phaseTool,
  pendingApproval,
  pendingQuestion,
  toolResults,
  onDecideApproval,
  onAnswerQuestion,
  onSkipQuestion,
  onRegenerate,
  onDelete,
  onEdit,
  onRetry,
  onContinue,
  onOpenSettings,
  openSearchSignal,
  separators
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
  // 正在流式的最后一条 assistant（阶段文案只挂在它上面）
  const streamingMessageId = streaming
    ? [...messages].reverse().find((m) => m.role === 'assistant' && m.streaming)?.id
    : undefined

  // 停止原因提示（对齐 error.stopReason.*）：maxTokens / refusal 等需要提示用户
  const stopReasonText = (r: StopReason | undefined): string => {
    if (!r) return ''
    const key = `stop.${r}`
    const v = t(key)
    return v === key ? t('stop.unknown').replace('{reason}', r) : v
  }
  // 可「继续完成任务」的停止原因（截断 / 触顶轮次）
  const canContinue = (r: StopReason | undefined): boolean => r === 'maxTokens' || r === 'maxTurnRequests'

  // 阶段文案：工具类阶段追加工具名（对齐 progress.phase.*.{Tool} 形态）
  const phaseLabel = (p: ProgressPhase, tool?: string | null): string => {
    const base = t(`phase.${p}`)
    if (!tool) return base
    if (p === 'tool_executing' || p === 'waiting_for_permission' || p === 'model_streaming') {
      return `${base} · ${tool}`
    }
    return base
  }

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
          <p className="welcome-disclaimer">{t('common.aiDisclaimer')}</p>
          {(separators ?? []).map((s) => (
            <SeparatorRow key={s.id} sep={s} onOpenSettings={onOpenSettings} />
          ))}
        </div>
      )}
      {messages.map((m, mi) => {
        // 上下文档位（对齐 chat.sessionSeparator.*）：在跨过分界点的那条消息前插入分隔
        const prevTs = mi > 0 ? messages[mi - 1].createdAt : 0
        const crossed = (separators ?? []).filter((s) => s.createdAt > prevTs && s.createdAt <= m.createdAt)
        // 档位晚于最后一条消息时（刚点「新会话」尚无新消息），挂在末尾，
        // 保证分隔条立即可见（对齐原版行为）
        const isLast = mi === messages.length - 1
        const trailing = isLast ? (separators ?? []).filter((s) => s.createdAt > m.createdAt) : []
        return (
          <div key={m.id}>
            {crossed.map((s) => (
              <SeparatorRow key={s.id} sep={s} onOpenSettings={onOpenSettings} />
            ))}
            <div
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
              // 阶段化加载提示：流式中且尚无内容时显示当前阶段（对齐原版 progress.phase.*）
              m.streaming && !m.content ? (
                <div className="thinking">
                  <span className="thinking-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  {m.id === streamingMessageId && phase ? phaseLabel(phase, phaseTool) : t('chat.loadingText')}
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
                    {(() => {
                      // 优先用结构化错误码标题（对齐原版 errorCode.*），无则回落到分类标题
                      const entry = lookupErrorCode(m.errorCode)
                      return entry
                        ? entry.title
                        : t(`error.${m.errorKind ?? 'unknown'}.title`).replace('{model}', '')
                    })()}
                  </span>
                  {m.errorCode && <span className="error-card-code">{(m.errorCode)}</span>}
                </div>
                <div className="error-card-body">
                  {lookupErrorCode(m.errorCode)?.desc ?? t(`error.${m.errorKind ?? 'unknown'}.message`)}
                </div>
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
            {/* 停止原因提示（对齐原版 error.stopReason.*）：正常结束但被截断/拒绝 */}
            {!m.error && m.stopReason && (
              <div className={`stop-banner kind-${m.stopReason}`}>
                <span className="stop-banner-text">{stopReasonText(m.stopReason)}</span>
                {canContinue(m.stopReason) && (
                  <button className="msg-action primary" onClick={onContinue} disabled={streaming}>
                    {t('stop.continue')}
                  </button>
                )}
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
            {trailing.map((s) => (
              <SeparatorRow key={s.id} sep={s} onOpenSettings={onOpenSettings} />
            ))}
          </div>
        )
      })}
      {/* 本轮工具执行结果（对齐原版工具卡片） */}
      {toolResults && toolResults.length > 0 && (
        <div className="tool-results">
          {toolResults.map((r, i) => (
            <details key={`${r.id}-${i}`} className={`tool-result ${r.ok ? 'ok' : 'fail'}`}>
              <summary className="tool-result-head">
                <span className="tool-result-name">{r.name}</span>
                <span className={`tool-result-status ${r.ok ? 'ok' : 'fail'}`}>
                  {r.ok ? '完成' : '失败'}
                </span>
              </summary>
              <pre className="tool-result-body">{r.output}</pre>
            </details>
          ))}
        </div>
      )}

      {/* 工具审批卡片（对齐 tool.approval.*）：挂起等待用户授权 */}
      {pendingApproval && (
        <div className="interactive-row">
          <ApprovalCard req={pendingApproval} disabled={false} onDecide={onDecideApproval} />
        </div>
      )}

      {/* 向用户提问卡片（对齐 tool.askUserQuestion.*） */}
      {pendingQuestion && (
        <div className="interactive-row">
          <QuestionCard
            question={pendingQuestion}
            disabled={false}
            onAnswer={onAnswerQuestion}
            onSkip={onSkipQuestion}
          />
        </div>
      )}

      <div ref={endRef} />
    </div>
  )
}
