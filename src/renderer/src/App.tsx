import { useState, useEffect, useRef } from 'react'
import { useApp } from './stores/useApp'
import { useTranslation } from './i18n'
import { toast } from './stores/useToast'
import Sidebar from './components/Sidebar'
import ChatArea from './components/ChatArea'
import Composer from './components/Composer'
import SettingsPanel from './components/SettingsPanel'
import TerminalPanel from './components/TerminalPanel'
import PermissionDialog from './components/PermissionDialog'
import Toaster from './components/Toaster'

export default function App() {
  const app = useApp()
  const { t } = useTranslation()
  const [showSettings, setShowSettings] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  const [showPermission, setShowPermission] = useState(false)
  // 对话内搜索由快捷键触发
  const [searchSignal, setSearchSignal] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 应用启动时初始化（加载设置 + 会话列表 + 订阅流式事件）
  useEffect(() => {
    app.init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 全局快捷键（对齐原版 settings.keyboardShortcuts.actions.*）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      // Esc：停止生成 / 关闭浮层
      if (e.key === 'Escape') {
        if (showPermission) return setShowPermission(false)
        if (showSettings) return setShowSettings(false)
        if (app.streaming) void app.stopStreaming()
        return
      }
      if (!mod) return
      switch (e.key.toLowerCase()) {
        case 'f': // 对话内搜索
          e.preventDefault()
          setSearchSignal((n) => n + 1)
          break
        case 'n': // 新建对话
          e.preventDefault()
          void app.newConversation()
          break
        case ',': // 打开设置
          e.preventDefault()
          setShowSettings(true)
          break
        case 'k': // 侧栏搜索聚焦
          e.preventDefault()
          document.querySelector<HTMLInputElement>('.sidebar-search .search-input')?.focus()
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSettings, app.streaming])

  return (
    <div className="app">
      <Sidebar
        conversations={app.conversations}
        currentId={app.currentId}
        searchQuery={app.searchQuery}
        showArchived={app.showArchived}
        onSelect={app.selectConversation}
        onNew={app.newConversation}
        onDelete={app.removeConversation}
        onRename={app.renameConversation}
        onSearch={app.search}
        onExport={app.exportConversation}
        onTogglePin={app.togglePin}
        onToggleArchive={app.toggleArchive}
        onToggleShowArchived={() => app.setShowArchived(!app.showArchived)}
      />
      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            {app.conversations.find((c) => c.id === app.currentId)?.title || t('sidebar.new')}
          </div>
          <div className="topbar-actions">
            <button className="icon-btn" onClick={app.clearContext} title={t('chat.clearContext')}>
              ⌫
            </button>
            <button className="icon-btn" onClick={() => setShowTerminal((v) => !v)} title={t('terminal.toggle')}>
              ⌥
            </button>
            <button className="icon-btn" onClick={() => setShowSettings(true)} title={t('settings.toggle')}>
              ⚙
            </button>
          </div>
        </header>
        <ChatArea
          messages={app.messages}
          streaming={app.streaming}
          phase={app.phase}
          phaseTool={app.phaseTool}
          onRegenerate={app.regenerate}
          onDelete={app.removeMessage}
          onEdit={app.editMessage}
          onRetry={app.retry}
          onContinue={app.continueTask}
          onOpenSettings={() => setShowSettings(true)}
          openSearchSignal={searchSignal}
        />
        <Composer
          streaming={app.streaming}
          mode={app.mode}
          queueCount={app.queue.length}
          files={app.messages.flatMap((m) => m.attachments ?? [])}
          permission={app.settings?.permission ?? 'default'}
          sendShortcut={app.settings?.sendShortcut ?? 'Enter'}
          onSend={app.sendMessage}
          onStop={app.stopStreaming}
          onModeChange={app.setMode}
          onOpenPermission={() => setShowPermission(true)}
        />
      </main>
      {showTerminal && app.currentId && (
        <TerminalPanel conversationId={app.currentId} onClose={() => setShowTerminal(false)} />
      )}
      {showSettings && app.settings && (
        <SettingsPanel settings={app.settings} onSave={app.saveSettings} onClose={() => setShowSettings(false)} />
      )}
      {app.settings && (
        <PermissionDialog
          open={showPermission}
          current={app.settings.permission ?? 'default'}
          onClose={() => setShowPermission(false)}
          onConfirm={() => {
            void app.saveSettings({ ...app.settings!, permission: 'fullAccess', fullAccessAcknowledged: true })
            setShowPermission(false)
            toast.success(t('permission.fullAccess'))
          }}
          onRevoke={() => {
            void app.saveSettings({ ...app.settings!, permission: 'default' })
            setShowPermission(false)
            toast.info(t('permission.default'))
          }}
        />
      )}
      <Toaster />
    </div>
  )
}
