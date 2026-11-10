import { useState } from 'react'
import { useApp } from './stores/useApp'
import Sidebar from './components/Sidebar'
import ChatArea from './components/ChatArea'
import Composer from './components/Composer'
import SettingsPanel from './components/SettingsPanel'

export default function App() {
  const app = useApp()
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="app">
      <Sidebar
        conversations={app.conversations}
        currentId={app.currentId}
        onSelect={app.selectConversation}
        onNew={app.newConversation}
        onDelete={app.removeConversation}
        onRename={app.renameConversation}
      />
      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            {app.conversations.find((c) => c.id === app.currentId)?.title || '新对话'}
          </div>
          <button className="icon-btn" onClick={() => setShowSettings(true)} title="设置">
            ⚙
          </button>
        </header>
        <ChatArea messages={app.messages} streaming={app.streaming} />
        <Composer streaming={app.streaming} onSend={app.sendMessage} onStop={app.stopStreaming} />
      </main>
      {showSettings && app.settings && (
        <SettingsPanel settings={app.settings} onSave={app.saveSettings} onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}
