import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '../i18n'
import { toast } from '../stores/useToast'

/**
 * 工作空间选择器 —— 对齐原版 `taskStarter.*`：
 * - `startIn`=任务启动于：、`selectWorkspace`/`selectFolder`=选择工作空间
 * - `startFromEmpty`=新建工作空间（本地自动创建同名文件夹，命名后不可随意更改）
 * - `openNewDirectory`=打开本地文件夹、`noWorkspace`=不使用工作空间
 * - `workspaceNotExist`=所选工作空间不存在，请重新选择
 * - `createWorkspace.toast.failed`=新建工作空间失败，请重试
 * - `workspacePathHint.*`=可前往「系统设置」设置默认工作空间存储路径
 */

interface Props {
  workspacePath: string | null
  onChange: (path: string | null) => void
  onOpenSettings: () => void
}

interface WsItem {
  name: string
  path: string
  mtime: number
}

export default function WorkspacePicker({ workspacePath, onChange, onOpenSettings }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<WsItem[]>([])
  const [root, setRoot] = useState('')
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      const r = await window.workbuddy.workspaceList()
      setItems(r.items)
      setRoot(r.root)
    } catch {
      setItems([])
    }
  }

  useEffect(() => {
    if (open) void load()
  }, [open])

  const filtered = useMemo(
    () => items.filter((i) => !query || i.name.toLowerCase().includes(query.toLowerCase())),
    [items, query]
  )

  const label = workspacePath ? workspacePath.split('/').filter(Boolean).pop() || workspacePath : t('taskStarter.noWorkspace')

  const pick = async (path: string | null) => {
    if (path) {
      // 对齐 workspaceNotExist：选择前校验目录仍然存在
      const ok = await window.workbuddy.workspaceValidate(path)
      if (!ok) {
        toast.error(t('taskStarter.workspaceNotExist'))
        void load()
        return
      }
    }
    onChange(path)
    setOpen(false)
  }

  const create = async () => {
    const n = name.trim()
    if (!n) {
      setError(t('taskStarter.createWorkspacePlaceholder'))
      return
    }
    setCreating(true)
    const r = await window.workbuddy.workspaceCreate(n)
    setCreating(false)
    if (!r.ok) {
      // 对齐 createWorkspace.toast.failed
      const msg = t('taskStarter.createWorkspace.toast.failed')
      toast.error(msg)
      setError(msg)
      return
    }
    setName('')
    setError(null)
    onChange(r.path ?? null)
    setOpen(false)
  }

  return (
    <div className="ws-picker">
      <button className="chip ws-chip" onClick={() => setOpen((v) => !v)} title={t('taskStarter.selectWorkspace')}>
        <span className="ws-chip-icon">📁</span>
        <span className="ws-chip-label">
          {t('taskStarter.startIn')}
          {label}
        </span>
        <span className="chip-caret">▾</span>
      </button>

      {open && (
        <div className="ws-menu">
          <div className="ws-menu-header">{t('taskStarter.selectWorkspace')}</div>

          <input
            className="ws-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('taskStarter.searchWorkspace')}
          />

          {filtered.length === 0 ? (
            <div className="ws-empty">{t('taskStarter.noWorkspaceFound')}</div>
          ) : (
            filtered.map((i) => (
              <button
                key={i.path}
                className={`ws-item ${workspacePath === i.path ? 'selected' : ''}`}
                onClick={() => pick(i.path)}
                title={i.path}
              >
                <span className="ws-item-icon">📁</span>
                <span className="ws-item-name">{i.name}</span>
              </button>
            ))
          )}

          <button
            className={`ws-item ${!workspacePath ? 'selected' : ''}`}
            onClick={() => pick(null)}
          >
            <span className="ws-item-icon">🚫</span>
            <span className="ws-item-name">{t('taskStarter.noWorkspace')}</span>
          </button>

          <div className="ws-divider" />

          {creating || name ? (
            <div className="ws-create">
              <div className="ws-create-desc">{t('taskStarter.createWorkspaceDesc')}</div>
              <input
                className="ws-search"
                autoFocus
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void create()
                }}
                placeholder={t('taskStarter.createWorkspacePlaceholder')}
              />
              {error && <div className="ws-error">{error}</div>}
              <div className="ws-create-actions">
                <button className="btn ghost" onClick={() => { setCreating(false); setName(''); setError(null) }}>
                  {t('settings.cancel')}
                </button>
                <button className="btn" onClick={() => void create()}>
                  {t('taskStarter.startFromEmpty')}
                </button>
              </div>
            </div>
          ) : (
            <button className="ws-item ws-item-action" onClick={() => setCreating(true)}>
              <span className="ws-item-icon">＋</span>
              <span className="ws-item-name">{t('taskStarter.startFromEmpty')}</span>
            </button>
          )}
        </div>
      )}

      <button
        className="ws-path-hint"
        onClick={onOpenSettings}
        aria-label={t('taskStarter.workspacePathHint.ariaLabel')}
        title={t('taskStarter.workspacePathHint.ariaLabel')}
      >
        <span>
          {t('taskStarter.workspacePathHint.prefix')}
          {t('taskStarter.workspacePathHint.settingsLink')}
          {t('taskStarter.workspacePathHint.suffix')}
        </span>
        <span className="ws-path-value">{root || '~'}</span>
      </button>
    </div>
  )
}
