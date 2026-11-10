import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../../../shared/types'
import Markdown from './Markdown'

interface Props {
  messages: ChatMessage[]
  streaming: boolean
}

export default function ChatArea({ messages, streaming }: Props) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="chat-area">
      {messages.length === 0 && (
        <div className="welcome">
          <h2>你好，我是 WorkBuddy</h2>
          <p>在下方输入消息开始对话。首次使用请先在设置中配置 API 接口。</p>
        </div>
      )}
      {messages.map((m) => (
        <div key={m.id} className={`message-row ${m.role}`}>
          <div className="message-bubble">
            {m.role === 'assistant' ? (
              <Markdown content={m.content || (m.streaming ? '…' : '')} />
            ) : (
              <div className="user-text">{m.content}</div>
            )}
            {m.error && <div className="error-text">{m.error}</div>}
            {m.streaming && <span className="cursor" />}
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}
