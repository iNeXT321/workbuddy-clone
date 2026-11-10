import type { Conversation } from '../../../shared/types'

interface Props {
  conversations: Conversation[]
  currentId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
}

export default function Sidebar({ conversations, currentId, onSelect, onNew, onDelete, onRename }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">WorkBuddy</span>
        <button className="icon-btn" onClick={onNew} title="新建对话">
          +
        </button>
      </div>
      <div className="conversation-list">
        {conversations.map((c) => (
          <div
            key={c.id}
            className={`conversation-item ${c.id === currentId ? 'active' : ''}`}
            onClick={() => onSelect(c.id)}
          >
            <span
              className="conversation-title"
              onDoubleClick={() => {
                const title = window.prompt('重命名会话', c.title)
                if (title && title.trim()) onRename(c.id, title.trim())
              }}
            >
              {c.title || '新对话'}
            </span>
            <button
              className="icon-btn small"
              onClick={(e) => {
                e.stopPropagation()
                if (window.confirm('删除该会话？')) onDelete(c.id)
              }}
              title="删除"
            >
              ×
            </button>
          </div>
        ))}
        {conversations.length === 0 && <div className="empty-hint">暂无会话</div>}
      </div>
    </aside>
  )
}
