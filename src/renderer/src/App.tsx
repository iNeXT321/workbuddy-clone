import { useState, useEffect } from 'react'
import { useApp } from './stores/useApp'
import { useTranslation } from './i18n'
import { toast } from './stores/useToast'
import Sidebar from './components/Sidebar'
import ChatArea from './components/ChatArea'
import Composer from './components/Composer'
import SettingsPanel from './components/SettingsPanel'
import TerminalPanel from './components/TerminalPanel'
import PermissionDialog from './components/PermissionDialog'
import TaskSearchOverlay from './components/TaskSearchOverlay'
import AutomationPanel from './components/AutomationPanel'
import SchedulePanel from './components/SchedulePanel'
import ColleaguesPanel from './components/ColleaguesPanel'
import SkillsPanel from './components/SkillsPanel'
import Toaster from './components/Toaster'

export default function App() {
  const app = useApp()
  const { t } = useTranslation()
  const [showSettings, setShowSettings] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  const [showPermission, setShowPermission] = useState(false)
  // 当前任务的工作空间（对齐 taskStarter.*；null = 不使用工作空间）
  const [workspacePath, setWorkspacePath] = useState<string | null>(null)
  // 对话内搜索由快捷键触发
  const [searchSignal, setSearchSignal] = useState(0)
  // 任务搜索覆盖层（对齐 conversation.search.*）
  const [showTaskSearch, setShowTaskSearch] = useState(false)
  // 新建工作空间弹窗（对齐 conversation.section.addWorkspace）
  const [showCreateWs, setShowCreateWs] = useState(false)
  const [wsName, setWsName] = useState('')
  const [wsError, setWsError] = useState('')
  // 切换文件确认弹窗（对齐 chat.docTabSwitch.dialog.*）
  const [pendingTab, setPendingTab] = useState<string | null>(null)
  // 定时任务面板（对齐 automation.*）
  const [showAutomation, setShowAutomation] = useState(false)
  // 日程 / 日历面板（对齐 home.schedule.*）
  const [showSchedule, setShowSchedule] = useState(false)
  // 数字员工 / 助理面板（对齐 colleagues.*）
  const [showColleagues, setShowColleagues] = useState(false)
  // 技能市场 / 技能管理面板（对齐 skills.*）
  const [showSkills, setShowSkills] = useState(false)

  // 新建工作空间：调主进程真实建目录，失败按 taskStarter.createWorkspace.toast.failed 提示
  const createWorkspace = async () => {
    const name = wsName.trim()
    if (!name) {
      setWsError(t('taskStarter.createWorkspacePlaceholder'))
      return
    }
    const r = await window.workbuddy.workspaceCreate(name)
    if (!r.ok) {
      setWsError(t('taskStarter.createWorkspace.toast.failed'))
      return
    }
    // 对齐 WorkspacePicker：创建成功即静默关闭（原版无成功 toast）
    setShowCreateWs(false)
    setWsName('')
    setWsError('')
  }

  // 应用启动时初始化（加载设置 + 会话列表 + 订阅流式事件）
  useEffect(() => {
    app.init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 会话切换：若对话框仍有文档选区，先弹「确认切换文件」（对齐 chat.docTabSwitch.dialog.*）
  const requestSelect = (id: string) => {
    if (app.selection && id !== app.currentId) {
      setPendingTab(id)
      return
    }
    void app.selectConversation(id)
  }

  const confirmTabSwitch = () => {
    app.dismissSelection()
    if (pendingTab) void app.selectConversation(pendingTab)
    setPendingTab(null)
  }

  // 全局快捷键（对齐原版 settings.keyboardShortcuts.actions.*）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      // Esc：停止生成 / 关闭浮层
      if (e.key === 'Escape') {
        if (showTaskSearch) return setShowTaskSearch(false)
        if (showAutomation) return setShowAutomation(false)
        // 日程面板自行逐层处理 Esc（表单 → 删除确认 → 详情卡 → 面板），
        // 这里只让出控制权，不直接关闭，否则一次 Esc 会跳层
        if (showSchedule) return
        if (showColleagues) return
        if (showSkills) return
        if (showCreateWs) return setShowCreateWs(false)
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
        case 'k': // 全局任务搜索覆盖层（对齐 conversation.search.* / settings.keyboardShortcuts.actions.openSearch）
          e.preventDefault()
          setShowTaskSearch(true)
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSettings, app.streaming, showTaskSearch, showCreateWs, showAutomation, showSchedule, showColleagues, showSkills])

  return (
    <div className="app">
      <Sidebar
        conversations={app.conversations}
        currentId={app.currentId}
        searchQuery={app.searchQuery}
        showArchived={app.showArchived}
        limitReached={app.conversationLimit.reached}
        creating={app.creating}
        onSelect={requestSelect}
        onNew={app.newConversation}
        onDelete={app.removeConversation}
        onRename={app.renameConversation}
        onSearch={app.search}
        onExport={app.exportConversation}
        onTogglePin={app.togglePin}
        onToggleArchive={app.toggleArchive}
        onToggleShowArchived={() => app.setShowArchived(!app.showArchived)}
        onOpenTaskSearch={() => setShowTaskSearch(true)}
        onAddWorkspace={() => setShowCreateWs(true)}
      />
      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            {app.conversations.find((c) => c.id === app.currentId)?.title || t('sidebar.new')}
          </div>
          <div className="topbar-actions">
            <button className="icon-btn" onClick={() => setShowAutomation(true)} title={t('automation.title')}>
              ⏱
            </button>
            <button className="icon-btn" onClick={() => setShowSchedule(true)} title={t('home.schedule.myCalendar')}>
              ▤
            </button>
            <button className="icon-btn" onClick={() => setShowColleagues(true)} title={t('colleagues.myColleagues')}>
              ☰
            </button>
            <button className="icon-btn" onClick={() => setShowSkills(true)} title={t('skills.entry')}>
              ✧
            </button>
            <button className="icon-btn" onClick={() => void app.startNewSession()} title={t('sessionSeparator.label')}>
              ✦
            </button>
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
          pendingApproval={app.pendingApproval}
          pendingQuestion={app.pendingQuestion}
          toolResults={app.toolResults}
          onDecideApproval={app.decideApproval}
          onAnswerQuestion={app.answerQuestion}
          onSkipQuestion={app.skipQuestion}
          onRegenerate={app.regenerate}
          onDelete={app.removeMessage}
          onEdit={app.editMessage}
          onRetry={app.retry}
          onContinue={app.continueTask}
          onOpenSettings={() => setShowSettings(true)}
          openSearchSignal={searchSignal}
          separators={app.separators}
        />
        <Composer
          streaming={app.streaming}
          mode={app.mode}
          queueCount={app.queue.length}
          files={app.messages.flatMap((m) => m.attachments ?? [])}
          permission={app.settings?.permission ?? 'default'}
          sendShortcut={app.settings?.sendShortcut ?? 'Enter'}
          model={app.settings?.model ?? ''}
          selection={app.selection}
          workspacePath={workspacePath}
          workspaceRoot={app.settings?.workspacePath ?? ''}
          onWorkspaceChange={setWorkspacePath}
          onDismissSelection={app.dismissSelection}
          onSend={app.sendMessage}
          onStop={app.stopStreaming}
          onModeChange={app.setMode}
          onOpenPermission={() => setShowPermission(true)}
          onOpenSettings={() => setShowSettings(true)}
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
      {pendingTab && (
        <div className="modal-overlay" onClick={() => setPendingTab(null)}>
          <div className="modal dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">{t('docTabSwitch.dialog.title')}</div>
            <div className="dialog-content">{t('docTabSwitch.dialog.content')}</div>
            <div className="dialog-actions">
              <button className="btn ghost" onClick={() => setPendingTab(null)}>
                {t('chat.cancel')}
              </button>
              <button className="btn" onClick={confirmTabSwitch}>
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
      {showTaskSearch && (
        <TaskSearchOverlay
          open={showTaskSearch}
          conversations={app.conversations}
          onClose={() => setShowTaskSearch(false)}
          onSelect={requestSelect}
        />
      )}
      {showAutomation && <AutomationPanel onClose={() => setShowAutomation(false)} />}
      {showSchedule && <SchedulePanel onClose={() => setShowSchedule(false)} />}
      {showColleagues && <ColleaguesPanel onClose={() => setShowColleagues(false)} />}
      {showSkills && <SkillsPanel onClose={() => setShowSkills(false)} />}
      {showCreateWs && (
        <div className="modal-overlay" onClick={() => setShowCreateWs(false)}>
          <div className="modal dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">{t('section.addWorkspace')}</div>
            <div className="dialog-content">{t('taskStarter.createWorkspaceDesc')}</div>
            <input
              className="ws-create-input"
              autoFocus
              value={wsName}
              placeholder={t('taskStarter.createWorkspacePlaceholder')}
              onChange={(e) => {
                setWsName(e.target.value)
                setWsError('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createWorkspace()
              }}
            />
            {wsError && <div className="dialog-error">{wsError}</div>}
            <div className="dialog-actions">
              <button className="btn ghost" onClick={() => setShowCreateWs(false)}>
                {t('chat.cancel')}
              </button>
              <button className="btn" onClick={() => void createWorkspace()}>
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
      <Toaster />
    </div>
  )
}
