import { useRef, useState } from 'react'
import type { Attachment, WorkMode } from '../../../shared/types'
import { useTranslation } from '../i18n'
import { toast } from '../stores/useToast'

interface Props {
  streaming: boolean
  mode: WorkMode
  queueCount: number
  // 对话中已出现的文件（供 @ 引用，对齐原版 mention.file.sessionGroup）
  files?: Attachment[]
  onSend: (text: string, attachments?: Attachment[]) => void
  onStop: () => void
  onModeChange: (mode: WorkMode) => void
}

const MAX_IMAGES = 4
const MAX_SIZE = 8 * 1024 * 1024 // 8MB

// 三工作模式（对齐原版 input.wbAdd.mode.*）
const MODES: WorkMode[] = ['default', 'plan', 'ask']

/** 把 File 读成 data URL 附件（对齐原版图片输入能力） */
function fileToAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      resolve({
        id: crypto.randomUUID(),
        name: file.name || 'image',
        mime: file.type,
        dataUrl: String(reader.result),
        size: file.size
      })
    reader.onerror = () => reject(new Error('read error'))
    reader.readAsDataURL(file)
  })
}

export default function Composer({ streaming, mode, queueCount, files, onSend, onStop, onModeChange }: Props) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  // @ 上下文引用（对齐原版 mention.file.*）
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [references, setReferences] = useState<Attachment[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const addFiles = async (files: FileList | File[]) => {
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) return
    const room = MAX_IMAGES - attachments.length
    if (room <= 0) {
      toast.error(t('composer.maxImages'))
      return
    }
    const picked = images.slice(0, room)
    const next: Attachment[] = []
    for (const f of picked) {
      if (f.size > MAX_SIZE) {
        toast.error(t('composer.tooLarge'))
        continue
      }
      try {
        next.push(await fileToAttachment(f))
      } catch {
        toast.error(t('composer.attachFailed'))
      }
    }
    if (next.length) setAttachments((prev) => [...prev, ...next])
  }

  // 流式中提交 → store 内自动入队；否则直接发送
  const submit = () => {
    const txt = text.trim()
    if (!txt && attachments.length === 0 && references.length === 0) return
    onSend(txt, [...attachments, ...references].length ? [...attachments, ...references] : undefined)
    setText('')
    setAttachments([])
    setReferences([])
  }

  // @ 触发：检测光标前是否处于「@词」状态
  const syncMention = (value: string, caret: number) => {
    const before = value.slice(0, caret)
    const at = before.lastIndexOf('@')
    if (at < 0) {
      setMentionOpen(false)
      return
    }
    // @ 之后不允许有空白（否则视为普通文本）
    const seg = before.slice(at + 1)
    if (/\s/.test(seg)) {
      setMentionOpen(false)
      return
    }
    setMentionQuery(seg)
    setMentionOpen(true)
  }

  const pickReference = (f: Attachment) => {
    // 移除触发用的 @词，再挂上引用 chip
    setText((prev) => prev.replace(/@[^\s@]*$/, ''))
    setReferences((prev) => (prev.some((x) => x.id === f.id) ? prev : [...prev, f]))
    setMentionOpen(false)
    setMentionQuery('')
    taRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
    if (e.key === 'Escape') setMentionOpen(false)
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (const it of items) {
      if (it.kind === 'file') {
        const f = it.getAsFile()
        if (f) files.push(f)
      }
    }
    if (files.length) {
      e.preventDefault()
      addFiles(files)
    }
  }

  return (
    <div
      className={`composer ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
      }}
    >
      {attachments.length > 0 && (
        <div className="attachment-strip">
          {attachments.map((a) => (
            <div key={a.id} className="attachment-thumb">
              <img src={a.dataUrl} alt={a.name} />
              <button
                className="attachment-remove"
                onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                title={t('chat.delete')}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 模式 chip：非默认模式常驻显示，可一键退出（对齐 input.modeChip.clear） */}
      {(mode !== 'default' || modeOpen || queueCount > 0) && (
        <div className="composer-chips">
          <div className="mode-picker">
            <button
              className={`chip mode-chip ${mode !== 'default' ? 'active' : ''}`}
              onClick={() => setModeOpen((v) => !v)}
              title={t('chat.mode.title')}
            >
              {t(`chat.mode.label.${mode}`)}
              <span className="chip-caret">▾</span>
            </button>
            {mode !== 'default' && (
              <button
                className="chip-clear"
                title={t('chat.mode.exit').replace('{mode}', t(`chat.mode.label.${mode}`))}
                onClick={() => onModeChange('default')}
              >
                ×
              </button>
            )}
            {modeOpen && (
              <div className="mode-menu">
                {MODES.map((m) => (
                  <button
                    key={m}
                    className={`mode-item ${m === mode ? 'selected' : ''}`}
                    onClick={() => {
                      onModeChange(m)
                      setModeOpen(false)
                    }}
                  >
                    <span className="mode-item-label">{t(`chat.mode.label.${m}`)}</span>
                    <span className="mode-item-desc">{t(`chat.mode.description.${m}`)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {queueCount > 0 && (
            <span className="chip queue-badge">{t('composer.queue').replace('{count}', String(queueCount))}</span>
          )}
        </div>
      )}

      <textarea
        ref={taRef}
        className="composer-input"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          syncMention(e.target.value, e.target.selectionStart ?? e.target.value.length)
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        placeholder={t('composer.placeholder')}
        rows={3}
      />

      {/* @ 上下文引用面板（对齐原版 mention.file.*） */}
      {mentionOpen && (
        <div className="mention-panel">
          <div className="mention-group">{t('mention.file.sessionGroup')}</div>
          {(files ?? []).filter((f) => !mentionQuery || f.name.toLowerCase().includes(mentionQuery.toLowerCase())).length ===
          0 ? (
            <div className="mention-empty">
              {(files ?? []).length === 0 ? t('mention.file.emptyInitial') : t('mention.file.searchEmpty')}
            </div>
          ) : (
            (files ?? [])
              .filter((f) => !mentionQuery || f.name.toLowerCase().includes(mentionQuery.toLowerCase()))
              .map((f) => (
                <button key={f.id} className="mention-item" onClick={() => pickReference(f)}>
                  <span className="mention-name">{f.name}</span>
                  <span className="mention-desc">{t('mention.file.description')}</span>
                </button>
              ))
          )}
        </div>
      )}

      {/* 已引用文件 chips */}
      {references.length > 0 && (
        <div className="ref-strip">
          {references.map((r) => (
            <span key={r.id} className="ref-chip">
              @{r.name}
              <button
                className="ref-remove"
                title={t('mention.remove')}
                onClick={() => setReferences((prev) => prev.filter((x) => x.id !== r.id))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="composer-actions">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <button className="btn ghost" onClick={() => fileRef.current?.click()} title={t('composer.attach')}>
          🖼
        </button>
        <button
          className={`btn ghost ${mode !== 'default' ? 'active' : ''}`}
          onClick={() => setModeOpen((v) => !v)}
          title={t('chat.mode.title')}
        >
          {t('chat.mode.title')}
        </button>
        <div className="composer-spacer" />
        {streaming ? (
          <button className="btn stop" onClick={onStop}>
            {t('composer.stop')}
          </button>
        ) : (
          <button className="btn send" onClick={submit} disabled={!text.trim() && attachments.length === 0}>
            {t('composer.send')}
          </button>
        )}
      </div>
    </div>
  )
}
