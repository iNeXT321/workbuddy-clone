import { useRef, useState } from 'react'
import type { Attachment, WorkMode, PermissionLevel, WbAddGroup } from '../../../shared/types'
import { useTranslation } from '../i18n'
import { toast } from '../stores/useToast'

interface Props {
  streaming: boolean
  mode: WorkMode
  queueCount: number
  // 对话中已出现的文件（供 @ 引用，对齐原版 mention.file.sessionGroup）
  files?: Attachment[]
  // 当前权限等级（对齐 input.wbAdd.permission.*）
  permission?: PermissionLevel
  // 发送/换行快捷键（对齐 chat.input.sendShortcutTooltip）
  sendShortcut?: 'Enter' | 'Mod+Enter'
  onSend: (text: string, attachments?: Attachment[], slashCommand?: string) => void
  onStop: () => void
  onModeChange: (mode: WorkMode) => void
  // 打开权限确认弹窗（完全访问需二次确认）
  onOpenPermission: () => void
}

const MAX_IMAGES = 4
const MAX_SIZE = 8 * 1024 * 1024 // 8MB

// 三工作模式（对齐原版 input.wbAdd.mode.*）
const MODES: WorkMode[] = ['default', 'plan', 'ask']

// 斜杠指令（对齐原版「/ 调用技能与指令」）：本地内置指令表
const SLASH_COMMANDS: Array<{ name: string; zh: string; en: string }> = [
  { name: 'clear', zh: '清空当前上下文', en: 'Clear the current context' },
  { name: 'summary', zh: '总结当前对话', en: 'Summarize this conversation' },
  { name: 'translate', zh: '翻译上一条回复', en: 'Translate the last reply' },
  { name: 'explain', zh: '解释选中的代码或文本', en: 'Explain the selected code or text' },
  { name: 'simplify', zh: '把上一条回复改得更简洁', en: 'Rewrite the last reply more concisely' },
  { name: 'expand', zh: '把上一条回复展开更详细', en: 'Expand the last reply in more detail' },
  { name: 'steps', zh: '把任务拆成分步计划', en: 'Break the task into a step-by-step plan' },
  { name: 'tests', zh: '为当前代码补测试', en: 'Add tests for the current code' },
  { name: 'review', zh: '审查当前改动', en: 'Review the current changes' },
  { name: 'docs', zh: '为当前代码补文档', en: 'Write docs for the current code' }
]

// 「更多操作」七大分组（对齐原版 input.wbAdd.*）
const WB_ADD_GROUPS: Array<{ group: WbAddGroup; icon: string; labelKey: string }> = [
  { group: 'files', icon: '📎', labelKey: 'wbAdd.addFiles' },
  { group: 'references', icon: '@', labelKey: 'wbAdd.referenceFiles' },
  { group: 'experts', icon: '🧑‍🏫', labelKey: 'wbAdd.experts' },
  { group: 'skills', icon: '⚡', labelKey: 'wbAdd.skills' },
  { group: 'connectors', icon: '🔌', labelKey: 'wbAdd.connectors' },
  { group: 'plugins', icon: '🧩', labelKey: 'wbAdd.plugins' },
  { group: 'permission', icon: '🛡', labelKey: 'permission.label' }
]

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

export default function Composer({
  streaming,
  mode,
  queueCount,
  files,
  permission = 'default',
  sendShortcut = 'Enter',
  onSend,
  onStop,
  onModeChange,
  onOpenPermission
}: Props) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  // @ 上下文引用（对齐原版 mention.file.*）
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [references, setReferences] = useState<Attachment[]>([])
  // 「+ 更多操作」面板（对齐原版 input.wbAdd.*）
  const [wbAddOpen, setWbAddOpen] = useState(false)
  // 斜杠指令面板（对齐原版「/ 调用技能与指令」）
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
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

  // 解析斜杠指令：/cmd 前缀 → 指令名 + 剩余正文
  const parseSlash = (raw: string): { command?: string; body: string } => {
    const m = raw.match(/^\/([a-zA-Z0-9_-]+)\s*([\s\S]*)$/)
    return m ? { command: m[1], body: m[2] ?? '' } : { body: raw }
  }

  // 流式中提交 → store 内自动入队；否则直接发送
  const submit = () => {
    const raw = text.trim()
    if (!raw && attachments.length === 0 && references.length === 0) return
    const { command, body } = parseSlash(raw)
    // 带斜杠指令时：正文为空则用指令名占位，保证有可读内容
    const outText = command ? body.trim() || `/${command}` : raw
    onSend(outText, [...attachments, ...references].length ? [...attachments, ...references] : undefined, command)
    setText('')
    setAttachments([])
    setReferences([])
    setSlashOpen(false)
  }

  // @ 触发：检测光标前是否处于「@词」状态
  const syncMention = (value: string, caret: number) => {
    const before = value.slice(0, caret)
    // 斜杠指令优先：行首 /xxx 触发指令面板
    const slash = before.match(/^\/([a-zA-Z0-9_-]*)$/)
    if (slash) {
      setSlashQuery(slash[1])
      setSlashOpen(true)
      setMentionOpen(false)
      return
    }
    setSlashOpen(false)

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

  // 选中斜杠指令 → 保留 /cmd 前缀在输入框内，关闭面板
  const pickSlash = (name: string) => {
    setText(`/${name} `)
    setSlashOpen(false)
    setSlashQuery('')
    taRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const sendKey = sendShortcut === 'Enter' ? e.key === 'Enter' && !e.shiftKey : e.key === 'Enter' && (e.metaKey || e.ctrlKey)
    if (sendKey) {
      e.preventDefault()
      submit()
      return
    }
    if (e.key === 'Escape') {
      setMentionOpen(false)
      setSlashOpen(false)
      setModeOpen(false)
      setWbAddOpen(false)
    }
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

  // 面板分组点击：「更多操作」目前仅文件与权限在本工作区可用，其余给出占位提示
  const onGroupClick = (group: WbAddGroup) => {
    setWbAddOpen(false)
    if (group === 'files') {
      fileRef.current?.click()
      return
    }
    if (group === 'permission') {
      onOpenPermission()
      return
    }
    toast.info(t('wbAdd.submenu.placeholder'))
  }

  const slashList = SLASH_COMMANDS.filter(
    (c) => !slashQuery || c.name.toLowerCase().includes(slashQuery.toLowerCase())
  )

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
      {/* 外部模型安全提示（对齐 input.externalModelWarning） */}
      {permission === 'fullAccess' && (
        <div className="composer-warning">{t('composer.externalModelWarning')}</div>
      )}

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

      {/* chips 区：模式 / 权限 / 队列（对齐 input.modeChip.* / permission / queue） */}
      {(mode !== 'default' || modeOpen || queueCount > 0 || permission === 'fullAccess') && (
        <div className="composer-chips">
          {permission === 'fullAccess' && (
            <span className="chip permission-chip active" title={t('permission.tooltip.fullAccess')}>
              {t('permission.fullAccess')}
              <button className="chip-clear" title={t('permission.switchOff')} onClick={onOpenPermission}>
                ×
              </button>
            </span>
          )}
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

      {/* 斜杠指令面板（对齐原版「/ 调用技能与指令」） */}
      {slashOpen && (
        <div className="slash-panel">
          <div className="slash-group">{t('slash.title')}</div>
          {slashList.length === 0 ? (
            <div className="slash-empty">{t('slash.empty')}</div>
          ) : (
            slashList.map((c) => (
              <button key={c.name} className="slash-item" onClick={() => pickSlash(c.name)}>
                <span className="slash-name">/{c.name}</span>
                <span className="slash-desc">{t('app.name') === 'WorkBuddy' && c.zh ? c.zh : c.en}</span>
              </button>
            ))
          )}
        </div>
      )}

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
        {/* 「+ 更多操作」入口（对齐原版 input.wbAdd.title / tooltip） */}
        <div className="wbadd-picker">
          <button
            className={`btn ghost ${wbAddOpen ? 'active' : ''}`}
            onClick={() => setWbAddOpen((v) => !v)}
            title={t('wbAdd.tooltip')}
          >
            ＋
          </button>
          {wbAddOpen && (
            <div className="wbadd-menu">
              <div className="wbadd-header">{t('wbAdd.title')}</div>
              {WB_ADD_GROUPS.map((g) => (
                <button key={g.group} className="wbadd-item" onClick={() => onGroupClick(g.group)}>
                  <span className="wbadd-icon">{g.icon}</span>
                  <span className="wbadd-label">{t(g.labelKey)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
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
        <button
          className={`btn ghost ${slashOpen ? 'active' : ''}`}
          onClick={() => {
            setSlashOpen(true)
            setSlashQuery('')
            taRef.current?.focus()
          }}
          title={t('slash.hint')}
        >
          /
        </button>
        <button
          className={`btn ghost ${permission === 'fullAccess' ? 'active' : ''}`}
          onClick={onOpenPermission}
          title={t('permission.tooltip.fullAccess')}
        >
          🛡
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
